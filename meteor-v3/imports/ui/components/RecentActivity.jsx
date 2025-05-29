// meteor-v3/imports/ui/components/RecentActivity.jsx
import React, { useState } from 'react';
import { Meteor } from 'meteor/meteor';
import {
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  Typography,
  Box,
  Button,
  Pagination,
  IconButton,
  Snackbar,
  Alert
} from '@mui/material';
import {
  LocalHospital as HealthIcon,
  Message as MessageIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon
} from '@mui/icons-material';
import moment from 'moment';
import { get } from 'lodash';

export function RecentActivity({ 
  clinicalImpressions = [], 
  communications = [],
  limit = 10,
  showPagination = false 
}) {
  const [page, setPage] = useState(1);
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [deleting, setDeleting] = useState(new Set());
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  
  const itemsPerPage = limit;

  // Combine and sort activities
  const activities = [];

  clinicalImpressions.forEach(function(impression) {
    activities.push({
      ...impression,
      type: 'clinical',
      date: impression.date,
      title: get(impression, 'description', 'Clinical impression'),
      subtitle: moment(impression.date).fromNow(),
      fullContent: get(impression, 'description', '')
    });
  });

  communications.forEach(function(comm) {
    const content = get(comm, 'payload.0.contentString', '');
    activities.push({
      ...comm,
      type: 'communication',
      date: comm.sent,
      title: content.length > 60 ? content.substring(0, 60) + '...' : content,
      subtitle: moment(comm.sent).fromNow(),
      fullContent: content
    });
  });

  // Sort by date descending
  activities.sort(function(a, b) {
    return moment(b.date).valueOf() - moment(a.date).valueOf();
  });

  const totalPages = Math.ceil(activities.length / itemsPerPage);
  const startIndex = (page - 1) * itemsPerPage;
  const paginatedActivities = showPagination 
    ? activities.slice(startIndex, startIndex + itemsPerPage)
    : activities.slice(0, limit);

  const toggleExpanded = function(activityId) {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(activityId)) {
      newExpanded.delete(activityId);
    } else {
      newExpanded.add(activityId);
    }
    setExpandedItems(newExpanded);
  };

  const handleDelete = async function(activity) {
    const activityId = activity._id;
    
    // Add to deleting set to show loading state
    setDeleting(function(prev) {
      const newSet = new Set(prev);
      newSet.add(activityId);
      return newSet;
    });
    
    try {
      let methodName = '';
      
      if (activity.type === 'clinical') {
        methodName = 'fhir.deleteClinicalImpression';
      } else if (activity.type === 'communication') {
        methodName = 'fhir.deleteCommunication';
      }
      
      await new Promise(function(resolve, reject) {
        Meteor.call(methodName, activityId, function(error, result) {
          if (error) reject(error);
          else resolve(result);
        });
      });
      
      setSnackbar({
        open: true,
        message: `${activity.type === 'clinical' ? 'Health record' : 'Communication'} deleted`,
        severity: 'success'
      });
      
    } catch (error) {
      console.error('Delete error:', error);
      setSnackbar({
        open: true,
        message: `Error deleting item: ${error.reason || error.message}`,
        severity: 'error'
      });
    } finally {
      // Remove from deleting set
      setDeleting(function(prev) {
        const newSet = new Set(prev);
        newSet.delete(activityId);
        return newSet;
      });
    }
  };

  const closeSnackbar = function() {
    setSnackbar({ ...snackbar, open: false });
  };

  if (activities.length === 0) {
    return (
      <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
        No recent activity
      </Typography>
    );
  }

  return (
    <Box>
      <List>
        {paginatedActivities.map(function(activity, index) {
          const isExpanded = expandedItems.has(activity._id);
          const needsExpansion = activity.fullContent.length > 60;
          const isDeleting = deleting.has(activity._id);
          
          return (
            <ListItem 
              key={`${activity.type}-${activity._id || index}`}
              sx={{ 
                border: 1, 
                borderColor: 'divider', 
                borderRadius: 1, 
                mb: 1,
                flexDirection: 'column',
                alignItems: 'stretch',
                opacity: isDeleting ? 0.5 : 1
              }}
            >
              <Box display="flex" alignItems="flex-start" width="100%">
                <ListItemIcon>
                  {activity.type === 'clinical' ? (
                    <HealthIcon color="error" />
                  ) : (
                    <MessageIcon color="primary" />
                  )}
                </ListItemIcon>
                
                <ListItemText
                  primary={isExpanded ? activity.fullContent : activity.title}
                  secondary={
                    <Box>
                      <Typography variant="caption" display="block">
                        {activity.subtitle}
                      </Typography>
                      <Typography variant="caption" display="block" color="text.secondary">
                        {moment(activity.date).format('MMM DD, YYYY HH:mm')}
                      </Typography>
                    </Box>
                  }
                  sx={{ flex: 1, mr: 1 }}
                />
                
                <Box display="flex" alignItems="center">
                  {/* Expand button - moved to left of chip */}
                  {needsExpansion && (
                    <IconButton
                      size="small"
                      onClick={function() { toggleExpanded(activity._id); }}
                      disabled={isDeleting}
                    >
                      {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
                    </IconButton>
                  )}
                  
                  <Chip
                    label={activity.type === 'clinical' ? 'Health' : 'Social'}
                    size="small"
                    color={activity.type === 'clinical' ? 'error' : 'primary'}
                    variant="outlined"
                    sx={{ mr: 1 }}
                  />
                  
                  <IconButton
                    size="small"
                    onClick={function() { handleDelete(activity); }}
                    color="error"
                    disabled={isDeleting}
                  >
                    <DeleteIcon />
                  </IconButton>
                </Box>
              </Box>
            </ListItem>
          );
        })}
      </List>

      {showPagination && totalPages > 1 && (
        <Box display="flex" justifyContent="center" mt={2}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={function(event, value) { setPage(value); }}
            color="primary"
          />
        </Box>
      )}

      {!showPagination && activities.length > limit && (
        <Box textAlign="center" mt={2}>
          <Typography variant="body2" color="text.secondary">
            Showing {limit} of {activities.length} items
          </Typography>
        </Box>
      )}

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
    </Box>
  );
}