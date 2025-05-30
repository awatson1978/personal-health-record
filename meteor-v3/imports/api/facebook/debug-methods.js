// meteor-v3/imports/api/facebook/debug-methods.js
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
} from '../fhir/collections';

Meteor.methods({
  async 'debug.checkFHIRData'() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    try {
      // Count all FHIR resources for this user
      const counts = {
        patients: await Patients.find({ userId: this.userId }).countAsync(),
        communications: await Communications.find({ userId: this.userId }).countAsync(),
        clinicalImpressions: await ClinicalImpressions.find({ userId: this.userId }).countAsync(),
        media: await Media.find({ userId: this.userId }).countAsync(),
        persons: await Persons.find({ userId: this.userId }).countAsync(),
        careTeams: await CareTeams.find({ userId: this.userId }).countAsync()
      };

      // Get sample records
      const samples = {
        patients: await Patients.find({ userId: this.userId }, { limit: 2 }).fetchAsync(),
        communications: await Communications.find({ userId: this.userId }, { limit: 2 }).fetchAsync(),
        clinicalImpressions: await ClinicalImpressions.find({ userId: this.userId }, { limit: 2 }).fetchAsync()
      };

      // Check import jobs
      const importJobs = await ImportJobs.find({ userId: this.userId }).fetchAsync();

      console.log('🔍 FHIR Data Debug for user', this.userId);
      console.log('📊 Counts:', counts);
      console.log('📄 Sample records:', samples);
      console.log('📥 Import jobs:', importJobs.map(job => ({
        id: job._id,
        status: job.status,
        results: job.results,
        errors: job.errors
      })));

      return {
        userId: this.userId,
        counts,
        samples,
        importJobs: importJobs.map(job => ({
          id: job._id,
          filename: job.filename,
          status: job.status,
          results: job.results,
          errorCount: job.errorCount,
          errors: job.errors
        }))
      };

    } catch (error) {
      console.error('❌ Debug check error:', error);
      throw error;
    }
  },

  async 'debug.createTestFHIRRecord'() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    try {
      // Create a test Communication record
      const testCommunication = {
        resourceType: 'Communication',
        id: 'test-' + Date.now(),
        status: 'completed',
        sent: new Date(),
        sender: {
          reference: `Patient/${this.userId}`,
          display: 'Test User'
        },
        recipient: [{
          reference: `Patient/${this.userId}`,
          display: 'Self'
        }],
        payload: [{
          contentString: 'This is a test communication to verify FHIR creation is working.'
        }]
      };

      console.log('🧪 Creating test Communication:', testCommunication);
      
      const commId = await Communications.insertWithUser(this.userId, testCommunication);
      
      console.log('✅ Test Communication created with ID:', commId);

      // Verify it was created
      const verification = await Communications.findOneAsync({ _id: commId });
      console.log('✅ Verification record:', verification);

      return {
        success: true,
        communicationId: commId,
        verification: verification
      };

    } catch (error) {
      console.error('❌ Test record creation error:', error);
      throw error;
    }
  },

  async 'debug.testProcessSinglePost'() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    try {
      // Import the FacebookImporter
      const { FacebookImporter } = await import('../importer');
      
      // Create a test import job
      const jobId = await ImportJobs.insertAsync({
        userId: this.userId,
        filename: 'debug-test.json',
        status: 'processing',
        createdAt: new Date()
      });

      console.log('🧪 Created debug job:', jobId);

      // Create importer instance
      const importer = new FacebookImporter(this.userId, jobId);
      
      // Test single post processing
      const testPost = {
        timestamp: Math.floor(Date.now() / 1000),
        data: [{
          post: "I'm feeling great today! Had a wonderful checkup at the doctor."
        }]
      };

      console.log('🧪 Processing test post:', testPost);
      
      await importer.processPost(testPost);
      
      console.log('✅ Test post processed, final stats:', importer.stats);

      // Check what was created
      const communications = await Communications.find({ userId: this.userId }).fetchAsync();
      const clinicalImpressions = await ClinicalImpressions.find({ userId: this.userId }).fetchAsync();

      return {
        success: true,
        stats: importer.stats,
        communications: communications,
        clinicalImpressions: clinicalImpressions
      };

    } catch (error) {
      console.error('❌ Test processing error:', error);
      throw error;
    }
  }
});