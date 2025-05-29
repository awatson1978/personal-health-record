// meteor-v3/imports/api/facebook/importer.js
import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { get, isArray, isString } from 'lodash';
import moment from 'moment';
import { v4 as uuidv4 } from 'uuid';

import { 
  Patients, 
  Communications, 
  ClinicalImpressions, 
  Media, 
  Persons, 
  CareTeams,
  ImportJobs,
  ProcessingQueues 
} from '../fhir/collections';

import { ClinicalDetector } from '../nlp/clinical-detector';

export class FacebookImporter {
  constructor(userId, jobId) {
    check(userId, String);
    check(jobId, String);
    
    this.userId = userId;
    this.jobId = jobId;
    this.clinicalDetector = new ClinicalDetector();
    this.stats = {
      patients: 0,
      communications: 0,
      clinicalImpressions: 0,
      media: 0,
      persons: 0,
      careTeams: 0
    };
    
    // FIXED: Proper tracking counters
    this.counters = {
      totalRecords: 0,
      processedRecords: 0,
      currentPhase: 'initializing',
      errors: []
    };
    
    // Add processing flags
    this.isProcessing = true;
    this.shouldStop = false;
  }

  async processData(facebookData) {
    try {
      console.log(`🚀 Starting Facebook import for user ${this.userId}, job ${this.jobId}`);
      await this.updateJobStatus('processing', 0);
      
      // FIXED: Count total records properly
      this.counters.totalRecords = this.countTotalRecords(facebookData);
      console.log(`📊 Total records to process: ${this.counters.totalRecords}`);
      
      if (this.counters.totalRecords === 0) {
        throw new Error('No valid data found to process');
      }
      
      await this.updateJobProgress('counting', 5);
      
      // Create or update patient record (always create one)
      this.counters.currentPhase = 'patient';
      console.log('👤 Creating patient record...');
      await this.createPatientRecord();
      await this.updateJobProgress('patient', 10);
      
      // Process different data types with better error handling
      if (get(facebookData, 'posts') && isArray(facebookData.posts)) {
        this.counters.currentPhase = 'posts';
        console.log(`📝 Processing ${facebookData.posts.length} posts...`);
        await this.processPosts(facebookData.posts);
        await this.updateJobProgress('posts', 60);
      }
      
      if (get(facebookData, 'friends') && isArray(facebookData.friends)) {
        this.counters.currentPhase = 'friends';
        console.log(`👥 Processing ${facebookData.friends.length} friends...`);
        await this.processFriends(facebookData.friends);
        await this.updateJobProgress('friends', 75);
      }
      
      if (get(facebookData, 'photos') && isArray(facebookData.photos)) {
        this.counters.currentPhase = 'photos';
        console.log(`📸 Processing ${facebookData.photos.length} photos...`);
        await this.processPhotos(facebookData.photos);
        await this.updateJobProgress('photos', 90);
      }
      
      if (get(facebookData, 'messages') && isArray(facebookData.messages)) {
        this.counters.currentPhase = 'messages';
        console.log(`💬 Processing ${facebookData.messages.length} messages...`);
        await this.processMessages(facebookData.messages);
        await this.updateJobProgress('messages', 95);
      }
      
      // FIXED: Ensure completion
      this.counters.currentPhase = 'completed';
      this.isProcessing = false;
      
      console.log('✅ Import completed successfully:', this.stats);
      await this.updateJobStatus('completed', 100, this.stats);
      
      return this.stats;
      
    } catch (error) {
      console.error('❌ Facebook import error:', error);
      this.isProcessing = false;
      await this.updateJobStatus('failed', null, null, error.message);
      throw error;
    }
  }

  countTotalRecords(facebookData) {
    let total = 1; // Always count the patient record
    
    // FIXED: Better counting logic
    if (get(facebookData, 'posts') && isArray(facebookData.posts)) {
      total += facebookData.posts.length;
    }
    
    if (get(facebookData, 'friends') && isArray(facebookData.friends)) {
      total += facebookData.friends.length;
    }
    
    if (get(facebookData, 'photos') && isArray(facebookData.photos)) {
      total += facebookData.photos.length;
    }
    
    if (get(facebookData, 'messages') && isArray(facebookData.messages)) {
      total += facebookData.messages.length;
    }
    
    console.log(`📊 Counted ${total} total records to process`);
    return total;
  }

