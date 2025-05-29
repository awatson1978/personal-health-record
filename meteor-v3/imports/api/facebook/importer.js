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
    
    // Add tracking counters
    this.counters = {
      totalRecords: 0,
      processedRecords: 0,
      currentPhase: 'initializing'
    };
  }

  async processData(facebookData) {
    try {
      await this.updateJobStatus('processing', 0);
      
      // Count total records first for better progress tracking
      this.counters.totalRecords = this.countTotalRecords(facebookData);
      await this.updateJobProgress('counting', 5);
      
      // Create or update patient record
      this.counters.currentPhase = 'patient';
      await this.createPatientRecord();
      await this.updateJobProgress('patient', 10);
      
      // Process different data types
      if (get(facebookData, 'posts')) {
        this.counters.currentPhase = 'posts';
        await this.processPosts(facebookData.posts);
        await this.updateJobProgress('posts', 60);
      }
      
      if (get(facebookData, 'friends')) {
        this.counters.currentPhase = 'friends';
        await this.processFriends(facebookData.friends);
        await this.updateJobProgress('friends', 75);
      }
      
      if (get(facebookData, 'photos')) {
        this.counters.currentPhase = 'photos';
        await this.processPhotos(facebookData.photos);
        await this.updateJobProgress('photos', 90);
      }
      
      if (get(facebookData, 'messages')) {
        this.counters.currentPhase = 'messages';
        await this.processMessages(facebookData.messages);
        await this.updateJobProgress('messages', 95);
      }
      
      this.counters.currentPhase = 'completed';
      await this.updateJobStatus('completed', 100, this.stats);
      
      return this.stats;
      
    } catch (error) {
      console.error('Facebook import error:', error);
      await this.updateJobStatus('failed', null, null, error.message);
      throw error;
    }
  }

  countTotalRecords(facebookData) {
    let total = 0;
    
    const posts = get(facebookData, 'posts', []);
    if (isArray(posts)) total += posts.length;
    
    const friends = get(facebookData, 'friends', []);
    if (isArray(friends)) total += friends.length;
    
    const photos = get(facebookData, 'photos', []);
    if (isArray(photos)) total += photos.length;
    
    const messages = get(facebookData, 'messages', []);
    if (isArray(messages)) total += messages.length;
    
    console.log(`Total records to process: ${total}`);
    return total;
  }

  async createPatientRecord() {
    const user = await Meteor.users.findOneAsync({ _id: this.userId });
    if (!user) throw new Meteor.Error('user-not-found', 'User not found');

    const existingPatient = await Patients.findOneAsync({ 
      userId: this.userId,
      'identifier.value': user._id 
    });
    
    if (existingPatient) return existingPatient;

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

    const patientId = await Patients.insertWithUser(this.userId, patient);
    this.stats.patients++;
    this.counters.processedRecords++;
    return patientId;
  }

  async processPosts(posts) {
    if (!isArray(posts)) return;
    
    const totalPosts = posts.length;
    let processed = 0;

    console.log(`Processing ${totalPosts} posts...`);

    for (const post of posts) {
      try {
        await this.processPost(post);
        processed++;
        this.counters.processedRecords++;
        
        // Update progress every 50 posts
        if (processed % 50 === 0) {
          const currentProgress = 10 + Math.floor((processed / totalPosts) * 50);
          await this.updateJobProgress('posts', currentProgress);
          console.log(`Processed ${processed}/${totalPosts} posts (${currentProgress}%)`);
        }
      } catch (error) {
        console.error('Error processing post:', error);
        await this.logError(error, { post });
      }
    }
    
    console.log(`Completed processing ${processed} posts`);
  }

  async processPost(post) {
    const content = get(post, 'data.0.post', '');
    const timestamp = get(post, 'timestamp');
    const attachments = get(post, 'attachments', []);
    
    if (!content && !attachments.length) return;

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

    // Process attachments
    for (const attachment of attachments) {
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
    }

    const commId = await Communications.insertWithUser(this.userId, communication);
    this.stats.communications++;

    // Check for clinical content
    if (content && this.clinicalDetector.isClinicallRelevant(content)) {
      await this.createClinicalImpression(content, postDate, commId);
    }
  }

  async createClinicalImpression(content, date, sourceCommId) {
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
  }

  async createMediaResource(mediaData, createdDate) {
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
  }

  async processFriends(friends) {
    if (!isArray(friends)) return;

    console.log(`Processing ${friends.length} friends...`);
    const careTeamParticipants = [];

    for (const friend of friends) {
      const friendName = get(friend, 'name', '');
      if (!friendName) continue;

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
      this.counters.processedRecords++;

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
    }

    // Create CareTeam resource
    if (careTeamParticipants.length > 0) {
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
    }

    console.log(`Completed processing ${friends.length} friends`);
  }

  async processPhotos(photos) {
    if (!isArray(photos)) return;

    console.log(`Processing ${photos.length} photos...`);
    let processed = 0;

    for (const photo of photos) {
      try {
        await this.createMediaResource(photo, 
          photo.creation_timestamp ? moment.unix(photo.creation_timestamp).toDate() : new Date()
        );
        processed++;
        this.counters.processedRecords++;
        
        if (processed % 25 === 0) {
          console.log(`Processed ${processed}/${photos.length} photos`);
        }
      } catch (error) {
        console.error('Error processing photo:', error);
        await this.logError(error, { photo });
      }
    }
    
    console.log(`Completed processing ${processed} photos`);
  }

  async processMessages(messages) {
    // Process private messages as Communications
    // Implementation similar to posts but with different recipient handling
    console.log(`Processing ${messages.length || 0} messages...`);
  }

  getContentType(mediaData) {
    const uri = get(mediaData, 'uri', '');
    if (uri.includes('.jpg') || uri.includes('.jpeg')) return 'image/jpeg';
    if (uri.includes('.png')) return 'image/png';
    if (uri.includes('.gif')) return 'image/gif';
    if (uri.includes('.mp4')) return 'video/mp4';
    return 'application/octet-stream';
  }

  async updateJobProgress(phase, progress) {
    await this.updateJobStatus('processing', progress, null, null, {
      phase: phase,
      totalRecords: this.counters.totalRecords,
      processedRecords: this.counters.processedRecords
    });
  }

  async updateJobStatus(status, progress = null, results = null, error = null, metadata = {}) {
    const updateDoc = {
      status,
      updatedAt: new Date()
    };

    if (progress !== null) updateDoc.progress = progress;
    if (results !== null) updateDoc.results = results;
    if (error !== null) updateDoc.errors = [{ message: error, timestamp: new Date() }];
    
    // Add metadata fields
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
    
    // Log progress for debugging
    console.log(`Job ${this.jobId} - ${status}: ${progress}% (${metadata.processedRecords}/${metadata.totalRecords}) - Phase: ${metadata.phase}`);
  }

  async logError(error, context = {}) {
    const errorDoc = {
      message: error.message || error.toString(),
      timestamp: new Date(),
      context
    };

    await ImportJobs.updateAsync(
      { _id: this.jobId },
      { 
        $push: { errors: errorDoc },
        $inc: { errorCount: 1 }
      }
    );
    
    console.error(`Import error in job ${this.jobId}:`, errorDoc);
  }
}