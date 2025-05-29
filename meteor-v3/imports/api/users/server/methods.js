// meteor-v3/imports/api/users/server/methods.js
import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { get } from 'lodash';

Meteor.methods({
  async 'settings.getDefaultClinicalKeywords'() {
    // Return default clinical keywords from server settings.json
    const defaultKeywords = get(Meteor.settings, 'private.nlp.clinicalKeywords', [
      'sick', 'pain', 'doctor', 'hospital', 'medication', 'surgery',
      'headache', 'fever', 'tired', 'appointment', 'diagnosis', 'treatment',
      'prescription', 'symptoms', 'illness', 'injury', 'therapy', 'recovery',
      'ache', 'hurt', 'sore', 'pharmacy', 'clinic', 'emergency', 'urgent care',
      'checkup', 'blood test', 'x-ray', 'scan', 'mri', 'ct', 'ultrasound',
      'vaccination', 'vaccine', 'shot', 'immunization', 'allergy', 'allergic',
      'rash', 'swelling', 'bruise', 'cut', 'wound', 'bleeding', 'nausea',
      'vomiting', 'diarrhea', 'constipation', 'heartburn', 'indigestion',
      'dizzy', 'fainting', 'chest pain', 'shortness of breath', 'cough',
      'cold', 'flu', 'covid', 'coronavirus', 'quarantine', 'isolation',
      'mental health', 'depression', 'anxiety', 'stress', 'counseling',
      'therapist', 'psychiatrist', 'psychologist', 'medicine', 'pills',
      'tablet', 'capsule', 'dose', 'dosage', 'side effect', 'reaction'
    ]);

    return defaultKeywords;
  },

  async 'settings.updateUserSettings'(settings) {
    check(settings, Object);
    
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    // Validate settings
    const allowedSettings = [
      'debugLevel',
      'enableDetailedLogging', 
      'dataRetentionDays',
      'clinicalKeywords',
      'autoDetectClinical',
      'confidenceThreshold'
    ];

    const cleanSettings = {};
    allowedSettings.forEach(function(key) {
      if (settings.hasOwnProperty(key)) {
        cleanSettings[key] = settings[key];
      }
    });

    // Update user profile
    await Meteor.users.updateAsync(
      { _id: this.userId },
      { 
        $set: { 
          'profile.settings': cleanSettings,
          'profile.settingsUpdatedAt': new Date()
        }
      }
    );

    console.log(`Updated settings for user ${this.userId}:`, cleanSettings);
    return true;
  },

  async 'settings.resetToDefaults'() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    const defaultKeywords = await Meteor.call('settings.getDefaultClinicalKeywords');
    
    const defaultSettings = {
      debugLevel: 'info',
      enableDetailedLogging: false,
      dataRetentionDays: 90,
      clinicalKeywords: defaultKeywords,
      autoDetectClinical: true,
      confidenceThreshold: 0.5
    };

    await Meteor.users.updateAsync(
      { _id: this.userId },
      { 
        $set: { 
          'profile.settings': defaultSettings,
          'profile.settingsUpdatedAt': new Date()
        }
      }
    );

    return defaultSettings;
  }
});