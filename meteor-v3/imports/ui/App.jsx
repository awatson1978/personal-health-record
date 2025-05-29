// meteor-v3/imports/ui/App.jsx
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';

import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, Box } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterMoment } from '@mui/x-date-pickers/AdapterMoment';

// Components - Import directly, not from index
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import { LoadingScreen } from './components/LoadingScreen';
import { ErrorBoundary } from './components/ErrorBoundary';

// Pages - Import directly, not from index
import Dashboard from './pages/Dashboard';
import { Timeline } from './pages/Timeline';
import Import from './pages/Import';
import { Analytics } from './pages/Analytics';
import { Settings } from './pages/Settings';
import { Login } from './pages/Login';
import { Register } from './pages/Register';

// Constants
const DRAWER_WIDTH = 240;

// Theme configuration
const createAppTheme = function(mode) {
  return createTheme({
    palette: {
      mode,
      primary: {
        main: mode === 'dark' ? '#90caf9' : '#1976d2',
      },
      secondary: {
        main: mode === 'dark' ? '#f48fb1' : '#dc004e',
      },
      background: {
        default: mode === 'dark' ? '#121212' : '#f5f5f5',
        paper: mode === 'dark' ? '#1e1e1e' : '#ffffff',
      },
      text: {
        primary: mode === 'dark' ? '#ffffff' : '#000000',
        secondary: mode === 'dark' ? '#b0b0b0' : '#666666',
      }
    },
    typography: {
      fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
      h1: {
        fontSize: '2.5rem',
        fontWeight: 600,
      },
      h2: {
        fontSize: '2rem',
        fontWeight: 600,
      },
      h3: {
        fontSize: '1.75rem',
        fontWeight: 500,
      },
      h4: {
        fontSize: '1.5rem',
        fontWeight: 500,
      },
      h5: {
        fontSize: '1.25rem',
        fontWeight: 500,
      },
      h6: {
        fontSize: '1rem',
        fontWeight: 500,
      }
    },
    components: {
      MuiAppBar: {
        styleOverrides: {
          root: {
            boxShadow: 'none',
            borderBottom: `1px solid ${mode === 'dark' ? '#333' : '#e0e0e0'}`,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: mode === 'dark' ? '#1e1e1e' : '#ffffff',
            borderRight: `1px solid ${mode === 'dark' ? '#333' : '#e0e0e0'}`,
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            boxShadow: mode === 'dark' 
              ? '0 2px 8px rgba(0,0,0,0.3)' 
              : '0 2px 8px rgba(0,0,0,0.1)',
          },
        },
      },
    },
  });
};

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(function() {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('facebook-fhir-theme');
      return saved ? saved === 'dark' : false;
    }
    return false;
  });

  const { user, userLoading } = useTracker(function() {
    const user = Meteor.user();
    const userLoading = !Meteor.userId() && Meteor.loggingIn();
    
    return {
      user,
      userLoading
    };
  }, []);

  const theme = createAppTheme(darkMode ? 'dark' : 'light');

  useEffect(function() {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('facebook-fhir-theme', darkMode ? 'dark' : 'light');
    }
  }, [darkMode]);

  // Auto-close sidebar on mobile when route changes
  useEffect(function() {
    const handleResize = function() {
      if (window.innerWidth < 960 && sidebarOpen) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return function() {
      window.removeEventListener('resize', handleResize);
    };
  }, [sidebarOpen]);

  const toggleSidebar = function() {
    setSidebarOpen(!sidebarOpen);
  };

  const closeSidebar = function() {
    setSidebarOpen(false);
  };

  const toggleTheme = function() {
    setDarkMode(!darkMode);
  };

  if (userLoading) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <LoadingScreen />
      </ThemeProvider>
    );
  }

  return (
    <ErrorBoundary>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <LocalizationProvider dateAdapter={AdapterMoment}>
          <Router>
            <Box sx={{ display: 'flex' }}>
              {user && (
                <>
                  <Header 
                    onMenuClick={toggleSidebar}
                    onThemeToggle={toggleTheme}
                    darkMode={darkMode}
                  />
                  <Sidebar 
                    open={sidebarOpen}
                    onClose={closeSidebar}
                    user={user}
                    drawerWidth={DRAWER_WIDTH}
                  />
                </>
              )}

              <Box
                component="main"
                sx={{
                  flexGrow: 1,
                  pt: user ? 8 : 0, // Account for header height when logged in
                  minHeight: '100vh',
                  backgroundColor: 'background.default',
                  width: '100%'
                }}
              >
                <Routes>
                  {/* Public routes */}
                  <Route 
                    path="/login" 
                    element={user ? <Navigate to="/" replace /> : <Login />} 
                  />
                  <Route 
                    path="/register" 
                    element={user ? <Navigate to="/" replace /> : <Register />} 
                  />

                  {/* Protected routes */}
                  {user ? (
                    <>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/timeline" element={<Timeline />} />
                      <Route path="/import" element={<Import />} />
                      <Route path="/analytics" element={<Analytics />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </>
                  ) : (
                    <Route path="*" element={<Navigate to="/login" replace />} />
                  )}
                </Routes>
              </Box>
            </Box>
          </Router>
        </LocalizationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;