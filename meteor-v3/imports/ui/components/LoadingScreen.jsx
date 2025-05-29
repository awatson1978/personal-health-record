// LoadingScreen.jsx
import React from 'react';
import {
  Box,
  CircularProgress,
  Typography
} from '@mui/material';

export function LoadingScreen() {
  return (
    <Box
      display="flex"
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
      minHeight="100vh"
      bgcolor="background.default"
    >
      <CircularProgress size={60} sx={{ mb: 2 }} />
      <Typography variant="h6" color="text.secondary">
        Loading...
      </Typography>
    </Box>
  );
}

