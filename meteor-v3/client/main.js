// meteor-v3/client/main.js
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Meteor } from 'meteor/meteor';

// Import startup code
import '../imports/startup/client';

// Import main app component
import App from '../imports/ui/App';

Meteor.startup(function() {
  console.log('🚀 Meteor client starting up...');
  
  const container = document.getElementById('react-target');
  if (container) {
    const root = createRoot(container);
    root.render(<App />);
    console.log('✅ React app mounted successfully');
  } else {
    console.error('❌ Could not find react-target element');
  }
});