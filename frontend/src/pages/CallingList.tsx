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
  Divider,
  LinearProgress as MuiLinearProgress,
  Grid,
  useTheme,
  alpha,
  useMediaQuery,
  Avatar,
} from "@mui/material";
import {
  Phone as PhoneIcon,
  CheckCircle as CheckIcon,
  Refresh as RefreshIcon,
  ReportProblem as WrongIcon,
  ShoppingCart as ShoppingCartIcon,
  Assignment as AssignmentIcon,
  Place as PlaceIcon,
  PhoneDisabled as PhoneDisabledIcon,
  CallMissed as CallMissedIcon,
  Close as CloseIcon,
  CalendarMonth as CalendarIcon,
  Receipt as ReceiptIcon,
  AccountBalanceWallet as WalletIcon,
  TrendingUp as TrendingUpIcon,
  LocationOn as LocationIcon,
} from "@mui/icons-material";
import { automationAPI, customerAPI } from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import { useTranslation } from "../hooks/useTranslation";

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
  priority_label?: string;
  priority_score?: number;
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

// Priority colour map based on priority_label from backend
const PRIORITY_COLORS: Record<string, { bg: string; bgDark: string; border: string; fg: string }> = {
  URGENT: { bg: "rgba(22,163,74,0.08)",  bgDark: "rgba(22,163,74,0.15)",  border: "#16a34a", fg: "#16a34a" },
  HIGH:   { bg: "rgba(22,163,74,0.06)",  bgDark: "rgba(22,163,74,0.12)",  border: "#22c55e", fg: "#16a34a" },
  MEDIUM: { bg: "rgba(234,179,8,0.08)",  bgDark: "rgba(234,179,8,0.15)",  border: "#eab308", fg: "#a16207" },
  LOW:    { bg: "rgba(220,38,38,0.06)",  bgDark: "rgba(220,38,38,0.12)",  border: "#dc2626", fg: "#dc2626" },
};

// ── Live Timer Hook ────────────────────────────────────


