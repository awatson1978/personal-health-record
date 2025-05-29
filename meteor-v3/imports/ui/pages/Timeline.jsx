// Timeline.jsx
import React from 'react';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Alert
} from '@mui/material';

export function Timeline() {
  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box mb={4}>
        <Typography variant="h3" component="h1" gutterBottom>
          Health Timeline
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Your chronological health journey from social media data.
        </Typography>
      </Box>

      <Card>
        <CardContent>
          <Alert severity="info">
            Timeline view is coming soon! This will display your health records and social posts in chronological order.
          </Alert>
        </CardContent>
      </Card>
    </Container>
  );
}

