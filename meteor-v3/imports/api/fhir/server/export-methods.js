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
      
      // ENHANCED: Support much larger preview limits, with intelligent server-side capping
      let previewLimit = get(options, 'previewLimit', 1000);
      
      // Cap the server-side processing to prevent server overload
      // Client can display more by slicing the returned data
      const maxServerLimit = 100000; // 100K server-side cap
      const serverLimit = Math.min(previewLimit, maxServerLimit);
      
      console.log(`📊 Generating export preview for user ${this.userId}:`, { 
        filters, 
        format, 
        resourceTypes, 
        requestedLimit: previewLimit,
        serverLimit: serverLimit
      });

      // ENHANCED: Use the serverLimit for timeline data retrieval
      const timelineResult = await Meteor.call('timeline.getData', {
        page: 1,
        limit: serverLimit, // Use server-safe limit
        filters: filters
      });

      console.log(`📊 SERVER: timeline.getData returned ${timelineResult.items?.length || 0} items (requested: ${previewLimit}, server limit: ${serverLimit})`);

      // Filter by resource types if specified
      let filteredItems = timelineResult.items;
      if (!resourceTypes.includes('all')) {
        filteredItems = timelineResult.items.filter(function(item) {
          return resourceTypes.includes(item.resourceType);
        });
      }

      console.log(`📊 SERVER: After resource type filtering: ${filteredItems.length} items`);

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
        requestedLimit: previewLimit, // What client requested
        serverLimit: serverLimit, // What server processed
        actualTotal: timelineResult.totalCount, // Total available in database
        serverItemsReturned: timelineResult.items?.length || 0,
        timelineLimit: serverLimit,
        // ENHANCED: Add performance warnings
        performanceInfo: {
          isLargeDataset: filteredItems.length > 10000,
          serverLimited: previewLimit > maxServerLimit,
          maxServerLimit: maxServerLimit
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

      console.log(`✅ Export preview generated: ${filteredItems.length} resources (requested: ${previewLimit}, server processed: ${serverLimit}, total available: ${timelineResult.totalCount})`);
      
      // ENHANCED: Log performance warnings if applicable
      if (previewLimit > maxServerLimit) {
        console.log(`⚠️ Client requested ${previewLimit} resources but server capped at ${maxServerLimit} for performance`);
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

      // ENHANCED: For downloads, we can use larger limits but still need to be reasonable
      // Use multiple passes if needed for very large datasets
      const maxDownloadLimit = 1000000; // 1M limit for downloads
      
      // Get timeline data in batches if needed
      let allItems = [];
      let page = 1;
      const batchSize = 50000; // Process in 50K chunks
      let hasMore = true;
      
      while (hasMore && allItems.length < maxDownloadLimit) {
        const timelineResult = await Meteor.call('timeline.getData', {
          page: page,
          limit: Math.min(batchSize, maxDownloadLimit - allItems.length),
          filters: filters
        });
        
        if (timelineResult.items && timelineResult.items.length > 0) {
          allItems = allItems.concat(timelineResult.items);
          console.log(`📥 Downloaded batch ${page}: ${timelineResult.items.length} items, total: ${allItems.length}`);
          
          // Check if we have more data
          hasMore = timelineResult.items.length === batchSize && 
                   timelineResult.totalCount > allItems.length &&
                   allItems.length < maxDownloadLimit;
          page++;
        } else {
          hasMore = false;
        }
        
        // Safety check to prevent infinite loops
        if (page > 100) {
          console.warn('⚠️ Reached maximum page limit (100) during download');
          break;
        }
      }

      console.log(`📥 Total items collected for download: ${allItems.length}`);

      // Filter by resource types if specified
      let filteredItems = allItems;
      if (!resourceTypes.includes('all')) {
        filteredItems = allItems.filter(function(item) {
          return resourceTypes.includes(item.resourceType);
        });
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
          totalBatches: page - 1,
          maxDownloadLimit: maxDownloadLimit,
          limitReached: filteredItems.length >= maxDownloadLimit
        };
      }

      console.log(`✅ Full export generated: ${filteredItems.length} resources in ${page - 1} batches`);
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
      // ENHANCED: Add limits information
      limits: {
        previewMaxClient: 1000000, // 1M client-side display limit
        previewMaxServer: 100000,  // 100K server-side processing limit
        downloadMax: 1000000,      // 1M download limit
        batchSize: 50000           // 50K batch size for large downloads
      }
    };
  },

  // ENHANCED: New method to get performance recommendations
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
      recommendations.optimalPreviewSize = Math.min(estimatedResourceCount, 5000);
      recommendations.warningLevel = 'low';
      recommendations.recommendations.push('Consider previewing first 5,000 records for optimal performance');
    } else if (estimatedResourceCount <= 100000) {
      recommendations.optimalPreviewSize = 10000;
      recommendations.warningLevel = 'medium';
      recommendations.recommendations.push('Large dataset detected - preview limited to 10,000 records recommended');
      recommendations.recommendations.push('Full dataset available in download');
    } else if (estimatedResourceCount <= 1000000) {
      recommendations.optimalPreviewSize = 10000;
      recommendations.warningLevel = 'high';
      recommendations.recommendations.push('Very large dataset - strongly recommend limiting preview to 10,000 records');
      recommendations.recommendations.push('Consider using NDJSON format for better performance');
      recommendations.recommendations.push('Download may take several minutes');
    } else {
      recommendations.optimalPreviewSize = 10000;
      recommendations.warningLevel = 'critical';
      recommendations.recommendations.push('Extremely large dataset detected');
      recommendations.recommendations.push('Preview strongly limited to 10,000 records');
      recommendations.recommendations.push('Download will be processed in batches');
      recommendations.recommendations.push('Consider applying filters to reduce dataset size');
    }

    return recommendations;
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

  // ENHANCED: Add performance monitoring for large datasets
  if (items.length > 10000) {
    console.log(`⚠️ Processing large bundle with ${items.length} items - this may take some time`);
  }

  // Add resources to bundle with progress logging for large sets
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

  if (items.length > 10000) {
    console.log(`✅ Completed bundle generation with ${items.length} items`);
  }

  return { bundle };
}

