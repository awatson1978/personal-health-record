// RecentActivity.jsx
import React from 'react';
import {
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  Typography,
  Box
} from '@mui/material';
import {
  LocalHospital as HealthIcon,
  Message as MessageIcon
} from '@mui/icons-material';
import moment from 'moment';
import { get } from 'lodash';

export function RecentActivity({ clinicalImpressions = [], communications = [] }) {
  // Combine and sort activities
  const activities = [];

  clinicalImpressions.forEach(function(impression) {
    activities.push({
      ...impression,
      type: 'clinical',
      date: impression.date,
      title: get(impression, 'description', 'Clinical impression'),
      subtitle: moment(impression.date).fromNow()
    });
  });

  communications.forEach(function(comm) {
    const content = get(comm, 'payload.0.contentString', '');
    activities.push({
      ...comm,
      type: 'communication',
      date: comm.sent,
      title: content.length > 60 ? content.substring(0, 60) + '...' : content,
      subtitle: moment(comm.sent).fromNow()
    });
  });

  // Sort by date descending
  activities.sort(function(a, b) {
    return moment(b.date).valueOf() - moment(a.date).valueOf();
  });

  if (activities.length === 0) {
    return (
      <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
        No recent activity
      </Typography>
    );
  }

  return (
    <List>
      {activities.slice(0, 10).map(function(activity, index) {
        return (
          <ListItem key={`${activity.type}-${activity._id || index}`}>
            <ListItemIcon>
              {activity.type === 'clinical' ? (
                <HealthIcon color="error" />
              ) : (
                <MessageIcon color="primary" />
              )}
            </ListItemIcon>
            <ListItemText
              primary={activity.title}
              secondary={activity.subtitle}
            />
            <Chip
              label={activity.type === 'clinical' ? 'Health' : 'Social'}
              size="small"
              color={activity.type === 'clinical' ? 'error' : 'primary'}
              variant="outlined"
            />
          </ListItem>
        );
      })}
    </List>
  );
}

