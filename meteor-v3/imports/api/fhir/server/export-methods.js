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
      resourceTypes: Match.Optional([String]),
      previewLimit: Match.Optional(Number)
    });

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    try {
      const filters = get(options, 'filters', {});
      const format = get(options, 'format', 'bundle');
      const includeMetadata = get(options, 'includeMetadata', true);
      const resourceTypes = get(options, 'resourceTypes', ['all']);
      const previewLimit = get(options, 'previewLimit', 1000);
      
      console.log(`📊 Generating export preview for user ${this.userId}:`, { 
        filters, 
        format, 
        resourceTypes, 
        previewLimit
      });

      // FIXED: Use the preview limit directly - no server-side capping
      const timelineResult = await Meteor.call('timeline.getData', {
        page: 1,
        limit: previewLimit, // Use exactly what was requested
        filters: filters
      });

      console.log(`📊 SERVER: timeline.getData returned:`, {
        itemsLength: timelineResult.items?.length || 0,
        totalCount: timelineResult.totalCount,
        requestedLimit: previewLimit,
        debug: timelineResult.debug
      });

      // Filter by resource types if specified
      let filteredItems = timelineResult.items;
      if (!resourceTypes.includes('all')) {
        const originalLength = filteredItems.length;
        filteredItems = timelineResult.items.filter(function(item) {
          return resourceTypes.includes(item.resourceType);
        });
        console.log(`📊 SERVER: Resource type filtering: ${originalLength} → ${filteredItems.length} items`);
      }

      console.log(`📊 SERVER: Final items for preview generation: ${filteredItems.length}`);

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
        totalAvailableInDb: timelineResult.totalCount,
        resourceCounts: {},
        generatedAt: new Date(),
        format: format,
        preview: true,
        requestedLimit: previewLimit,
        actualReturned: filteredItems.length,
        timelineDebug: timelineResult.debug,
        // Performance info
        performanceInfo: {
          isLargeDataset: filteredItems.length > 10000,
          databaseTotal: timelineResult.totalCount,
          previewComplete: filteredItems.length === timelineResult.totalCount,
          limitApplied: filteredItems.length < timelineResult.totalCount
        }
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

      console.log(`✅ Export preview generated: ${filteredItems.length} resources (DB total: ${timelineResult.totalCount})`);
      
      // Log if we're showing less than what's available
      if (filteredItems.length < timelineResult.totalCount) {
        console.log(`⚠️ Preview limited: showing ${filteredItems.length} of ${timelineResult.totalCount} total records`);
      }
      
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

      // FIXED: Use an effectively unlimited number to get everything
      const timelineResult = await Meteor.call('timeline.getData', {
        page: 1,
        limit: 99999999, // Effectively unlimited for downloads
        filters: filters
      });

      console.log(`📥 Download: timeline.getData returned ${timelineResult.items?.length || 0} items out of ${timelineResult.totalCount} total`);

      // Filter by resource types if specified
      let filteredItems = timelineResult.items;
      if (!resourceTypes.includes('all')) {
        const originalLength = filteredItems.length;
        filteredItems = timelineResult.items.filter(function(item) {
          return resourceTypes.includes(item.resourceType);
        });
        console.log(`📥 Resource type filtering: ${originalLength} → ${filteredItems.length} items`);
      }

      console.log(`📥 Final filtered items for download: ${filteredItems.length}`);

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

      // Add download metadata
      if (exportData.summary) {
        exportData.summary.downloadInfo = {
          totalRequested: timelineResult.totalCount,
          totalReturned: filteredItems.length,
          downloadComplete: filteredItems.length === timelineResult.totalCount
        };
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
      ],
      // FIXED: Reflect the reality - no artificial limits
      limits: {
        previewMaxClient: 10000000, // 10M client-side display limit (very high)
        previewMaxServer: 10000000,  // 10M server-side processing limit (very high)
        downloadMax: 10000000,      // 10M download limit (very high)
        recommendedPreview: 10000   // Recommended preview size for performance
      }
    };
  },

  async 'export.getPerformanceRecommendations'(estimatedResourceCount) {
    check(estimatedResourceCount, Number);

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    const recommendations = {
      estimatedResourceCount: estimatedResourceCount,
      recommendations: [],
      optimalPreviewSize: null,
      warningLevel: 'none' // none, low, medium, high, critical
    };

    if (estimatedResourceCount <= 1000) {
      recommendations.optimalPreviewSize = estimatedResourceCount;
      recommendations.recommendations.push('Full dataset preview recommended - small dataset size');
    } else if (estimatedResourceCount <= 10000) {
      recommendations.optimalPreviewSize = estimatedResourceCount;
      recommendations.warningLevel = 'low';
      recommendations.recommendations.push('Dataset size is reasonable for full preview');
    } else if (estimatedResourceCount <= 100000) {
      recommendations.optimalPreviewSize = estimatedResourceCount; // Show all
      recommendations.warningLevel = 'medium';
      recommendations.recommendations.push('Large dataset - full preview may take some time to render');
      recommendations.recommendations.push('Consider using NDJSON format for better performance');
    } else {
      recommendations.optimalPreviewSize = 100000;
      recommendations.warningLevel = 'high';
      recommendations.recommendations.push('Very large dataset - consider limiting preview to 100,000 records');
      recommendations.recommendations.push('Use NDJSON format for better performance');
      recommendations.recommendations.push('Download will include all data regardless of preview limit');
    }

    return recommendations;
  }
});

// Helper functions for different export formats

