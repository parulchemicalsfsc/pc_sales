import { useState, useEffect, useCallback } from "react";
import {
  Box, Card, CardContent, Typography, Grid, Chip, CircularProgress,
  Alert, TextField, MenuItem, Select, FormControl, InputLabel,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, Drawer, Divider, Button, Avatar, Tooltip, Dialog,
  DialogTitle, DialogContent, DialogActions, InputAdornment,
  Paper,
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
import { leadsService, Lead, LeadActivity, LeadSource } from "../services/leadsService";
import { useTranslation } from "../hooks/useTranslation";

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
  const { t } = useTranslation();
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
        {isAuto && <Chip label={t("leadWorkspace.timelineEntrySystem", "System")} size="small" sx={{ height: 18, fontSize: "0.65rem" }} variant="outlined" />}
        <Typography variant="caption" color="text.secondary" ml="auto">
          {new Date(act.logged_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
        </Typography>
      </Box>
      {act.summary && <Typography variant="body2" fontWeight={500}>{act.summary}</Typography>}
      {act.outcome && <Typography variant="caption" color="text.secondary">{t("leadWorkspace.timelineEntryOutcome", "Outcome")}: {act.outcome}</Typography>}
      {act.next_action && <Typography variant="caption" color="text.secondary" display="block">{t("leadWorkspace.timelineEntryNext", "Next")}: {act.next_action}</Typography>}
      {act.follow_up_date && <Typography variant="caption" color="text.secondary" display="block">{t("leadWorkspace.timelineEntryFollowup", "Follow-up")}: {act.follow_up_date}</Typography>}
      <Typography variant="caption" color="text.secondary" display="block">
        {t("leadWorkspace.timelineEntryLoggedBy", "— {logged_by}").replace("{logged_by}", act.logged_by)}
      </Typography>
    </Box>
  );
}

export default function LeadPipeline() {
  const { user, hasPermission } = useAuth();
  const { t } = useTranslation();
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
  const [assignTo, setAssignTo] = useState<string[]>([]);
  const [assignNote, setAssignNote] = useState("");
  const [assignLoading, setAssignLoading] = useState(false);

  // Manager comment modal
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);

  // Delete confirm dialog state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Configuration popups / sources
  const [leadSources, setLeadSources] = useState<LeadSource[]>([]);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [newSource, setNewSource] = useState<Partial<LeadSource>>({
    name: "",
    website_url: "",
    prefix: "",
    bg_color: "#2196f3",
    text_color: "#2196f3",
    is_active: true
  });
  const [saveSourceLoading, setSaveSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);

  const getLeftBarColor = (hex: string): string => {
    let cleanHex = hex.replace("#", "").trim();
    if (cleanHex.length === 3) {
      cleanHex = cleanHex.split("").map((c) => c + c).join("");
    }
    if (cleanHex.length !== 6) return hex;

    const rNorm = parseInt(cleanHex.substring(0, 2), 16) / 255;
    const gNorm = parseInt(cleanHex.substring(2, 4), 16) / 255;
    const bNorm = parseInt(cleanHex.substring(4, 6), 16) / 255;
    const max = Math.max(rNorm, gNorm, bNorm);
    const min = Math.min(rNorm, gNorm, bNorm);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === rNorm) {
        h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
      } else if (max === gNorm) {
        h = (bNorm - rNorm) / d + 2;
      } else {
        h = (rNorm - gNorm) / d + 4;
      }
      h /= 6;
    }

    const targetL = Math.max(0.25, Math.min(0.5, l - 0.35));
    const targetS = Math.min(1.0, s * 1.5 || 0.8);

    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = targetL < 0.5 ? targetL * (1 + targetS) : targetL + targetS - targetL * targetS;
    const p = 2 * targetL - q;

    const rFinal = Math.round(hue2rgb(p, q, h + 1/3) * 255);
    const gFinal = Math.round(hue2rgb(p, q, h) * 255);
    const bFinal = Math.round(hue2rgb(p, q, h - 1/3) * 255);

    const toHex = (val: number) => Math.max(0, Math.min(255, val)).toString(16).padStart(2, "0");
    return `#${toHex(rFinal)}${toHex(gFinal)}${toHex(bFinal)}`;
  };

  const getHoverBgColor = (hex: string): string => {
    let cleanHex = hex.replace("#", "").trim();
    if (cleanHex.length === 3) {
      cleanHex = cleanHex.split("").map((c) => c + c).join("");
    }
    if (cleanHex.length !== 6) return hex;

    const r = Math.max(0, Math.floor(parseInt(cleanHex.substring(0, 2), 16) * 0.9));
    const g = Math.max(0, Math.floor(parseInt(cleanHex.substring(2, 4), 16) * 0.9));
    const b = Math.max(0, Math.floor(parseInt(cleanHex.substring(4, 6), 16) * 0.9));

    const toHex = (val: number) => val.toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  const getRowStyles = (sourceName: string) => {
    const normalize = (val: string) => val.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
    const extractDomain = (url: string) => {
      let u = url.trim().toLowerCase();
      if (!u.startsWith("http://") && !u.startsWith("https://")) {
        u = "http://" + u;
      }
      try {
        const parsed = new URL(u);
        let domain = parsed.hostname;
        if (domain.startsWith("www.")) {
          domain = domain.substring(4);
        }
        return domain;
      } catch {
        return u;
      }
    };

    const incomingNorm = normalize(sourceName);
    const incomingDomain = extractDomain(sourceName);

    const matched = leadSources.find((s) => {
      const srcNorm = normalize(s.name);
      if (incomingNorm === srcNorm) return true;

      const srcDomain = extractDomain(s.website_url);
      if (incomingDomain && srcDomain && incomingDomain === srcDomain) return true;

      // Legacy matching support
      if (incomingNorm === "psi" && srcNorm.includes("pressstamping")) return true;
      if (incomingNorm === "pcsales" && srcNorm.includes("parulchemical")) return true;

      return false;
    });

    if (matched && matched.is_active) {
      const baseColor = matched.bg_color || "#2196f3";
      return {
        hasColor: true,
        color: getLeftBarColor(baseColor),
        rowBg: baseColor,
        hoverBg: getHoverBgColor(baseColor),
      };
    }
    return {
      hasColor: false,
      color: "",
      rowBg: "",
      hoverBg: "",
    };
  };

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

  const loadSources = useCallback(async () => {
    try {
      const res = await leadsService.getSources();
      setLeadSources(res.data || []);
    } catch { }
  }, []);

  useEffect(() => { loadLeads(); }, [loadLeads]);
  useEffect(() => { loadOwners(); }, [loadOwners]);
  useEffect(() => { loadSources(); }, [loadSources]);

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
    if (!selectedLead || assignTo.length === 0) return;
    setAssignLoading(true);
    try {
      await leadsService.assign(selectedLead.lead_id, assignTo, assignNote || undefined);
      setAssignOpen(false);
      setAssignTo([]); setAssignNote("");
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
          <Typography variant="h4" fontWeight={700}>{t("leadPipeline.title", "Lead Pipeline")}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t("leadPipeline.totalLeadsCount", "{count} total leads").replace("{count}", String(total))}
          </Typography>
        </Box>
        <Box display="flex" alignItems="center" gap={1}>
          {hasPermission(PERMISSIONS.MANAGE_LEADS) && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<AutoIcon />}
              onClick={() => {
                setSourceError(null);
                setSourcesOpen(true);
              }}
            >
              Configure Sources
            </Button>
          )}
          <IconButton onClick={loadLeads} color="primary"><RefreshIcon /></IconButton>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={4}>
              <TextField fullWidth size="small" placeholder={t("leadPipeline.searchPlaceholder", "Search by name, ID, company…")}
                value={search} onChange={(e) => setSearch(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }} />
            </Grid>
            <Grid item xs={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>{t("leadPipeline.status", "Status")}</InputLabel>
                <Select value={filterStatus} label={t("leadPipeline.status", "Status")} onChange={(e) => setFilterStatus(e.target.value)}>
                  <MenuItem value="">{t("leadPipeline.all", "All")}</MenuItem>
                  {["Unassigned", "Assigned", "In Progress", "Follow-up", "Converted", "Rejected"].map((s) => (
                    <MenuItem key={s} value={s}>
                      {t(`leadWorkspace.${s.charAt(0).toLowerCase() + s.slice(1).replace(" ", "")}`, s)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>{t("leadPipeline.owner", "Owner")}</InputLabel>
                <Select value={filterOwner} label={t("leadPipeline.owner", "Owner")} onChange={(e) => setFilterOwner(e.target.value)}>
                  <MenuItem value="">{t("leadPipeline.all", "All")}</MenuItem>
                  {owners.map((o) => <MenuItem key={o.email} value={o.email}>{o.name || o.email}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>{t("leadPipeline.source", "Source")}</InputLabel>
                <Select value={filterSource} label={t("leadPipeline.source", "Source")} onChange={(e) => setFilterSource(e.target.value)}>
                  <MenuItem value="">{t("leadPipeline.all", "All")}</MenuItem>
                  {sources.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} md={2}>
              <Button fullWidth variant="outlined" onClick={() => { setFilterStatus(""); setFilterOwner(""); setFilterSource(""); setSearch(""); }}>
                {t("leadPipeline.clearFilters", "Clear Filters")}
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
                <TableCell>{t("leadPipeline.leadId", "Lead ID")}</TableCell>
                <TableCell>{t("leadPipeline.name", "Name")}</TableCell>
                <TableCell>{t("leadPipeline.company", "Company")}</TableCell>
                <TableCell>{t("leadPipeline.product", "Product")}</TableCell>
                <TableCell>{t("leadPipeline.source", "Source")}</TableCell>
                <TableCell>{t("leadPipeline.status", "Status")}</TableCell>
                <TableCell>{t("leadPipeline.assignedTo", "Assigned To")}</TableCell>
                <TableCell>{t("leadPipeline.followUp", "Follow-up")}</TableCell>
                <TableCell>{t("leadPipeline.received", "Received")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} align="center" sx={{ py: 6 }}><CircularProgress /></TableCell></TableRow>
              ) : filteredLeads.length === 0 ? (
                <TableRow><TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                  <Typography color="text.secondary">{t("leadWorkspace.noLeadsFound", "No leads found")}</Typography>
                </TableCell></TableRow>
              ) : filteredLeads.map((lead) => {
                const isOverdue = lead.follow_up_date && lead.follow_up_date < today && !["Converted", "Rejected"].includes(lead.status);
                const rowStyle = getRowStyles(lead.source_website);
                return (
                  <TableRow
                    key={lead.lead_id}
                    hover
                    sx={{
                      cursor: "pointer",
                      ...(rowStyle.hasColor && {
                        backgroundColor: rowStyle.rowBg,
                        "&:hover": {
                          backgroundColor: `${rowStyle.hoverBg} !important`,
                        },
                      }),
                    }}
                    onClick={() => openDrawer(lead)}
                  >
                    <TableCell
                      sx={{
                        ...(rowStyle.hasColor && {
                          borderLeft: `6px solid ${rowStyle.color}`,
                        }),
                      }}
                    >
                      <Typography variant="body2" fontFamily="monospace" fontWeight={600}>
                        {lead.lead_id}
                      </Typography>
                    </TableCell>
                    <TableCell>{lead.full_name}</TableCell>
                    <TableCell>{lead.company_name || "—"}</TableCell>
                    <TableCell>{lead.product_interest || "—"}</TableCell>
                    <TableCell>{lead.source_website}</TableCell>
                    <TableCell>
                      <Chip label={t(`leadWorkspace.${lead.status.charAt(0).toLowerCase() + lead.status.slice(1).replace(" ", "")}`, lead.status)} size="small"
                        sx={{ bgcolor: STATUS_COLOR[lead.status] + "22", color: STATUS_COLOR[lead.status], fontWeight: 600, border: "none" }} />
                    </TableCell>
                    <TableCell>
                      {lead.assigned_to ? (
                        <Box display="flex" flexWrap="wrap" gap={0.5}>
                          {lead.assigned_to.split(",").map((email) => {
                            const trimmed = email.trim();
                            const owner = owners.find((o) => o.email === trimmed);
                            return (
                              <Chip
                                key={trimmed}
                                label={owner ? owner.name || trimmed : trimmed}
                                size="small"
                                variant="outlined"
                              />
                            );
                          })}
                        </Box>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          {t("leadPipeline.unassigned", "Unassigned")}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Tooltip title={isOverdue ? t("leadWorkspace.overdue", "OVERDUE") : ""}>
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
                  <Chip label={t(`leadWorkspace.${selectedLead.status.charAt(0).toLowerCase() + selectedLead.status.slice(1).replace(" ", "")}`, selectedLead.status)} size="small"
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
                <Typography fontWeight={600}>{t("leadWorkspace.converted", "Converted")}</Typography>
                {selectedLead.conversion_notes && <Typography variant="body2">{selectedLead.conversion_notes}</Typography>}
              </Alert>
            )}
            {selectedLead.closure_type === "Rejected" && (
              <Alert severity="error" icon={<CancelIcon />} sx={{ mb: 2 }}>
                <Typography fontWeight={600}>{t("leadWorkspace.rejected", "Rejected")}</Typography>
                {selectedLead.rejection_reason && <Typography variant="body2">{t("leadWorkspace.rejectionReason", "Reason")}: {selectedLead.rejection_reason}</Typography>}
              </Alert>
            )}

            {/* Customer Info */}
            <Card variant="outlined" sx={{ mb: 2 }}>
              <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                <Typography variant="caption" fontWeight={700} textTransform="uppercase" color="text.secondary">{t("leadPipeline.customerInfo", "Customer Info")}</Typography>
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
                      <Typography variant="caption" color="text.secondary">{t("leadPipeline.message", "Message")}</Typography>
                      <Typography variant="body2" sx={{ fontStyle: "italic" }}>{t("leadWorkspace.originalMessageQuote", '"{message}"').replace("{message}", selectedLead.message)}</Typography>
                    </Grid>
                  )}
                </Grid>
              </CardContent>
            </Card>

             {/* Internal Info */}
            <Box display="flex" gap={1} mb={2} flexWrap="wrap">
              <Chip icon={<LanguageIcon />} label={selectedLead.source_website} size="small" variant="outlined" />
              {selectedLead.assigned_to ? (
                <Box display="flex" flexWrap="wrap" gap={0.5} sx={{ display: 'inline-flex', mr: 1 }}>
                  {selectedLead.assigned_to.split(",").map((email) => {
                    const trimmed = email.trim();
                    const owner = owners.find((o) => o.email === trimmed);
                    return (
                      <Chip
                        key={trimmed}
                        icon={<PersonIcon />}
                        label={owner ? owner.name || trimmed : trimmed}
                        size="small"
                        variant="outlined"
                      />
                    );
                  })}
                </Box>
              ) : null}
              {selectedLead.follow_up_date && <Chip icon={<ScheduleIcon />} label={`${t("leadWorkspace.timelineEntryFollowup", "Follow-up")}: ${selectedLead.follow_up_date}`} size="small" variant="outlined" />}
            </Box>

            {/* Actions */}
            {hasPermission(PERMISSIONS.MANAGE_LEADS) && (
              <Box display="flex" gap={1} mb={2} flexWrap="wrap">
                {!selectedLead.closure_type && (
                  <>
                    <Button variant="contained" size="small" startIcon={<AssignmentIcon />}
                      onClick={() => {
                        const currentOwners = selectedLead.assigned_to 
                          ? selectedLead.assigned_to.split(",").map(s => s.trim()) 
                          : [];
                        setAssignTo(currentOwners);
                        setAssignOpen(true);
                      }}>
                      {selectedLead.assigned_to ? t("leadPipeline.reassign", "Reassign") : t("leadPipeline.assign", "Assign")}
                    </Button>
                    <Button variant="outlined" size="small" startIcon={<CommentIcon />}
                      onClick={() => setCommentOpen(true)} disabled={!selectedLead.assigned_to}>
                      {t("leadPipeline.leaveNote", "Leave Note")}
                    </Button>
                  </>
                )}
                <Button variant="outlined" color="error" size="small" startIcon={<DeleteIcon />}
                  onClick={() => setDeleteConfirmOpen(true)}>
                  {t("leadPipeline.deleteLead", "Delete Lead")}
                </Button>
              </Box>
            )}

            <Divider sx={{ mb: 2 }} />

            {/* Timeline */}
            <Typography variant="subtitle2" fontWeight={700} mb={1.5}>{t("leadPipeline.activityTimeline", "Activity Timeline")}</Typography>
            {activitiesLoading ? <CircularProgress size={20} /> :
              activities.length === 0 ? <Typography variant="body2" color="text.secondary">{t("leadWorkspace.noActivities", "No activities yet")}</Typography> :
                activities.map((a) => <TimelineEntry key={a.activity_id} act={a} />)
            }
          </Box>
        )}
      </Drawer>

      {/* Assign Modal */}
      <Dialog open={assignOpen} onClose={() => setAssignOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{selectedLead?.assigned_to ? t("leadPipeline.reassignLead", "Reassign Lead") : t("leadPipeline.assignLead", "Assign Lead")}</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2, mb: 2 }}>
            <InputLabel id="lead-owners-label">{t("leadPipeline.leadOwner", "Lead Owner")}</InputLabel>
            <Select
              labelId="lead-owners-label"
              multiple
              value={assignTo}
              label={t("leadPipeline.leadOwner", "Lead Owner")}
              onChange={(e) => setAssignTo(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value as string[])}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {(selected as string[]).map((value) => {
                    const owner = owners.find(o => o.email === value);
                    return <Chip key={value} label={owner ? owner.name || value : value} size="small" />;
                  })}
                </Box>
              )}
            >
              {owners.map((o) => (
                <MenuItem key={o.email} value={o.email}>
                  {o.name || o.email}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField fullWidth multiline rows={2} label={t("leadPipeline.optionalNote", "Optional note for the owner")} value={assignNote}
            onChange={(e) => setAssignNote(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignOpen(false)}>{t("common.cancel", "Cancel")}</Button>
          <Button variant="contained" onClick={handleAssign} disabled={assignTo.length === 0 || assignLoading}>
            {assignLoading ? t("leadPipeline.assigning", "Assigning…") : t("leadPipeline.assign", "Assign")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Comment Modal */}
      <Dialog open={commentOpen} onClose={() => setCommentOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t("leadPipeline.leaveManagerNote", "Leave Manager Note")}</DialogTitle>
        <DialogContent>
          <TextField fullWidth multiline rows={3} label={t("leadWorkspace.timelineEntryNote", "Note")} sx={{ mt: 2 }} value={commentText}
            onChange={(e) => setCommentText(e.target.value)} placeholder={t("leadPipeline.notePlaceholder", "This note will be visible to the lead owner…")} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCommentOpen(false)}>{t("common.cancel", "Cancel")}</Button>
          <Button variant="contained" onClick={handleComment} disabled={!commentText.trim() || commentLoading}>
            {commentLoading ? t("leadPipeline.sending", "Sending…") : t("leadPipeline.sendNote", "Send Note")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, color: "error.main" }}>
          <WarningIcon /> {t("leadPipeline.deleteLead", "Delete Lead")}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {t("leadPipeline.deleteConfirmText", "Are you sure you want to delete lead {leadId} (Name: {name})?")
              .replace("{leadId}", selectedLead?.lead_id || "")
              .replace("{name}", selectedLead?.full_name || "")}
          </Typography>
          <Typography variant="body2" color="error.main" sx={{ mt: 1, fontWeight: 500 }}>
            {t("leadPipeline.deleteWarningText", "This action cannot be undone and will delete all associated activities and quotations.")}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>{t("common.cancel", "Cancel")}</Button>
          <Button variant="contained" color="error" onClick={handleDeleteLead} disabled={deleteLoading}>
            {deleteLoading ? t("leadPipeline.deleting", "Deleting…") : t("common.delete", "Delete")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Configure Lead Sources Dialog */}
      <Dialog open={sourcesOpen} onClose={() => setSourcesOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle display="flex" justifyContent="space-between" alignItems="center">
          Configure Lead Sources
          <IconButton onClick={() => setSourcesOpen(false)}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {sourceError && <Alert severity="error" sx={{ mb: 2 }}>{sourceError}</Alert>}
          
          {/* Add New Source Section */}
          <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: "action.hover" }}>
            <Typography variant="subtitle2" fontWeight={700} mb={1.5}>Add New Lead Source</Typography>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={5}>
                <TextField
                  label="Name (e.g. Parul Chemicals) *"
                  size="small"
                  fullWidth
                  value={newSource.name || ""}
                  onChange={(e) => setNewSource((prev) => ({ ...prev, name: e.target.value }))}
                />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField
                  label="Prefix (Exactly 2 chars) *"
                  size="small"
                  fullWidth
                  inputProps={{ maxLength: 2 }}
                  value={newSource.prefix || ""}
                  onChange={(e) => setNewSource((prev) => ({ ...prev, prefix: e.target.value.toUpperCase() }))}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <Box display="flex" flexDirection="column" gap={0.5}>
                  <Typography variant="caption" color="text.secondary">Source Color (Row Highlight)</Typography>
                  <Box display="flex" alignItems="center" gap={1.5}>
                    <input
                      type="color"
                      value={newSource.bg_color || "#2196f3"}
                      onChange={(e) => setNewSource((prev) => ({ ...prev, bg_color: e.target.value }))}
                      style={{
                        width: 48,
                        height: 36,
                        padding: 0,
                        border: "1px solid rgba(0, 0, 0, 0.23)",
                        borderRadius: 4,
                        cursor: "pointer",
                        backgroundColor: "transparent",
                      }}
                    />
                    <Typography variant="body2" fontFamily="monospace" fontWeight={600}>
                      {newSource.bg_color || "#2196f3"}
                    </Typography>
                  </Box>
                </Box>
              </Grid>
              <Grid item xs={12} display="flex" justifyContent="flex-end" gap={1}>
                <Button
                  variant="contained"
                  disabled={saveSourceLoading || !newSource.name || !newSource.prefix}
                  onClick={async () => {
                    setSaveSourceLoading(true);
                    setSourceError(null);
                    try {
                      if (newSource.prefix && newSource.prefix.length !== 2) {
                         throw new Error("Prefix must be exactly 2 characters");
                      }
                      await leadsService.saveSource({
                        name: newSource.name,
                        prefix: newSource.prefix,
                        bg_color: newSource.bg_color,
                        text_color: newSource.bg_color || "#2196f3",
                        website_url: "N/A",
                        is_active: newSource.is_active,
                      });
                      setNewSource({
                        name: "",
                        website_url: "",
                        prefix: "",
                        bg_color: "#2196f3",
                        text_color: "#2196f3",
                        is_active: true
                      });
                      await loadSources();
                    } catch (e: any) {
                      setSourceError(e?.response?.data?.detail || e.message || "Failed to save lead source");
                    } finally {
                      setSaveSourceLoading(false);
                    }
                  }}
                >
                  {saveSourceLoading ? "Adding..." : "Add Source"}
                </Button>
              </Grid>
            </Grid>
          </Paper>

          <Typography variant="subtitle2" fontWeight={700} mb={1}>Configured Sources</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead sx={{ bgcolor: "action.hover" }}>
                <TableRow>
                   <TableCell><strong>Name</strong></TableCell>
                   <TableCell align="center"><strong>Prefix</strong></TableCell>
                   <TableCell align="center"><strong>Badge Preview</strong></TableCell>
                   <TableCell align="center"><strong>Actions</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {leadSources.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center">No lead sources configured.</TableCell>
                  </TableRow>
                ) : (
                  leadSources.map((src) => (
                    <TableRow key={src.id}>
                      <TableCell>{src.name}</TableCell>
                      <TableCell align="center"><code style={{ fontWeight: 700 }}>{src.prefix}</code></TableCell>
                      <TableCell align="center">
                        <span style={{
                          backgroundColor: src.bg_color,
                          borderLeft: `4px solid ${getLeftBarColor(src.bg_color || "#2196f3")}`,
                          color: "inherit",
                          padding: "4px 8px",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          display: "inline-block"
                        }}>
                          {src.name}
                        </span>
                      </TableCell>
                      <TableCell align="center">
                        <IconButton
                          size="small"
                          color="error"
                          disabled={saveSourceLoading}
                          onClick={async () => {
                            if (!src.id) return;
                            if (!confirm(`Are you sure you want to delete source '${src.name}'?`)) return;
                            setSaveSourceLoading(true);
                            try {
                              await leadsService.deleteSource(src.id);
                              await loadSources();
                            } catch (e: any) {
                              setSourceError(e?.response?.data?.detail || "Failed to delete lead source");
                            } finally {
                              setSaveSourceLoading(false);
                            }
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSourcesOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
