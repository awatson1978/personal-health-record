// meteor-v3/imports/ui/pages/Import.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { get } from 'lodash';
import moment from 'moment';
import { Session } from 'meteor/session';
import { isFileExcluded } from '../../api/facebook/excluded-files';

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
  CircularProgress,
  Snackbar
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
  const directoryInputRef = useRef(null);
  const zipInputRef = useRef(null);
  
  // Restore active step from session
  const [activeStep, setActiveStep] = useState(function() {
    return Session.get('import.activeStep') || 0;
  });
  
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  
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

  const handleDirectoryChoice = function(event) {
    const files = event.target.files;
    if (files && files.length > 0) {
      // Get the directory path from the first file
      const firstFile = files[0];
      const path = firstFile.webkitRelativePath || firstFile.name;
      const directoryName = path.split('/')[0];
      
      setDirectoryPath(directoryName);
      
      // Auto-scan the selected directory
      handleScanDirectory(directoryName, files);
    }
  };

  const handleZipChoice = function(event) {
    const file = event.target.files[0];
    if (file) {
      setZipPath(file.name);
      
      // Auto-scan the selected ZIP file
      handleScanZipFile(file);
    }
  };

  const handleScanDirectory = async function(pathOverride = null, filesOverride = null) {
    const targetPath = pathOverride || directoryPath.trim();
    
    if (!targetPath) {
      setUploadError('Please choose a directory');
      return;
    }

    setScanning(true);
    setUploadError(null);
    setInventory(null);

    try {
      let result;
      
      if (filesOverride) {
        // Handle browser directory selection
        result = await processSelectedDirectory(filesOverride);
      } else {
        // Handle manual path input (server-side scan)
        result = await new Promise(function(resolve, reject) {
          Meteor.call('facebook.scanDirectory', targetPath, function(error, result) {
            if (error) reject(error);
            else resolve(result);
          });
        });
      }

      setInventory(result);
      setSelectedFiles(result.summary.testParseRecommendation?.suggested?.map(function(file) { 
        return file.path; 
      }) || []);

    } catch (error) {
      console.error('Directory scan error:', error);
      setUploadError(error.reason || 'Failed to scan directory. Please check the selection and try again.');
    } finally {
      setScanning(false);
    }
  };

  const handleScanZipFile = async function(fileOverride = null) {
    if (fileOverride) {
      // Handle browser file selection - we'll need to read the ZIP on client side
      setUploadError('ZIP file scanning from browser not yet implemented. Please use file path method.');
      return;
    }
    
    if (!zipPath.trim()) {
      setUploadError('Please choose a ZIP file');
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
      setUploadError(error.reason || 'Failed to scan ZIP file. Please check the file and try again.');
    } finally {
      setScanning(false);
    }
  };

  const processSelectedDirectory = async function(files) {
    // Process FileList from directory picker
    const inventory = {
      dirPath: 'Browser Selected Directory',
      files: [],
      excludedFiles: [], // Track excluded files
      categories: {
        demographics: [],
        friends: [],
        posts: [],
        messages: [],
        media: [],
        other: []
      },
      summary: {
        totalFiles: 0,
        totalSize: 0,
        excludedCount: 0,
        testParseRecommendation: null
      }
    };

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Check if file should be excluded
      if (isFileExcluded(file.name)) {
        inventory.excludedFiles.push({
          name: file.name,
          path: file.webkitRelativePath || file.name,
          size: file.size,
          reason: 'Excluded file type'
        });
        inventory.summary.excludedCount++;
        continue;
      }
      
      const category = categorizeFile(file.name);
      
      const fileInfo = {
        name: file.name,
        path: file.webkitRelativePath || file.name,
        size: file.size,
        sizeFormatted: formatBytes(file.size),
        category: category,
        file: file // Store the actual File object for later processing
      };

      inventory.files.push(fileInfo);
      inventory.categories[category].push(fileInfo);
      inventory.summary.totalFiles++;
      inventory.summary.totalSize += file.size;
    }

    inventory.summary.totalSizeFormatted = formatBytes(inventory.summary.totalSize);
    inventory.summary.testParseRecommendation = generateTestParseRecommendation(inventory);

    return inventory;
  };

  const categorizeFile = function(fileName) {
    // Check if file should be excluded first
    if (isFileExcluded(fileName)) {
      return 'excluded';
    }
    
    const lowerName = fileName.toLowerCase();
    
    if (lowerName.includes('profile') || lowerName.includes('about')) {
      return 'demographics';
    }
    if (lowerName.includes('friend')) {
      return 'friends';
    }
    if (lowerName.includes('post') || lowerName.includes('timeline') || lowerName.includes('wall')) {
      return 'posts';
    }
    if (lowerName.includes('message') || lowerName.includes('inbox')) {
      return 'messages';
    }
    if (lowerName.includes('photo') || lowerName.includes('video') || lowerName.includes('media')) {
      return 'media';
    }
    
    return 'other';
  };

  const generateTestParseRecommendation = function(inventory) {
    const testParseSize = 104857600; // 100MB
    let recommendation = {
      suggested: [],
      reason: '',
      totalSize: 0
    };

    // Prioritize smaller, important files first
    const priorities = ['demographics', 'friends', 'posts', 'messages', 'media'];
    
    for (const category of priorities) {
      const files = inventory.categories[category];
      for (const file of files) {
        if (recommendation.totalSize + file.size <= testParseSize) {
          recommendation.suggested.push(file);
          recommendation.totalSize += file.size;
        }
      }
      
      if (recommendation.totalSize >= testParseSize * 0.8) {
        break;
      }
    }

    if (recommendation.suggested.length === 0) {
      recommendation.reason = 'All files are too large for test parsing. Consider processing in production mode.';
    } else {
      recommendation.reason = `Recommended ${recommendation.suggested.length} files (${formatBytes(recommendation.totalSize)}) for initial test parsing.`;
    }

    return recommendation;
  };

  const handleProcessDirectory = async function() {
    if (!inventory || selectedFiles.length === 0) {
      setUploadError('Please select files to process');
      return;
    }

    try {
      const sourcePath = inventory.dirPath || inventory.filePath;
      
      // Check if this is a browser-selected directory (has File objects)
      const isBrowserSelected = inventory.files.some(function(file) { 
        return file.file instanceof File; 
      });
      
      if (isBrowserSelected) {
        // Process browser-selected files differently
        await handleProcessBrowserFiles();
      } else {
        // Use server-side path processing
        const jobId = await new Promise(function(resolve, reject) {
          Meteor.call('facebook.processFromPath', sourcePath, selectedFiles, function(error, result) {
            if (error) reject(error);
            else resolve(result);
          });
        });

        console.log('Directory processing started, job ID:', jobId);
        setActiveStep(2);
      }
      
    } catch (error) {
      console.error('Directory processing error:', error);
      setUploadError(error.reason || 'Failed to start processing. Please try again.');
    }
  };

  const handleProcessBrowserFiles = async function() {
    if (!inventory || selectedFiles.length === 0) {
      setUploadError('Please select files to process');
      return;
    }

    try {
      // Create import job first
      const jobId = await new Promise(function(resolve, reject) {
        Meteor.call('facebook.createDirectoryJob', 'Browser Selected Directory', selectedFiles, function(error, result) {
          if (error) reject(error);
          else resolve(result);
        });
      });

      console.log('Browser file processing job created:', jobId);

      // Filter inventory.files to only include selected files
      const selectedFileInfos = inventory.files.filter(function(file) {
        return selectedFiles.includes(file.path) && file.file instanceof File;
      });

      console.log(`Processing ${selectedFileInfos.length} selected files out of ${inventory.files.length} total files`);

      // Process each selected file with batching
      let processedCount = 0;
      const totalFiles = selectedFileInfos.length;
      const batchSize = 3; // Reduce batch size to prevent browser overload

      for (let i = 0; i < selectedFileInfos.length; i += batchSize) {
        const batch = selectedFileInfos.slice(i, i + batchSize);
        
        // Process batch in parallel
        const batchPromises = batch.map(async function(fileInfo) {
          try {
            // Read file content
            const fileContent = await readFileAsText(fileInfo.file);
            
            // Send content to server for processing
            await new Promise(function(resolve, reject) {
              Meteor.call('facebook.processFileContent', jobId, fileInfo.path, fileContent, function(error, result) {
                if (error) reject(error);
                else resolve(result);
              });
            });

            processedCount++;
            
            // Log progress less frequently to reduce console spam
            if (processedCount % 10 === 0 || processedCount === totalFiles) {
              console.log(`Processed ${processedCount}/${totalFiles}: ${fileInfo.name}`);
            }
            
            return { success: true, fileName: fileInfo.name };
          } catch (error) {
            console.error(`Error processing file ${fileInfo.name}:`, error);
            return { success: false, fileName: fileInfo.name, error };
          }
        });

        // Wait for batch to complete
        await Promise.all(batchPromises);
        
        // Add delay between batches to prevent browser freezing
        await new Promise(function(resolve) { setTimeout(resolve, 200); });
      }

      console.log(`Browser file processing completed: ${processedCount}/${totalFiles} files`);
      setActiveStep(2);

    } catch (error) {
      console.error('Browser file processing error:', error);
      setUploadError(error.reason || 'Failed to process browser-selected files. Please try again.');
    }
  };

  const readFileAsText = function(file) {
    return new Promise(function(resolve, reject) {
      const reader = new FileReader();
      reader.onload = function(e) {
        resolve(e.target.result);
      };
      reader.onerror = function() {
        reject(new Error('Failed to read file: ' + file.name));
      };
      reader.readAsText(file);
    });
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

  // FIXED: Updated delete handler
  const handleDeleteImport = async function() {
    if (!selectedJob) return;
    
    console.log('Deleting import job:', selectedJob._id);
    setDeleting(true);
    
    try {
      const result = await new Promise(function(resolve, reject) {
        Meteor.call('facebook.deleteImport', selectedJob._id, function(error, result) {
          if (error) {
            console.error('Delete error:', error);
            reject(error);
          } else {
            console.log('Delete success:', result);
            resolve(result);
          }
        });
      });

      // Show success message
      setSnackbar({
        open: true,
        message: 'Import job deleted successfully',
        severity: 'success'
      });

      setDeleteDialogOpen(false);
      setSelectedJob(null);
      
    } catch (error) {
      console.error('Delete import error:', error);
      setSnackbar({
        open: true,
        message: `Failed to delete import: ${error.reason || error.message}`,
        severity: 'error'
      });
    } finally {
      setDeleting(false);
    }
  };

  // FIXED: Updated delete button click handler
  const handleDeleteClick = function(job, event) {
    event.preventDefault();
    event.stopPropagation();
    console.log('Delete button clicked for job:', job._id);
    setSelectedJob(job);
    setDeleteDialogOpen(true);
  };

  const closeSnackbar = function() {
    setSnackbar({ ...snackbar, open: false });
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

        {inventory.summary.excludedCount > 0 && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <AlertTitle>Excluded Files</AlertTitle>
            <Typography variant="body2">
              {inventory.summary.excludedCount} files were automatically excluded from processing 
              (system files, privacy settings, etc.)
            </Typography>
          </Alert>
        )}

        {/* Rest of the function remains the same */}
        {/* ... */}
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
        <Grid item xs={12} lg={12}>
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
                            <Tab label="Choose Directory" />
                            <Tab label="Choose ZIP File" />
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

                          {/* Directory Choose Tab */}
                          {tabValue === 1 && (
                            <Box>
                              <Alert severity="info" sx={{ mb: 2 }}>
                                <AlertTitle>Directory Selection Mode</AlertTitle>
                                <Typography variant="body2">
                                  Choose a local directory containing your extracted Facebook data.
                                  This allows you to review and select specific files before processing.
                                </Typography>
                              </Alert>

                              <Box sx={{ mb: 2 }}>
                                <input
                                  ref={directoryInputRef}
                                  type="file"
                                  webkitdirectory=""
                                  directory=""
                                  multiple
                                  onChange={handleDirectoryChoice}
                                  style={{ display: 'none' }}
                                  id="directory-upload"
                                />
                                <label htmlFor="directory-upload">
                                  <Button
                                    variant="contained"
                                    component="span"
                                    disabled={scanning}
                                    startIcon={scanning ? <CircularProgress size={20} /> : <FolderOpenIcon />}
                                    size="large"
                                  >
                                    {scanning ? 'Scanning...' : 'Choose Directory'}
                                  </Button>
                                </label>
                                
                                {directoryPath && (
                                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                    Selected: {directoryPath}
                                  </Typography>
                                )}
                              </Box>

                              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                Or enter directory path manually:
                              </Typography>
                              
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
                                  variant="outlined"
                                  onClick={function() { handleScanDirectory(); }}
                                  disabled={scanning}
                                  startIcon={scanning ? <CircularProgress size={20} /> : <FolderIcon />}
                                >
                                  {scanning ? 'Scanning...' : 'Scan Path'}
                                </Button>
                              </Box>

                              {renderFileInventory()}
                            </Box>
                          )}

                          {/* ZIP Choose Tab */}
                          {tabValue === 2 && (
                            <Box>
                              <Alert severity="info" sx={{ mb: 2 }}>
                                <AlertTitle>ZIP File Selection Mode</AlertTitle>
                                <Typography variant="body2">
                                  Choose a ZIP file containing your Facebook data export.
                                  Currently supports file path input only.
                                </Typography>
                              </Alert>

                              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                Enter ZIP file path:
                              </Typography>

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
                                  onClick={function() { handleScanZipFile(); }}
                                  disabled={scanning}
                                  startIcon={scanning ? <CircularProgress size={20} /> : <FileIcon />}
                                >
                                  {scanning ? 'Scanning...' : 'Choose ZIP File'}
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
        <Grid item xs={12} lg={12}>
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
                            <React.Fragment>
                              <Typography variant="caption" display="block" component="span">
                                {moment(job.createdAt).format('MMM DD, YYYY HH:mm')}
                              </Typography>
                              {job.status === 'processing' && job.progress && (
                                <span style={{ display: 'block', marginTop: '4px' }}>
                                  <LinearProgress 
                                    variant="determinate" 
                                    value={job.progress} 
                                    size="small"
                                  />
                                  <Typography variant="caption" component="span">
                                    {job.progress}% complete
                                    {job.processedRecords && job.totalRecords && (
                                      <span> ({job.processedRecords}/{job.totalRecords} records)</span>
                                    )}
                                  </Typography>
                                </span>
                              )}
                              {job.results && (
                                <span style={{ display: 'block', marginTop: '4px' }}>
                                  <span style={{ marginRight: '4px', marginBottom: '4px', display: 'inline-block' }}>
                                    <Chip
                                      size="small"
                                      label={`${get(job.results, 'communications', 0)} posts`}
                                      component="span"
                                    />
                                  </span>
                                  <span style={{ marginRight: '4px', marginBottom: '4px', display: 'inline-block' }}>
                                    <Chip
                                      size="small"
                                      label={`${get(job.results, 'clinicalImpressions', 0)} health records`}
                                      component="span"
                                    />
                                  </span>
                                </span>
                              )}
                            </React.Fragment>
                          }
                        />
                        <ListItemSecondaryAction>
                          <Box display="flex" alignItems="center">
                            <Chip
                              label={job.status}
                              size="small"
                              color={getStatusColor(job.status)}
                              sx={{ mr: 1, marginTop: '40px' }}
                            />
                            <IconButton
                              edge="end"
                              size="small"
                              onClick={function(event) { handleDeleteClick(job, event); }}
                              aria-label="delete import"
                              color="error"
                              sx={{ ml: 1, marginTop: '-5px' }}
                              disabled={deleting}
                            >
                              {deleting && selectedJob?._id === job._id ? (
                                <CircularProgress size={20} />
                              ) : (
                                <DeleteIcon />
                              )}
                            </IconButton>
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

      {/* FIXED: Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={function() { 
          if (!deleting) {
            setDeleteDialogOpen(false);
            setSelectedJob(null);
          }
        }}
      >
        <DialogTitle>Delete Import Job</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the import job "{selectedJob?.filename}"?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            This will only delete the job record. Your imported data (communications, health records, etc.) will remain in the system.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={function() { 
              setDeleteDialogOpen(false); 
              setSelectedJob(null);
            }}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleDeleteImport}
            color="error"
            variant="contained"
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={16} /> : null}
          >
            {deleting ? 'Deleting...' : 'Delete Job'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success/Error Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={closeSnackbar}
      >
        <Alert 
          onClose={closeSnackbar} 
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
}

export default Import;