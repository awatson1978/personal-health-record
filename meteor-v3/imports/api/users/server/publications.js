// meteor-v3/imports/api/users/server/publications.js
import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { 
  Patients, 
  Communications, 
  ClinicalImpressions, 
  Media, 
  Persons,
  CareTeams,
  ImportJobs 
} from '../../fhir/collections';

// Publish user's own data
Meteor.publish('user.patients', function() {
  if (!this.userId) {
    return this.ready();
  }

  return Patients.find({ userId: this.userId });
});

// FIXED: Make communications publication more flexible
Meteor.publish('user.communications', function(limit = null) {
  if (limit !== null) {
    check(limit, Number);
  }
  
  if (!this.userId) {
    return this.ready();
  }

  const options = { 
    sort: { sent: -1 }
  };
  
  // Only apply limit if specifically requested
  if (limit !== null && limit > 0) {
    options.limit = Math.min(limit, 1000); // Higher cap for flexibility
  }

  return Communications.find({ userId: this.userId }, options);
});

// FIXED: Add unlimited communications publication for dashboard stats
Meteor.publish('user.communications.all', function() {
  if (!this.userId) {
    return this.ready();
  }

  // Return all communications for accurate counting
  return Communications.find({ userId: this.userId });
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

// FIXED: Make clinical impressions more flexible
Meteor.publish('user.clinicalImpressions', function(limit = null) {
  if (limit !== null) {
    check(limit, Number);
  }
  
  if (!this.userId) {
    return this.ready();
  }

  const options = { 
    sort: { date: -1 }
  };
  
  if (limit !== null && limit > 0) {
    options.limit = Math.min(limit, 1000);
  }

  return ClinicalImpressions.find({ userId: this.userId }, options);
});

// FIXED: Add unlimited clinical impressions publication
Meteor.publish('user.clinicalImpressions.all', function() {
  if (!this.userId) {
    return this.ready();
  }

  return ClinicalImpressions.find({ userId: this.userId });
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

// FIXED: Make media more flexible
Meteor.publish('user.media', function(limit = null) {
  if (limit !== null) {
    check(limit, Number);
  }
  
  if (!this.userId) {
    return this.ready();
  }

  const options = { 
    sort: { createdDateTime: -1 }
  };
  
  if (limit !== null && limit > 0) {
    options.limit = Math.min(limit, 500);
  }

  return Media.find({ userId: this.userId }, options);
});

// FIXED: Add unlimited media publication
Meteor.publish('user.media.all', function() {
  if (!this.userId) {
    return this.ready();
  }

  return Media.find({ userId: this.userId });
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

// FIXED: Add Persons publications (from Facebook friends)
Meteor.publish('user.persons', function(limit = null) {
  if (limit !== null) {
    check(limit, Number);
  }
  
  if (!this.userId) {
    return this.ready();
  }

  const options = { 
    sort: { createdAt: -1 }
  };
  
  if (limit !== null && limit > 0) {
    options.limit = Math.min(limit, 1000);
  }

  return Persons.find({ userId: this.userId }, options);
});

Meteor.publish('user.persons.all', function() {
  if (!this.userId) {
    return this.ready();
  }

  return Persons.find({ userId: this.userId });
});

Meteor.publish('user.persons.recent', function() {
  if (!this.userId) {
    return this.ready();
  }

  return Persons.find(
    { userId: this.userId },
    { 
      sort: { createdAt: -1 },
      limit: 10
    }
  );
});

// Add CareTeams publications
Meteor.publish('user.careTeams', function(limit = null) {
  if (limit !== null) {
    check(limit, Number);
  }
  
  if (!this.userId) {
    return this.ready();
  }

  const options = { 
    sort: { createdAt: -1 }
  };
  
  if (limit !== null && limit > 0) {
    options.limit = Math.min(limit, 100);
  }

  return CareTeams.find({ userId: this.userId }, options);
});

Meteor.publish('user.careTeams.all', function() {
  if (!this.userId) {
    return this.ready();
  }

  return CareTeams.find({ userId: this.userId });
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

// FIXED: Add publications for accurate counting including Persons
Meteor.publish('user.counts', function() {
  if (!this.userId) {
    return this.ready();
  }

  // This is a special publication that just ensures all user data is available
  // for counting without limits
  return [
    Patients.find({ userId: this.userId }),
    Communications.find({ userId: this.userId }),
    ClinicalImpressions.find({ userId: this.userId }),
    Media.find({ userId: this.userId }),
    Persons.find({ userId: this.userId }),
    CareTeams.find({ userId: this.userId })
  ];
});