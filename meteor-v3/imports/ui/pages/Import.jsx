// meteor-v3/imports/ui/pages/Import.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { get } from 'lodash';
import moment from 'moment';
import { Session } from 'meteor/session';

import {
  Container,
  Paper,
  Typography,
  Box,
  Button,
  Alert,
  AlertTitle,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Grid,
  TextField,
  FormControlLabel,
  Checkbox,
  Tabs,
  Tab,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress
} from '@mui/material';

import {
  CloudUpload as UploadIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Info as InfoIcon,
  Timeline as TimelineIcon,
  Analytics as AnalyticsIcon,
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  InsertDriveFile as FileIcon,
  Search as SearchIcon,
  ExpandMore as ExpandMoreIcon
} from '@mui/icons-material';

import { useNavigate } from 'react-router-dom';
import { ImportJobs } from '../../api/fhir/collections';

function Import() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  
  // Restore active step from session
  const [activeStep, setActiveStep] = useState(function() {
    return Session.get('import.activeStep') || 0;
  });
  
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  
  // Directory scanning states
  const [importMode, setImportMode] = useState('upload'); // 'upload' or 'directory'
  const [directoryPath, setDirectoryPath] = useState('');
  const [zipPath, setZipPath] = useState('');
  const [scanning, setScanning] = useState(false);
  const [inventory, setInventory] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [tabValue, setTabValue] = useState(0);

  const { importJobs, isLoading } = useTracker(function() {
    const handle = Meteor.subscribe('user.imports');
    const importJobs = ImportJobs.find(
      { userId: Meteor.userId() },
      { sort: { createdAt: -1 } }
    ).fetch();

    return {
      importJobs,
      isLoading: !handle.ready()
    };
  }, []);

  // Persist active step to session
  useEffect(function() {
    Session.set('import.activeStep', activeStep);
  }, [activeStep]);

  // Auto-advance steps based on job status
  useEffect(function() {
    const completedJobs = importJobs.filter(function(job) { 
      return job.status === 'completed'; 
    });
    
    if (completedJobs.length > 0 && activeStep < 3) {
      setActiveStep(3);
    } else if (importJobs.some(function(job) { 
      return job.status === 'processing'; 
    }) && activeStep < 2) {
      setActiveStep(2);
    }
  }, [importJobs, activeStep]);

  const steps = [
    {
      label: 'Download Facebook Data',
      description: 'Export your Facebook information',
      completed: false
    },
    {
      label: 'Upload or Scan Data',
      description: 'Upload files or scan directory/ZIP',
      completed: false
    },
    {
      label: 'Process & Convert',
      description: 'Convert to FHIR health records',
      completed: false
    },
    {
      label: 'Review Results',
      description: 'Explore your health timeline',
      completed: false
    }
  ];

  const handleFileUpload = async function(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['.zip', '.json'];
    const fileExt = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowedTypes.includes(fileExt)) {
      setUploadError(`File type ${fileExt} not supported. Please upload a .zip or .json file.`);
      return;
    }

    // Validate file size (5GB limit)
    const maxSize = 5 * 1024 * 1024 * 1024;
    if (file.size > maxSize) {
      setUploadError(`File size ${(file.size / 1024 / 1024 / 1024).toFixed(1)}GB exceeds the 5GB limit.`);
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const reader = new FileReader();
      reader.onload = async function(e) {
        const base64Data = e.target.result.split(',')[1];
        
        try {
          const jobId = await new Promise(function(resolve, reject) {
            Meteor.call('facebook.uploadAndProcess', file.name, base64Data, function(error, result) {
              if (error) reject(error);
              else resolve(result);
            });
          });

          console.log('Upload successful, job ID:', jobId);
          setActiveStep(2);
          
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
          
        } catch (error) {
          console.error('Upload error:', error);
          setUploadError(error.reason || 'Upload failed. Please try again.');
        } finally {
          setUploading(false);
        }
      };

      reader.onerror = function() {
        setUploadError('Failed to read file. Please try again.');
        setUploading(false);
      };

      reader.readAsDataURL(file);
    } catch (error) {
      console.error('File processing error:', error);
      setUploadError('Failed to process file. Please try again.');
      setUploading(false);
    }
  };

  const handleScanDirectory = async function() {
    if (!directoryPath.trim()) {
      setUploadError('Please enter a directory path');
      return;
    }

    setScanning(true);
    setUploadError(null);
    setInventory(null);

    try {
      const result = await new Promise(function(resolve, reject) {
        Meteor.call('facebook.scanDirectory', directoryPath.trim(), function(error, result) {
          if (error) reject(error);
          else resolve(result);
        });
      });

      setInventory(result);
      setSelectedFiles(result.summary.testParseRecommendation?.suggested?.map(function(file) { 
        return file.path; 
      }) || []);

    } catch (error) {
      console.error('Directory scan error:', error);
      setUploadError(error.reason || 'Failed to scan directory. Please check the path and try again.');
    } finally {
      setScanning(false);
    }
  };

  const handleScanZip = async function() {
    if (!zipPath.trim()) {
      setUploadError('Please enter a ZIP file path');
      return;
    }

    setScanning(true);
    setUploadError(null);
    setInventory(null);

    try {
      const result = await new Promise(function(resolve, reject) {
        Meteor.call('facebook.scanZipFile', zipPath.trim(), function(error, result) {
          if (error) reject(error);
          else resolve(result);
        });
      });

      setInventory(result);
      setSelectedFiles(result.summary.testParseRecommendation?.suggested?.map(function(file) { 
        return file.path; 
      }) || []);

    } catch (error) {
      console.error('ZIP scan error:', error);
      setUploadError(error.reason || 'Failed to scan ZIP file. Please check the path and try again.');
    } finally {
      setScanning(false);
    }
  };

  const handleProcessDirectory = async function() {
    if (!inventory || selectedFiles.length === 0) {
      setUploadError('Please select files to process');
      return;
    }

    try {
      const sourcePath = inventory.dirPath || inventory.filePath;
      const jobId = await new Promise(function(resolve, reject) {
        Meteor.call('facebook.processFromPath', sourcePath, selectedFiles, function(error, result) {
          if (error) reject(error);
          else resolve(result);
        });
      });

      console.log('Directory processing started, job ID:', jobId);
      setActiveStep(2);
      
    } catch (error) {
      console.error('Directory processing error:', error);
      setUploadError(error.reason || 'Failed to start processing. Please try again.');
    }
  };

  const toggleFileSelection = function(filePath) {
    setSelectedFiles(function(prev) {
      if (prev.includes(filePath)) {
        return prev.filter(function(path) { return path !== filePath; });
      } else {
        return [...prev, filePath];
      }
    });
  };

  const selectAllInCategory = function(category) {
    const categoryFiles = get(inventory, `categories.${category}`, []);
    const categoryPaths = categoryFiles.map(function(file) { return file.path; });
    
    setSelectedFiles(function(prev) {
      const otherFiles = prev.filter(function(path) { 
        return !categoryPaths.includes(path); 
      });
      return [...otherFiles, ...categoryPaths];
    });
  };

  const deselectAllInCategory = function(category) {
    const categoryFiles = get(inventory, `categories.${category}`, []);
    const categoryPaths = categoryFiles.map(function(file) { return file.path; });
    
    setSelectedFiles(function(prev) {
      return prev.filter(function(path) { 
        return !categoryPaths.includes(path); 
      });
    });
  };

  const handleDeleteImport = async function(jobId) {
    try {
      await new Promise(function(resolve, reject) {
        Meteor.call('facebook.deleteImport', jobId, function(error, result) {
          if (error) reject(error);
          else resolve(result);
        });
      });
      setDeleteDialogOpen(false);
      setSelectedJob(null);
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  const getStatusColor = function(status) {
    switch (status) {
      case 'completed': return 'success';
      case 'failed': return 'error';
      case 'processing': return 'warning';
      default: return 'default';
    }
  };

  const getStatusIcon = function(status) {
    switch (status) {
      case 'completed': return <CheckIcon color="success" />;
      case 'failed': return <ErrorIcon color="error" />;
      case 'processing': return <RefreshIcon color="warning" />;
      default: return <InfoIcon />;
    }
  };

  const completedJobs = importJobs.filter(function(job) { 
    return job.status === 'completed'; 
  });
  const hasCompletedImports = completedJobs.length > 0;

  const formatBytes = function(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const renderFileInventory = function() {
    if (!inventory) return null;

    const categories = ['demographics', 'friends', 'posts', 'messages', 'media', 'other'];
    
    return (
      <Box sx={{ mt: 2 }}>
        <Typography variant="h6" gutterBottom>
          File Inventory ({inventory.summary.totalFiles} files, {inventory.summary.totalSizeFormatted})
        </Typography>

        {inventory.summary.testParseRecommendation && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <AlertTitle>Recommended Test Parse</AlertTitle>
            <Typography variant="body2">
              {inventory.summary.testParseRecommendation.reason}
            </Typography>
          </Alert>
        )}

        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Selected: {selectedFiles.length} files
          </Typography>
        </Box>

        {categories.map(function(category) {
          const categoryFiles = get(inventory, `categories.${category}`, []);
          if (categoryFiles.length === 0) return null;

          const selectedInCategory = categoryFiles.filter(function(file) {
            return selectedFiles.includes(file.path);
          }).length;

          return (
            <Accordion key={category} defaultExpanded={category === 'posts' || category === 'friends'}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box display="flex" justifyContent="space-between" alignItems="center" width="100%">
                  <Typography variant="subtitle1" sx={{ textTransform: 'capitalize' }}>
                    {category} ({categoryFiles.length})
                  </Typography>
                  <Box display="flex" alignItems="center" sx={{ mr: 2 }}>
                    <Chip 
                      size="small" 
                      label={`${selectedInCategory}/${categoryFiles.length} selected`}
                      color={selectedInCategory > 0 ? 'primary' : 'default'}
                    />
                    <Button
                      size="small"
                      onClick={function(e) {
                        e.stopPropagation();
                        if (selectedInCategory === categoryFiles.length) {
                          deselectAllInCategory(category);
                        } else {
                          selectAllInCategory(category);
                        }
                      }}
                      sx={{ ml: 1 }}
                    >
                      {selectedInCategory === categoryFiles.length ? 'Deselect All' : 'Select All'}
                    </Button>
                  </Box>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <List dense>
                  {categoryFiles.map(function(file, index) {
                    const isSelected = selectedFiles.includes(file.path);
                    
                    return (
                      <ListItem key={index} sx={{ pl: 0 }}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={isSelected}
                              onChange={function() { toggleFileSelection(file.path); }}
                            />
                          }
                          label={
                            <Box>
                              <Typography variant="body2">
                                {file.name}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {file.sizeFormatted} • {file.path}
                              </Typography>
                            </Box>
                          }
                          sx={{ width: '100%' }}
                        />
                      </ListItem>
                    );
                  })}
                </List>
              </AccordionDetails>
            </Accordion>
          );
        })}

        <Box sx={{ mt: 2 }}>
          <Button
            variant="contained"
            onClick={handleProcessDirectory}
            disabled={selectedFiles.length === 0}
            startIcon={<SearchIcon />}
          >
            Process Selected Files ({selectedFiles.length})
          </Button>
        </Box>
      </Box>
    );
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      {/* Header */}
      <Box mb={4}>
        <Typography variant="h3" component="h1" gutterBottom>
          Import Facebook Data
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Transform your Facebook posts into a personal health timeline using FHIR standards.
        </Typography>
      </Box>

      <Grid container spacing={4}>
        {/* Left Column - Import Process */}
        <Grid item xs={12} lg={8}>
          {/* Import Steps */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h5" gutterBottom>
              Import Process
            </Typography>
            
            <Stepper activeStep={activeStep} orientation="vertical">
              {steps.map(function(step, index) {
                return (
                  <Step key={step.label}>
                    <StepLabel>
                      <Typography variant="h6">{step.label}</Typography>
                    </StepLabel>
                    <StepContent>
                      <Typography color="text.secondary" paragraph>
                        {step.description}
                      </Typography>
                      
                      {index === 0 && (
                        <Box>
                          <Alert severity="info" sx={{ mb: 2 }}>
                            <AlertTitle>How to Download Your Facebook Data</AlertTitle>
                            <Typography variant="body2" paragraph>
                              1. Go to Facebook Settings → Your Facebook Information → Download Your Information
                            </Typography>
                            <Typography variant="body2" paragraph>
                              2. Select "JSON" format and "All of my data" or specific categories
                            </Typography>
                            <Typography variant="body2">
                              3. Click "Create File" and wait for the download link
                            </Typography>
                          </Alert>
                          <Button 
                            variant="contained" 
                            onClick={function() { setActiveStep(1); }}
                            sx={{ mr: 1 }}
                          >
                            I Have My Data
                          </Button>
                        </Box>
                      )}

                      {index === 1 && (
                        <Box>
                          <Tabs 
                            value={tabValue} 
                            onChange={function(e, newValue) { setTabValue(newValue); }}
                            sx={{ mb: 2 }}
                          >
                            <Tab label="Upload File" />
                            <Tab label="Scan Directory" />
                            <Tab label="Scan ZIP File" />
                          </Tabs>

                          {uploadError && (
                            <Alert severity="error" sx={{ mb: 2 }}>
                              {uploadError}
                            </Alert>
                          )}

                          {/* Upload Tab */}
                          {tabValue === 0 && (
                            <Box>
                              <Alert severity="warning" sx={{ mb: 2 }}>
                                <AlertTitle>Upload Mode</AlertTitle>
                                <Typography variant="body2">
                                  Upload your Facebook data as a .zip file or individual .json files.
                                  Maximum file size: 5GB.
                                </Typography>
                              </Alert>

                              <Box sx={{ mb: 2 }}>
                                <input
                                  ref={fileInputRef}
                                  type="file"
                                  accept=".zip,.json"
                                  onChange={handleFileUpload}
                                  style={{ display: 'none' }}
                                  id="file-upload"
                                />
                                <label htmlFor="file-upload">
                                  <Button
                                    variant="contained"
                                    component="span"
                                    startIcon={<UploadIcon />}
                                    disabled={uploading}
                                    size="large"
                                  >
                                    {uploading ? 'Uploading...' : 'Choose File'}
                                  </Button>
                                </label>
                              </Box>

                              {uploading && (
                                <Box sx={{ width: '100%', mb: 2 }}>
                                  <LinearProgress />
                                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                    Uploading and processing your data...
                                  </Typography>
                                </Box>
                              )}
                            </Box>
                          )}

                          {/* Directory Scan Tab */}
                          {tabValue === 1 && (
                            <Box>
                              <Alert severity="info" sx={{ mb: 2 }}>
                                <AlertTitle>Directory Scan Mode</AlertTitle>
                                <Typography variant="body2">
                                  Scan a local directory containing your extracted Facebook data.
                                  This allows you to review and select specific files before processing.
                                </Typography>
                              </Alert>

                              <Box display="flex" alignItems="center" sx={{ mb: 2 }}>
                                <TextField
                                  fullWidth
                                  label="Directory Path"
                                  value={directoryPath}
                                  onChange={function(e) { setDirectoryPath(e.target.value); }}
                                  placeholder="/Users/username/Downloads/facebook-export"
                                  sx={{ mr: 1 }}
                                />
                                <Button
                                  variant="contained"
                                  onClick={handleScanDirectory}
                                  disabled={scanning}
                                  startIcon={scanning ? <CircularProgress size={20} /> : <FolderIcon />}
                                >
                                  {scanning ? 'Scanning...' : 'Scan'}
                                </Button>
                              </Box>

                              {renderFileInventory()}
                            </Box>
                          )}

                          {/* ZIP Scan Tab */}
                          {tabValue === 2 && (
                            <Box>
                              <Alert severity="info" sx={{ mb: 2 }}>
                                <AlertTitle>ZIP Scan Mode</AlertTitle>
                                <Typography variant="body2">
                                  Scan a ZIP file containing your Facebook data export.
                                  This allows you to review the contents before extracting and processing.
                                </Typography>
                              </Alert>

                              <Box display="flex" alignItems="center" sx={{ mb: 2 }}>
                                <TextField
                                  fullWidth
                                  label="ZIP File Path"
                                  value={zipPath}
                                  onChange={function(e) { setZipPath(e.target.value); }}
                                  placeholder="/Users/username/Downloads/facebook-data.zip"
                                  sx={{ mr: 1 }}
                                />
                                <Button
                                  variant="contained"
                                  onClick={handleScanZip}
                                  disabled={scanning}
                                  startIcon={scanning ? <CircularProgress size={20} /> : <FileIcon />}
                                >
                                  {scanning ? 'Scanning...' : 'Scan'}
                                </Button>
                              </Box>

                              {renderFileInventory()}
                            </Box>
                          )}
                        </Box>
                      )}

                      {index === 2 && (
                        <Box>
                          <Alert severity="info" sx={{ mb: 2 }}>
                            <AlertTitle>Processing Your Data</AlertTitle>
                            <Typography variant="body2">
                              We're converting your Facebook posts into FHIR-compliant health records.
                              This may take a few minutes depending on the amount of data.
                            </Typography>
                          </Alert>
                          
                          {hasCompletedImports && (
                            <Button 
                              variant="contained" 
                              onClick={function() { setActiveStep(3); }}
                              sx={{ mr: 1 }}
                            >
                              View Results
                            </Button>
                          )}
                        </Box>
                      )}

                      {index === 3 && hasCompletedImports && (
                        <Box>
                          <Alert severity="success" sx={{ mb: 2 }}>
                            <AlertTitle>Import Complete!</AlertTitle>
                            <Typography variant="body2">
                              Your Facebook data has been successfully converted to health records.
                              Explore your timeline to see the results.
                            </Typography>
                          </Alert>
                          
                          <Button 
                            variant="contained" 
                            startIcon={<TimelineIcon />}
                            onClick={function() { navigate('/timeline'); }}
                            sx={{ mr: 1 }}
                          >
                            View Timeline
                          </Button>
                          <Button 
                            variant="outlined" 
                            startIcon={<AnalyticsIcon />}
                            onClick={function() { navigate('/analytics'); }}
                          >
                            View Analytics
                          </Button>
                        </Box>
                      )}
                    </StepContent>
                  </Step>
                );
              })}
            </Stepper>
          </Paper>
        </Grid>

        {/* Right Column - Import History */}
        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Import History
            </Typography>
            
            {isLoading ? (
              <Box display="flex" justifyContent="center" p={2}>
                <LinearProgress sx={{ width: '100%' }} />
              </Box>
            ) : importJobs.length === 0 ? (
              <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                No imports yet
              </Typography>
            ) : (
              <List>
                {importJobs.map(function(job, index) {
                  return (
                    <React.Fragment key={job._id}>
                      <ListItem>
                        <ListItemIcon>
                          {getStatusIcon(job.status)}
                        </ListItemIcon>
                        <ListItemText
                          primary={job.filename}
                          secondary={
                            <Box>
                              <Typography variant="caption" display="block">
                                {moment(job.createdAt).format('MMM DD, YYYY HH:mm')}
                              </Typography>
                              {job.status === 'processing' && job.progress && (
                                <Box sx={{ mt: 1 }}>
                                  <LinearProgress 
                                    variant="determinate" 
                                    value={job.progress} 
                                    size="small"
                                  />
                                  <Typography variant="caption">
                                    {job.progress}% complete
                                    {job.processedRecords && job.totalRecords && (
                                      <span> ({job.processedRecords}/{job.totalRecords} records)</span>
                                    )}
                                  </Typography>
                                </Box>
                              )}
                              {job.results && (
                                <Box sx={{ mt: 1 }}>
                                  <Chip
                                    size="small"
                                    label={`${get(job.results, 'communications', 0)} posts`}
                                    sx={{ mr: 0.5, mb: 0.5 }}
                                  />
                                  <Chip
                                    size="small"
                                    label={`${get(job.results, 'clinicalImpressions', 0)} health records`}
                                    sx={{ mr: 0.5, mb: 0.5 }}
                                  />
                                </Box>
                              )}
                            </Box>
                          }
                        />
                        <ListItemSecondaryAction>
                          <Box display="flex" alignItems="center">
                            <Chip
                              label={job.status}
                              size="small"
                              color={getStatusColor(job.status)}
                              sx={{ mr: 1 }}
                            />
                            {(job.status === 'completed' || job.status === 'failed') && (
                              <IconButton
                                edge="end"
                                size="small"
                                onClick={function() {
                                  setSelectedJob(job);
                                  setDeleteDialogOpen(true);
                                }}
                              >
                                <DeleteIcon />
                              </IconButton>
                            )}
                          </Box>
                        </ListItemSecondaryAction>
                      </ListItem>
                      {index < importJobs.length - 1 && <Divider />}
                    </React.Fragment>
                  );
                })}
              </List>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={function() { setDeleteDialogOpen(false); }}
      >
        <DialogTitle>Delete Import</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the import "{selectedJob?.filename}"?
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={function() { setDeleteDialogOpen(false); }}>Cancel</Button>
          <Button 
            onClick={function() { handleDeleteImport(selectedJob?._id); }}
            color="error"
            variant="contained"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

export default Import;