async function generateBundlePreview(items, includeMetadata, userId) {
  console.log(`📊 generateBundlePreview: Starting with ${items.length} items`);
  
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

  // Add performance monitoring for large datasets
  if (items.length > 10000) {
    console.log(`⚠️ Processing large bundle with ${items.length} items - this may take some time`);
  }

  // FIXED: Process ALL items without any hidden limits
  items.forEach(function(item, index) {
    const resource = cleanResourceForExport(item, includeMetadata);
    
    bundle.entry.push({
      fullUrl: `${item.resourceType}/${item._id}`,
      resource: resource
    });

    // Log progress for very large datasets
    if (items.length > 50000 && index > 0 && index % 10000 === 0) {
      console.log(`📊 Bundle progress: ${index}/${items.length} resources processed (${((index/items.length)*100).toFixed(1)}%)`);
    }
  });

  console.log(`📊 generateBundlePreview: Completed with ${bundle.entry.length} entries`);
  
  if (items.length > 10000) {
    console.log(`✅ Completed bundle generation with ${bundle.entry.length} items`);
  }

  return { bundle };
}

async function generateBundleExport(items, includeMetadata, userId) {
  console.log(`📥 generateBundleExport: Starting with ${items.length} items`);
  
  // Same as preview but with download-specific metadata
  const result = await generateBundlePreview(items, includeMetadata, userId);
  
  if (result.bundle.meta) {
    result.bundle.meta.source = 'Facebook FHIR Timeline - Download';
  }
  
  console.log(`📥 generateBundleExport: Completed with ${result.bundle.entry.length} entries`);
  return result;
}

async function generateNDJSONPreview(items, includeMetadata) {
  console.log(`📊 generateNDJSONPreview: Starting with ${items.length} items`);
  
  // Add performance monitoring for large datasets
  if (items.length > 10000) {
    console.log(`⚠️ Processing large NDJSON with ${items.length} items - this may take some time`);
  }

  const resources = [];
  
  // FIXED: Process ALL items without any hidden limits
  items.forEach(function(item, index) {
    resources.push(cleanResourceForExport(item, includeMetadata));
    
    // Log progress for very large datasets
    if (items.length > 50000 && index > 0 && index % 10000 === 0) {
      console.log(`📊 NDJSON progress: ${index}/${items.length} resources processed (${((index/items.length)*100).toFixed(1)}%)`);
    }
  });

  console.log(`📊 generateNDJSONPreview: Completed with ${resources.length} resources`);

  if (items.length > 10000) {
    console.log(`✅ Completed NDJSON generation with ${resources.length} items`);
  }

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
  console.log(`📥 generateNDJSONExport: Starting with ${items.length} items`);
  
  const result = await generateNDJSONPreview(items, includeMetadata);
  
  if (result.metadata) {
    result.metadata.source = 'Facebook FHIR Timeline - Download';
  }
  
  console.log(`📥 generateNDJSONExport: Completed with ${result.resources.length} resources`);
  return result;
}

async function generateIndividualResourcesPreview(items, includeMetadata) {
  console.log(`📊 generateIndividualResourcesPreview: Starting with ${items.length} items`);
  
  // Add performance monitoring for large datasets
  if (items.length > 10000) {
    console.log(`⚠️ Processing large individual resources with ${items.length} items - this may take some time`);
  }

  const resourcesByType = {};
  
  // FIXED: Process ALL items without any hidden limits
  items.forEach(function(item, index) {
    const type = item.resourceType;
    if (!resourcesByType[type]) {
      resourcesByType[type] = [];
    }
    
    resourcesByType[type].push(cleanResourceForExport(item, includeMetadata));
    
    // Log progress for very large datasets
    if (items.length > 50000 && index > 0 && index % 10000 === 0) {
      console.log(`📊 Individual resources progress: ${index}/${items.length} resources processed (${((index/items.length)*100).toFixed(1)}%)`);
    }
  });

  // Count total processed
  const totalProcessed = Object.values(resourcesByType).reduce(function(sum, arr) {
    return sum + arr.length;
  }, 0);

  console.log(`📊 generateIndividualResourcesPreview: Completed with ${totalProcessed} resources across ${Object.keys(resourcesByType).length} types`);

  if (items.length > 10000) {
    console.log(`✅ Completed individual resources generation with ${totalProcessed} items across ${Object.keys(resourcesByType).length} resource types`);
  }

  const result = {
    format: 'individual',
    resources: resourcesByType
  };

  if (includeMetadata) {
    result.metadata = {
      exportedAt: new Date().toISOString(),
      source: 'Facebook FHIR Timeline - Preview',
      resourceTypes: Object.keys(resourcesByType),
      totalResources: totalProcessed,
      resourceTypeBreakdown: {}
    };

    // Add count by resource type
    Object.keys(resourcesByType).forEach(function(type) {
      result.metadata.resourceTypeBreakdown[type] = resourcesByType[type].length;
    });
  }

  return result;
}

async function generateIndividualResourcesExport(items, includeMetadata) {
  console.log(`📥 generateIndividualResourcesExport: Starting with ${items.length} items`);
  
  const result = await generateIndividualResourcesPreview(items, includeMetadata);
  
  if (result.metadata) {
    result.metadata.source = 'Facebook FHIR Timeline - Download';
  }
  
  const totalProcessed = Object.values(result.resources).reduce(function(sum, arr) {
    return sum + arr.length;
  }, 0);
  
  console.log(`📥 generateIndividualResourcesExport: Completed with ${totalProcessed} resources`);
  return result;
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