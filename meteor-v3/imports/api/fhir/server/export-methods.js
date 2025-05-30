// meteor-v3/imports/api/fhir/server/export-methods.js
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
  async 'export.generatePreview'(options = {}) {
    check(options, {
      filters: Match.Optional({
        dateRange: Match.Optional({
          start: Match.Optional(Match.OneOf(Date, null)),
          end: Match.Optional(Match.OneOf(Date, null))
        }),
        resourceType: Match.Optional(String),
        searchQuery: Match.Optional(String),
        sortBy: Match.Optional(String),
        sortOrder: Match.Optional(String)
      }),
      format: Match.Optional(String),
      includeMetadata: Match.Optional(Boolean),
      resourceTypes: Match.Optional([String])
    });

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    try {
      const filters = get(options, 'filters', {});
      const format = get(options, 'format', 'bundle');
      const includeMetadata = get(options, 'includeMetadata', true);
      const resourceTypes = get(options, 'resourceTypes', ['all']);

      console.log(`📊 Generating export preview for user ${this.userId}:`, { filters, format, resourceTypes });

      // Get the full timeline data (limited preview)
      const timelineResult = await Meteor.call('timeline.getData', {
        page: 1,
        limit: 100, // Preview limit
        filters: filters
      });

      // Filter by resource types if specified
      let filteredItems = timelineResult.items;
      if (!resourceTypes.includes('all')) {
        filteredItems = timelineResult.items.filter(function(item) {
          return resourceTypes.includes(item.resourceType);
        });
      }

      // Generate export data based on format
      let exportData;
      
      if (format === 'ndjson') {
        exportData = await generateNDJSONPreview(filteredItems, includeMetadata);
      } else if (format === 'individual') {
        exportData = await generateIndividualResourcesPreview(filteredItems, includeMetadata);
      } else {
        // Default: FHIR Bundle format
        exportData = await generateBundlePreview(filteredItems, includeMetadata, this.userId);
      }

      // Add summary information
      const summary = {
        totalResources: filteredItems.length,
        resourceCounts: {},
        generatedAt: new Date(),
        format: format,
        preview: true,
        previewLimit: 100,
        actualTotal: timelineResult.totalCount
      };

      // Count resources by type
      filteredItems.forEach(function(item) {
        const type = item.resourceType;
        summary.resourceCounts[type] = (summary.resourceCounts[type] || 0) + 1;
      });

      const result = {
        ...exportData,
        summary: summary
      };

      console.log(`✅ Export preview generated: ${filteredItems.length} resources`);
      return result;

    } catch (error) {
      console.error('❌ Error generating export preview:', error);
      throw new Meteor.Error('export-preview-failed', error.message);
    }
  },

  async 'export.downloadData'(options = {}) {
    check(options, {
      filters: Match.Optional({
        dateRange: Match.Optional({
          start: Match.Optional(Match.OneOf(Date, null)),
          end: Match.Optional(Match.OneOf(Date, null))
        }),
        resourceType: Match.Optional(String),
        searchQuery: Match.Optional(String),
        sortBy: Match.Optional(String),
        sortOrder: Match.Optional(String)
      }),
      format: Match.Optional(String),
      prettyPrint: Match.Optional(Boolean),
      includeMetadata: Match.Optional(Boolean),
      resourceTypes: Match.Optional([String])
    });

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    try {
      const filters = get(options, 'filters', {});
      const format = get(options, 'format', 'bundle');
      const prettyPrint = get(options, 'prettyPrint', true);
      const includeMetadata = get(options, 'includeMetadata', true);
      const resourceTypes = get(options, 'resourceTypes', ['all']);

      console.log(`📥 Generating full export for user ${this.userId}:`, { filters, format, resourceTypes });

      // Get ALL timeline data (no limit for download)
      const timelineResult = await Meteor.call('timeline.getData', {
        page: 1,
        limit: 10000, // Large limit for full export
        filters: filters
      });

      // Filter by resource types if specified
      let filteredItems = timelineResult.items;
      if (!resourceTypes.includes('all')) {
        filteredItems = timelineResult.items.filter(function(item) {
          return resourceTypes.includes(item.resourceType);
        });
      }

      // Generate export data based on format
      let exportData;
      
      if (format === 'ndjson') {
        exportData = await generateNDJSONExport(filteredItems, includeMetadata);
      } else if (format === 'individual') {
        exportData = await generateIndividualResourcesExport(filteredItems, includeMetadata);
      } else {
        // Default: FHIR Bundle format
        exportData = await generateBundleExport(filteredItems, includeMetadata, this.userId);
      }

      console.log(`✅ Full export generated: ${filteredItems.length} resources`);
      return exportData;

    } catch (error) {
      console.error('❌ Error generating export download:', error);
      throw new Meteor.Error('export-download-failed', error.message);
    }
  },

  async 'export.getAvailableFormats'() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    return {
      formats: [
        {
          id: 'bundle',
          name: 'FHIR Bundle',
          description: 'Standard FHIR Bundle containing all resources',
          fileExtension: 'json',
          mimeType: 'application/fhir+json'
        },
        {
          id: 'ndjson',
          name: 'NDJSON',
          description: 'Newline Delimited JSON - one resource per line',
          fileExtension: 'ndjson',
          mimeType: 'application/x-ndjson'
        },
        {
          id: 'individual',
          name: 'Individual Resources',
          description: 'Separate JSON object for each resource type',
          fileExtension: 'json',
          mimeType: 'application/json'
        }
      ],
      resourceTypes: [
        { id: 'Patient', name: 'Patients', description: 'Patient demographic information' },
        { id: 'Communication', name: 'Communications', description: 'Messages and conversations' },
        { id: 'ClinicalImpression', name: 'Clinical Impressions', description: 'Health-related observations' },
        { id: 'Media', name: 'Media', description: 'Photos and videos' },
        { id: 'Person', name: 'Persons', description: 'Friends and contacts' },
        { id: 'CareTeam', name: 'Care Teams', description: 'Support networks' }
      ]
    };
  }
});