  async createPatientRecord() {
    const user = await Meteor.users.findOneAsync({ _id: this.userId });
    if (!user) {
      throw new Error('User not found');
    }

    // FIXED: Check if patient already exists for this user
    const existingPatient = await Patients.findOneAsync({ 
      userId: this.userId
    });
    
    if (existingPatient) {
      console.log('👤 Patient record already exists, skipping creation');
      this.incrementProcessedRecords();
      return existingPatient._id;
    }

    const patient = {
      resourceType: 'Patient',
      id: uuidv4(),
      identifier: [{
        use: 'usual',
        system: 'https://facebook-fhir-timeline.com/patient-id',
        value: user._id
      }],
      active: true,
      name: [{
        use: 'usual',
        text: get(user, 'profile.name', get(user, 'emails.0.address', 'Unknown'))
      }],
      telecom: [{
        system: 'email',
        value: get(user, 'emails.0.address'),
        use: 'home'
      }]
    };

    try {
      const patientId = await Patients.insertWithUser(this.userId, patient);
      this.stats.patients++;
      this.incrementProcessedRecords();
      console.log('✅ Created patient record:', patientId);
      return patientId;
    } catch (error) {
      console.error('❌ Error creating patient:', error);
      await this.logError(error, { context: 'createPatientRecord' });
      throw error;
    }
  }

  async processPosts(posts) {
    if (!isArray(posts) || posts.length === 0) {
      console.log('📝 No posts to process');
      return;
    }
    
    const totalPosts = posts.length;
    let processed = 0;
    let errors = 0;

    console.log(`📝 Processing ${totalPosts} posts...`);

    for (const post of posts) {
      if (this.shouldStop) {
        console.log('🛑 Processing stopped by user');
        break;
      }

      try {
        await this.processPost(post);
        processed++;
        this.incrementProcessedRecords();
        
        // FIXED: Update progress more frequently but not too often
        if (processed % 25 === 0 || processed === totalPosts) {
          const currentProgress = 10 + Math.floor((processed / totalPosts) * 50);
          await this.updateJobProgress('posts', currentProgress);
          console.log(`📝 Processed ${processed}/${totalPosts} posts (${currentProgress}%)`);
        }
      } catch (error) {
        errors++;
        console.error(`❌ Error processing post ${processed + 1}:`, error);
        await this.logError(error, { post: post, postIndex: processed });
        
        // FIXED: Still increment even on error to prevent infinite loops
        this.incrementProcessedRecords();
        
        // Stop if too many errors
        if (errors > totalPosts * 0.1) { // More than 10% error rate
          console.error(`🚨 Too many errors (${errors}), stopping post processing`);
          break;
        }
      }
    }
    
    console.log(`✅ Completed processing posts: ${processed} successful, ${errors} errors`);
  }

  async processPost(post) {
    const content = get(post, 'data.0.post', '');
    const timestamp = get(post, 'timestamp');
    const attachments = get(post, 'attachments', []);
    
    if (!content && !attachments.length) {
      // Skip empty posts
      return;
    }

    const postDate = timestamp ? moment.unix(timestamp).toDate() : new Date();
    
    // Create Communication resource
    const communication = {
      resourceType: 'Communication',
      id: uuidv4(),
      status: 'completed',
      sent: postDate,
      sender: {
        reference: `Patient/${this.userId}`,
        display: 'Self'
      },
      recipient: [{
        reference: `Patient/${this.userId}`,
        display: 'Personal Timeline'
      }],
      payload: []
    };

    if (content) {
      communication.payload.push({
        contentString: content
      });
    }

    // FIXED: Process attachments with better error handling
    for (const attachment of attachments) {
      try {
        const mediaData = get(attachment, 'data.0.media');
        if (mediaData) {
          const mediaResource = await this.createMediaResource(mediaData, postDate);
          if (mediaResource) {
            communication.payload.push({
              contentAttachment: {
                url: `Media/${mediaResource}`,
                title: get(mediaData, 'title', 'Attached Media')
              }
            });
          }
        }
      } catch (mediaError) {
        console.error('⚠️ Error processing media attachment:', mediaError);
        // Continue processing the post even if media fails
      }
    }

    try {
      const commId = await Communications.insertWithUser(this.userId, communication);
      this.stats.communications++;

      // FIXED: Check for clinical content with better error handling
      if (content && this.clinicalDetector.isClinicallRelevant(content)) {
        try {
          await this.createClinicalImpression(content, postDate, commId);
        } catch (clinicalError) {
          console.error('⚠️ Error creating clinical impression:', clinicalError);
          // Continue even if clinical processing fails
        }
      }
    } catch (error) {
      console.error('❌ Error creating communication:', error);
      throw error;
    }
  }

