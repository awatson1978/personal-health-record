// meteor-v3/imports/ui/pages/Import.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { get } from 'lodash';
import moment from 'moment';
import { Session } from 'meteor/session';

import {
  Box,
  Paper,
  Typography,
  Button,
  Alert,
  AlertTitle,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Grid,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction,
  IconButton,
  Chip
} from '@mui/material';

import {
  CloudUpload as UploadIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Info as InfoIcon,
  Timeline as TimelineIcon,
  Analytics as AnalyticsIcon
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
      label: 'Upload Data File',
      description: 'Upload your Facebook data export',
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

    // Validate file size (100MB limit)
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      setUploadError(`File size ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds the 100MB limit.`);
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

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      {/* Header */}
      <Box mb={4}>
        <Typography variant="h3" component="h1" gutterBottom>
          Import Facebook Data
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Transform your Facebook posts into a personal health timeline using FHIR standards.
        </Typography>
      </Box>

      {/* Main Import Process - Full Width */}
      <Paper sx={{ p: 4, mb: 4 }}>
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
                      <Alert severity="warning" sx={{ mb: 2 }}>
                        <AlertTitle>Supported File Types</AlertTitle>
                        <Typography variant="body2">
                          Upload your Facebook data as a .zip file or individual .json files.
                          Maximum file size: 100MB.
                        </Typography>
                      </Alert>
                      
                      {uploadError && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                          {uploadError}
                        </Alert>
                      )}

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

      {/* Import History - Bottom Section */}
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
          <Grid container spacing={2}>
            {importJobs.map(function(job) {
              return (
                <Grid item xs={12} sm={6} md={4} lg={3} key={job._id}>
                  <Card>
                    <CardContent>
                      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                        <Typography variant="body2" noWrap sx={{ flex: 1, mr: 1 }}>
                          {job.filename}
                        </Typography>
                        <IconButton
                          size="small"
                          onClick={function() {
                            setSelectedJob(job);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Box>
                      
                      <Box display="flex" alignItems="center" mb={1}>
                        {getStatusIcon(job.status)}
                        <Chip
                          label={job.status}
                          size="small"
                          color={getStatusColor(job.status)}
                          sx={{ ml: 1 }}
                        />
                      </Box>

                      <Typography variant="caption" display="block" color="text.secondary">
                        {moment(job.createdAt).format('MMM DD, YYYY HH:mm')}
                      </Typography>

                      {job.status === 'processing' && job.progress && (
                        <Box sx={{ mt: 1 }}>
                          <LinearProgress 
                            variant="determinate" 
                            value={job.progress} 
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
                          <Typography variant="caption" display="block">
                            {get(job.results, 'communications', 0)} posts
                          </Typography>
                          <Typography variant="caption" display="block">
                            {get(job.results, 'clinicalImpressions', 0)} health records
                          </Typography>
                          <Typography variant="caption" display="block">
                            {get(job.results, 'media', 0)} media files
                          </Typography>
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )}
      </Paper>

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
    </Box>
  );
}

export default Import;