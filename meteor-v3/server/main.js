import { Meteor } from 'meteor/meteor';
import '../imports/startup/server';

Meteor.startup(async function() {
  console.log('🚀 Facebook to FHIR Timeline Server Started');
  console.log('📅 Startup Time:', new Date().toISOString());
  console.log('🌍 Environment:', process.env.NODE_ENV || 'development');
  
  // Log configuration
  const settings = Meteor.settings;
  if (settings && settings.public) {
    console.log('📱 App Name:', settings.public.appName);
    console.log('🔢 Version:', settings.public.version);
  }
});