// meteor-v3/imports/ui/pages/Timeline.jsx
import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { get } from 'lodash';
import moment from 'moment';

import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Alert,
  Button,
  Grid,
  Chip,
  Avatar,
  Divider,
  LinearProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Pagination,
  IconButton,
  Collapse,
  Skeleton,
  Paper,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  ListItemSecondaryAction
} from '@mui/material';

import {
  Timeline as TimelineIcon,
  LocalHospital as HealthIcon,
  Message as MessageIcon,
  Photo as PhotoIcon,
  Person as PersonIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  FilterList as FilterIcon,
  DateRange as DateIcon,
  Search as SearchIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';

import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { 
  Communications, 
  ClinicalImpressions, 
  Media, 
  Persons 
} from '../../api/fhir/collections';
import { useNavigate } from 'react-router-dom';

export function Timeline() {
  const navigate = useNavigate();
  
  // State management
  const [timelineData, setTimelineData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedItems, setExpandedItems] = useState(new Set());
  
  // Filter state
  const [filters, setFilters] = useState({
    dateRange: {
      start: null,
      end: null
    },
    resourceType: 'all', // 'all', 'clinical', 'communication', 'media'
    searchQuery: '',
    sortBy: 'date', // 'date', 'type'
    sortOrder: 'desc' // 'asc', 'desc'
  });

  const itemsPerPage = 25;

  // Load timeline data from server
  const loadTimelineData = async function(pageNumber = 1) {
    setLoading(true);
    setError(null);
    
    try {
      console.log('📊 Loading timeline data for page:', pageNumber);
      
      const result = await new Promise(function(resolve, reject) {
        Meteor.call('timeline.getData', {
          page: pageNumber,
          limit: itemsPerPage,
          filters: filters
        }, function(error, result) {
          if (error) reject(error);
          else resolve(result);
        });
      });
      
      setTimelineData(result.items || []);
      setTotalPages(Math.ceil((result.totalCount || 0) / itemsPerPage));
      console.log('✅ Timeline data loaded:', result);
      
    } catch (error) {
      console.error('❌ Error loading timeline data:', error);
      setError(error.reason || error.message);
    } finally {
      setLoading(false);
    }
  };

  // Client-side reactive data for stats
  const { stats, isLoading: statsLoading } = useTracker(function() {
    const userId = Meteor.userId();
    if (!userId) return { isLoading: true };

    // Light subscriptions for counting
    const commHandle = Meteor.subscribe('user.communications', 5);
    const clinicalHandle = Meteor.subscribe('user.clinicalImpressions', 5);
    const mediaHandle = Meteor.subscribe('user.media', 5);
    const personsHandle = Meteor.subscribe('user.persons', 5);

    const isLoading = !commHandle.ready() || !clinicalHandle.ready() || 
                     !mediaHandle.ready() || !personsHandle.ready();

    if (isLoading) return { isLoading: true };

    // Get sample counts (actual counts come from server)
    const stats = {
      communications: Communications.find({ userId }).count(),
      clinicalImpressions: ClinicalImpressions.find({ userId }).count(),
      media: Media.find({ userId }).count(),
      persons: Persons.find({ userId }).count()
    };

    return { stats, isLoading: false };
  }, []);

  // Load data on mount and filter changes
  useEffect(function() {
    if (Meteor.userId()) {
      loadTimelineData(1);
      setPage(1);
    }
  }, [filters.resourceType, filters.sortBy, filters.sortOrder]);

  // Handle search with debounce
  useEffect(function() {
    const timeoutId = setTimeout(function() {
      if (Meteor.userId()) {
        loadTimelineData(1);
        setPage(1);
      }
    }, 500);

    return function() { clearTimeout(timeoutId); };
  }, [filters.searchQuery]);

  // Handle date range changes
  useEffect(function() {
    if (filters.dateRange.start || filters.dateRange.end) {
      if (Meteor.userId()) {
        loadTimelineData(1);
        setPage(1);
      }
    }
  }, [filters.dateRange.start, filters.dateRange.end]);

  // Handle pagination
  const handlePageChange = function(event, newPage) {
    setPage(newPage);
    loadTimelineData(newPage);
  };

  // Handle filter changes
  const handleFilterChange = function(filterKey, value) {
    setFilters(function(prev) {
      return {
        ...prev,
        [filterKey]: value
      };
    });
  };

  // Handle nested filter changes (like dateRange)
  const handleNestedFilterChange = function(parentKey, childKey, value) {
    setFilters(function(prev) {
      return {
        ...prev,
        [parentKey]: {
          ...prev[parentKey],
          [childKey]: value
        }
      };
    });
  };

  // Toggle expanded item
  const toggleExpanded = function(itemId) {
    setExpandedItems(function(prev) {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  // Clear all filters
  const clearFilters = function() {
    setFilters({
      dateRange: { start: null, end: null },
      resourceType: 'all',
      searchQuery: '',
      sortBy: 'date',
      sortOrder: 'desc'
    });
  };

  // Navigate to export preview with current filters
  const handleExportPreview = function() {
    // Build query params from current filters
    const queryParams = new URLSearchParams();
    
    if (filters.dateRange.start) {
      queryParams.set('startDate', filters.dateRange.start.toISOString());
    }
    if (filters.dateRange.end) {
      queryParams.set('endDate', filters.dateRange.end.toISOString());
    }
    if (filters.resourceType !== 'all') {
      queryParams.set('resourceType', filters.resourceType);
    }
    if (filters.searchQuery) {
      queryParams.set('searchQuery', filters.searchQuery);
    }
    if (filters.sortBy !== 'date') {
      queryParams.set('sortBy', filters.sortBy);
    }
    if (filters.sortOrder !== 'desc') {
      queryParams.set('sortOrder', filters.sortOrder);
    }

    const queryString = queryParams.toString();
    const exportUrl = `/export-preview${queryString ? '?' + queryString : ''}`;
    
    navigate(exportUrl, {
      state: { filters: filters }
    });
  };

  // Get resource type icon and color
  const getResourceTypeInfo = function(resourceType) {
    switch (resourceType) {
      case 'ClinicalImpression':
        return { icon: <HealthIcon />, color: 'error', label: 'Health Record' };
      case 'Communication':
        return { icon: <MessageIcon />, color: 'primary', label: 'Communication' };
      case 'Media':
        return { icon: <PhotoIcon />, color: 'warning', label: 'Media' };
      case 'Person':
        return { icon: <PersonIcon />, color: 'success', label: 'Contact' };
      default:
        return { icon: <TimelineIcon />, color: 'default', label: 'Unknown' };
    }
  };

  // Render timeline item
  const renderTimelineItem = function(item, index) {
    const isExpanded = expandedItems.has(item._id);
    const resourceInfo = getResourceTypeInfo(item.resourceType);
    
    // Extract content based on resource type
    let content = '';
    let subtitle = '';
    let metadata = {};
    
    switch (item.resourceType) {
      case 'ClinicalImpression':
        content = get(item, 'description', 'Clinical impression');
        subtitle = `Health record from ${moment(item.date).format('MMM DD, YYYY')}`;
        metadata = {
          status: item.status,
          findings: get(item, 'finding', []).length
        };
        break;
      case 'Communication':
        content = get(item, 'payload.0.contentString', 'Communication');
        subtitle = `Message from ${moment(item.sent).format('MMM DD, YYYY')}`;
        metadata = {
          status: item.status,
          category: get(item, 'category.0.text', 'General')
        };
        break;
      case 'Media':
        content = get(item, 'content.title', 'Media file');
        subtitle = `${get(item, 'type.text', 'Media')} from ${moment(item.createdDateTime).format('MMM DD, YYYY')}`;
        metadata = {
          contentType: get(item, 'content.contentType', ''),
          size: get(item, 'content.size', 0)
        };
        break;
      case 'Person':
        content = get(item, 'name.0.text', 'Person');
        subtitle = `Contact added ${moment(item.createdAt).format('MMM DD, YYYY')}`;
        metadata = {
          active: item.active
        };
        break;
    }

    return (
      <Paper key={item._id} elevation={1} sx={{ mb: 2 }}>
        <ListItem alignItems="flex-start" sx={{ flexDirection: 'column', alignItems: 'stretch' }}>
          {/* Header */}
          <Box display="flex" alignItems="center" width="100%" sx={{ mb: 1 }}>
            <ListItemAvatar>
              <Avatar sx={{ bgcolor: `${resourceInfo.color}.main` }}>
                {resourceInfo.icon}
              </Avatar>
            </ListItemAvatar>
            
            <ListItemText
              primary={
                <Box display="flex" alignItems="center" sx={{ mb: 0.5 }}>
                  <Typography variant="subtitle1" sx={{ mr: 1 }}>
                    {content.length > 80 && !isExpanded ? content.substring(0, 80) + '...' : content}
                  </Typography>
                  <Chip 
                    label={resourceInfo.label} 
                    size="small" 
                    color={resourceInfo.color}
                    variant="outlined"
                  />
                </Box>
              }
              secondary={subtitle}
            />
            
            <ListItemSecondaryAction>
              {content.length > 80 && (
                <IconButton 
                  edge="end" 
                  onClick={function() { toggleExpanded(item._id); }}
                >
                  {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
              )}
            </ListItemSecondaryAction>
          </Box>

          {/* Expanded Content */}
          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
            <Box sx={{ pl: 7, pr: 2, pb: 1 }}>
              <Typography variant="body2" paragraph>
                {content}
              </Typography>
              
              {/* Metadata */}
              <Box display="flex" flexWrap="wrap" gap={1}>
                {Object.entries(metadata).map(function([key, value]) {
                  if (value === null || value === undefined || value === '') return null;
                  
                  return (
                    <Chip
                      key={key}
                      label={`${key}: ${value}`}
                      size="small"
                      variant="outlined"
                    />
                  );
                })}
                
                <Chip
                  label={`ID: ${item._id}`}
                  size="small"
                  variant="outlined"
                  color="default"
                />
              </Box>
            </Box>
          </Collapse>
        </ListItem>
      </Paper>
    );
  };

  if (!Meteor.userId()) {
    return (
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        <Alert severity="warning">
          Please log in to view your timeline.
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      {/* Header */}
      <Box mb={4}>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography variant="h3" component="h1" gutterBottom>
              Health Timeline
            </Typography>
            <Typography variant="subtitle1" color="text.secondary">
              Your chronological health journey from social media data mapped to FHIR resources.
            </Typography>
          </Box>
          
          <Box display="flex" gap={1}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={function() { loadTimelineData(page); }}
              disabled={loading}
            >
              Refresh
            </Button>
            
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={handleExportPreview}
              disabled={loading || timelineData.length === 0}
            >
              Export
            </Button>
          </Box>
        </Box>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} action={
          <Button color="inherit" size="small" onClick={function() { loadTimelineData(page); }}>
            Retry
          </Button>
        }>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Filters Sidebar */}
        <Grid item xs={12} md={3}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">
                  Filters
                </Typography>
                <Button size="small" onClick={clearFilters}>
                  Clear
                </Button>
              </Box>

              {/* Search */}
              <TextField
                fullWidth
                label="Search content"
                value={filters.searchQuery}
                onChange={function(e) { handleFilterChange('searchQuery', e.target.value); }}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
                }}
                sx={{ mb: 2 }}
              />

              {/* Resource Type Filter */}
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Resource Type</InputLabel>
                <Select
                  value={filters.resourceType}
                  label="Resource Type"
                  onChange={function(e) { handleFilterChange('resourceType', e.target.value); }}
                >
                  <MenuItem value="all">All Types</MenuItem>
                  <MenuItem value="clinical">Health Records</MenuItem>
                  <MenuItem value="communication">Communications</MenuItem>
                  <MenuItem value="media">Media Files</MenuItem>
                  <MenuItem value="person">Contacts</MenuItem>
                </Select>
              </FormControl>

              {/* Date Range - FIXED DatePicker implementation */}
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Date Range
              </Typography>
              
              <DatePicker
                label="Start Date"
                value={filters.dateRange.start}
                onChange={function(date) { handleNestedFilterChange('dateRange', 'start', date); }}
                slots={{
                  textField: TextField
                }}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    size: 'small',
                    sx: { mb: 1 }
                  }
                }}
              />
              
              <DatePicker
                label="End Date"
                value={filters.dateRange.end}
                onChange={function(date) { handleNestedFilterChange('dateRange', 'end', date); }}
                slots={{
                  textField: TextField
                }}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    size: 'small',
                    sx: { mb: 2 }
                  }
                }}
              />

              {/* Sort Options */}
              <FormControl fullWidth sx={{ mb: 1 }}>
                <InputLabel>Sort By</InputLabel>
                <Select
                  value={filters.sortBy}
                  label="Sort By"
                  onChange={function(e) { handleFilterChange('sortBy', e.target.value); }}
                >
                  <MenuItem value="date">Date</MenuItem>
                  <MenuItem value="type">Resource Type</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth>
                <InputLabel>Sort Order</InputLabel>
                <Select
                  value={filters.sortOrder}
                  label="Sort Order"
                  onChange={function(e) { handleFilterChange('sortOrder', e.target.value); }}
                >
                  <MenuItem value="desc">Newest First</MenuItem>
                  <MenuItem value="asc">Oldest First</MenuItem>
                </Select>
              </FormControl>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          {!statsLoading && stats && (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Data Overview
                </Typography>
                <Box>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    <strong>Health Records:</strong> {stats.clinicalImpressions}
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    <strong>Communications:</strong> {stats.communications}
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    <strong>Media Files:</strong> {stats.media}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Contacts:</strong> {stats.persons}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          )}
        </Grid>

        {/* Timeline Content */}
        <Grid item xs={12} md={9}>
          {loading ? (
            <Box>
              {[1, 2, 3, 4, 5].map(function(item) {
                return (
                  <Paper key={item} elevation={1} sx={{ mb: 2, p: 2 }}>
                    <Box display="flex" alignItems="center">
                      <Skeleton variant="circular" width={40} height={40} sx={{ mr: 2 }} />
                      <Box sx={{ flex: 1 }}>
                        <Skeleton variant="text" width="80%" />
                        <Skeleton variant="text" width="40%" />
                      </Box>
                    </Box>
                  </Paper>
                );
              })}
            </Box>
          ) : timelineData.length === 0 ? (
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 6 }}>
                <TimelineIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                <Typography variant="h5" gutterBottom>
                  No Timeline Data
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  {filters.searchQuery || filters.resourceType !== 'all' ? 
                    'No items match your current filters. Try adjusting your search criteria.' :
                    'Import your Facebook data to see your health timeline here.'
                  }
                </Typography>
              </CardContent>
            </Card>
          ) : (
            <Box>
              {/* Results Header */}
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">
                  Timeline Results ({timelineData.length} items)
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Page {page} of {totalPages}
                </Typography>
              </Box>

              {/* Timeline Items */}
              <List sx={{ width: '100%' }}>
                {timelineData.map(renderTimelineItem)}
              </List>

              {/* Pagination */}
              {totalPages > 1 && (
                <Box display="flex" justifyContent="center" mt={3}>
                  <Pagination
                    count={totalPages}
                    page={page}
                    onChange={handlePageChange}
                    color="primary"
                    size="large"
                    showFirstButton
                    showLastButton
                  />
                </Box>
              )}
            </Box>
          )}
        </Grid>
      </Grid>
    </Container>
  );
}