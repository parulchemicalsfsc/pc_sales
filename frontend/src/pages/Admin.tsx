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
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  InputAdornment,
  Avatar,
  Tab,
  Tabs,
  Button,
  Stack,
  Paper,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  LinearProgress,
  Divider,
  useTheme,
  alpha,
} from "@mui/material";
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  History as HistoryIcon,
  AdminPanelSettings as AdminIcon,
  Send as DistributeIcon,
  Autorenew as AutorenewIcon,
  Timer as TimerIcon,
  PhoneInTalk as PhoneIcon,
  Person as PersonIcon,
  SwapHoriz as ReassignIcon,
  Assessment as StatsIcon,
} from "@mui/icons-material";
import { TableSkeleton } from "../components/Skeletons";
import { useAuth } from "../contexts/AuthContext";
import { PERMISSIONS } from "../config/permissions";
import { automationAPI } from "../services/api";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "https://pc-sales-8phu.onrender.com";

// ── Types ──────────────────────────────────────────────────
interface ActivityLog {
  id: number;
  user_email: string;
  user_name?: string;
  action_type: string;
  action_description: string;
  entity_type?: string;
  entity_id?: number;
  entity_name?: string;
  metadata?: any;
  created_at: string;
}

interface Telecaller {
  email: string;
  name: string;
  role: string;
}

