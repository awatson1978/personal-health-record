// meteor-v3/imports/startup/server/index.js
import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { check } from 'meteor/check';

// Import API
import '../../api/users/server/publications';
import '../../api/users/server/methods';
import '../../api/facebook/server/methods';
import '../../api/fhir/server/methods';
import '../../api/fhir/server/dashboard-methods';
import '../../api/fhir/server/timeline-methods';
import '../../api/fhir/server/export-methods';
import '../../api/processing/server/methods';

// Configure accounts
Accounts.config({
  sendVerificationEmail: false,
  forbidClientAccountCreation: false,
  loginExpirationInDays: 30,
  passwordResetTokenExpirationInDays: 1,
  passwordEnrollTokenExpirationInDays: 7
});

// Set up user creation hook
Accounts.onCreateUser(function(options, user) {
  // Add custom profile fields
  user.profile = {
    name: options.profile?.name || '',
    avatar: '/images/default-avatar.png',
    timezone: options.profile?.timezone || 'UTC',
    preferences: {
      theme: 'light',
      notifications: true,
      dataRetention: 90 // days
    },
    createdAt: new Date(),
    isActive: true
  };
  
  return user;
});

// Email configuration
if (Meteor.settings.private?.email) {
  process.env.MAIL_URL = Meteor.settings.private.email.mailUrl;
}

// Security policies
if (Meteor.isProduction) {
  // Force HTTPS in production
  import { BrowserPolicy } from 'meteor/browser-policy-common';
  
  BrowserPolicy.framing.disallow();
  BrowserPolicy.content.disallowInlineScripts();
  BrowserPolicy.content.disallowEval();
  BrowserPolicy.content.allowInlineStyles();
  BrowserPolicy.content.allowFontDataUrl();
}