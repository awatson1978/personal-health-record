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
  ListItemSecondaryAction,
  FormControlLabel,
  Switch,
  Snackbar,
  CircularProgress
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
  Refresh as RefreshIcon,
  Clear as ClearIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';

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
  const [totalCount, setTotalCount] = useState(0);
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [expandByDefault, setExpandByDefault] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  
  // FIXED: Track individual item deletion states to prevent flicker
  const [deletingItems, setDeletingItems] = useState(new Set());
  
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

  // Load timeline data from server
  const loadTimelineData = async function(pageNumber = 1) {
    setLoading(true);
    setError(null);
    
    try {
      console.log('📊 Loading timeline data for page:', pageNumber);
      console.log('📊 Filters:', filters);
      console.log('📊 Items per page:', itemsPerPage);
      
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
      setTotalCount(result.totalCount || 0);
      setTotalPages(Math.ceil((result.totalCount || 0) / itemsPerPage));
      
      // Handle expand by default setting
      if (expandByDefault && result.items) {
        setExpandedItems(new Set(result.items.map(function(item) { return item._id; })));
      } else if (!expandByDefault) {
        setExpandedItems(new Set());
      }
      
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
  }, [filters.resourceType, filters.sortBy, filters.sortOrder, itemsPerPage]);

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

  // Handle date range changes with debounce
  useEffect(function() {
    const timeoutId = setTimeout(function() {
      if (Meteor.userId() && (filters.dateRange.start || filters.dateRange.end)) {
        loadTimelineData(1);
        setPage(1);
      }
    }, 1000); // Longer debounce for date changes

    return function() { clearTimeout(timeoutId); };
  }, [filters.dateRange.start, filters.dateRange.end]);

  // Handle expand by default change
  useEffect(function() {
    if (expandByDefault && timelineData.length > 0) {
      setExpandedItems(new Set(timelineData.map(function(item) { return item._id; })));
    } else if (!expandByDefault) {
      setExpandedItems(new Set());
    }
  }, [expandByDefault, timelineData]);

  // Handle pagination
  const handlePageChange = function(event, newPage) {
    setPage(newPage);
    loadTimelineData(newPage);
    // Scroll to top of timeline
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handle items per page change
  const handleItemsPerPageChange = function(event) {
    const newItemsPerPage = event.target.value;
    setItemsPerPage(newItemsPerPage);
    setPage(1); // Reset to first page
    console.log('📊 Items per page changed to:', newItemsPerPage);
  };

  // Handle filter changes
  const handleFilterChange = function(filterKey, value) {
    console.log('📊 Filter change:', filterKey, value);
    setFilters(function(prev) {
      return {
        ...prev,
        [filterKey]: value
      };
    });
  };

  // Handle nested filter changes (like dateRange)
  const handleNestedFilterChange = function(parentKey, childKey, value) {
    console.log('📊 Nested filter change:', parentKey, childKey, value);
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

  // Handle date input changes
  const handleDateChange = function(field, event) {
    const dateValue = event.target.value;
    const parsedDate = dateValue ? moment(dateValue).toDate() : null;
    
    console.log('📅 Date change:', field, dateValue, parsedDate);
    handleNestedFilterChange('dateRange', field, parsedDate);
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
    console.log('🧹 Clearing all filters');
    setFilters({
      dateRange: { start: null, end: null },
      resourceType: 'all',
      searchQuery: '',
      sortBy: 'date',
      sortOrder: 'desc'
    });
    setItemsPerPage(25);
    setPage(1);
    setExpandByDefault(false);
  };

  // Clear date range only
  const clearDateRange = function() {
    console.log('🧹 Clearing date range');
    handleNestedFilterChange('dateRange', 'start', null);
    handleNestedFilterChange('dateRange', 'end', null);
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
    if (itemsPerPage !== 25) {
      queryParams.set('limit', itemsPerPage);
    }

    const queryString = queryParams.toString();
    const exportUrl = `/export-preview${queryString ? '?' + queryString : ''}`;
    
    navigate(exportUrl, {
      state: { filters: filters, itemsPerPage: itemsPerPage }
    });
  };

  // FIXED: Handle delete item with proper loading state
  const handleDeleteItem = async function(item) {
    const itemId = item._id;
    
    // Add to deleting set to show loading state
    setDeletingItems(function(prev) {
      const newSet = new Set(prev);
      newSet.add(itemId);
      return newSet;
    });

    try {
      let methodName = '';
      
      switch (item.resourceType) {
        case 'ClinicalImpression':
          methodName = 'fhir.deleteClinicalImpression';
          break;
        case 'Communication':
          methodName = 'fhir.deleteCommunication';
          break;
        case 'Media':
          methodName = 'fhir.deleteMedia';
          break;
        case 'Person':
          methodName = 'fhir.deletePerson';
          break;
        default:
          throw new Error('Unknown resource type');
      }
      
      await new Promise(function(resolve, reject) {
        Meteor.call(methodName, item._id, function(error, result) {
          if (error) reject(error);
          else resolve(result);
        });
      });
      
      setSnackbar({
        open: true,
        message: `${item.resourceType} deleted successfully`,
        severity: 'success'
      });
      
      // Remove item from current data immediately for better UX
      setTimelineData(function(prevData) {
        return prevData.filter(function(dataItem) { 
          return dataItem._id !== itemId; 
        });
      });
      
      // Update total count
      setTotalCount(function(prevCount) { return prevCount - 1; });
      
    } catch (error) {
      console.error('Delete error:', error);
      setSnackbar({
        open: true,
        message: `Error deleting item: ${error.reason || error.message}`,
        severity: 'error'
      });
    } finally {
      // Remove from deleting set
      setDeletingItems(function(prev) {
        const newSet = new Set(prev);
        newSet.delete(itemId);
        return newSet;
      });
    }
  };

  // Close snackbar
  const closeSnackbar = function() {
    setSnackbar({ ...snackbar, open: false });
  };

  // FIXED: Get resource type icon and color with proper labels
  const getResourceTypeInfo = function(resourceType) {
    switch (resourceType) {
      case 'ClinicalImpression':
        return { icon: <HealthIcon />, color: 'error', label: 'Clinical Impression' };
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

  // Format date for input field
  const formatDateForInput = function(date) {
    if (!date) return '';
    return moment(date).format('YYYY-MM-DD');
  };

  // Render timeline item
  const renderTimelineItem = function(item, index) {
    const isExpanded = expandedItems.has(item._id);
    const isDeleting = deletingItems.has(item._id);
    const resourceInfo = getResourceTypeInfo(item.resourceType);
    
    // Extract content based on resource type
    let content = '';
    let primaryText = '';
    let metadata = {};
    
    switch (item.resourceType) {
      case 'ClinicalImpression':
        content = get(item, 'description', 'Clinical impression');
        primaryText = `Clinical impression from ${moment(item.date).format('MMM DD, YYYY')}`;
        metadata = {
          status: item.status,
          findings: get(item, 'finding', []).length
        };
        break;
      case 'Communication':
        content = get(item, 'payload.0.contentString', 'Communication');
        primaryText = `Message from ${moment(item.sent).format('MMM DD, YYYY')}`;
        metadata = {
          status: item.status,
          category: get(item, 'category.0.text', 'General')
        };
        break;
      case 'Media':
        content = get(item, 'content.title', 'Media file');
        primaryText = `${get(item, 'type.text', 'Media')} from ${moment(item.createdDateTime).format('MMM DD, YYYY')}`;
        metadata = {
          contentType: get(item, 'content.contentType', ''),
          size: get(item, 'content.size', 0)
        };
        break;
      case 'Person':
        content = get(item, 'name.0.text', 'Person');
        primaryText = `Contact added ${moment(item.createdAt).format('MMM DD, YYYY')}`;
        metadata = {
          active: item.active
        };
        break;
    }

    const needsExpansion = content.length > 80;
    const displayContent = needsExpansion && !isExpanded ? content.substring(0, 80) + '...' : content;

    return (
      <Paper 
        key={item._id} 
        elevation={1} 
        sx={{ 
          mb: 2,
          opacity: isDeleting ? 0.5 : 1,
          transition: 'opacity 0.3s ease'
        }}
      >
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
                <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
                  {primaryText}
                </Typography>
              }
              secondary={
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {displayContent}
                </Typography>
              }
            />
            
            <ListItemSecondaryAction>
              {needsExpansion && (
                <IconButton 
                  edge="end" 
                  onClick={function() { toggleExpanded(item._id); }}
                  disabled={isDeleting}
                >
                  {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
              )}
            </ListItemSecondaryAction>
          </Box>

          {/* Expanded Content */}
          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
            <Box sx={{ pl: 7, pr: 2, pb: 1 }}>
              {/* Metadata */}
              <Box display="flex" flexWrap="wrap" gap={1} alignItems="center" justifyContent="space-between">
                <Box display="flex" flexWrap="wrap" gap={1}>
                  {/* FIXED: ResourceType chip without "FHIR:" prefix */}
                  <Chip
                    label={item.resourceType}
                    size="small"
                    color="primary"
                    variant="filled"
                  />
                  
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
                
                {/* FIXED: Delete button with proper loading state */}
                <IconButton
                  size="small"
                  onClick={function() { handleDeleteItem(item); }}
                  color="error"
                  aria-label="delete item"
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <CircularProgress size={20} color="error" />
                  ) : (
                    <DeleteIcon />
                  )}
                </IconButton>
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
                <Button size="small" onClick={clearFilters} startIcon={<ClearIcon />}>
                  Clear All
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

              {/* FIXED: Resource Type Filter with proper labels */}
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Resource Type</InputLabel>
                <Select
                  value={filters.resourceType}
                  label="Resource Type"
                  onChange={function(e) { handleFilterChange('resourceType', e.target.value); }}
                >
                  <MenuItem value="all">All Types</MenuItem>
                  <MenuItem value="clinical">Clinical Impressions</MenuItem>
                  <MenuItem value="communication">Communications</MenuItem>
                  <MenuItem value="media">Media Files</MenuItem>
                  <MenuItem value="person">Contacts</MenuItem>
                </Select>
              </FormControl>

              {/* Date Range Controls */}
              <Box sx={{ mb: 2 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                  <Typography variant="subtitle2">
                    Date Range
                  </Typography>
                  {(filters.dateRange.start || filters.dateRange.end) && (
                    <Button 
                      size="small" 
                      onClick={clearDateRange}
                      startIcon={<ClearIcon />}
                      sx={{ minWidth: 'auto', p: 0.5 }}
                    >
                      Clear
                    </Button>
                  )}
                </Box>
                
                <TextField
                  fullWidth
                  type="date"
                  label="Start Date"
                  value={formatDateForInput(filters.dateRange.start)}
                  onChange={function(e) { handleDateChange('start', e); }}
                  InputLabelProps={{
                    shrink: true,
                  }}
                  sx={{ mb: 1 }}
                />
                
                <TextField
                  fullWidth
                  type="date"
                  label="End Date"
                  value={formatDateForInput(filters.dateRange.end)}
                  onChange={function(e) { handleDateChange('end', e); }}
                  InputLabelProps={{
                    shrink: true,
                  }}
                  sx={{ mb: 2 }}
                />
              </Box>

              {/* Items Per Page */}
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Items Per Page</InputLabel>
                <Select
                  value={itemsPerPage}
                  label="Items Per Page"
                  onChange={handleItemsPerPageChange}
                >
                  <MenuItem value={10}>10 items</MenuItem>
                  <MenuItem value={25}>25 items</MenuItem>
                  <MenuItem value={50}>50 items</MenuItem>
                  <MenuItem value={100}>100 items</MenuItem>
                  <MenuItem value={500}>500 items</MenuItem>
                  <MenuItem value={1000}>1000 items</MenuItem>
                </Select>
              </FormControl>

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

              <FormControlLabel
                control={
                  <Switch
                    checked={expandByDefault}
                    onChange={function(e) { setExpandByDefault(e.target.checked); }}
                  />
                }
                label="Expand cards by default"
                sx={{ mb: 2, display: 'block' }}
              />
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
                    <strong>Timeline Results:</strong> {timelineData.length} of {totalCount}
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    <strong>Current Page:</strong> {page} of {totalPages}
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    <strong>Clinical Impressions:</strong> {stats.clinicalImpressions}
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
          {/* Results Summary */}
          {!loading && timelineData.length > 0 && (
            <Box sx={{ mb: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1, border: 1, borderColor: 'divider' }}>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Typography variant="body2" color="text.secondary">
                  Showing {((page - 1) * itemsPerPage) + 1}-{Math.min(page * itemsPerPage, totalCount)} of {totalCount} results
                  {(filters.dateRange.start || filters.dateRange.end) && (
                    <span>
                      {' '}• Date range: {filters.dateRange.start ? moment(filters.dateRange.start).format('MMM DD, YYYY') : 'All'} 
                      {' - '} 
                      {filters.dateRange.end ? moment(filters.dateRange.end).format('MMM DD, YYYY') : 'All'}
                    </span>
                  )}
                </Typography>
                
                {totalPages > 1 && (
                  <Typography variant="body2" color="text.secondary">
                    Page {page} of {totalPages}
                  </Typography>
                )}
              </Box>
            </Box>
          )}

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
                  {filters.searchQuery || filters.resourceType !== 'all' || filters.dateRange.start || filters.dateRange.end ? 
                    'No items match your current filters. Try adjusting your search criteria.' :
                    'Import your Facebook data to see your health timeline here.'
                  }
                </Typography>
              </CardContent>
            </Card>
          ) : (
            <Box>
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
                    sx={{ mb: 2 }}
                  />
                </Box>
              )}

              {/* Bottom Results Summary */}
              {timelineData.length > 0 && (
                <Box sx={{ mt: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1, border: 1, borderColor: 'divider' }}>
                  <Typography variant="body2" color="text.secondary" align="center">
                    Showing {((page - 1) * itemsPerPage) + 1}-{Math.min(page * itemsPerPage, totalCount)} of {totalCount} total results
                  </Typography>
                </Box>
              )}
            </Box>
          )}
        </Grid>
      </Grid>

      {/* Success/Error Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={closeSnackbar}
      >
        <Alert 
          onClose={closeSnackbar} 
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
}