  async createClinicalImpression(content, date, sourceCommId) {
    try {
      const findings = this.clinicalDetector.extractFindings(content);
      
      const clinicalImpression = {
        resourceType: 'ClinicalImpression',
        id: uuidv4(),
        status: 'completed',
        subject: {
          reference: `Patient/${this.userId}`,
          display: 'Self'
        },
        assessor: {
          reference: `Patient/${this.userId}`,
          display: 'Self-reported'
        },
        date: date,
        description: `Patient reported: "${content}"`,
        investigation: [{
          code: {
            text: 'Social Media Health Report'
          },
          item: [{
            reference: `Communication/${sourceCommId}`,
            display: 'Original social media post'
          }]
        }],
        finding: findings.map(function(finding) {
          return {
            item: {
              text: finding.term
            },
            cause: finding.confidence > 0.7 ? 'likely' : 'possible'
          };
        })
      };

      await ClinicalImpressions.insertWithUser(this.userId, clinicalImpression);
      this.stats.clinicalImpressions++;
    } catch (error) {
      console.error('❌ Error creating clinical impression:', error);
      throw error;
    }
  }

  async createMediaResource(mediaData, createdDate) {
    try {
      const media = {
        resourceType: 'Media',
        id: uuidv4(),
        status: 'completed',
        type: {
          text: get(mediaData, 'media_type', 'unknown')
        },
        subject: {
          reference: `Patient/${this.userId}`,
          display: 'Self'
        },
        createdDateTime: createdDate,
        content: {
          contentType: this.getContentType(mediaData),
          url: get(mediaData, 'uri', ''),
          title: get(mediaData, 'title', ''),
          size: get(mediaData, 'size', 0)
        }
      };

      const mediaId = await Media.insertWithUser(this.userId, media);
      this.stats.media++;
      return mediaId;
    } catch (error) {
      console.error('❌ Error creating media resource:', error);
      throw error;
    }
  }

