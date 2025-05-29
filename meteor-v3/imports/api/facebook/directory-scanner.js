// meteor-v3/imports/api/facebook/directory-scanner.js
import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { get } from 'lodash';
import fs from 'fs';
import path from 'path';
import yauzl from 'yauzl';

export class DirectoryScanner {
  constructor() {
    this.workingDir = get(Meteor.settings, 'private.processing.workingDirectory', '/tmp/facebook-fhir-processing');
    this.testParseSize = get(Meteor.settings, 'private.processing.testParseSize', 104857600); // 100MB
  }

  async scanZipFile(filePath) {
    check(filePath, String);
    
    if (!fs.existsSync(filePath)) {
      throw new Meteor.Error('file-not-found', `File not found: ${filePath}`);
    }

    const fileStats = fs.statSync(filePath);
    const fileSize = fileStats.size;

    return new Promise(function(resolve, reject) {
      const inventory = {
        filePath: filePath,
        totalSize: fileSize,
        totalSizeFormatted: formatBytes(fileSize),
        files: [],
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
          testParseRecommendation: null
        }
      };

      yauzl.open(filePath, { lazyEntries: true }, function(err, zipfile) {
        if (err) return reject(err);

        zipfile.readEntry();

        zipfile.on('entry', function(entry) {
          if (!/\/$/.test(entry.fileName)) {
            // File entry
            const fileInfo = {
              name: entry.fileName,
              size: entry.uncompressedSize,
              sizeFormatted: formatBytes(entry.uncompressedSize),
              category: categorizeFile(entry.fileName),
              path: entry.fileName
            };

            inventory.files.push(fileInfo);
            inventory.categories[fileInfo.category].push(fileInfo);
            inventory.summary.totalFiles++;
            inventory.summary.totalSize += entry.uncompressedSize;
          }
          zipfile.readEntry();
        });

        zipfile.on('end', function() {
          // Generate processing recommendations
          inventory.summary.totalSizeFormatted = formatBytes(inventory.summary.totalSize);
          inventory.summary.testParseRecommendation = generateTestParseRecommendation(inventory);
          
          resolve(inventory);
        });

        zipfile.on('error', reject);
      });
    });
  }

  async scanDirectory(dirPath) {
    check(dirPath, String);
    
    if (!fs.existsSync(dirPath)) {
      throw new Meteor.Error('directory-not-found', `Directory not found: ${dirPath}`);
    }

    const inventory = {
      dirPath: dirPath,
      files: [],
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
        testParseRecommendation: null
      }
    };

    await scanDirectoryRecursive(dirPath, dirPath, inventory);

    // Generate processing recommendations
    inventory.summary.totalSizeFormatted = formatBytes(inventory.summary.totalSize);
    inventory.summary.testParseRecommendation = generateTestParseRecommendation(inventory);

    return inventory;
  }

  async extractZipToWorking(filePath, jobId) {
    check(filePath, String);
    check(jobId, String);

    const extractPath = path.join(this.workingDir, jobId, 'extracted');
    
    // Ensure directory exists
    if (!fs.existsSync(extractPath)) {
      fs.mkdirSync(extractPath, { recursive: true });
    }

    return new Promise(function(resolve, reject) {
      yauzl.open(filePath, { lazyEntries: true }, function(err, zipfile) {
        if (err) return reject(err);

        let extractedFiles = [];
        let totalEntries = 0;
        let processedEntries = 0;

        // Count entries first
        zipfile.on('entry', function() { totalEntries++; });
        zipfile.readEntry();

        zipfile.on('entry', function(entry) {
          if (/\/$/.test(entry.fileName)) {
            // Directory entry
            const dirPath = path.join(extractPath, entry.fileName);
            if (!fs.existsSync(dirPath)) {
              fs.mkdirSync(dirPath, { recursive: true });
            }
            processedEntries++;
            if (processedEntries >= totalEntries) {
              resolve({ extractPath, extractedFiles });
            } else {
              zipfile.readEntry();
            }
          } else {
            // File entry
            zipfile.openReadStream(entry, function(err, readStream) {
              if (err) {
                console.error(`Error extracting ${entry.fileName}:`, err);
                processedEntries++;
                if (processedEntries >= totalEntries) {
                  resolve({ extractPath, extractedFiles });
                } else {
                  zipfile.readEntry();
                }
                return;
              }

              const fullPath = path.join(extractPath, entry.fileName);
              const dir = path.dirname(fullPath);
              
              if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
              }

              const writeStream = fs.createWriteStream(fullPath);
              readStream.pipe(writeStream);

              writeStream.on('close', function() {
                extractedFiles.push({
                  originalPath: entry.fileName,
                  extractedPath: fullPath,
                  size: entry.uncompressedSize
                });

                processedEntries++;
                if (processedEntries >= totalEntries) {
                  resolve({ extractPath, extractedFiles });
                } else {
                  zipfile.readEntry();
                }
              });

              writeStream.on('error', function(err) {
                console.error(`Error writing ${entry.fileName}:`, err);
                processedEntries++;
                if (processedEntries >= totalEntries) {
                  resolve({ extractPath, extractedFiles });
                } else {
                  zipfile.readEntry();
                }
              });
            });
          }
        });

        zipfile.on('error', reject);
      });
    });
  }
}

// Helper functions
function categorizeFile(fileName) {
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
}

async function scanDirectoryRecursive(basePath, currentPath, inventory) {
  const entries = fs.readdirSync(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(currentPath, entry.name);
    const relativePath = path.relative(basePath, fullPath);

    if (entry.isDirectory()) {
      await scanDirectoryRecursive(basePath, fullPath, inventory);
    } else {
      const stats = fs.statSync(fullPath);
      const fileInfo = {
        name: entry.name,
        path: relativePath,
        fullPath: fullPath,
        size: stats.size,
        sizeFormatted: formatBytes(stats.size),
        category: categorizeFile(entry.name),
        modified: stats.mtime
      };

      inventory.files.push(fileInfo);
      inventory.categories[fileInfo.category].push(fileInfo);
      inventory.summary.totalFiles++;
      inventory.summary.totalSize += stats.size;
    }
  }
}

function generateTestParseRecommendation(inventory) {
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
      break; // We're close to the limit
    }
  }

  if (recommendation.suggested.length === 0) {
    recommendation.reason = 'All files are too large for test parsing. Consider processing in production mode.';
  } else {
    recommendation.reason = `Recommended ${recommendation.suggested.length} files (${formatBytes(recommendation.totalSize)}) for initial test parsing.`;
  }

  return recommendation;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}