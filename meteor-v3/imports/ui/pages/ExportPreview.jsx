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
  Paper,
  Tabs,
  Tab
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
  Speed as SpeedIcon,
  ViewList as ViewListIcon,
  ViewModule as ViewModuleIcon
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
  
  // FIXED: New approach - use both display limit and rendering mode
  const [exportSettings, setExportSettings] = useState({
    format: 'ndjson',
    prettyPrint: true,
    includeMetadata: true,
    theme: 'github',
    fontSize: 14,
    wordWrap: false,
    resourceTypes: ['all'],
    displayMode: 'smart', // 'smart', 'ace-editor', 'simple-text', 'summary-only'
    displayLimit: 10000,   // For ACE editor mode
    previewLimit: 100000   // For server requests
  });

  // Filename state
  const [filename, setFilename] = useState(function() {
    return `fhir-export-${moment().format('YYYY-MM-DD-HHmm')}`;
  });

  // Performance warning dialog state
  const [performanceDialogOpen, setPerformanceDialogOpen] = useState(false);
  const [pendingDisplayLimit, setPendingDisplayLimit] = useState(null);

  // Tab state for different display modes
  const [activeTab, setActiveTab] = useState(0);

  // FIXED: Smart display mode options
  const getDisplayModeOptions = function() {
    if (!exportData || !exportData.summary) return [];
    
    const totalResources = exportData.summary.totalResources || 0;
    
    return [
      {
        mode: 'smart',
        label: 'Smart Preview',
        description: 'Automatically choose best display method',
        recommended: true,
        maxResources: 1000000
      },
      {
        mode: 'ace-editor',
        label: 'Code Editor',
        description: 'Full-featured code editor (slower for large datasets)',
        recommended: totalResources <= 10000,
        maxResources: 50000
      },
      {
        mode: 'simple-text',
        label: 'Simple Text',
        description: 'Plain text display (faster for large datasets)',
        recommended: totalResources > 10000,
        maxResources: 1000000
      },
      {
        mode: 'summary-only',
        label: 'Summary Only',
        description: 'Show statistics without content',
        recommended: totalResources > 100000,
        maxResources: Infinity
      }
    ];
  };

  // FIXED: Determine optimal display mode automatically
  const getOptimalDisplayMode = function() {
    if (!exportData || !exportData.summary) return 'smart';
    
    const totalResources = exportData.summary.totalResources || 0;
    
    if (totalResources <= 1000) return 'ace-editor';
    if (totalResources <= 50000) return 'simple-text';
    return 'summary-only';
  };

  // Load export preview data
  const loadExportPreview = async function() {
    setLoading(true);
    setError(null);
    setDebugInfo(null);
    
    try {
      console.log('🔍 DEBUG: Starting export preview load...');
      console.log('🔍 DEBUG: Preview limit:', exportSettings.previewLimit);
      
      // First, get basic stats
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
            previewLimit: exportSettings.previewLimit
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
        
        // FIXED: Auto-adjust display mode if needed
        if (exportSettings.displayMode === 'smart') {
          const optimalMode = getOptimalDisplayMode();
          if (optimalMode !== 'smart') {
            console.log(`🔍 Auto-selecting display mode: ${optimalMode} for ${result.summary.totalResources} resources`);
            setExportSettings(function(prev) {
              return { ...prev, displayMode: optimalMode };
            });
          }
        }
        
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
  }, [Meteor.userId(), exportSettings.format, exportSettings.includeMetadata, exportSettings.resourceTypes, exportSettings.previewLimit]);

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

  // FIXED: Handle display limit change with performance warning
  const handleDisplayLimitChange = function(newValue) {
    if (newValue > 50000 && !performanceWarningShown) {
      setPendingDisplayLimit(newValue);
      setPerformanceDialogOpen(true);
      return;
    }
    
    handleSettingChange('displayLimit', newValue);
  };

  // Confirm performance warning
  const confirmPerformanceChange = function() {
    if (pendingDisplayLimit !== null) {
      handleSettingChange('displayLimit', pendingDisplayLimit);
      setPerformanceWarningShown(true);
      setPerformanceDialogOpen(false);
      setPendingDisplayLimit(null);
    }
  };

  // Cancel performance warning
  const cancelPerformanceChange = function() {
    setPerformanceDialogOpen(false);
    setPendingDisplayLimit(null);
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

  // FIXED: Generate display data based on mode and limits
  const generateDisplayData = function() {
    if (!exportData) {
      return {
        content: '// No export data available\n// Debug info below:\n' + 
                JSON.stringify(debugInfo, null, 2),
        actualDisplayedRows: 0,
        isTruncated: false,
        renderingInfo: { mode: 'debug', reason: 'No export data' }
      };
    }
    
    try {
      const totalResources = exportData.summary?.totalResources || 0;
      const currentDisplayMode = exportSettings.displayMode === 'smart' ? getOptimalDisplayMode() : exportSettings.displayMode;
      
      console.log('🔍 DISPLAY: Generating display data', {
        totalResources,
        displayMode: currentDisplayMode,
        displayLimit: exportSettings.displayLimit,
        format: exportSettings.format
      });
      
      // FIXED: Handle different display modes
      if (currentDisplayMode === 'summary-only') {
        return generateSummaryDisplay();
      }
      
      // For other modes, generate the actual content
      let allItems = [];
      let actualDisplayedRows = 0;
      let isTruncated = false;
      
      // Extract resources from export data
      if (exportData.bundle && exportData.bundle.entry) {
        allItems = exportData.bundle.entry.map(function(entry) { return entry.resource; });
      } else if (exportData.resources) {
        if (Array.isArray(exportData.resources)) {
          allItems = exportData.resources;
        } else {
          // Handle object with resource types
          for (const [type, resources] of Object.entries(exportData.resources)) {
            if (Array.isArray(resources)) {
              allItems = allItems.concat(resources);
            }
          }
        }
      }
      
      console.log('🔍 DISPLAY: Found', allItems.length, 'total items');
      
      // Apply display limit for ACE editor mode
      let itemsToDisplay = allItems;
      if (currentDisplayMode === 'ace-editor' && exportSettings.displayLimit < allItems.length) {
        itemsToDisplay = allItems.slice(0, exportSettings.displayLimit);
        isTruncated = true;
        actualDisplayedRows = exportSettings.displayLimit;
        console.log(`🔍 DISPLAY: Truncated to ${actualDisplayedRows} items for ACE editor`);
      } else {
        actualDisplayedRows = allItems.length;
      }
      
      // Generate content string
      let content = '';
      
      if (exportSettings.format === 'ndjson') {
        const lines = itemsToDisplay.map(function(item) {
          return JSON.stringify(item, null, 0);
        });
        
        if (isTruncated) {
          lines.push(`// ... ${allItems.length - actualDisplayedRows} more resources (limited to ${exportSettings.displayLimit.toLocaleString()} for editor preview)`);
        }
        
        content = lines.join('\n');
      } else {
        let dataToDisplay = {};
        
        if (exportSettings.format === 'bundle') {
          dataToDisplay = {
            resourceType: 'Bundle',
            type: 'collection',
            total: actualDisplayedRows,
            entry: itemsToDisplay.map(function(item) {
              return {
                resource: item
              };
            })
          };
          
          if (isTruncated) {
            dataToDisplay.truncated = true;
            dataToDisplay.displayInfo = {
              shown: actualDisplayedRows,
              total: allItems.length,
              reason: 'Limited for editor performance'
            };
          }
        } else {
          dataToDisplay = {
            format: 'individual',
            resources: itemsToDisplay,
            metadata: exportSettings.includeMetadata ? {
              resourceCount: actualDisplayedRows,
              totalAvailable: allItems.length,
              truncated: isTruncated
            } : null
          };
        }
        
        content = JSON.stringify(dataToDisplay, null, exportSettings.prettyPrint ? 2 : 0);
      }
      
      return {
        content: content,
        actualDisplayedRows: actualDisplayedRows,
        totalAvailable: allItems.length,
        isTruncated: isTruncated,
        renderingInfo: {
          mode: currentDisplayMode,
          format: exportSettings.format,
          contentLength: content.length,
          lines: content.split('\n').length
        }
      };
      
    } catch (error) {
      console.error('🔍 DISPLAY: Error generating display data:', error);
      return {
        content: `Error generating display: ${error.message}\n\nDebug info:\n${JSON.stringify(debugInfo, null, 2)}`,
        actualDisplayedRows: 0,
        isTruncated: false,
        renderingInfo: { mode: 'error', error: error.message }
      };
    }
  };

  // Generate summary-only display
  const generateSummaryDisplay = function() {
    const summary = exportData.summary || {};
    const resourceCounts = summary.resourceCounts || {};
    
    const summaryContent = {
      exportSummary: {
        totalResources: summary.totalResources || 0,
        totalAvailableInDb: summary.totalAvailableInDb || 0,
        format: summary.format || 'unknown',
        generatedAt: summary.generatedAt,
        previewMode: true,
        resourceBreakdown: resourceCounts
      },
      note: 'This is a summary view. Use a different display mode to see the actual data.',
      displayModeInfo: 'Summary mode is recommended for datasets with more than 100,000 resources to prevent browser performance issues.',
      downloadNote: 'The full download will include all data regardless of display mode.'
    };
    
    return {
      content: JSON.stringify(summaryContent, null, 2),
      actualDisplayedRows: summary.totalResources || 0,
      totalAvailable: summary.totalResources || 0,
      isTruncated: false,
      renderingInfo: {
        mode: 'summary-only',
        reason: 'Large dataset - showing summary only'
      }
    };
  };

  const displayData = generateDisplayData();

  // Get file size estimate
  const getFileSizeEstimate = function() {
    const sizeInBytes = new Blob([displayData.content]).size;
    
    if (sizeInBytes < 1024) return `${sizeInBytes} bytes`;
    if (sizeInBytes < 1024 * 1024) return `${(sizeInBytes / 1024).toFixed(1)} KB`;
    return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // FIXED: Render content based on display mode
  const renderContent = function() {
    const currentDisplayMode = exportSettings.displayMode === 'smart' ? getOptimalDisplayMode() : exportSettings.displayMode;
    
    if (loading) {
      return (
        <Box sx={{ p: 3 }}>
          <LinearProgress sx={{ mb: 2 }} />
          <Typography variant="body2" color="text.secondary" align="center">
            Loading export preview...
          </Typography>
        </Box>
      );
    }
    
    if (!exportData) {
      return (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <WarningIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            No Export Data
          </Typography>
          <Typography variant="body2" color="text.secondary">
            No data available for export with the current filters.
          </Typography>
        </Box>
      );
    }
    
    if (currentDisplayMode === 'ace-editor') {
      return (
        <AceEditor
          mode="json"
          theme={exportSettings.theme}
          name="export-preview-editor"
          editorProps={{ $blockScrolling: true }}
          fontSize={exportSettings.fontSize}
          showPrintMargin={true}
          showGutter={true}
          highlightActiveLine={true}
          value={displayData.content}
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
      );
    } else {
      // Simple text display for large datasets
      return (
        <Box sx={{ height: '100%', overflow: 'auto', p: 2, bgcolor: 'grey.50' }}>
          <pre style={{
            fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
            fontSize: `${exportSettings.fontSize}px`,
            margin: 0,
            whiteSpace: exportSettings.wordWrap ? 'pre-wrap' : 'pre',
            wordBreak: exportSettings.wordWrap ? 'break-word' : 'normal'
          }}>
            {displayData.content}
          </pre>
        </Box>
      );
    }
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

  const currentDisplayMode = exportSettings.displayMode === 'smart' ? getOptimalDisplayMode() : exportSettings.displayMode;

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

              {/* FIXED: Display Mode Selection */}
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Display Mode</InputLabel>
                <Select
                  value={exportSettings.displayMode}
                  label="Display Mode"
                  onChange={function(e) { handleSettingChange('displayMode', e.target.value); }}
                >
                  {getDisplayModeOptions().map(function(option) {
                    return (
                      <MenuItem key={option.mode} value={option.mode}>
                        <Box display="flex" alignItems="center" justifyContent="space-between" width="100%">
                          <span>{option.label}</span>
                          {option.recommended && (
                            <CheckIcon sx={{ fontSize: 16, color: 'success.main', ml: 1 }} />
                          )}
                        </Box>
                      </MenuItem>
                    );
                  })}
                </Select>
              </FormControl>

              {/* FIXED: Display Limit (only for ACE editor mode) */}
              {currentDisplayMode === 'ace-editor' && (
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Editor Display Limit</InputLabel>
                  <Select
                    value={exportSettings.displayLimit}
                    label="Editor Display Limit"
                    onChange={function(e) { handleDisplayLimitChange(e.target.value); }}
                  >
                    <MenuItem value={1000}>1,000 resources</MenuItem>
                    <MenuItem value={5000}>5,000 resources</MenuItem>
                    <MenuItem value={10000}>10,000 resources</MenuItem>
                    <MenuItem value={25000}>25,000 resources</MenuItem>
                    <MenuItem value={50000}>50,000 resources</MenuItem>
                    <MenuItem value={100000}>100,000 resources</MenuItem>
                  </Select>
                </FormControl>
              )}

              {/* FIXED: Preview Server Limit */}
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Preview Server Limit</InputLabel>
                <Select
                  value={exportSettings.previewLimit}
                  label="Preview Server Limit"
                  onChange={function(e) { handleSettingChange('previewLimit', e.target.value); }}
                >
                  <MenuItem value={10000}>10,000 resources</MenuItem>
                  <MenuItem value={50000}>50,000 resources</MenuItem>
                  <MenuItem value={100000}>100,000 resources</MenuItem>
                  <MenuItem value={500000}>500,000 resources</MenuItem>
                  <MenuItem value={1000000}>1,000,000 resources</MenuItem>
                </Select>
              </FormControl>

              {/* Show performance warning for current selection */}
              {currentDisplayMode === 'ace-editor' && exportSettings.displayLimit > 25000 && (
                <Alert severity="warning" sx={{ mb: 2, fontSize: '0.75rem' }}>
                  <Typography variant="caption">
                    Large display limit may slow down the code editor
                  </Typography>
                </Alert>
              )}

              {/* Editor Theme (only for ACE mode) */}
              {currentDisplayMode === 'ace-editor' && (
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
              )}

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
                      secondary={`${displayData.actualDisplayedRows.toLocaleString()} of ${get(exportData, 'summary.totalResources', 0).toLocaleString()}`}
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
                      <ViewModuleIcon color="secondary" />
                    </ListItemIcon>
                    <ListItemText
                      primary="Display Mode"
                      secondary={currentDisplayMode.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
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

                {/* Enhanced debug info */}
                <Box sx={{ mt: 2, p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
                  <Typography variant="caption" component="div">
                    <strong>Mode:</strong> {currentDisplayMode}, 
                    <strong> Format:</strong> {exportSettings.format}
                  </Typography>
                  <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>
                    <strong>Server Limit:</strong> {exportSettings.previewLimit.toLocaleString()}, 
                    {currentDisplayMode === 'ace-editor' && (
                      <span><strong> Editor Limit:</strong> {exportSettings.displayLimit.toLocaleString()}</span>
                    )}
                  </Typography>
                  {displayData.isTruncated && (
                    <Typography variant="caption" component="div" sx={{ mt: 0.5, color: 'warning.main' }}>
                      <strong>Truncated:</strong> Display limited for performance
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
                        label={`${displayData.actualDisplayedRows.toLocaleString()} of ${get(exportData, 'summary.totalResources', 0).toLocaleString()} resources`}
                        color="primary"
                        size="small"
                      />
                      {displayData.isTruncated && (
                        <Chip
                          label="Preview Limited"
                          color="warning"
                          size="small"
                        />
                      )}
                      <Chip
                        label={currentDisplayMode.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        color="secondary"
                        size="small"
                      />
                    </Box>
                  )}
                </Box>
              </Box>

              <Box sx={{ flexGrow: 1, position: 'relative' }}>
                {renderContent()}
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
              You've selected to display <strong>{pendingDisplayLimit?.toLocaleString()}</strong> resources in the code editor, which may cause:
            </Typography>
            
            <Box component="ul" sx={{ pl: 2, mb: 2 }}>
              <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
                Slow browser performance while rendering
              </Typography>
              <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
                High memory usage (especially on mobile devices)
              </Typography>
              {pendingDisplayLimit >= 100000 && (
                <Typography component="li" variant="body2" sx={{ mb: 0.5, color: 'error.main' }}>
                  <strong>Browser may freeze</strong> for 10+ seconds during rendering
                </Typography>
              )}
            </Box>

            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography variant="body2">
                Consider using "Simple Text" display mode for better performance with large datasets.
              </Typography>
            </Alert>

            <Typography variant="body2" color="text.secondary">
              The full download will always include all your data regardless of display settings.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelPerformanceChange}>
            Cancel
          </Button>
          <Button 
            onClick={confirmPerformanceChange}
            color="warning"
            variant="contained"
          >
            Continue Anyway
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}