// meteor-v3/imports/ui/pages/ExportPreview.jsx
import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import { useNavigate, useLocation } from 'react-router-dom';
import { get } from 'lodash';
import moment from 'moment';

import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Alert,
  Button,
  Grid,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  TextField,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Paper
} from '@mui/material';

import {
  Download as DownloadIcon,
  Preview as PreviewIcon,
  ArrowBack as BackIcon,
  Settings as SettingsIcon,
  Check as CheckIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
  Code as CodeIcon,
  Refresh as RefreshIcon,
  BugReport as DebugIcon,
  Edit as EditIcon,
  Speed as SpeedIcon
} from '@mui/icons-material';

import AceEditor from 'react-ace';

// Import ACE Editor modes and themes
import 'ace-builds/src-noconflict/mode-json';
import 'ace-builds/src-noconflict/theme-github';
import 'ace-builds/src-noconflict/theme-monokai';
import 'ace-builds/src-noconflict/theme-tomorrow';
import 'ace-builds/src-noconflict/theme-solarized_dark';
import 'ace-builds/src-noconflict/theme-solarized_light';

export function ExportPreview() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Extract filters from query params or location state
  const [filters] = useState(function() {
    const urlParams = new URLSearchParams(location.search);
    const stateFilters = get(location, 'state.filters', {});
    
    return {
      dateRange: {
        start: urlParams.get('startDate') ? new Date(urlParams.get('startDate')) : stateFilters.dateRange?.start || null,
        end: urlParams.get('endDate') ? new Date(urlParams.get('endDate')) : stateFilters.dateRange?.end || null
      },
      resourceType: urlParams.get('resourceType') || stateFilters.resourceType || 'all',
      searchQuery: urlParams.get('searchQuery') || stateFilters.searchQuery || '',
      sortBy: urlParams.get('sortBy') || stateFilters.sortBy || 'date',
      sortOrder: urlParams.get('sortOrder') || stateFilters.sortOrder || 'desc'
    };
  });

  // State management
  const [exportData, setExportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [debugInfo, setDebugInfo] = useState(null);
  const [performanceWarningShown, setPerformanceWarningShown] = useState(false);
  
  // FIXED: Export settings with no artificial client-side limits
  const [exportSettings, setExportSettings] = useState({
    format: 'ndjson',
    prettyPrint: true,
    includeMetadata: true,
    theme: 'github',
    fontSize: 14,
    wordWrap: false,
    resourceTypes: ['all'],
    displayRows: 10000 // Default to 10K but allow much higher
  });

  // Filename state
  const [filename, setFilename] = useState(function() {
    return `fhir-export-${moment().format('YYYY-MM-DD-HHmm')}`;
  });

  // Performance warning dialog state
  const [performanceDialogOpen, setPerformanceDialogOpen] = useState(false);
  const [pendingDisplayRows, setPendingDisplayRows] = useState(null);

  // FIXED: Get display options with much higher limits and no arbitrary caps
  const getDisplayRowsOptions = function() {
    return [
      { value: 50, label: '50 rows', performance: 'fast' },
      { value: 100, label: '100 rows', performance: 'fast' },
      { value: 500, label: '500 rows', performance: 'fast' },
      { value: 1000, label: '1000 rows', performance: 'fast' },
      { value: 5000, label: '5000 rows', performance: 'fast' },
      { value: 10000, label: '10,000 rows', performance: 'moderate' },
      { value: 25000, label: '25,000 rows', performance: 'moderate' },
      { value: 50000, label: '50,000 rows', performance: 'slow' },
      { value: 100000, label: '100,000 rows', performance: 'slow' },
      { value: 250000, label: '250,000 rows', performance: 'very-slow' },
      { value: 500000, label: '500,000 rows', performance: 'very-slow' },
      { value: 1000000, label: '1,000,000 rows', performance: 'extremely-slow' },
      { value: -1, label: 'All rows (no limit)', performance: 'extremely-slow' }
    ];
  };

  // Get performance info for a given row count
  const getPerformanceInfo = function(rowCount) {
    if (rowCount === -1) return { level: 'extremely-slow', warning: 'May cause browser to freeze with very large datasets' };
    if (rowCount >= 500000) return { level: 'extremely-slow', warning: 'Very large dataset - may take 60+ seconds to render' };
    if (rowCount >= 100000) return { level: 'very-slow', warning: 'Large dataset - may take 10+ seconds to render' };
    if (rowCount >= 50000) return { level: 'slow', warning: 'May take a few seconds to render' };
    if (rowCount >= 10000) return { level: 'moderate', warning: 'Moderate rendering time' };
    return { level: 'fast', warning: null };
  };

  // Handle display rows change with performance warning
  const handleDisplayRowsChange = function(newValue) {
    const performanceInfo = getPerformanceInfo(newValue);
    
    // Show warning for slow performance options
    if (performanceInfo.level === 'slow' || performanceInfo.level === 'very-slow' || performanceInfo.level === 'extremely-slow') {
      if (!performanceWarningShown || newValue >= 100000) {
        setPendingDisplayRows(newValue);
        setPerformanceDialogOpen(true);
        return;
      }
    }
    
    // Apply the change immediately for fast options
    handleSettingChange('displayRows', newValue);
  };

  // Confirm performance warning and apply setting
  const confirmPerformanceChange = function() {
    if (pendingDisplayRows !== null) {
      handleSettingChange('displayRows', pendingDisplayRows);
      setPerformanceWarningShown(true);
      setPerformanceDialogOpen(false);
      setPendingDisplayRows(null);
    }
  };

  // Cancel performance warning
  const cancelPerformanceChange = function() {
    setPerformanceDialogOpen(false);
    setPendingDisplayRows(null);
  };

  // Load export preview data
  const loadExportPreview = async function() {
    setLoading(true);
    setError(null);
    setDebugInfo(null);
    
    try {
      console.log('🔍 DEBUG: Starting export preview load...');
      console.log('🔍 DEBUG: User ID:', Meteor.userId());
      console.log('🔍 DEBUG: Filters:', filters);
      console.log('🔍 DEBUG: Export Settings:', exportSettings);
      
      // First, let's try to get basic stats to see if we have any data at all
      const statsResult = await new Promise(function(resolve, reject) {
        Meteor.call('dashboard.getStatistics', function(error, result) {
          if (error) {
            console.error('🔍 DEBUG: Error getting stats:', error);
            reject(error);
          } else {
            console.log('🔍 DEBUG: Stats result:', result);
            resolve(result);
          }
        });
      });

      setDebugInfo(function(prev) {
        return {
          ...prev,
          stats: statsResult,
          hasData: (statsResult.totalCommunications + statsResult.totalClinicalImpressions + 
                   statsResult.totalMedia + statsResult.totalPersons) > 0
        };
      });

      // If we have data, try the export preview
      if ((statsResult.totalCommunications + statsResult.totalClinicalImpressions + 
           statsResult.totalMedia + statsResult.totalPersons) > 0) {
        
        console.log('🔍 DEBUG: We have data, calling export.generatePreview...');
        
        // FIXED: Use a very large server limit to match what the server can handle
        const serverLimit = exportSettings.displayRows === -1 ? 10000000 : Math.min(exportSettings.displayRows, 10000000);
        console.log('🔍 DEBUG: Using server limit:', serverLimit, 'for displayRows:', exportSettings.displayRows);
        
        const result = await new Promise(function(resolve, reject) {
          Meteor.call('export.generatePreview', {
            filters: filters,
            format: exportSettings.format,
            includeMetadata: exportSettings.includeMetadata,
            resourceTypes: exportSettings.resourceTypes,
            previewLimit: serverLimit // Use the large server limit
          }, function(error, result) {
            if (error) {
              console.error('🔍 DEBUG: Error in export.generatePreview:', error);
              reject(error);
            } else {
              console.log('🔍 DEBUG: Export preview result:', result);
              resolve(result);
            }
          });
        });
        
        setExportData(result);
        console.log('✅ Export preview loaded:', result.summary);
        
      } else {
        console.log('⚠️ No data available for export');
        setError('No data available for export. Please import some Facebook data first.');
      }
      
    } catch (error) {
      console.error('❌ Error loading export preview:', error);
      setError(error.reason || error.message);
      
      setDebugInfo(function(prev) {
        return {
          ...prev,
          error: error,
          errorDetails: {
            reason: error.reason,
            message: error.message,
            stack: error.stack
          }
        };
      });
    } finally {
      setLoading(false);
    }
  };

  // Load data on mount and when server-relevant settings change
  useEffect(function() {
    if (Meteor.userId()) {
      console.log('🔍 DEBUG: Component mounted, user ID:', Meteor.userId());
      loadExportPreview();
    } else {
      console.log('🔍 DEBUG: No user ID, skipping load');
    }
  }, [Meteor.userId(), exportSettings.format, exportSettings.includeMetadata, exportSettings.resourceTypes]);

  // Update filename when format changes
  useEffect(function() {
    const baseFilename = `fhir-export-${moment().format('YYYY-MM-DD-HHmm')}`;
    const extension = exportSettings.format === 'ndjson' ? '.ndjson' : '.json';
    setFilename(baseFilename + extension);
  }, [exportSettings.format]);

  // Handle export setting changes
  const handleSettingChange = function(key, value) {
    console.log('🔍 DEBUG: Setting change:', key, value);
    setExportSettings(function(prev) {
      return {
        ...prev,
        [key]: value
      };
    });
  };

  // Handle resource type selection
  const handleResourceTypeChange = function(event) {
    const value = event.target.value;
    console.log('🔍 DEBUG: Resource type change:', value);
    handleSettingChange('resourceTypes', typeof value === 'string' ? value.split(',') : value);
  };

  // Handle download
  const handleDownload = async function() {
    if (!exportData) {
      console.error('No export data to download');
      return;
    }

    setDownloading(true);
    
    try {
      console.log('📥 Starting download...');
      
      // Get the full export data (not just preview)
      const downloadResult = await new Promise(function(resolve, reject) {
        Meteor.call('export.downloadData', {
          filters: filters,
          format: exportSettings.format,
          prettyPrint: exportSettings.prettyPrint,
          includeMetadata: exportSettings.includeMetadata,
          resourceTypes: exportSettings.resourceTypes
        }, function(error, result) {
          if (error) reject(error);
          else resolve(result);
        });
      });
      
      // Format the data for download
      let downloadData = '';
      let downloadFilename = filename;
      let mimeType = 'application/json';
      
      // Ensure filename has correct extension
      if (exportSettings.format === 'ndjson') {
        if (!downloadFilename.endsWith('.ndjson')) {
          downloadFilename = downloadFilename.replace(/\.(json|ndjson)$/, '') + '.ndjson';
        }
        mimeType = 'application/x-ndjson';
      } else {
        if (!downloadFilename.endsWith('.json')) {
          downloadFilename = downloadFilename.replace(/\.(json|ndjson)$/, '') + '.json';
        }
        mimeType = 'application/json';
      }
      
      if (exportSettings.format === 'ndjson') {
        // Convert to NDJSON format - each resource on its own line
        const lines = [];
        
        if (downloadResult.bundle && downloadResult.bundle.entry) {
          downloadResult.bundle.entry.forEach(function(entry) {
            if (entry.resource) {
              lines.push(JSON.stringify(entry.resource, null, 0));
            }
          });
        } else if (downloadResult.resources) {
          downloadResult.resources.forEach(function(resource) {
            lines.push(JSON.stringify(resource, null, 0));
          });
        }
        
        downloadData = lines.join('\n');
      } else {
        // Regular JSON format
        downloadData = JSON.stringify(downloadResult, null, exportSettings.prettyPrint ? 2 : 0);
      }
      
      // Create and trigger download
      const blob = new Blob([downloadData], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = downloadFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      console.log(`✅ Download completed: ${downloadFilename}`);
      
    } catch (error) {
      console.error('❌ Download error:', error);
      setError(`Download failed: ${error.reason || error.message}`);
    } finally {
      setDownloading(false);
    }
  };

  // FIXED: Completely rewritten useMemo to handle large datasets properly
  const { displayData, actualDisplayedRows, debugInfo: displayDebugInfo } = React.useMemo(function() {
    if (!exportData) {
      return {
        displayData: '// No export data available\n// Debug info below:\n' + 
                    JSON.stringify(debugInfo, null, 2),
        actualDisplayedRows: 0,
        debugInfo: { message: 'No export data' }
      };
    }
    
    try {
      console.log('🔍 MEMO: Processing display data with settings:', {
        displayRows: exportSettings.displayRows,
        format: exportSettings.format,
        prettyPrint: exportSettings.prettyPrint
      });
      
      console.log('🔍 MEMO: Export data structure:', {
        keys: Object.keys(exportData),
        summaryTotalResources: exportData.summary?.totalResources,
        bundleEntryLength: exportData.bundle?.entry?.length,
        resourcesType: Array.isArray(exportData.resources) ? 'array' : typeof exportData.resources,
        resourcesLength: Array.isArray(exportData.resources) ? exportData.resources.length : 
                        exportData.resources ? Object.keys(exportData.resources).length : 0
      });
      
      // FIXED: Determine the effective limit - use -1 for unlimited
      const effectiveLimit = exportSettings.displayRows === -1 ? Infinity : exportSettings.displayRows;
      console.log('🔍 MEMO: Effective limit:', effectiveLimit);
      
      let actualRows = 0;
      let totalAvailableResources = 0;
      let processedStructure = '';
      let resultData = '';
      
      if (exportSettings.format === 'ndjson') {
        // NDJSON format - each resource on its own line
        const lines = [];
        
        if (exportData.bundle && exportData.bundle.entry) {
          totalAvailableResources = exportData.bundle.entry.length;
          processedStructure = 'bundle.entry';
          console.log('🔍 MEMO: Processing bundle.entry with', totalAvailableResources, 'items, limit:', effectiveLimit);
          
          // FIXED: Process up to the effective limit (which could be Infinity)
          const itemsToProcess = Math.min(exportData.bundle.entry.length, effectiveLimit);
          for (let i = 0; i < itemsToProcess; i++) {
            const entry = exportData.bundle.entry[i];
            if (entry.resource) {
              lines.push(JSON.stringify(entry.resource, null, 0));
              actualRows++;
            }
          }
        } else if (exportData.resources) {
          processedStructure = 'resources';
          
          if (Array.isArray(exportData.resources)) {
            totalAvailableResources = exportData.resources.length;
            processedStructure = 'resources (array)';
            console.log('🔍 MEMO: Resources is array with', totalAvailableResources, 'items, limit:', effectiveLimit);
            
            const itemsToProcess = Math.min(exportData.resources.length, effectiveLimit);
            for (let i = 0; i < itemsToProcess; i++) {
              lines.push(JSON.stringify(exportData.resources[i], null, 0));
              actualRows++;
            }
          } else {
            processedStructure = 'resources (object)';
            console.log('🔍 MEMO: Resources is object with keys:', Object.keys(exportData.resources));
            
            // Count total first
            for (const [resourceType, resourceArray] of Object.entries(exportData.resources)) {
              if (Array.isArray(resourceArray)) {
                totalAvailableResources += resourceArray.length;
              }
            }
            
            // Process with limit
            for (const [resourceType, resourceArray] of Object.entries(exportData.resources)) {
              if (Array.isArray(resourceArray)) {
                console.log(`🔍 MEMO: Processing ${resourceType} with ${resourceArray.length} items (actualRows: ${actualRows}/${effectiveLimit})`);
                const itemsToProcess = Math.min(resourceArray.length, effectiveLimit - actualRows);
                for (let i = 0; i < itemsToProcess; i++) {
                  lines.push(JSON.stringify(resourceArray[i], null, 0));
                  actualRows++;
                }
                if (actualRows >= effectiveLimit) {
                  console.log(`🔍 MEMO: Hit effectiveLimit at ${actualRows}, breaking`);
                  break;
                }
              }
            }
          }
        }
        
        // Add truncation message if we hit the limit
        if (actualRows >= effectiveLimit && totalAvailableResources > effectiveLimit && effectiveLimit !== Infinity) {
          lines.push(`// ... ${totalAvailableResources - actualRows} more resources (limited to ${effectiveLimit.toLocaleString()} for preview)`);
        }
        
        resultData = lines.join('\n');
        
      } else {
        // Regular JSON format
        let dataToDisplay = { ...exportData };
        processedStructure = 'json';
        
        if (exportData.bundle && exportData.bundle.entry) {
          totalAvailableResources = exportData.bundle.entry.length;
          processedStructure = 'json bundle.entry';
          console.log('🔍 MEMO: JSON - Processing bundle.entry with', totalAvailableResources, 'items, limit:', effectiveLimit);
          
          if (exportData.bundle.entry.length > effectiveLimit && effectiveLimit !== Infinity) {
            dataToDisplay.bundle = {
              ...exportData.bundle,
              entry: exportData.bundle.entry.slice(0, effectiveLimit)
            };
            dataToDisplay.truncated = true;
            dataToDisplay.displayedResources = effectiveLimit;
            dataToDisplay.totalResources = exportData.bundle.entry.length;
            actualRows = effectiveLimit;
          } else {
            actualRows = exportData.bundle.entry.length;
          }
        } else if (exportData.resources) {
          processedStructure = 'json resources';
          
          if (Array.isArray(exportData.resources)) {
            totalAvailableResources = exportData.resources.length;
            processedStructure = 'json resources (array)';
            console.log('🔍 MEMO: JSON - Processing resources array with', totalAvailableResources, 'items');
            
            if (exportData.resources.length > effectiveLimit && effectiveLimit !== Infinity) {
              dataToDisplay.resources = exportData.resources.slice(0, effectiveLimit);
              dataToDisplay.truncated = true;
              dataToDisplay.displayedResources = effectiveLimit;
              dataToDisplay.totalResources = exportData.resources.length;
              actualRows = effectiveLimit;
            } else {
              actualRows = exportData.resources.length;
            }
          } else {
            // Handle object with resource types
            processedStructure = 'json resources (object)';
            console.log('🔍 MEMO: JSON - Processing resources object');
            const truncatedResources = {};
            let displayedResourceCount = 0;
            
            // Count total resources first
            for (const [type, resources] of Object.entries(exportData.resources)) {
              if (Array.isArray(resources)) {
                totalAvailableResources += resources.length;
              }
            }
            
            console.log('🔍 MEMO: Total resource count:', totalAvailableResources, 'effectiveLimit:', effectiveLimit);
            
            if (totalAvailableResources > effectiveLimit && effectiveLimit !== Infinity) {
              // Truncate across resource types
              for (const [type, resources] of Object.entries(exportData.resources)) {
                if (Array.isArray(resources) && displayedResourceCount < effectiveLimit) {
                  const remainingSlots = effectiveLimit - displayedResourceCount;
                  const slicedResources = resources.slice(0, remainingSlots);
                  truncatedResources[type] = slicedResources;
                  displayedResourceCount += slicedResources.length;
                  console.log(`🔍 MEMO: Added ${slicedResources.length} ${type} resources (total now: ${displayedResourceCount})`);
                } else if (displayedResourceCount < effectiveLimit) {
                  truncatedResources[type] = resources;
                  if (Array.isArray(resources)) {
                    displayedResourceCount += resources.length;
                  }
                  console.log(`🔍 MEMO: Added all ${Array.isArray(resources) ? resources.length : 'non-array'} ${type} resources (total now: ${displayedResourceCount})`);
                }
                
                if (displayedResourceCount >= effectiveLimit) {
                  console.log(`🔍 MEMO: Hit effectiveLimit at ${displayedResourceCount}, breaking`);
                  break;
                }
              }
              
              dataToDisplay.resources = truncatedResources;
              dataToDisplay.truncated = true;
              dataToDisplay.displayedResources = displayedResourceCount;
              dataToDisplay.totalResources = totalAvailableResources;
              actualRows = displayedResourceCount;
            } else {
              actualRows = totalAvailableResources;
            }
          }
        }
        
        resultData = JSON.stringify(dataToDisplay, null, exportSettings.prettyPrint ? 2 : 0);
      }
      
      const jsonLines = resultData.split('\n').length;
      
      console.log('🔍 MEMO: Final result:', {
        actualRows,
        totalAvailableResources,
        jsonLines,
        effectiveLimit,
        wasLimited: actualRows < totalAvailableResources,
        format: exportSettings.format
      });
      
      return {
        displayData: resultData,
        actualDisplayedRows: actualRows,
        debugInfo: {
          format: exportSettings.format,
          structure: processedStructure,
          actualRows,
          totalAvailableResources,
          jsonLines,
          effectiveLimit,
          limitReached: actualRows >= effectiveLimit && effectiveLimit !== Infinity,
          prettyPrint: exportSettings.prettyPrint
        }
      };
    } catch (error) {
      console.error('🔍 MEMO: Error in useMemo:', error);
      return {
        displayData: `Error formatting data: ${error.message}\n\nDebug info:\n${JSON.stringify(debugInfo, null, 2)}`,
        actualDisplayedRows: 0,
        debugInfo: { error: error.message }
      };
    }
  }, [exportData, exportSettings.displayRows, exportSettings.format, exportSettings.prettyPrint, debugInfo]);

  // Get display data
  const getDisplayData = function() {
    return displayData;
  };

  // Get file size estimate
  const getFileSizeEstimate = function() {
    const data = getDisplayData();
    const sizeInBytes = new Blob([data]).size;
    
    if (sizeInBytes < 1024) return `${sizeInBytes} bytes`;
    if (sizeInBytes < 1024 * 1024) return `${(sizeInBytes / 1024).toFixed(1)} KB`;
    return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Get displayed resource count
  const getDisplayedResourceCount = function() {
    return actualDisplayedRows;
  };

  if (!Meteor.userId()) {
    return (
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        <Alert severity="warning">
          Please log in to preview exports.
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      {/* Header */}
      <Box mb={4}>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography variant="h3" component="h1" gutterBottom>
              Export Preview
            </Typography>
            <Typography variant="subtitle1" color="text.secondary">
              Review your FHIR export data before downloading.
            </Typography>
          </Box>
          
          <Box display="flex" gap={1}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={loadExportPreview}
              disabled={loading}
            >
              Refresh
            </Button>
            <Button
              variant="contained"
              startIcon={<DownloadIcon />}
              onClick={handleDownload}
              disabled={downloading || !exportData}
              size="large"
            >
              {downloading ? 'Downloading...' : 'Download'}
            </Button>
          </Box>
        </Box>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} action={
          <Button color="inherit" size="small" onClick={loadExportPreview}>
            Retry
          </Button>
        }>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Settings Sidebar */}
        <Grid item xs={12} md={3}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <SettingsIcon sx={{ mr: 1 }} />
                <Typography variant="h6">
                  Export Settings
                </Typography>
              </Box>

              {/* Filename input field */}
              <TextField
                fullWidth
                label="Download Filename"
                value={filename}
                onChange={function(e) { setFilename(e.target.value); }}
                helperText="File extension will be updated based on format"
                InputProps={{
                  startAdornment: <EditIcon sx={{ mr: 1, color: 'text.secondary' }} />
                }}
                sx={{ mb: 2 }}
              />

              {/* Format Selection */}
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Export Format</InputLabel>
                <Select
                  value={exportSettings.format}
                  label="Export Format"
                  onChange={function(e) { handleSettingChange('format', e.target.value); }}
                >
                  <MenuItem value="ndjson">NDJSON (Newline Delimited)</MenuItem>
                  <MenuItem value="bundle">FHIR Bundle</MenuItem>
                  <MenuItem value="individual">Individual Resources</MenuItem>
                </Select>
              </FormControl>

              {/* FIXED: Preview Rows Selector with much higher limits */}
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Preview Rows</InputLabel>
                <Select
                  value={exportSettings.displayRows}
                  label="Preview Rows"
                  onChange={function(e) { 
                    console.log('🔍 DEBUG: Preview rows changed to:', e.target.value);
                    handleDisplayRowsChange(e.target.value); 
                  }}
                >
                  {getDisplayRowsOptions().map(function(option) {
                    return (
                      <MenuItem key={option.value} value={option.value}>
                        <Box display="flex" alignItems="center" justifyContent="space-between" width="100%">
                          <span>{option.label}</span>
                          {option.performance === 'slow' && (
                            <SpeedIcon sx={{ fontSize: 16, color: 'warning.main', ml: 1 }} />
                          )}
                          {(option.performance === 'very-slow' || option.performance === 'extremely-slow') && (
                            <WarningIcon sx={{ fontSize: 16, color: 'error.main', ml: 1 }} />
                          )}
                        </Box>
                      </MenuItem>
                    );
                  })}
                </Select>
              </FormControl>

              {/* Show performance warning for current selection */}
              {exportSettings.displayRows > 10000 && (
                <Alert severity="warning" sx={{ mb: 2, fontSize: '0.75rem' }}>
                  <Typography variant="caption">
                    {getPerformanceInfo(exportSettings.displayRows).warning}
                  </Typography>
                </Alert>
              )}

              {/* Editor Theme */}
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Editor Theme</InputLabel>
                <Select
                  value={exportSettings.theme}
                  label="Editor Theme"
                  onChange={function(e) { handleSettingChange('theme', e.target.value); }}
                >
                  <MenuItem value="github">GitHub Light</MenuItem>
                  <MenuItem value="monokai">Monokai Dark</MenuItem>
                  <MenuItem value="tomorrow">Tomorrow</MenuItem>
                  <MenuItem value="solarized_light">Solarized Light</MenuItem>
                  <MenuItem value="solarized_dark">Solarized Dark</MenuItem>
                </Select>
              </FormControl>

              {/* Font Size */}
              <TextField
                fullWidth
                type="number"
                label="Font Size"
                value={exportSettings.fontSize}
                onChange={function(e) { handleSettingChange('fontSize', parseInt(e.target.value)); }}
                inputProps={{ min: 10, max: 24 }}
                sx={{ mb: 2 }}
              />

              {/* Resource Types */}
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Resource Types</InputLabel>
                <Select
                  multiple
                  value={exportSettings.resourceTypes}
                  label="Resource Types"
                  onChange={handleResourceTypeChange}
                  renderValue={function(selected) {
                    return selected.includes('all') ? 'All Resources' : selected.join(', ');
                  }}
                >
                  <MenuItem value="all">All Resources</MenuItem>
                  <MenuItem value="ClinicalImpression">Clinical Impressions</MenuItem>
                  <MenuItem value="Communication">Communications</MenuItem>
                  <MenuItem value="Media">Media</MenuItem>
                  <MenuItem value="Person">Persons</MenuItem>
                  <MenuItem value="CareTeam">Care Teams</MenuItem>
                  <MenuItem value="Patient">Patients</MenuItem>
                </Select>
              </FormControl>

              {/* Switches */}
              <FormControlLabel
                control={
                  <Switch
                    checked={exportSettings.wordWrap}
                    onChange={function(e) { handleSettingChange('wordWrap', e.target.checked); }}
                  />
                }
                label="Word Wrap"
                sx={{ mb: 1, display: 'block' }}
              />
              
              <FormControlLabel
                control={
                  <Switch
                    checked={exportSettings.prettyPrint}
                    onChange={function(e) { handleSettingChange('prettyPrint', e.target.checked); }}
                  />
                }
                label="Pretty Print JSON"
                sx={{ mb: 1, display: 'block' }}
              />
              
              <FormControlLabel
                control={
                  <Switch
                    checked={exportSettings.includeMetadata}
                    onChange={function(e) { handleSettingChange('includeMetadata', e.target.checked); }}
                  />
                }
                label="Include Metadata"
                sx={{ display: 'block' }}
              />
            </CardContent>
          </Card>

          {/* Export Summary */}
          {exportData && (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Export Summary
                </Typography>
                
                <List dense>
                  <ListItem>
                    <ListItemIcon>
                      <InfoIcon color="primary" />
                    </ListItemIcon>
                    <ListItemText
                      primary="Total Resources"
                      secondary={get(exportData, 'summary.totalResources', 0).toLocaleString()}
                    />
                  </ListItem>
                  
                  <ListItem>
                    <ListItemIcon>
                      <PreviewIcon color="secondary" />
                    </ListItemIcon>
                    <ListItemText
                      primary="Showing Resources"
                      secondary={`${getDisplayedResourceCount().toLocaleString()} of ${get(exportData, 'summary.totalResources', 0).toLocaleString()}`}
                    />
                  </ListItem>
                  
                  <ListItem>
                    <ListItemIcon>
                      <CheckIcon color="success" />
                    </ListItemIcon>
                    <ListItemText
                      primary="Preview Size"
                      secondary={getFileSizeEstimate()}
                    />
                  </ListItem>
                  
                  <ListItem>
                    <ListItemIcon>
                      <CodeIcon color="secondary" />
                    </ListItemIcon>
                    <ListItemText
                      primary="Format"
                      secondary={exportSettings.format.toUpperCase()}
                    />
                  </ListItem>
                </List>

                {get(exportData, 'summary.resourceCounts') && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Resource Breakdown:
                    </Typography>
                    {Object.entries(exportData.summary.resourceCounts).map(function([type, count]) {
                      return (
                        <Chip
                          key={type}
                          label={`${type}: ${count.toLocaleString()}`}
                          size="small"
                          sx={{ mr: 0.5, mb: 0.5 }}
                        />
                      );
                    })}
                  </Box>
                )}

                {/* Enhanced debug info showing processing details */}
                <Box sx={{ mt: 2, p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
                  <Typography variant="caption" component="div">
                    <strong>Debug:</strong> displayRows={exportSettings.displayRows === -1 ? 'All' : exportSettings.displayRows.toLocaleString()}, actualDisplayedRows={actualDisplayedRows.toLocaleString()}
                  </Typography>
                  {displayDebugInfo && (
                    <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>
                      <strong>Structure:</strong> {displayDebugInfo.structure}, 
                      <strong> Available:</strong> {displayDebugInfo.totalAvailableResources?.toLocaleString()}, 
                      <strong> Format:</strong> {displayDebugInfo.format}
                      {displayDebugInfo.jsonLines && (
                        <span>, <strong>JSON Lines:</strong> {displayDebugInfo.jsonLines.toLocaleString()}</span>
                      )}
                      {displayDebugInfo.effectiveLimit !== undefined && (
                        <span>, <strong>Limit:</strong> {displayDebugInfo.effectiveLimit === Infinity ? 'None' : displayDebugInfo.effectiveLimit.toLocaleString()}</span>
                      )}
                    </Typography>
                  )}
                </Box>
              </CardContent>
            </Card>
          )}
        </Grid>

        {/* Code Preview */}
        <Grid item xs={12} md={9}>
          <Card sx={{ height: '800px', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', p: 0 }}>
              <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box display="flex" alignItems="center">
                    <PreviewIcon sx={{ mr: 1 }} />
                    <Typography variant="h6">
                      Export Data Preview
                    </Typography>
                  </Box>
                  
                  {exportData && (
                    <Box display="flex" alignItems="center" gap={1}>
                      <Chip
                        label={`${getDisplayedResourceCount().toLocaleString()} of ${get(exportData, 'summary.totalResources', 0).toLocaleString()} resources`}
                        color="primary"
                        size="small"
                      />
                      {exportSettings.displayRows !== -1 && exportSettings.displayRows < get(exportData, 'summary.totalResources', 0) && (
                        <Chip
                          label={`Preview Limited`}
                          color="warning"
                          size="small"
                        />
                      )}
                      {exportSettings.displayRows > 50000 && (
                        <Chip
                          label="Large Dataset"
                          color="error"
                          size="small"
                          icon={<WarningIcon />}
                        />
                      )}
                    </Box>
                  )}
                </Box>
              </Box>

              <Box sx={{ flexGrow: 1, position: 'relative' }}>
                {loading ? (
                  <Box sx={{ p: 3 }}>
                    <LinearProgress sx={{ mb: 2 }} />
                    <Typography variant="body2" color="text.secondary" align="center">
                      Loading export preview...
                    </Typography>
                  </Box>
                ) : exportData ? (
                  <AceEditor
                    mode="json"
                    theme={exportSettings.theme}
                    name="export-preview-editor"
                    editorProps={{ $blockScrolling: true }}
                    fontSize={exportSettings.fontSize}
                    showPrintMargin={true}
                    showGutter={true}
                    highlightActiveLine={true}
                    value={getDisplayData()}
                    readOnly={true}
                    width="100%"
                    height="100%"
                    wrapEnabled={exportSettings.wordWrap}
                    setOptions={{
                      enableBasicAutocompletion: false,
                      enableLiveAutocompletion: false,
                      enableSnippets: false,
                      showLineNumbers: true,
                      tabSize: 2,
                      useWorker: false,
                      scrollPastEnd: false,
                      fixedWidthGutter: false
                    }}
                    style={{
                      width: '100%',
                      height: '100%',
                      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace'
                    }}
                  />
                ) : (
                  <Box sx={{ p: 3, textAlign: 'center' }}>
                    <WarningIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                    <Typography variant="h6" gutterBottom>
                      No Export Data
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      No data available for export with the current filters.
                    </Typography>
                  </Box>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Performance Warning Dialog */}
      <Dialog 
        open={performanceDialogOpen} 
        onClose={cancelPerformanceChange}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center">
            <WarningIcon color="warning" sx={{ mr: 1 }} />
            Performance Warning
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body1" paragraph>
              You've selected to display <strong>{pendingDisplayRows === -1 ? 'all rows' : pendingDisplayRows?.toLocaleString()}</strong> which may cause:
            </Typography>
            
            <Box component="ul" sx={{ pl: 2, mb: 2 }}>
              <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
                Slow browser performance while rendering
              </Typography>
              <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
                High memory usage (especially on mobile devices)
              </Typography>
              {pendingDisplayRows >= 100000 && (
                <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
                  <strong>Browser may freeze</strong> for 10+ seconds during rendering
                </Typography>
              )}
              {pendingDisplayRows >= 500000 && (
                <Typography component="li" variant="body2" sx={{ mb: 0.5, color: 'error.main' }}>
                  <strong>Very high risk</strong> of browser crash on older devices
                </Typography>
              )}
            </Box>

            <Alert severity={pendingDisplayRows >= 100000 ? "error" : "warning"} sx={{ mb: 2 }}>
              <Typography variant="body2">
                {getPerformanceInfo(pendingDisplayRows).warning}
              </Typography>
            </Alert>

            <Typography variant="body2" color="text.secondary">
              Consider using a smaller preview size for better performance. The full download will always include all your data regardless of preview settings.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelPerformanceChange}>
            Cancel
          </Button>
          <Button 
            onClick={confirmPerformanceChange}
            color={pendingDisplayRows >= 100000 ? "error" : "warning"}
            variant="contained"
          >
            Continue Anyway
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}