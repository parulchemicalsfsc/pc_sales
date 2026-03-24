import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { PERMISSIONS } from "../config/permissions";
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Paper,
  Button,
  IconButton,
  Chip,
  Stack,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Snackbar,
  Tooltip,
  TablePagination,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
  LinearProgress,
  Grid,
  useTheme,
  alpha,
} from "@mui/material";
import {
  Phone as PhoneIcon,
  CheckCircle as CheckIcon,
  Refresh as RefreshIcon,
  Send as DistributeIcon,
  SwapHoriz as ReassignIcon,
  Timer as TimerIcon,
  Person as PersonIcon,
  Place as PlaceIcon,
  Assignment as AssignmentIcon,
  AdminPanelSettings as AdminIcon,
  PhoneDisabled as PhoneDisabledIcon,
  CallMissed as CallMissedIcon,
  ReportProblem as WrongIcon,
  Schedule as ScheduleIcon,
  Autorenew as AutorenewIcon,
  ShoppingCart as ShoppingCartIcon,
} from "@mui/icons-material";
import { automationAPI, customerAPI } from "../services/api";
import { useAuth } from "../contexts/AuthContext";

// ── Types ──────────────────────────────────────────────
interface Assignment {
  assignment_id: number;
  user_email: string;
  customer_id: number;
  priority: string;
  reason: string;
  status: string;
  notes: string;
  assigned_date: string;
  name: string;
  mobile: string;
  village: string;
  taluka?: string;
  district?: string;
}

interface Pagination { page: number; limit: number; total: number; total_pages: number; }
interface Summary { total: number; pending: number; called: number; }
interface Telecaller { email: string; name: string; role: string; }

// ── Constants ──────────────────────────────────────────
const CALL_OUTCOMES = [
  { value: "connected", label: "Connected", desc: "Spoke with the person", icon: <CheckIcon />, color: "#16a34a" },
  { value: "not_reachable", label: "Not Reachable", desc: "No answer / switched off", icon: <PhoneDisabledIcon />, color: "#dc2626" },
  { value: "callback", label: "Call Back Later", desc: "Asked to call again", icon: <CallMissedIcon />, color: "#ea580c" },
  { value: "wrong_number", label: "Wrong Number", desc: "Invalid contact", icon: <WrongIcon />, color: "#71717a" },
  { value: "take_order", label: "Take Order", desc: "Create a sale for this Sabhasad", icon: <ShoppingCartIcon />, color: "#3b82f6" },
];

const STATUS_CHIP: Record<string, { bg: string; fg: string }> = {
  Pending: { bg: "#eff6ff", fg: "#2563eb" },
  Called: { bg: "#f0fdf4", fg: "#16a34a" },
  "Not Reachable": { bg: "#fef2f2", fg: "#dc2626" },
  Callback: { bg: "#fff7ed", fg: "#ea580c" },
  "Wrong Number": { bg: "#f4f4f5", fg: "#71717a" },
};

const PRIORITY_DOT: Record<string, string> = { High: "#dc2626", Medium: "#eab308", Low: "#16a34a" };

// ── Live Timer Hook ────────────────────────────────────
function useCountdownTo10AM() {
  const [timeLeft, setTimeLeft] = useState("");
  const [progress, setProgress] = useState(0);
  const [isPast, setIsPast] = useState(false);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const target = new Date(now);
      target.setHours(10, 0, 0, 0);
      const midnight = new Date(now);
      midnight.setHours(0, 0, 0, 0);

      if (now >= target) {
        setIsPast(true);
        setTimeLeft("00:00:00");
        setProgress(100);
        return;
      }

      setIsPast(false);
      const diff = target.getTime() - now.getTime();
      const totalWindow = target.getTime() - midnight.getTime(); // 10 hours
      const elapsed = now.getTime() - midnight.getTime();
      setProgress(Math.min(100, (elapsed / totalWindow) * 100));

      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return { timeLeft, progress, isPast };
}

