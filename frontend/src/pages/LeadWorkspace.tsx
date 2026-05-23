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
  Refresh as RefreshIcon, Download as DownloadIcon,
} from "@mui/icons-material";
import { useAuth } from "../contexts/AuthContext";
import { leadsService, Lead, LeadActivity, Quotation } from "../services/leadsService";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useTranslation } from "../hooks/useTranslation";

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
  Quotation: <AssignmentIcon sx={{ fontSize: 15 }} />,
};

const REJECTION_REASONS = [
  "Pricing too high", "No response from customer", "Competitor selected",
  "Not interested", "Budget constraints", "Product not suitable", "Other",
];

function TimelineEntry({ act }: { act: LeadActivity }) {
  const { t } = useTranslation();
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
        {isAuto && <Chip label={t("leadWorkspace.timelineEntrySystem", "System")} size="small" variant="outlined" sx={{ height: 18, fontSize: "0.65rem" }} />}
        <Typography variant="caption" color="text.secondary" ml="auto">
          {new Date(act.logged_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
        </Typography>
      </Box>
      {act.summary && <Typography variant="body2" fontWeight={500}>{act.summary}</Typography>}
      {act.outcome && <Typography variant="caption" color="text.secondary">{t("leadWorkspace.timelineEntryOutcome", "Outcome")}: {act.outcome}</Typography>}
      {act.next_action && <Typography variant="caption" color="text.secondary" display="block">{t("leadWorkspace.timelineEntryNext", "Next")}: {act.next_action}</Typography>}
      {act.follow_up_date && <Typography variant="caption" color="text.secondary" display="block">{t("leadWorkspace.timelineEntryFollowup", "Follow-up")}: {act.follow_up_date}</Typography>}
      <Typography variant="caption" color="text.secondary" display="block">{t("leadWorkspace.timelineEntryLoggedBy", "— {logged_by}").replace("{logged_by}", act.logged_by)}</Typography>
    </Box>
  );
}

export default function LeadWorkspace() {
  const { user } = useAuth();
  const { t } = useTranslation();
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

  // Quotation (RFQ) state
  const [activeTab, setActiveTab] = useState<"details" | "quotation">("details");
  const [quotation, setQuotation] = useState<Partial<Quotation>>({
    quantity: 0,
    material: "",
    unit_price: 0,
    total_value: 0,
    delivery_time: "",
    payment_terms: "50% Advance, 50% on Dispatch",
    notes: ""
  });
  const [quotationLoading, setQuotationLoading] = useState(false);

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
    setActiveTab("details");
    await loadActivities(lead.lead_id);
    
    if (lead.source_website === "psi" || lead.source_website === "press_stamping_industries" || lead.source_website === "press stamping industries") {
      try {
        const qRes = await leadsService.getQuotation(lead.lead_id);
        if (qRes.data) {
          setQuotation(qRes.data);
        } else {
          setQuotation({
            quantity: 0, material: "", unit_price: 0, total_value: 0,
            delivery_time: "", payment_terms: "50% Advance, 50% on Dispatch", notes: ""
          });
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  const refreshSelected = async () => {
    if (!selected) return;
    const res = await leadsService.getMyLead(selected.lead_id);
    setSelected(res.data);
    await loadActivities(selected.lead_id);
    await loadLeads();

    if (res.data.source_website === "psi" || res.data.source_website === "press_stamping_industries" || res.data.source_website === "press stamping industries") {
      try {
        const qRes = await leadsService.getQuotation(res.data.lead_id);
        if (qRes.data) {
          setQuotation(qRes.data);
        }
      } catch (e) { console.error(e); }
    }
  };

  const handleQuotationChange = (field: keyof Quotation, value: any) => {
    setQuotation((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "quantity" || field === "unit_price") {
        next.total_value = (Number(next.quantity) || 0) * (Number(next.unit_price) || 0);
      }
      return next;
    });
  };

  const handleSaveQuotation = async (downloadPDF = false) => {
    if (!selected) return;
    setQuotationLoading(true);
    try {
      await leadsService.upsertQuotation(selected.lead_id, quotation);
      setSuccess("Quotation saved successfully");
      await loadActivities(selected.lead_id); // Refresh timeline
      if (downloadPDF) {
        generatePDF();
      }
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to save quotation");
    } finally {
      setQuotationLoading(false);
    }
  };

  const generatePDF = () => {
    if (!selected) return;
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.text("QUOTATION", 14, 22);
    
    doc.setFontSize(10);
    doc.text(`Date: ${new Date().toLocaleDateString("en-IN")}`, 14, 30);
    doc.text(`Reference: ${selected.lead_id}`, 14, 35);
    
    // Customer Info
    doc.setFontSize(12);
    doc.text("To:", 14, 50);
    doc.setFontSize(10);
    doc.text(selected.company_name || selected.full_name, 14, 55);
    doc.text(selected.email || "", 14, 60);
    doc.text(selected.phone || "", 14, 65);
    
    // Table
    autoTable(doc, {
      startY: 75,
      head: [['Description', 'Material', 'Quantity', 'Unit Price', 'Total']],
      body: [
        [
          selected.product_interest || "Product", 
          quotation.material || "-", 
          (quotation.quantity || 0).toString(), 
          `Rs. ${quotation.unit_price || 0}`, 
          `Rs. ${quotation.total_value || 0}`
        ],
      ],
      theme: 'grid',
      headStyles: { fillColor: [33, 150, 243] }
    });
    
    // Terms
    const finalY = (doc as any).lastAutoTable.finalY || 100;
    doc.setFontSize(11);
    doc.text("Terms & Conditions", 14, finalY + 15);
    doc.setFontSize(10);
    doc.text(`Delivery Time: ${quotation.delivery_time || "-"}`, 14, finalY + 22);
    doc.text(`Payment Terms: ${quotation.payment_terms || "-"}`, 14, finalY + 27);
    if (quotation.notes) {
      doc.text(`Notes: ${quotation.notes}`, 14, finalY + 32);
    }
    
    doc.save(`Quotation_${selected.lead_id}.pdf`);
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

  const isClosed = selected ? ["Converted", "Rejected"].includes(selected.status) : false;
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
          <Typography variant="h4" fontWeight={700}>{t("leadWorkspace.title", "Lead Workspace")}</Typography>
          <Typography variant="body2" color="text.secondary">{t("leadWorkspace.selectLead", "Select a lead to work on it")}</Typography>
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
              <Typography variant="subtitle2" fontWeight={700}>
                {t("leadWorkspace.activeLeadsCount", "Active Leads ({count})").replace("{count}", String(filteredLeads.length))}
              </Typography>
            </CardContent>
            <Divider />
            <Box p={1.5} display="flex" flexDirection="column" gap={1}>
              <TextField 
                size="small" placeholder={t("leadWorkspace.searchLeads", "Search leads...")}
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                fullWidth
              />
              <FormControl size="small" fullWidth>
                <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  <MenuItem value="All">{t("leadWorkspace.allActiveStatuses", "All Active Statuses")}</MenuItem>
                  <MenuItem value="Unassigned">{t("leadWorkspace.unassigned", "Unassigned")}</MenuItem>
                  <MenuItem value="Assigned">{t("leadWorkspace.assigned", "Assigned")}</MenuItem>
                  <MenuItem value="In Progress">{t("leadWorkspace.inProgress", "In Progress")}</MenuItem>
                  <MenuItem value="Follow-up">{t("leadWorkspace.followUp", "Follow-up")}</MenuItem>
                </Select>
              </FormControl>
            </Box>
            <Divider />
            <Box sx={{ overflowY: "auto", flex: 1 }}>
              {loading ? (
                <Box display="flex" justifyContent="center" p={4}><CircularProgress size={24} /></Box>
              ) : filteredLeads.length === 0 ? (
                <Box p={3} textAlign="center">
                  <Typography color="text.secondary" variant="body2">{t("leadWorkspace.noLeadsFound", "No leads found")}</Typography>
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
                      <Chip label={t(`leadWorkspace.${lead.status.charAt(0).toLowerCase() + lead.status.slice(1).replace(" ", "")}`, lead.status)} size="small"
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
              <Typography color="text.secondary">{t("leadWorkspace.selectLeadToWork", "Select a lead from the list to start working")}</Typography>
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
                        <Chip label={t(`leadWorkspace.${selected.status.charAt(0).toLowerCase() + selected.status.slice(1).replace(" ", "")}`, selected.status)} size="small"
                          sx={{ bgcolor: STATUS_COLOR[selected.status] + "22", color: STATUS_COLOR[selected.status], fontWeight: 700 }} />
                        {isOverdue && <Chip label={t("leadWorkspace.overdue", "OVERDUE")} size="small" color="error" icon={<WarningIcon />} />}
                      </Box>
                      <Typography variant="h5" fontWeight={700}>{selected.full_name}</Typography>
                      {selected.company_name && <Typography color="text.secondary">{selected.company_name}</Typography>}
                    </Box>
                    {!isClosed && (
                      <Box display="flex" gap={1} flexWrap="wrap">
                        <Button size="small" variant="outlined" startIcon={<EditIcon />}
                          onClick={() => { setEditPhone(selected.phone || ""); setEditCompany(selected.company_name || ""); setEditProduct(selected.product_interest || ""); setEditOpen(true); }}>
                          {t("leadWorkspace.edit", "Edit")}
                        </Button>
                        <Button size="small" variant="outlined" startIcon={<HistoryIcon />}
                          onClick={() => { setNewStatus(selected.status); setStatusOpen(true); }}>
                          {t("leadWorkspace.status", "Status")}
                        </Button>
                        <Button size="small" variant="outlined" startIcon={<PhoneIcon />}
                          onClick={() => { setNewFollowUp(selected.follow_up_date || ""); setFollowUpOpen(true); }}>
                          {t("leadWorkspace.timelineEntryFollowup", "Follow-up")}
                        </Button>
                        <Button size="small" variant="contained" startIcon={<MessageIcon />}
                          onClick={() => { setLogType("Call"); setLogSummary(""); setLogOpen(true); }}>
                          {t("leadWorkspace.logActivity", "Log Activity")}
                        </Button>
                        <Button size="small" variant="contained" color="success" startIcon={<CheckCircleIcon />}
                          onClick={() => { setClosureType("Converted"); setCloseOpen(true); }}>
                          {t("leadWorkspace.closeLead", "Close Lead")}
                        </Button>
                      </Box>
                    )}
                  </Box>
                </CardContent>
              </Card>

              {/* Closure banner */}
              {selected.closure_type === "Converted" && (
                <Alert severity="success" sx={{ mb: 2 }} icon={<CheckCircleIcon />}>
                  <Typography fontWeight={600}>{t("leadWorkspace.converted", "Converted")}</Typography>
                  {selected.conversion_notes && <Typography variant="body2">{selected.conversion_notes}</Typography>}
                </Alert>
              )}
              {selected.closure_type === "Rejected" && (
                <Alert severity="error" sx={{ mb: 2 }} icon={<CancelIcon />}>
                  <Typography fontWeight={600}>{t("leadWorkspace.rejected", "Rejected")}</Typography>
                  <Typography variant="body2">{t("leadWorkspace.rejectionReason", "Rejection Reason")}: {selected.rejection_reason}</Typography>
                </Alert>
              )}

              {/* TABS (Only if PSI) */}
              {(selected.source_website === "psi" || selected.source_website === "press_stamping_industries" || selected.source_website === "press stamping industries") && (
                <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                  <Button variant={activeTab === "details" ? "contained" : "text"} disableElevation
                    onClick={() => setActiveTab("details")} sx={{ borderRadius: "4px 4px 0 0" }}>
                    {t("leadWorkspace.details", "Details")}
                  </Button>
                  <Button variant={activeTab === "quotation" ? "contained" : "text"} disableElevation
                    onClick={() => setActiveTab("quotation")} sx={{ borderRadius: "4px 4px 0 0", ml: 1 }}>
                    {t("leadWorkspace.quotationRfq", "Quotation (RFQ)")}
                  </Button>
                </Box>
              )}

              {activeTab === "details" ? (
                <>
                  <Grid container spacing={2} mb={2}>
                    {/* Customer info */}
                    <Grid item xs={12} md={5}>
                      <Card variant="outlined" sx={{ height: "100%" }}>
                        <CardContent>
                          <Typography variant="caption" fontWeight={700} textTransform="uppercase" color="text.secondary">{t("leadWorkspace.contactInfo", "Contact Info")}</Typography>
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
                                <Typography variant="caption" color="text.secondary">{t("leadWorkspace.originalMessage", "Original Message")}</Typography>
                                <Typography variant="body2" sx={{ fontStyle: "italic" }}>{t("leadWorkspace.originalMessageQuote", '"{message}"').replace("{message}", selected.message)}</Typography>
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
                          <Typography variant="caption" fontWeight={700} textTransform="uppercase" color="text.secondary">{t("leadWorkspace.leadInfo", "Lead Info")}</Typography>
                          <Grid container spacing={1} mt={0.5}>
                            <Grid item xs={6}><Typography variant="caption" color="text.secondary">{t("leadPipeline.source", "Source")}</Typography><Typography variant="body2">{selected.source_website}</Typography></Grid>
                            <Grid item xs={6}><Typography variant="caption" color="text.secondary">{t("leadWorkspace.status", "Status")}</Typography><Typography variant="body2">{t(`leadWorkspace.${selected.status.charAt(0).toLowerCase() + selected.status.slice(1).replace(" ", "")}`, selected.status)}</Typography></Grid>
                            <Grid item xs={6}><Typography variant="caption" color="text.secondary">{t("leadWorkspace.timelineEntryFollowup", "Follow-up Date")}</Typography><Typography variant="body2" color={isOverdue ? "error" : "inherit"}>{selected.follow_up_date || "—"}</Typography></Grid>
                            <Grid item xs={6}><Typography variant="caption" color="text.secondary">{t("leadPipeline.received", "Received")}</Typography><Typography variant="body2">{new Date(selected.created_at).toLocaleDateString("en-IN")}</Typography></Grid>
                          </Grid>
                        </CardContent>
                      </Card>
                    </Grid>
                  </Grid>

                  {/* Activity Timeline */}
                  <Card>
                    <CardContent>
                      <Typography variant="subtitle2" fontWeight={700} mb={2}>{t("leadWorkspace.timelineTitle", "Activity Timeline")}</Typography>
                      {activitiesLoading ? <CircularProgress size={20} /> :
                        activities.length === 0 ? <Typography color="text.secondary" variant="body2">{t("leadWorkspace.noActivities", "No activities yet — log your first interaction above")}</Typography> :
                          activities.map((a) => <TimelineEntry key={a.activity_id} act={a} />)
                      }
                    </CardContent>
                  </Card>
                </>
              ) : (
                <Card sx={{ mb: 2 }}>
                  <CardContent>
                    <Typography variant="subtitle2" fontWeight={700} mb={2}>{t("leadWorkspace.quotationDetails", "Quotation Details")}</Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={6}>
                        <TextField label={t("leadWorkspace.quantity", "Quantity")} type="number" fullWidth size="small" 
                          value={quotation.quantity || ""} disabled={isClosed}
                          onChange={(e) => handleQuotationChange("quantity", Number(e.target.value))} />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <FormControl fullWidth size="small">
                          <InputLabel>{t("leadWorkspace.material", "Material")}</InputLabel>
                          <Select value={quotation.material || ""} label={t("leadWorkspace.material", "Material")} disabled={isClosed}
                            onChange={(e) => handleQuotationChange("material", e.target.value)}>
                            <MenuItem value="Mild Steel (MS)">Mild Steel (MS)</MenuItem>
                            <MenuItem value="Stainless Steel (SS)">Stainless Steel (SS)</MenuItem>
                            <MenuItem value="Aluminium">Aluminium</MenuItem>
                            <MenuItem value="Galvanized Steel">Galvanized Steel</MenuItem>
                            <MenuItem value="Copper / Brass">Copper / Brass</MenuItem>
                            <MenuItem value="Custom / Other">Custom / Other</MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <TextField label={t("leadWorkspace.unitPrice", "Unit Price (Rs)")} type="number" fullWidth size="small" 
                          value={quotation.unit_price || ""} disabled={isClosed}
                          onChange={(e) => handleQuotationChange("unit_price", Number(e.target.value))} />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <TextField label={t("leadWorkspace.totalValue", "Total Value (Rs)")} type="number" fullWidth size="small" 
                          value={quotation.total_value || ""} disabled />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <TextField label={t("leadWorkspace.deliveryTime", "Delivery Time")} fullWidth size="small" 
                          value={quotation.delivery_time || ""} disabled={isClosed}
                          onChange={(e) => handleQuotationChange("delivery_time", e.target.value)} />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <FormControl fullWidth size="small">
                          <InputLabel>{t("leadWorkspace.paymentTerms", "Payment Terms")}</InputLabel>
                          <Select value={quotation.payment_terms || ""} label={t("leadWorkspace.paymentTerms", "Payment Terms")} disabled={isClosed}
                            onChange={(e) => handleQuotationChange("payment_terms", e.target.value)}>
                            <MenuItem value="50% Advance, 50% on Dispatch">50% Advance, 50% on Dispatch</MenuItem>
                            <MenuItem value="100% Advance">100% Advance</MenuItem>
                            <MenuItem value="30 Days Credit">30 Days Credit</MenuItem>
                            <MenuItem value="60 Days Credit">60 Days Credit</MenuItem>
                            <MenuItem value="LC at Sight">LC at Sight</MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={12}>
                        <TextField label={t("leadWorkspace.internalNotes", "Internal Notes")} multiline rows={3} fullWidth size="small" 
                          value={quotation.notes || ""} disabled={isClosed}
                          onChange={(e) => handleQuotationChange("notes", e.target.value)} />
                      </Grid>
                    </Grid>
                    <Box mt={2} display="flex" justifyContent="flex-end" gap={1}>
                      {!isClosed && (
                        <Button variant="outlined" startIcon={<SaveIcon />} disabled={quotationLoading} onClick={() => handleSaveQuotation(false)}>
                          {t("leadWorkspace.saveDetails", "Save Details")}
                        </Button>
                      )}
                      <Button variant="contained" color={isClosed ? "primary" : "secondary"} startIcon={<DownloadIcon />} disabled={quotationLoading} onClick={() => isClosed ? generatePDF() : handleSaveQuotation(true)}>
                        {isClosed ? t("leadWorkspace.downloadPdf", "Download PDF") : t("leadWorkspace.saveAndGeneratePdf", "Save & Generate PDF")}
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              )}
            </Box>
          )}
        </Grid>
      </Grid>

      {/* Edit Details Modal */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t("leadWorkspace.editCustomerDetails", "Edit Customer Details")}</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} mt={1}>
            <TextField label={t("common.phone", "Phone")} value={editPhone} onChange={(e) => setEditPhone(e.target.value)} fullWidth />
            <TextField label={t("leadPipeline.company", "Company Name")} value={editCompany} onChange={(e) => setEditCompany(e.target.value)} fullWidth />
            <TextField label={t("leadPipeline.product", "Product Interest")} value={editProduct} onChange={(e) => setEditProduct(e.target.value)} fullWidth />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>{t("common.cancel", "Cancel")}</Button>
          <Button variant="contained" onClick={handleEditSave} startIcon={<SaveIcon />}>{t("common.save", "Save")}</Button>
        </DialogActions>
      </Dialog>

      {/* Update Status Modal */}
      <Dialog open={statusOpen} onClose={() => setStatusOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t("leadWorkspace.updateLeadStatus", "Update Lead Status")}</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>{t("common.status", "Status")}</InputLabel>
            <Select value={newStatus} label={t("common.status", "Status")} onChange={(e) => setNewStatus(e.target.value)}>
              {["In Progress", "Follow-up"].map((s) => (
                <MenuItem key={s} value={s}>
                  {t(`leadWorkspace.${s.charAt(0).toLowerCase() + s.slice(1).replace(" ", "")}`, s)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusOpen(false)}>{t("common.cancel", "Cancel")}</Button>
          <Button variant="contained" onClick={handleUpdateStatus} disabled={statusLoading}>
            {statusLoading ? t("common.saving", "Updating…") : t("common.edit", "Update")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Follow-up Date Modal */}
      <Dialog open={followUpOpen} onClose={() => setFollowUpOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t("leadWorkspace.setFollowUpDate", "Set Follow-up Date")}</DialogTitle>
        <DialogContent>
          <TextField fullWidth type="date" label={t("leadWorkspace.timelineEntryFollowup", "Follow-up Date")} sx={{ mt: 2 }}
            InputLabelProps={{ shrink: true }} value={newFollowUp}
            onChange={(e) => setNewFollowUp(e.target.value)} inputProps={{ min: today }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFollowUpOpen(false)}>{t("common.cancel", "Cancel")}</Button>
          <Button variant="contained" onClick={handleUpdateFollowUp} disabled={!newFollowUp || followUpLoading}>
            {followUpLoading ? t("common.saving", "Saving…") : t("common.save", "Save")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Log Activity Modal */}
      <Dialog open={logOpen} onClose={() => setLogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t("leadWorkspace.logActivity", "Log Activity")}</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} mt={1}>
            <FormControl fullWidth>
              <InputLabel>{t("leadWorkspace.activityType", "Activity Type")}</InputLabel>
              <Select value={logType} label={t("leadWorkspace.activityType", "Activity Type")} onChange={(e) => setLogType(e.target.value as any)}>
                {["Call", "Email", "Meeting", "Note"].map((tType) => (
                  <MenuItem key={tType} value={tType}>
                    {t(`leadWorkspace.activityType_${tType.toLowerCase()}`, tType)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField label={`${t("leadWorkspace.summary", "Summary")} *`} multiline rows={2} fullWidth required value={logSummary} onChange={(e) => setLogSummary(e.target.value)} />
            <TextField label={t("leadWorkspace.outcome", "Outcome")} multiline rows={2} fullWidth value={logOutcome} onChange={(e) => setLogOutcome(e.target.value)} />
            <TextField label={t("leadWorkspace.nextAction", "Next Action")} fullWidth value={logNextAction} onChange={(e) => setLogNextAction(e.target.value)} />
            <TextField label={t("leadWorkspace.timelineEntryFollowup", "Follow-up Date")} type="date" fullWidth InputLabelProps={{ shrink: true }}
              value={logFollowUp} onChange={(e) => setLogFollowUp(e.target.value)} inputProps={{ min: today }} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLogOpen(false)}>{t("common.cancel", "Cancel")}</Button>
          <Button variant="contained" onClick={handleLogActivity} disabled={!logSummary.trim() || logLoading}>
            {logLoading ? t("leadWorkspace.logging", "Logging…") : t("leadWorkspace.logActivity", "Log Activity")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Close Lead Modal */}
      <Dialog open={closeOpen} onClose={() => setCloseOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t("leadWorkspace.closeLead", "Close Lead")}</DialogTitle>
        <DialogContent>
          <Box mt={1}>
            <RadioGroup row value={closureType} onChange={(e) => setClosureType(e.target.value as any)} sx={{ mb: 2 }}>
              <FormControlLabel value="Converted" control={<Radio color="success" />}
                label={<Box display="flex" alignItems="center" gap={0.5}><CheckCircleIcon color="success" fontSize="small" /> {t("leadWorkspace.converted", "Converted")}</Box>} />
              <FormControlLabel value="Rejected" control={<Radio color="error" />}
                label={<Box display="flex" alignItems="center" gap={0.5}><CancelIcon color="error" fontSize="small" /> {t("leadWorkspace.rejected", "Rejected")}</Box>} />
            </RadioGroup>

            {closureType === "Converted" && (
              <TextField label={t("leadWorkspace.conversionNotes", "Conversion Notes")} multiline rows={3} fullWidth value={conversionNotes}
                onChange={(e) => setConversionNotes(e.target.value)} placeholder={t("leadWorkspace.conversionNotesPlaceholder", "Product finalized, deal details, any notes…")} />
            )}
            {closureType === "Rejected" && (
              <Box display="flex" flexDirection="column" gap={2}>
                <FormControl fullWidth>
                  <InputLabel>{`${t("leadWorkspace.rejectionReason", "Rejection Reason")} *`}</InputLabel>
                  <Select value={rejectionReason} label={`${t("leadWorkspace.rejectionReason", "Rejection Reason")} *`} onChange={(e) => setRejectionReason(e.target.value)}>
                    {REJECTION_REASONS.map((r) => (
                      <MenuItem key={r} value={r}>
                        {t(`leadWorkspace.reason_${r.toLowerCase().replace(/ /g, "_")}`, r)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {rejectionReason === "Other" && (
                  <TextField label={`${t("leadWorkspace.specifyReason", "Specify reason")} *`} fullWidth value={otherReason} onChange={(e) => setOtherReason(e.target.value)} />
                )}
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCloseOpen(false)}>{t("common.cancel", "Cancel")}</Button>
          <Button variant="contained"
            color={closureType === "Converted" ? "success" : "error"}
            onClick={handleCloseLead}
            disabled={closeLoading || (closureType === "Rejected" && (!rejectionReason || (rejectionReason === "Other" && !otherReason)))}>
            {closeLoading ? t("leadWorkspace.closing", "Closing…") : `${t("leadWorkspace.markAs", "Mark as")} ${t(`leadWorkspace.${closureType.toLowerCase()}`, closureType)}`}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
