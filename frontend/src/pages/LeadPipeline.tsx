import { useState, useEffect, useCallback } from "react";
import {
  Box, Card, CardContent, Typography, Grid, Chip, CircularProgress,
  Alert, TextField, MenuItem, Select, FormControl, InputLabel,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, Drawer, Divider, Button, Avatar, Tooltip, Dialog,
  DialogTitle, DialogContent, DialogActions, InputAdornment,
} from "@mui/material";
import {
  Refresh as RefreshIcon, Search as SearchIcon, Close as CloseIcon,
  Phone as PhoneIcon, Email as EmailIcon, Business as BusinessIcon,
  Person as PersonIcon, Language as LanguageIcon, Message as MessageIcon,
  Edit as EditIcon, Schedule as ScheduleIcon, CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon, Assignment as AssignmentIcon,
  Comment as CommentIcon, History as HistoryIcon, Warning as WarningIcon,
  AutoAwesome as AutoIcon, Delete as DeleteIcon,
} from "@mui/icons-material";
import { useAuth } from "../contexts/AuthContext";
import { PERMISSIONS } from "../config/permissions";
import { leadsService, Lead, LeadActivity } from "../services/leadsService";

const STATUS_COLOR: Record<string, string> = {
  Unassigned: "#9e9e9e", Assigned: "#2196f3",
  "In Progress": "#ff9800", "Follow-up": "#ff5722",
  Converted: "#4caf50", Rejected: "#f44336",
};

const ACTIVITY_ICON: Record<string, React.ReactNode> = {
  Call: <PhoneIcon sx={{ fontSize: 16 }} />,
  Email: <EmailIcon sx={{ fontSize: 16 }} />,
  Meeting: <PersonIcon sx={{ fontSize: 16 }} />,
  Note: <MessageIcon sx={{ fontSize: 16 }} />,
  "Manager Note": <CommentIcon sx={{ fontSize: 16 }} />,
  Assignment: <AssignmentIcon sx={{ fontSize: 16 }} />,
  "Status Change": <HistoryIcon sx={{ fontSize: 16 }} />,
};

