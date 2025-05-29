// ErrorBoundary.jsx
import React from 'react';
import {
  Box,
  Typography,
  Button,
  Alert,
  AlertTitle
} from '@mui/material';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box
          display="flex"
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
          minHeight="100vh"
          p={3}
        >
          <Alert severity="error" sx={{ maxWidth: 600, mb: 2 }}>
            <AlertTitle>Something went wrong</AlertTitle>
            <Typography variant="body2">
              {this.state.error?.message || 'An unexpected error occurred'}
            </Typography>
          </Alert>
          <Button
            variant="contained"
            onClick={function() { window.location.reload(); }}
          >
            Reload Page
          </Button>
        </Box>
      );
    }

    return this.props.children;
  }
}