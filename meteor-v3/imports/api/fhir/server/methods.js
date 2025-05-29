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
  async 'fhir.getPatientSummary'() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    const patient = await Patients.findOneAsync({ userId: this.userId });
    if (!patient) {
      throw new Meteor.Error('patient-not-found', 'Patient record not found');
    }

    const totalCommunications = await Communications.find({ userId: this.userId }).countAsync();
    const totalClinicalImpressions = await ClinicalImpressions.find({ userId: this.userId }).countAsync();
    const totalMedia = await Media.find({ userId: this.userId }).countAsync();

    // Get date range
    const firstCommunication = await Communications.findOneAsync(
      { userId: this.userId },
      { sort: { sent: 1 } }
    );
    const lastCommunication = await Communications.findOneAsync(
      { userId: this.userId },
      { sort: { sent: -1 } }
    );

    return {
      patient,
      summary: {
        totalCommunications,
        totalClinicalImpressions,
        totalMedia,
        dateRange: {
          start: get(firstCommunication, 'sent'),
          end: get(lastCommunication, 'sent')
        }
      }
    };
  },

  async 'fhir.getTimelineData'(startDate, endDate, limit = 100) {
    check(startDate, Match.Optional(Date));
    check(endDate, Match.Optional(Date));
    check(limit, Number);

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    const dateQuery = {};
    if (startDate || endDate) {
      if (startDate) dateQuery.$gte = startDate;
      if (endDate) dateQuery.$lte = endDate;
    }

    // Get communications
    const communicationsQuery = { userId: this.userId };
    if (Object.keys(dateQuery).length > 0) {
      communicationsQuery.sent = dateQuery;
    }

    const communications = await Communications.find(
      communicationsQuery,
      { 
        sort: { sent: -1 },
        limit: Math.min(limit, 200)
      }
    ).fetchAsync();

    // Get clinical impressions
    const clinicalQuery = { userId: this.userId };
    if (Object.keys(dateQuery).length > 0) {
      clinicalQuery.date = dateQuery;
    }

    const clinicalImpressions = await ClinicalImpressions.find(
      clinicalQuery,
      { 
        sort: { date: -1 },
        limit: Math.min(limit, 200)
      }
    ).fetchAsync();

    // Combine and sort by date
    const timeline = [];

    communications.forEach(function(comm) {
      timeline.push({
        ...comm,
        type: 'communication',
        sortDate: comm.sent
      });
    });

    clinicalImpressions.forEach(function(impression) {
      timeline.push({
        ...impression,
        type: 'clinical-impression',
        sortDate: impression.date
      });
    });

    // Sort by date descending
    timeline.sort(function(a, b) {
      return moment(b.sortDate).valueOf() - moment(a.sortDate).valueOf();
    });

    return timeline.slice(0, limit);
  },

  async 'fhir.getClinicalInsights'() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    const clinicalImpressions = await ClinicalImpressions.find(
      { userId: this.userId }
    ).fetchAsync();

    // Extract insights
    const insights = {
      totalFindings: 0,
      commonFindings: {},
      severityDistribution: {
        high: 0,
        medium: 0,
        low: 0,
        unknown: 0
      },
      temporalPatterns: {
        acute: 0,
        chronic: 0,
        recurring: 0
      },
      monthlyActivity: {}
    };

    clinicalImpressions.forEach(function(impression) {
      const findings = get(impression, 'finding', []);
      insights.totalFindings += findings.length;

      // Count common findings
      findings.forEach(function(finding) {
        const term = get(finding, 'item.text', 'unknown');
        if (!insights.commonFindings[term]) {
          insights.commonFindings[term] = 0;
        }
        insights.commonFindings[term]++;
      });

      // Monthly activity
      const month = moment(impression.date).format('YYYY-MM');
      if (!insights.monthlyActivity[month]) {
        insights.monthlyActivity[month] = 0;
      }
      insights.monthlyActivity[month]++;
    });

    // Convert commonFindings to sorted array
    insights.topFindings = Object.entries(insights.commonFindings)
      .sort(function(a, b) { return b[1] - a[1]; })
      .slice(0, 10)
      .map(function(entry) {
        return { term: entry[0], count: entry[1] };
      });

    return insights;
  },

  async 'fhir.exportBundle'(resourceTypes = []) {
    check(resourceTypes, [String]);

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    const bundle = {
      resourceType: 'Bundle',
      id: `export-${this.userId}-${Date.now()}`,
      type: 'collection',
      timestamp: new Date().toISOString(),
      entry: []
    };

    // Helper function to add resources to bundle
    const addToBundle = function(resources, resourceType) {
      resources.forEach(function(resource) {
        bundle.entry.push({
          fullUrl: `${resourceType}/${resource._id}`,
          resource: {
            ...resource,
            id: resource._id,
            resourceType: resourceType
          }
        });
      });
    };

    // Export requested resource types (or all if none specified)
    const exportAll = resourceTypes.length === 0;

    if (exportAll || resourceTypes.includes('Patient')) {
      const patients = await Patients.find({ userId: this.userId }).fetchAsync();
      addToBundle(patients, 'Patient');
    }

    if (exportAll || resourceTypes.includes('Communication')) {
      const communications = await Communications.find({ userId: this.userId }).fetchAsync();
      addToBundle(communications, 'Communication');
    }

    if (exportAll || resourceTypes.includes('ClinicalImpression')) {
      const impressions = await ClinicalImpressions.find({ userId: this.userId }).fetchAsync();
      addToBundle(impressions, 'ClinicalImpression');
    }

    if (exportAll || resourceTypes.includes('Media')) {
      const media = await Media.find({ userId: this.userId }).fetchAsync();
      addToBundle(media, 'Media');
    }

    if (exportAll || resourceTypes.includes('Person')) {
      const persons = await Persons.find({ userId: this.userId }).fetchAsync();
      addToBundle(persons, 'Person');
    }

    if (exportAll || resourceTypes.includes('CareTeam')) {
      const careTeams = await CareTeams.find({ userId: this.userId }).fetchAsync();
      addToBundle(careTeams, 'CareTeam');
    }

    bundle.total = bundle.entry.length;

    return bundle;
  },

  async 'fhir.validateResource'(resource, resourceType) {
    check(resource, Object);
    check(resourceType, String);

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    // Basic FHIR validation
    const errors = [];

    // Check required resourceType
    if (!resource.resourceType) {
      errors.push('Missing required field: resourceType');
    } else if (resource.resourceType !== resourceType) {
      errors.push(`Resource type mismatch: expected ${resourceType}, got ${resource.resourceType}`);
    }

    // Resource-specific validation
    switch (resourceType) {
      case 'Patient':
        if (!resource.name || !Array.isArray(resource.name) || resource.name.length === 0) {
          errors.push('Patient must have at least one name');
        }
        break;

      case 'Communication':
        if (!resource.status) {
          errors.push('Communication must have a status');
        }
        if (!resource.payload || !Array.isArray(resource.payload) || resource.payload.length === 0) {
          errors.push('Communication must have at least one payload');
        }
        break;

      case 'ClinicalImpression':
        if (!resource.status) {
          errors.push('ClinicalImpression must have a status');
        }
        if (!resource.subject) {
          errors.push('ClinicalImpression must have a subject');
        }
        break;
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
});