import { useState, useEffect, useMemo } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Alert,
  Chip,
  TextField,
  MenuItem,
  Grid,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Avatar,
  Button,
  Stack,
  Paper,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  LinearProgress,
  useTheme,
  alpha,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Tooltip,
} from "@mui/material";
import {
  Refresh as RefreshIcon,
  Send as DistributeIcon,
  Autorenew as AutorenewIcon,
  Timer as TimerIcon,
  PhoneInTalk as PhoneIcon,
  Close as CloseIcon,
  TrendingUp as TrendingUpIcon,
  ShoppingCart as ShoppingCartIcon,
  CheckCircle as CheckCircleIcon,
  HelpOutline as HelpIcon,
} from "@mui/icons-material";
import { useAuth } from "../contexts/AuthContext";
import { PERMISSIONS } from "../config/permissions";
import { automationAPI } from "../services/api";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "../hooks/useTranslation";

// ── Types ──────────────────────────────────────────────────
interface Telecaller {
  email: string;
  name: string;
  role: string;
}

// ── 10 AM Countdown ────────────────────────────────────────
function useCountdownTo10AM() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const target = new Date(now);
  target.setHours(10, 0, 0, 0);

  const isPast = now >= target;
  const diff = Math.max(0, target.getTime() - now.getTime());
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const timeLeft = `${h}h ${m}m ${s}s`;
  const progress = isPast ? 100 : Math.min(100, ((86400000 - diff) / 86400000) * 100);

  return { timeLeft, progress, isPast };
}

