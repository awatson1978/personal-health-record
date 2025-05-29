// ImportProgress.jsx
import React from 'react';
import {
  Box,
  Typography,
  LinearProgress,
  Chip
} from '@mui/material';
import { get } from 'lodash';

export function ImportProgress({ job }) {
  const progress = get(job, 'progress', 0);
  const status = get(job, 'status', 'pending');
  const filename = get(job, 'filename', 'Unknown file');

  const getStatusColor = function(status) {
    switch (status) {
      case 'completed': return 'success';
      case 'failed': return 'error';
      case 'processing': return 'warning';
      default: return 'default';
    }
  };

  return (
    <Box sx={{ mb: 2 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="body2" noWrap sx={{ flex: 1, mr: 1 }}>
          {filename}
        </Typography>
        <Chip
          label={status}
          size="small"
          color={getStatusColor(status)}
        />
      </Box>
      {status === 'processing' && (
        <Box>
          <LinearProgress variant="determinate" value={progress} />
          <Typography variant="caption" color="text.secondary">
            {progress}% complete
          </Typography>
        </Box>
      )}
    </Box>
  );
}

