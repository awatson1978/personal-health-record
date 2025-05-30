// meteor-v3/imports/api/facebook/server/methods.js
import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import { get } from 'lodash';
import fs from 'fs';
import path from 'path';
import yauzl from 'yauzl';
import { v4 as uuidv4 } from 'uuid';

import { ImportJobs, ProcessingQueues } from '../../fhir/collections';
import { FacebookImporter } from '../importer';
import { DirectoryScanner } from '../directory-scanner';
import { isFileExcluded } from '../excluded-files';

// Track active importers for cancellation
const activeImporters = new Map();

// Helper functions
async function processUploadedFile(jobId, filePath, filename) {
  check(jobId, String);
  check(filePath, String);
  check(filename, String);

  const job = await ImportJobs.findOneAsync({ _id: jobId });
  if (!job) {
    throw new Meteor.Error('job-not-found', 'Import job not found');
  }

  try {
    let facebookData = {};

    if (filename.endsWith('.zip')) {
      facebookData = await extractAndParseZip(filePath);
    } else if (filename.endsWith('.json')) {
      const jsonContent = fs.readFileSync(filePath, 'utf8');
      facebookData = JSON.parse(jsonContent);
    } else {
      throw new Meteor.Error('unsupported-format', 'Unsupported file format');
    }

    // Create and track importer
    const importer = new FacebookImporter(job.userId, jobId);
    activeImporters.set(jobId, importer);

    // Process the data
    const results = await importer.processData(facebookData);

    // Remove from active importers
    activeImporters.delete(jobId);

    console.log(`✅ Facebook import completed for user ${job.userId}:`, results);

    // Clean up file
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return results;

  } catch (error) {
    console.error('❌ Process file error:', error);
    activeImporters.delete(jobId);
    throw error;
  }
}

async function extractAndParseZip(zipPath) {
  return new Promise(function(resolve, reject) {
    const extractedData = {};
    
    yauzl.open(zipPath, { lazyEntries: true }, function(err, zipfile) {
      if (err) return reject(err);

      let filesProcessed = 0;
      let totalFiles = 0;

      // Count total files first
      zipfile.on('entry', function() { totalFiles++; });
      
      zipfile.readEntry();
      
      zipfile.on('entry', function(entry) {
        if (/\/$/.test(entry.fileName)) {
          // Directory entry
          zipfile.readEntry();
        } else {
          // File entry
          processZipEntry(zipfile, entry, extractedData, function(error) {
            filesProcessed++;
            
            if (error) {
              console.error(`Error processing ${entry.fileName}:`, error);
            }
            
            if (filesProcessed >= totalFiles) {
              resolve(extractedData);
            } else {
              zipfile.readEntry();
            }
          });
        }
      });

      zipfile.on('end', function() {
        if (filesProcessed >= totalFiles) {
          resolve(extractedData);
        }
      });

      zipfile.on('error', reject);
    });
  });
}

function processZipEntry(zipfile, entry, extractedData, callback) {
  const fileName = entry.fileName.toLowerCase();
  
  // Check if file should be excluded
  if (isFileExcluded(entry.fileName)) {
    return callback(); // Skip excluded files
  }
  
  // Only process relevant Facebook files
  const relevantFiles = [
    'posts.json',
    'friends.json', 
    'photos.json',
    'messages.json',
    'your_posts.json',
    'your_friends.json'
  ];

  const isRelevant = relevantFiles.some(function(file) { 
    return fileName.includes(file); 
  });
  
  if (!isRelevant) {
    return callback();
  }

  zipfile.openReadStream(entry, function(err, readStream) {
    if (err) return callback(err);
    
    let data = '';
    readStream.on('data', function(chunk) {
      data += chunk;
    });
    
    readStream.on('end', function() {
      try {
        const jsonData = JSON.parse(data);
        
        // Categorize data based on filename
        if (fileName.includes('post')) {
          extractedData.posts = jsonData;
        } else if (fileName.includes('friend')) {
          extractedData.friends = jsonData.friends || jsonData;
        } else if (fileName.includes('photo')) {
          extractedData.photos = jsonData.photos || jsonData;
        } else if (fileName.includes('message')) {
          extractedData.messages = jsonData.messages || jsonData;
        }
        
        callback();
      } catch (parseError) {
        callback(parseError);
      }
    });
    
    readStream.on('error', callback);
  });
}

