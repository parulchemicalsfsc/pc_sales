import { useState, useEffect, useCallback } from "react";
import {
  Box, Card, CardContent, Typography, Grid, Chip, CircularProgress,
  Alert, Divider, Button, TextField, MenuItem, Select, FormControl,
  InputLabel, Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, Tooltip, RadioGroup, FormControlLabel, Radio, Paper,
} from "@mui/material";
import {
  Phone as PhoneIcon, Email as EmailIcon, Business as BusinessIcon,
  Person as PersonIcon, Language as LanguageIcon, Message as MessageIcon,
  Edit as EditIcon, CheckCircle as CheckCircleIcon, Cancel as CancelIcon,
  Assignment as AssignmentIcon, Comment as CommentIcon, History as HistoryIcon,
  Warning as WarningIcon, Save as SaveIcon, Close as CloseIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import { useAuth } from "../contexts/AuthContext";
import { leadsService, Lead, LeadActivity } from "../services/leadsService";

const STATUS_COLOR: Record<string, string> = {
  Unassigned: "#9e9e9e", Assigned: "#2196f3",
  "In Progress": "#ff9800", "Follow-up": "#ff5722",
  Converted: "#4caf50", Rejected: "#f44336",
};

const ACTIVITY_ICON: Record<string, React.ReactNode> = {
  Call: <PhoneIcon sx={{ fontSize: 15 }} />,
  Email: <EmailIcon sx={{ fontSize: 15 }} />,
  Meeting: <PersonIcon sx={{ fontSize: 15 }} />,
  Note: <MessageIcon sx={{ fontSize: 15 }} />,
  "Manager Note": <CommentIcon sx={{ fontSize: 15 }} />,
  Assignment: <AssignmentIcon sx={{ fontSize: 15 }} />,
  "Status Change": <HistoryIcon sx={{ fontSize: 15 }} />,
};

const REJECTION_REASONS = [
  "Pricing too high", "No response from customer", "Competitor selected",
  "Not interested", "Budget constraints", "Product not suitable", "Other",
];

function TimelineEntry({ act }: { act: LeadActivity }) {
  const isManagerNote = act.activity_type === "Manager Note";
  const isAuto = act.is_auto;
  return (
    <Box sx={{
      py: 1.5, px: 2, mb: 1.5, borderRadius: 1,
      borderLeft: `3px solid ${isManagerNote ? "#9c27b0" : isAuto ? "#e0e0e0" : "#2196f3"}`,
      bgcolor: isManagerNote ? "#9c27b015" : isAuto ? "transparent" : "action.hover",
      opacity: isAuto ? 0.75 : 1,
    }}>
      <Box display="flex" alignItems="center" gap={1} mb={0.5} flexWrap="wrap">
        <Box sx={{ color: isManagerNote ? "#9c27b0" : isAuto ? "text.secondary" : "primary.main" }}>
          {ACTIVITY_ICON[act.activity_type] || <HistoryIcon sx={{ fontSize: 15 }} />}
        </Box>
        <Chip label={act.activity_type} size="small" sx={{ height: 20, fontSize: "0.68rem" }} />
        {isAuto && <Chip label="System" size="small" variant="outlined" sx={{ height: 18, fontSize: "0.65rem" }} />}
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

export default function LeadWorkspace() {
  const { user } = useAuth();
  const [myLeads, setMyLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const today = new Date().toISOString().slice(0, 10);

  // Edit info
  const [editOpen, setEditOpen] = useState(false);
  const [editPhone, setEditPhone] = useState("");
  const [editCompany, setEditCompany] = useState("");
  const [editProduct, setEditProduct] = useState("");

  // Log activity modal
  const [logOpen, setLogOpen] = useState(false);
  const [logType, setLogType] = useState<"Call" | "Email" | "Meeting" | "Note">("Call");
  const [logSummary, setLogSummary] = useState("");
  const [logOutcome, setLogOutcome] = useState("");
  const [logNextAction, setLogNextAction] = useState("");
  const [logFollowUp, setLogFollowUp] = useState("");
  const [logLoading, setLogLoading] = useState(false);

  // Update status modal
  const [statusOpen, setStatusOpen] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [statusLoading, setStatusLoading] = useState(false);

  // Follow-up date
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [newFollowUp, setNewFollowUp] = useState("");
  const [followUpLoading, setFollowUpLoading] = useState(false);

  // Close lead modal
  const [closeOpen, setCloseOpen] = useState(false);
  const [closureType, setClosureType] = useState<"Converted" | "Rejected">("Converted");
  const [rejectionReason, setRejectionReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [conversionNotes, setConversionNotes] = useState("");
  const [closeLoading, setCloseLoading] = useState(false);

  const loadLeads = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const res = await leadsService.getMy();
      setMyLeads(res.data.leads || []);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to load leads");
    } finally { setLoading(false); }
  }, [user]);

  const loadActivities = useCallback(async (leadId: string) => {
    setActivitiesLoading(true);
    try {
      const res = await leadsService.getActivities(leadId);
      setActivities(res.data.activities || []);
    } catch { setActivities([]); }
    finally { setActivitiesLoading(false); }
  }, []);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  const selectLead = async (lead: Lead) => {
    setSelected(lead);
    await loadActivities(lead.lead_id);
  };

  const refreshSelected = async () => {
    if (!selected) return;
    const res = await leadsService.getMyLead(selected.lead_id);
    setSelected(res.data);
    await loadActivities(selected.lead_id);
    await loadLeads();
  };

  const handleLogActivity = async () => {
    if (!selected) return;
    setLogLoading(true);
    try {
      await leadsService.logActivity(selected.lead_id, {
        activity_type: logType, summary: logSummary,
        outcome: logOutcome || undefined,
        next_action: logNextAction || undefined,
        follow_up_date: logFollowUp || undefined,
      });
      setLogOpen(false);
      setLogSummary(""); setLogOutcome(""); setLogNextAction(""); setLogFollowUp("");
      setSuccess("Activity logged successfully");
      await refreshSelected();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to log activity");
    } finally { setLogLoading(false); }
  };

  const handleUpdateStatus = async () => {
    if (!selected || !newStatus) return;
    setStatusLoading(true);
    try {
      await leadsService.update(selected.lead_id, { status: newStatus as any });
      setStatusOpen(false);
      setSuccess("Status updated");
      await refreshSelected();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to update status");
    } finally { setStatusLoading(false); }
  };

  const handleUpdateFollowUp = async () => {
    if (!selected || !newFollowUp) return;
    setFollowUpLoading(true);
    try {
      await leadsService.update(selected.lead_id, { follow_up_date: newFollowUp });
      setFollowUpOpen(false);
      setSuccess("Follow-up date updated");
      await refreshSelected();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to update follow-up date");
    } finally { setFollowUpLoading(false); }
  };

  const handleEditSave = async () => {
    if (!selected) return;
    try {
      await leadsService.update(selected.lead_id, {
        phone: editPhone || undefined,
        company_name: editCompany || undefined,
        product_interest: editProduct || undefined,
      });
      setEditOpen(false);
      setSuccess("Details updated");
      await refreshSelected();
    } catch (e: any) { setError(e?.response?.data?.detail || "Failed to update"); }
  };

  const handleCloseLead = async () => {
    if (!selected) return;
    setCloseLoading(true);
    try {
      const reason = rejectionReason === "Other" ? otherReason : rejectionReason;
      await leadsService.close(selected.lead_id, {
        closure_type: closureType,
        rejection_reason: closureType === "Rejected" ? reason : undefined,
        conversion_notes: closureType === "Converted" ? conversionNotes : undefined,
      });
      setCloseOpen(false);
      setSuccess(`Lead closed as ${closureType}`);
      await refreshSelected();
      await loadLeads();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to close lead");
    } finally { setCloseLoading(false); }
  };

  const isClosed = selected && ["Converted", "Rejected"].includes(selected.status);
  const isOverdue = selected?.follow_up_date && selected.follow_up_date < today && !isClosed;

  const filteredLeads = myLeads.filter(lead => {
    const isClosed = ["Converted", "Rejected"].includes(lead.status);
    if (isClosed) return false; // Strictly only active leads in workspace

    if (statusFilter !== "All" && lead.status !== statusFilter) return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = lead.full_name.toLowerCase().includes(q);
      const matchCompany = lead.company_name?.toLowerCase().includes(q);
      const matchId = lead.lead_id.toLowerCase().includes(q);
      if (!matchName && !matchCompany && !matchId) return false;
    }
    return true;
  });

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Lead Workspace</Typography>
          <Typography variant="body2" color="text.secondary">Select a lead to work on it</Typography>
        </Box>
        <IconButton onClick={loadLeads} color="primary"><RefreshIcon /></IconButton>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>{success}</Alert>}

      <Grid container spacing={2} sx={{ height: "calc(100vh - 200px)" }}>
        {/* Left panel: lead list */}
        <Grid item xs={12} md={4} lg={3}>
          <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="subtitle2" fontWeight={700}>Active Leads ({filteredLeads.length})</Typography>
            </CardContent>
            <Divider />
            <Box p={1.5} display="flex" flexDirection="column" gap={1}>
              <TextField 
                size="small" placeholder="Search leads..." 
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                fullWidth
              />
              <FormControl size="small" fullWidth>
                <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  <MenuItem value="All">All Active Statuses</MenuItem>
                  <MenuItem value="Unassigned">Unassigned</MenuItem>
                  <MenuItem value="Assigned">Assigned</MenuItem>
                  <MenuItem value="In Progress">In Progress</MenuItem>
                  <MenuItem value="Follow-up">Follow-up</MenuItem>
                </Select>
              </FormControl>
            </Box>
            <Divider />
            <Box sx={{ overflowY: "auto", flex: 1 }}>
              {loading ? (
                <Box display="flex" justifyContent="center" p={4}><CircularProgress size={24} /></Box>
              ) : filteredLeads.length === 0 ? (
                <Box p={3} textAlign="center">
                  <Typography color="text.secondary" variant="body2">No leads found</Typography>
                </Box>
              ) : filteredLeads.map((lead) => {
                const overdueFlag = lead.follow_up_date && lead.follow_up_date < today && !["Converted", "Rejected"].includes(lead.status);
                const isSelected = selected?.lead_id === lead.lead_id;
                return (
                  <Box key={lead.lead_id}
                    onClick={() => selectLead(lead)}
                    sx={{
                      p: 1.5, cursor: "pointer",
                      bgcolor: isSelected ? "primary.main" + "15" : "transparent",
                      borderLeft: isSelected ? "3px solid" : "3px solid transparent",
                      borderLeftColor: isSelected ? "primary.main" : "transparent",
                      "&:hover": { bgcolor: "action.hover" },
                    }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Typography variant="caption" fontFamily="monospace" color="text.secondary">{lead.lead_id}</Typography>
                      <Chip label={lead.status} size="small"
                        sx={{ height: 18, fontSize: "0.62rem", bgcolor: STATUS_COLOR[lead.status] + "22", color: STATUS_COLOR[lead.status], border: "none" }} />
                    </Box>
                    <Typography variant="body2" fontWeight={600}>{lead.full_name}</Typography>
                    {lead.company_name && <Typography variant="caption" color="text.secondary">{lead.company_name}</Typography>}
                    {lead.follow_up_date && (
                      <Typography variant="caption" color={overdueFlag ? "error" : "text.secondary"} display="flex" alignItems="center" gap={0.3}>
                        {overdueFlag && <WarningIcon sx={{ fontSize: 11 }} />}
                        {lead.follow_up_date}
                      </Typography>
                    )}
                    <Divider sx={{ mt: 1 }} />
                  </Box>
                );
              })}
            </Box>
          </Card>
        </Grid>

        {/* Right panel: lead workspace */}
        <Grid item xs={12} md={8} lg={9}>
          {!selected ? (
            <Paper sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 2 }}>
              <AssignmentIcon sx={{ fontSize: 64, color: "text.secondary", opacity: 0.3 }} />
              <Typography color="text.secondary">Select a lead from the list to start working</Typography>
            </Paper>
          ) : (
            <Box sx={{ height: "100%", overflowY: "auto" }}>
              {/* Lead Header */}
              <Card sx={{ mb: 2 }}>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={1}>
                    <Box>
                      <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                        <Typography variant="caption" fontFamily="monospace" color="text.secondary">{selected.lead_id}</Typography>
                        <Chip label={selected.status} size="small"
                          sx={{ bgcolor: STATUS_COLOR[selected.status] + "22", color: STATUS_COLOR[selected.status], fontWeight: 700 }} />
                        {isOverdue && <Chip label="OVERDUE" size="small" color="error" icon={<WarningIcon />} />}
                      </Box>
                      <Typography variant="h5" fontWeight={700}>{selected.full_name}</Typography>
                      {selected.company_name && <Typography color="text.secondary">{selected.company_name}</Typography>}
                    </Box>
                    {!isClosed && (
                      <Box display="flex" gap={1} flexWrap="wrap">
                        <Button size="small" variant="outlined" startIcon={<EditIcon />}
                          onClick={() => { setEditPhone(selected.phone || ""); setEditCompany(selected.company_name || ""); setEditProduct(selected.product_interest || ""); setEditOpen(true); }}>
                          Edit
                        </Button>
                        <Button size="small" variant="outlined" startIcon={<HistoryIcon />}
                          onClick={() => { setNewStatus(selected.status); setStatusOpen(true); }}>
                          Status
                        </Button>
                        <Button size="small" variant="outlined" startIcon={<PhoneIcon />}
                          onClick={() => { setNewFollowUp(selected.follow_up_date || ""); setFollowUpOpen(true); }}>
                          Follow-up
                        </Button>
                        <Button size="small" variant="contained" startIcon={<MessageIcon />}
                          onClick={() => { setLogType("Call"); setLogSummary(""); setLogOpen(true); }}>
                          Log Activity
                        </Button>
                        <Button size="small" variant="contained" color="success" startIcon={<CheckCircleIcon />}
                          onClick={() => { setClosureType("Converted"); setCloseOpen(true); }}>
                          Close Lead
                        </Button>
                      </Box>
                    )}
                  </Box>
                </CardContent>
              </Card>

              {/* Closure banner */}
              {selected.closure_type === "Converted" && (
                <Alert severity="success" sx={{ mb: 2 }} icon={<CheckCircleIcon />}>
                  <Typography fontWeight={600}>Converted</Typography>
                  {selected.conversion_notes && <Typography variant="body2">{selected.conversion_notes}</Typography>}
                </Alert>
              )}
              {selected.closure_type === "Rejected" && (
                <Alert severity="error" sx={{ mb: 2 }} icon={<CancelIcon />}>
                  <Typography fontWeight={600}>Rejected</Typography>
                  <Typography variant="body2">Reason: {selected.rejection_reason}</Typography>
                </Alert>
              )}

              <Grid container spacing={2} mb={2}>
                {/* Customer info */}
                <Grid item xs={12} md={5}>
                  <Card variant="outlined" sx={{ height: "100%" }}>
                    <CardContent>
                      <Typography variant="caption" fontWeight={700} textTransform="uppercase" color="text.secondary">Contact Info</Typography>
                      <Box mt={1} display="flex" flexDirection="column" gap={1}>
                        {[
                          { icon: <EmailIcon sx={{ fontSize: 15 }} />, val: selected.email },
                          { icon: <PhoneIcon sx={{ fontSize: 15 }} />, val: selected.phone },
                          { icon: <LanguageIcon sx={{ fontSize: 15 }} />, val: selected.country },
                          { icon: <BusinessIcon sx={{ fontSize: 15 }} />, val: selected.product_interest },
                        ].filter((i) => i.val).map((item, idx) => (
                          <Box key={idx} display="flex" alignItems="center" gap={1}>
                            <Box color="text.secondary">{item.icon}</Box>
                            <Typography variant="body2">{item.val}</Typography>
                          </Box>
                        ))}
                        {selected.message && (
                          <Box mt={0.5}>
                            <Typography variant="caption" color="text.secondary">Original Message</Typography>
                            <Typography variant="body2" sx={{ fontStyle: "italic" }}>"{selected.message}"</Typography>
                          </Box>
                        )}
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>

                {/* Internal info */}
                <Grid item xs={12} md={7}>
                  <Card variant="outlined" sx={{ height: "100%" }}>
                    <CardContent>
                      <Typography variant="caption" fontWeight={700} textTransform="uppercase" color="text.secondary">Lead Info</Typography>
                      <Grid container spacing={1} mt={0.5}>
                        <Grid item xs={6}><Typography variant="caption" color="text.secondary">Source</Typography><Typography variant="body2">{selected.source_website}</Typography></Grid>
                        <Grid item xs={6}><Typography variant="caption" color="text.secondary">Status</Typography><Typography variant="body2">{selected.status}</Typography></Grid>
                        <Grid item xs={6}><Typography variant="caption" color="text.secondary">Follow-up Date</Typography><Typography variant="body2" color={isOverdue ? "error" : "inherit"}>{selected.follow_up_date || "—"}</Typography></Grid>
                        <Grid item xs={6}><Typography variant="caption" color="text.secondary">Received</Typography><Typography variant="body2">{new Date(selected.created_at).toLocaleDateString("en-IN")}</Typography></Grid>
                      </Grid>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              {/* Activity Timeline */}
              <Card>
                <CardContent>
                  <Typography variant="subtitle2" fontWeight={700} mb={2}>Activity Timeline</Typography>
                  {activitiesLoading ? <CircularProgress size={20} /> :
                    activities.length === 0 ? <Typography color="text.secondary" variant="body2">No activities yet — log your first interaction above</Typography> :
                      activities.map((a) => <TimelineEntry key={a.activity_id} act={a} />)
                  }
                </CardContent>
              </Card>
            </Box>
          )}
        </Grid>
      </Grid>

      {/* Edit Details Modal */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Customer Details</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} mt={1}>
            <TextField label="Phone" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} fullWidth />
            <TextField label="Company Name" value={editCompany} onChange={(e) => setEditCompany(e.target.value)} fullWidth />
            <TextField label="Product Interest" value={editProduct} onChange={(e) => setEditProduct(e.target.value)} fullWidth />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleEditSave} startIcon={<SaveIcon />}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Update Status Modal */}
      <Dialog open={statusOpen} onClose={() => setStatusOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Update Lead Status</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Status</InputLabel>
            <Select value={newStatus} label="Status" onChange={(e) => setNewStatus(e.target.value)}>
              {["In Progress", "Follow-up"].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleUpdateStatus} disabled={statusLoading}>
            {statusLoading ? "Updating…" : "Update"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Follow-up Date Modal */}
      <Dialog open={followUpOpen} onClose={() => setFollowUpOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Set Follow-up Date</DialogTitle>
        <DialogContent>
          <TextField fullWidth type="date" label="Follow-up Date" sx={{ mt: 2 }}
            InputLabelProps={{ shrink: true }} value={newFollowUp}
            onChange={(e) => setNewFollowUp(e.target.value)} inputProps={{ min: today }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFollowUpOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleUpdateFollowUp} disabled={!newFollowUp || followUpLoading}>
            {followUpLoading ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Log Activity Modal */}
      <Dialog open={logOpen} onClose={() => setLogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Log Activity</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} mt={1}>
            <FormControl fullWidth>
              <InputLabel>Activity Type</InputLabel>
              <Select value={logType} label="Activity Type" onChange={(e) => setLogType(e.target.value as any)}>
                {["Call", "Email", "Meeting", "Note"].map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField label="Summary *" multiline rows={2} fullWidth required value={logSummary} onChange={(e) => setLogSummary(e.target.value)} />
            <TextField label="Outcome" multiline rows={2} fullWidth value={logOutcome} onChange={(e) => setLogOutcome(e.target.value)} />
            <TextField label="Next Action" fullWidth value={logNextAction} onChange={(e) => setLogNextAction(e.target.value)} />
            <TextField label="Follow-up Date" type="date" fullWidth InputLabelProps={{ shrink: true }}
              value={logFollowUp} onChange={(e) => setLogFollowUp(e.target.value)} inputProps={{ min: today }} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleLogActivity} disabled={!logSummary.trim() || logLoading}>
            {logLoading ? "Logging…" : "Log Activity"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Close Lead Modal */}
      <Dialog open={closeOpen} onClose={() => setCloseOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Close Lead</DialogTitle>
        <DialogContent>
          <Box mt={1}>
            <RadioGroup row value={closureType} onChange={(e) => setClosureType(e.target.value as any)} sx={{ mb: 2 }}>
              <FormControlLabel value="Converted" control={<Radio color="success" />}
                label={<Box display="flex" alignItems="center" gap={0.5}><CheckCircleIcon color="success" fontSize="small" /> Converted</Box>} />
              <FormControlLabel value="Rejected" control={<Radio color="error" />}
                label={<Box display="flex" alignItems="center" gap={0.5}><CancelIcon color="error" fontSize="small" /> Rejected</Box>} />
            </RadioGroup>

            {closureType === "Converted" && (
              <TextField label="Conversion Notes" multiline rows={3} fullWidth value={conversionNotes}
                onChange={(e) => setConversionNotes(e.target.value)} placeholder="Product finalized, deal details, any notes…" />
            )}
            {closureType === "Rejected" && (
              <Box display="flex" flexDirection="column" gap={2}>
                <FormControl fullWidth>
                  <InputLabel>Rejection Reason *</InputLabel>
                  <Select value={rejectionReason} label="Rejection Reason *" onChange={(e) => setRejectionReason(e.target.value)}>
                    {REJECTION_REASONS.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                  </Select>
                </FormControl>
                {rejectionReason === "Other" && (
                  <TextField label="Specify reason *" fullWidth value={otherReason} onChange={(e) => setOtherReason(e.target.value)} />
                )}
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCloseOpen(false)}>Cancel</Button>
          <Button variant="contained"
            color={closureType === "Converted" ? "success" : "error"}
            onClick={handleCloseLead}
            disabled={closeLoading || (closureType === "Rejected" && (!rejectionReason || (rejectionReason === "Other" && !otherReason)))}>
            {closeLoading ? "Closing…" : `Mark as ${closureType}`}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
