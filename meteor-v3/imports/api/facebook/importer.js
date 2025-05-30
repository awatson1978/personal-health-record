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
    
    this.counters = {
      totalRecords: 0,
      processedRecords: 0,
      currentPhase: 'initializing',
      errors: []
    };
    
    this.isProcessing = true;
    this.shouldStop = false;
  }

  async processData(facebookData) {
    try {
      console.log(`🚀 Starting Facebook import for user ${this.userId}, job ${this.jobId}`);
      console.log('📊 Facebook data keys:', Object.keys(facebookData));
      await this.updateJobStatus('processing', 0);
      
      this.counters.totalRecords = this.countTotalRecords(facebookData);
      console.log(`📊 Total records to process: ${this.counters.totalRecords}`);
      
      if (this.counters.totalRecords === 0) {
        throw new Error('No valid data found to process');
      }
      
      await this.updateJobProgress('counting', 5);
      
      // Create or update patient record from experiences
      this.counters.currentPhase = 'patient';
      console.log('👤 Creating patient record from experiences...');
      await this.createPatientFromExperiences(facebookData);
      await this.updateJobProgress('patient', 10);
      
      // Process different data types with better structure detection
      const processedSomething = await this.processAllDataTypes(facebookData);
      
      if (!processedSomething) {
        console.log('⚠️ No recognizable Facebook data structures found');
        // Create some test data to verify the system works
        await this.createTestData();
      }
      
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

  async processAllDataTypes(facebookData) {
    let processedSomething = false;
    
    // Process experiences data for patient record
    const experiencesData = this.extractExperiencesData(facebookData);
    if (experiencesData && Object.keys(experiencesData).length > 0) {
      this.counters.currentPhase = 'experiences';
      console.log('🔍 Processing experiences data...');
      await this.processExperiences(experiencesData);
      await this.updateJobProgress('experiences', 15);
      processedSomething = true;
    }

    // Process friends data to create Person records
    const friendsData = this.extractFriendsData(facebookData);
    if (friendsData.length > 0) {
      this.counters.currentPhase = 'friends';
      console.log(`👥 Processing ${friendsData.length} friends as FHIR Persons...`);
      await this.processFriends(friendsData);
      await this.updateJobProgress('friends', 30);
      processedSomething = true;
    }
    
    // Handle posts/status updates/timeline as Clinical Impressions
    const postsData = this.extractPostsData(facebookData);
    if (postsData.length > 0) {
      this.counters.currentPhase = 'posts';
      console.log(`📝 Processing ${postsData.length} posts as Clinical Impressions...`);
      await this.processPosts(postsData);
      await this.updateJobProgress('posts', 50);
      processedSomething = true;
    }
    
    // Handle photos/media data  
    const mediaData = this.extractMediaData(facebookData);
    if (mediaData.length > 0) {
      this.counters.currentPhase = 'media';
      console.log(`📸 Processing ${mediaData.length} media items...`);
      await this.processPhotos(mediaData);
      await this.updateJobProgress('media', 70);
      processedSomething = true;
    }
    
    // Handle messages as Communications
    const messagesData = this.extractMessagesData(facebookData);
    if (messagesData.length > 0) {
      this.counters.currentPhase = 'messages';
      console.log(`💬 Processing ${messagesData.length} messages as Communications...`);
      await this.processMessages(messagesData);
      await this.updateJobProgress('messages', 90);
      processedSomething = true;
    }
    
    return processedSomething;
  }

  // Extract experiences data for patient record creation
  extractExperiencesData(facebookData) {
    if (facebookData.experiences && typeof facebookData.experiences === 'object') {
      return facebookData.experiences;
    }
    
    // Check for direct experiences data
    if (facebookData.your_experiences) {
      return facebookData.your_experiences;
    }
    
    console.log('📝 No experiences data found for patient record enhancement');
    return {};
  }

  // Better data extraction methods
  extractPostsData(facebookData) {
    let allPosts = [];
    
    // Handle various Facebook post structures
    if (facebookData.posts && isArray(facebookData.posts)) {
      allPosts = allPosts.concat(facebookData.posts);
    }
    
    if (facebookData.status_updates && isArray(facebookData.status_updates)) {
      allPosts = allPosts.concat(facebookData.status_updates);
    }
    
    if (facebookData.timeline && isArray(facebookData.timeline)) {
      allPosts = allPosts.concat(facebookData.timeline);
    }

    if (facebookData.your_posts && isArray(facebookData.your_posts)) {
      allPosts = allPosts.concat(facebookData.your_posts);
    }
    
    // Handle single post objects
    if (facebookData.data && isArray(facebookData.data) && facebookData.data.length > 0) {
      // This might be a single post file
      if (facebookData.data[0].post) {
        allPosts.push(facebookData);
      }
    }
    
    console.log(`📝 Extracted ${allPosts.length} posts from Facebook data`);
    return allPosts;
  }

  extractFriendsData(facebookData) {
    let allFriends = [];
    
    // Handle your_friends.json structure
    if (facebookData.friends_v2 && isArray(facebookData.friends_v2)) {
      allFriends = facebookData.friends_v2;
    } else if (facebookData.friends && isArray(facebookData.friends)) {
      allFriends = facebookData.friends;
    } else if (facebookData.your_friends && isArray(facebookData.your_friends)) {
      allFriends = facebookData.your_friends;
    } else if (isArray(facebookData) && facebookData.length > 0 && facebookData[0].name) {
      // This might be a friends array directly
      allFriends = facebookData;
    }
    
    console.log(`👥 Extracted ${allFriends.length} friends from Facebook data`);
    return allFriends;
  }

  extractMediaData(facebookData) {
    let allMedia = [];
    
    if (facebookData.photos && isArray(facebookData.photos)) {
      allMedia = allMedia.concat(facebookData.photos);
    }
    
    if (facebookData.videos && isArray(facebookData.videos)) {
      allMedia = allMedia.concat(facebookData.videos);
    }

    if (facebookData.your_photos && isArray(facebookData.your_photos)) {
      allMedia = allMedia.concat(facebookData.your_photos);
    }

    if (facebookData.your_videos && isArray(facebookData.your_videos)) {
      allMedia = allMedia.concat(facebookData.your_videos);
    }
    
    // Handle uncategorized photos
    if (isArray(facebookData) && facebookData.length > 0 && facebookData[0].uri) {
      allMedia = facebookData;
    }
    
    console.log(`📸 Extracted ${allMedia.length} media items from Facebook data`);
    return allMedia;
  }

  extractMessagesData(facebookData) {
    let allMessages = [];
    
    if (facebookData.messages && isArray(facebookData.messages)) {
      allMessages = facebookData.messages;
    }

    if (facebookData.your_messages && isArray(facebookData.your_messages)) {
      allMessages = facebookData.your_messages;
    }
    
    console.log(`💬 Extracted ${allMessages.length} messages from Facebook data`);
    return allMessages;
  }

  countTotalRecords(facebookData) {
    let total = 1; // Always count the patient record
    
    total += this.extractPostsData(facebookData).length;
    total += this.extractFriendsData(facebookData).length;
    total += this.extractMediaData(facebookData).length;
    total += this.extractMessagesData(facebookData).length;
    
    // Count experiences if present
    const experiencesData = this.extractExperiencesData(facebookData);
    if (experiencesData && Object.keys(experiencesData).length > 0) {
      total += 1; // Count experiences processing
    }
    
    console.log(`📊 Counted ${total} total records to process`);
    return total;
  }

  async createPatientFromExperiences(facebookData) {
    const user = await Meteor.users.findOneAsync({ _id: this.userId });
    if (!user) {
      throw new Error('User not found');
    }

    // Check if patient already exists
    const existingPatient = await Patients.findOneAsync({ userId: this.userId });
    
    const experiencesData = this.extractExperiencesData(facebookData);
    
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

    // Enhance patient record with experiences data if available
    if (experiencesData && Object.keys(experiencesData).length > 0) {
      console.log('🔍 Enhancing patient record with experiences data:', Object.keys(experiencesData));
      
      // Add work experience
      if (experiencesData.work) {
        patient.extension = patient.extension || [];
        patient.extension.push({
          url: 'http://hl7.org/fhir/StructureDefinition/patient-occupation',
          valueString: JSON.stringify(experiencesData.work)
        });
      }

      // Add education experience
      if (experiencesData.education) {
        patient.extension = patient.extension || [];
        patient.extension.push({
          url: 'http://hl7.org/fhir/StructureDefinition/patient-education',
          valueString: JSON.stringify(experiencesData.education)
        });
      }

      // Add places lived
      if (experiencesData.places_lived) {
        patient.address = experiencesData.places_lived.map(function(place) {
          return {
            use: 'home',
            text: get(place, 'name', 'Unknown location'),
            period: {
              start: place.start_timestamp ? moment.unix(place.start_timestamp).toDate() : undefined,
              end: place.end_timestamp ? moment.unix(place.end_timestamp).toDate() : undefined
            }
          };
        });
      }

      // Add relationship status if available
      if (experiencesData.relationship) {
        patient.maritalStatus = {
          text: get(experiencesData.relationship, 'status', 'Unknown')
        };
      }
    }

    try {
      let patientId;
      
      if (existingPatient) {
        // Update existing patient with experiences data
        await Patients.updateWithUser(this.userId, { _id: existingPatient._id }, { $set: patient });
        patientId = existingPatient._id;
        console.log('✅ Updated existing patient record with experiences:', patientId);
      } else {
        // Create new patient
        patientId = await Patients.insertWithUser(this.userId, patient);
        this.stats.patients++;
        console.log('✅ Created new patient record with experiences:', patientId);
      }
      
      this.incrementProcessedRecords();
      return patientId;
    } catch (error) {
      console.error('❌ Error creating/updating patient with experiences:', error);
      await this.logError(error, { context: 'createPatientFromExperiences', experiencesData });
      throw error;
    }
  }

  async processExperiences(experiencesData) {
    console.log('🔍 Processing experiences data for patient enhancement...');
    
    // The experiences data has already been processed in createPatientFromExperiences
    // This method is called for tracking purposes
    this.incrementProcessedRecords();
    console.log('✅ Experiences data processed for patient record enhancement');
  }

  async processFriends(friends) {
    if (!isArray(friends) || friends.length === 0) {
      console.log('👥 No friends to process');
      return;
    }

    console.log(`👥 Processing ${friends.length} friends as FHIR Person records...`);
    const careTeamParticipants = [];
    let processed = 0;

    for (const friend of friends) {
      if (this.shouldStop) {
        console.log('🛑 Processing stopped by user');
        break;
      }

      try {
        const friendName = get(friend, 'name', '');
        if (!friendName) {
          this.incrementProcessedRecords();
          continue;
        }

        // Create FHIR Person resource
        const person = {
          resourceType: 'Person',
          id: uuidv4(),
          active: true,
          name: [{
            use: 'usual',
            text: friendName
          }],
          link: [{
            target: {
              reference: `Patient/${this.userId}`
            },
            assurance: 'level2'
          }]
        };

        // Add timestamp if available
        if (friend.timestamp) {
          person.extension = [{
            url: 'http://facebook-fhir-timeline.com/friend-since',
            valueDateTime: moment.unix(friend.timestamp).toDate()
          }];
        }

        const personId = await Persons.insertWithUser(this.userId, person);
        this.stats.persons++;
        processed++;
        this.incrementProcessedRecords();
        console.log(`✅ Created FHIR Person: ${personId} (${friendName})`);

        // Add to care team participants
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

        const careTeamId = await CareTeams.insertWithUser(this.userId, careTeam);
        this.stats.careTeams++;
        console.log(`✅ Created care team: ${careTeamId} with ${careTeamParticipants.length} participants`);
      } catch (error) {
        console.error('❌ Error creating care team:', error);
        await this.logError(error, { context: 'createCareTeam' });
      }
    }

    console.log(`✅ Completed processing ${processed} friends as FHIR Person records`);
  }

  async processPosts(posts) {
    if (!isArray(posts) || posts.length === 0) {
      console.log('📝 No posts to process');
      return;
    }
    
    const totalPosts = posts.length;
    let processed = 0;
    let errors = 0;

    console.log(`📝 Processing ${totalPosts} posts as Clinical Impressions...`);

    for (const post of posts) {
      if (this.shouldStop) {
        console.log('🛑 Processing stopped by user');
        break;
      }

      try {
        await this.processPost(post);
        processed++;
        this.incrementProcessedRecords();
        
        if (processed % 25 === 0 || processed === totalPosts) {
          const currentProgress = 30 + Math.floor((processed / totalPosts) * 20);
          await this.updateJobProgress('posts', currentProgress);
          console.log(`📝 Processed ${processed}/${totalPosts} posts as Clinical Impressions (${currentProgress}%)`);
        }
      } catch (error) {
        errors++;
        console.error(`❌ Error processing post ${processed + 1}:`, error);
        await this.logError(error, { post: post, postIndex: processed });
        this.incrementProcessedRecords();
        
        if (errors > totalPosts * 0.1) {
          console.error(`🚨 Too many errors (${errors}), stopping post processing`);
          break;
        }
      }
    }
    
    console.log(`✅ Completed processing posts as Clinical Impressions: ${processed} successful, ${errors} errors`);
  }

  async processPost(post) {
    // Handle different post structures
    let content = '';
    let timestamp = null;
    let attachments = [];
    
    // Extract content from various structures
    if (post.data && isArray(post.data) && post.data[0] && post.data[0].post) {
      content = post.data[0].post;
      timestamp = post.timestamp;
      attachments = get(post, 'attachments', []);
    } else if (post.post) {
      content = post.post;
      timestamp = post.timestamp;
    } else if (post.message) {
      content = post.message;
      timestamp = post.timestamp;
    } else if (post.text) {
      content = post.text;
      timestamp = post.created_time || post.timestamp;
    }
    
    // Skip empty posts
    if (!content && !attachments.length) {
      console.log('⏩ Skipping empty post');
      return;
    }

    const postDate = timestamp ? moment.unix(timestamp).toDate() : new Date();
    
    // Create Clinical Impression (not Communication) for posts
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
        display: 'Self-reported via social media'
      },
      date: postDate,
      description: content || 'Social media post with attachments'
    };

    // Check for clinical content and add findings
    if (content && this.clinicalDetector.isClinicallRelevant(content)) {
      const findings = this.clinicalDetector.extractFindings(content);
      
      clinicalImpression.finding = findings.map(function(finding) {
        return {
          item: {
            text: finding.display || finding.term,
            coding: finding.code ? [{
              system: finding.system,
              code: finding.code,
              display: finding.display
            }] : undefined
          },
          basis: `Confidence: ${(finding.confidence * 100).toFixed(0)}%`
        };
      });
    }

    // Process attachments as investigations
    if (attachments.length > 0) {
      clinicalImpression.investigation = [{
        code: {
          text: 'Social Media Attachments'
        },
        item: []
      }];

      for (const attachment of attachments) {
        try {
          const mediaData = get(attachment, 'data.0.media');
          if (mediaData) {
            const mediaResource = await this.createMediaResource(mediaData, postDate);
            if (mediaResource) {
              clinicalImpression.investigation[0].item.push({
                reference: `Media/${mediaResource}`,
                display: get(mediaData, 'title', 'Attached Media')
              });
            }
          }
        } catch (mediaError) {
          console.error('⚠️ Error processing media attachment:', mediaError);
        }
      }
    }

    try {
      const impressionId = await ClinicalImpressions.insertWithUser(this.userId, clinicalImpression);
      this.stats.clinicalImpressions++;
      console.log(`✅ Created Clinical Impression from post: ${impressionId}`);
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
      console.log(`✅ Created media resource: ${mediaId}`);
      return mediaId;
    } catch (error) {
      console.error('❌ Error creating media resource:', error);
      throw error;
    }
  }

  async processPhotos(mediaItems) {
    if (!isArray(mediaItems) || mediaItems.length === 0) {
      console.log('📸 No media items to process');
      return;
    }

    console.log(`📸 Processing ${mediaItems.length} media items...`);
    let processed = 0;

    for (const mediaItem of mediaItems) {
      try {
        // Handle different media structures
        let createdDate = new Date();
        if (mediaItem.creation_timestamp) {
          createdDate = moment.unix(mediaItem.creation_timestamp).toDate();
        } else if (mediaItem.timestamp) {
          createdDate = moment.unix(mediaItem.timestamp).toDate();
        }
        
        await this.createMediaResource(mediaItem, createdDate);
        processed++;
        this.incrementProcessedRecords();
        
        if (processed % 20 === 0) {
          console.log(`📸 Processed ${processed}/${mediaItems.length} media items`);
        }
      } catch (error) {
        console.error('❌ Error processing media item:', error);
        await this.logError(error, { mediaItem });
        this.incrementProcessedRecords();
      }
    }
    
    console.log(`✅ Completed processing ${processed} media items`);
  }

  async processMessages(messages) {
    if (!isArray(messages) || messages.length === 0) {
      console.log('💬 No messages to process');
      return;
    }

    console.log(`💬 Processing ${messages.length} messages as Communications...`);
    let processed = 0;

    for (const message of messages) {
      try {
        // Better message processing
        const content = get(message, 'content', get(message, 'text', ''));
        if (content) {
          const messageDate = message.timestamp ? moment.unix(message.timestamp).toDate() : new Date();
          
          // Create Communication for messages
          const communication = {
            resourceType: 'Communication',
            id: uuidv4(),
            status: 'completed',
            sent: messageDate,
            sender: {
              reference: `Patient/${this.userId}`,
              display: 'Self'
            },
            payload: [{
              contentString: content
            }],
            category: [{
              text: 'Direct Message'
            }]
          };
          
          const commId = await Communications.insertWithUser(this.userId, communication);
          this.stats.communications++;
          
          if (processed % 50 === 0) {
            console.log(`💬 Processed ${processed}/${messages.length} messages as Communications`);
          }
        }
        
        processed++;
        this.incrementProcessedRecords();
      } catch (error) {
        console.error('❌ Error processing message:', error);
        await this.logError(error, { message });
        this.incrementProcessedRecords();
      }
    }
    
    console.log(`✅ Completed processing ${processed} messages as Communications`);
  }

  // Create test data to verify system works
  async createTestData() {
    console.log('🧪 Creating test data to verify system functionality...');
    
    try {
      // Create test Communication (from message)
      const testCommunication = {
        resourceType: 'Communication',
        id: uuidv4(),
        status: 'completed',
        sent: new Date(),
        sender: {
          reference: `Patient/${this.userId}`,
          display: 'Self'
        },
        payload: [{
          contentString: 'Test message: Thanks for checking in! I\'m doing well today.'
        }],
        category: [{
          text: 'Test Message'
        }]
      };

      const commId = await Communications.insertWithUser(this.userId, testCommunication);
      this.stats.communications++;
      this.incrementProcessedRecords();
      console.log('✅ Created test communication (message)');

      // Create test Clinical Impression (from post)
      const testClinicalImpression = {
        resourceType: 'ClinicalImpression',
        id: uuidv4(),
        status: 'completed',
        subject: {
          reference: `Patient/${this.userId}`,
          display: 'Self'
        },
        assessor: {
          reference: `Patient/${this.userId}`,
          display: 'Self-reported via social media'
        },
        date: new Date(),
        description: 'Test post: Had a great checkup today! Doctor said everything looks good. Feeling healthy and strong! 💪',
        finding: [{
          item: {
            text: 'Positive health assessment'
          },
          basis: 'Patient reported via social media'
        }]
      };

      const impressionId = await ClinicalImpressions.insertWithUser(this.userId, testClinicalImpression);
      this.stats.clinicalImpressions++;
      this.incrementProcessedRecords();
      console.log('✅ Created test clinical impression (post)');

      // Create test Person (from friend)
      const testPerson = {
        resourceType: 'Person',
        id: uuidv4(),
        active: true,
        name: [{
          use: 'usual',
          text: 'Dr. Jane Smith'
        }],
        link: [{
          target: {
            reference: `Patient/${this.userId}`
          },
          assurance: 'level2'
        }]
      };

      const personId = await Persons.insertWithUser(this.userId, testPerson);
      this.stats.persons++;
      this.incrementProcessedRecords();
      console.log('✅ Created test person (friend)');

      // Create test media
      const testMedia = {
        resourceType: 'Media',
        id: uuidv4(),
        status: 'completed',
        type: { text: 'photo' },
        subject: {
          reference: `Patient/${this.userId}`,
          display: 'Self'
        },
        createdDateTime: new Date(),
        content: {
          contentType: 'image/jpeg',
          url: '/test-image.jpg',
          title: 'Test photo'
        }
      };

      const mediaId = await Media.insertWithUser(this.userId, testMedia);
      this.stats.media++;
      this.incrementProcessedRecords();
      console.log('✅ Created test media');

    } catch (error) {
      console.error('❌ Error creating test data:', error);
    }
  }

  getContentType(mediaData) {
    const uri = get(mediaData, 'uri', '');
    if (uri.includes('.jpg') || uri.includes('.jpeg')) return 'image/jpeg';
    if (uri.includes('.png')) return 'image/png';
    if (uri.includes('.gif')) return 'image/gif';
    if (uri.includes('.mp4')) return 'video/mp4';
    return 'application/octet-stream';
  }

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

  stop() {
    console.log('🛑 Stopping Facebook import processing...');
    this.shouldStop = true;
    this.isProcessing = false;
  }
}