function TimelineEntry({ act }: { act: LeadActivity }) {
  const isManagerNote = act.activity_type === "Manager Note";
  const isAuto = act.is_auto;
  return (
    <Box
      sx={{
        py: 1.5, px: 2,
        borderLeft: isManagerNote ? "3px solid #9c27b0" : isAuto ? "3px solid #e0e0e0" : "3px solid #2196f3",
        bgcolor: isManagerNote ? "#9c27b020" : isAuto ? "transparent" : "action.hover",
        borderRadius: 1, mb: 1.5,
        opacity: isAuto ? 0.7 : 1,
      }}
    >
      <Box display="flex" alignItems="center" gap={1} mb={0.5}>
        <Box sx={{ color: isManagerNote ? "#9c27b0" : isAuto ? "text.secondary" : "primary.main" }}>
          {ACTIVITY_ICON[act.activity_type] || <HistoryIcon sx={{ fontSize: 16 }} />}
        </Box>
        <Chip label={act.activity_type} size="small"
          sx={{ height: 20, fontSize: "0.68rem", bgcolor: isManagerNote ? "#9c27b020" : undefined }} />
        {isAuto && <Chip label="System" size="small" sx={{ height: 18, fontSize: "0.65rem" }} variant="outlined" />}
        <Typography variant="caption" color="text.secondary" ml="auto">
          {new Date(act.logged_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
        </Typography>
      </Box>
      {act.summary && <Typography variant="body2" fontWeight={500}>{act.summary}</Typography>}
      {act.outcome && <Typography variant="caption" color="text.secondary">Outcome: {act.outcome}</Typography>}
      {act.next_action && <Typography variant="caption" color="text.secondary" display="block">Next: {act.next_action}</Typography>}
      {act.follow_up_date && <Typography variant="caption" color="text.secondary" display="block">Follow-up: {act.follow_up_date}</Typography>}
      <Typography variant="caption" color="text.secondary" display="block">— {act.logged_by}</Typography>
    </Box>
  );
}

export default function LeadPipeline() {
  const { user, hasPermission } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Filters
  const [filterStatus, setFilterStatus] = useState("");
  const [filterOwner, setFilterOwner] = useState("");
  const [filterSource, setFilterSource] = useState("");

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);

  // Owners for assign dropdown
  const [owners, setOwners] = useState<{ email: string; name: string }[]>([]);

  // Assign modal
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTo, setAssignTo] = useState("");
  const [assignNote, setAssignNote] = useState("");
  const [assignLoading, setAssignLoading] = useState(false);

  // Manager comment modal
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);

  // Delete confirm dialog state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleDeleteLead = async () => {
    if (!selectedLead) return;
    setDeleteLoading(true);
    try {
      await leadsService.deleteLead(selectedLead.lead_id);
      setDeleteConfirmOpen(false);
      setDrawerOpen(false);
      setSelectedLead(null);
      await loadLeads();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to delete lead");
    } finally {
      setDeleteLoading(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  const loadLeads = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      const res = await leadsService.getAll({
        status: filterStatus || undefined,
        assigned_to: filterOwner || undefined,
        source: filterSource || undefined,
        limit: 200,
      });
      setLeads(res.data.leads || []);
      setTotal(res.data.total || 0);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, [user, filterStatus, filterOwner, filterSource]);

  const loadOwners = useCallback(async () => {
    try {
      const res = await leadsService.getOwners();
      setOwners(res.data.owners || []);
    } catch { }
  }, []);

  useEffect(() => { loadLeads(); }, [loadLeads]);
  useEffect(() => { loadOwners(); }, [loadOwners]);

  const openDrawer = async (lead: Lead) => {
    setSelectedLead(lead);
    setDrawerOpen(true);
    setActivitiesLoading(true);
    try {
      const res = await leadsService.getActivities(lead.lead_id);
      setActivities(res.data.activities || []);
    } catch { setActivities([]); }
    finally { setActivitiesLoading(false); }
  };

  const handleAssign = async () => {
    if (!selectedLead || !assignTo) return;
    setAssignLoading(true);
    try {
      await leadsService.assign(selectedLead.lead_id, assignTo, assignNote || undefined);
      setAssignOpen(false);
      setAssignTo(""); setAssignNote("");
      await loadLeads();
      const res = await leadsService.getOne(selectedLead.lead_id);
      setSelectedLead(res.data);
      const aRes = await leadsService.getActivities(selectedLead.lead_id);
      setActivities(aRes.data.activities || []);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to assign lead");
    } finally { setAssignLoading(false); }
  };

  const handleComment = async () => {
    if (!selectedLead || !commentText.trim()) return;
    setCommentLoading(true);
    try {
      await leadsService.comment(selectedLead.lead_id, commentText.trim());
      setCommentOpen(false); setCommentText("");
      const aRes = await leadsService.getActivities(selectedLead.lead_id);
      setActivities(aRes.data.activities || []);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to add comment");
    } finally { setCommentLoading(false); }
  };

  const filteredLeads = leads.filter((l) =>
    !search ||
    l.full_name.toLowerCase().includes(search.toLowerCase()) ||
    l.lead_id.toLowerCase().includes(search.toLowerCase()) ||
    (l.company_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const sources = [...new Set(leads.map((l) => l.source_website))];

  return (
    <Box>
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Lead Pipeline</Typography>
          <Typography variant="body2" color="text.secondary">{total} total leads</Typography>
        </Box>
        <IconButton onClick={loadLeads} color="primary"><RefreshIcon /></IconButton>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={4}>
              <TextField fullWidth size="small" placeholder="Search by name, ID, company…"
                value={search} onChange={(e) => setSearch(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }} />
            </Grid>
            <Grid item xs={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Status</InputLabel>
                <Select value={filterStatus} label="Status" onChange={(e) => setFilterStatus(e.target.value)}>
                  <MenuItem value="">All</MenuItem>
                  {["Unassigned", "Assigned", "In Progress", "Follow-up", "Converted", "Rejected"].map((s) => (
                    <MenuItem key={s} value={s}>{s}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Owner</InputLabel>
                <Select value={filterOwner} label="Owner" onChange={(e) => setFilterOwner(e.target.value)}>
                  <MenuItem value="">All</MenuItem>
                  {owners.map((o) => <MenuItem key={o.email} value={o.email}>{o.name || o.email}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Source</InputLabel>
                <Select value={filterSource} label="Source" onChange={(e) => setFilterSource(e.target.value)}>
                  <MenuItem value="">All</MenuItem>
                  {sources.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} md={2}>
              <Button fullWidth variant="outlined" onClick={() => { setFilterStatus(""); setFilterOwner(""); setFilterSource(""); setSearch(""); }}>
                Clear Filters
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Lead ID</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Company</TableCell>
                <TableCell>Product</TableCell>
                <TableCell>Source</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Assigned To</TableCell>
                <TableCell>Follow-up</TableCell>
                <TableCell>Received</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} align="center" sx={{ py: 6 }}><CircularProgress /></TableCell></TableRow>
              ) : filteredLeads.length === 0 ? (
                <TableRow><TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                  <Typography color="text.secondary">No leads found</Typography>
                </TableCell></TableRow>
              ) : filteredLeads.map((lead) => {
                const isOverdue = lead.follow_up_date && lead.follow_up_date < today && !["Converted", "Rejected"].includes(lead.status);
                return (
                  <TableRow key={lead.lead_id} hover sx={{ cursor: "pointer" }} onClick={() => openDrawer(lead)}>
                    <TableCell><Typography variant="body2" fontFamily="monospace" fontWeight={600}>{lead.lead_id}</Typography></TableCell>
                    <TableCell>{lead.full_name}</TableCell>
                    <TableCell>{lead.company_name || "—"}</TableCell>
                    <TableCell>{lead.product_interest || "—"}</TableCell>
                    <TableCell>
                      <Chip label={lead.source_website} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Chip label={lead.status} size="small"
                        sx={{ bgcolor: STATUS_COLOR[lead.status] + "22", color: STATUS_COLOR[lead.status], fontWeight: 600, border: "none" }} />
                    </TableCell>
                    <TableCell>{lead.assigned_to || <Typography variant="caption" color="text.secondary">Unassigned</Typography>}</TableCell>
                    <TableCell>
                      <Tooltip title={isOverdue ? "OVERDUE" : ""}>
                        <Typography variant="body2" color={isOverdue ? "error" : "inherit"} display="flex" alignItems="center" gap={0.5}>
                          {isOverdue && <WarningIcon sx={{ fontSize: 14 }} />}
                          {lead.follow_up_date || "—"}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(lead.created_at).toLocaleDateString("en-IN")}
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* Lead Detail Drawer */}
      <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)}
        PaperProps={{ sx: { width: { xs: "100%", sm: 540 }, p: 3 } }}>
        {selectedLead && (
          <Box>
            {/* Drawer header */}
            <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
              <Box>
                <Box display="flex" alignItems="center" gap={1}>
                  <Typography variant="caption" fontFamily="monospace" color="text.secondary">{selectedLead.lead_id}</Typography>
                  <Chip label={selectedLead.status} size="small"
                    sx={{ bgcolor: STATUS_COLOR[selectedLead.status] + "22", color: STATUS_COLOR[selectedLead.status], fontWeight: 700 }} />
                </Box>
                <Typography variant="h6" fontWeight={700}>{selectedLead.full_name}</Typography>
                {selectedLead.company_name && <Typography variant="body2" color="text.secondary">{selectedLead.company_name}</Typography>}
              </Box>
              <IconButton onClick={() => setDrawerOpen(false)}><CloseIcon /></IconButton>
            </Box>

            {/* Closure banner */}
            {selectedLead.closure_type === "Converted" && (
              <Alert severity="success" icon={<CheckCircleIcon />} sx={{ mb: 2 }}>
                <Typography fontWeight={600}>Converted</Typography>
                {selectedLead.conversion_notes && <Typography variant="body2">{selectedLead.conversion_notes}</Typography>}
              </Alert>
            )}
            {selectedLead.closure_type === "Rejected" && (
              <Alert severity="error" icon={<CancelIcon />} sx={{ mb: 2 }}>
                <Typography fontWeight={600}>Rejected</Typography>
                {selectedLead.rejection_reason && <Typography variant="body2">Reason: {selectedLead.rejection_reason}</Typography>}
              </Alert>
            )}

            {/* Customer Info */}
            <Card variant="outlined" sx={{ mb: 2 }}>
              <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                <Typography variant="caption" fontWeight={700} textTransform="uppercase" color="text.secondary">Customer Info</Typography>
                <Grid container spacing={1} mt={0.5}>
                  {[
                    { icon: <EmailIcon sx={{ fontSize: 14 }} />, label: selectedLead.email },
                    { icon: <PhoneIcon sx={{ fontSize: 14 }} />, label: selectedLead.phone },
                    { icon: <LanguageIcon sx={{ fontSize: 14 }} />, label: selectedLead.country },
                    { icon: <BusinessIcon sx={{ fontSize: 14 }} />, label: selectedLead.product_interest },
                  ].filter((i) => i.label).map((item, idx) => (
                    <Grid item xs={6} key={idx}>
                      <Box display="flex" alignItems="center" gap={0.5}>
                        <Box color="text.secondary">{item.icon}</Box>
                        <Typography variant="body2">{item.label}</Typography>
                      </Box>
                    </Grid>
                  ))}
                  {selectedLead.message && (
                    <Grid item xs={12}>
                      <Typography variant="caption" color="text.secondary">Message</Typography>
                      <Typography variant="body2" sx={{ fontStyle: "italic" }}>"{selectedLead.message}"</Typography>
                    </Grid>
                  )}
                </Grid>
              </CardContent>
            </Card>

            {/* Internal Info */}
            <Box display="flex" gap={1} mb={2} flexWrap="wrap">
              <Chip icon={<LanguageIcon />} label={selectedLead.source_website} size="small" variant="outlined" />
              {selectedLead.assigned_to && <Chip icon={<PersonIcon />} label={selectedLead.assigned_to} size="small" variant="outlined" />}
              {selectedLead.follow_up_date && <Chip icon={<ScheduleIcon />} label={`Follow-up: ${selectedLead.follow_up_date}`} size="small" variant="outlined" />}
            </Box>

            {/* Actions */}
            {hasPermission(PERMISSIONS.MANAGE_LEADS) && (
              <Box display="flex" gap={1} mb={2} flexWrap="wrap">
                {!selectedLead.closure_type && (
                  <>
                    <Button variant="contained" size="small" startIcon={<AssignmentIcon />}
                      onClick={() => { setAssignTo(selectedLead.assigned_to || ""); setAssignOpen(true); }}>
                      {selectedLead.assigned_to ? "Reassign" : "Assign"}
                    </Button>
                    <Button variant="outlined" size="small" startIcon={<CommentIcon />}
                      onClick={() => setCommentOpen(true)} disabled={!selectedLead.assigned_to}>
                      Leave Note
                    </Button>
                  </>
                )}
                <Button variant="outlined" color="error" size="small" startIcon={<DeleteIcon />}
                  onClick={() => setDeleteConfirmOpen(true)}>
                  Delete Lead
                </Button>
              </Box>
            )}

            <Divider sx={{ mb: 2 }} />

            {/* Timeline */}
            <Typography variant="subtitle2" fontWeight={700} mb={1.5}>Activity Timeline</Typography>
            {activitiesLoading ? <CircularProgress size={20} /> :
              activities.length === 0 ? <Typography variant="body2" color="text.secondary">No activities yet</Typography> :
                activities.map((a) => <TimelineEntry key={a.activity_id} act={a} />)
            }
          </Box>
        )}
      </Drawer>

      {/* Assign Modal */}
      <Dialog open={assignOpen} onClose={() => setAssignOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{selectedLead?.assigned_to ? "Reassign Lead" : "Assign Lead"}</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2, mb: 2 }}>
            <InputLabel>Lead Owner</InputLabel>
            <Select value={assignTo} label="Lead Owner" onChange={(e) => setAssignTo(e.target.value)}>
              {owners.map((o) => <MenuItem key={o.email} value={o.email}>{o.name || o.email}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField fullWidth multiline rows={2} label="Optional note for the owner" value={assignNote}
            onChange={(e) => setAssignNote(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAssign} disabled={!assignTo || assignLoading}>
            {assignLoading ? "Assigning…" : "Assign"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Comment Modal */}
      <Dialog open={commentOpen} onClose={() => setCommentOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Leave Manager Note</DialogTitle>
        <DialogContent>
          <TextField fullWidth multiline rows={3} label="Note" sx={{ mt: 2 }} value={commentText}
            onChange={(e) => setCommentText(e.target.value)} placeholder="This note will be visible to the lead owner…" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCommentOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleComment} disabled={!commentText.trim() || commentLoading}>
            {commentLoading ? "Sending…" : "Send Note"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, color: "error.main" }}>
          <WarningIcon /> Delete Lead
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Are you sure you want to delete lead <strong>{selectedLead?.lead_id}</strong> (Name: {selectedLead?.full_name})?
          </Typography>
          <Typography variant="body2" color="error.main" sx={{ mt: 1, fontWeight: 500 }}>
            This action cannot be undone and will delete all associated activities and quotations.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDeleteLead} disabled={deleteLoading}>
            {deleteLoading ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
