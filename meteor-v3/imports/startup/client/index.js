// meteor-v3/imports/startup/client/index.js
import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';

// Configure accounts (basic configuration without UI package)
Accounts.config({
  sendVerificationEmail: false,
  forbidClientAccountCreation: false,
  loginExpirationInDays: 30
});

// Global error handling
window.addEventListener('unhandledrejection', function(event) {
  console.error('Unhandled promise rejection:', event.reason);
});

// Service worker registration for offline support
if ('serviceWorker' in navigator && Meteor.isProduction) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js')
      .then(function(registration) {
        console.log('ServiceWorker registration successful');
      })
      .catch(function(error) {
        console.log('ServiceWorker registration failed');
      });
  });
}

// Log app startup
console.log('🚀 Facebook FHIR Timeline Client Started');
console.log('🌍 Environment:', Meteor.isDevelopment ? 'development' : 'production');