// Helper functions for different export formats

async function generateBundlePreview(items, includeMetadata, userId) {
  const bundle = {
    resourceType: 'Bundle',
    id: `preview-bundle-${Date.now()}`,
    type: 'collection',
    timestamp: new Date().toISOString(),
    total: items.length,
    entry: []
  };

  if (includeMetadata) {
    bundle.meta = {
      lastUpdated: new Date().toISOString(),
      source: 'Facebook FHIR Timeline - Preview',
      versionId: '1',
      security: [{
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActReason',
        code: 'HTEST',
        display: 'test health data'
      }]
    };
  }

  // Add resources to bundle
  items.forEach(function(item) {
    const resource = cleanResourceForExport(item, includeMetadata);
    
    bundle.entry.push({
      fullUrl: `${item.resourceType}/${item._id}`,
      resource: resource
    });
  });

  return { bundle };
}

async function generateBundleExport(items, includeMetadata, userId) {
  // Same as preview but without preview limitations
  return generateBundlePreview(items, includeMetadata, userId);
}

async function generateNDJSONPreview(items, includeMetadata) {
  const resources = items.map(function(item) {
    return cleanResourceForExport(item, includeMetadata);
  });

  return {
    format: 'ndjson',
    resources: resources,
    metadata: includeMetadata ? {
      exportedAt: new Date().toISOString(),
      source: 'Facebook FHIR Timeline - Preview',
      resourceCount: resources.length
    } : null
  };
}

async function generateNDJSONExport(items, includeMetadata) {
  return generateNDJSONPreview(items, includeMetadata);
}

async function generateIndividualResourcesPreview(items, includeMetadata) {
  const resourcesByType = {};
  
  items.forEach(function(item) {
    const type = item.resourceType;
    if (!resourcesByType[type]) {
      resourcesByType[type] = [];
    }
    
    resourcesByType[type].push(cleanResourceForExport(item, includeMetadata));
  });

  const result = {
    format: 'individual',
    resources: resourcesByType
  };

  if (includeMetadata) {
    result.metadata = {
      exportedAt: new Date().toISOString(),
      source: 'Facebook FHIR Timeline - Preview',
      resourceTypes: Object.keys(resourcesByType),
      totalResources: items.length
    };
  }

  return result;
}

async function generateIndividualResourcesExport(items, includeMetadata) {
  return generateIndividualResourcesPreview(items, includeMetadata);
}

// Helper function to clean and prepare a resource for export
function cleanResourceForExport(resource, includeMetadata = true) {
  // Create a copy and remove internal MongoDB fields
  const cleaned = { ...resource };
  
  // Remove internal fields
  delete cleaned._id;
  delete cleaned.userId;
  delete cleaned.createdAt;
  delete cleaned.updatedAt;
  delete cleaned.sortDate;
  delete cleaned.searchableContent;
  
  // Add FHIR id field
  cleaned.id = resource._id;
  
  // Ensure resourceType is present
  if (!cleaned.resourceType) {
    console.warn('Resource missing resourceType:', resource);
    cleaned.resourceType = 'Unknown';
  }

  // Add or update meta information
  if (includeMetadata) {
    cleaned.meta = {
      lastUpdated: resource.updatedAt?.toISOString() || resource.createdAt?.toISOString() || new Date().toISOString(),
      source: 'Facebook FHIR Timeline',
      versionId: '1',
      ...get(cleaned, 'meta', {})
    };
  } else {
    delete cleaned.meta;
  }

  return cleaned;
}