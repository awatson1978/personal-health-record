// meteor-v3/imports/ui/pages/Dashboard.jsx
import React, { useState, useEffect } from 'react';
import { useTracker } from 'meteor/react-meteor-data';
import { Meteor } from 'meteor/meteor';
import { get } from 'lodash';
import moment from 'moment';

import {
  Container,
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  LinearProgress,
  Alert,
  Button,
  Fab
} from '@mui/material';

import {
  Timeline as TimelineIcon,
  Upload as UploadIcon,
  Analytics as AnalyticsIcon,
  Person as PersonIcon,
  LocalHospital as HealthIcon,
  Photo as PhotoIcon,
  Message as MessageIcon,
  Add as AddIcon
} from '@mui/icons-material';

import { useNavigate } from 'react-router-dom';

import { 
  Patients, 
  Communications, 
  ClinicalImpressions, 
  Media, 
  Persons,
  ImportJobs 
} from '../../api/fhir/collections';

import { StatCard } from '../components/StatCard';
import { RecentActivity } from '../components/RecentActivity';
import { QuickActions } from '../components/QuickActions';
import { ImportProgress } from '../components/ImportProgress';

function Dashboard() {
  const navigate = useNavigate();
  const [recentImports, setRecentImports] = useState([]);

  const { 
    stats, 
    recentClinicalImpressions, 
    recentCommunications,
    activeImports,
    isLoading 
  } = useTracker(function() {
    const userId = Meteor.userId();
    if (!userId) return { isLoading: true };

    // Subscribe to user data with higher limits
    const patientsHandle = Meteor.subscribe('user.patients');
    const communicationsHandle = Meteor.subscribe('user.communications', 50);
    const clinicalHandle = Meteor.subscribe('user.clinicalImpressions', 50);
    const mediaHandle = Meteor.subscribe('user.media', 20);
    const personsHandle = Meteor.subscribe('user.persons', 50); // FIXED: Add persons subscription
    const importsHandle = Meteor.subscribe('user.imports');

    const isLoading = !patientsHandle.ready() || 
                    !communicationsHandle.ready() || 
                    !clinicalHandle.ready() ||
                    !mediaHandle.ready() ||
                    !personsHandle.ready() ||
                    !importsHandle.ready();

    if (isLoading) return { isLoading: true };

    // FIXED: Get statistics for corrected FHIR mappings
    const allCommunications = Communications.find({ userId }).fetch(); // Messages -> Communications
    const allClinicalImpressions = ClinicalImpressions.find({ userId }).fetch(); // Posts -> ClinicalImpressions
    const allMedia = Media.find({ userId }).fetch(); // Photos -> Media
    const allPersons = Persons.find({ userId }).fetch(); // FIXED: Friends -> Persons
    const allImports = ImportJobs.find({ userId, status: 'completed' }).fetch();

    const stats = {
      totalCommunications: allCommunications.length,
      totalClinicalImpressions: allClinicalImpressions.length,
      totalMedia: allMedia.length,
      totalPersons: allPersons.length // FIXED: Changed from imports to persons
    };

    // Debug logging with corrected mappings
    console.log('📊 Dashboard stats (corrected FHIR mappings):', stats);
    console.log('💬 Communications (from messages):', allCommunications.slice(0, 2));
    console.log('🏥 Clinical Impressions (from posts):', allClinicalImpressions.slice(0, 2));
    console.log('📸 Media (from photos):', allMedia.slice(0, 2));
    console.log('👥 Persons (from friends):', allPersons.slice(0, 2));

    // Get recent data for display
    const recentClinicalImpressions = ClinicalImpressions.find(
      { userId },
      { sort: { date: -1 }, limit: 20 }
    ).fetch();

    const recentCommunications = Communications.find(
      { userId },
      { sort: { sent: -1 }, limit: 20 }
    ).fetch();

    // Get active imports
    const activeImports = ImportJobs.find(
      { userId, status: { $in: ['pending', 'processing'] } },
      { sort: { createdAt: -1 } }
    ).fetch();

    return {
      stats,
      recentClinicalImpressions,
      recentCommunications,
      activeImports,
      isLoading: false
    };
  }, []);

  // Fetch recent imports on component mount
  useEffect(function() {
    if (Meteor.userId()) {
      Meteor.call('facebook.getUserImports', function(error, result) {
        if (!error) {
          setRecentImports(result || []);
        }
      });
    }
  }, []);

  const quickActions = [
    {
      title: 'Import Facebook Data',
      description: 'Upload and process your Facebook export',
      icon: <UploadIcon />,
      color: 'primary',
      onClick: function() { navigate('/import'); }
    },
    {
      title: 'View Timeline',
      description: 'Browse your health timeline',
      icon: <TimelineIcon />,
      color: 'secondary',
      onClick: function() { navigate('/timeline'); }
    },
    {
      title: 'Analytics',
      description: 'View insights and trends',
      icon: <AnalyticsIcon />,
      color: 'success',
      onClick: function() { navigate('/analytics'); }
    }
  ];

  if (isLoading) {
    return (
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
          <LinearProgress sx={{ width: '50%' }} />
        </Box>
      </Container>
    );
  }

  const hasData = stats.totalCommunications > 0 || stats.totalClinicalImpressions > 0 || stats.totalMedia > 0 || stats.totalPersons > 0;

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      {/* Welcome Header */}
      <Box mb={4}>
        <Typography variant="h3" component="h1" gutterBottom>
          Personal Health Timeline
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Welcome back! Here's your health data overview with correct FHIR mappings.
        </Typography>
      </Box>

      {/* Active Imports Alert */}
      {activeImports.length > 0 && (
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body2">
            {activeImports.length} import{activeImports.length > 1 ? 's' : ''} currently processing...
          </Typography>
        </Alert>
      )}

      {/* FIXED: Statistics Cards with Corrected FHIR Mappings */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Communications"
            value={stats.totalCommunications}
            icon={<MessageIcon />}
            color="primary"
            description="From Facebook messages"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Clinical Impressions"
            value={stats.totalClinicalImpressions}
            icon={<HealthIcon />}
            color="error"
            description="From Facebook posts"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Media Files"
            value={stats.totalMedia}
            icon={<PhotoIcon />}
            color="warning"
            description="From Facebook photos"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Persons"
            value={stats.totalPersons}
            icon={<PersonIcon />}
            color="success"
            description="From Facebook friends"
          />
        </Grid>
      </Grid>

      {/* Main Content */}
      <Grid container spacing={3}>
        {/* Left Column */}
        <Grid item xs={12} lg={8}>
          {/* Active Import Progress */}
          {activeImports.length > 0 && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Import Progress
                </Typography>
                {activeImports.map(function(importJob) {
                  return (
                    <ImportProgress key={importJob._id} job={importJob} />
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Recent Activity */}
          {hasData ? (
            <Card>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                  <Typography variant="h6">
                    Recent Activity
                  </Typography>
                  <Button
                    size="small"
                    onClick={function() { navigate('/timeline'); }}
                  >
                    View All
                  </Button>
                </Box>
                <Alert severity="info" sx={{ mb: 2 }}>
                  <Typography variant="body2">
                    <strong>Note:</strong> Health Records come from Facebook posts, Communications from messages
                  </Typography>
                </Alert>
                <RecentActivity
                  clinicalImpressions={recentClinicalImpressions}
                  communications={recentCommunications}
                  limit={10}
                  showPagination={false}
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 6 }}>
                <UploadIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                <Typography variant="h5" gutterBottom>
                  No Data Yet
                </Typography>
                <Typography variant="body1" color="text.secondary" paragraph>
                  Get started by importing your Facebook data to create your personal health timeline.
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  <strong>FHIR Mappings:</strong> Posts → Clinical Records, Messages → Communications, 
                  Photos → Media, Friends → Persons
                </Typography>
                <Button
                  variant="contained"
                  size="large"
                  startIcon={<UploadIcon />}
                  onClick={function() { navigate('/import'); }}
                >
                  Import Facebook Data
                </Button>
              </CardContent>
            </Card>
          )}
        </Grid>

        {/* Right Column */}
        <Grid item xs={12} lg={4}>
          {/* Quick Actions */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Quick Actions
              </Typography>
              <QuickActions actions={quickActions} />
            </CardContent>
          </Card>

          {/* Recent Imports */}
          {recentImports.length > 0 && (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Recent Imports
                </Typography>
                <Box>
                  {recentImports.slice(0, 5).map(function(importJob) {
                    return (
                      <Box key={importJob._id} sx={{ mb: 2 }}>
                        <Box display="flex" justifyContent="space-between" alignItems="center">
                          <Typography variant="body2" noWrap sx={{ flex: 1, mr: 1 }}>
                            {importJob.filename}
                          </Typography>
                          <Chip
                            label={importJob.status}
                            size="small"
                            color={
                              importJob.status === 'completed' ? 'success' :
                              importJob.status === 'failed' ? 'error' :
                              importJob.status === 'processing' ? 'warning' : 'default'
                            }
                          />
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {moment(importJob.createdAt).format('MMM DD, YYYY HH:mm')}
                        </Typography>
                        {importJob.results && (
                          <Typography variant="caption" display="block" color="text.secondary">
                            {get(importJob.results, 'communications', 0)} messages, {' '}
                            {get(importJob.results, 'clinicalImpressions', 0)} posts, {' '}
                            {get(importJob.results, 'media', 0)} photos, {' '}
                            {get(importJob.results, 'persons', 0)} friends
                          </Typography>
                        )}
                      </Box>
                    );
                  })}
                </Box>
                <Button
                  size="small"
                  onClick={function() { navigate('/import'); }}
                  sx={{ mt: 1 }}
                >
                  View All Imports
                </Button>
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>

      {/* Floating Action Button */}
      <Fab
        color="primary"
        aria-label="import"
        sx={{
          position: 'fixed',
          bottom: 16,
          right: 16,
        }}
        onClick={function() { navigate('/import'); }}
      >
        <AddIcon />
      </Fab>
    </Container>
  );
}

export default Dashboard;