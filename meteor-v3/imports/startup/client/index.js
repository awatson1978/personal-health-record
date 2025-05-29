import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';

// Configure accounts
Accounts.ui.config({
  passwordSignupFields: 'EMAIL_ONLY',
  loginPath: '/login',
  signUpPath: '/register',
  resetPasswordPath: '/reset-password',
  profilePath: '/profile',
  onSignedInHook: function() {
    console.log('User signed in');
  },
  onSignedOutHook: function() {
    console.log('User signed out');
  }
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