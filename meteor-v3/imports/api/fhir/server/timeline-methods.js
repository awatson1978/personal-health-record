// meteor-v3/imports/api/fhir/server/timeline-methods.js
import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import { get } from 'lodash';
import moment from 'moment';

import { 
  Patients, 
  Communications, 
  ClinicalImpressions, 
  Media, 
  Persons,
  CareTeams 
} from '../collections';

Meteor.methods({
  async 'timeline.getData'(options = {}) {
    check(options, {
      page: Match.Optional(Number),
      limit: Match.Optional(Number),
      filters: Match.Optional({
        dateRange: Match.Optional({
          start: Match.Optional(Match.OneOf(Date, null)),
          end: Match.Optional(Match.OneOf(Date, null))
        }),
        resourceType: Match.Optional(String),
        searchQuery: Match.Optional(String),
        sortBy: Match.Optional(String),
        sortOrder: Match.Optional(String)
      })
    });

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    try {
      const page = get(options, 'page', 1);
      const limit = Math.min(get(options, 'limit', 25), 10000); // FIXED: Cap at 10000 instead of 100
      const filters = get(options, 'filters', {});
      const skip = (page - 1) * limit;

      console.log(`📊 Getting timeline data for user ${this.userId}:`, { page, limit, filters });

      // Build aggregation pipeline
      let pipeline = [];
      const timelineItems = [];

      // Determine which collections to query
      const resourceTypes = get(filters, 'resourceType', 'all');
      const searchQuery = get(filters, 'searchQuery', '').trim();
      const dateRange = get(filters, 'dateRange', {});
      const sortBy = get(filters, 'sortBy', 'date');
      const sortOrder = get(filters, 'sortOrder', 'desc') === 'desc' ? -1 : 1;

      // Helper function to build date filter
      const buildDateFilter = function(dateField) {
        const dateFilter = {};
        if (dateRange.start) {
          dateFilter.$gte = dateRange.start;
        }
        if (dateRange.end) {
          dateFilter.$lte = dateRange.end;
        }
        return Object.keys(dateFilter).length > 0 ? { [dateField]: dateFilter } : {};
      };

      // Helper function to build search filter
      const buildSearchFilter = function(fields) {
        if (!searchQuery) return {};
        
        const searchRegex = new RegExp(searchQuery, 'i');
        const orConditions = fields.map(function(field) {
          return { [field]: searchRegex };
        });
        
        return orConditions.length > 0 ? { $or: orConditions } : {};
      };

      // Query ClinicalImpressions (from Facebook posts)
      if (resourceTypes === 'all' || resourceTypes === 'clinical') {
        const clinicalQuery = {
          userId: this.userId,
          ...buildDateFilter('date'),
          ...buildSearchFilter(['description'])
        };

        const clinicalImpressions = await ClinicalImpressions.find(
          clinicalQuery,
          { 
            fields: { 
              _id: 1, 
              resourceType: 1, 
              description: 1, 
              date: 1, 
              status: 1,
              'finding.item.text': 1,
              createdAt: 1 
            }
          }
        ).fetchAsync();

        clinicalImpressions.forEach(function(item) {
          timelineItems.push({
            ...item,
            sortDate: item.date,
            searchableContent: get(item, 'description', '')
          });
        });
      }

      // Query Communications (from Facebook messages)
      if (resourceTypes === 'all' || resourceTypes === 'communication') {
        const commQuery = {
          userId: this.userId,
          ...buildDateFilter('sent'),
          ...buildSearchFilter(['payload.contentString'])
        };

        const communications = await Communications.find(
          commQuery,
          { 
            fields: { 
              _id: 1, 
              resourceType: 1, 
              payload: 1, 
              sent: 1, 
              status: 1,
              category: 1,
              createdAt: 1 
            }
          }
        ).fetchAsync();

        communications.forEach(function(item) {
          timelineItems.push({
            ...item,
            sortDate: item.sent,
            searchableContent: get(item, 'payload.0.contentString', '')
          });
        });
      }

      // Query Media (from Facebook photos)
      if (resourceTypes === 'all' || resourceTypes === 'media') {
        const mediaQuery = {
          userId: this.userId,
          ...buildDateFilter('createdDateTime'),
          ...buildSearchFilter(['content.title'])
        };

        const media = await Media.find(
          mediaQuery,
          { 
            fields: { 
              _id: 1, 
              resourceType: 1, 
              content: 1, 
              type: 1,
              createdDateTime: 1, 
              status: 1,
              createdAt: 1 
            }
          }
        ).fetchAsync();

        media.forEach(function(item) {
          timelineItems.push({
            ...item,
            sortDate: item.createdDateTime,
            searchableContent: get(item, 'content.title', '')
          });
        });
      }

      // Query Persons (from Facebook friends)
      if (resourceTypes === 'all' || resourceTypes === 'person') {
        const personsQuery = {
          userId: this.userId,
          ...buildDateFilter('createdAt'),
          ...buildSearchFilter(['name.text'])
        };

        const persons = await Persons.find(
          personsQuery,
          { 
            fields: { 
              _id: 1, 
              resourceType: 1, 
              name: 1, 
              active: 1,
              createdAt: 1 
            }
          }
        ).fetchAsync();

        persons.forEach(function(item) {
          timelineItems.push({
            ...item,
            sortDate: item.createdAt,
            searchableContent: get(item, 'name.0.text', '')
          });
        });
      }

      // Apply client-side search filter if needed
      let filteredItems = timelineItems;
      if (searchQuery) {
        filteredItems = timelineItems.filter(function(item) {
          return item.searchableContent.toLowerCase().includes(searchQuery.toLowerCase());
        });
      }

      // Sort items
      filteredItems.sort(function(a, b) {
        if (sortBy === 'type') {
          const typeComparison = a.resourceType.localeCompare(b.resourceType);
          if (typeComparison !== 0) {
            return typeComparison * sortOrder;
          }
          // Secondary sort by date
          return (moment(b.sortDate).valueOf() - moment(a.sortDate).valueOf()) * sortOrder;
        } else {
          // Sort by date
          return (moment(b.sortDate).valueOf() - moment(a.sortDate).valueOf()) * sortOrder;
        }
      });

      // Paginate
      const totalCount = filteredItems.length;
      const paginatedItems = filteredItems.slice(skip, skip + limit);

      // Clean up items (remove search helper fields)
      const cleanedItems = paginatedItems.map(function(item) {
        const { searchableContent, ...cleanItem } = item;
        return cleanItem;
      });

      console.log(`✅ Timeline data retrieved: ${cleanedItems.length} items (page ${page}/${Math.ceil(totalCount / limit)}), total available: ${totalCount}`);

      return {
        items: cleanedItems,
        totalCount: totalCount,
        page: page,
        limit: limit,
        totalPages: Math.ceil(totalCount / limit),
        filters: filters
      };

    } catch (error) {
      console.error('❌ Error getting timeline data:', error);
      throw new Meteor.Error('timeline-failed', error.message);
    }
  },

  async 'timeline.exportData'(filters = {}) {
    check(filters, {
      dateRange: Match.Optional({
        start: Match.Optional(Match.OneOf(Date, null)),
        end: Match.Optional(Match.OneOf(Date, null))
      }),
      resourceType: Match.Optional(String),
      searchQuery: Match.Optional(String),
      sortBy: Match.Optional(String),
      sortOrder: Match.Optional(String)
    });

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    try {
      console.log(`📊 Exporting timeline data for user ${this.userId}:`, filters);

      // Get all timeline data (no pagination for export)
      const result = await Meteor.call('timeline.getData', {
        page: 1,
        limit: 10000, // Large limit for export
        filters: filters
      });

      // Create export bundle
      const exportData = {
        metadata: {
          exportDate: new Date(),
          userId: this.userId,
          totalItems: result.totalCount,
          filters: filters,
          fhirVersion: '4.0.1',
          source: 'Facebook FHIR Timeline'
        },
        bundle: {
          resourceType: 'Bundle',
          id: `timeline-export-${Date.now()}`,
          type: 'collection',
          timestamp: new Date().toISOString(),
          total: result.totalCount,
          entry: result.items.map(function(item) {
            return {
              fullUrl: `${item.resourceType}/${item._id}`,
              resource: {
                ...item,
                id: item._id
              }
            };
          })
        }
      };

      console.log(`✅ Timeline export prepared: ${result.totalCount} items`);
      return exportData;

    } catch (error) {
      console.error('❌ Error exporting timeline data:', error);
      throw new Meteor.Error('export-failed', error.message);
    }
  },

  async 'timeline.getDateRange'() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    try {
      console.log(`📊 Getting date range for user ${this.userId}`);

      // Get earliest and latest dates across all resources
      const [
        firstCommunication,
        lastCommunication,
        firstClinicalImpression,
        lastClinicalImpression,
        firstMedia,
        lastMedia,
        firstPerson,
        lastPerson
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
        Media.findOneAsync(
          { userId: this.userId },
          { sort: { createdDateTime: 1 }, fields: { createdDateTime: 1 } }
        ),
        Media.findOneAsync(
          { userId: this.userId },
          { sort: { createdDateTime: -1 }, fields: { createdDateTime: 1 } }
        ),
        Persons.findOneAsync(
          { userId: this.userId },
          { sort: { createdAt: 1 }, fields: { createdAt: 1 } }
        ),
        Persons.findOneAsync(
          { userId: this.userId },
          { sort: { createdAt: -1 }, fields: { createdAt: 1 } }
        )
      ]);

      // Collect all dates
      const allDates = [];
      
      if (firstCommunication) allDates.push(firstCommunication.sent);
      if (lastCommunication) allDates.push(lastCommunication.sent);
      if (firstClinicalImpression) allDates.push(firstClinicalImpression.date);
      if (lastClinicalImpression) allDates.push(lastClinicalImpression.date);
      if (firstMedia) allDates.push(firstMedia.createdDateTime);
      if (lastMedia) allDates.push(lastMedia.createdDateTime);
      if (firstPerson) allDates.push(firstPerson.createdAt);
      if (lastPerson) allDates.push(lastPerson.createdAt);

      if (allDates.length === 0) {
        return {
          earliest: null,
          latest: null,
          totalDays: 0
        };
      }

      // Sort dates to find range
      allDates.sort(function(a, b) {
        return moment(a).valueOf() - moment(b).valueOf();
      });

      const earliest = allDates[0];
      const latest = allDates[allDates.length - 1];
      const totalDays = moment(latest).diff(moment(earliest), 'days');

      const dateRange = {
        earliest: earliest,
        latest: latest,
        totalDays: totalDays,
        formattedRange: `${moment(earliest).format('MMM DD, YYYY')} - ${moment(latest).format('MMM DD, YYYY')}`
      };

      console.log('✅ Date range calculated:', dateRange);
      return dateRange;

    } catch (error) {
      console.error('❌ Error getting date range:', error);
      throw new Meteor.Error('daterange-failed', error.message);
    }
  },

  async 'timeline.getResourceCounts'() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    try {
      console.log(`📊 Getting resource counts for user ${this.userId}`);

      // Get counts for each resource type
      const [
        communicationsCount,
        clinicalImpressionsCount,
        mediaCount,
        personsCount,
        careTeamsCount,
        patientsCount
      ] = await Promise.all([
        Communications.find({ userId: this.userId }).countAsync(),
        ClinicalImpressions.find({ userId: this.userId }).countAsync(),
        Media.find({ userId: this.userId }).countAsync(),
        Persons.find({ userId: this.userId }).countAsync(),
        CareTeams.find({ userId: this.userId }).countAsync(),
        Patients.find({ userId: this.userId }).countAsync()
      ]);

      const counts = {
        communications: communicationsCount,
        clinicalImpressions: clinicalImpressionsCount,
        media: mediaCount,
        persons: personsCount,
        careTeams: careTeamsCount,
        patients: patientsCount,
        total: communicationsCount + clinicalImpressionsCount + mediaCount + personsCount,
        lastUpdated: new Date()
      };

      console.log('✅ Resource counts calculated:', counts);
      return counts;

    } catch (error) {
      console.error('❌ Error getting resource counts:', error);
      throw new Meteor.Error('counts-failed', error.message);
    }
  },

  async 'timeline.getActivityByMonth'(resourceType = 'all') {
    check(resourceType, String);

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    try {
      console.log(`📊 Getting monthly activity for user ${this.userId}, type: ${resourceType}`);

      const monthlyActivity = {};

      // Helper function to process items and group by month
      const processItemsByMonth = function(items, dateField) {
        items.forEach(function(item) {
          const date = get(item, dateField);
          if (date) {
            const month = moment(date).format('YYYY-MM');
            monthlyActivity[month] = (monthlyActivity[month] || 0) + 1;
          }
        });
      };

      // Query different resource types based on filter
      if (resourceType === 'all' || resourceType === 'clinical') {
        const clinicalImpressions = await ClinicalImpressions.find(
          { userId: this.userId },
          { fields: { date: 1 } }
        ).fetchAsync();
        processItemsByMonth(clinicalImpressions, 'date');
      }

      if (resourceType === 'all' || resourceType === 'communication') {
        const communications = await Communications.find(
          { userId: this.userId },
          { fields: { sent: 1 } }
        ).fetchAsync();
        processItemsByMonth(communications, 'sent');
      }

      if (resourceType === 'all' || resourceType === 'media') {
        const media = await Media.find(
          { userId: this.userId },
          { fields: { createdDateTime: 1 } }
        ).fetchAsync();
        processItemsByMonth(media, 'createdDateTime');
      }

      if (resourceType === 'all' || resourceType === 'person') {
        const persons = await Persons.find(
          { userId: this.userId },
          { fields: { createdAt: 1 } }
        ).fetchAsync();
        processItemsByMonth(persons, 'createdAt');
      }

      // Convert to array format for charting
      const activityArray = Object.entries(monthlyActivity)
        .map(function([month, count]) {
          return {
            month: month,
            count: count,
            formattedMonth: moment(month).format('MMM YYYY')
          };
        })
        .sort(function(a, b) {
          return moment(a.month).valueOf() - moment(b.month).valueOf();
        });

      console.log(`✅ Monthly activity calculated: ${activityArray.length} months`);

      return {
        resourceType: resourceType,
        monthlyActivity: monthlyActivity,
        activityArray: activityArray,
        totalMonths: activityArray.length,
        lastUpdated: new Date()
      };

    } catch (error) {
      console.error('❌ Error getting monthly activity:', error);
      throw new Meteor.Error('activity-failed', error.message);
    }
  }
});