  async processFriends(friends) {
    if (!isArray(friends) || friends.length === 0) {
      console.log('👥 No friends to process');
      return;
    }

    console.log(`👥 Processing ${friends.length} friends...`);
    const careTeamParticipants = [];
    let processed = 0;

    for (const friend of friends) {
      try {
        const friendName = get(friend, 'name', '');
        if (!friendName) {
          this.incrementProcessedRecords();
          continue;
        }

        // Create Person resource
        const person = {
          resourceType: 'Person',
          id: uuidv4(),
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

        const personId = await Persons.insertWithUser(this.userId, person);
        this.stats.persons++;
        processed++;
        this.incrementProcessedRecords();

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
            start: get(friend, 'timestamp') ? moment.unix(friend.timestamp).toDate() : new Date()
          }
        });

      } catch (error) {
        console.error(`❌ Error processing friend:`, error);
        await this.logError(error, { friend });
        this.incrementProcessedRecords();
      }
    }

    // Create CareTeam resource if we have participants
    if (careTeamParticipants.length > 0) {
      try {
        const careTeam = {
          resourceType: 'CareTeam',
          id: uuidv4(),
          status: 'active',
          name: 'Social Support Network',
          subject: {
            reference: `Patient/${this.userId}`,
            display: 'Self'
          },
          participant: careTeamParticipants
        };

        await CareTeams.insertWithUser(this.userId, careTeam);
        this.stats.careTeams++;
      } catch (error) {
        console.error('❌ Error creating care team:', error);
        await this.logError(error, { context: 'createCareTeam' });
      }
    }

    console.log(`✅ Completed processing ${processed} friends`);
  }

  async processPhotos(photos) {
    if (!isArray(photos) || photos.length === 0) {
      console.log('📸 No photos to process');
      return;
    }

    console.log(`📸 Processing ${photos.length} photos...`);
    let processed = 0;

    for (const photo of photos) {
      try {
        await this.createMediaResource(photo, 
          photo.creation_timestamp ? moment.unix(photo.creation_timestamp).toDate() : new Date()
        );
        processed++;
        this.incrementProcessedRecords();
        
        if (processed % 50 === 0) {
          console.log(`📸 Processed ${processed}/${photos.length} photos`);
        }
      } catch (error) {
        console.error('❌ Error processing photo:', error);
        await this.logError(error, { photo });
        this.incrementProcessedRecords();
      }
    }
    
    console.log(`✅ Completed processing ${processed} photos`);
  }

  async processMessages(messages) {
    if (!isArray(messages) || messages.length === 0) {
      console.log('💬 No messages to process');
      return;
    }

    console.log(`💬 Processing ${messages.length} messages...`);
    let processed = 0;

    for (const message of messages) {
      try {
        // Basic message processing - could be expanded
        processed++;
        this.incrementProcessedRecords();
        
        if (processed % 100 === 0) {
          console.log(`💬 Processed ${processed}/${messages.length} messages`);
        }
      } catch (error) {
        console.error('❌ Error processing message:', error);
        await this.logError(error, { message });
        this.incrementProcessedRecords();
      }
    }
    
    console.log(`✅ Completed processing ${processed} messages`);
  }

  getContentType(mediaData) {
    const uri = get(mediaData, 'uri', '');
    if (uri.includes('.jpg') || uri.includes('.jpeg')) return 'image/jpeg';
    if (uri.includes('.png')) return 'image/png';
    if (uri.includes('.gif')) return 'image/gif';
    if (uri.includes('.mp4')) return 'video/mp4';
    return 'application/octet-stream';
  }

  // FIXED: Better progress tracking
  incrementProcessedRecords() {
    this.counters.processedRecords++;
  }

  async updateJobProgress(phase, progress) {
    await this.updateJobStatus('processing', progress, null, null, {
      phase: phase,
      totalRecords: this.counters.totalRecords,
      processedRecords: this.counters.processedRecords
    });
  }

  async updateJobStatus(status, progress = null, results = null, error = null, metadata = {}) {
    try {
      const updateDoc = {
        status,
        updatedAt: new Date()
      };

      if (progress !== null) updateDoc.progress = Math.min(progress, 100);
      if (results !== null) updateDoc.results = results;
      if (error !== null) {
        updateDoc.errors = [{ message: error, timestamp: new Date() }];
        updateDoc.errorCount = (updateDoc.errorCount || 0) + 1;
      }
      
      // FIXED: Add metadata fields properly
      if (metadata.totalRecords) updateDoc.totalRecords = metadata.totalRecords;
      if (metadata.processedRecords) updateDoc.processedRecords = metadata.processedRecords;
      if (metadata.phase) updateDoc.currentPhase = metadata.phase;
      
      if (status === 'processing' && !await ImportJobs.findOneAsync({ _id: this.jobId, startedAt: { $exists: true } })) {
        updateDoc.startedAt = new Date();
      }
      if (status === 'completed' || status === 'failed') {
        updateDoc.completedAt = new Date();
      }

      await ImportJobs.updateAsync({ _id: this.jobId }, { $set: updateDoc });
      
      // FIXED: Less verbose logging
      if (progress % 10 === 0 || status === 'completed' || status === 'failed') {
        console.log(`📊 Job ${this.jobId} - ${status}: ${progress}% (${metadata.processedRecords}/${metadata.totalRecords}) - Phase: ${metadata.phase}`);
      }
      
    } catch (error) {
      console.error('❌ Error updating job status:', error);
    }
  }

  async logError(error, context = {}) {
    try {
      const errorDoc = {
        message: error.message || error.toString(),
        timestamp: new Date(),
        context,
        phase: this.counters.currentPhase
      };

      await ImportJobs.updateAsync(
        { _id: this.jobId },
        { 
          $push: { errors: errorDoc },
          $inc: { errorCount: 1 }
        }
      );
      
      console.error(`❌ Import error in job ${this.jobId} (${this.counters.currentPhase}):`, errorDoc);
    } catch (updateError) {
      console.error('❌ Failed to log error to job:', updateError);
    }
  }

  // FIXED: Add method to stop processing
  stop() {
    console.log('🛑 Stopping Facebook import processing...');
    this.shouldStop = true;
    this.isProcessing = false;
  }
}