async function generateBundleExport(items, includeMetadata, userId) {
  // Same as preview but with download-specific metadata
  const result = await generateBundlePreview(items, includeMetadata, userId);
  
  if (result.bundle.meta) {
    result.bundle.meta.source = 'Facebook FHIR Timeline - Download';
  }
  
  return result;
}

async function generateNDJSONPreview(items, includeMetadata) {
  // ENHANCED: Add performance monitoring for large datasets
  if (items.length > 10000) {
    console.log(`⚠️ Processing large NDJSON with ${items.length} items - this may take some time`);
  }

  const resources = [];
  
  items.forEach(function(item, index) {
    resources.push(cleanResourceForExport(item, includeMetadata));
    
    // Log progress for very large datasets
    if (items.length > 50000 && index > 0 && index % 10000 === 0) {
      console.log(`📊 NDJSON progress: ${index}/${items.length} resources processed (${((index/items.length)*100).toFixed(1)}%)`);
    }
  });

  if (items.length > 10000) {
    console.log(`✅ Completed NDJSON generation with ${items.length} items`);
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
  const result = await generateNDJSONPreview(items, includeMetadata);
  
  if (result.metadata) {
    result.metadata.source = 'Facebook FHIR Timeline - Download';
  }
  
  return result;
}

async function generateIndividualResourcesPreview(items, includeMetadata) {
  // ENHANCED: Add performance monitoring for large datasets
  if (items.length > 10000) {
    console.log(`⚠️ Processing large individual resources with ${items.length} items - this may take some time`);
  }

  const resourcesByType = {};
  
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

  if (items.length > 10000) {
    console.log(`✅ Completed individual resources generation with ${items.length} items across ${Object.keys(resourcesByType).length} resource types`);
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
      totalResources: items.length,
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
  const result = await generateIndividualResourcesPreview(items, includeMetadata);
  
  if (result.metadata) {
    result.metadata.source = 'Facebook FHIR Timeline - Download';
  }
  
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