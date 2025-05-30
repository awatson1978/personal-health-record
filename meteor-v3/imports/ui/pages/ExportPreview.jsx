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
  Edit as EditIcon
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
  
  // FIXED: Export settings - displayRows now only affects client-side display
  const [exportSettings, setExportSettings] = useState({
    format: 'ndjson',
    prettyPrint: true,
    includeMetadata: true,
    theme: 'github',
    fontSize: 14,
    wordWrap: false,
    resourceTypes: ['all'],
    displayRows: 100 // This now only controls client-side display
  });

  // Filename state
  const [filename, setFilename] = useState(function() {
    return `fhir-export-${moment().format('YYYY-MM-DD-HHmm')}`;
  });

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
        
        const result = await new Promise(function(resolve, reject) {
          Meteor.call('export.generatePreview', {
            filters: filters,
            format: exportSettings.format,
            includeMetadata: exportSettings.includeMetadata,
            resourceTypes: exportSettings.resourceTypes,
            previewLimit: 5000 // FIXED: Always fetch a large amount from server (5000 resources)
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

  // FIXED: Load data on mount and when server-relevant settings change
  // Removed exportSettings.displayRows from dependencies since it's now client-only
  useEffect(function() {
    if (Meteor.userId()) {
      console.log('🔍 DEBUG: Component mounted, user ID:', Meteor.userId());
      loadExportPreview();
    } else {
      console.log('🔍 DEBUG: No user ID, skipping load');
    }
  }, [Meteor.userId(), exportSettings.format, exportSettings.includeMetadata, exportSettings.resourceTypes]);
  // REMOVED: exportSettings.displayRows from dependencies - now it's client-side only!

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

  // FIXED: Optimized useMemo with client-side only row limiting
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
      // FIXED: Use displayRows for client-side limiting only
      const maxRows = exportSettings.displayRows === -1 ? Infinity : exportSettings.displayRows;
      console.log('🔍 DEBUG: Client-side limiting with maxRows:', maxRows, 'format:', exportSettings.format);
      console.log('🔍 DEBUG: exportData keys:', Object.keys(exportData));
      console.log('🔍 DEBUG: exportData.summary:', exportData.summary);
      
      let actualRows = 0;
      let totalAvailableResources = 0;
      let processedStructure = '';
      
      if (exportSettings.format === 'ndjson') {
        // NDJSON format - each resource on its own line
        const lines = [];
        
        if (exportData.bundle && exportData.bundle.entry) {
          totalAvailableResources = exportData.bundle.entry.length;
          processedStructure = 'bundle.entry';
          console.log('🔍 DEBUG: Processing bundle.entry with', totalAvailableResources, 'items');
          
          for (let i = 0; i < exportData.bundle.entry.length && actualRows < maxRows; i++) {
            const entry = exportData.bundle.entry[i];
            if (entry.resource) {
              lines.push(JSON.stringify(entry.resource, null, 0));
              actualRows++;
            }
          }
        } else if (exportData.resources) {
          processedStructure = 'resources';
          console.log('🔍 DEBUG: Processing resources');
          
          if (Array.isArray(exportData.resources)) {
            totalAvailableResources = exportData.resources.length;
            processedStructure = 'resources (array)';
            console.log('🔍 DEBUG: Resources is array with', totalAvailableResources, 'items');
            
            for (let i = 0; i < exportData.resources.length && actualRows < maxRows; i++) {
              lines.push(JSON.stringify(exportData.resources[i], null, 0));
              actualRows++;
            }
          } else {
            processedStructure = 'resources (object)';
            console.log('🔍 DEBUG: Resources is object with keys:', Object.keys(exportData.resources));
            
            // Count total first
            for (const [resourceType, resourceArray] of Object.entries(exportData.resources)) {
              if (Array.isArray(resourceArray)) {
                totalAvailableResources += resourceArray.length;
              }
            }
            
            // Then process with limit
            for (const [resourceType, resourceArray] of Object.entries(exportData.resources)) {
              if (Array.isArray(resourceArray)) {
                console.log(`🔍 DEBUG: Processing ${resourceType} with ${resourceArray.length} items (actualRows: ${actualRows}/${maxRows})`);
                for (let i = 0; i < resourceArray.length && actualRows < maxRows; i++) {
                  lines.push(JSON.stringify(resourceArray[i], null, 0));
                  actualRows++;
                }
                if (actualRows >= maxRows) {
                  console.log(`🔍 DEBUG: Hit maxRows limit at ${actualRows}, breaking`);
                  break;
                }
              }
            }
          }
        }
        
        // Add truncation message if we hit the limit
        if (actualRows >= maxRows && totalAvailableResources > maxRows) {
          lines.push(`// ... ${totalAvailableResources - maxRows} more resources (limited to ${maxRows} for preview)`);
        }
        
        const finalLines = lines.length;
        console.log('🔍 DEBUG: NDJSON - created', finalLines, 'lines from', actualRows, 'resources out of', totalAvailableResources, 'available');
        
        return {
          displayData: lines.join('\n'),
          actualDisplayedRows: actualRows,
          debugInfo: {
            format: 'ndjson',
            structure: processedStructure,
            actualRows,
            totalAvailableResources,
            finalLines,
            maxRows,
            limitReached: actualRows >= maxRows
          }
        };
        
      } else {
        // Regular JSON format with truncation
        let dataToDisplay = { ...exportData };
        processedStructure = 'json';
        
        if (exportData.bundle && exportData.bundle.entry) {
          totalAvailableResources = exportData.bundle.entry.length;
          processedStructure = 'json bundle.entry';
          console.log('🔍 DEBUG: JSON - Processing bundle.entry with', totalAvailableResources, 'items, maxRows:', maxRows);
          
          if (exportData.bundle.entry.length > maxRows) {
            dataToDisplay.bundle = {
              ...exportData.bundle,
              entry: exportData.bundle.entry.slice(0, maxRows)
            };
            dataToDisplay.truncated = true;
            dataToDisplay.displayedResources = maxRows;
            dataToDisplay.totalResources = exportData.bundle.entry.length;
            actualRows = maxRows;
          } else {
            actualRows = exportData.bundle.entry.length;
          }
        } else if (exportData.resources) {
          processedStructure = 'json resources';
          
          if (Array.isArray(exportData.resources)) {
            totalAvailableResources = exportData.resources.length;
            processedStructure = 'json resources (array)';
            console.log('🔍 DEBUG: JSON - Processing resources array with', totalAvailableResources, 'items');
            
            if (exportData.resources.length > maxRows) {
              dataToDisplay.resources = exportData.resources.slice(0, maxRows);
              dataToDisplay.truncated = true;
              dataToDisplay.displayedResources = maxRows;
              dataToDisplay.totalResources = exportData.resources.length;
              actualRows = maxRows;
            } else {
              actualRows = exportData.resources.length;
            }
          } else {
            // Handle object with resource types
            processedStructure = 'json resources (object)';
            console.log('🔍 DEBUG: JSON - Processing resources object');
            const truncatedResources = {};
            let displayedResourceCount = 0;
            
            // Count total resources first
            for (const [type, resources] of Object.entries(exportData.resources)) {
              if (Array.isArray(resources)) {
                totalAvailableResources += resources.length;
              }
            }
            
            console.log('🔍 DEBUG: Total resource count:', totalAvailableResources, 'maxRows:', maxRows);
            
            if (totalAvailableResources > maxRows) {
              // Truncate across resource types
              for (const [type, resources] of Object.entries(exportData.resources)) {
                if (Array.isArray(resources) && displayedResourceCount < maxRows) {
                  const remainingSlots = maxRows - displayedResourceCount;
                  const slicedResources = resources.slice(0, remainingSlots);
                  truncatedResources[type] = slicedResources;
                  displayedResourceCount += slicedResources.length;
                  console.log(`🔍 DEBUG: Added ${slicedResources.length} ${type} resources (total now: ${displayedResourceCount})`);
                } else if (displayedResourceCount < maxRows) {
                  truncatedResources[type] = resources;
                  displayedResourceCount += resources.length;
                  console.log(`🔍 DEBUG: Added all ${resources.length} ${type} resources (total now: ${displayedResourceCount})`);
                }
                
                if (displayedResourceCount >= maxRows) {
                  console.log(`🔍 DEBUG: Hit maxRows limit at ${displayedResourceCount}, breaking`);
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
        
        const jsonString = JSON.stringify(dataToDisplay, null, exportSettings.prettyPrint ? 2 : 0);
        const jsonLines = jsonString.split('\n').length;
        
        console.log('🔍 DEBUG: JSON - displaying', actualRows, 'resources as', jsonLines, 'lines out of', totalAvailableResources, 'available');
        
        return {
          displayData: jsonString,
          actualDisplayedRows: actualRows,
          debugInfo: {
            format: 'json',
            structure: processedStructure,
            actualRows,
            totalAvailableResources,
            jsonLines,
            maxRows,
            limitReached: actualRows >= maxRows,
            prettyPrint: exportSettings.prettyPrint
          }
        };
      }
    } catch (error) {
      console.error('🔍 DEBUG: Error in useMemo:', error);
      return {
        displayData: `Error formatting data: ${error.message}\n\nDebug info:\n${JSON.stringify(debugInfo, null, 2)}`,
        actualDisplayedRows: 0,
        debugInfo: { error: error.message }
      };
    }
  }, [exportData, exportSettings.displayRows, exportSettings.format, exportSettings.prettyPrint, debugInfo]);
  // FIXED: Now displayRows changes will immediately update the display without server calls

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

              {/* FIXED: Preview Rows Selector - now affects only client-side display */}
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Preview Rows</InputLabel>
                <Select
                  value={exportSettings.displayRows}
                  label="Preview Rows"
                  onChange={function(e) { 
                    console.log('🔍 DEBUG: Preview rows changed to:', e.target.value);
                    handleSettingChange('displayRows', e.target.value); 
                  }}
                >
                  <MenuItem value={50}>50 rows</MenuItem>
                  <MenuItem value={100}>100 rows</MenuItem>
                  <MenuItem value={200}>200 rows</MenuItem>
                  <MenuItem value={500}>500 rows</MenuItem>
                  <MenuItem value={1000}>1000 rows</MenuItem>
                  <MenuItem value={5000}>5000 rows</MenuItem>
                  <MenuItem value={-1}>All rows</MenuItem>
                </Select>
              </FormControl>

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
                      secondary={get(exportData, 'summary.totalResources', 0)}
                    />
                  </ListItem>
                  
                  <ListItem>
                    <ListItemIcon>
                      <PreviewIcon color="secondary" />
                    </ListItemIcon>
                    <ListItemText
                      primary="Showing Resources"
                      secondary={`${getDisplayedResourceCount()} of ${get(exportData, 'summary.totalResources', 0)}`}
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
                          label={`${type}: ${count}`}
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
                    <strong>Debug:</strong> displayRows={exportSettings.displayRows}, actualDisplayedRows={actualDisplayedRows}
                  </Typography>
                  {displayDebugInfo && (
                    <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>
                      <strong>Structure:</strong> {displayDebugInfo.structure}, 
                      <strong> Available:</strong> {displayDebugInfo.totalAvailableResources}, 
                      <strong> Format:</strong> {displayDebugInfo.format}
                      {displayDebugInfo.jsonLines && (
                        <span>, <strong>JSON Lines:</strong> {displayDebugInfo.jsonLines}</span>
                      )}
                      {displayDebugInfo.finalLines && (
                        <span>, <strong>NDJSON Lines:</strong> {displayDebugInfo.finalLines}</span>
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
                      {/* Chip shows actual displayed count from state */}
                      <Chip
                        label={`${getDisplayedResourceCount()} of ${get(exportData, 'summary.totalResources', 0)} resources`}
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
    </Container>
  );
}