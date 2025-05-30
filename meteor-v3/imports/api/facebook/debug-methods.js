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
        communications: await Communications.find({ userId: this.userId }, { limit: 3 }).fetchAsync(),
        clinicalImpressions: await ClinicalImpressions.find({ userId: this.userId }, { limit: 2 }).fetchAsync(),
        media: await Media.find({ userId: this.userId }, { limit: 2 }).fetchAsync(),
        persons: await Persons.find({ userId: this.userId }, { limit: 2 }).fetchAsync()
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

  async 'debug.createTestFHIRRecords'() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    try {
      console.log('🧪 Creating comprehensive test FHIR records...');
      const results = {
        created: {
          communications: 0,
          clinicalImpressions: 0,
          media: 0,
          persons: 0,
          careTeams: 0
        },
        ids: []
      };

      // Create test Communications (Facebook posts)
      const testPosts = [
        'Just had my annual checkup - everything looks great! 💪',
        'Feeling under the weather today, might need to rest.',
        'Had a great workout at the gym this morning!',
        'Doctor recommended I start taking vitamin D supplements.',
        'Celebrated my birthday with friends and family! 🎉'
      ];

      for (const [index, postContent] of testPosts.entries()) {
        const testCommunication = {
          resourceType: 'Communication',
          id: `test-comm-${Date.now()}-${index}`,
          status: 'completed',
          sent: new Date(Date.now() - (index * 24 * 60 * 60 * 1000)), // Spread over days
          sender: {
            reference: `Patient/${this.userId}`,
            display: 'Self'
          },
          recipient: [{
            reference: `Patient/${this.userId}`,
            display: 'Facebook Timeline'
          }],
          payload: [{
            contentString: postContent
          }],
          category: [{
            text: 'Social Media Post'
          }]
        };

        const commId = await Communications.insertWithUser(this.userId, testCommunication);
        results.created.communications++;
        results.ids.push(`Communication/${commId}`);
        console.log(`✅ Created test communication ${index + 1}: ${commId}`);

        // Create clinical impression for health-related posts
        if (postContent.includes('checkup') || postContent.includes('doctor') || postContent.includes('weather')) {
          const clinicalImpression = {
            resourceType: 'ClinicalImpression',
            id: `test-clinical-${Date.now()}-${index}`,
            status: 'completed',
            subject: {
              reference: `Patient/${this.userId}`,
              display: 'Self'
            },
            assessor: {
              reference: `Patient/${this.userId}`,
              display: 'Self-reported via social media'
            },
            date: new Date(Date.now() - (index * 24 * 60 * 60 * 1000)),
            description: `Clinical content detected: "${postContent}"`,
            investigation: [{
              code: {
                text: 'Social Media Health Report'
              },
              item: [{
                reference: `Communication/${commId}`,
                display: 'Source social media post'
              }]
            }],
            finding: [{
              item: {
                text: postContent.includes('checkup') ? 'Routine health maintenance' : 
                      postContent.includes('doctor') ? 'Medical consultation' : 'General health status'
              },
              cause: 'self-reported'
            }]
          };

          const clinicalId = await ClinicalImpressions.insertWithUser(this.userId, clinicalImpression);
          results.created.clinicalImpressions++;
          results.ids.push(`ClinicalImpression/${clinicalId}`);
          console.log(`🏥 Created test clinical impression ${index + 1}: ${clinicalId}`);
        }
      }

      // Create test Media resources (Facebook photos)
      const testMediaItems = [
        { title: 'Vacation Photo', type: 'photo', contentType: 'image/jpeg' },
        { title: 'Workout Video', type: 'video', contentType: 'video/mp4' },
        { title: 'Family Dinner', type: 'photo', contentType: 'image/png' }
      ];

      for (const [index, mediaItem] of testMediaItems.entries()) {
        const testMedia = {
          resourceType: 'Media',
          id: `test-media-${Date.now()}-${index}`,
          status: 'completed',
          type: { text: mediaItem.type },
          subject: {
            reference: `Patient/${this.userId}`,
            display: 'Self'
          },
          createdDateTime: new Date(Date.now() - (index * 12 * 60 * 60 * 1000)), // Spread over hours
          content: {
            contentType: mediaItem.contentType,
            url: `/test-media/${mediaItem.title.toLowerCase().replace(/\s+/g, '-')}.jpg`,
            title: mediaItem.title,
            size: Math.floor(Math.random() * 1000000) + 100000 // Random size
          }
        };

        const mediaId = await Media.insertWithUser(this.userId, testMedia);
        results.created.media++;
        results.ids.push(`Media/${mediaId}`);
        console.log(`📸 Created test media ${index + 1}: ${mediaId}`);
      }

      // Create test Persons (Facebook friends)
      const testFriends = [
        'Alice Johnson',
        'Bob Smith', 
        'Charlie Brown',
        'Diana Wilson',
        'Elena Garcia'
      ];

      const careTeamParticipants = [];
      for (const [index, friendName] of testFriends.entries()) {
        const testPerson = {
          resourceType: 'Person',
          id: `test-person-${Date.now()}-${index}`,
          active: true,
          name: [{
            text: friendName
          }],
          link: [{
            target: {
              reference: `Patient/${this.userId}`
            },
            assurance: 'level2'
          }]
        };

        const personId = await Persons.insertWithUser(this.userId, testPerson);
        results.created.persons++;
        results.ids.push(`Person/${personId}`);
        console.log(`👤 Created test person ${index + 1}: ${personId} (${friendName})`);

        // Add to care team
        careTeamParticipants.push({
          member: {
            reference: `Person/${personId}`,
            display: friendName
          },
          role: [{
            text: 'Social Contact'
          }],
          period: {
            start: new Date()
          }
        });
      }

      // Create CareTeam
      if (careTeamParticipants.length > 0) {
        const testCareTeam = {
          resourceType: 'CareTeam',
          id: `test-careteam-${Date.now()}`,
          status: 'active',
          name: 'Test Social Support Network',
          subject: {
            reference: `Patient/${this.userId}`,
            display: 'Self'
          },
          participant: careTeamParticipants
        };

        const careTeamId = await CareTeams.insertWithUser(this.userId, testCareTeam);
        results.created.careTeams++;
        results.ids.push(`CareTeam/${careTeamId}`);
        console.log(`👥 Created test care team: ${careTeamId}`);
      }

      console.log('✅ Test FHIR records creation completed:', results);
      return results;

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
      
      // Test single post processing with realistic Facebook structure
      const testPost = {
        timestamp: Math.floor(Date.now() / 1000),
        data: [{
          post: "I'm feeling great today! Had a wonderful checkup at the doctor and everything looks perfect. Really grateful for good health! 💪🩺"
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
        clinicalImpressions: clinicalImpressions,
        testPost: testPost,
        jobId: jobId
      };

    } catch (error) {
      console.error('❌ Test processing error:', error);
      throw error;
    }
  },

  async 'debug.simulateFacebookImport'() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    try {
      console.log('🧪 Simulating complete Facebook import...');

      // Import the FacebookImporter
      const { FacebookImporter } = await import('../importer');
      
      // Create a test import job
      const jobId = await ImportJobs.insertAsync({
        userId: this.userId,
        filename: 'debug-facebook-simulation.json',
        status: 'processing',
        createdAt: new Date()
      });

      // Create importer instance
      const importer = new FacebookImporter(this.userId, jobId);
      
      // Simulate realistic Facebook export data
      const simulatedFacebookData = {
        posts: [
          {
            timestamp: Math.floor(Date.now() / 1000) - 86400,
            data: [{ post: "Just finished my morning run! Feeling energized and ready for the day ahead 🏃‍♂️" }]
          },
          {
            timestamp: Math.floor(Date.now() / 1000) - 172800,
            data: [{ post: "Had my yearly physical today. Doctor says my blood pressure is perfect! So relieved 😌" }]
          },
          {
            timestamp: Math.floor(Date.now() / 1000) - 259200,
            data: [{ post: "Celebrating my birthday with family! Grateful for another year of good health 🎂🎉" }]
          }
        ],
        friends: [
          { name: "Dr. Sarah Mitchell", timestamp: Math.floor(Date.now() / 1000) },
          { name: "John Fitness Trainer", timestamp: Math.floor(Date.now() / 1000) },
          { name: "Mary Wellness Coach", timestamp: Math.floor(Date.now() / 1000) }
        ],
        photos: [
          {
            uri: "/photos/workout_selfie.jpg",
            creation_timestamp: Math.floor(Date.now() / 1000) - 86400,
            title: "Post-workout selfie"
          },
          {
            uri: "/photos/healthy_meal.jpg", 
            creation_timestamp: Math.floor(Date.now() / 1000) - 172800,
            title: "Healthy lunch prep"
          }
        ]
      };

      console.log('🧪 Processing simulated Facebook data...');
      const results = await importer.processData(simulatedFacebookData);
      
      console.log('✅ Simulation completed successfully:', results);

      // Verify what was created
      const finalCounts = {
        communications: await Communications.find({ userId: this.userId }).countAsync(),
        clinicalImpressions: await ClinicalImpressions.find({ userId: this.userId }).countAsync(),
        media: await Media.find({ userId: this.userId }).countAsync(),
        persons: await Persons.find({ userId: this.userId }).countAsync(),
        careTeams: await CareTeams.find({ userId: this.userId }).countAsync()
      };

      return {
        success: true,
        importerStats: results,
        finalCounts: finalCounts,
        simulatedData: simulatedFacebookData,
        jobId: jobId
      };

    } catch (error) {
      console.error('❌ Simulation error:', error);
      throw error;
    }
  },

  async 'debug.clearAllTestData'() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    try {
      console.log('🧹 Clearing all test data...');

      const beforeCounts = {
        communications: await Communications.find({ userId: this.userId }).countAsync(),
        clinicalImpressions: await ClinicalImpressions.find({ userId: this.userId }).countAsync(),
        media: await Media.find({ userId: this.userId }).countAsync(),
        persons: await Persons.find({ userId: this.userId }).countAsync(),
        careTeams: await CareTeams.find({ userId: this.userId }).countAsync(),
        importJobs: await ImportJobs.find({ userId: this.userId }).countAsync()
      };

      // Remove all data for this user
      await Promise.all([
        Communications.removeAsync({ userId: this.userId }),
        ClinicalImpressions.removeAsync({ userId: this.userId }),
        Media.removeAsync({ userId: this.userId }),
        Persons.removeAsync({ userId: this.userId }),
        CareTeams.removeAsync({ userId: this.userId }),
        ImportJobs.removeAsync({ userId: this.userId })
      ]);

      const afterCounts = {
        communications: await Communications.find({ userId: this.userId }).countAsync(),
        clinicalImpressions: await ClinicalImpressions.find({ userId: this.userId }).countAsync(),
        media: await Media.find({ userId: this.userId }).countAsync(),
        persons: await Persons.find({ userId: this.userId }).countAsync(),
        careTeams: await CareTeams.find({ userId: this.userId }).countAsync(),
        importJobs: await ImportJobs.find({ userId: this.userId }).countAsync()
      };

      console.log('✅ Test data cleared successfully');
      console.log('📊 Before:', beforeCounts);
      console.log('📊 After:', afterCounts);

      return {
        success: true,
        beforeCounts,
        afterCounts,
        deletedCounts: {
          communications: beforeCounts.communications - afterCounts.communications,
          clinicalImpressions: beforeCounts.clinicalImpressions - afterCounts.clinicalImpressions,
          media: beforeCounts.media - afterCounts.media,
          persons: beforeCounts.persons - afterCounts.persons,
          careTeams: beforeCounts.careTeams - afterCounts.careTeams,
          importJobs: beforeCounts.importJobs - afterCounts.importJobs
        }
      };

    } catch (error) {
      console.error('❌ Clear test data error:', error);
      throw error;
    }
  }
});