// ── Main Component ─────────────────────────────────────
export default function CallingList() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isDark = theme.palette.mode === "dark";
  const { role, hasPermission } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [tab, setTab] = useState(0);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, total_pages: 1 });
  const [summary, setSummary] = useState<Summary>({ total: 0, pending: 0, called: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; sev: "success" | "error" | "info" } | null>(null);

  // History Dialog
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItem, setHistoryItem] = useState<Assignment | null>(null);
  const [customerSummary, setCustomerSummary] = useState<any>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Call Outcome Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<Assignment | null>(null);
  const [outcome, setOutcome] = useState("");
  const [notes, setNotes] = useState("");
  const [callbackDate, setCallbackDate] = useState("");
  const [submitting, setSubmitting] = useState(false);



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



  // ── Handlers ────────────────────────────────────────────
  const openHistoryDialog = (a: Assignment) => {
    setHistoryItem(a);
    setHistoryOpen(true);
    setCustomerSummary(null);
    setSummaryLoading(true);
    customerAPI.getSummary(a.customer_id)
      .then(setCustomerSummary)
      .catch(() => console.error("Summary load fail"))
      .finally(() => setSummaryLoading(false));
  };

  const handleCallButton = (e: React.MouseEvent, a: Assignment) => {
    e.stopPropagation();
    if (a.mobile) window.open(`tel:${a.mobile}`, "_self");
    setTimeout(() => {
      setActiveItem(a);
      setOutcome("");
      setNotes("");
      setCallbackDate("");
      setDialogOpen(true);
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



  // ── Styles ──────────────────────────────────────────────
  const surface = isDark ? "#1e1e2e" : "#ffffff";
  const surfaceMuted = isDark ? "#262637" : "#f8fafc";
  const border = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  return (
    <Box sx={{ width: "100%", maxWidth: "none", mx: 0 }}>
      {/* ── Header ── */}
      <Box sx={{ mb: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: -0.5 }}>
              {t("callingList.title", "Calling List")}
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.25 }}>
              {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" })}
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => load(1)} disabled={loading} sx={{ border: `1px solid ${border}`, borderRadius: 2 }}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Stack>


      </Box>

      {/* ── Stats ── */}
      <Stack direction="row" spacing={2} sx={{ mb: 2.5 }}>
        {([
          { label: t("callingList.total", "Total"), value: summary.total, color: "#2563eb", icon: <AssignmentIcon sx={{ fontSize: 18 }} /> },
          { label: t("callingList.pending", "Pending"), value: summary.pending, color: "#ea580c", icon: <PhoneIcon sx={{ fontSize: 18 }} /> },
          { label: t("callingList.completed", "Completed"), value: summary.called, color: "#16a34a", icon: <CheckIcon sx={{ fontSize: 18 }} /> },
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
      <Paper sx={{ borderRadius: 3, border: `1px solid ${border}`, bgcolor: surface, overflow: "hidden", width: "100%" }}>
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
          <Tab label={`${t("callingList.toCall", "To Call")}  ·  ${summary.pending}`} />
          <Tab label={`${t("callingList.called", "Called")}  ·  ${summary.called}`} />
        </Tabs>

        <Box sx={{ p: 2, width: "100%", overflowX: "auto" }}>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}><CircularProgress size={28} /></Box>
          ) : error ? (
            <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>
          ) : assignments.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 8 }}>
              <Typography variant="h6" sx={{ color: "text.disabled", fontWeight: 600 }}>
                {tab === 0 ? t("callingList.noPendingCalls", "No pending calls") : t("callingList.noCompletedCalls", "No completed calls yet")}
              </Typography>
              <Typography variant="body2" sx={{ color: "text.disabled", mt: 0.5 }}>
                {tab === 0 ? t("callingList.distributionInfo", "Distribution may not have happened yet, or all calls are complete.") : t("callingList.startCalling", "Start calling from the To Call tab.")}
              </Typography>
            </Box>
          ) : (
            <>
              <Stack spacing={1} sx={{ minWidth: 0 }}>
                {assignments.map(item => {
                  const chip = STATUS_CHIP[item.status] || STATUS_CHIP.Pending;
                  const dotColor = PRIORITY_DOT[item.priority] || "#eab308";
                  const pLabel = (item.priority_label || "LOW").toUpperCase();
                  const pColor = PRIORITY_COLORS[pLabel] || PRIORITY_COLORS.LOW;
                  return (
                    <Box
                      key={item.assignment_id}
                      onClick={() => openHistoryDialog(item)}
                      sx={{
                        p: 2,
                        borderRadius: 2,
                        cursor: "pointer",
                        border: `1px solid ${border}`,
                        borderLeft: `4px solid ${pColor.border}`,
                        bgcolor: isDark ? pColor.bgDark : pColor.bg,
                        display: "flex",
                        alignItems: "center",
                        gap: 2,
                        transition: "border-color 0.15s, box-shadow 0.15s",
                        "&:hover": { borderColor: alpha("#2563eb", 0.3), boxShadow: `0 0 0 1px ${alpha("#2563eb", 0.08)}` },
                      }}
                    >
                      {/* Priority dot */}
                      <Tooltip title={`${pLabel} Priority`}>
                        <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: pColor.border, flexShrink: 0 }} />
                      </Tooltip>

                      {/* Info */}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="subtitle2" sx={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {item.name || "Unknown"}
                          </Typography>
                          {/* Priority Badge */}
                          <Chip
                            size="small"
                            label={pLabel}
                            sx={{
                              height: 20,
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: 0.5,
                              bgcolor: alpha(pColor.border, 0.12),
                              color: pColor.fg,
                              border: `1px solid ${alpha(pColor.border, 0.3)}`,
                            }}
                          />
                        </Stack>
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
                              onClick={(e) => handleCallButton(e, item)}
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



      {/* ── Customer History Dialog ── */}
      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} maxWidth="xs" fullWidth fullScreen={isMobile} PaperProps={{ sx: { borderRadius: isMobile ? 0 : 4, overflow: "hidden" } }}>
        {/* Gradient Header */}
        <Box sx={{ background: "linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)", color: "#fff", px: 3, pt: 3, pb: 2.5, position: "relative" }}>
          <IconButton onClick={() => setHistoryOpen(false)} sx={{ position: "absolute", top: 8, right: 8, color: "rgba(255,255,255,.7)", "&:hover": { color: "#fff" } }}>
            <CloseIcon fontSize="small" />
          </IconButton>
          <Stack direction="row" spacing={2} alignItems="center">
            <Avatar sx={{ width: 48, height: 48, bgcolor: "rgba(255,255,255,.15)", fontSize: 20, fontWeight: 700 }}>
              {(historyItem?.name || "?")[0].toUpperCase()}
            </Avatar>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>{historyItem?.name || "Unknown"}</Typography>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 0.5 }}>
                {historyItem?.mobile && (
                  <Typography variant="caption" sx={{ opacity: .85, display: "flex", alignItems: "center", gap: 0.3 }}>
                    <PhoneIcon sx={{ fontSize: 13 }} /> {historyItem.mobile}
                  </Typography>
                )}
                {historyItem?.village && (
                  <Typography variant="caption" sx={{ opacity: .85, display: "flex", alignItems: "center", gap: 0.3 }}>
                    <LocationIcon sx={{ fontSize: 13 }} /> {historyItem.village}
                  </Typography>
                )}
              </Stack>
            </Box>
          </Stack>
        </Box>
        <DialogContent sx={{ pt: 2.5, pb: 3 }}>
          {summaryLoading ? (
            <Stack spacing={2} alignItems="center" sx={{ py: 4 }}>
              <CircularProgress size={28} />
              <Typography variant="body2" color="text.secondary">Loading customer history...</Typography>
            </Stack>
          ) : customerSummary ? (
            <Stack spacing={2.5}>
              {/* ── Stat Cards ── */}
              <Grid container spacing={1.5}>
                <Grid item xs={6}>
                  <Box sx={{ p: 1.5, borderRadius: 2.5, bgcolor: alpha("#2563eb", 0.06), border: `1px solid ${alpha("#2563eb", 0.12)}` }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                      <CalendarIcon sx={{ fontSize: 16, color: "#2563eb" }} />
                      <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 500 }}>Sabhasad Since</Typography>
                    </Stack>
                    <Typography variant="body1" sx={{ fontWeight: 700 }}>
                      {customerSummary.joined_date ? new Date(customerSummary.joined_date).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "—"}
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={6}>
                  <Box sx={{ p: 1.5, borderRadius: 2.5, bgcolor: alpha("#7c3aed", 0.06), border: `1px solid ${alpha("#7c3aed", 0.12)}` }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                      <ReceiptIcon sx={{ fontSize: 16, color: "#7c3aed" }} />
                      <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 500 }}>Total Orders</Typography>
                    </Stack>
                    <Typography variant="body1" sx={{ fontWeight: 700 }}>
                      {customerSummary.sales_count}
                      <Typography component="span" variant="caption" sx={{ ml: 0.5, color: "text.secondary" }}>
                        (₹{(customerSummary.total_sales || 0).toLocaleString("en-IN")})
                      </Typography>
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={6}>
                  <Box sx={{ p: 1.5, borderRadius: 2.5, bgcolor: alpha("#16a34a", 0.06), border: `1px solid ${alpha("#16a34a", 0.12)}` }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                      <WalletIcon sx={{ fontSize: 16, color: "#16a34a" }} />
                      <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 500 }}>Paid</Typography>
                    </Stack>
                    <Typography variant="body1" sx={{ fontWeight: 700, color: "#16a34a" }}>₹{(customerSummary.total_paid || 0).toLocaleString("en-IN")}</Typography>
                  </Box>
                </Grid>
                <Grid item xs={6}>
                  <Box sx={{ p: 1.5, borderRadius: 2.5, bgcolor: alpha("#dc2626", 0.06), border: `1px solid ${alpha("#dc2626", 0.12)}` }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                      <TrendingUpIcon sx={{ fontSize: 16, color: "#dc2626" }} />
                      <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 500 }}>Pending</Typography>
                    </Stack>
                    <Typography variant="body1" sx={{ fontWeight: 700, color: "#dc2626" }}>₹{(customerSummary.total_pending || 0).toLocaleString("en-IN")}</Typography>
                  </Box>
                </Grid>
              </Grid>

              {/* ── Payment Progress Bar ── */}
              {customerSummary.total_sales > 0 && (() => {
                const paidPct = Math.round((customerSummary.total_paid / customerSummary.total_sales) * 100);
                return (
                  <Box>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                      <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>Payment Progress</Typography>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: paidPct >= 100 ? "#16a34a" : "#ea580c" }}>{paidPct}%</Typography>
                    </Stack>
                    <MuiLinearProgress
                      variant="determinate"
                      value={Math.min(paidPct, 100)}
                      sx={{
                        height: 8,
                        borderRadius: 4,
                        bgcolor: alpha("#e5e7eb", 0.5),
                        "& .MuiLinearProgress-bar": {
                          borderRadius: 4,
                          background: paidPct >= 100 ? "linear-gradient(90deg, #16a34a, #22c55e)" : "linear-gradient(90deg, #2563eb, #60a5fa)",
                        },
                      }}
                    />
                  </Box>
                );
              })()}
            </Stack>
          ) : (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <Typography variant="body2" color="text.secondary">No history available for this Sabhasad.</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setHistoryOpen(false)} sx={{ borderRadius: 2, textTransform: "none" }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ── Post-Call Dialog ── */}
      <Dialog open={dialogOpen} onClose={() => !submitting && setDialogOpen(false)} maxWidth="xs" fullWidth fullScreen={isMobile} PaperProps={{ sx: { borderRadius: isMobile ? 0 : 3, p: 0.5 } }}>
        <DialogTitle sx={{ fontWeight: 800, fontSize: 18, pb: 0 }}>
          Log Call Outcome
          {activeItem && (
            <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 400 }}>
              {activeItem.name} · {activeItem.mobile}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>

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