// ── Main Component ─────────────────────────────────────
export default function CallingList() {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const { role, hasPermission } = useAuth();
  const isAdmin = role === "admin" || role === "developer";
  const canDistribute = isAdmin || hasPermission?.(PERMISSIONS.RUN_CALL_DISTRIBUTION);
  const { timeLeft, progress, isPast } = useCountdownTo10AM();
  const navigate = useNavigate();

  const [tab, setTab] = useState(0);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, total_pages: 1 });
  const [summary, setSummary] = useState<Summary>({ total: 0, pending: 0, called: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; sev: "success" | "error" | "info" } | null>(null);

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<Assignment | null>(null);
  const [outcome, setOutcome] = useState("");
  const [notes, setNotes] = useState("");
  const [callbackDate, setCallbackDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  
  const [customerSummary, setCustomerSummary] = useState<any>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Admin
  const [distributing, setDistributing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [distStatus, setDistStatus] = useState<any>(null);
  const [telecallers, setTelecallers] = useState<Telecaller[]>([]);
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminData, setAdminData] = useState<any>(null);

  // Bulk
  const [bulkEmail, setBulkEmail] = useState("");
  const [bulkPriority, setBulkPriority] = useState("Medium");
  const [bulkCount, setBulkCount] = useState(10);
  const [bulkLoading, setBulkLoading] = useState(false);

  // ── Data ────────────────────────────────────────────────
  const load = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      const status = tab === 0 ? "Pending" : "completed";
      const res = await automationAPI.getMyAssignments({ status, page, limit: 20 });
      setAssignments(res.assignments || []);
      setPagination(res.pagination || { page: 1, limit: 20, total: 0, total_pages: 1 });
      setSummary(res.summary || { total: 0, pending: 0, called: 0 });
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { load(1); }, [load]);

  useEffect(() => {
    if (canDistribute) {
      automationAPI.getDistributionStatus().then(setDistStatus).catch(() => { });
      automationAPI.getTelecallers().then(r => setTelecallers(r.telecallers || [])).catch(() => { });
    }
  }, [canDistribute]);

  const loadAdmin = async () => {
    try {
      setAdminData((prev: any) => prev ? { ...prev, _loading: true } : { _loading: true });
      const res = await automationAPI.getAdminAssignments({ page: 1, limit: 500 });
      setAdminData(res);
    } catch (e: any) {
      console.error("Admin load failed:", e);
      setToast({ msg: "Failed to load admin data", sev: "error" });
      setAdminData(null);
    }
  };

  // ── Handlers ────────────────────────────────────────────
  const handleCall = (a: Assignment) => {
    if (a.mobile) window.open(`tel:${a.mobile}`, "_self");
    setTimeout(() => { 
      setActiveItem(a); 
      setOutcome(""); 
      setNotes(""); 
      setCallbackDate(""); 
      setDialogOpen(true);
      
      // Fetch customer summary
      setCustomerSummary(null);
      setSummaryLoading(true);
      customerAPI.getSummary(a.customer_id)
        .then(setCustomerSummary)
        .catch(() => console.error("Summary load fail"))
        .finally(() => setSummaryLoading(false));
        
    }, 400);
  };

  const submitOutcome = async () => {
    if (!activeItem || !outcome) return;
    if (outcome === "take_order") {
      return handleTakeOrder();
    }
    if (outcome === "callback" && !callbackDate) {
      setToast({ msg: "Please select a date for the callback.", sev: "error" });
      return;
    }
    try {
      setSubmitting(true);
      await automationAPI.updateCallStatus(activeItem.assignment_id, outcome, notes, outcome === "callback" ? callbackDate : undefined);
      setToast({ msg: "Call logged successfully", sev: "success" });
      setDialogOpen(false);
      load(pagination.page);
    } catch (e: any) {
      setToast({ msg: e?.response?.data?.detail || "Failed", sev: "error" });
    } finally { setSubmitting(false); }
  };

  const handleTakeOrder = async () => {
    if (!activeItem) return;
    try {
      setSubmitting(true);
      // Auto-log as connected first
      await automationAPI.updateCallStatus(activeItem.assignment_id, "connected", notes || "Initiated Take Order");
      setDialogOpen(false);
      
      // Navigate to Sales passing customerId
      navigate("/sales", { state: { openNewSale: true, customerId: activeItem.customer_id } });
    } catch (e: any) {
      setToast({ msg: e?.response?.data?.detail || "Failed to log call before taking order.", sev: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDistribute = async () => {
    if (!window.confirm("Distribute today's calls to all telecallers?")) return;
    try {
      setDistributing(true);
      const res = await automationAPI.adminDistribute();
      setToast({ msg: res.status === "skipped" ? "Already distributed" : `${res.total_calls} calls distributed`, sev: res.status === "skipped" ? "info" : "success" });
      load(1);
      automationAPI.getDistributionStatus().then(setDistStatus);
    } catch (e: any) { setToast({ msg: e?.response?.data?.detail || "Failed", sev: "error" }); }
    finally { setDistributing(false); }
  };

  const handleRefresh = async () => {
    if (!window.confirm("Re-distribute all uncalled assignments? Pending calls will be reassigned.")) return;
    try {
      setRefreshing(true);
      const res = await automationAPI.refreshDistribution();
      setToast({ msg: res.message || "Refreshed", sev: "success" });
      load(1);
      if (showAdmin) loadAdmin();
    } catch (e: any) { setToast({ msg: e?.response?.data?.detail || "Refresh failed", sev: "error" }); }
    finally { setRefreshing(false); }
  };

  const handleReassign = async (id: number, email: string) => {
    try {
      await automationAPI.adminReassign(id, email);
      setToast({ msg: "Reassigned", sev: "success" });
      if (adminData) loadAdmin();
    } catch (e: any) { setToast({ msg: e?.response?.data?.detail || "Failed", sev: "error" }); }
  };

  const handleBulk = async () => {
    try {
      setBulkLoading(true);
      const res = await automationAPI.bulkReassign(bulkEmail, bulkPriority, bulkCount);
      setToast({ msg: res.message, sev: "success" });
      loadAdmin();
    } catch (e: any) { setToast({ msg: e?.response?.data?.detail || "Failed", sev: "error" }); }
    finally { setBulkLoading(false); }
  };

  // ── Styles ──────────────────────────────────────────────
  const surface = isDark ? "#1e1e2e" : "#ffffff";
  const surfaceMuted = isDark ? "#262637" : "#f8fafc";
  const border = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  return (
    <Box sx={{ maxWidth: 1100, mx: "auto" }}>
      {/* ── Header ── */}
      <Box sx={{ mb: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: -0.5 }}>
              Calling List
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.25 }}>
              {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" })}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            {canDistribute && (
              <>
                <Button
                  variant={showAdmin ? "contained" : "outlined"}
                  size="small"
                  color="secondary"
                  startIcon={<AdminIcon />}
                  onClick={() => { setShowAdmin(!showAdmin); if (!showAdmin) loadAdmin(); }}
                  sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600, fontSize: 13 }}
                >
                  Admin
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={refreshing ? <CircularProgress size={14} /> : <AutorenewIcon />}
                  onClick={handleRefresh}
                  disabled={refreshing}
                  sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600, fontSize: 13 }}
                >
                  Refresh List
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={distributing ? <CircularProgress size={14} color="inherit" /> : <DistributeIcon />}
                  onClick={handleDistribute}
                  disabled={distributing || distStatus?.distributed}
                  sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600, fontSize: 13 }}
                >
                  {distStatus?.distributed ? "Distributed" : "Distribute"}
                </Button>
              </>
            )}
            <IconButton size="small" onClick={() => load(1)} disabled={loading} sx={{ border: `1px solid ${border}`, borderRadius: 2 }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Stack>

        {/* ── Timer Bar ── */}
        {canDistribute && !isPast && (
          <Paper
            sx={{
              p: 1.5,
              px: 2.5,
              borderRadius: 2.5,
              border: `1px solid ${border}`,
              bgcolor: surfaceMuted,
              display: "flex",
              alignItems: "center",
              gap: 2,
              mt: 1.5,
            }}
          >
            <ScheduleIcon sx={{ color: "#2563eb", fontSize: 20 }} />
            <Box sx={{ flex: 1 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>
                  Auto-distribution at 10:00 AM
                </Typography>
                <Typography variant="caption" sx={{ fontFamily: "monospace", fontWeight: 700, color: "#2563eb", fontSize: 13 }}>
                  {timeLeft}
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={progress}
                sx={{
                  height: 4,
                  borderRadius: 2,
                  bgcolor: alpha("#2563eb", 0.1),
                  "& .MuiLinearProgress-bar": { bgcolor: "#2563eb", borderRadius: 2 },
                }}
              />
            </Box>
          </Paper>
        )}
      </Box>

      {/* ── Stats ── */}
      <Stack direction="row" spacing={2} sx={{ mb: 2.5 }}>
        {([
          { label: "Total", value: summary.total, color: "#2563eb", icon: <AssignmentIcon sx={{ fontSize: 18 }} /> },
          { label: "Pending", value: summary.pending, color: "#ea580c", icon: <PhoneIcon sx={{ fontSize: 18 }} /> },
          { label: "Completed", value: summary.called, color: "#16a34a", icon: <CheckIcon sx={{ fontSize: 18 }} /> },
        ] as const).map(s => (
          <Paper
            key={s.label}
            sx={{
              flex: 1,
              p: 2,
              borderRadius: 2.5,
              border: `1px solid ${border}`,
              bgcolor: surface,
              display: "flex",
              alignItems: "center",
              gap: 1.5,
            }}
          >
            <Box sx={{ width: 34, height: 34, borderRadius: 2, bgcolor: alpha(s.color, 0.1), color: s.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {s.icon}
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 500, lineHeight: 1 }}>{s.label}</Typography>
              <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>{s.value}</Typography>
            </Box>
          </Paper>
        ))}
      </Stack>

      {/* ── Tabs + List ── */}
      <Paper sx={{ borderRadius: 3, border: `1px solid ${border}`, bgcolor: surface, overflow: "hidden" }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{
            px: 2,
            pt: 1,
            "& .MuiTab-root": { textTransform: "none", fontWeight: 600, fontSize: 14, minHeight: 42 },
            "& .MuiTabs-indicator": { height: 3, borderRadius: 2 },
          }}
        >
          <Tab label={`To Call  ·  ${summary.pending}`} />
          <Tab label={`Called  ·  ${summary.called}`} />
        </Tabs>

        <Box sx={{ p: 2 }}>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}><CircularProgress size={28} /></Box>
          ) : error ? (
            <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>
          ) : assignments.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 8 }}>
              <Typography variant="h6" sx={{ color: "text.disabled", fontWeight: 600 }}>
                {tab === 0 ? "No pending calls" : "No completed calls yet"}
              </Typography>
              <Typography variant="body2" sx={{ color: "text.disabled", mt: 0.5 }}>
                {tab === 0 ? "Distribution may not have happened yet, or all calls are complete." : "Start calling from the To Call tab."}
              </Typography>
            </Box>
          ) : (
            <>
              <Stack spacing={1}>
                {assignments.map(item => {
                  const chip = STATUS_CHIP[item.status] || STATUS_CHIP.Pending;
                  const dotColor = PRIORITY_DOT[item.priority] || "#eab308";
                  return (
                    <Box
                      key={item.assignment_id}
                      sx={{
                        p: 2,
                        borderRadius: 2,
                        border: `1px solid ${border}`,
                        bgcolor: surfaceMuted,
                        display: "flex",
                        alignItems: "center",
                        gap: 2,
                        transition: "border-color 0.15s, box-shadow 0.15s",
                        "&:hover": { borderColor: alpha("#2563eb", 0.3), boxShadow: `0 0 0 1px ${alpha("#2563eb", 0.08)}` },
                      }}
                    >
                      {/* Priority dot */}
                      <Tooltip title={`${item.priority} Priority`}>
                        <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: dotColor, flexShrink: 0 }} />
                      </Tooltip>

                      {/* Info */}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.name || "Unknown"}
                        </Typography>
                        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 0.25 }}>
                          {item.mobile && (
                            <Typography variant="caption" sx={{ color: "text.secondary", display: "flex", alignItems: "center", gap: 0.3 }}>
                              <PhoneIcon sx={{ fontSize: 12 }} /> {item.mobile}
                            </Typography>
                          )}
                          {item.village && (
                            <Typography variant="caption" sx={{ color: "text.secondary", display: "flex", alignItems: "center", gap: 0.3 }}>
                              <PlaceIcon sx={{ fontSize: 12 }} /> {item.village}
                            </Typography>
                          )}
                        </Stack>
                        {item.status !== "Pending" && item.notes && (
                          <Typography variant="caption" sx={{ color: "text.disabled", fontStyle: "italic", mt: 0.5, display: "block" }}>
                            {item.notes}
                          </Typography>
                        )}
                      </Box>

                      {/* Status / Action */}
                      {item.status !== "Pending" ? (
                        <Chip size="small" label={item.status} sx={{ bgcolor: chip.bg, color: chip.fg, fontWeight: 600, fontSize: 11, height: 24 }} />
                      ) : (
                        <Tooltip title={item.mobile ? `Call ${item.mobile}` : "No number"}>
                          <span>
                            <Button
                              variant="contained"
                              size="small"
                              disabled={!item.mobile}
                              onClick={() => handleCall(item)}
                              startIcon={<PhoneIcon sx={{ fontSize: 16 }} />}
                              sx={{
                                borderRadius: 2,
                                textTransform: "none",
                                fontWeight: 700,
                                fontSize: 12,
                                px: 2,
                                boxShadow: "none",
                                bgcolor: "#16a34a",
                                "&:hover": { bgcolor: "#15803d", boxShadow: "none" },
                              }}
                            >
                              Call
                            </Button>
                          </span>
                        </Tooltip>
                      )}
                    </Box>
                  );
                })}
              </Stack>
              <TablePagination
                component="div"
                count={pagination.total}
                page={pagination.page - 1}
                rowsPerPage={pagination.limit}
                onPageChange={(_, p) => load(p + 1)}
                rowsPerPageOptions={[20]}
                sx={{ borderTop: `1px solid ${border}`, mt: 1 }}
              />
            </>
          )}
        </Box>
      </Paper>

      {/* ── Admin Panel ── */}
      {canDistribute && showAdmin && (
        <Paper sx={{ mt: 3, p: 3, borderRadius: 3, border: `1px solid ${border}`, bgcolor: surface }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
            <AdminIcon sx={{ color: "#7c3aed" }} /> Admin Controls
          </Typography>

          {/* Telecaller summary cards */}
          {adminData?.telecaller_summary && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", mb: 1, display: "block" }}>
                TELECALLER DISTRIBUTION
              </Typography>
              <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", gap: 1.5 }}>
                {Object.entries(adminData.telecaller_summary as Record<string, any>).map(([email, d]: [string, any]) => (
                  <Paper key={email} sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${border}`, bgcolor: surfaceMuted, minWidth: 180 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, display: "block", mb: 0.5, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {email.split("@")[0]}
                    </Typography>
                    <Stack direction="row" spacing={0.5}>
                      <Chip size="small" label={d.total} sx={{ height: 20, fontSize: 11 }} />
                      <Chip size="small" label={`${d.pending} pending`} sx={{ height: 20, fontSize: 11, bgcolor: "#fff7ed", color: "#ea580c" }} />
                      <Chip size="small" label={`${d.called} done`} sx={{ height: 20, fontSize: 11, bgcolor: "#f0fdf4", color: "#16a34a" }} />
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </Box>
          )}

          {/* Bulk assign */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", mb: 1, display: "block" }}>
              BULK ASSIGN BY PRIORITY
            </Typography>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: "wrap" }}>
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>Telecaller</InputLabel>
                <Select label="Telecaller" value={bulkEmail} onChange={e => setBulkEmail(e.target.value as string)} sx={{ borderRadius: 2, fontSize: 13 }}>
                  {telecallers.map(t => <MenuItem key={t.email} value={t.email}>{t.name || t.email}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 110 }}>
                <InputLabel>Priority</InputLabel>
                <Select label="Priority" value={bulkPriority} onChange={e => setBulkPriority(e.target.value as string)} sx={{ borderRadius: 2, fontSize: 13 }}>
                  <MenuItem value="High">🔴 High</MenuItem>
                  <MenuItem value="Medium">🟡 Medium</MenuItem>
                  <MenuItem value="Low">🟢 Low</MenuItem>
                </Select>
              </FormControl>
              <TextField size="small" type="number" label="Count" value={bulkCount} onChange={e => setBulkCount(Math.max(1, parseInt(e.target.value) || 1))} sx={{ width: 80, "& .MuiOutlinedInput-root": { borderRadius: 2 } }} inputProps={{ min: 1 }} />
              <Button
                variant="contained"
                size="small"
                disabled={!bulkEmail || bulkLoading}
                startIcon={bulkLoading ? <CircularProgress size={14} color="inherit" /> : <DistributeIcon />}
                onClick={handleBulk}
                sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600, fontSize: 13 }}
              >
                Assign
              </Button>
            </Stack>
          </Box>

          {/* Individual reassign */}
          {adminData?.assignments && (() => {
            const pending = adminData.assignments.filter((a: any) => a.status === "Pending");
            const pageSize = 12;
            const pg = adminData._pg || 0;
            return pending.length > 0 ? (
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", mb: 1, display: "block" }}>
                  REASSIGN INDIVIDUAL CALLS ({pending.length})
                </Typography>
                <Stack spacing={0.75}>
                  {pending.slice(pg * pageSize, (pg + 1) * pageSize).map((a: any) => (
                    <Stack
                      key={a.assignment_id}
                      direction="row"
                      alignItems="center"
                      spacing={1.5}
                      sx={{ p: 1, px: 1.5, borderRadius: 2, border: `1px solid ${border}`, bgcolor: surfaceMuted }}
                    >
                      <Typography variant="body2" sx={{ flex: 1, fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {a.name || "—"} <Typography component="span" variant="caption" sx={{ color: "text.secondary" }}>· {a.village || ""}</Typography>
                      </Typography>
                      <Chip size="small" label={a.user_email.split("@")[0]} variant="outlined" sx={{ height: 22, fontSize: 11 }} />
                      <FormControl size="small" sx={{ minWidth: 140 }}>
                        <InputLabel sx={{ fontSize: 12 }}>Move to</InputLabel>
                        <Select
                          label="Move to"
                          value=""
                          onChange={e => handleReassign(a.assignment_id, e.target.value as string)}
                          sx={{ borderRadius: 2, fontSize: 12 }}
                        >
                          {telecallers.filter(t => t.email !== a.user_email).map(t => (
                            <MenuItem key={t.email} value={t.email} sx={{ fontSize: 13 }}>{t.name || t.email}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Stack>
                  ))}
                </Stack>
                {pending.length > pageSize && (
                  <TablePagination
                    component="div"
                    count={pending.length}
                    page={pg}
                    rowsPerPage={pageSize}
                    onPageChange={(_, p) => setAdminData({ ...adminData, _pg: p })}
                    rowsPerPageOptions={[pageSize]}
                    sx={{ mt: 0.5 }}
                  />
                )}
              </Box>
            ) : null;
          })()}
        </Paper>
      )}

      {/* ── Post-Call Dialog ── */}
      <Dialog open={dialogOpen} onClose={() => !submitting && setDialogOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3, p: 0.5 } }}>
        <DialogTitle sx={{ fontWeight: 800, fontSize: 18, pb: 0 }}>
          Log Call Outcome
          {activeItem && (
            <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 400 }}>
              {activeItem.name} · {activeItem.mobile}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {/* ── Customer Summary Box ── */}
          <Box sx={{ p: 1.5, mb: 2, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, 0.04), border: `1px solid ${border}` }}>
            {summaryLoading ? (
              <Stack direction="row" spacing={2} alignItems="center" justifyContent="center" sx={{ height: 60 }}>
                <CircularProgress size={20} />
                <Typography variant="body2" color="text.secondary">Fetching history...</Typography>
              </Stack>
            ) : customerSummary ? (
              <Grid container spacing={1.5}>
                <Grid item xs={6}>
                  <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>Sabhasad Since</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{customerSummary.joined_date ? new Date(customerSummary.joined_date).toLocaleDateString() : "—"}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>Sales History</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{customerSummary.sales_count} (₹{(customerSummary.total_sales || 0).toLocaleString()})</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>Total Paid</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: "success.main" }}>₹{(customerSummary.total_paid || 0).toLocaleString()}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>Total Pending</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: "error.main" }}>₹{(customerSummary.total_pending || 0).toLocaleString()}</Typography>
                </Grid>
              </Grid>
            ) : (
              <Typography variant="caption" color="text.secondary">No summary available</Typography>
            )}
          </Box>

          <Stack spacing={1} sx={{ mb: 2.5 }}>
            {CALL_OUTCOMES.map(o => (
              <Box
                key={o.value}
                onClick={() => setOutcome(o.value)}
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  cursor: "pointer",
                  border: `2px solid ${outcome === o.value ? o.color : border}`,
                  bgcolor: outcome === o.value ? alpha(o.color, 0.06) : "transparent",
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  transition: "all 0.12s",
                  "&:hover": { borderColor: alpha(o.color, 0.5), bgcolor: alpha(o.color, 0.03) },
                }}
              >
                <Box sx={{ color: o.color }}>{o.icon}</Box>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: outcome === o.value ? 700 : 500 }}>{o.label}</Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>{o.desc}</Typography>
                </Box>
              </Box>
            ))}
          </Stack>
          <TextField
            label="Notes"
            multiline
            rows={2}
            fullWidth
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Optional details..."
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
          />
          {outcome === "callback" && (
            <TextField
              type="date"
              label="Callback Date"
              fullWidth
              required
              value={callbackDate}
              onChange={e => setCallbackDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              inputProps={{ min: new Date().toISOString().split("T")[0] }}
              sx={{ mt: 2, "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            />
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, justifyContent: "space-between" }}>
          <Button onClick={() => setDialogOpen(false)} disabled={submitting} sx={{ borderRadius: 2, textTransform: "none" }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={submitOutcome}
            disabled={!outcome || submitting || (outcome === "callback" && !callbackDate)}
            startIcon={submitting ? <CircularProgress size={14} color="inherit" /> : <CheckIcon />}
            sx={{ borderRadius: 2, textTransform: "none", fontWeight: 700, boxShadow: "none" }}
          >
            {submitting ? "Saving…" : "Submit"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Toast */}
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity={toast?.sev || "info"} onClose={() => setToast(null)} sx={{ borderRadius: 2, fontWeight: 500 }}>{toast?.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
