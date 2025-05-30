// meteor-v3/imports/ui/components/Sidebar.jsx
import React from 'react';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Box,
  Typography
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Timeline as TimelineIcon,
  Upload as UploadIcon,
  Analytics as AnalyticsIcon,
  Settings as SettingsIcon,
  Info as InfoIcon,
  FileDownload as ExportIcon
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { get } from 'lodash';

const menuItems = [
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/' },
  { text: 'Timeline', icon: <TimelineIcon />, path: '/timeline' },
  { text: 'Import Data', icon: <UploadIcon />, path: '/import' },
  { text: 'Export Preview', icon: <ExportIcon />, path: '/export-preview' },
  { text: 'Analytics', icon: <AnalyticsIcon />, path: '/analytics' },
];

const secondaryItems = [
  { text: 'Settings', icon: <SettingsIcon />, path: '/settings' },
  { text: 'About', icon: <InfoIcon />, path: '/about' },
];

function Sidebar({ open, onClose, user, drawerWidth = 240 }) {
  const navigate = useNavigate();
  const location = useLocation();

  const userName = get(user, 'profile.name', get(user, 'emails.0.address', 'User'));

  const handleNavigation = function(path) {
    navigate(path);
    // Always close sidebar after navigation since it overlays
    onClose();
  };

  const isSelected = function(path) {
    return location.pathname === path;
  };

  const drawerContent = (
    <Box sx={{ 
      overflow: 'auto', 
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* User Info */}
      <Box sx={{ 
        p: 2, 
        borderBottom: 1, 
        borderColor: 'divider',
        minHeight: 'auto'
      }}>
        <Typography variant="h6" noWrap>
          Personal Health
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap>
          {userName}
        </Typography>
      </Box>

      {/* Main Navigation */}
      <List sx={{ flexGrow: 1 }}>
        {menuItems.map(function(item) {
          return (
            <ListItem key={item.text} disablePadding>
              <ListItemButton
                selected={isSelected(item.path)}
                onClick={function() { handleNavigation(item.path); }}
                sx={{
                  '&.Mui-selected': {
                    backgroundColor: 'primary.main',
                    color: 'primary.contrastText',
                    '& .MuiListItemIcon-root': {
                      color: 'primary.contrastText',
                    },
                    '&:hover': {
                      backgroundColor: 'primary.dark',
                    }
                  }
                }}
              >
                <ListItemIcon
                  sx={{
                    color: isSelected(item.path) ? 'inherit' : 'text.primary'
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={item.text} />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      <Divider />

      {/* Secondary Navigation */}
      <List>
        {secondaryItems.map(function(item) {
          return (
            <ListItem key={item.text} disablePadding>
              <ListItemButton
                selected={isSelected(item.path)}
                onClick={function() { handleNavigation(item.path); }}
                sx={{
                  '&.Mui-selected': {
                    backgroundColor: 'primary.main',
                    color: 'primary.contrastText',
                    '& .MuiListItemIcon-root': {
                      color: 'primary.contrastText',
                    },
                    '&:hover': {
                      backgroundColor: 'primary.dark',
                    }
                  }
                }}
              >
                <ListItemIcon
                  sx={{
                    color: isSelected(item.path) ? 'inherit' : 'text.primary'
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={item.text} />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      {/* Footer */}
      <Box sx={{ 
        p: 2, 
        borderTop: 1, 
        borderColor: 'divider',
        mt: 'auto'
      }}>
        <Typography variant="caption" color="text.secondary" align="center" display="block">
          Facebook FHIR Timeline v2.0
        </Typography>
      </Box>
    </Box>
  );

  return (
    <Drawer
      variant="temporary"
      anchor="left"
      open={open}
      onClose={onClose}
      ModalProps={{ 
        keepMounted: true // Better open performance
      }}
      sx={{
        '& .MuiDrawer-paper': { 
          boxSizing: 'border-box', 
          width: drawerWidth,
          top: 64, // Height of the header
          height: 'calc(100vh - 64px)',
          zIndex: (theme) => theme.zIndex.drawer
        },
      }}
    >
      {drawerContent}
    </Drawer>
  );
}

export default Sidebar;