const actionTypeColors: Record<string, "success" | "info" | "error" | "warning" | "default"> = {
  CREATE: "success",
  UPDATE: "info",
  DELETE: "error",
  IMPORT: "warning",
  EXPORT: "info",
  LOGIN: "default",
  LOGOUT: "default",
  VIEW: "default",
};

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
// CALL DISTRIBUTION TAB
// ══════════════════════════════════════════════════════════════
function CallDistributionTab() {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const { timeLeft, progress, isPast } = useCountdownTo10AM();

  const [distributing, setDistributing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [distStatus, setDistStatus] = useState<any>(null);
  const [telecallers, setTelecallers] = useState<Telecaller[]>([]);
  const [adminData, setAdminData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; sev: "success" | "error" } | null>(null);

  // Bulk state
  const [bulkEmail, setBulkEmail] = useState("");
  const [bulkPriority, setBulkPriority] = useState("Medium");
  const [bulkCount, setBulkCount] = useState(10);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Pagination for individual reassign
  const [reassignPage, setReassignPage] = useState(0);
  const pageSize = 10;

  // ── Load Data ──
  const loadData = async () => {
    try {
      setLoading(true);
      const [status, tcRes, adminRes] = await Promise.all([
        automationAPI.getDistributionStatus().catch(() => null),
        automationAPI.getTelecallers().catch(() => ({ telecallers: [] })),
        automationAPI.getAdminAssignments({ page: 1, limit: 500 }).catch(() => null),
      ]);
      setDistStatus(status);
      setTelecallers(tcRes.telecallers || []);
      setAdminData(adminRes);
    } catch (e) {
      console.error("Load failed:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // ── Handlers ──
  const handleDistribute = async () => {
    if (!window.confirm("Run today's call distribution? This will assign uncalled customers to telecallers.")) return;
    try {
      setDistributing(true);
      const res = await automationAPI.adminDistribute();
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

  const pendingAssignments = useMemo(() =>
    (adminData?.assignments || []).filter((a: any) => a.status === "Pending"),
    [adminData]
  );

  const telecallerSummary = adminData?.telecaller_summary
    ? Object.entries(adminData.telecaller_summary as Record<string, any>)
    : [];

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Toast */}
      {toast && (
        <Alert severity={toast.sev} sx={{ mb: 2 }} onClose={() => setToast(null)}>
          {toast.msg}
        </Alert>
      )}

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
              <DistributeIcon color="primary" /> Distribution Controls
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {distStatus?.distributed
                ? `✅ Today's calls distributed (${distStatus.total_assigned || 0} assigned)`
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
              {distStatus?.distributed ? "Already Distributed" : "Distribute Now"}
            </Button>
            <Button
              variant="outlined"
              startIcon={refreshing ? <CircularProgress size={16} /> : <AutorenewIcon />}
              onClick={handleRefresh}
              disabled={refreshing}
              sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600 }}
            >
              Re-distribute
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

      {/* ── Telecaller Summary Cards ── */}
      {telecallerSummary.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "text.secondary", mb: 1.5, textTransform: "uppercase", letterSpacing: 0.5, fontSize: "0.7rem" }}>
            Telecaller Distribution
          </Typography>
          <Grid container spacing={2}>
            {telecallerSummary.map(([email, d]: [string, any]) => {
              const pct = d.total > 0 ? Math.round((d.called / d.total) * 100) : 0;
              return (
                <Grid item xs={12} sm={6} md={4} key={email}>
                  <Card
                    variant="outlined"
                    sx={{
                      borderRadius: 3,
                      transition: "all 0.2s",
                      "&:hover": { boxShadow: theme.shadows[4], transform: "translateY(-2px)" },
                    }}
                  >
                    <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
                      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
                        <Avatar sx={{ width: 36, height: 36, bgcolor: alpha(theme.palette.primary.main, 0.1), color: "primary.main", fontSize: 14, fontWeight: 700 }}>
                          {email.charAt(0).toUpperCase()}
                        </Avatar>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {email.split("@")[0]}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {d.total} total calls
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

                      <Stack direction="row" spacing={1} justifyContent="space-between">
                        <Chip
                          size="small"
                          label={`${d.pending} pending`}
                          sx={{ height: 22, fontSize: "0.7rem", fontWeight: 600, bgcolor: alpha("#ea580c", 0.1), color: "#ea580c" }}
                        />
                        <Chip
                          size="small"
                          label={`${d.called} done`}
                          sx={{ height: 22, fontSize: "0.7rem", fontWeight: 600, bgcolor: alpha("#16a34a", 0.1), color: "#16a34a" }}
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
            <InputLabel>Telecaller</InputLabel>
            <Select label="Telecaller" value={bulkEmail} onChange={e => setBulkEmail(e.target.value as string)} sx={{ borderRadius: 2 }}>
              {telecallers.map(t => (
                <MenuItem key={t.email} value={t.email}>{t.name || t.email.split("@")[0]}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>Priority</InputLabel>
            <Select label="Priority" value={bulkPriority} onChange={e => setBulkPriority(e.target.value as string)} sx={{ borderRadius: 2 }}>
              <MenuItem value="High">🔴 High</MenuItem>
              <MenuItem value="Medium">🟡 Medium</MenuItem>
              <MenuItem value="Low">🟢 Low</MenuItem>
            </Select>
          </FormControl>
          <TextField
            size="small"
            type="number"
            label="Count"
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
            Assign
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
            Reassign Individual Calls ({pendingAssignments.length})
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, fontSize: "0.78rem" }}>Sabhasad</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: "0.78rem" }}>Village</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: "0.78rem" }}>Assigned To</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: "0.78rem" }}>Reassign</TableCell>
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
                          <InputLabel sx={{ fontSize: 12 }}>Move to</InputLabel>
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
    </Box>
  );
}

// ══════════════════════════════════════════════════════════════
// ACTIVITY LOGS TAB
// ══════════════════════════════════════════════════════════════
function ActivityLogsTab() {
  const { user, hasPermission } = useAuth();
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterUserEmail, setFilterUserEmail] = useState("");
  const [filterActionType, setFilterActionType] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [total, setTotal] = useState(0);

  const loadActivities = async () => {
    if (!user || !hasPermission(PERMISSIONS.VIEW_ACTIVITY_LOGS)) return;
    try {
      setLoading(true);
      setError(null);
      const params: any = { limit: rowsPerPage, offset: page * rowsPerPage };
      if (filterUserEmail) params.user_email = filterUserEmail;
      if (filterActionType) params.action_type = filterActionType;

      const response = await axios.get(`${API_BASE_URL}/api/admin/activity-logs`, {
        params,
        headers: { "x-user-email": user.email },
      });
      setActivities(response.data.data || []);
      setTotal(response.data.total || 0);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to load activity logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && hasPermission(PERMISSIONS.VIEW_ACTIVITY_LOGS)) {
      loadActivities();
    }
  }, [user, page, rowsPerPage, filterUserEmail, filterActionType]);

  const formatDate = (dateString: string) => {
    const utcDate = dateString.endsWith("Z") ? new Date(dateString) : new Date(dateString + "Z");
    return utcDate.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
    });
  };

  const filteredActivities = activities.filter(activity => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return activity.user_email?.toLowerCase().includes(s) ||
      activity.action_description?.toLowerCase().includes(s) ||
      activity.entity_name?.toLowerCase().includes(s);
  });

  const uniqueUsers = Array.from(new Set(activities.map(a => a.user_email).filter(Boolean)));
  const uniqueActionTypes = Array.from(new Set(activities.map(a => a.action_type).filter(Boolean)));

  if (!user || !hasPermission(PERMISSIONS.VIEW_ACTIVITY_LOGS)) {
    return <Alert severity="error">Access denied. You need activity log permissions.</Alert>;
  }

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Recent Activity ({total} total)
          </Typography>
          <Tooltip title="Refresh">
            <IconButton onClick={loadActivities} color="primary" disabled={loading}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

        {/* Filters */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} md={4}>
            <TextField fullWidth label="Search" variant="outlined" size="small" value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField fullWidth label="Filter by User" variant="outlined" size="small" select
              value={filterUserEmail} onChange={e => setFilterUserEmail(e.target.value)}>
              <MenuItem value="">All Users</MenuItem>
              {uniqueUsers.map(email => <MenuItem key={email} value={email}>{email}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField fullWidth label="Filter by Action Type" variant="outlined" size="small" select
              value={filterActionType} onChange={e => setFilterActionType(e.target.value)}>
              <MenuItem value="">All Actions</MenuItem>
              {uniqueActionTypes.map(type => <MenuItem key={type} value={type}>{type}</MenuItem>)}
            </TextField>
          </Grid>
        </Grid>

        {loading ? (
          <TableSkeleton rows={10} columns={5} />
        ) : (
          <>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>User</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Action</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Entity</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Date & Time</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredActivities.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">No activities found</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredActivities.map(activity => (
                      <TableRow key={activity.id} hover>
                        <TableCell>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Avatar sx={{ width: 28, height: 28, bgcolor: "primary.main", fontSize: "0.75rem" }}>
                              {activity.user_email?.charAt(0).toUpperCase()}
                            </Avatar>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {activity.user_email}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip size="small" label={activity.action_type}
                            color={actionTypeColors[activity.action_type] || "default"} variant="outlined" />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{activity.action_description}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            {activity.entity_name || activity.entity_type || "-"}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            {formatDate(activity.created_at)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              rowsPerPageOptions={[10, 25, 50, 100]}
              component="div"
              count={total}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN ADMIN PAGE
// ══════════════════════════════════════════════════════════════
export default function AdminPage() {
  const { user, hasPermission, role } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();
  const [tab, setTab] = useState(0);

  const isAdmin = role === "admin" || role === "developer";
  const canDistribute = isAdmin || hasPermission(PERMISSIONS.RUN_CALL_DISTRIBUTION);
  const canViewLogs = hasPermission(PERMISSIONS.VIEW_ACTIVITY_LOGS);

  useEffect(() => {
    if (user && !canDistribute && !canViewLogs) {
      navigate("/dashboard");
    }
  }, [user, canDistribute, canViewLogs, navigate]);

  if (!user || (!canDistribute && !canViewLogs)) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <Alert severity="error">Access denied. You need admin permissions.</Alert>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: { xs: 2, md: 3 } }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5, display: "flex", alignItems: "center", gap: 1 }}>
          <AdminIcon color="primary" /> Admin Panel
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Manage call distribution and view system activity
        </Typography>
      </Box>

      {/* Tabs */}
      <Paper
        elevation={0}
        sx={{
          mb: 3,
          borderRadius: 3,
          border: `1px solid ${theme.palette.divider}`,
          overflow: "hidden",
        }}
      >
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="fullWidth"
          sx={{
            "& .MuiTab-root": {
              textTransform: "none",
              fontWeight: 600,
              fontSize: "0.9rem",
              py: 1.5,
            },
          }}
        >
          {canDistribute && (
            <Tab
              icon={<PhoneIcon sx={{ fontSize: 20 }} />}
              iconPosition="start"
              label="Call Distribution"
            />
          )}
          {canViewLogs && (
            <Tab
              icon={<HistoryIcon sx={{ fontSize: 20 }} />}
              iconPosition="start"
              label="Activity Logs"
            />
          )}
        </Tabs>
      </Paper>

      {/* Tab Content */}
      {canDistribute && tab === 0 && <CallDistributionTab />}
      {canViewLogs && ((canDistribute && tab === 1) || (!canDistribute && tab === 0)) && <ActivityLogsTab />}
    </Box>
  );
}
