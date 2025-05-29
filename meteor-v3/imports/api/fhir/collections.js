import { Mongo } from 'meteor/mongo';
import { check } from 'meteor/check';
import { get } from 'lodash';

// Base FHIR Resource Collection
class FHIRCollection extends Mongo.Collection {
  constructor(name, options = {}) {
    super(name, options);
    
    // Add common FHIR resource validation
    this.attachSchema({
      resourceType: {
        type: String,
        required: true
      },
      id: {
        type: String,
        optional: true
      },
      meta: {
        type: Object,
        optional: true
      },
      'meta.versionId': {
        type: String,
        optional: true
      },
      'meta.lastUpdated': {
        type: Date,
        optional: true
      },
      'meta.source': {
        type: String,
        optional: true,
        defaultValue: 'facebook-import'
      },
      userId: {
        type: String,
        required: true
      },
      createdAt: {
        type: Date,
        defaultValue: new Date()
      },
      updatedAt: {
        type: Date,
        defaultValue: new Date()
      }
    });
  }

  // Helper to find user's resources
  findByUser(userId, selector = {}, options = {}) {
    check(userId, String);
    return this.find({ ...selector, userId }, options);
  }

  // Helper to insert with user context
  insertWithUser(userId, doc) {
    check(userId, String);
    return this.insertAsync({
      ...doc,
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      meta: {
        ...get(doc, 'meta', {}),
        lastUpdated: new Date(),
        source: 'facebook-import'
      }
    });
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

// Import Jobs Schema
ImportJobs.attachSchema({
  userId: {
    type: String,
    required: true
  },
  filename: {
    type: String,
    required: true
  },
  status: {
    type: String,
    allowedValues: ['pending', 'processing', 'completed', 'failed'],
    defaultValue: 'pending'
  },
  progress: {
    type: Number,
    min: 0,
    max: 100,
    defaultValue: 0
  },
  totalRecords: {
    type: Number,
    defaultValue: 0
  },
  processedRecords: {
    type: Number,
    defaultValue: 0
  },
  errorCount: {
    type: Number,
    defaultValue: 0
  },
  errors: {
    type: Array,
    defaultValue: []
  },
  'errors.$': {
    type: Object
  },
  'errors.$.message': {
    type: String
  },
  'errors.$.timestamp': {
    type: Date
  },
  'errors.$.context': {
    type: Object,
    optional: true
  },
  results: {
    type: Object,
    defaultValue: {}
  },
  'results.patients': {
    type: Number,
    defaultValue: 0
  },
  'results.communications': {
    type: Number,
    defaultValue: 0
  },
  'results.clinicalImpressions': {
    type: Number,
    defaultValue: 0
  },
  'results.media': {
    type: Number,
    defaultValue: 0
  },
  'results.persons': {
    type: Number,
    defaultValue: 0
  },
  startedAt: {
    type: Date,
    optional: true
  },
  completedAt: {
    type: Date,
    optional: true
  },
  createdAt: {
    type: Date,
    defaultValue: new Date()
  },
  updatedAt: {
    type: Date,
    defaultValue: new Date()
  }
});

// Processing Queue Schema
ProcessingQueues.attachSchema({
  jobId: {
    type: String,
    required: true
  },
  userId: {
    type: String,
    required: true
  },
  type: {
    type: String,
    allowedValues: ['facebook-post', 'facebook-friend', 'facebook-media'],
    required: true
  },
  data: {
    type: Object,
    required: true
  },
  status: {
    type: String,
    allowedValues: ['pending', 'processing', 'completed', 'failed'],
    defaultValue: 'pending'
  },
  priority: {
    type: Number,
    defaultValue: 1
  },
  attempts: {
    type: Number,
    defaultValue: 0
  },
  maxAttempts: {
    type: Number,
    defaultValue: 3
  },
  error: {
    type: String,
    optional: true
  },
  processedAt: {
    type: Date,
    optional: true
  },
  createdAt: {
    type: Date,
    defaultValue: new Date()
  }
});

// Indexes for better performance
if (Meteor.isServer) {
  // User-based indexes
  Patients.rawCollection().createIndex({ userId: 1, createdAt: -1 });
  Communications.rawCollection().createIndex({ userId: 1, 'sent': -1 });
  ClinicalImpressions.rawCollection().createIndex({ userId: 1, 'date': -1 });
  Media.rawCollection().createIndex({ userId: 1, 'createdDateTime': -1 });
  
  // Processing indexes
  ImportJobs.rawCollection().createIndex({ userId: 1, status: 1, createdAt: -1 });
  ProcessingQueues.rawCollection().createIndex({ jobId: 1, status: 1, priority: -1 });
}