// ══════════════════════════════════════════════════════════════
// CALL DISTRIBUTION PAGE
// ══════════════════════════════════════════════════════════════
export default function CallDistribution() {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const { user, hasPermission, role } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  const isAdmin = role === "admin" || role === "developer";
  const canDistribute = isAdmin || hasPermission?.(PERMISSIONS.RUN_CALL_DISTRIBUTION);

  const { timeLeft, progress, isPast } = useCountdownTo10AM();

  const [distributing, setDistributing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [distStatus, setDistStatus] = useState<any>(null);
  const [telecallers, setTelecallers] = useState<Telecaller[]>([]);
  const [adminData, setAdminData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; sev: "success" | "error" } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  // Bulk state
  const [bulkEmail, setBulkEmail] = useState("");
  const [bulkPriority, setBulkPriority] = useState("Medium");
  const [bulkCount, setBulkCount] = useState(10);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Pagination for individual reassign
  const [reassignPage, setReassignPage] = useState(0);
  const pageSize = 10;

  // Transfer pending state (for half-day duty etc)
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferLoading, setTransferLoading] = useState(false);

  // Telecaller Profile Dialog
  const [profileDialogEmail, setProfileDialogEmail] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Sabhsad Distribution State
  const [locations, setLocations] = useState<any>({});
  const [selState, setSelState] = useState("");
  const [selDistrict, setSelDistrict] = useState("");
  const [selTaluka, setSelTaluka] = useState("");
  const [selVillage, setSelVillage] = useState("");
  const [selectedTelecallers, setSelectedTelecallers] = useState<string[]>([]);
  const [sabhsadDistributing, setSabhsadDistributing] = useState(false);

  const handleOpenProfile = async (email: string) => {
    setProfileDialogEmail(email);
    setProfileData(null);
    setProfileLoading(true);
    try {
      const data = await automationAPI.getTelecallerProfile(email);
      setProfileData(data);
    } catch (e: any) {
      setProfileData({ error: e?.response?.data?.detail || "Failed to load profile" });
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    if (user && !canDistribute && !loading) {
      navigate("/dashboard");
    }
  }, [user, canDistribute, navigate, loading]);

  // ── Load Data ──
  const loadData = async () => {
    try {
      setLoading(true);
      const [status, tcRes, adminRes, locRes] = await Promise.all([
        automationAPI.getDistributionStatus().catch(() => null),
        automationAPI.getTelecallers().catch(() => ({ telecallers: [] })),
        automationAPI.getAdminAssignments({ page: 1, limit: 500 }).catch(() => null),
        automationAPI.getLocations().catch(() => ({})),
      ]);
      setDistStatus(status);
      setTelecallers(tcRes.telecallers || []);
      setAdminData(adminRes);
      setLocations(locRes || {});
    } catch (e) {
      console.error("Load failed:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // ── Handlers ──
  const handleDistribute = async () => {
    if (!window.confirm("Run today's mantri distribution? This will assign uncalled mantris to sales managers.")) return;
    try {
      setDistributing(true);
      const res = await automationAPI.adminDistributeMantris();
      setToast({ msg: res.message || "Distributed!", sev: "success" });
      loadData();
    } catch (e: any) {
      setToast({ msg: e?.response?.data?.detail || "Distribution failed", sev: "error" });
    } finally {
      setDistributing(false);
    }
  };

  const handleRefresh = async () => {
    if (!window.confirm("Re-distribute all uncalled assignments? Pending calls will be reassigned.")) return;
    try {
      setRefreshing(true);
      const res = await automationAPI.refreshDistribution();
      setToast({ msg: res.message || "Refreshed!", sev: "success" });
      loadData();
    } catch (e: any) {
      setToast({ msg: e?.response?.data?.detail || "Refresh failed", sev: "error" });
    } finally {
      setRefreshing(false);
    }
  };

  const handleSabhsadDistribute = async () => {
    if (selectedTelecallers.length === 0) {
      setToast({ msg: "Please select at least one telecaller", sev: "error" });
      return;
    }
    if (!window.confirm("Distribute Sabhsads for the selected location to these telecallers?")) return;
    try {
      setSabhsadDistributing(true);
      const payload = {
        telecaller_emails: selectedTelecallers,
        state: selState,
        district: selDistrict,
        taluka: selTaluka,
        village: selVillage,
      };
      const res = await automationAPI.adminDistributeSabhsads(payload);
      setToast({ msg: res.message || "Distributed successfully", sev: "success" });
      loadData();
    } catch (e: any) {
      setToast({ msg: e?.response?.data?.detail || "Distribution failed", sev: "error" });
    } finally {
      setSabhsadDistributing(false);
    }
  };

  const handleReassign = async (id: number, email: string) => {
    try {
      await automationAPI.adminReassign(id, email);
      setToast({ msg: "Reassigned successfully", sev: "success" });
      loadData();
    } catch (e: any) {
      setToast({ msg: e?.response?.data?.detail || "Reassign failed", sev: "error" });
    }
  };

  const handleBulk = async () => {
    try {
      setBulkLoading(true);
      const res = await automationAPI.bulkReassign(bulkEmail, bulkPriority, bulkCount);
      setToast({ msg: res.message || "Assigned!", sev: "success" });
      loadData();
    } catch (e: any) {
      setToast({ msg: e?.response?.data?.detail || "Bulk assign failed", sev: "error" });
    } finally {
      setBulkLoading(false);
    }
  };

  const handleTransfer = async () => {
    if (transferFrom === transferTo) {
      setToast({ msg: "Cannot transfer to the same telecaller", sev: "error" });
      return;
    }
    try {
      setTransferLoading(true);
      const res = await automationAPI.transferPending(transferFrom, transferTo);
      setToast({ msg: res.message || "Transferred successfully!", sev: "success" });
      loadData();
      setTransferFrom("");
      setTransferTo("");
    } catch (e: any) {
      setToast({ msg: e?.response?.data?.detail || "Transfer failed", sev: "error" });
    } finally {
      setTransferLoading(false);
    }
  };

  const pendingAssignments = useMemo(() =>
    (adminData?.assignments || []).filter((a: any) => a.status === "Pending"),
    [adminData]
  );

  const allSummary = adminData?.telecaller_summary
    ? Object.entries(adminData.telecaller_summary as Record<string, any>)
    : [];

  const smSummary = allSummary.filter(([_, stats]) => stats.role === "sales_manager");
  const tcSummary = allSummary.filter(([_, stats]) => stats.role !== "sales_manager" && stats.role !== "admin");

  if (!user || !canDistribute) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <Alert severity="error">Access denied. You need call distribution permissions.</Alert>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: { xs: 2, md: 3 } }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5, display: "flex", alignItems: "center", gap: 1 }}>
              <PhoneIcon color="primary" /> {t("callDistribution.title", "Call Distribution")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("callDistribution.subtitle", "Manage and monitor today's telecaller assignments")}
            </Typography>
          </Box>
          <Tooltip title="How to use this page">
            <IconButton onClick={() => setHelpOpen(true)} sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 2, color: "primary.main", mt: 0.5 }}>
              <HelpIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Toast */}
      {toast && (
        <Alert severity={toast.sev} sx={{ mb: 2 }} onClose={() => setToast(null)}>
          {toast.msg}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {/* ── Action Bar ── */}
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              mb: 3,
              borderRadius: 3,
              border: `1px solid ${theme.palette.divider}`,
              background: isDark
                ? `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.08)} 0%, ${alpha(theme.palette.secondary.main, 0.05)} 100%)`
                : `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.04)} 0%, ${alpha(theme.palette.secondary.main, 0.02)} 100%)`,
            }}
          >
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }} justifyContent="space-between">
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 1 }}>
                  <DistributeIcon color="primary" /> {t("callDistribution.distributionControls", "Distribution Controls")}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {distStatus?.distributed
                    ? `Today's calls distributed (${distStatus.total_assigned || 0} assigned)`
                    : "Today's calls have not been distributed yet"}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                <Button
                  variant="contained"
                  startIcon={distributing ? <CircularProgress size={16} color="inherit" /> : <DistributeIcon />}
                  onClick={handleDistribute}
                  disabled={distributing || distStatus?.distributed}
                  sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600, px: 3 }}
                >
                  {distStatus?.distributed ? t("callDistribution.alreadyDistributed", "Already Distributed") : t("callDistribution.distributeNow", "Distribute Now")}
                </Button>
                <Button
                  variant="outlined"
                  startIcon={refreshing ? <CircularProgress size={16} /> : <AutorenewIcon />}
                  onClick={handleRefresh}
                  disabled={refreshing}
                  sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600 }}
                >
                  {t("callDistribution.redistribute", "Re-distribute")}
                </Button>
                <IconButton onClick={loadData} sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 2 }}>
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </Stack>
            </Stack>

            {/* Timer bar */}
            {!isPast && (
              <Box sx={{ mt: 2 }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                  <TimerIcon sx={{ fontSize: 16, color: "warning.main" }} />
                  <Typography variant="caption" sx={{ fontWeight: 600, color: "warning.main" }}>
                    Auto-distribution at 10:00 AM — {timeLeft}
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={progress}
                  sx={{ height: 4, borderRadius: 2, bgcolor: alpha(theme.palette.warning.main, 0.12) }}
                />
              </Box>
            )}
          </Paper>

          {/* ── Sales Manager Summary Cards ── */}
          {smSummary.length > 0 && (
            <Box sx={{ mb: 4 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "text.secondary", mb: 1.5, textTransform: "uppercase", letterSpacing: 0.5, fontSize: "0.7rem" }}>
                {t("callDistribution.salesManagerDistribution", "Sales Manager Distribution Status")}
              </Typography>
              <Grid container spacing={2}>
                {smSummary.map(([email, d]: [string, any]) => {
                  const pct = d.total > 0 ? Math.round((d.called / d.total) * 100) : 0;
                  return (
                    <Grid item xs={12} sm={6} md={4} key={email}>
                      <Card
                        variant="outlined"
                        onClick={() => handleOpenProfile(email)}
                        sx={{
                          borderRadius: 3,
                          cursor: "pointer",
                          transition: "all 0.2s",
                          "&:hover": { boxShadow: theme.shadows[4], transform: "translateY(-2px)", borderColor: theme.palette.primary.main },
                        }}
                      >
                        <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
                          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
                            <Avatar sx={{ width: 36, height: 36, bgcolor: alpha(theme.palette.primary.main, 0.1), color: "primary.main", fontSize: 14, fontWeight: 700 }}>
                              {d.name.charAt(0).toUpperCase()}
                            </Avatar>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {d.name}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {d.total} {t("callDistribution.totalCalls", "total calls")}
                              </Typography>
                            </Box>
                          </Stack>

                          {/* Progress */}
                          <Box sx={{ mb: 1 }}>
                            <LinearProgress
                              variant="determinate"
                              value={pct}
                              sx={{
                                height: 6,
                                borderRadius: 3,
                                bgcolor: alpha(theme.palette.success.main, 0.1),
                                "& .MuiLinearProgress-bar": { borderRadius: 3, bgcolor: "success.main" },
                              }}
                            />
                          </Box>

                          <Stack direction="row" spacing={1} justifyContent="space-between" flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                            <Chip
                              size="small"
                              label={`${d.pending} ${t("callDistribution.pending", "pending")}`}
                              sx={{ height: 22, fontSize: "0.7rem", fontWeight: 600, bgcolor: alpha("#ea580c", 0.1), color: "#ea580c" }}
                            />
                            <Chip
                              size="small"
                              label={`${d.called} ${t("callDistribution.done", "done")}`}
                              sx={{ height: 22, fontSize: "0.7rem", fontWeight: 600, bgcolor: alpha("#16a34a", 0.1), color: "#16a34a" }}
                            />
                            <Chip
                              size="small"
                              label={`Conversions: ${d.conversions || 0}`}
                              sx={{ height: 22, fontSize: "0.7rem", fontWeight: 700, bgcolor: alpha(theme.palette.primary.main, 0.1), color: "primary.main" }}
                            />
                            <Chip
                              size="small"
                              label={`${pct}%`}
                              variant="outlined"
                              sx={{ height: 22, fontSize: "0.7rem", fontWeight: 700 }}
                            />
                          </Stack>
                        </CardContent>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>
            </Box>
          )}

          {/* ── Sabhsad Distribution ── */}
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              mb: 3,
              borderRadius: 3,
              border: `1px solid ${theme.palette.divider}`,
              bgcolor: alpha(theme.palette.success.main, 0.02),
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "success.main", mb: 2, textTransform: "uppercase", letterSpacing: 0.5, fontSize: "0.7rem" }}>
              Sabhsad Location Distribution
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <FormControl size="small" fullWidth>
                  <InputLabel>State</InputLabel>
                  <Select label="State" value={selState} onChange={(e) => { setSelState(e.target.value); setSelDistrict(""); setSelTaluka(""); setSelVillage(""); }} sx={{ borderRadius: 2 }}>
                    <MenuItem value="">All States</MenuItem>
                    {Object.keys(locations).map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <FormControl size="small" fullWidth disabled={!selState}>
                  <InputLabel>District</InputLabel>
                  <Select label="District" value={selDistrict} onChange={(e) => { setSelDistrict(e.target.value); setSelTaluka(""); setSelVillage(""); }} sx={{ borderRadius: 2 }}>
                    <MenuItem value="">All Districts</MenuItem>
                    {selState && locations[selState] && Object.keys(locations[selState]).map(d => <MenuItem key={d} value={d}>{d}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <FormControl size="small" fullWidth disabled={!selDistrict}>
                  <InputLabel>Taluka</InputLabel>
                  <Select label="Taluka" value={selTaluka} onChange={(e) => { setSelTaluka(e.target.value); setSelVillage(""); }} sx={{ borderRadius: 2 }}>
                    <MenuItem value="">All Talukas</MenuItem>
                    {selState && selDistrict && locations[selState][selDistrict] && Object.keys(locations[selState][selDistrict]).map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <FormControl size="small" fullWidth disabled={!selTaluka}>
                  <InputLabel>Village</InputLabel>
                  <Select label="Village" value={selVillage} onChange={(e) => setSelVillage(e.target.value)} sx={{ borderRadius: 2 }}>
                    <MenuItem value="">All Villages</MenuItem>
                    {selState && selDistrict && selTaluka && locations[selState][selDistrict][selTaluka] && locations[selState][selDistrict][selTaluka].map((v: string) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12}>
                <Stack direction="row" spacing={2}>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Assign To Telecallers</InputLabel>
                    <Select
                      label="Assign To Telecallers"
                      multiple
                      value={selectedTelecallers}
                      onChange={(e) => setSelectedTelecallers(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
                      sx={{ borderRadius: 2 }}
                      renderValue={(selected) => (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {selected.map((value) => (
                            <Chip key={value} label={telecallers.find(t => t.email === value)?.name || value.split('@')[0]} size="small" />
                          ))}
                        </Box>
                      )}
                    >
                      {telecallers.map((t) => (
                        <MenuItem key={t.email} value={t.email}>
                          {t.name || t.email.split("@")[0]}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Button
                    variant="contained"
                    color="success"
                    disabled={selectedTelecallers.length === 0 || sabhsadDistributing}
                    startIcon={sabhsadDistributing ? <CircularProgress size={16} color="inherit" /> : <DistributeIcon />}
                    onClick={handleSabhsadDistribute}
                    sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600, minWidth: 120 }}
                  >
                    Assign
                  </Button>
                </Stack>
              </Grid>
            </Grid>
          </Paper>

          {/* ── Telecaller Summary Cards ── */}
          {tcSummary.length > 0 && (
            <Box sx={{ mb: 4 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "text.secondary", mb: 1.5, textTransform: "uppercase", letterSpacing: 0.5, fontSize: "0.7rem" }}>
                {t("callDistribution.telecallerDistribution", "Telecaller Distribution Status")}
              </Typography>
              <Grid container spacing={2}>
                {tcSummary.map(([email, d]: [string, any]) => {
                  const pct = d.total > 0 ? Math.round((d.called / d.total) * 100) : 0;
                  return (
                    <Grid item xs={12} sm={6} md={4} key={email}>
                      <Card
                        variant="outlined"
                        onClick={() => handleOpenProfile(email)}
                        sx={{
                          borderRadius: 3,
                          cursor: "pointer",
                          transition: "all 0.2s",
                          "&:hover": { boxShadow: theme.shadows[4], transform: "translateY(-2px)", borderColor: theme.palette.primary.main },
                        }}
                      >
                        <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
                          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
                            <Avatar sx={{ width: 36, height: 36, bgcolor: alpha(theme.palette.primary.main, 0.1), color: "primary.main", fontSize: 14, fontWeight: 700 }}>
                              {d.name.charAt(0).toUpperCase()}
                            </Avatar>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {d.name}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {d.total} {t("callDistribution.totalCalls", "total calls")}
                              </Typography>
                            </Box>
                          </Stack>

                          {/* Progress */}
                          <Box sx={{ mb: 1 }}>
                            <LinearProgress
                              variant="determinate"
                              value={pct}
                              sx={{
                                height: 6,
                                borderRadius: 3,
                                bgcolor: alpha(theme.palette.success.main, 0.1),
                                "& .MuiLinearProgress-bar": { borderRadius: 3, bgcolor: "success.main" },
                              }}
                            />
                          </Box>

                          <Stack direction="row" spacing={1} justifyContent="space-between" flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                            <Chip
                              size="small"
                              label={`${d.pending} ${t("callDistribution.pending", "pending")}`}
                              sx={{ height: 22, fontSize: "0.7rem", fontWeight: 600, bgcolor: alpha("#ea580c", 0.1), color: "#ea580c" }}
                            />
                            <Chip
                              size="small"
                              label={`${d.called} ${t("callDistribution.done", "done")}`}
                              sx={{ height: 22, fontSize: "0.7rem", fontWeight: 600, bgcolor: alpha("#16a34a", 0.1), color: "#16a34a" }}
                            />
                            <Chip
                              size="small"
                              label={`Conversions: ${d.conversions || 0}`}
                              sx={{ height: 22, fontSize: "0.7rem", fontWeight: 700, bgcolor: alpha(theme.palette.primary.main, 0.1), color: "primary.main" }}
                            />
                            <Chip
                              size="small"
                              label={`${pct}%`}
                              variant="outlined"
                              sx={{ height: 22, fontSize: "0.7rem", fontWeight: 700 }}
                            />
                          </Stack>
                        </CardContent>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>
            </Box>
          )}

          <Divider sx={{ my: 4 }} />

          {/* ── Bulk Assign ── */}
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              mb: 3,
              borderRadius: 3,
              border: `1px solid ${theme.palette.divider}`,
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "text.secondary", mb: 2, textTransform: "uppercase", letterSpacing: 0.5, fontSize: "0.7rem" }}>
              Bulk Assign by Priority
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel>{t("callDistribution.telecaller", "Telecaller")}</InputLabel>
                <Select label="Telecaller" value={bulkEmail} onChange={e => setBulkEmail(e.target.value as string)} sx={{ borderRadius: 2 }}>
                  {telecallers.map(t => (
                    <MenuItem key={t.email} value={t.email}>{t.name || t.email.split("@")[0]}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 130 }}>
                <InputLabel>{t("callDistribution.priority", "Priority")}</InputLabel>
                <Select label="Priority" value={bulkPriority} onChange={e => setBulkPriority(e.target.value as string)} sx={{ borderRadius: 2 }}>
                  <MenuItem value="High">🔴 High</MenuItem>
                  <MenuItem value="Medium">🟡 Medium</MenuItem>
                  <MenuItem value="Low">🟢 Low</MenuItem>
                </Select>
              </FormControl>
              <TextField
                size="small"
                type="number"
                label={t("callDistribution.count", "Count")}
                value={bulkCount}
                onChange={e => setBulkCount(Math.max(1, parseInt(e.target.value) || 1))}
                sx={{ width: 100, "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                inputProps={{ min: 1 }}
              />
              <Button
                variant="contained"
                disabled={!bulkEmail || bulkLoading}
                startIcon={bulkLoading ? <CircularProgress size={16} color="inherit" /> : <DistributeIcon />}
                onClick={handleBulk}
                sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600, px: 3 }}
              >
                {t("callDistribution.assign", "Assign")}
              </Button>
            </Stack>
          </Paper>

          {/* ── Transfer Pending Calls (Half-Day) ── */}
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              mb: 3,
              borderRadius: 3,
              border: `1px solid ${theme.palette.divider}`,
              bgcolor: alpha(theme.palette.info.main, 0.02),
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "info.main", mb: 2, textTransform: "uppercase", letterSpacing: 0.5, fontSize: "0.7rem" }}>
              Transfer Pending Calls (Half-Day / Absent)
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel>From (Half-Day Telecaller)</InputLabel>
                <Select label="From (Half-Day Telecaller)" value={transferFrom} onChange={e => setTransferFrom(e.target.value as string)} sx={{ borderRadius: 2 }}>
                  {telecallers.map(t => (
                    <MenuItem key={t.email} value={t.email}>{t.name || t.email.split("@")[0]}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Typography variant="body2" sx={{ color: "text.secondary", px: 1, display: { xs: "none", sm: "block" }, fontSize: 20 }}>
                →
              </Typography>
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel>To (Available Telecaller)</InputLabel>
                <Select label="To (Available Telecaller)" value={transferTo} onChange={e => setTransferTo(e.target.value as string)} sx={{ borderRadius: 2 }}>
                  {telecallers.map(t => (
                    <MenuItem key={t.email} value={t.email}>{t.name || t.email.split("@")[0]}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button
                variant="contained"
                color="info"
                disabled={!transferFrom || !transferTo || transferFrom === transferTo || transferLoading}
                startIcon={transferLoading ? <CircularProgress size={16} color="inherit" /> : <DistributeIcon />}
                onClick={handleTransfer}
                sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600, px: 3 }}
              >
                Transfer All
              </Button>
            </Stack>
          </Paper>

          {/* ── Individual Reassign ── */}
          {pendingAssignments.length > 0 && (
            <Paper
              elevation={0}
              sx={{
                p: 2.5,
                borderRadius: 3,
                border: `1px solid ${theme.palette.divider}`,
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "text.secondary", mb: 2, textTransform: "uppercase", letterSpacing: 0.5, fontSize: "0.7rem" }}>
                {t("callDistribution.reassignCalls", "Reassign Individual Calls")} ({pendingAssignments.length})
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, fontSize: "0.78rem" }}>{t("customers.title", "Sabhasad")}</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: "0.78rem" }}>{t("fields.village", "Village")}</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: "0.78rem" }}>{t("callDistribution.assignedTo", "Assigned To")}</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: "0.78rem" }}>{t("callDistribution.reassign", "Reassign")}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pendingAssignments
                      .slice(reassignPage * pageSize, (reassignPage + 1) * pageSize)
                      .map((a: any) => (
                        <TableRow key={a.assignment_id} hover>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.82rem" }}>
                              {a.name || "—"}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" color="text.secondary">
                              {a.village || "—"}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={a.user_email?.split("@")[0] || "—"}
                              variant="outlined"
                              sx={{ height: 22, fontSize: "0.7rem" }}
                            />
                          </TableCell>
                          <TableCell>
                            <FormControl size="small" sx={{ minWidth: 140 }}>
                              <InputLabel sx={{ fontSize: 12 }}>{t("callDistribution.moveTo", "Move to")}</InputLabel>
                              <Select
                                label="Move to"
                                value=""
                                onChange={e => handleReassign(a.assignment_id, e.target.value as string)}
                                sx={{ borderRadius: 2, fontSize: 12 }}
                              >
                                {telecallers
                                  .filter(t => t.email !== a.user_email)
                                  .map(t => (
                                    <MenuItem key={t.email} value={t.email} sx={{ fontSize: 13 }}>
                                      {t.name || t.email.split("@")[0]}
                                    </MenuItem>
                                  ))}
                              </Select>
                            </FormControl>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {pendingAssignments.length > pageSize && (
                <TablePagination
                  component="div"
                  count={pendingAssignments.length}
                  page={reassignPage}
                  rowsPerPage={pageSize}
                  onPageChange={(_, p) => setReassignPage(p)}
                  rowsPerPageOptions={[pageSize]}
                  sx={{ mt: 0.5 }}
                />
              )}
            </Paper>
          )}
        </>
      )}

      {/* ── Telecaller Profile Dialog ── */}
      <Dialog
        open={!!profileDialogEmail}
        onClose={() => setProfileDialogEmail(null)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, maxHeight: "90vh" } }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <Avatar sx={{ bgcolor: alpha(theme.palette.primary.main, 0.12), color: "primary.main", fontWeight: 700 }}>
                {profileDialogEmail?.charAt(0).toUpperCase()}
              </Avatar>
              <Box>
                <Typography variant="h6" fontWeight={700}>
                  {profileData?.name || profileDialogEmail?.split("@")[0]}
                </Typography>
                <Typography variant="caption" color="text.secondary">{profileDialogEmail}</Typography>
              </Box>
            </Stack>
            <IconButton onClick={() => setProfileDialogEmail(null)} size="small">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
        </DialogTitle>

        <Divider />

        <DialogContent sx={{ pt: 2 }}>
          {profileLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
              <CircularProgress />
            </Box>
          ) : profileData?.error ? (
            <Alert severity="error">{profileData.error}</Alert>
          ) : profileData ? (
            <>
              {/* ── Stat Cards ── */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                {[
                  { icon: <PhoneIcon />, label: "Total Assigned", value: profileData.stats.total_assigned, color: "#6366f1" },
                  { icon: <CheckCircleIcon />, label: "Calls Done", value: profileData.stats.total_called, color: "#16a34a" },
                  { icon: <TrendingUpIcon />, label: "Completion Rate", value: `${profileData.stats.completion_rate}%`, color: "#0891b2" },
                  { icon: <ShoppingCartIcon />, label: "Total Orders", value: profileData.stats.total_conversions, color: "#ea580c" },
                  { icon: <TrendingUpIcon />, label: "Conversion Rate", value: `${profileData.stats.conversion_rate}%`, color: "#7c3aed" },
                  { icon: <ShoppingCartIcon />, label: "Total Revenue", value: `₹${(profileData.stats.total_revenue || 0).toLocaleString("en-IN")}`, color: "#b45309" },
                ].map((s) => (
                  <Grid item xs={6} sm={4} key={s.label}>
                    <Paper elevation={0} sx={{ p: 2, borderRadius: 2.5, border: `1px solid ${theme.palette.divider}`, textAlign: "center" }}>
                      <Box sx={{ color: s.color, mb: 0.5 }}>{s.icon}</Box>
                      <Typography variant="h5" fontWeight={800} sx={{ color: s.color, lineHeight: 1.1 }}>{s.value}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>{s.label}</Typography>
                    </Paper>
                  </Grid>
                ))}
              </Grid>

              <Divider sx={{ mb: 2 }} />

              <Grid container spacing={3}>
                {/* ── Converted Mantris Table ── */}
                <Grid item xs={12} md={7}>
                  <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5, textTransform: "uppercase", fontSize: "0.72rem", letterSpacing: 0.5, color: "text.secondary" }}>
                    Orders Placed ({profileData.converted_mantris?.length || 0} total)
                  </Typography>

                  {profileData.converted_mantris?.length === 0 ? (
                    <Alert severity="info" sx={{ borderRadius: 2 }}>No orders converted yet for this telecaller.</Alert>
                  ) : (
                    <TableContainer sx={{ maxHeight: 320, borderRadius: 2, border: `1px solid ${theme.palette.divider}` }}>
                      <Table stickyHeader size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 700, fontSize: "0.72rem", bgcolor: isDark ? "background.paper" : "#f8fafc" }}>Mantri Name</TableCell>
                            <TableCell sx={{ fontWeight: 700, fontSize: "0.72rem", bgcolor: isDark ? "background.paper" : "#f8fafc" }}>Invoice</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.72rem", bgcolor: isDark ? "background.paper" : "#f8fafc" }}>Amount</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {profileData.converted_mantris.map((row: any, i: number) => (
                            <TableRow key={row.sale_id || i} hover sx={{ "&:last-child td": { border: 0 } }}>
                              <TableCell sx={{ fontWeight: 600, fontSize: "0.8rem" }}>{row.mantri_name}</TableCell>
                              <TableCell sx={{ fontSize: "0.78rem" }}>
                                <Chip label={row.invoice_no || "—"} size="small" sx={{ height: 20, fontSize: "0.68rem", fontWeight: 600 }} />
                              </TableCell>
                              <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.8rem", color: "success.main" }}>
                                ₹{(row.total_amount || 0).toLocaleString("en-IN")}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Grid>

                {/* ── Call Durations Table ── */}
                <Grid item xs={12} md={5}>
                  <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5, textTransform: "uppercase", fontSize: "0.72rem", letterSpacing: 0.5, color: "text.secondary" }}>
                    Recent Call Durations
                  </Typography>

                  {(!profileData.call_durations || profileData.call_durations.length === 0) ? (
                    <Alert severity="info" sx={{ borderRadius: 2 }}>No calls logged yet for this telecaller.</Alert>
                  ) : (
                    <TableContainer sx={{ maxHeight: 320, borderRadius: 2, border: `1px solid ${theme.palette.divider}` }}>
                      <Table stickyHeader size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 700, fontSize: "0.72rem", bgcolor: isDark ? "background.paper" : "#f8fafc" }}>Name</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.72rem", bgcolor: isDark ? "background.paper" : "#f8fafc" }}>Time Taken</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {profileData.call_durations.map((row: any, i: number) => {
                            let timeStr = "—";
                            if (row.time_taken != null) {
                              const mins = Math.floor(row.time_taken / 60);
                              const secs = row.time_taken % 60;
                              timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
                            }
                            return (
                              <TableRow key={i} hover sx={{ "&:last-child td": { border: 0 } }}>
                                <TableCell sx={{ fontWeight: 600, fontSize: "0.8rem" }}>{row.name}</TableCell>
                                <TableCell align="right" sx={{ fontSize: "0.78rem", color: row.time_taken != null ? "text.secondary" : "text.disabled", fontWeight: 600 }}>{timeStr}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Grid>
              </Grid>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Help Dialog */}
      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 800, pb: 1, display: "flex", alignItems: "center", gap: 1 }}>
          <HelpIcon color="primary" />
          How to Use Call Distribution
          <IconButton onClick={() => setHelpOpen(false)} sx={{ ml: "auto" }} size="small"><CloseIcon fontSize="small" /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 0 }}>
          <Stack spacing={2}>
            {[
              { title: "Distribute Now", desc: "Click \"Distribute Now\" to assign today's uncalled Sabhasads to all active telecallers. Do this once at the start of the day. It auto-runs at 10 AM if not done manually." },
              { title: "Re-distribute", desc: "Use \"Re-distribute\" to reshuffles all remaining pending calls across telecallers. This is useful if workloads become uneven mid-day." },
              { title: "Telecaller Cards", desc: "Each card shows progress: total assigned, calls done, completion %, and order conversions. Click a card to see the full performance profile." },
              { title: "Bulk Assign", desc: "Manually send a batch of calls (by priority level) to a specific telecaller using the Bulk Assign section." },
              { title: "Transfer Pending Calls", desc: "If a telecaller is on half-day or absent, use Transfer to move all their pending calls to another available telecaller instantly." },
              { title: "Individual Reassign", desc: "Scroll to the Reassign table to move any specific pending contact to a different telecaller using the Move To dropdown." },
              { title: "10 AM Countdown", desc: "The progress bar shows time remaining until 10 AM auto-distribution. Manual distribution before 10 AM prevents the auto-run." },
            ].map(item => (
              <Box key={item.title} sx={{ display: "flex", gap: 1.5 }}>
                <Box>
                  <Typography variant="body2" fontWeight={700}>{item.title}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>{item.desc}</Typography>
                </Box>
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setHelpOpen(false)} variant="contained" sx={{ borderRadius: 2, textTransform: "none", fontWeight: 700, boxShadow: "none" }}>Got it!</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
