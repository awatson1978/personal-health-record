import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import { get } from 'lodash';
import fs from 'fs';
import path from 'path';
import yauzl from 'yauzl';
import { v4 as uuidv4 } from 'uuid';

import { ImportJobs, ProcessingQueues } from '../../fhir/collections';
import { FacebookImporter } from '../importer';

Meteor.methods({
  async 'facebook.uploadAndProcess'(filename, fileData) {
    check(filename, String);
    check(fileData, String); // Base64 encoded file data
    
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in to upload files');
    }

    // Validate file type
    const allowedTypes = get(Meteor.settings, 'private.security.allowedFileTypes', ['.zip', '.json']);
    const fileExt = path.extname(filename).toLowerCase();
    if (!allowedTypes.includes(fileExt)) {
      throw new Meteor.Error('invalid-file-type', `File type ${fileExt} not allowed`);
    }

    // Validate file size
    const maxSize = get(Meteor.settings, 'private.security.maxUploadSize', 104857600); // 100MB default
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
      setImmediate(async () => {
        try {
          await this.processUploadedFile(jobId, filePath, filename);
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

  async processUploadedFile(jobId, filePath, filename) {
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
        facebookData = await this.extractAndParseZip(filePath);
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
  },

  async extractAndParseZip(zipPath) {
    return new Promise((resolve, reject) => {
      const extractedData = {};
      
      yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
        if (err) return reject(err);

        let filesProcessed = 0;
        let totalFiles = 0;

        // Count total files first
        zipfile.on('entry', () => totalFiles++);
        
        zipfile.readEntry();
        
        zipfile.on('entry', (entry) => {
          if (/\/$/.test(entry.fileName)) {
            // Directory entry
            zipfile.readEntry();
          } else {
            // File entry
            this.processZipEntry(zipfile, entry, extractedData, (error) => {
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

        zipfile.on('end', () => {
          if (filesProcessed >= totalFiles) {
            resolve(extractedData);
          }
        });

        zipfile.on('error', reject);
      });
    });
  },

  processZipEntry(zipfile, entry, extractedData, callback) {
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

    const isRelevant = relevantFiles.some(file => fileName.includes(file));
    if (!isRelevant) {
      return callback();
    }

    zipfile.openReadStream(entry, (err, readStream) => {
      if (err) return callback(err);

      let data = '';
      readStream.on('data', (chunk) => {
        data += chunk.toString('utf8');
      });

      readStream.on('end', () => {
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
  }
});