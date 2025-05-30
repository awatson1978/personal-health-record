// meteor-v3/imports/ui/components/Header.jsx
import React from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Avatar,
  Box,
  Menu,
  MenuItem,
  Divider
} from '@mui/material';
import {
  Menu as MenuIcon,
  AccountCircle as AccountIcon,
  Brightness4 as DarkModeIcon,
  Brightness7 as LightModeIcon,
  Logout as LogoutIcon,
  Settings as SettingsIcon,
  Person as PersonIcon
} from '@mui/icons-material';
import { Meteor } from 'meteor/meteor';
import { useNavigate } from 'react-router-dom';
import { get } from 'lodash';

function Header({ onMenuClick, onThemeToggle, darkMode }) {
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = React.useState(null);

  const user = Meteor.user();
  const userName = get(user, 'profile.name', get(user, 'emails.0.address', 'User'));

  const handleProfileMenuOpen = function(event) {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = function() {
    setAnchorEl(null);
  };

  const handleProfile = function() {
    navigate('/profile');
    handleMenuClose();
  };

  const handleLogout = function() {
    Meteor.logout(function(error) {
      if (error) {
        console.error('Logout error:', error);
      } else {
        navigate('/login');
      }
    });
    handleMenuClose();
  };

  const handleSettings = function() {
    navigate('/settings');
    handleMenuClose();
  };

  return (
    <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
      <Toolbar>
        <IconButton
          color="inherit"
          aria-label="open drawer"
          onClick={onMenuClick}
          edge="start"
          sx={{ mr: 2 }}
        >
          <MenuIcon />
        </IconButton>

        <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
          Facebook to FHIR
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton
            color="inherit"
            onClick={onThemeToggle}
            aria-label="toggle theme"
          >
            {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>

          <IconButton
            color="inherit"
            onClick={handleProfileMenuOpen}
            aria-label="account menu"
          >
            <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main' }}>
              {userName.charAt(0).toUpperCase()}
            </Avatar>
          </IconButton>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
            onClick={handleMenuClose}
            PaperProps={{
              elevation: 0,
              sx: {
                overflow: 'visible',
                filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.32))',
                mt: 1.5,
                '& .MuiAvatar-root': {
                  width: 32,
                  height: 32,
                  ml: -0.5,
                  mr: 1,
                },
                '&:before': {
                  content: '""',
                  display: 'block',
                  position: 'absolute',
                  top: 0,
                  right: 14,
                  width: 10,
                  height: 10,
                  bgcolor: 'background.paper',
                  transform: 'translateY(-50%) rotate(45deg)',
                  zIndex: 0,
                },
              },
            }}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          >
            <MenuItem onClick={handleMenuClose}>
              <Avatar />
              {userName}
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleProfile}>
              <PersonIcon sx={{ mr: 2 }} />
              Profile
            </MenuItem>
            <MenuItem onClick={handleSettings}>
              <SettingsIcon sx={{ mr: 2 }} />
              Settings
            </MenuItem>
            <MenuItem onClick={handleLogout}>
              <LogoutIcon sx={{ mr: 2 }} />
              Logout
            </MenuItem>
          </Menu>
        </Box>
      </Toolbar>
    </AppBar>
  );
}

export default Header;