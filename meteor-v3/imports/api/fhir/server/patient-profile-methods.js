// meteor-v3/imports/api/fhir/server/patient-profile-methods.js
import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { get } from 'lodash';

import { Patients } from '../collections';

Meteor.methods({
  async 'fhir.getPatientProfile'() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    try {
      console.log(`👤 Getting patient profile for user ${this.userId}`);
      
      // Find the patient record for this user
      const patient = await Patients.findOneAsync({ userId: this.userId });
      
      if (!patient) {
        console.log(`⚠️ No patient record found for user ${this.userId}`);
        return null;
      }

      console.log(`✅ Patient profile found for user ${this.userId}:`, patient._id);
      return patient;

    } catch (error) {
      console.error('❌ Error getting patient profile:', error);
      throw new Meteor.Error('profile-failed', error.message);
    }
  },

  async 'fhir.updatePatientProfile'(updateData) {
    check(updateData, {
      name: String,
      email: String,
      phone: String
    });

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    try {
      console.log(`👤 Updating patient profile for user ${this.userId}:`, updateData);
      
      // Find the patient record
      const existingPatient = await Patients.findOneAsync({ userId: this.userId });
      
      if (!existingPatient) {
        throw new Meteor.Error('patient-not-found', 'Patient record not found');
      }

      // Build the update document
      const updateDoc = {
        name: [{
          use: 'usual',
          text: updateData.name
        }],
        telecom: [
          {
            system: 'email',
            value: updateData.email,
            use: 'home'
          }
        ]
      };

      // Add phone if provided
      if (updateData.phone && updateData.phone.trim()) {
        updateDoc.telecom.push({
          system: 'phone',
          value: updateData.phone.trim(),
          use: 'home'
        });
      }

      // Update the patient record
      await Patients.updateWithUser(
        this.userId,
        { _id: existingPatient._id },
        { $set: updateDoc }
      );

      // Also update the user's profile name for consistency
      await Meteor.users.updateAsync(
        { _id: this.userId },
        { 
          $set: { 
            'profile.name': updateData.name,
            'profile.updatedAt': new Date()
          }
        }
      );

      console.log(`✅ Patient profile updated for user ${this.userId}`);
      
      return {
        success: true,
        message: 'Profile updated successfully'
      };

    } catch (error) {
      console.error('❌ Error updating patient profile:', error);
      throw new Meteor.Error('update-failed', error.message);
    }
  },

  async 'fhir.createPatientFromUser'() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    try {
      console.log(`👤 Creating patient record from user ${this.userId}`);
      
      // Check if patient already exists
      const existingPatient = await Patients.findOneAsync({ userId: this.userId });
      if (existingPatient) {
        console.log(`⚠️ Patient record already exists for user ${this.userId}`);
        return existingPatient;
      }

      // Get user data
      const user = await Meteor.users.findOneAsync({ _id: this.userId });
      if (!user) {
        throw new Meteor.Error('user-not-found', 'User not found');
      }

      // Create FHIR Patient resource
      const patient = {
        resourceType: 'Patient',
        identifier: [{
          use: 'usual',
          system: 'https://facebook-fhir-timeline.com/patient-id',
          value: this.userId
        }],
        active: true,
        name: [{
          use: 'usual',
          text: get(user, 'profile.name', get(user, 'emails.0.address', 'Unknown User'))
        }],
        telecom: [{
          system: 'email',
          value: get(user, 'emails.0.address'),
          use: 'home'
        }],
        meta: {
          source: 'User Registration',
          lastUpdated: new Date(),
          versionId: '1'
        }
      };

      // Insert the patient record
      const patientId = await Patients.insertWithUser(this.userId, patient);
      
      console.log(`✅ Created patient record ${patientId} for user ${this.userId}`);
      
      // Return the created patient
      return await Patients.findOneAsync({ _id: patientId });

    } catch (error) {
      console.error('❌ Error creating patient from user:', error);
      throw new Meteor.Error('creation-failed', error.message);
    }
  },

  async 'fhir.enhancePatientWithExperiences'(experiencesData) {
    check(experiencesData, Object);

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    try {
      console.log(`👤 Enhancing patient with experiences data for user ${this.userId}`);
      
      // Find existing patient record
      const existingPatient = await Patients.findOneAsync({ userId: this.userId });
      if (!existingPatient) {
        throw new Meteor.Error('patient-not-found', 'Patient record not found');
      }

      // Build enhancement object
      const enhancements = {};
      
      // Add extensions for experiences data
      const extensions = get(existingPatient, 'extension', []);
      
      // Add work experience
      if (experiencesData.work && Array.isArray(experiencesData.work)) {
        // Remove existing work extension
        const filteredExtensions = extensions.filter(function(ext) {
          return ext.url !== 'http://hl7.org/fhir/StructureDefinition/patient-occupation';
        });
        
        filteredExtensions.push({
          url: 'http://hl7.org/fhir/StructureDefinition/patient-occupation',
          valueString: JSON.stringify(experiencesData.work)
        });
        
        enhancements.extension = filteredExtensions;
      }

      // Add education experience
      if (experiencesData.education && Array.isArray(experiencesData.education)) {
        if (!enhancements.extension) {
          enhancements.extension = get(existingPatient, 'extension', []);
        }
        
        // Remove existing education extension
        enhancements.extension = enhancements.extension.filter(function(ext) {
          return ext.url !== 'http://hl7.org/fhir/StructureDefinition/patient-education';
        });
        
        enhancements.extension.push({
          url: 'http://hl7.org/fhir/StructureDefinition/patient-education',
          valueString: JSON.stringify(experiencesData.education)
        });
      }

      // Add places lived as addresses
      if (experiencesData.places_lived && Array.isArray(experiencesData.places_lived)) {
        enhancements.address = experiencesData.places_lived.map(function(place) {
          const address = {
            use: 'home',
            text: get(place, 'name', 'Unknown location')
          };
          
          // Add period if timestamps are available
          if (place.start_timestamp || place.end_timestamp) {
            address.period = {};
            
            if (place.start_timestamp) {
              address.period.start = new Date(place.start_timestamp * 1000);
            }
            
            if (place.end_timestamp) {
              address.period.end = new Date(place.end_timestamp * 1000);
            }
          }
          
          return address;
        });
      }

      // Add relationship status
      if (experiencesData.relationship && experiencesData.relationship.status) {
        enhancements.maritalStatus = {
          text: experiencesData.relationship.status
        };
      }

      // Update the patient record if we have enhancements
      if (Object.keys(enhancements).length > 0) {
        await Patients.updateWithUser(
          this.userId,
          { _id: existingPatient._id },
          { $set: enhancements }
        );
        
        console.log(`✅ Enhanced patient record with experiences data for user ${this.userId}`);
      } else {
        console.log(`⚠️ No enhancements to apply for user ${this.userId}`);
      }

      return {
        success: true,
        enhancements: Object.keys(enhancements),
        message: 'Patient enhanced with experiences data'
      };

    } catch (error) {
      console.error('❌ Error enhancing patient with experiences:', error);
      throw new Meteor.Error('enhancement-failed', error.message);
    }
  },

  async 'fhir.getPatientOverview'() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    try {
      console.log(`📊 Getting patient overview for user ${this.userId}`);
      
      const patient = await Patients.findOneAsync({ userId: this.userId });
      
      if (!patient) {
        return {
          hasPatient: false,
          message: 'No patient record found'
        };
      }

      // Extract experiences data from extensions
      const experiences = {};
      const extensions = get(patient, 'extension', []);
      
      extensions.forEach(function(ext) {
        if (ext.url === 'http://hl7.org/fhir/StructureDefinition/patient-occupation') {
          try {
            experiences.work = JSON.parse(ext.valueString);
          } catch (e) {
            experiences.work = ext.valueString;
          }
        } else if (ext.url === 'http://hl7.org/fhir/StructureDefinition/patient-education') {
          try {
            experiences.education = JSON.parse(ext.valueString);
          } catch (e) {
            experiences.education = ext.valueString;
          }
        }
      });

      const overview = {
        hasPatient: true,
        patientId: patient._id,
        name: get(patient, 'name.0.text', 'Unknown'),
        email: patient.telecom?.find(function(t) { return t.system === 'email'; })?.value,
        phone: patient.telecom?.find(function(t) { return t.system === 'phone'; })?.value,
        active: patient.active,
        addressCount: get(patient, 'address', []).length,
        hasWorkExperience: !!experiences.work,
        hasEducation: !!experiences.education,
        hasMaritalStatus: !!patient.maritalStatus,
        lastUpdated: get(patient, 'meta.lastUpdated'),
        source: get(patient, 'meta.source')
      };

      console.log(`✅ Patient overview generated for user ${this.userId}:`, overview);
      return overview;

    } catch (error) {
      console.error('❌ Error getting patient overview:', error);
      throw new Meteor.Error('overview-failed', error.message);
    }
  }
});