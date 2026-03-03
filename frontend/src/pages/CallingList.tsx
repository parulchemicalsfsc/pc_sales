import { useEffect, useState, useCallback } from "react";
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
  useTheme,
  alpha,
} from "@mui/material";
import {
  Phone as PhoneIcon,
  PhoneCallback as PhoneCallbackIcon,
  PersonOff as PersonOffIcon,
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
  Refresh as RefreshIcon,
  Send as DistributeIcon,
  SwapHoriz as ReassignIcon,
  Timer as TimerIcon,
  Person as PersonIcon,
  Place as PlaceIcon,
  Assignment as AssignmentIcon,
  AdminPanelSettings as AdminIcon,
} from "@mui/icons-material";
import { automationAPI } from "../services/api";
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

interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

interface Summary {
  total: number;
  pending: number;
  called: number;
}

interface Telecaller {
  email: string;
  name: string;
  role: string;
}

// ── Outcome Options ────────────────────────────────────
const CALL_OUTCOMES = [
  { value: "connected", label: "✅ Connected — Spoke with the person", color: "#2e7d32" },
  { value: "not_reachable", label: "📵 Not Reachable — No answer / switched off", color: "#d32f2f" },
  { value: "callback", label: "🔄 Call Back Later — Asked to call again", color: "#ed6c02" },
  { value: "wrong_number", label: "❌ Wrong Number — Invalid contact", color: "#9e9e9e" },
];

const STATUS_COLORS: Record<string, string> = {
  Pending: "#1976d2",
  Called: "#2e7d32",
  "Not Reachable": "#d32f2f",
  Callback: "#ed6c02",
  "Wrong Number": "#9e9e9e",
};

