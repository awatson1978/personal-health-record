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
  Fab,
  Skeleton,
  Avatar
} from '@mui/material';

import {
  Timeline as TimelineIcon,
  Upload as UploadIcon,
  Analytics as AnalyticsIcon,
  Person as PersonIcon,
  LocalHospital as HealthIcon,
  Photo as PhotoIcon,
  Message as MessageIcon,
  Add as AddIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';

import { useNavigate } from 'react-router-dom';

import { ImportJobs } from '../../api/fhir/collections';
import { StatCard } from '../components/StatCard';
import { QuickActions } from '../components/QuickActions';
import { ImportProgress } from '../components/ImportProgress';

function Dashboard() {
  const navigate = useNavigate();
  
  // Server-side statistics state
  const [stats, setStats] = useState(null);
  const [recentActivity, setRecentActivity] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [statsError, setStatsError] = useState(null);

  // Client-side reactive data for imports only
  const { activeImports, isLoading: importsLoading } = useTracker(function() {
    const userId = Meteor.userId();
    if (!userId) return { isLoading: true };

    const importsHandle = Meteor.subscribe('user.imports');
    const isLoading = !importsHandle.ready();

    if (isLoading) return { isLoading: true };

    const activeImports = ImportJobs.find(
      { userId, status: { $in: ['pending', 'processing'] } },
      { sort: { createdAt: -1 } }
    ).fetch();

    return {
      activeImports,
      isLoading: false
    };
  }, []);

  // Load server-side statistics
  const loadStatistics = async function() {
    setLoadingStats(true);
    setStatsError(null);
    
    try {
      console.log('📊 Loading server-side statistics...');
      
      const result = await new Promise(function(resolve, reject) {
        Meteor.call('dashboard.getStatistics', function(error, result) {
          if (error) reject(error);
          else resolve(result);
        });
      });
      
      setStats(result);
      console.log('✅ Server-side statistics loaded:', result);
      
    } catch (error) {
      console.error('❌ Error loading statistics:', error);
      setStatsError(error.reason || error.message);
    } finally {
      setLoadingStats(false);
    }
  };

  // Load recent activity
  const loadRecentActivity = async function() {
    setLoadingActivity(true);
    
    try {
      console.log('📊 Loading recent activity...');
      
      const result = await new Promise(function(resolve, reject) {
        Meteor.call('dashboard.getRecentActivity', 15, function(error, result) {
          if (error) reject(error);
          else resolve(result);
        });
      });
      
      setRecentActivity(result);
      console.log('✅ Recent activity loaded:', result);
      
    } catch (error) {
      console.error('❌ Error loading recent activity:', error);
    } finally {
      setLoadingActivity(false);
    }
  };

  // Load data on component mount and when user changes
  useEffect(function() {
    if (Meteor.userId()) {
      console.log('🚀 Initial load of dashboard data');
      loadStatistics();
      loadRecentActivity();
    }
  }, [Meteor.userId()]); // Only depend on userId changes

  // Auto-refresh stats when imports complete (but prevent infinite loops)
  const [lastRefreshTime, setLastRefreshTime] = useState(0);
  
  useEffect(function() {
    const now = Date.now();
    // Only refresh if no active imports, we have stats, not currently loading, and haven't refreshed recently
    if (activeImports && activeImports.length === 0 && stats && !loadingStats && 
        (now - lastRefreshTime) > 10000) { // 10 second cooldown
      
      console.log('🔄 Auto-refreshing stats after import completion');
      setLastRefreshTime(now);
      
      const timer = setTimeout(function() {
        loadStatistics();
        loadRecentActivity();
      }, 2000);
      
      return function() { clearTimeout(timer); };
    }
  }, [activeImports?.length, lastRefreshTime]);

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

  const handleRefreshStats = function() {
    loadStatistics();
    loadRecentActivity();
  };

  if (importsLoading && loadingStats) {
    return (
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
          <LinearProgress sx={{ width: '50%' }} />
        </Box>
      </Container>
    );
  }

  const hasData = stats && (
    stats.totalCommunications > 0 || 
    stats.totalClinicalImpressions > 0 || 
    stats.totalMedia > 0 || 
    stats.totalPersons > 0
  );

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      {/* Welcome Header */}
      <Box mb={4}>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography variant="h3" component="h1" gutterBottom>
              Facebook FHIR Timeline
            </Typography>
            <Typography variant="subtitle1" color="text.secondary">
              Your social media data transformed into structured health records using FHIR standards.
            </Typography>
          </Box>
          
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRefreshStats}
            disabled={loadingStats}
          >
            {loadingStats ? 'Refreshing...' : 'Refresh'}
          </Button>
        </Box>
      </Box>

      {/* Stats Error Alert */}
      {statsError && (
        <Alert severity="error" sx={{ mb: 3 }} action={
          <Button color="inherit" size="small" onClick={handleRefreshStats}>
            Retry
          </Button>
        }>
          Error loading statistics: {statsError}
        </Alert>
      )}

      {/* Active Imports Alert */}
      {activeImports && activeImports.length > 0 && (
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body2">
            {activeImports.length} import{activeImports.length > 1 ? 's' : ''} currently processing...
          </Typography>
        </Alert>
      )}

      {/* Statistics Cards - Server Side Data */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          {loadingStats ? (
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Skeleton variant="text" width="60%" />
                <Skeleton variant="text" width="40%" height={40} />
                <Skeleton variant="text" width="80%" />
              </CardContent>
            </Card>
          ) : (
            <StatCard
              title="Communications"
              value={get(stats, 'totalCommunications', 0)}
              icon={<MessageIcon />}
              color="primary"
              description="From Facebook messages"
            />
          )}
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          {loadingStats ? (
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Skeleton variant="text" width="60%" />
                <Skeleton variant="text" width="40%" height={40} />
                <Skeleton variant="text" width="80%" />
              </CardContent>
            </Card>
          ) : (
            <StatCard
              title="Health Records"
              value={get(stats, 'totalClinicalImpressions', 0)}
              icon={<HealthIcon />}
              color="error"
              description="From Facebook posts"
            />
          )}
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          {loadingStats ? (
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Skeleton variant="text" width="60%" />
                <Skeleton variant="text" width="40%" height={40} />
                <Skeleton variant="text" width="80%" />
              </CardContent>
            </Card>
          ) : (
            <StatCard
              title="Media Files"
              value={get(stats, 'totalMedia', 0)}
              icon={<PhotoIcon />}
              color="warning"
              description="From Facebook photos"
            />
          )}
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          {loadingStats ? (
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Skeleton variant="text" width="60%" />
                <Skeleton variant="text" width="40%" height={40} />
                <Skeleton variant="text" width="80%" />
              </CardContent>
            </Card>
          ) : (
            <StatCard
              title="Contacts"
              value={get(stats, 'totalPersons', 0)}
              icon={<PersonIcon />}
              color="success"
              description="From Facebook friends"
            />
          )}
        </Grid>
      </Grid>

      {/* Main Content */}
      <Grid container spacing={3}>
        {/* Left Column */}
        <Grid item xs={12} lg={8}>
          {/* Active Import Progress */}
          {activeImports && activeImports.length > 0 && (
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
                    <strong>FHIR Mapping:</strong> Posts → Clinical Records, Messages → Communications, 
                    Photos → Media, Friends → Contacts
                  </Typography>
                </Alert>
                
                {loadingActivity ? (
                  <Box>
                    {[1, 2, 3].map(function(item) {
                      return (
                        <Box key={item} sx={{ mb: 2 }}>
                          <Skeleton variant="text" width="80%" />
                          <Skeleton variant="text" width="40%" />
                        </Box>
                      );
                    })}
                  </Box>
                ) : recentActivity && recentActivity.activities ? (
                  <Box>
                    {recentActivity.activities.slice(0, 10).map(function(activity, index) {
                      const resourceInfo = activity.type === 'clinical' ? 
                        { icon: <HealthIcon />, color: 'error', label: 'Health Record' } :
                        { icon: <MessageIcon />, color: 'primary', label: 'Communication' };
                      
                      const content = activity.type === 'clinical' ? 
                        get(activity, 'description', 'Clinical impression') :
                        get(activity, 'payload.0.contentString', 'Communication');

                      return (
                        <Box key={activity._id || index} sx={{ 
                          border: 1, 
                          borderColor: 'divider', 
                          borderRadius: 1, 
                          mb: 1,
                          p: 2
                        }}>
                          <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
                            <Avatar sx={{ bgcolor: `${resourceInfo.color}.main`, mr: 2, width: 32, height: 32 }}>
                              {resourceInfo.icon}
                            </Avatar>
                            <Box sx={{ flex: 1 }}>
                              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                {content.length > 80 ? content.substring(0, 80) + '...' : content}
                              </Typography>
                              <Box display="flex" alignItems="center" gap={1} sx={{ mt: 0.5 }}>
                                <Chip 
                                  label={resourceInfo.label} 
                                  size="small" 
                                  color={resourceInfo.color}
                                  variant="outlined"
                                />
                                <Typography variant="caption" color="text.secondary">
                                  {activity.relativeDate || moment(activity.sortDate).fromNow()}
                                </Typography>
                              </Box>
                            </Box>
                          </Box>
                        </Box>
                      );
                    })}
                  </Box>
                ) : (
                  <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                    No recent activity found
                  </Typography>
                )}
              </CardContent>
            </Card>
          ) : !loadingStats ? (
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
                  Photos → Media, Friends → Contacts
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
          ) : (
            <Card>
              <CardContent>
                <Skeleton variant="text" width="60%" height={40} />
                <Skeleton variant="rectangular" width="100%" height={200} />
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

          {/* Statistics Summary */}
          {stats && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Data Summary
                </Typography>
                <Box>
                  <Typography variant="body2" color="text.secondary" paragraph>
                    <strong>Total Records:</strong> {
                      stats.totalCommunications + 
                      stats.totalClinicalImpressions + 
                      stats.totalMedia + 
                      stats.totalPersons
                    }
                  </Typography>
                  
                  {stats.completedImports > 0 && (
                    <Typography variant="body2" color="text.secondary" paragraph>
                      <strong>Completed Imports:</strong> {stats.completedImports}
                    </Typography>
                  )}
                  
                  <Typography variant="caption" color="text.secondary">
                    Last updated: {moment(stats.lastUpdated).fromNow()}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          )}

          {/* FHIR Resource Info */}
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                FHIR Resources
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Your Facebook data is mapped to standard FHIR (Fast Healthcare Interoperability Resources) format:
              </Typography>
              <Box component="ul" sx={{ pl: 2, mt: 1 }}>
                <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
                  <strong>Patient:</strong> Your profile information
                </Typography>
                <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
                  <strong>Communication:</strong> Messages and conversations
                </Typography>
                <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
                  <strong>ClinicalImpression:</strong> Health-related posts
                </Typography>
                <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
                  <strong>Media:</strong> Photos and videos
                </Typography>
                <Typography component="li" variant="body2">
                  <strong>Person:</strong> Friends and contacts
                </Typography>
              </Box>
            </CardContent>
          </Card>
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