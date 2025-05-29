// Analytics.jsx
import React from 'react';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Alert
} from '@mui/material';

export function Analytics() {
  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box mb={4}>
        <Typography variant="h3" component="h1" gutterBottom>
          Health Analytics
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Insights and trends from your health data.
        </Typography>
      </Box>

      <Card>
        <CardContent>
          <Alert severity="info">
            Analytics dashboard is coming soon! This will show trends, patterns, and insights from your health timeline.
          </Alert>
        </CardContent>
      </Card>
    </Container>
  );
}