// Helper function to process selected files
async function processSelectedFiles(files) {
  const facebookData = {};
  
  for (const file of files) {
    try {
      // Check if file should be excluded
      if (isFileExcluded(file.name)) {
        console.log(`Skipping excluded file: ${file.name}`);
        continue;
      }
      
      if (file.fullPath && fs.existsSync(file.fullPath)) {
        const fileContent = fs.readFileSync(file.fullPath, 'utf8');
        
        // Try to parse as JSON
        try {
          const jsonData = JSON.parse(fileContent);
          
          // Categorize based on filename
          if (file.name.toLowerCase().includes('post')) {
            facebookData.posts = jsonData;
          } else if (file.name.toLowerCase().includes('friend')) {
            facebookData.friends = jsonData.friends || jsonData;
          } else if (file.name.toLowerCase().includes('photo')) {
            facebookData.photos = jsonData.photos || jsonData;
          } else if (file.name.toLowerCase().includes('message')) {
            facebookData.messages = jsonData.messages || jsonData;
          }
          
        } catch (parseError) {
          console.error(`Error parsing JSON from ${file.name}:`, parseError);
        }
      }
    } catch (readError) {
      console.error(`Error reading file ${file.name}:`, readError);
    }
  }
  
  return facebookData;
}

Meteor.methods({
  async 'facebook.scanZipFile'(filePath) {
    check(filePath, String);
    
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in to scan files');
    }

    try {
      const scanner = new DirectoryScanner();
      const inventory = await scanner.scanZipFile(filePath);
      
      return inventory;
    } catch (error) {
      console.error('ZIP scan error:', error);
      throw new Meteor.Error('scan-failed', error.message);
    }
  },

  async 'facebook.scanDirectory'(dirPath) {
    check(dirPath, String);
    
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in to scan directories');
    }

    try {
      const scanner = new DirectoryScanner();
      const inventory = await scanner.scanDirectory(dirPath);
      
      return inventory;
    } catch (error) {
      console.error('Directory scan error:', error);
      throw new Meteor.Error('scan-failed', error.message);
    }
  },

  async 'facebook.createDirectoryJob'(dirPath, selectedFiles) {
    check(dirPath, String);
    check(selectedFiles, [String]);
    
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in to create jobs');
    }

    try {
      // Create import job for browser-selected directory
      const jobId = await ImportJobs.insertAsync({
        userId: this.userId,
        filename: `Directory: ${dirPath}`,
        filePath: dirPath,
        selectedFiles: selectedFiles,
        status: 'pending',
        totalRecords: selectedFiles.length,
        processedRecords: 0,
        createdAt: new Date(),
        processingType: 'browser-directory'
      });

      console.log(`Created browser directory job ${jobId} for user ${this.userId} with ${selectedFiles.length} selected files`);
      return jobId;
      
    } catch (error) {
      console.error('Create browser directory job error:', error);
      throw new Meteor.Error('job-creation-failed', error.message);
    }
  },

  async 'facebook.processFileContent'(jobId, filePath, content) {
    check(jobId, String);
    check(filePath, String);
    check(content, String);
    
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in to process files');
    }

    try {
      const job = await ImportJobs.findOneAsync({ _id: jobId, userId: this.userId });
      if (!job) {
        throw new Meteor.Error('job-not-found', 'Import job not found');
      }

      // Check if job was cancelled
      if (job.status === 'cancelled') {
        return { success: false, error: 'Job was cancelled' };
      }

      // Parse JSON content
      let jsonData;
      try {
        jsonData = JSON.parse(content);
      } catch (parseError) {
        console.error(`Error parsing JSON from ${filePath}:`, parseError);
        return { success: false, error: 'Invalid JSON format' };
      }

      // FIXED: Create or get existing importer with proper initialization
      let importer = activeImporters.get(jobId);
      if (!importer) {
        importer = new FacebookImporter(this.userId, jobId);
        activeImporters.set(jobId, importer);
        
        // Create patient record first if this is the first file
        await importer.createPatientRecord();
      }
      
      // Determine data type based on file path
      const fileName = filePath.toLowerCase();
      
      try {
        console.log(`📁 Processing file: ${filePath} (${fileName})`);
        
        if (fileName.includes('post')) {
          console.log(`📝 Found posts file with ${Array.isArray(jsonData) ? jsonData.length : 'unknown'} items`);
          
          // FIXED: Handle different post file structures
          let posts = [];
          if (Array.isArray(jsonData)) {
            posts = jsonData;
          } else if (jsonData.status_updates) {
            posts = jsonData.status_updates;
          } else if (jsonData.timeline) {
            posts = jsonData.timeline;
          } else if (jsonData.posts) {
            posts = jsonData.posts;
          } else {
            // Treat the whole object as a single post
            posts = [jsonData];
          }
          
          if (posts.length > 0) {
            await importer.processPosts(posts);
            console.log(`✅ Processed ${posts.length} posts from ${filePath}`);
          }
          
        } else if (fileName.includes('friend')) {
          console.log(`👥 Found friends file`);
          
          let friends = [];
          if (jsonData.friends) {
            friends = jsonData.friends;
          } else if (Array.isArray(jsonData)) {
            friends = jsonData;
          }
          
          if (friends.length > 0) {
            await importer.processFriends(friends);
            console.log(`✅ Processed ${friends.length} friends from ${filePath}`);
          }
          
        } else if (fileName.includes('photo')) {
          console.log(`📸 Found photos file`);
          
          let photos = [];
          if (jsonData.photos) {
            photos = jsonData.photos;
          } else if (Array.isArray(jsonData)) {
            photos = jsonData;
          }
          
          if (photos.length > 0) {
            await importer.processPhotos(photos);
            console.log(`✅ Processed ${photos.length} photos from ${filePath}`);
          }
          
        } else if (fileName.includes('message')) {
          console.log(`💬 Found messages file`);
          
          let messages = [];
          if (jsonData.messages) {
            messages = jsonData.messages;
          } else if (Array.isArray(jsonData)) {
            messages = jsonData;
          }
          
          if (messages.length > 0) {
            await importer.processMessages(messages);
            console.log(`✅ Processed ${messages.length} messages from ${filePath}`);
          }
        } else {
          console.log(`⏩ Skipping file: ${filePath} (not a recognized type)`);
        }

        // FIXED: Update job progress properly
        const currentProcessed = (job.processedRecords || 0) + 1;
        const totalFiles = job.totalRecords || job.selectedFiles?.length || 1;
        const progressPercent = Math.floor((currentProcessed / totalFiles) * 100);
        
        await ImportJobs.updateAsync(
          { _id: jobId },
          { 
            $set: { 
              processedRecords: currentProcessed,
              progress: Math.min(progressPercent, 95), // Cap at 95% until complete
              status: 'processing',
              updatedAt: new Date(),
              results: importer.stats // Update with current stats
            }
          }
        );

        // FIXED: Check if this was the last file to complete the job
        if (currentProcessed >= totalFiles) {
          console.log(`🎉 All files processed! Completing job ${jobId}`);
          
          await ImportJobs.updateAsync(
            { _id: jobId },
            { 
              $set: {
                status: 'completed',
                progress: 100,
                completedAt: new Date(),
                updatedAt: new Date(),
                results: importer.stats
              }
            }
          );
          
          // Remove from active importers
          activeImporters.delete(jobId);
          
          console.log(`✅ Job ${jobId} completed with results:`, importer.stats);
        }

        return { success: true, stats: importer.stats };

      } catch (processingError) {
        console.error('❌ File processing error:', processingError);
        throw processingError;
      }

    } catch (error) {
      console.error('❌ Process file content error:', error);
      
      // Log error to job
      await ImportJobs.updateAsync(
        { _id: jobId },
        { 
          $push: { 
            errors: { 
              message: error.message, 
              filePath: filePath,
              timestamp: new Date() 
            }
          },
          $inc: { errorCount: 1 }
        }
      );

      return { success: false, error: error.message };
    }
  },

  async 'facebook.processFromPath'(filePath, selectedFiles = []) {
    check(filePath, String);
    check(selectedFiles, [String]);
    
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in to process files');
    }

    try {
      // Create import job
      const jobId = await ImportJobs.insertAsync({
        userId: this.userId,
        filename: path.basename(filePath),
        filePath: filePath,
        selectedFiles: selectedFiles,
        status: 'pending',
        createdAt: new Date()
      });

      // Process file/directory asynchronously
      setImmediate(async function() {
        try {
          const scanner = new DirectoryScanner();
          
          let facebookData = {};
          
          if (filePath.endsWith('.zip')) {
            // Extract ZIP to working directory
            const { extractPath, extractedFiles } = await scanner.extractZipToWorking(filePath, jobId);
            
            // Scan extracted directory
            const inventory = await scanner.scanDirectory(extractPath);
            
            // Process selected files or all if none specified
            const filesToProcess = selectedFiles.length > 0 
              ? inventory.files.filter(function(file) { return selectedFiles.includes(file.path); })
              : inventory.files;
              
            facebookData = await processSelectedFiles(filesToProcess);
            
          } else if (fs.statSync(filePath).isDirectory()) {
            // Direct directory processing
            const inventory = await scanner.scanDirectory(filePath);
            
            const filesToProcess = selectedFiles.length > 0 
              ? inventory.files.filter(function(file) { return selectedFiles.includes(file.path); })
              : inventory.files;
              
            facebookData = await processSelectedFiles(filesToProcess);
          }

          // Create and track importer
          const importer = new FacebookImporter(this.userId, jobId);
          activeImporters.set(jobId, importer);

          // Process the data with FacebookImporter
          const results = await importer.processData(facebookData);

          // Remove from active importers
          activeImporters.delete(jobId);

          console.log(`✅ Facebook processing completed for user ${this.userId}:`, results);

        } catch (error) {
          console.error('❌ Error processing from path:', error);
          activeImporters.delete(jobId);
          await ImportJobs.updateAsync(
            { _id: jobId },
            { 
              $set: { 
                status: 'failed',
                errors: [{ message: error.message, timestamp: new Date() }],
                completedAt: new Date()
              }
            }
          );
        }
      });

      return jobId;

    } catch (error) {
      console.error('Process from path error:', error);
      throw new Meteor.Error('process-failed', error.message);
    }
  },

  async 'facebook.uploadAndProcess'(filename, fileData) {
    check(filename, Match.Maybe(String));
    check(fileData, Match.Maybe(String)); // Base64 encoded file data
    
    if (!filename || !fileData) {
      throw new Meteor.Error('invalid-parameters', 'Both filename and fileData are required');
    }
    
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in to upload files');
    }

    // Validate file type
    const allowedTypes = get(Meteor.settings, 'private.security.allowedFileTypes', ['.zip', '.json']);
    const fileExt = path.extname(filename).toLowerCase();
    if (!allowedTypes.includes(fileExt)) {
      throw new Meteor.Error('invalid-file-type', `File type ${fileExt} not allowed`);
    }

    // Validate file size (now 5GB)
    const maxSize = get(Meteor.settings, 'private.security.maxUploadSize', 5368709120); // 5GB default
    const fileSize = Buffer.byteLength(fileData, 'base64');
    if (fileSize > maxSize) {
      throw new Meteor.Error('file-too-large', `File size ${fileSize} exceeds maximum ${maxSize}`);
    }

    try {
      // Create import job
      const jobId = await ImportJobs.insertAsync({
        userId: this.userId,
        filename: filename,
        status: 'pending',
        createdAt: new Date()
      });

      // Save file to disk (in production, use cloud storage)
      const uploadDir = path.join(process.env.PWD || process.cwd(), 'uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const filePath = path.join(uploadDir, `${jobId}-${filename}`);
      const buffer = Buffer.from(fileData, 'base64');
      fs.writeFileSync(filePath, buffer);

      // Process file asynchronously
      setImmediate(async function() {
        try {
          await processUploadedFile(jobId, filePath, filename);
        } catch (error) {
          console.error('❌ Error processing uploaded file:', error);
          await ImportJobs.updateAsync(
            { _id: jobId },
            { 
              $set: { 
                status: 'failed',
                errors: [{ message: error.message, timestamp: new Date() }],
                completedAt: new Date()
              }
            }
          );
        }
      });

      return jobId;

    } catch (error) {
      console.error('Upload error:', error);
      throw new Meteor.Error('upload-failed', error.message);
    }
  },

  async 'facebook.getImportStatus'(jobId) {
    check(jobId, String);
    
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    const job = await ImportJobs.findOneAsync({ 
      _id: jobId, 
      userId: this.userId 
    });

    if (!job) {
      throw new Meteor.Error('job-not-found', 'Import job not found');
    }

    return {
      _id: job._id,
      status: job.status,
      progress: job.progress,
      totalRecords: job.totalRecords,
      processedRecords: job.processedRecords,
      errorCount: job.errorCount,
      results: job.results,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt
    };
  },

  async 'facebook.getUserImports'() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    const jobs = await ImportJobs.find(
      { userId: this.userId },
      { 
        sort: { createdAt: -1 },
        limit: 20,
        fields: {
          filename: 1,
          status: 1,
          progress: 1,
          results: 1,
          errorCount: 1,
          createdAt: 1,
          completedAt: 1
        }
      }
    ).fetchAsync();

    return jobs;
  },

  async 'facebook.clearAllData'() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    try {
      // Import collections
      const { 
        Patients, 
        Communications, 
        ClinicalImpressions, 
        Media, 
        Persons, 
        CareTeams 
      } = await import('../../fhir/collections');

      // Get counts before deletion for reporting
      const beforeCounts = {
        patients: await Patients.find({ userId: this.userId }).countAsync(),
        communications: await Communications.find({ userId: this.userId }).countAsync(),
        clinicalImpressions: await ClinicalImpressions.find({ userId: this.userId }).countAsync(),
        media: await Media.find({ userId: this.userId }).countAsync(),
        persons: await Persons.find({ userId: this.userId }).countAsync(),
        careTeams: await CareTeams.find({ userId: this.userId }).countAsync(),
        importJobs: await ImportJobs.find({ userId: this.userId }).countAsync(),
        queueItems: await ProcessingQueues.find({ userId: this.userId }).countAsync()
      };

      // Cancel any active imports
      const activeJobs = await ImportJobs.find({ 
        userId: this.userId, 
        status: { $in: ['pending', 'processing'] } 
      }).fetchAsync();

      for (const job of activeJobs) {
        const importer = activeImporters.get(job._id);
        if (importer) {
          importer.stop();
          activeImporters.delete(job._id);
        }
        
        await ImportJobs.updateAsync(
          { _id: job._id },
          { 
            $set: {
              status: 'cancelled',
              completedAt: new Date(),
              updatedAt: new Date()
            }
          }
        );
      }

      // Remove all user data
      const deletePromises = [
        Patients.removeAsync({ userId: this.userId }),
        Communications.removeAsync({ userId: this.userId }),
        ClinicalImpressions.removeAsync({ userId: this.userId }),
        Media.removeAsync({ userId: this.userId }),
        Persons.removeAsync({ userId: this.userId }),
        CareTeams.removeAsync({ userId: this.userId }),
        ImportJobs.removeAsync({ userId: this.userId }),
        ProcessingQueues.removeAsync({ userId: this.userId })
      ];

      await Promise.all(deletePromises);

      console.log(`✅ Cleared all data for user ${this.userId}:`, beforeCounts);

      return {
        success: true,
        deletedCounts: beforeCounts,
        message: 'All imported data has been cleared successfully'
      };

    } catch (error) {
      console.error(`❌ Error clearing data for user ${this.userId}:`, error);
      throw new Meteor.Error('clear-data-failed', error.message);
    }
  },

  // FIXED: Improved cancel method
  async 'facebook.cancelImport'(jobId) {
    check(jobId, String);
    
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    const job = await ImportJobs.findOneAsync({ 
      _id: jobId, 
      userId: this.userId 
    });

    if (!job) {
      throw new Meteor.Error('job-not-found', 'Import job not found');
    }

    if (job.status === 'completed') {
      throw new Meteor.Error('job-completed', 'Cannot cancel completed job');
    }

    if (job.status === 'cancelled') {
      throw new Meteor.Error('job-already-cancelled', 'Job is already cancelled');
    }

    // Stop the active importer if it exists
    const importer = activeImporters.get(jobId);
    if (importer) {
      importer.stop();
      activeImporters.delete(jobId);
      console.log(`🛑 Stopped active importer for job ${jobId}`);
    }

    // Update job status to cancelled
    await ImportJobs.updateAsync(
      { _id: jobId },
      { 
        $set: {
          status: 'cancelled',
          completedAt: new Date(),
          updatedAt: new Date(),
          cancelledBy: this.userId
        }
      }
    );

    // Remove any pending queue items
    await ProcessingQueues.removeAsync({ jobId: jobId });

    console.log(`✅ Cancelled import job ${jobId} by user ${this.userId}`);
    return true;
  },

  async 'facebook.retryImport'(jobId) {
    check(jobId, String);
    
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    const job = await ImportJobs.findOneAsync({ 
      _id: jobId, 
      userId: this.userId 
    });

    if (!job) {
      throw new Meteor.Error('job-not-found', 'Import job not found');
    }

    if (job.status !== 'failed' && job.status !== 'cancelled') {
      throw new Meteor.Error('job-not-retryable', 'Job is not in a failed or cancelled state');
    }

    // Reset job status
    await ImportJobs.updateAsync(
      { _id: jobId },
      { 
        $set: {
          status: 'pending',
          progress: 0,
          processedRecords: 0,
          errors: [],
          errorCount: 0,
          startedAt: null,
          completedAt: null,
          cancelledBy: null,
          updatedAt: new Date(),
          retryCount: (job.retryCount || 0) + 1
        }
      }
    );

    console.log(`🔄 Retrying import job ${jobId} (attempt ${(job.retryCount || 0) + 1})`);
    
    // Note: In a production system, you'd trigger the background processor here
    // For now, we'll just update the status and let the user re-upload
    
    return true;
  },

  // FIXED: Improved delete method
  async 'facebook.deleteImport'(jobId) {
    check(jobId, String);
    
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    const job = await ImportJobs.findOneAsync({ 
      _id: jobId, 
      userId: this.userId 
    });

    if (!job) {
      throw new Meteor.Error('job-not-found', 'Import job not found');
    }

    // FIXED: Allow deletion of any job, but cancel it first if needed
    if (job.status === 'processing' || job.status === 'pending') {
      // Cancel first, then delete
      const importer = activeImporters.get(jobId);
      if (importer) {
        importer.stop();
        activeImporters.delete(jobId);
      }
      
      console.log(`🛑 Cancelling active job ${jobId} before deletion`);
    }

    // Remove the job record (this does NOT delete the imported data)
    await ImportJobs.removeAsync({ _id: jobId });
    
    // Remove any related queue items
    await ProcessingQueues.removeAsync({ jobId: jobId });
    
    console.log(`✅ Deleted import job record ${jobId} (imported data remains)`);
    
    return {
      success: true,
      message: 'Import job deleted. Your imported data remains in the system.',
      jobId: jobId
    };
  },

  async 'facebook.getImportDetails'(jobId) {
    check(jobId, String);
    
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    const job = await ImportJobs.findOneAsync({ 
      _id: jobId, 
      userId: this.userId 
    });

    if (!job) {
      throw new Meteor.Error('job-not-found', 'Import job not found');
    }

    return {
      job: job,
      canCancel: job.status === 'processing' || job.status === 'pending',
      canRetry: job.status === 'failed' || job.status === 'cancelled',
      canDelete: true, // FIXED: Always allow delete
      isActive: activeImporters.has(jobId)
    };
  },

  // FIXED: Force complete stuck jobs
  async 'facebook.forceCompleteJob'(jobId) {
    check(jobId, String);
    
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    const job = await ImportJobs.findOneAsync({ 
      _id: jobId, 
      userId: this.userId 
    });

    if (!job) {
      throw new Meteor.Error('job-not-found', 'Import job not found');
    }

    // Stop any active importer
    const importer = activeImporters.get(jobId);
    if (importer) {
      importer.stop();
      activeImporters.delete(jobId);
    }

    // Force complete the job
    await ImportJobs.updateAsync(
      { _id: jobId },
      { 
        $set: {
          status: 'completed',
          progress: 100,
          completedAt: new Date(),
          updatedAt: new Date(),
          results: job.results || {
            patients: 0,
            communications: 0,
            clinicalImpressions: 0,
            media: 0,
            persons: 0,
            careTeams: 0
          }
        }
      }
    );

    console.log(`✅ Force completed stuck job ${jobId}`);
    
    return {
      success: true,
      message: 'Job marked as completed',
      jobId: jobId
    };
  }
});