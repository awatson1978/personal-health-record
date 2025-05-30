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
  ListItemIcon
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
  Refresh as RefreshIcon
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
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  
  // Export settings
  const [exportSettings, setExportSettings] = useState({
    format: 'ndjson', // 'ndjson', 'bundle', 'individual'
    prettyPrint: true,
    includeMetadata: true,
    theme: 'github',
    fontSize: 14,
    wordWrap: true,
    resourceTypes: ['all'] // Array of resource types to include
  });

  // Load export preview data
  const loadExportPreview = async function() {
    setLoading(true);
    setError(null);
    
    try {
      console.log('📊 Loading export preview with filters:', filters);
      
      const result = await new Promise(function(resolve, reject) {
        Meteor.call('export.generatePreview', {
          filters: filters,
          format: exportSettings.format,
          includeMetadata: exportSettings.includeMetadata,
          resourceTypes: exportSettings.resourceTypes
        }, function(error, result) {
          if (error) reject(error);
          else resolve(result);
        });
      });
      
      setExportData(result);
      console.log('✅ Export preview loaded:', result.summary);
      
    } catch (error) {
      console.error('❌ Error loading export preview:', error);
      setError(error.reason || error.message);
    } finally {
      setLoading(false);
    }
  };

  // Load data on mount and when settings change
  useEffect(function() {
    if (Meteor.userId()) {
      loadExportPreview();
    }
  }, [Meteor.userId(), exportSettings.format, exportSettings.includeMetadata, exportSettings.resourceTypes]);

  // Handle export setting changes
  const handleSettingChange = function(key, value) {
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
    handleSettingChange('resourceTypes', typeof value === 'string' ? value.split(',') : value);
  };

  // Download the export
  const handleDownload = async function() {
    setDownloading(true);
    
    try {
      console.log('📥 Starting download with settings:', exportSettings);
      
      const result = await new Promise(function(resolve, reject) {
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
      
      // Create download
      const content = exportSettings.prettyPrint ? 
        JSON.stringify(result, null, 2) : 
        JSON.stringify(result);
        
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const timestamp = moment().format('YYYY-MM-DD-HHmm');
      const resourceTypeLabel = exportSettings.resourceTypes.includes('all') ? 'all' : exportSettings.resourceTypes.join('-');
      a.download = `facebook-fhir-export-${resourceTypeLabel}-${timestamp}.${exportSettings.format === 'ndjson' ? 'ndjson' : 'json'}`;
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setDownloadDialogOpen(false);
      console.log('✅ Download completed');
      
    } catch (error) {
      console.error('❌ Download error:', error);
      setError('Download failed: ' + (error.reason || error.message));
    } finally {
      setDownloading(false);
    }
  };

  // Format the data for display
  const getDisplayData = function() {
    if (!exportData) return '';
    
    try {
      if (exportSettings.format === 'ndjson') {
        // Convert to NDJSON format
        const lines = [];
        
        if (exportData.bundle && exportData.bundle.entry) {
          exportData.bundle.entry.forEach(function(entry) {
            if (entry.resource) {
              lines.push(JSON.stringify(entry.resource, null, exportSettings.prettyPrint ? 2 : 0));
            }
          });
        }
        
        return lines.join('\n');
      } else {
        // Regular JSON format
        return JSON.stringify(exportData, null, exportSettings.prettyPrint ? 2 : 0);
      }
    } catch (error) {
      return `Error formatting data: ${error.message}`;
    }
  };

  // Get file size estimate
  const getFileSizeEstimate = function() {
    const data = getDisplayData();
    const sizeInBytes = new Blob([data]).size;
    
    if (sizeInBytes < 1024) return `${sizeInBytes} bytes`;
    if (sizeInBytes < 1024 * 1024) return `${(sizeInBytes / 1024).toFixed(1)} KB`;
    return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
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
              startIcon={<BackIcon />}
              onClick={function() { navigate(-1); }}
            >
              Back
            </Button>
            
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
              onClick={function() { setDownloadDialogOpen(true); }}
              disabled={loading || !exportData}
            >
              Download
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

              {/* Switches */}
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
                sx={{ mb: 1, display: 'block' }}
              />
              
              <FormControlLabel
                control={
                  <Switch
                    checked={exportSettings.wordWrap}
                    onChange={function(e) { handleSettingChange('wordWrap', e.target.checked); }}
                  />
                }
                label="Word Wrap"
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
                      <CheckIcon color="success" />
                    </ListItemIcon>
                    <ListItemText
                      primary="File Size"
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
              </CardContent>
            </Card>
          )}
        </Grid>

        {/* Code Editor */}
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
                    <Chip
                      label={`${get(exportData, 'summary.totalResources', 0)} resources`}
                      color="primary"
                      size="small"
                    />
                  )}
                </Box>
                
                {filters.resourceType !== 'all' && (
                  <Alert severity="info" sx={{ mt: 1 }}>
                    <Typography variant="body2">
                      Filtered view: {filters.resourceType} resources only
                    </Typography>
                  </Alert>
                )}
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
                      useWorker: false
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

      {/* Download Confirmation Dialog */}
      <Dialog
        open={downloadDialogOpen}
        onClose={function() { 
          if (!downloading) {
            setDownloadDialogOpen(false);
          }
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Confirm Export Download
        </DialogTitle>
        <DialogContent>
          <Typography paragraph>
            Are you sure you want to download the export file?
          </Typography>
          
          <Box sx={{ bgcolor: 'grey.100', p: 2, borderRadius: 1, mb: 2 }}>
            <Typography variant="body2">
              <strong>Format:</strong> {exportSettings.format.toUpperCase()}
            </Typography>
            <Typography variant="body2">
              <strong>Resources:</strong> {get(exportData, 'summary.totalResources', 0)}
            </Typography>
            <Typography variant="body2">
              <strong>File Size:</strong> {getFileSizeEstimate()}
            </Typography>
            <Typography variant="body2">
              <strong>Pretty Print:</strong> {exportSettings.prettyPrint ? 'Yes' : 'No'}
            </Typography>
          </Box>

          <Alert severity="info">
            <Typography variant="body2">
              This file will contain your personal health data in FHIR format. 
              Please store it securely and only share with authorized healthcare providers.
            </Typography>
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={function() { setDownloadDialogOpen(false); }}
            disabled={downloading}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleDownload}
            variant="contained"
            disabled={downloading}
            startIcon={downloading ? null : <DownloadIcon />}
          >
            {downloading ? 'Downloading...' : 'Download Export'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}