// Settings.jsx
import React from 'react';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Alert
} from '@mui/material';

export function Settings() {
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

      <Card>
        <CardContent>
          <Alert severity="info">
            Settings page is coming soon! This will allow you to manage your profile, privacy settings, and data preferences.
          </Alert>
        </CardContent>
      </Card>
    </Container>
  );
}