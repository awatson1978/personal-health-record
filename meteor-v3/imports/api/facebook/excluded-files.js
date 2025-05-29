// meteor-v3/imports/api/facebook/excluded-files.js

// List of Facebook export files to exclude from processing
export const EXCLUDED_FILES = [
  '.DS_Store',
  'rising_fan_badges_you\'ve_received.json',
  'the_ways_we_can_send_you_notifications.json',
  'contacts_sync_settings.json',
  'books.json',
  'autofill_information.json',
  'predicted_languages.json',
  'synced_contacts_from_instagram.json',
  'your_privacy_jurisdiction.json',
  'primary_public_location.json',
  'timezone.json',
  'primary_location.json',
  'device_location.json',
  'last_location.json',
  'your_events.json',
  'your_event_invitation_links.json',
  'event_invitations.json',
  'events_you\'ve_hidden.json',
  'your_event_responses.json',
  'events_you_hosted.json',
  'your_events_ads_activity.json',
  'your_fundraiser_donations_information.json',
  'fundraisers_donated_to.json',
  'your_fundraiser_settings.json',
  'archived_stories.json',
  'story_reactions.json',
  'your_actions_on_violating_content_in_your_groups.json',
  'chat_invites_received.json',
  'your_comments_in_groups.json',
  'your_group_membership_activity.json',
  'group_invites_you\'ve_received.json',
  'your_participation_requests.json',
  'your_groups.json',
  'your_anonymous_mode_status_in_groups.json',
  'community_chat_settings.json',
  'your_answers_to_membership_questions.json',
  'your_badges.json',
  'your_settings_for_groups_tab.json',
  'your_group_shortcuts.json',
  'your_group_warnings.json',
  'your_contributions.json'
];

// Helper function to check if a file should be excluded
export function isFileExcluded(fileName) {
  if (!fileName || typeof fileName !== 'string') return true;
  
  const baseName = fileName.toLowerCase();
  
  // Check exact matches (case insensitive)
  return EXCLUDED_FILES.some(function(excludedFile) {
    return baseName.includes(excludedFile.toLowerCase());
  });
}

// Helper function to filter an array of files
export function filterExcludedFiles(files) {
  if (!Array.isArray(files)) return [];
  
  return files.filter(function(file) {
    const fileName = file.name || file.fileName || file.path || '';
    return !isFileExcluded(fileName);
  });
}