// ── Main Component ─────────────────────────────────────
export default function CallingList() {
  const theme = useTheme();
  const { user, role } = useAuth();
  const isAdmin = role === "admin" || role === "developer" || role === "Admin" || role === "Developer";

  // Tab: 0 = To Call, 1 = Called
  const [tab, setTab] = useState(0);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, total_pages: 1 });
  const [summary, setSummary] = useState<Summary>({ total: 0, pending: 0, called: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; severity: "success" | "error" | "info" } | null>(null);

  // Call dialog
  const [callDialogOpen, setCallDialogOpen] = useState(false);
  const [activeAssignment, setActiveAssignment] = useState<Assignment | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<string>("");
  const [callNotes, setCallNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Admin
  const [distributing, setDistributing] = useState(false);
  const [distributionStatus, setDistributionStatus] = useState<any>(null);
  const [telecallers, setTelecallers] = useState<Telecaller[]>([]);
  const [adminTab, setAdminTab] = useState(false);
  const [adminAssignments, setAdminAssignments] = useState<any>(null);

  // ── Load Assignments ───────────────────────────────────
  const loadAssignments = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      const status = tab === 0 ? "Pending" : undefined;
      const res = await automationAPI.getMyAssignments({ status, page, limit: 20 });
      setAssignments(res.assignments || []);
      setPagination(res.pagination || { page: 1, limit: 20, total: 0, total_pages: 1 });
      setSummary(res.summary || { total: 0, pending: 0, called: 0 });
    } catch (e: any) {
      setError(e?.message || "Failed to load assignments");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    loadAssignments(1);
  }, [loadAssignments]);

  // ── Load Admin Data ────────────────────────────────────
  useEffect(() => {
    if (isAdmin) {
      automationAPI.getDistributionStatus()
        .then(setDistributionStatus)
        .catch(() => { });
      automationAPI.getTelecallers()
        .then(res => setTelecallers(res.telecallers || []))
        .catch(() => { });
    }
  }, [isAdmin]);

  const loadAdminAssignments = async () => {
    try {
      const res = await automationAPI.getAdminAssignments({ page: 1, limit: 200 });
      setAdminAssignments(res);
    } catch (e: any) {
      setToast({ msg: "Failed to load admin data", severity: "error" });
    }
  };

  // ── Call Flow ──────────────────────────────────────────
  const handleCallClick = (assignment: Assignment) => {
    // Open phone dialer
    if (assignment.mobile) {
      window.open(`tel:${assignment.mobile}`, "_self");
    }
    // Open dialog after a short delay
    setTimeout(() => {
      setActiveAssignment(assignment);
      setSelectedOutcome("");
      setCallNotes("");
      setCallDialogOpen(true);
    }, 500);
  };

  const handleSubmitCallStatus = async () => {
    if (!activeAssignment || !selectedOutcome) return;
    try {
      setSubmitting(true);
      await automationAPI.updateCallStatus(activeAssignment.assignment_id, selectedOutcome, callNotes);
      setToast({ msg: "Call status recorded successfully", severity: "success" });
      setCallDialogOpen(false);
      loadAssignments(pagination.page);
    } catch (e: any) {
      setToast({ msg: e?.response?.data?.detail || "Failed to update status", severity: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Distribution ─────────────────────────────────────
  const handleDistribute = async () => {
    if (!window.confirm("Distribute calls to all telecallers now?")) return;
    try {
      setDistributing(true);
      const res = await automationAPI.adminDistribute();
      if (res.status === "skipped") {
        setToast({ msg: "Already distributed for today", severity: "info" });
      } else {
        setToast({ msg: `Distributed ${res.total_calls} calls to ${res.telecaller_count} telecallers`, severity: "success" });
      }
      loadAssignments(1);
      automationAPI.getDistributionStatus().then(setDistributionStatus).catch(() => { });
    } catch (e: any) {
      setToast({ msg: e?.response?.data?.detail || "Distribution failed", severity: "error" });
    } finally {
      setDistributing(false);
    }
  };

  // ── Reassign ───────────────────────────────────────────
  const handleReassign = async (assignmentId: number, newEmail: string) => {
    try {
      await automationAPI.adminReassign(assignmentId, newEmail);
      setToast({ msg: "Reassigned successfully", severity: "success" });
      if (adminAssignments) loadAdminAssignments();
    } catch (e: any) {
      setToast({ msg: e?.response?.data?.detail || "Reassign failed", severity: "error" });
    }
  };

  const calledList = tab === 1
    ? assignments.filter(a => a.status !== "Pending")
    : assignments;

  // ── Render ─────────────────────────────────────────────
  return (
    <Box>
      {/* Header */}
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 1 }}>
            <PhoneIcon color="primary" /> My Calling List
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5}>
          {isAdmin && (
            <>
              <Button
                variant={adminTab ? "contained" : "outlined"}
                color="secondary"
                startIcon={<AdminIcon />}
                onClick={() => { setAdminTab(!adminTab); if (!adminTab) loadAdminAssignments(); }}
                size="small"
              >
                Admin Panel
              </Button>
              <Button
                variant="outlined"
                color="primary"
                startIcon={distributing ? <CircularProgress size={16} /> : <DistributeIcon />}
                onClick={handleDistribute}
                disabled={distributing || distributionStatus?.distributed}
                size="small"
              >
                {distributionStatus?.distributed ? "✅ Distributed" : "Distribute Calls"}
              </Button>
            </>
          )}
          <Button variant="contained" startIcon={<RefreshIcon />} onClick={() => loadAssignments(1)} disabled={loading} size="small">
            Refresh
          </Button>
        </Stack>
      </Stack>

      {/* Stats Cards */}
      <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: "wrap" }}>
        {[
          { label: "Total", value: summary.total, color: "#1976d2", icon: <AssignmentIcon /> },
          { label: "Pending", value: summary.pending, color: "#d32f2f", icon: <PhoneIcon /> },
          { label: "Completed", value: summary.called, color: "#2e7d32", icon: <CheckIcon /> },
        ].map(s => (
          <Paper
            key={s.label}
            sx={{
              p: 2,
              borderRadius: 2,
              border: `1px solid ${alpha(s.color, 0.3)}`,
              bgcolor: alpha(s.color, 0.05),
              minWidth: 140,
              display: "flex",
              alignItems: "center",
              gap: 1.5,
            }}
          >
            <Box sx={{ width: 36, height: 36, borderRadius: 1.5, bgcolor: s.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {s.icon}
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: s.color, fontWeight: 600 }}>{s.label}</Typography>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>{s.value}</Typography>
            </Box>
          </Paper>
        ))}

        {/* Timer for admin */}
        {isAdmin && distributionStatus && !distributionStatus.distributed && !distributionStatus.past_deadline && (
          <Paper sx={{ p: 2, borderRadius: 2, border: `1px solid ${alpha("#ed6c02", 0.3)}`, bgcolor: alpha("#ed6c02", 0.05), minWidth: 180, display: "flex", alignItems: "center", gap: 1.5 }}>
            <Box sx={{ width: 36, height: 36, borderRadius: 1.5, bgcolor: "#ed6c02", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <TimerIcon />
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: "#ed6c02", fontWeight: 600 }}>Auto-distribute in</Typography>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>{distributionStatus.minutes_until_deadline} min</Typography>
            </Box>
          </Paper>
        )}
      </Stack>

      {/* Tabs */}
      <Paper sx={{ borderRadius: 2, mb: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Tab label={`📞 To Call (${summary.pending})`} />
          <Tab label={`✅ Called (${summary.called})`} />
        </Tabs>

        {/* Content */}
        <Box sx={{ p: 2 }}>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
              <CircularProgress />
            </Box>
          ) : error ? (
            <Alert severity="error">{error}</Alert>
          ) : calledList.length === 0 ? (
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              {tab === 0
                ? "No pending calls. Either all calls are complete or distribution hasn't happened yet."
                : "No completed calls yet. Start calling from the 'To Call' tab!"}
            </Alert>
          ) : (
            <>
              <Stack spacing={1.5}>
                {calledList.map((item) => {
                  const statusColor = STATUS_COLORS[item.status] || "#1976d2";
                  return (
                    <Paper
                      key={item.assignment_id}
                      variant="outlined"
                      sx={{
                        p: 2,
                        borderRadius: 2,
                        borderColor: alpha(statusColor, 0.3),
                        transition: "all 0.2s",
                        "&:hover": { borderColor: statusColor, bgcolor: alpha(statusColor, 0.02) },
                      }}
                    >
                      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                            <PersonIcon sx={{ fontSize: 18, color: statusColor }} />
                            <Typography variant="subtitle1" sx={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {item.name || "Unknown"}
                            </Typography>
                            <Chip size="small" label={item.priority} sx={{ bgcolor: alpha(statusColor, 0.1), color: statusColor, height: 22 }} />
                          </Stack>
                          <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
                            {item.mobile && (
                              <Stack direction="row" alignItems="center" spacing={0.5}>
                                <PhoneIcon sx={{ fontSize: 14, color: "text.secondary" }} />
                                <Typography variant="body2" color="text.secondary">{item.mobile}</Typography>
                              </Stack>
                            )}
                            {item.village && (
                              <Stack direction="row" alignItems="center" spacing={0.5}>
                                <PlaceIcon sx={{ fontSize: 14, color: "text.secondary" }} />
                                <Typography variant="body2" color="text.secondary">{item.village}</Typography>
                              </Stack>
                            )}
                            {item.reason && (
                              <Typography variant="body2" color="text.secondary">• {item.reason}</Typography>
                            )}
                          </Stack>
                          {item.status !== "Pending" && item.notes && (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block", fontStyle: "italic" }}>
                              Notes: {item.notes}
                            </Typography>
                          )}
                        </Box>

                        <Stack alignItems="flex-end" spacing={0.5}>
                          {item.status !== "Pending" && (
                            <Chip size="small" label={item.status} sx={{ bgcolor: alpha(statusColor, 0.15), color: statusColor, fontWeight: 600 }} />
                          )}
                          {item.status === "Pending" && (
                            <Tooltip title={item.mobile ? `Call ${item.mobile}` : "No phone number"}>
                              <span>
                                <IconButton
                                  color="success"
                                  disabled={!item.mobile}
                                  onClick={() => handleCallClick(item)}
                                  sx={{
                                    bgcolor: alpha("#2e7d32", 0.1),
                                    "&:hover": { bgcolor: alpha("#2e7d32", 0.2) },
                                    width: 44,
                                    height: 44,
                                  }}
                                >
                                  <PhoneIcon />
                                </IconButton>
                              </span>
                            </Tooltip>
                          )}
                        </Stack>
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>

              {/* Pagination */}
              <TablePagination
                component="div"
                count={pagination.total}
                page={pagination.page - 1}
                rowsPerPage={pagination.limit}
                onPageChange={(_, p) => loadAssignments(p + 1)}
                rowsPerPageOptions={[20]}
              />
            </>
          )}
        </Box>
      </Paper>

      {/* ── Admin Panel ── */}
      {isAdmin && adminTab && (
        <Paper sx={{ p: 3, borderRadius: 3, mb: 3, border: `2px solid ${alpha(theme.palette.secondary.main, 0.3)}` }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
            <AdminIcon color="secondary" /> Admin — Assignment Overview
          </Typography>

          {adminAssignments?.telecaller_summary && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Telecaller Distribution</Typography>
              <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
                {Object.entries(adminAssignments.telecaller_summary as Record<string, any>).map(([email, data]: [string, any]) => (
                  <Paper key={email} variant="outlined" sx={{ p: 1.5, borderRadius: 2, minWidth: 200 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{email}</Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                      <Chip size="small" label={`Total: ${data.total}`} />
                      <Chip size="small" label={`Pending: ${data.pending}`} color="warning" />
                      <Chip size="small" label={`Done: ${data.called}`} color="success" />
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </Box>
          )}

          {adminAssignments?.assignments && adminAssignments.assignments.length > 0 && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Reassign Calls</Typography>
              <Stack spacing={1}>
                {adminAssignments.assignments.filter((a: any) => a.status === "Pending").slice(0, 20).map((a: any) => (
                  <Stack key={a.assignment_id} direction="row" alignItems="center" spacing={2} sx={{ p: 1, borderRadius: 1, bgcolor: alpha(theme.palette.background.default, 0.5) }}>
                    <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }}>
                      {a.name || "Unknown"} — {a.village || ""}
                    </Typography>
                    <Chip size="small" label={a.user_email} variant="outlined" />
                    <ReassignIcon sx={{ fontSize: 18, color: "text.secondary" }} />
                    <FormControl size="small" sx={{ minWidth: 160 }}>
                      <InputLabel>Reassign to</InputLabel>
                      <Select
                        label="Reassign to"
                        value=""
                        onChange={(e) => handleReassign(a.assignment_id, e.target.value as string)}
                      >
                        {telecallers.filter(t => t.email !== a.user_email).map(t => (
                          <MenuItem key={t.email} value={t.email}>{t.name || t.email}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}
        </Paper>
      )}

      {/* ── Post-Call Dialog ── */}
      <Dialog
        open={callDialogOpen}
        onClose={() => !submitting && setCallDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          How did the call go?
          {activeAssignment && (
            <Typography variant="body2" color="text.secondary">
              {activeAssignment.name} • {activeAssignment.mobile}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
            Select call outcome
          </Typography>
          <Stack spacing={1} sx={{ mb: 3 }}>
            {CALL_OUTCOMES.map(o => (
              <Paper
                key={o.value}
                variant="outlined"
                onClick={() => setSelectedOutcome(o.value)}
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  cursor: "pointer",
                  borderColor: selectedOutcome === o.value ? o.color : alpha("#000", 0.12),
                  borderWidth: selectedOutcome === o.value ? 2 : 1,
                  bgcolor: selectedOutcome === o.value ? alpha(o.color, 0.08) : "transparent",
                  "&:hover": { borderColor: o.color, bgcolor: alpha(o.color, 0.04) },
                  transition: "all 0.15s",
                }}
              >
                <Typography variant="body1" sx={{ fontWeight: selectedOutcome === o.value ? 700 : 400 }}>
                  {o.label}
                </Typography>
              </Paper>
            ))}
          </Stack>

          <TextField
            label="Notes (optional)"
            multiline
            rows={3}
            fullWidth
            value={callNotes}
            onChange={(e) => setCallNotes(e.target.value)}
            placeholder="Any additional details about the call..."
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCallDialogOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmitCallStatus}
            disabled={!selectedOutcome || submitting}
            startIcon={submitting ? <CircularProgress size={16} /> : <CheckIcon />}
            sx={{ borderRadius: 2 }}
          >
            {submitting ? "Saving..." : "Submit"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Toast */}
      <Snackbar
        open={!!toast}
        autoHideDuration={5000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={toast?.severity || "info"} onClose={() => setToast(null)} sx={{ borderRadius: 2 }}>
          {toast?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
