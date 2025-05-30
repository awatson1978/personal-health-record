// meteor-v3/imports/ui/pages/Persons.jsx
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
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  TextField,
  InputAdornment,
  Pagination,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  Divider
} from '@mui/material';

import {
  Person as PersonIcon,
  Group as GroupIcon,
  Search as SearchIcon,
  Delete as DeleteIcon,
  Info as InfoIcon,
  Refresh as RefreshIcon,
  FilterList as FilterIcon,
  Clear as ClearIcon,
  People as PeopleIcon,
  PersonAdd as PersonAddIcon,
  Check as CheckIcon,
  Schedule as ScheduleIcon
} from '@mui/icons-material';

import { Persons, CareTeams } from '../../api/fhir/collections';

export function PersonsPage() {
  // State management
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [page, setPage] = useState(1);
  const [itemsPerPage] = useState(25);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Server-side statistics
  const [serverStats, setServerStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // Client-side reactive data
  const { persons, careTeams, isLoading } = useTracker(function() {
    const userId = Meteor.userId();
    if (!userId) return { isLoading: true };

    const personsHandle = Meteor.subscribe('user.persons');
    const careTeamsHandle = Meteor.subscribe('user.careTeams');
    
    const isLoading = !personsHandle.ready() || !careTeamsHandle.ready();

    if (isLoading) return { isLoading: true };

    // Get all persons for this user
    const persons = Persons.find(
      { userId },
      { sort: getSortOption() }
    ).fetch();

    const careTeams = CareTeams.find({ userId }).fetch();

    return {
      persons,
      careTeams,
      isLoading: false
    };
  }, [sortBy, sortOrder]);

  // Load server-side statistics
  const loadServerStats = async function() {
    setLoadingStats(true);
    
    try {
      const result = await new Promise(function(resolve, reject) {
        Meteor.call('dashboard.getStatistics', function(error, result) {
          if (error) reject(error);
          else resolve(result);
        });
      });
      
      setServerStats(result);
    } catch (error) {
      console.error('Error loading server stats:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(function() {
    if (Meteor.userId()) {
      loadServerStats();
    }
  }, [Meteor.userId()]);

  // Helper functions
  function getSortOption() {
    const sortField = sortBy === 'name' ? 'name.0.text' : 'createdAt';
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    return { [sortField]: sortDirection };
  }

  function filterPersons() {
    if (!persons) return [];
    
    let filtered = persons;
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(function(person) {
        const name = get(person, 'name.0.text', '').toLowerCase();
        return name.includes(query);
      });
    }
    
    return filtered;
  }

  function paginatePersons(filteredPersons) {
    const startIndex = (page - 1) * itemsPerPage;
    return filteredPersons.slice(startIndex, startIndex + itemsPerPage);
  }

  // Event handlers
  const handleSearch = function(event) {
    setSearchQuery(event.target.value);
    setPage(1); // Reset to first page when searching
  };

  const handleSortChange = function(field) {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const handlePageChange = function(event, newPage) {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearFilters = function() {
    setSearchQuery('');
    setSortBy('name');
    setSortOrder('asc');
    setPage(1);
  };

  const openPersonDetails = function(person) {
    setSelectedPerson(person);
    setDetailDialogOpen(true);
  };

  const openDeleteDialog = function(person) {
    setSelectedPerson(person);
    setDeleteDialogOpen(true);
  };

  const deletePerson = async function() {
    if (!selectedPerson) return;
    
    setDeleting(true);
    
    try {
      await new Promise(function(resolve, reject) {
        Meteor.call('fhir.deletePerson', selectedPerson._id, function(error, result) {
          if (error) reject(error);
          else resolve(result);
        });
      });
      
      setSnackbar({
        open: true,
        message: 'Person deleted successfully',
        severity: 'success'
      });
      
      setDeleteDialogOpen(false);
      setSelectedPerson(null);
      
    } catch (error) {
      console.error('Delete error:', error);
      setSnackbar({
        open: true,
        message: `Error deleting person: ${error.reason || error.message}`,
        severity: 'error'
      });
    } finally {
      setDeleting(false);
    }
  };

  const closeSnackbar = function() {
    setSnackbar({ ...snackbar, open: false });
  };

  // Get care team info for a person
  const getPersonCareTeamInfo = function(person) {
    if (!careTeams || !person) return null;
    
    const personRef = `Person/${person._id}`;
    
    for (const careTeam of careTeams) {
      const participant = get(careTeam, 'participant', []).find(function(p) {
        return get(p, 'member.reference') === personRef;
      });
      
      if (participant) {
        return {
          careTeam: careTeam,
          role: get(participant, 'role.0.text', 'Member'),
          since: get(participant, 'period.start')
        };
      }
    }
    
    return null;
  };

  // Get friend since date
  const getFriendSinceDate = function(person) {
    const extension = get(person, 'extension', []).find(function(ext) {
      return ext.url === 'http://facebook-fhir-timeline.com/friend-since';
    });
    
    return extension ? extension.valueDateTime : get(person, 'createdAt');
  };

  if (!Meteor.userId()) {
    return (
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        <Alert severity="warning">
          Please log in to view your persons/contacts.
        </Alert>
      </Container>
    );
  }

  const filteredPersons = filterPersons();
  const paginatedPersons = paginatePersons(filteredPersons);
  const totalPages = Math.ceil(filteredPersons.length / itemsPerPage);

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      {/* Header */}
      <Box mb={4}>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography variant="h3" component="h1" gutterBottom>
              Persons & Contacts
            </Typography>
            <Typography variant="subtitle1" color="text.secondary">
              FHIR Person resources created from your Facebook friends and contacts.
            </Typography>
          </Box>
          
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadServerStats}
            disabled={loadingStats}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {/* Statistics Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" gutterBottom variant="h6">
                    Total Persons
                  </Typography>
                  <Typography variant="h4" component="div">
                    {loadingStats ? (
                      <Skeleton width={60} />
                    ) : (
                      get(serverStats, 'totalPersons', 0)
                    )}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    From Facebook friends
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: 'success.main', width: 56, height: 56 }}>
                  <PersonIcon />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" gutterBottom variant="h6">
                    Care Teams
                  </Typography>
                  <Typography variant="h4" component="div">
                    {isLoading ? (
                      <Skeleton width={60} />
                    ) : (
                      (careTeams || []).length
                    )}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Support networks
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: 'info.main', width: 56, height: 56 }}>
                  <GroupIcon />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" gutterBottom variant="h6">
                    Currently Shown
                  </Typography>
                  <Typography variant="h4" component="div">
                    {filteredPersons.length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    After filters
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: 'secondary.main', width: 56, height: 56 }}>
                  <PeopleIcon />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" gutterBottom variant="h6">
                    Active Status
                  </Typography>
                  <Typography variant="h4" component="div">
                    {isLoading ? (
                      <Skeleton width={60} />
                    ) : (
                      (persons || []).filter(function(p) { return p.active; }).length
                    )}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Active persons
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: 'warning.main', width: 56, height: 56 }}>
                  <CheckIcon />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters and Controls */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="Search persons"
                value={searchQuery}
                onChange={handleSearch}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  )
                }}
              />
            </Grid>
            
            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>Sort By</InputLabel>
                <Select
                  value={sortBy}
                  label="Sort By"
                  onChange={function(e) { handleSortChange(e.target.value); }}
                >
                  <MenuItem value="name">Name</MenuItem>
                  <MenuItem value="createdAt">Date Added</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>Sort Order</InputLabel>
                <Select
                  value={sortOrder}
                  label="Sort Order"
                  onChange={function(e) { setSortOrder(e.target.value); }}
                >
                  <MenuItem value="asc">Ascending</MenuItem>
                  <MenuItem value="desc">Descending</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={2}>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<ClearIcon />}
                onClick={clearFilters}
              >
                Clear Filters
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Results Summary */}
      {!isLoading && (
        <Box sx={{ mb: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1, border: 1, borderColor: 'divider' }}>
          <Typography variant="body2" color="text.secondary">
            Showing {paginatedPersons.length} of {filteredPersons.length} persons
            {searchQuery && (
              <span> • Search: "{searchQuery}"</span>
            )}
            {totalPages > 1 && (
              <span> • Page {page} of {totalPages}</span>
            )}
          </Typography>
        </Box>
      )}

      {/* Persons List */}
      {isLoading ? (
        <Grid container spacing={2}>
          {[1, 2, 3, 4, 5, 6].map(function(item) {
            return (
              <Grid item xs={12} sm={6} md={4} key={item}>
                <Card>
                  <CardContent>
                    <Box display="flex" alignItems="center">
                      <Skeleton variant="circular" width={40} height={40} sx={{ mr: 2 }} />
                      <Box sx={{ flex: 1 }}>
                        <Skeleton variant="text" width="80%" />
                        <Skeleton variant="text" width="40%" />
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      ) : filteredPersons.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <PersonAddIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h5" gutterBottom>
              No Persons Found
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {searchQuery ? 
                'No persons match your search criteria. Try adjusting your search.' :
                'Import your Facebook data to see your friends and contacts here.'
              }
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {paginatedPersons.map(function(person) {
            const personName = get(person, 'name.0.text', 'Unknown Person');
            const friendSince = getFriendSinceDate(person);
            const careTeamInfo = getPersonCareTeamInfo(person);
            const initials = personName.split(' ').map(function(n) { return n[0]; }).join('').substring(0, 2).toUpperCase();
            
            return (
              <Grid item xs={12} sm={6} md={4} lg={3} key={person._id}>
                <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Box display="flex" alignItems="flex-start" justifyContent="space-between" sx={{ mb: 2 }}>
                      <Box display="flex" alignItems="center" sx={{ flex: 1 }}>
                        <Avatar sx={{ bgcolor: 'primary.main', mr: 2 }}>
                          {initials}
                        </Avatar>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="h6" noWrap>
                            {personName}
                          </Typography>
                          <Box display="flex" alignItems="center" gap={0.5} sx={{ mt: 0.5 }}>
                            <Chip
                              label={person.active ? 'Active' : 'Inactive'}
                              size="small"
                              color={person.active ? 'success' : 'default'}
                            />
                          </Box>
                        </Box>
                      </Box>
                      
                      <Box display="flex" flexDirection="column" gap={0.5}>
                        <IconButton
                          size="small"
                          onClick={function() { openPersonDetails(person); }}
                          aria-label="view details"
                        >
                          <InfoIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={function() { openDeleteDialog(person); }}
                          color="error"
                          aria-label="delete person"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Box>
                    </Box>

                    <Divider sx={{ mb: 2 }} />

                    <Box>
                      {friendSince && (
                        <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
                          <ScheduleIcon sx={{ fontSize: 16, mr: 1, color: 'text.secondary' }} />
                          <Typography variant="body2" color="text.secondary">
                            Friends since {moment(friendSince).format('MMM YYYY')}
                          </Typography>
                        </Box>
                      )}
                      
                      {careTeamInfo && (
                        <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
                          <GroupIcon sx={{ fontSize: 16, mr: 1, color: 'text.secondary' }} />
                          <Typography variant="body2" color="text.secondary">
                            {careTeamInfo.role} in {get(careTeamInfo, 'careTeam.name', 'Care Team')}
                          </Typography>
                        </Box>
                      )}

                      <Box sx={{ mt: 2 }}>
                        <Chip
                          label={`ID: ${person._id.substring(0, 8)}...`}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: '0.7rem' }}
                        />
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

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

      {/* Person Details Dialog */}
      <Dialog 
        open={detailDialogOpen} 
        onClose={function() { setDetailDialogOpen(false); }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center">
            <PersonIcon sx={{ mr: 1 }} />
            Person Details
          </Box>
        </DialogTitle>
        <DialogContent>
          {selectedPerson && (
            <Box sx={{ pt: 2 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Name
                  </Typography>
                  <Typography variant="body1" sx={{ mb: 2 }}>
                    {get(selectedPerson, 'name.0.text', 'Unknown')}
                  </Typography>
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Status
                  </Typography>
                  <Chip
                    label={selectedPerson.active ? 'Active' : 'Inactive'}
                    color={selectedPerson.active ? 'success' : 'default'}
                    size="small"
                    sx={{ mb: 2 }}
                  />
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Resource ID
                  </Typography>
                  <Typography variant="body1" sx={{ fontFamily: 'monospace', fontSize: '0.875rem', mb: 2 }}>
                    {selectedPerson._id}
                  </Typography>
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Resource Type
                  </Typography>
                  <Typography variant="body1" sx={{ mb: 2 }}>
                    {selectedPerson.resourceType}
                  </Typography>
                </Grid>

                {getFriendSinceDate(selectedPerson) && (
                  <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Friends Since
                    </Typography>
                    <Typography variant="body1" sx={{ mb: 2 }}>
                      {moment(getFriendSinceDate(selectedPerson)).format('MMMM DD, YYYY')}
                    </Typography>
                  </Grid>
                )}

                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Created
                  </Typography>
                  <Typography variant="body1" sx={{ mb: 2 }}>
                    {moment(selectedPerson.createdAt).format('MMMM DD, YYYY HH:mm')}
                  </Typography>
                </Grid>

                {getPersonCareTeamInfo(selectedPerson) && (
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                      Care Team Information
                    </Typography>
                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Typography variant="body2">
                        <strong>Role:</strong> {getPersonCareTeamInfo(selectedPerson).role}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Team:</strong> {get(getPersonCareTeamInfo(selectedPerson), 'careTeam.name', 'Unknown')}
                      </Typography>
                      {getPersonCareTeamInfo(selectedPerson).since && (
                        <Typography variant="body2">
                          <strong>Since:</strong> {moment(getPersonCareTeamInfo(selectedPerson).since).format('MMMM DD, YYYY')}
                        </Typography>
                      )}
                    </Paper>
                  </Grid>
                )}

                {selectedPerson.link && selectedPerson.link.length > 0 && (
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                      Links
                    </Typography>
                    {selectedPerson.link.map(function(link, index) {
                      return (
                        <Paper key={index} variant="outlined" sx={{ p: 2, mb: 1 }}>
                          <Typography variant="body2">
                            <strong>Target:</strong> {get(link, 'target.reference', 'Unknown')}
                          </Typography>
                          <Typography variant="body2">
                            <strong>Assurance:</strong> {link.assurance || 'Not specified'}
                          </Typography>
                        </Paper>
                      );
                    })}
                  </Grid>
                )}
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={function() { setDetailDialogOpen(false); }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={function() { 
          if (!deleting) {
            setDeleteDialogOpen(false);
            setSelectedPerson(null);
          }
        }}
      >
        <DialogTitle>Delete Person</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{get(selectedPerson, 'name.0.text', 'this person')}"?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            This will also remove them from any care teams. This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={function() { 
              setDeleteDialogOpen(false); 
              setSelectedPerson(null);
            }}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button 
            onClick={deletePerson}
            color="error"
            variant="contained"
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

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