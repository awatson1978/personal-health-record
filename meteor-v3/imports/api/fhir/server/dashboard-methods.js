// meteor-v3/imports/api/fhir/server/dashboard-methods.js
import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { get } from 'lodash';
import moment from 'moment';

import { 
  Patients, 
  Communications, 
  ClinicalImpressions, 
  Media, 
  Persons,
  CareTeams,
  ImportJobs 
} from '../collections';

Meteor.methods({
  async 'dashboard.getStatistics'() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    try {
      console.log(`📊 Getting dashboard statistics for user ${this.userId}`);

      // Get server-side counts using countAsync
      const [
        totalCommunications,
        totalClinicalImpressions,
        totalMedia,
        totalPersons,
        totalCareTeams,
        totalPatients,
        completedImports,
        activeImports
      ] = await Promise.all([
        Communications.find({ userId: this.userId }).countAsync(),
        ClinicalImpressions.find({ userId: this.userId }).countAsync(),
        Media.find({ userId: this.userId }).countAsync(),
        Persons.find({ userId: this.userId }).countAsync(),
        CareTeams.find({ userId: this.userId }).countAsync(),
        Patients.find({ userId: this.userId }).countAsync(),
        ImportJobs.find({ userId: this.userId, status: 'completed' }).countAsync(),
        ImportJobs.find({ userId: this.userId, status: { $in: ['pending', 'processing'] } }).countAsync()
      ]);

      const statistics = {
        totalCommunications,     // From Facebook messages
        totalClinicalImpressions, // From Facebook posts
        totalMedia,              // From Facebook photos
        totalPersons,            // From Facebook friends
        totalCareTeams,
        totalPatients,
        completedImports,
        activeImports,
        lastUpdated: new Date()
      };

      console.log('✅ Dashboard statistics calculated:', statistics);
      return statistics;

    } catch (error) {
      console.error('❌ Error getting dashboard statistics:', error);
      throw new Meteor.Error('stats-failed', error.message);
    }
  },

  async 'dashboard.getRecentActivity'(limit = 20) {
    check(limit, Number);
    
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    try {
      console.log(`📊 Getting recent activity for user ${this.userId} (limit: ${limit})`);

      // Get recent items from server
      const [recentClinicalImpressions, recentCommunications] = await Promise.all([
        ClinicalImpressions.find(
          { userId: this.userId },
          { 
            sort: { date: -1 }, 
            limit: Math.min(limit, 50),
            fields: { 
              _id: 1, 
              description: 1, 
              date: 1, 
              'finding.item.text': 1,
              resourceType: 1
            }
          }
        ).fetchAsync(),
        Communications.find(
          { userId: this.userId },
          { 
            sort: { sent: -1 }, 
            limit: Math.min(limit, 50),
            fields: { 
              _id: 1, 
              'payload.contentString': 1, 
              sent: 1, 
              resourceType: 1,
              'category.text': 1
            }
          }
        ).fetchAsync()
      ]);

      // Combine and sort activities
      const activities = [];

      recentClinicalImpressions.forEach(function(impression) {
        activities.push({
          ...impression,
          type: 'clinical',
          sortDate: impression.date,
          displayDate: moment(impression.date).format('MMM DD, YYYY HH:mm'),
          relativeDate: moment(impression.date).fromNow(),
          content: get(impression, 'description', 'Clinical impression')
        });
      });

      recentCommunications.forEach(function(comm) {
        activities.push({
          ...comm,
          type: 'communication',
          sortDate: comm.sent,
          displayDate: moment(comm.sent).format('MMM DD, YYYY HH:mm'),
          relativeDate: moment(comm.sent).fromNow(),
          content: get(comm, 'payload.0.contentString', 'Communication')
        });
      });

      // Sort by date descending
      activities.sort(function(a, b) {
        return moment(b.sortDate).valueOf() - moment(a.sortDate).valueOf();
      });

      const limitedActivities = activities.slice(0, limit);

      console.log(`✅ Recent activity retrieved: ${limitedActivities.length} items`);
      return {
        activities: limitedActivities,
        totalAvailable: activities.length,
        lastUpdated: new Date()
      };

    } catch (error) {
      console.error('❌ Error getting recent activity:', error);
      throw new Meteor.Error('activity-failed', error.message);
    }
  },

  async 'dashboard.getHealthInsights'() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    try {
      console.log(`📊 Getting health insights for user ${this.userId}`);

      // Get clinical impressions for analysis
      const clinicalImpressions = await ClinicalImpressions.find(
        { userId: this.userId },
        { 
          fields: { 
            date: 1, 
            description: 1, 
            'finding.item.text': 1 
          }
        }
      ).fetchAsync();

      // Generate insights
      const insights = {
        totalClinicalRecords: clinicalImpressions.length,
        dateRange: {
          earliest: null,
          latest: null
        },
        monthlyActivity: {},
        commonTerms: {},
        weeklyActivity: [0, 0, 0, 0, 0, 0, 0], // Mon-Sun
        lastUpdated: new Date()
      };

      if (clinicalImpressions.length > 0) {
        // Calculate date range
        const dates = clinicalImpressions.map(function(impression) {
          return moment(impression.date);
        }).sort();
        
        insights.dateRange.earliest = dates[0].toDate();
        insights.dateRange.latest = dates[dates.length - 1].toDate();

        // Monthly activity
        clinicalImpressions.forEach(function(impression) {
          const month = moment(impression.date).format('YYYY-MM');
          insights.monthlyActivity[month] = (insights.monthlyActivity[month] || 0) + 1;

          // Weekly activity (day of week)
          const dayOfWeek = moment(impression.date).day(); // 0=Sunday
          const mondayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert to Monday=0
          insights.weeklyActivity[mondayIndex]++;
        });

        // Common terms from descriptions
        clinicalImpressions.forEach(function(impression) {
          const description = get(impression, 'description', '').toLowerCase();
          const words = description.split(/\s+/).filter(function(word) {
            return word.length > 3 && !['this', 'that', 'with', 'have', 'been', 'will', 'from', 'they', 'were'].includes(word);
          });
          
          words.forEach(function(word) {
            insights.commonTerms[word] = (insights.commonTerms[word] || 0) + 1;
          });
        });

        // Convert common terms to sorted array (top 10)
        insights.topTerms = Object.entries(insights.commonTerms)
          .sort(function(a, b) { return b[1] - a[1]; })
          .slice(0, 10)
          .map(function(entry) {
            return { term: entry[0], count: entry[1] };
          });
      }

      console.log('✅ Health insights calculated:', {
        totalRecords: insights.totalClinicalRecords,
        dateRange: insights.dateRange,
        topTermsCount: insights.topTerms?.length || 0
      });

      return insights;

    } catch (error) {
      console.error('❌ Error getting health insights:', error);
      throw new Meteor.Error('insights-failed', error.message);
    }
  },

  async 'dashboard.getDataSummary'() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    try {
      console.log(`📊 Getting data summary for user ${this.userId}`);

      // Get comprehensive data summary
      const [
        firstCommunication,
        lastCommunication,
        firstClinicalImpression,
        lastClinicalImpression,
        totalMediaSize,
        successfulImports,
        failedImports
      ] = await Promise.all([
        Communications.findOneAsync(
          { userId: this.userId },
          { sort: { sent: 1 }, fields: { sent: 1 } }
        ),
        Communications.findOneAsync(
          { userId: this.userId },
          { sort: { sent: -1 }, fields: { sent: 1 } }
        ),
        ClinicalImpressions.findOneAsync(
          { userId: this.userId },
          { sort: { date: 1 }, fields: { date: 1 } }
        ),
        ClinicalImpressions.findOneAsync(
          { userId: this.userId },
          { sort: { date: -1 }, fields: { date: 1 } }
        ),
        Media.find({ userId: this.userId }, { fields: { 'content.size': 1 } }).fetchAsync(),
        ImportJobs.find({ userId: this.userId, status: 'completed' }).countAsync(),
        ImportJobs.find({ userId: this.userId, status: 'failed' }).countAsync()
      ]);

      // Calculate total media size
      let totalSize = 0;
      totalMediaSize.forEach(function(media) {
        const size = get(media, 'content.size', 0);
        if (typeof size === 'number') {
          totalSize += size;
        }
      });

      const summary = {
        dataRange: {
          communications: {
            earliest: get(firstCommunication, 'sent'),
            latest: get(lastCommunication, 'sent')
          },
          clinicalImpressions: {
            earliest: get(firstClinicalImpression, 'date'),
            latest: get(lastClinicalImpression, 'date')
          }
        },
        totalMediaSize: totalSize,
        totalMediaSizeFormatted: formatBytes(totalSize),
        importStats: {
          successful: successfulImports,
          failed: failedImports,
          total: successfulImports + failedImports
        },
        lastUpdated: new Date()
      };

      console.log('✅ Data summary calculated:', summary);
      return summary;

    } catch (error) {
      console.error('❌ Error getting data summary:', error);
      throw new Meteor.Error('summary-failed', error.message);
    }
  }
});

// Helper function to format bytes
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}