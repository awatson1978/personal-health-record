// QuickActions.jsx
import React from 'react';
import {
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar
} from '@mui/material';

export function QuickActions({ actions = [] }) {
  return (
    <List>
      {actions.map(function(action, index) {
        return (
          <ListItem key={index} disablePadding>
            <ListItemButton onClick={action.onClick}>
              <ListItemIcon>
                <Avatar sx={{ bgcolor: `${action.color}.main`, width: 40, height: 40 }}>
                  {action.icon}
                </Avatar>
              </ListItemIcon>
              <ListItemText
                primary={action.title}
                secondary={action.description}
              />
            </ListItemButton>
          </ListItem>
        );
      })}
    </List>
  );
}

