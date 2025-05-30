// meteor-v3/imports/ui/pages/Profile.jsx
import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import { get } from 'lodash';
import moment from 'moment';

import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Grid,
  Alert,
  Chip,
  Avatar,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Skeleton,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar
} from '@mui/material';

import {
  Person as PersonIcon,
  Work as WorkIcon,
  School as EducationIcon,
  Home as HomeIcon,
  Email as EmailIcon,
  Favorite as HeartIcon,
  Phone as PhoneIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Info as InfoIcon,
  Badge as BadgeIcon,
  LocationOn as LocationIcon
} from '@mui/icons-material';

export function Profile() {
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Load patient data
  const loadPatientData = async function() {
    setLoading(true);
    setError(null);
    
    try {
      console.log('👤 Loading patient profile data...');
      
      const result = await new Promise(function(resolve, reject) {
        Meteor.call('fhir.getPatientProfile', function(error, result) {
          if (error) reject(error);
          else resolve(result);
        });
      });
      
      setPatient(result);
      console.log('✅ Patient profile loaded:', result);
      
    } catch (error) {
      console.error('❌ Error loading patient profile:', error);
      setError(error.reason || error.message);
    } finally {
      setLoading(false);
    }
  };

  // Load data on mount
  useEffect(function() {
    if (Meteor.userId()) {
      loadPatientData();
    }
  }, [Meteor.userId()]);

  // Handle edit form
  const openEditDialog = function() {
    if (!patient) return;
    
    setEditForm({
      name: get(patient, 'name.0.text', ''),
      email: get(patient, 'telecom.0.value', ''),
      phone: get(patient, 'telecom.1.value', '') || 
             patient.telecom?.find(function(t) { return t.system === 'phone'; })?.value || ''
    });
    setEditDialogOpen(true);
  };

  const handleEditFormChange = function(field, value) {
    setEditForm(function(prev) {
      return { ...prev, [field]: value };
    });
  };

  const savePatientProfile = async function() {
    setSaving(true);
    
    try {
      const updateData = {
        name: editForm.name,
        email: editForm.email,
        phone: editForm.phone
      };
      
      await new Promise(function(resolve, reject) {
        Meteor.call('fhir.updatePatientProfile', updateData, function(error, result) {
          if (error) reject(error);
          else resolve(result);
        });
      });
      
      setSnackbar({
        open: true,
        message: 'Profile updated successfully',
        severity: 'success'
      });
      
      setEditDialogOpen(false);
      await loadPatientData(); // Reload data
      
    } catch (error) {
      console.error('❌ Error updating profile:', error);
      setSnackbar({
        open: true,
        message: error.reason || error.message,
        severity: 'error'
      });
    } finally {
      setSaving(false);
    }
  };

  const closeSnackbar = function() {
    setSnackbar({ ...snackbar, open: false });
  };

  // Extract experiences data from extensions
  const getExperiencesData = function() {
    if (!patient || !patient.extension) return {};
    
    const experiences = {};
    
    patient.extension.forEach(function(ext) {
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
    
    return experiences;
  };

  // Render loading state
  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box mb={4}>
          <Skeleton variant="text" width="40%" height={60} />
          <Skeleton variant="text" width="60%" height={30} />
        </Box>
        <Grid container spacing={3}>
          {[1, 2, 3].map(function(item) {
            return (
              <Grid item xs={12} md={4} key={item}>
                <Card>
                  <CardContent>
                    <Skeleton variant="text" width="80%" height={40} />
                    <Skeleton variant="text" width="60%" height={30} />
                    <Skeleton variant="rectangular" width="100%" height={100} />
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      </Container>
    );
  }

  // Render error state
  if (error) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Alert severity="error" action={
          <Button color="inherit" size="small" onClick={loadPatientData}>
            Retry
          </Button>
        }>
          Error loading profile: {error}
        </Alert>
      </Container>
    );
  }

  // Render no patient state
  if (!patient) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Alert severity="info">
          <Typography>
            No patient profile found. Please import some Facebook data to create your profile.
          </Typography>
        </Alert>
      </Container>
    );
  }

  const experiences = getExperiencesData();
  const currentUser = Meteor.user();
  const userInitials = get(patient, 'name.0.text', 'U').substring(0, 2).toUpperCase();

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      {/* Header */}
      <Box mb={4}>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography variant="h3" component="h1" gutterBottom>
              Patient Profile
            </Typography>
            <Typography variant="subtitle1" color="text.secondary">
              Your FHIR Patient resource with data from registration and Facebook experiences.
            </Typography>
          </Box>
          
          <Button
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={openEditDialog}
          >
            Edit Profile
          </Button>
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* Basic Information */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box display="flex" alignItems="center" mb={3}>
                <Avatar 
                  sx={{ 
                    width: 80, 
                    height: 80, 
                    bgcolor: 'primary.main',
                    fontSize: '2rem',
                    mr: 3
                  }}
                >
                  {userInitials}
                </Avatar>
                <Box>
                  <Typography variant="h5" gutterBottom>
                    {get(patient, 'name.0.text', 'Unknown Patient')}
                  </Typography>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Chip 
                      label={patient.active ? 'Active' : 'Inactive'} 
                      color={patient.active ? 'success' : 'default'}
                      size="small"
                    />
                    <Chip 
                      label={`FHIR Patient`} 
                      color="primary"
                      size="small"
                      variant="outlined"
                    />
                  </Box>
                </Box>
              </Box>

              <Divider sx={{ mb: 2 }} />

              <List dense>
                {/* Email */}
                {patient.telecom?.map(function(contact, index) {
                  if (contact.system === 'email') {
                    return (
                      <ListItem key={index} sx={{ px: 0 }}>
                        <ListItemIcon>
                          <EmailIcon color="primary" />
                        </ListItemIcon>
                        <ListItemText
                          primary="Email"
                          secondary={contact.value}
                        />
                      </ListItem>
                    );
                  }
                  if (contact.system === 'phone') {
                    return (
                      <ListItem key={index} sx={{ px: 0 }}>
                        <ListItemIcon>
                          <PhoneIcon color="primary" />
                        </ListItemIcon>
                        <ListItemText
                          primary="Phone"
                          secondary={contact.value}
                        />
                      </ListItem>
                    );
                  }
                  return null;
                })}

                {/* Patient ID */}
                {patient.identifier?.map(function(id, index) {
                  return (
                    <ListItem key={index} sx={{ px: 0 }}>
                      <ListItemIcon>
                        <BadgeIcon color="secondary" />
                      </ListItemIcon>
                      <ListItemText
                        primary="Patient ID"
                        secondary={`${id.value} (${id.use || 'system'})`}
                      />
                    </ListItem>
                  );
                })}

                {/* Marital Status */}
                {patient.maritalStatus && (
                  <ListItem sx={{ px: 0 }}>
                    <ListItemIcon>
                      <HeartIcon color="error" />
                    </ListItemIcon>
                    <ListItemText
                      primary="Relationship Status"
                      secondary={get(patient, 'maritalStatus.text', 'Unknown')}
                    />
                  </ListItem>
                )}
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* Address History */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <HomeIcon sx={{ mr: 1, color: 'primary.main' }} />
                <Typography variant="h6">
                  Address History
                </Typography>
              </Box>

              {patient.address && patient.address.length > 0 ? (
                <List dense>
                  {patient.address.map(function(addr, index) {
                    return (
                      <ListItem key={index} sx={{ px: 0, flexDirection: 'column', alignItems: 'flex-start' }}>
                        <ListItemText
                          primary={addr.text || 'Address'}
                          secondary={
                            <Box>
                              <Typography variant="body2" component="span">
                                {addr.use ? `${addr.use.charAt(0).toUpperCase() + addr.use.slice(1)} address` : 'Address'}
                              </Typography>
                              {addr.period && (
                                <Box sx={{ mt: 0.5 }}>
                                  {addr.period.start && (
                                    <Chip 
                                      label={`From: ${moment(addr.period.start).format('MMM YYYY')}`}
                                      size="small"
                                      variant="outlined"
                                      sx={{ mr: 0.5, mb: 0.5 }}
                                    />
                                  )}
                                  {addr.period.end && (
                                    <Chip 
                                      label={`To: ${moment(addr.period.end).format('MMM YYYY')}`}
                                      size="small"
                                      variant="outlined"
                                      sx={{ mr: 0.5, mb: 0.5 }}
                                    />
                                  )}
                                </Box>
                              )}
                            </Box>
                          }
                        />
                        {index < patient.address.length - 1 && <Divider sx={{ width: '100%', mt: 1 }} />}
                      </ListItem>
                    );
                  })}
                </List>
              ) : (
                <Alert severity="info" sx={{ mt: 2 }}>
                  <Typography variant="body2">
                    No address history available. This is populated from Facebook's places_lived data.
                  </Typography>
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Work Experience */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <WorkIcon sx={{ mr: 1, color: 'primary.main' }} />
                <Typography variant="h6">
                  Work Experience
                </Typography>
              </Box>

              {experiences.work ? (
                <Box>
                  {typeof experiences.work === 'string' ? (
                    <Typography variant="body2">
                      {experiences.work}
                    </Typography>
                  ) : Array.isArray(experiences.work) ? (
                    <List dense>
                      {experiences.work.map(function(job, index) {
                        return (
                          <ListItem key={index} sx={{ px: 0, flexDirection: 'column', alignItems: 'flex-start' }}>
                            <ListItemText
                              primary={get(job, 'employer', get(job, 'name', 'Work Experience'))}
                              secondary={
                                <Box>
                                  {get(job, 'position') && (
                                    <Typography variant="body2" component="div">
                                      Position: {job.position}
                                    </Typography>
                                  )}
                                  {get(job, 'location') && (
                                    <Typography variant="body2" component="div">
                                      Location: {job.location}
                                    </Typography>
                                  )}
                                  <Box sx={{ mt: 0.5 }}>
                                    {get(job, 'start_timestamp') && (
                                      <Chip 
                                        label={`Started: ${moment.unix(job.start_timestamp).format('MMM YYYY')}`}
                                        size="small"
                                        variant="outlined"
                                        sx={{ mr: 0.5, mb: 0.5 }}
                                      />
                                    )}
                                    {get(job, 'end_timestamp') && (
                                      <Chip 
                                        label={`Ended: ${moment.unix(job.end_timestamp).format('MMM YYYY')}`}
                                        size="small"
                                        variant="outlined"
                                        sx={{ mr: 0.5, mb: 0.5 }}
                                      />
                                    )}
                                  </Box>
                                </Box>
                              }
                            />
                            {index < experiences.work.length - 1 && <Divider sx={{ width: '100%', mt: 1 }} />}
                          </ListItem>
                        );
                      })}
                    </List>
                  ) : (
                    <Typography variant="body2">
                      {JSON.stringify(experiences.work, null, 2)}
                    </Typography>
                  )}
                </Box>
              ) : (
                <Alert severity="info">
                  <Typography variant="body2">
                    No work experience data available. This is populated from Facebook's experiences.json file.
                  </Typography>
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Education */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <EducationIcon sx={{ mr: 1, color: 'primary.main' }} />
                <Typography variant="h6">
                  Education
                </Typography>
              </Box>

              {experiences.education ? (
                <Box>
                  {typeof experiences.education === 'string' ? (
                    <Typography variant="body2">
                      {experiences.education}
                    </Typography>
                  ) : Array.isArray(experiences.education) ? (
                    <List dense>
                      {experiences.education.map(function(edu, index) {
                        return (
                          <ListItem key={index} sx={{ px: 0, flexDirection: 'column', alignItems: 'flex-start' }}>
                            <ListItemText
                              primary={get(edu, 'school', get(edu, 'name', 'Educational Institution'))}
                              secondary={
                                <Box>
                                  {get(edu, 'degree') && (
                                    <Typography variant="body2" component="div">
                                      Degree: {edu.degree}
                                    </Typography>
                                  )}
                                  {get(edu, 'field_of_study') && (
                                    <Typography variant="body2" component="div">
                                      Field: {edu.field_of_study}
                                    </Typography>
                                  )}
                                  <Box sx={{ mt: 0.5 }}>
                                    {get(edu, 'start_timestamp') && (
                                      <Chip 
                                        label={`Started: ${moment.unix(edu.start_timestamp).format('MMM YYYY')}`}
                                        size="small"
                                        variant="outlined"
                                        sx={{ mr: 0.5, mb: 0.5 }}
                                      />
                                    )}
                                    {get(edu, 'end_timestamp') && (
                                      <Chip 
                                        label={`Ended: ${moment.unix(edu.end_timestamp).format('MMM YYYY')}`}
                                        size="small"
                                        variant="outlined"
                                        sx={{ mr: 0.5, mb: 0.5 }}
                                      />
                                    )}
                                  </Box>
                                </Box>
                              }
                            />
                            {index < experiences.education.length - 1 && <Divider sx={{ width: '100%', mt: 1 }} />}
                          </ListItem>
                        );
                      })}
                    </List>
                  ) : (
                    <Typography variant="body2">
                      {JSON.stringify(experiences.education, null, 2)}
                    </Typography>
                  )}
                </Box>
              ) : (
                <Alert severity="info">
                  <Typography variant="body2">
                    No education data available. This is populated from Facebook's experiences.json file.
                  </Typography>
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* FHIR Resource Details */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <InfoIcon sx={{ mr: 1, color: 'primary.main' }} />
                <Typography variant="h6">
                  FHIR Resource Metadata
                </Typography>
              </Box>

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Resource Type
                  </Typography>
                  <Typography variant="body1">
                    {patient.resourceType}
                  </Typography>
                </Grid>
                
                <Grid item xs={12} sm={6} md={3}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Resource ID
                  </Typography>
                  <Typography variant="body1" sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                    {patient.id || patient._id}
                  </Typography>
                </Grid>
                
                {patient.meta && (
                  <>
                    <Grid item xs={12} sm={6} md={3}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Last Updated
                      </Typography>
                      <Typography variant="body1">
                        {patient.meta.lastUpdated ? 
                          moment(patient.meta.lastUpdated).format('MMM DD, YYYY HH:mm') : 
                          'Unknown'
                        }
                      </Typography>
                    </Grid>
                    
                    <Grid item xs={12} sm={6} md={3}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Source
                      </Typography>
                      <Typography variant="body1">
                        {patient.meta.source || 'Unknown'}
                      </Typography>
                    </Grid>
                  </>
                )}
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Edit Profile Dialog */}
      <Dialog 
        open={editDialogOpen} 
        onClose={function() { setEditDialogOpen(false); }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Edit Profile</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <TextField
              fullWidth
              label="Full Name"
              value={editForm.name || ''}
              onChange={function(e) { handleEditFormChange('name', e.target.value); }}
              sx={{ mb: 2 }}
            />
            
            <TextField
              fullWidth
              label="Email Address"
              type="email"
              value={editForm.email || ''}
              onChange={function(e) { handleEditFormChange('email', e.target.value); }}
              sx={{ mb: 2 }}
            />
            
            <TextField
              fullWidth
              label="Phone Number"
              value={editForm.phone || ''}
              onChange={function(e) { handleEditFormChange('phone', e.target.value); }}
              helperText="Optional"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={function() { setEditDialogOpen(false); }}
            disabled={saving}
            startIcon={<CancelIcon />}
          >
            Cancel
          </Button>
          <Button 
            onClick={savePatientProfile}
            variant="contained"
            disabled={saving}
            startIcon={saving ? null : <SaveIcon />}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success/Error Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={closeSnackbar}
      >
        <Alert 
          onClose={closeSnackbar} 
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
}