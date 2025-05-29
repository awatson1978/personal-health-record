// meteor-v3/imports/api/fhir/collections.js
import { Mongo } from 'meteor/mongo';
import { check } from 'meteor/check';
import { get } from 'lodash';

// Base FHIR Resource Collection
class FHIRCollection extends Mongo.Collection {
  constructor(name, options = {}) {
    super(name, options);
  }

  // Helper to find user's resources
  findByUser(userId, selector = {}, options = {}) {
    check(userId, String);
    return this.find({ ...selector, userId }, options);
  }

  // Helper to insert with user context
  async insertWithUser(userId, doc) {
    check(userId, String);
    
    // Validate required FHIR fields
    if (!doc.resourceType) {
      throw new Error('Resource must have a resourceType');
    }

    const docToInsert = {
      ...doc,
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      meta: {
        ...get(doc, 'meta', {}),
        lastUpdated: new Date(),
        source: 'facebook-import'
      }
    };

    return this.insertAsync(docToInsert);
  }

  // Helper to update with user context
  async updateWithUser(userId, selector, modifier, options = {}) {
    check(userId, String);
    
    // Ensure user can only update their own documents
    const userSelector = { ...selector, userId };
    
    // Add updatedAt to modifier
    if (!modifier.$set) modifier.$set = {};
    modifier.$set.updatedAt = new Date();
    if (!modifier.$set['meta.lastUpdated']) {
      modifier.$set['meta.lastUpdated'] = new Date();
    }

    return this.updateAsync(userSelector, modifier, options);
  }

  // Helper to remove user's documents
  async removeWithUser(userId, selector = {}) {
    check(userId, String);
    const userSelector = { ...selector, userId };
    return this.removeAsync(userSelector);
  }
}

// FHIR Collections
export const Patients = new FHIRCollection('patients');
export const Communications = new FHIRCollection('communications');
export const ClinicalImpressions = new FHIRCollection('clinicalImpressions');
export const Media = new FHIRCollection('media');
export const Persons = new FHIRCollection('persons');
export const CareTeams = new FHIRCollection('careTeams');

// Processing Collections
export const ImportJobs = new Mongo.Collection('importJobs');
export const ProcessingQueues = new Mongo.Collection('processingQueues');

// Helper function to validate import job data
function validateImportJob(doc) {
  if (!doc.userId) throw new Error('ImportJob must have userId');
  if (!doc.filename) throw new Error('ImportJob must have filename');
  if (!['pending', 'processing', 'completed', 'failed'].includes(doc.status)) {
    throw new Error('ImportJob status must be pending, processing, completed, or failed');
  }
  return true;
}

// Helper function to validate processing queue data
function validateProcessingQueue(doc) {
  if (!doc.jobId) throw new Error('ProcessingQueue must have jobId');
  if (!doc.userId) throw new Error('ProcessingQueue must have userId');
  if (!doc.type) throw new Error('ProcessingQueue must have type');
  if (!doc.data) throw new Error('ProcessingQueue must have data');
  return true;
}

// Override insert methods to add validation
const originalImportJobsInsert = ImportJobs.insertAsync;
ImportJobs.insertAsync = async function(doc, callback) {
  validateImportJob(doc);
  
  const docToInsert = {
    status: 'pending',
    progress: 0,
    totalRecords: 0,
    processedRecords: 0,
    errorCount: 0,
    errors: [],
    results: {
      patients: 0,
      communications: 0,
      clinicalImpressions: 0,
      media: 0,
      persons: 0
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...doc
  };

  return originalImportJobsInsert.call(this, docToInsert, callback);
};

const originalProcessingQueuesInsert = ProcessingQueues.insertAsync;
ProcessingQueues.insertAsync = async function(doc, callback) {
  validateProcessingQueue(doc);
  
  const docToInsert = {
    status: 'pending',
    priority: 1,
    attempts: 0,
    maxAttempts: 3,
    createdAt: new Date(),
    ...doc
  };

  return originalProcessingQueuesInsert.call(this, docToInsert, callback);
};

// Indexes for better performance
if (Meteor.isServer) {
  Meteor.startup(async function() {
    try {
      // User-based indexes for FHIR collections
      await Patients.rawCollection().createIndex({ userId: 1, createdAt: -1 });
      await Communications.rawCollection().createIndex({ userId: 1, 'sent': -1 });
      await ClinicalImpressions.rawCollection().createIndex({ userId: 1, 'date': -1 });
      await Media.rawCollection().createIndex({ userId: 1, 'createdDateTime': -1 });
      await Persons.rawCollection().createIndex({ userId: 1, createdAt: -1 });
      await CareTeams.rawCollection().createIndex({ userId: 1, createdAt: -1 });
      
      // Processing indexes
      await ImportJobs.rawCollection().createIndex({ userId: 1, status: 1, createdAt: -1 });
      await ProcessingQueues.rawCollection().createIndex({ jobId: 1, status: 1, priority: -1 });
      
      console.log('✅ Database indexes created successfully');
    } catch (error) {
      console.error('❌ Error creating database indexes:', error);
    }
  });
}