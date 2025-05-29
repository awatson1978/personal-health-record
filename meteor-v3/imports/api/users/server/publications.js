import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { 
  Patients, 
  Communications, 
  ClinicalImpressions, 
  Media, 
  ImportJobs 
} from '../../fhir/collections';

// Publish user's own data
Meteor.publish('user.patients', function() {
  if (!this.userId) {
    return this.ready();
  }

  return Patients.find({ userId: this.userId });
});

Meteor.publish('user.communications', function(limit = 50) {
  check(limit, Number);
  
  if (!this.userId) {
    return this.ready();
  }

  return Communications.find(
    { userId: this.userId },
    { 
      sort: { sent: -1 },
      limit: Math.min(limit, 200) // Cap at 200 for performance
    }
  );
});

Meteor.publish('user.communications.recent', function() {
  if (!this.userId) {
    return this.ready();
  }

  return Communications.find(
    { userId: this.userId },
    { 
      sort: { sent: -1 },
      limit: 10
    }
  );
});

Meteor.publish('user.clinicalImpressions', function(limit = 50) {
  check(limit, Number);
  
  if (!this.userId) {
    return this.ready();
  }

  return ClinicalImpressions.find(
    { userId: this.userId },
    { 
      sort: { date: -1 },
      limit: Math.min(limit, 200)
    }
  );
});

Meteor.publish('user.clinicalImpressions.recent', function() {
  if (!this.userId) {
    return this.ready();
  }

  return ClinicalImpressions.find(
    { userId: this.userId },
    { 
      sort: { date: -1 },
      limit: 10
    }
  );
});

Meteor.publish('user.media', function(limit = 50) {
  check(limit, Number);
  
  if (!this.userId) {
    return this.ready();
  }

  return Media.find(
    { userId: this.userId },
    { 
      sort: { createdDateTime: -1 },
      limit: Math.min(limit, 100)
    }
  );
});

Meteor.publish('user.media.recent', function() {
  if (!this.userId) {
    return this.ready();
  }

  return Media.find(
    { userId: this.userId },
    { 
      sort: { createdDateTime: -1 },
      limit: 5
    }
  );
});

Meteor.publish('user.imports', function() {
  if (!this.userId) {
    return this.ready();
  }

  return ImportJobs.find(
    { userId: this.userId },
    { 
      sort: { createdAt: -1 },
      limit: 20
    }
  );
});

Meteor.publish('user.imports.recent', function() {
  if (!this.userId) {
    return this.ready();
  }

  return ImportJobs.find(
    { userId: this.userId },
    { 
      sort: { createdAt: -1 },
      limit: 5
    }
  );
});

// Publish specific import job for real-time updates
Meteor.publish('import.job', function(jobId) {
  check(jobId, String);
  
  if (!this.userId) {
    return this.ready();
  }

  return ImportJobs.find({ 
    _id: jobId, 
    userId: this.userId 
  });
});