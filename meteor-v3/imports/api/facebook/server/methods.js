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

    // Process the data
    const importer = new FacebookImporter(job.userId, jobId);
    const results = await importer.processData(facebookData);

    console.log(`Facebook import completed for user ${job.userId}:`, results);

    // Clean up file
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return results;

  } catch (error) {
    console.error('Process file error:', error);
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
      data += chunk.toString('utf8');
    });

    readStream.on('end', function() {
      try {
        const jsonData = JSON.parse(data);
        
        // Map to standardized structure
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
      // Create import job
      const jobId = await ImportJobs.insertAsync({
        userId: this.userId,
        filename: `Directory: ${dirPath}`,
        filePath: dirPath,
        selectedFiles: selectedFiles,
        status: 'pending',
        createdAt: new Date(),
        processingType: 'directory'
      });

      return jobId;
    } catch (error) {
      console.error('Create directory job error:', error);
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

      // Parse JSON content
      let jsonData;
      try {
        jsonData = JSON.parse(content);
      } catch (parseError) {
        console.error(`Error parsing JSON from ${filePath}:`, parseError);
        return { success: false, error: 'Invalid JSON format' };
      }

      // Process the data based on file type
      const importer = new FacebookImporter(this.userId, jobId);
      
      // Determine data type based on file path
      const fileName = filePath.toLowerCase();
      
      if (fileName.includes('post')) {
        if (Array.isArray(jsonData)) {
          await importer.processPosts(jsonData);
        } else {
          await importer.processPosts([jsonData]);
        }
      } else if (fileName.includes('friend')) {
        const friends = jsonData.friends || jsonData;
        if (Array.isArray(friends)) {
          await importer.processFriends(friends);
        }
      } else if (fileName.includes('photo')) {
        const photos = jsonData.photos || jsonData;
        if (Array.isArray(photos)) {
          await importer.processPhotos(photos);
        }
      } else if (fileName.includes('message')) {
        const messages = jsonData.messages || jsonData;
        if (Array.isArray(messages)) {
          await importer.processMessages(messages);
        }
      }

      // Update job progress
      await ImportJobs.updateAsync(
        { _id: jobId },
        { 
          $inc: { processedRecords: 1 },
          $set: { 
            status: 'processing',
            updatedAt: new Date()
          }
        }
      );

      return { success: true };

    } catch (error) {
      console.error('Process file content error:', error);
      
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
              
            // TODO: Process files in passes (demographics, friends, posts, etc.)
            facebookData = await processSelectedFiles(filesToProcess);
            
          } else if (fs.statSync(filePath).isDirectory()) {
            // Direct directory processing
            const inventory = await scanner.scanDirectory(filePath);
            
            const filesToProcess = selectedFiles.length > 0 
              ? inventory.files.filter(function(file) { return selectedFiles.includes(file.path); })
              : inventory.files;
              
            facebookData = await processSelectedFiles(filesToProcess);
          }

          // Process the data with FacebookImporter
          const importer = new FacebookImporter(this.userId, jobId);
          const results = await importer.processData(facebookData);

          console.log(`Facebook processing completed for user ${this.userId}:`, results);

        } catch (error) {
          console.error('Error processing from path:', error);
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
          console.error('Error processing uploaded file:', error);
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

    // Can only delete completed or failed jobs
    if (job.status === 'processing') {
      throw new Meteor.Error('job-active', 'Cannot delete active import job');
    }

    await ImportJobs.removeAsync({ _id: jobId });
    return true;
  },

  async 'facebook.clearAllData'() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    // Import collections
    const { 
      Patients, 
      Communications, 
      ClinicalImpressions, 
      Media, 
      Persons, 
      CareTeams 
    } = await import('../../fhir/collections');

    // Remove all user data
    await Promise.all([
      Patients.removeAsync({ userId: this.userId }),
      Communications.removeAsync({ userId: this.userId }),
      ClinicalImpressions.removeAsync({ userId: this.userId }),
      Media.removeAsync({ userId: this.userId }),
      Persons.removeAsync({ userId: this.userId }),
      CareTeams.removeAsync({ userId: this.userId }),
      ImportJobs.removeAsync({ userId: this.userId }),
      ProcessingQueues.removeAsync({ userId: this.userId })
    ]);

    return true;
  },

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

    console.log(`Cancelled import job ${jobId} by user ${this.userId}`);
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

    console.log(`Retrying import job ${jobId} (attempt ${(job.retryCount || 0) + 1})`);
    
    // Note: In a production system, you'd trigger the background processor here
    // For now, we'll just update the status and let the user re-upload
    
    return true;
  },

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

    // Can only delete completed, failed, or cancelled jobs
    if (job.status === 'processing' || job.status === 'pending') {
      throw new Meteor.Error('job-active', 'Cannot delete active import job. Cancel it first.');
    }

    // Note: This does NOT delete the imported data (Communications, ClinicalImpressions, etc.)
    // It only deletes the import job record itself for cleanup
    // The imported data remains in the system
    
    await ImportJobs.removeAsync({ _id: jobId });
    console.log(`Deleted import job record ${jobId} (data remains)`);
    
    return {
      success: true,
      message: 'Import job record deleted. Your imported data remains in the system.',
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
      canDelete: job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled'
    };
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

      console.log(`Created browser directory job ${jobId} for user ${this.userId} with ${selectedFiles.length} files`);
      return jobId;
      
    } catch (error) {
      console.error('Create browser directory job error:', error);
      throw new Meteor.Error('job-creation-failed', error.message);
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
        totalRecords: selectedFiles.length, // Use selected files count
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
  }
});