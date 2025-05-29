// meteor-v3/imports/ui/pages/Settings.jsx
import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { get, set } from 'lodash';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Alert,
  Grid,
  FormControl,
  FormControlLabel,
  Switch,
  Select,
  MenuItem,
  InputLabel,
  TextField,
  Button,
  Chip,
  Divider,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Refresh as RefreshIcon,
  Warning as WarningIcon
} from '@mui/icons-material';

export function Settings() {
  const [settings, setSettings] = useState({
    debugLevel: 'info',
    enableDetailedLogging: false,
    dataRetentionDays: 90,
    clinicalKeywords: [],
    autoDetectClinical: true,
    confidenceThreshold: 0.5
  });
  
  const [newKeyword, setNewKeyword] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveMessage, setSaveMessage] = useState('');
  const [clearDataDialogOpen, setClearDataDialogOpen] = useState(false);
  const [clearingData, setClearingData] = useState(false);

  useEffect(function() {
    loadSettings();
  }, []);

  const loadSettings = async function() {
    setLoading(true);
    try {
      // Load user settings
      const user = Meteor.user();
      let userSettings = {};
      
      if (user && user.profile?.settings) {
        userSettings = user.profile.settings;
      }
      
      // Load default clinical keywords from server settings
      const defaultKeywords = await new Promise(function(resolve, reject) {
        Meteor.call('settings.getDefaultClinicalKeywords', function(error, keywords) {
          if (error) {
            console.error('Error loading default keywords:', error);
            reject(error);
          } else {
            resolve(keywords || []);
          }
        });
      });
      
      // Merge user settings with defaults
      const mergedSettings = {
        debugLevel: get(userSettings, 'debugLevel', 'info'),
        enableDetailedLogging: get(userSettings, 'enableDetailedLogging', false),
        dataRetentionDays: get(userSettings, 'dataRetentionDays', 90),
        clinicalKeywords: get(userSettings, 'clinicalKeywords', defaultKeywords),
        autoDetectClinical: get(userSettings, 'autoDetectClinical', true),
        confidenceThreshold: get(userSettings, 'confidenceThreshold', 0.5)
      };
      
      setSettings(mergedSettings);
      
    } catch (error) {
      console.error('Error loading settings:', error);
      setSaveMessage('Error loading settings: ' + (error.reason || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleSettingChange = function(key, value) {
    setSettings(function(prev) {
      const newSettings = { ...prev };
      set(newSettings, key, value);
      return newSettings;
    });
  };

  const addKeyword = function() {
    if (newKeyword.trim() && !settings.clinicalKeywords.includes(newKeyword.trim().toLowerCase())) {
      setSettings(function(prev) {
        return {
          ...prev,
          clinicalKeywords: [...prev.clinicalKeywords, newKeyword.trim().toLowerCase()]
        };
      });
      setNewKeyword('');
    }
  };

  const removeKeyword = function(keyword) {
    setSettings(function(prev) {
      return {
        ...prev,
        clinicalKeywords: prev.clinicalKeywords.filter(function(k) { return k !== keyword; })
      };
    });
  };

  const resetKeywordsToDefault = async function() {
    try {
      const defaultKeywords = await new Promise(function(resolve, reject) {
        Meteor.call('settings.getDefaultClinicalKeywords', function(error, keywords) {
          if (error) reject(error);
          else resolve(keywords || []);
        });
      });
      
      setSettings(function(prev) {
        return { ...prev, clinicalKeywords: defaultKeywords };
      });
      
      setSaveMessage('Keywords reset to defaults');
      setTimeout(function() { setSaveMessage(''); }, 3000);
      
    } catch (error) {
      console.error('Error resetting keywords:', error);
      setSaveMessage('Error resetting keywords: ' + (error.reason || error.message));
    }
  };

  const saveSettings = async function() {
    setSaving(true);
    setSaveMessage('');
    
    try {
      await new Promise(function(resolve, reject) {
        Meteor.call('settings.updateUserSettings', settings, function(error, result) {
          if (error) reject(error);
          else resolve(result);
        });
      });
      
      setSaveMessage('Settings saved successfully!');
      
      // Clear message after 3 seconds
      setTimeout(function() { setSaveMessage(''); }, 3000);
      
    } catch (error) {
      console.error('Settings save error:', error);
      setSaveMessage('Error saving settings: ' + (error.reason || error.message));
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = async function() {
    if (confirm('Reset all settings to defaults? This cannot be undone.')) {
      try {
        await new Promise(function(resolve, reject) {
          Meteor.call('settings.resetToDefaults', function(error, result) {
            if (error) reject(error);
            else resolve(result);
          });
        });
        
        // Reload settings
        await loadSettings();
        setSaveMessage('Settings reset to defaults!');
        
      } catch (error) {
        console.error('Reset error:', error);
        setSaveMessage('Error resetting settings: ' + (error.reason || error.message));
      }
    }
  };

  const clearAllData = async function() {
    setClearingData(true);
    
    try {
      const result = await new Promise(function(resolve, reject) {
        Meteor.call('facebook.clearAllData', function(error, result) {
          if (error) reject(error);
          else resolve(result);
        });
      });
      
      setSaveMessage('All data cleared successfully!');
      
      // FIXED: Reset the import process state in Session
      Session.set('import.activeStep', 0);
      
      // Close dialog
      setClearDataDialogOpen(false);
      
      console.log('Data cleared:', result);
      
    } catch (error) {
      console.error('Clear data error:', error);
      setSaveMessage('Error clearing data: ' + (error.reason || error.message));
    } finally {
      setClearingData(false);
    }
  };

  if (loading) {
    return (
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        <Typography>Loading settings...</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box mb={4}>
        <Typography variant="h3" component="h1" gutterBottom>
          Settings
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Manage your account and application preferences.
        </Typography>
      </Box>

      {saveMessage && (
        <Alert 
          severity={saveMessage.includes('Error') ? 'error' : 'success'} 
          sx={{ mb: 3 }}
        >
          {saveMessage}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Debug & Logging */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Debug & Logging
              </Typography>
              
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Debug Level</InputLabel>
                <Select
                  value={settings.debugLevel}
                  label="Debug Level"
                  onChange={function(e) { handleSettingChange('debugLevel', e.target.value); }}
                >
                  <MenuItem value="error">Error Only</MenuItem>
                  <MenuItem value="warn">Warnings</MenuItem>
                  <MenuItem value="info">Info</MenuItem>
                  <MenuItem value="debug">Debug</MenuItem>
                  <MenuItem value="trace">Trace (Verbose)</MenuItem>
                </Select>
              </FormControl>

              <FormControlLabel
                control={
                  <Switch
                    checked={settings.enableDetailedLogging}
                    onChange={function(e) { handleSettingChange('enableDetailedLogging', e.target.checked); }}
                  />
                }
                label="Enable Detailed Processing Logs"
              />
            </CardContent>
          </Card>
        </Grid>

        {/* Data Management */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Data Management
              </Typography>
              
              <TextField
                fullWidth
                type="number"
                label="Data Retention (Days)"
                value={settings.dataRetentionDays}
                onChange={function(e) { handleSettingChange('dataRetentionDays', parseInt(e.target.value)); }}
                helperText="How long to keep imported data (0 = forever)"
                sx={{ mb: 2 }}
              />

              <Box sx={{ mt: 2 }}>
                <Button
                  variant="outlined"
                  color="error"
                  onClick={function() { setClearDataDialogOpen(true); }}
                  fullWidth
                  startIcon={<WarningIcon />}
                >
                  Clear All Imported Data
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Clinical Detection */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Clinical Content Detection
              </Typography>
              
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.autoDetectClinical}
                        onChange={function(e) { handleSettingChange('autoDetectClinical', e.target.checked); }}
                      />
                    }
                    label="Auto-detect Clinical Content"
                  />
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <TextField
                    type="number"
                    label="Confidence Threshold"
                    value={settings.confidenceThreshold}
                    onChange={function(e) { handleSettingChange('confidenceThreshold', parseFloat(e.target.value)); }}
                    inputProps={{ min: 0, max: 1, step: 0.1 }}
                    helperText="Minimum confidence for clinical detection (0.0 - 1.0)"
                    fullWidth
                  />
                </Grid>
              </Grid>

              <Divider sx={{ mb: 2 }} />

              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="subtitle1">
                  Clinical Keywords ({settings.clinicalKeywords.length})
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={resetKeywordsToDefault}
                  startIcon={<RefreshIcon />}
                >
                  Reset to Defaults
                </Button>
              </Box>
              
              <Typography variant="body2" color="text.secondary" paragraph>
                Keywords used to identify health-related content in your posts.
              </Typography>

              <Box display="flex" alignItems="center" sx={{ mb: 2 }}>
                <TextField
                  value={newKeyword}
                  onChange={function(e) { setNewKeyword(e.target.value); }}
                  placeholder="Add new keyword..."
                  size="small"
                  sx={{ flex: 1, mr: 1 }}
                  onKeyPress={function(e) {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addKeyword();
                    }
                  }}
                />
                <Button
                  variant="outlined"
                  onClick={addKeyword}
                  startIcon={<AddIcon />}
                  disabled={!newKeyword.trim()}
                >
                  Add
                </Button>
              </Box>

              <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
                {settings.clinicalKeywords.map(function(keyword, index) {
                  return (
                    <Chip
                      key={keyword}
                      label={keyword}
                      onDelete={function() { removeKeyword(keyword); }}
                      deleteIcon={<DeleteIcon />}
                      sx={{ mr: 1, mb: 1 }}
                    />
                  );
                })}
              </Box>

              {settings.clinicalKeywords.length === 0 && (
                <Typography color="text.secondary" align="center" sx={{ py: 2 }}>
                  No keywords configured
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Action Buttons */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Button
                  variant="outlined"
                  onClick={resetToDefaults}
                >
                  Reset to Defaults
                </Button>

                <Button
                  variant="contained"
                  onClick={saveSettings}
                  disabled={saving}
                  startIcon={<SaveIcon />}
                >
                  {saving ? 'Saving...' : 'Save Settings'}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* FIXED: Clear Data Confirmation Dialog */}
      <Dialog
        open={clearDataDialogOpen}
        onClose={function() { 
          if (!clearingData) {
            setClearDataDialogOpen(false);
          }
        }}
      >
        <DialogTitle>
          <Box display="flex" alignItems="center">
            <WarningIcon color="error" sx={{ mr: 1 }} />
            Clear All Imported Data
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography paragraph>
            Are you sure you want to delete <strong>ALL</strong> your imported data? This will remove:
          </Typography>
          <Typography component="ul" sx={{ pl: 2 }}>
            <li>All communications (social media posts)</li>
            <li>All clinical impressions (health records)</li>
            <li>All media files</li>
            <li>All import jobs and processing history</li>
            <li>All persons and care teams</li>
          </Typography>
          <Typography paragraph color="error.main" sx={{ mt: 2 }}>
            <strong>This action cannot be undone!</strong>
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={function() { setClearDataDialogOpen(false); }}
            disabled={clearingData}
          >
            Cancel
          </Button>
          <Button 
            onClick={clearAllData}
            color="error"
            variant="contained"
            disabled={clearingData}
          >
            {clearingData ? 'Clearing Data...' : 'Clear All Data'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}