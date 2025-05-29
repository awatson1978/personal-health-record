import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { get } from 'lodash';

import { ImportJobs, ProcessingQueues } from '../../fhir/collections';

Meteor.methods({
  async 'processing.getQueueStatus'() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    const userJobs = await ImportJobs.find({ 
      userId: this.userId 
    }).fetchAsync();

    const queueItems = await ProcessingQueues.find({ 
      userId: this.userId 
    }).fetchAsync();

    return {
      jobs: userJobs,
      queue: queueItems,
      summary: {
        totalJobs: userJobs.length,
        completedJobs: userJobs.filter(function(job) { return job.status === 'completed'; }).length,
        failedJobs: userJobs.filter(function(job) { return job.status === 'failed'; }).length,
        activeJobs: userJobs.filter(function(job) { return job.status === 'processing'; }).length,
        queuedItems: queueItems.filter(function(item) { return item.status === 'pending'; }).length
      }
    };
  },

  async 'processing.retryFailedJob'(jobId) {
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

    if (job.status !== 'failed') {
      throw new Meteor.Error('job-not-failed', 'Job is not in failed state');
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
          updatedAt: new Date()
        }
      }
    );

    // TODO: Re-queue the processing
    // This would typically trigger the background processor
    // For now, we'll just update the status

    return true;
  },

  async 'processing.cancelJob'(jobId) {
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

    // Update job status
    await ImportJobs.updateAsync(
      { _id: jobId },
      { 
        $set: {
          status: 'cancelled',
          completedAt: new Date(),
          updatedAt: new Date()
        }
      }
    );

    // Remove any pending queue items for this job
    await ProcessingQueues.removeAsync({ jobId: jobId });

    return true;
  },

  async 'processing.getJobDetails'(jobId) {
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

    const queueItems = await ProcessingQueues.find({ 
      jobId: jobId 
    }).fetchAsync();

    return {
      job,
      queueItems,
      queueSummary: {
        total: queueItems.length,
        pending: queueItems.filter(function(item) { return item.status === 'pending'; }).length,
        processing: queueItems.filter(function(item) { return item.status === 'processing'; }).length,
        completed: queueItems.filter(function(item) { return item.status === 'completed'; }).length,
        failed: queueItems.filter(function(item) { return item.status === 'failed'; }).length
      }
    };
  },

  async 'processing.clearUserData'() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    // Import collections dynamically to avoid circular dependencies
    const { 
      Patients, 
      Communications, 
      ClinicalImpressions, 
      Media, 
      Persons, 
      CareTeams 
    } = await import('../../fhir/collections');

    // Get count before deletion for reporting
    const counts = {
      patients: await Patients.find({ userId: this.userId }).countAsync(),
      communications: await Communications.find({ userId: this.userId }).countAsync(),
      clinicalImpressions: await ClinicalImpressions.find({ userId: this.userId }).countAsync(),
      media: await Media.find({ userId: this.userId }).countAsync(),
      persons: await Persons.find({ userId: this.userId }).countAsync(),
      careTeams: await CareTeams.find({ userId: this.userId }).countAsync(),
      importJobs: await ImportJobs.find({ userId: this.userId }).countAsync(),
      queueItems: await ProcessingQueues.find({ userId: this.userId }).countAsync()
    };

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

    console.log(`Cleared user data for ${this.userId}:`, counts);

    return {
      success: true,
      deletedCounts: counts
    };
  },

  async 'processing.getSystemStats'() {
    // Only allow admins to view system stats
    const user = await Meteor.users.findOneAsync({ _id: this.userId });
    if (!user || !get(user, 'profile.isAdmin', false)) {
      throw new Meteor.Error('not-authorized', 'Admin access required');
    }

    const totalJobs = await ImportJobs.find({}).countAsync();
    const activeJobs = await ImportJobs.find({ status: 'processing' }).countAsync();
    const totalQueueItems = await ProcessingQueues.find({}).countAsync();
    const pendingQueueItems = await ProcessingQueues.find({ status: 'pending' }).countAsync();

    // Import collections for total counts
    const { 
      Patients, 
      Communications, 
      ClinicalImpressions, 
      Media 
    } = await import('../../fhir/collections');

    const totalPatients = await Patients.find({}).countAsync();
    const totalCommunications = await Communications.find({}).countAsync();
    const totalClinicalImpressions = await ClinicalImpressions.find({}).countAsync();
    const totalMedia = await Media.find({}).countAsync();

    return {
      processing: {
        totalJobs,
        activeJobs,
        totalQueueItems,
        pendingQueueItems
      },
      data: {
        totalPatients,
        totalCommunications,
        totalClinicalImpressions,
        totalMedia
      },
      system: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        nodeVersion: process.version
      }
    };
  }
});