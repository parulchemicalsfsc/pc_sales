import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Autocomplete,
  Checkbox,
  InputAdornment,
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
  Calculate as CalculateIcon,
  HelpOutline as HelpIcon,
  Search as SearchIcon,
} from "@mui/icons-material";
import { automationAPI, customerAPI, distributorAPI, telecallerOrderAPI, productAPI } from "../services/api";
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
  last_call?: {
    call_outcome: string;
    notes: string;
    created_at: string;
  };
}

interface Pagination { page: number; limit: number; total: number; total_pages: number; }
interface Summary { total?: number; to_call: number; called: number; callbacks?: number; confirmation_calls?: number; }
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
  URGENT: { bg: "rgba(22,163,74,0.08)", bgDark: "rgba(22,163,74,0.15)", border: "#16a34a", fg: "#16a34a" },
  HIGH: { bg: "rgba(22,163,74,0.06)", bgDark: "rgba(22,163,74,0.12)", border: "#22c55e", fg: "#16a34a" },
  MEDIUM: { bg: "rgba(234,179,8,0.08)", bgDark: "rgba(234,179,8,0.15)", border: "#eab308", fg: "#a16207" },
  LOW: { bg: "rgba(220,38,38,0.06)", bgDark: "rgba(220,38,38,0.12)", border: "#dc2626", fg: "#dc2626" },
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

  const [helpOpen, setHelpOpen] = useState(false);
  const [tab, setTab] = useState(0);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [searchParams] = useSearchParams();
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, total_pages: 1 });
    const [summary, setSummary] = useState<Summary>({ to_call: 0, called: 0 });
  const [callbacks, setCallbacks] = useState<any[]>([]);
  const [confirmationOrders, setConfirmationOrders] = useState<any[]>([]);
  const [tab3Loading, setTab3Loading] = useState(false);
  const [processingOrder, setProcessingOrder] = useState<number | null>(null);
  
  const [orderDate, setOrderDate] = useState("");
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

  // Estimation Calculator Dialog
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcLoading, setCalcLoading] = useState(false);
  const [mantris, setMantris] = useState<any[]>([]);
  const [selectedMantriId, setSelectedMantriId] = useState<string>("");
  const [approxLiter, setApproxLiter] = useState<number>(5);

  // Quick Call Search & Queue
  const [qcSearch, setQcSearch] = useState("");
  const [qcResults, setQcResults] = useState<any[]>([]);
  const [qcSearching, setQcSearching] = useState(false);
  const [qcSelectedIds, setQcSelectedIds] = useState<Set<number>>(new Set());
  const [qcQueue, setQcQueue] = useState<any[]>([]);
  const [qcCurrentIndex, setQcCurrentIndex] = useState(0);
  const [qcDialogOpen, setQcDialogOpen] = useState(false);
  const isQuickCall = qcDialogOpen && qcQueue.length > 0;



  // ── Data ────────────────────────────────────────────────
  const load = useCallback(async (page = 1) => {
    if (tab === 2 || tab === 3) return;
    try {
      setLoading(true);
      setError(null);
      const status = tab === 0 ? "Pending" : "completed";
      const res = await automationAPI.getMyAssignments({ status, page, limit: 20 });
      setAssignments(res.assignments || []);
      setPagination(res.pagination || { page: 1, limit: 20, total: 0, total_pages: 1 });
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [tab]);
  const fetchSummary = useCallback(async () => {
    try {
      const s = await automationAPI.getCallingSummary();
      setSummary(s);
    } catch (e) {
      console.error("Failed to fetch summary");
    }
  }, []);

  useEffect(() => {
    fetchSummary();
    const interval = setInterval(fetchSummary, 30000);
    return () => clearInterval(interval);
  }, [fetchSummary]);

  const loadCallbacks = useCallback(async () => {
    try {
      const res = await automationAPI.getMyCallbacks();
      setCallbacks(res);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadConfirmationOrders = useCallback(async () => {
    try {
      setTab3Loading(true);
      const res = await telecallerOrderAPI.getMyConfirmationCalls();
      setConfirmationOrders(res);
    } catch (e) {
      console.error(e);
    } finally {
      setTab3Loading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 2 && role === "telecaller") loadCallbacks();
    if (tab === 3 && role === "telecaller") loadConfirmationOrders();
  }, [tab, role, loadCallbacks, loadConfirmationOrders]);

  useEffect(() => {
    if (tab !== 3 || role !== "telecaller") return;
    const interval = setInterval(loadConfirmationOrders, 30000);
    return () => clearInterval(interval);
  }, [tab, role, loadConfirmationOrders]);
  
  const handleApproveOrder = async (orderId: number) => {
    try {
      setProcessingOrder(orderId);
      await telecallerOrderAPI.approve(orderId);
      setToast({ msg: "Order Approved", sev: "success" });
      loadConfirmationOrders();
      fetchSummary();
    } catch (e: any) {
      setToast({ msg: e?.response?.data?.detail || "Failed to approve", sev: "error" });
    } finally {
      setProcessingOrder(null);
    }
  };

  const handleRejectOrder = async (orderId: number) => {
    try {
      setProcessingOrder(orderId);
      await telecallerOrderAPI.reject(orderId, "Rejected from Calling List");
      setToast({ msg: "Order Rejected", sev: "success" });
      loadConfirmationOrders();
      fetchSummary();
    } catch (e: any) {
      setToast({ msg: e?.response?.data?.detail || "Failed to reject", sev: "error" });
    } finally {
      setProcessingOrder(null);
    }
  };

  useEffect(() => { load(1); }, [load]);

  // Auto-open call dialog if ?open=<assignment_id> is in the URL (from notification deep-link)
  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId || assignments.length === 0) return;
    const target = assignments.find(a => String(a.assignment_id) === openId);
    if (target && !dialogOpen) {
      setActiveItem(target);
      setOutcome("");
      setNotes("");
      setCallbackDate("");
      setDialogOpen(true);
    }
  }, [searchParams, assignments]);

  // Quick Call Search Debounce
  useEffect(() => {
    if (qcSearch.trim().length === 0) {
      setQcResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setQcSearching(true);
      try {
        let res;
        if (role === "sales_manager") {
          res = await distributorAPI.search(qcSearch);
        } else {
          res = await customerAPI.search(qcSearch);
        }
        setQcResults(res?.data || []);
      } catch (err) {
        console.error("QC Search error:", err);
      } finally {
        setQcSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [qcSearch, role]);



  // ── Handlers ────────────────────────────────────────────
  const openCalculator = async () => {
    setCalcOpen(true);
    if (mantris.length === 0) {
      setCalcLoading(true);
      try {
        const data = await distributorAPI.getForCalculator();
        setMantris(data || []);
      } catch (err) {
        setToast({ msg: "Failed to load mantris", sev: "error" });
      } finally {
        setCalcLoading(false);
      }
    }
  };

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

  const handleCallButton = async (e: React.MouseEvent, a: Assignment) => {
    e.stopPropagation();
    if (a.mobile) window.open(`tel:${a.mobile}`, "_self");
    
    // Start backend timer
    try {
      await automationAPI.startCallTimer(a.assignment_id);
    } catch (err) {
      console.error("Failed to start timer", err);
    }

    setTimeout(() => {
      setActiveItem(a);
      setOutcome("");
      setNotes("");
      setCallbackDate("");
      setDialogOpen(true);
    }, 400);
  };

  const submitOutcome = async () => {
    if (!outcome) return;
    if (!isQuickCall && !activeItem) return;

    if (outcome === "take_order") {
      return handleTakeOrder();
    }
    if (outcome === "callback" && !callbackDate) {
      setToast({ msg: "Please select a date for the callback.", sev: "error" });
      return;
    }
    try {
      setSubmitting(true);
      if (isQuickCall) {
        // Quick call logging
        const qcItem = qcQueue[qcCurrentIndex];
        const entityType = role === "sales_manager" ? "distributor" : "customer";
        const entityId = entityType === "customer" ? qcItem.customer_id : qcItem.entity_id;
        await automationAPI.logAdhocCall({
          entity_id: entityId,
          entity_type: entityType,
          call_outcome: outcome,
          notes: notes,
          callback_date: outcome === "callback" ? callbackDate : undefined,
        });
        setToast({ msg: "Call logged successfully", sev: "success" });
        // Next in queue
        if (qcCurrentIndex < qcQueue.length - 1) {
          setQcCurrentIndex(prev => prev + 1);
          setOutcome("");
          setNotes("");
          setCallbackDate("");
          setSubmitting(false);
          return;
        } else {
          // Finished queue
          setQcDialogOpen(false);
          setQcQueue([]);
          setQcSelectedIds(new Set());
          setQcSearch("");
          load(pagination.page);
        }
      } else {
        await automationAPI.updateCallStatus(activeItem!.assignment_id, outcome, notes, outcome === "callback" ? callbackDate : undefined);
        setToast({ msg: "Call logged successfully", sev: "success" });
        setDialogOpen(false);
        load(pagination.page);
      }
    } catch (e: any) {
      setToast({ msg: e?.response?.data?.detail || "Failed", sev: "error" });
    } finally { setSubmitting(false); }
  };

  const toggleQcSelection = (item: any) => {
    const id = role === "sales_manager" ? item.entity_id : item.customer_id;
    setQcSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startQuickCallQueue = () => {
    if (qcSelectedIds.size === 0) return;
    const selectedItems = qcResults.filter(r => qcSelectedIds.has(role === "sales_manager" ? r.entity_id : r.customer_id));
    if (selectedItems.length === 0) return;
    setQcQueue(selectedItems);
    setQcCurrentIndex(0);
    setOutcome("");
    setNotes("");
    setCallbackDate("");
    setQcDialogOpen(true);
  };

  // Take Order Dialog
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [orderProducts, setOrderProducts] = useState<any[]>([]);
  const [orderItems, setOrderItems] = useState<{ product_id: number; product_name: string; quantity: number; rate: number; amount: number }[]>([]);
  const [orderNotes, setOrderNotes] = useState("");
  const [orderLoading, setOrderLoading] = useState(false);
  const [productsList, setProductsList] = useState<any[]>([]);

  const handleTakeOrder = async () => {
    if (!activeItem) return;
    try {
      setSubmitting(true);
      await automationAPI.updateCallStatus(activeItem.assignment_id, "connected", notes || "Initiating Order");
      setDialogOpen(false);

      if (productsList.length === 0) {
        try {
          const prods = await productAPI.getAll();
          setProductsList(Array.isArray(prods) ? prods : (prods?.data || []));
        } catch (e) {
          setToast({ msg: "Failed to load products", sev: "error" });
          setSubmitting(false);
          return;
        }
      }

      setOrderItems([{ product_id: 0, product_name: "", quantity: 1, rate: 0, amount: 0 }]);
      setOrderNotes("");
      setOrderDate("");
      setOrderDialogOpen(true);
    } catch (e: any) {
      setToast({ msg: e?.response?.data?.detail || "Failed to log call before taking order.", sev: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const submitTelecallerOrder = async () => {
    if (!activeItem) return;
    const validItems = orderItems.filter(i => i.product_id && i.quantity > 0 && i.rate > 0);
    if (validItems.length === 0) {
      setToast({ msg: "Please add at least one valid product", sev: "warning" });
      return;
    }
    if (!orderDate) {
      setToast({ msg: "Please select an Order Confirmation Date", sev: "warning" });
      return;
    }
    const selectedDate = new Date(orderDate);
    const minDate = new Date(Date.now() - 30 * 60 * 1000);
    if (selectedDate < minDate) {
      setToast({ msg: "Confirmation date cannot be older than 30 minutes", sev: "warning" });
      return;
    }
    const finalConfirmationDate = `${orderDate.substring(0, 16)}+05:30`;

    try {
      setOrderLoading(true);
      const orderData = {
        customer_type: "Mantri",
        customer_id: activeItem.customer_id,
        customer_name: activeItem.name || "Unknown",
        customer_mobile: activeItem.mobile || "",
        customer_village: activeItem.village || "",
        products: validItems.map(i => ({
          product_id: i.product_id,
          product_name: i.product_name,
          quantity: i.quantity,
          rate: i.rate,
          amount: i.amount,
        })),
        notes: orderNotes ? `${orderNotes} [Order Confirmation Call]` : "[Order Confirmation Call]",
        confirmation_date: finalConfirmationDate,
      };
      await telecallerOrderAPI.create(orderData);

      // Log the call to remove it from the Pending list
      await automationAPI.updateCallStatus(
        activeItem.assignment_id,
        "connected",
        orderNotes ? `${orderNotes} [Order Placed]` : "[Order Placed]"
      );

      setToast({ msg: "Order submitted for approval!", sev: "success" });
      setOrderDialogOpen(false);
      load(pagination.page);
      fetchSummary();
    } catch (e: any) {
      setToast({ msg: e?.response?.data?.detail || "Failed to submit order", sev: "error" });
    } finally {
      setOrderLoading(false);
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
          <Stack direction="row" spacing={1}>
            <Tooltip title="Estimation Calculator">
              <Button
                variant="outlined"
                onClick={openCalculator}
                startIcon={<CalculateIcon />}
                sx={{
                  borderRadius: 2,
                  fontWeight: 700,
                  textTransform: "none",
                  color: "#2563eb",
                  border: `2px solid ${alpha("#2563eb", 0.3)}`,
                  bgcolor: alpha("#2563eb", 0.05),
                  px: 2,
                  "&:hover": {
                    border: `2px solid #2563eb`,
                    bgcolor: alpha("#2563eb", 0.1),
                  }
                }}
              >
                Calculator
              </Button>
            </Tooltip>
            <Tooltip title="How to use this page">
              <IconButton size="medium" onClick={() => setHelpOpen(true)} sx={{ border: `1px solid ${border}`, borderRadius: 2, color: "#2563eb" }}>
                <HelpIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <IconButton size="medium" onClick={() => load(1)} disabled={loading} sx={{ border: `1px solid ${border}`, borderRadius: 2 }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Stack>


      </Box>

      {/* ── Stats ── */}
      <Stack direction="row" spacing={2} sx={{ mb: 2.5 }}>
        {([
          { label: t("callingList.total", "Total"), value: (summary.to_call || 0) + (summary.called || 0), color: "#2563eb", icon: <AssignmentIcon sx={{ fontSize: 18 }} /> },
          { label: t("callingList.pending", "Pending"), value: summary.to_call, color: "#ea580c", icon: <PhoneIcon sx={{ fontSize: 18 }} /> },
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

      {/* ── Quick Call Search ── */}
      <Paper sx={{ mb: 2.5, p: 2, borderRadius: 3, border: `1px solid ${border}`, bgcolor: surface }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: "text.secondary" }}>
          Quick Call Search
        </Typography>
        <Stack direction="row" spacing={2} alignItems="flex-start">
          <TextField
            fullWidth
            size="small"
            placeholder={`Search ${role === "sales_manager" ? "distributors" : "customers"} by name, mobile, or village...`}
            value={qcSearch}
            onChange={e => setQcSearch(e.target.value)}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
              endAdornment: qcSearching ? <InputAdornment position="end"><CircularProgress size={16} /></InputAdornment> : null,
              sx: { borderRadius: 2 }
            }}
          />
        </Stack>

        {qcSearch.trim().length > 0 && qcResults.length > 0 && (
          <Box sx={{ mt: 2, border: `1px solid ${border}`, borderRadius: 2, overflow: "hidden" }}>
            <Box sx={{ maxHeight: 200, overflowY: "auto" }}>
              {qcResults.map(res => {
                const id = role === "sales_manager" ? res.entity_id : res.customer_id;
                const isSelected = qcSelectedIds.has(id);
                return (
                  <Box
                    key={id}
                    onClick={() => toggleQcSelection(res)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      p: 1,
                      borderBottom: `1px solid ${border}`,
                      cursor: "pointer",
                      bgcolor: isSelected ? alpha("#2563eb", 0.05) : "transparent",
                      "&:hover": { bgcolor: alpha("#2563eb", 0.08) }
                    }}
                  >
                    <Checkbox checked={isSelected} size="small" />
                    <Box sx={{ ml: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{res.name}</Typography>
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        {res.mobile} {res.village ? `· ${res.village}` : ""}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
            </Box>
            {qcSelectedIds.size > 0 && (
              <Box sx={{ p: 1.5, bgcolor: surfaceMuted, borderTop: `1px solid ${border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {qcSelectedIds.size} selected
                </Typography>
                <Button
                  variant="contained"
                  size="small"
                  onClick={startQuickCallQueue}
                  sx={{ borderRadius: 2, textTransform: "none", fontWeight: 700 }}
                >
                  Save & Log Calls
                </Button>
              </Box>
            )}
          </Box>
        )}
        {qcSearch.trim().length > 0 && !qcSearching && qcResults.length === 0 && (
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 1, px: 1 }}>
            No results found.
          </Typography>
        )}
      </Paper>

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
          <Tab label={`${t("callingList.toCall", "To Call")}  ·  ${summary.to_call}`} />
          <Tab label={`${t("callingList.called", "Called")}  ·  ${summary.called}`} />
          {role === "telecaller" && <Tab label={`Callbacks  ·  ${summary.callbacks || 0}`} />}
          {role === "telecaller" && <Tab label={`Order Confirmations  ·  ${summary.confirmation_calls || 0}`} />}
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
                        {item.last_call && (
                          <Box sx={{ mt: 1, p: 1, borderRadius: 1.5, bgcolor: surfaceMuted, border: `1px solid ${border}` }}>
                            <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600, display: "block", mb: 0.25 }}>
                              Last Call: {new Date(item.last_call.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </Typography>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Chip
                                size="small"
                                label={item.last_call.call_outcome.replace(/_/g, " ").toUpperCase()}
                                sx={{ height: 18, fontSize: "0.65rem", fontWeight: 700 }}
                              />
                            </Stack>
                            {item.last_call.notes && (
                              <Typography variant="caption" sx={{ color: "text.disabled", fontStyle: "italic", display: "block", mt: 0.5 }}>
                                "{item.last_call.notes}"
                              </Typography>
                            )}
                          </Box>
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
              {tab === 2 && role === "telecaller" && (
            <Stack spacing={1} sx={{ minWidth: 0 }}>
              {callbacks.length === 0 ? (
                <Box sx={{ textAlign: "center", py: 8 }}>
                  <Typography variant="h6" sx={{ color: "text.disabled", fontWeight: 600 }}>No Scheduled Callbacks</Typography>
                </Box>
              ) : (
                callbacks.map(item => (
                  <Box
                    key={item.assignment_id}
                    onClick={() => openHistoryDialog(item)}
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      cursor: "pointer",
                      border: `1px solid ${border}`,
                      borderLeft: `4px solid #ea580c`,
                      bgcolor: isDark ? alpha("#ea580c", 0.05) : alpha("#ea580c", 0.02),
                      display: "flex",
                      alignItems: "center",
                      gap: 2,
                      "&:hover": { borderColor: alpha("#ea580c", 0.3) },
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{item.name || "Unknown"}</Typography>
                      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 0.25 }}>
                        {item.mobile && <Typography variant="caption" sx={{ color: "text.secondary" }}><PhoneIcon sx={{ fontSize: 12, verticalAlign: "middle" }} /> {item.mobile}</Typography>}
                        {item.village && <Typography variant="caption" sx={{ color: "text.secondary" }}><PlaceIcon sx={{ fontSize: 12, verticalAlign: "middle" }} /> {item.village}</Typography>}
                      </Stack>
                    </Box>
                    <Tooltip title="Call">
                      <span>
                        <Button
                          variant="contained"
                          size="small"
                          disabled={!item.mobile}
                          onClick={(e) => handleCallButton(e, item)}
                          startIcon={<PhoneIcon sx={{ fontSize: 16 }} />}
                          sx={{ borderRadius: 2, textTransform: "none", fontWeight: 700, fontSize: 12, px: 2, boxShadow: "none", bgcolor: "#16a34a", "&:hover": { bgcolor: "#15803d", boxShadow: "none" } }}
                        >
                          Call
                        </Button>
                      </span>
                    </Tooltip>
                  </Box>
                ))
              )}
            </Stack>
          )}

          {tab === 3 && role === "telecaller" && (
            <Box>
              {tab3Loading && confirmationOrders.length === 0 ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}><CircularProgress size={28} /></Box>
              ) : confirmationOrders.length === 0 ? (
                <Box sx={{ textAlign: "center", py: 8 }}>
                  <Typography variant="h6" sx={{ color: "text.disabled", fontWeight: 600 }}>No Order Confirmations Today</Typography>
                </Box>
              ) : (
                <Stack spacing={2}>
                  {confirmationOrders.map(order => (
                    <Paper key={order.order_id} sx={{ p: 2, borderRadius: 2, border: `1px solid ${border}` }}>
                      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} spacing={2}>
                        <Box>
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{order.customer_name} ({order.customer_type})</Typography>
                          <Typography variant="caption" sx={{ color: "text.secondary" }}>{order.customer_mobile} · {order.customer_village}</Typography>
                          <Box sx={{ mt: 1 }}>
                            {order.products.map((p: any, i: number) => (
                              <Typography key={i} variant="caption" display="block" sx={{ color: "text.primary" }}>
                                • {p.product_name} - {p.quantity} x ₹{p.rate} = ₹{p.amount}
                              </Typography>
                            ))}
                          </Box>
                          <Typography variant="caption" sx={{ color: "text.secondary", mt: 1, display: "block" }}>
                            Time: {new Date(order.confirmation_date).toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit' })}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={1}>
                          <Button
                            variant="outlined"
                            color="error"
                            size="small"
                            disabled={processingOrder === order.order_id}
                            onClick={() => handleRejectOrder(order.order_id)}
                            sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600 }}
                          >
                            {processingOrder === order.order_id ? <CircularProgress size={16} color="inherit" /> : "Reject"}
                          </Button>
                          <Button
                            variant="contained"
                            color="success"
                            size="small"
                            disabled={processingOrder === order.order_id}
                            onClick={() => handleApproveOrder(order.order_id)}
                            sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600, boxShadow: "none" }}
                          >
                            {processingOrder === order.order_id ? <CircularProgress size={16} color="inherit" /> : "Approve"}
                          </Button>
                        </Stack>
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Box>
          )}
              {tab === 0 || tab === 1 ? (
                <TablePagination
                component="div"
                count={pagination.total}
                page={pagination.page - 1}
                rowsPerPage={pagination.limit}
                onPageChange={(_, p) => load(p + 1)}
                rowsPerPageOptions={[20]}
                sx={{ borderTop: `1px solid ${border}`, mt: 1 }}
              />
              ) : null}
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

              {/* ── Call History ── */}
              {customerSummary.call_logs && customerSummary.call_logs.length > 0 && (
                <Box sx={{ mt: 3 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "text.secondary", mb: 1.5, textTransform: "uppercase", letterSpacing: 0.5, fontSize: "0.7rem" }}>
                    Call History
                  </Typography>
                  <Stack spacing={1.5}>
                    {customerSummary.call_logs.map((log: any, idx: number) => {
                      const outcomeIcon = CALL_OUTCOMES.find(o => o.value === log.call_outcome);
                      const displayLabel = outcomeIcon ? outcomeIcon.label : log.call_outcome.replace(/_/g, " ").toUpperCase();
                      const displayColor = outcomeIcon ? outcomeIcon.color : "#6b7280";
                      
                      return (
                        <Box key={idx} sx={{ p: 1.5, borderRadius: 2, bgcolor: surfaceMuted, border: `1px solid ${border}` }}>
                          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 0.5 }}>
                            <Chip
                              size="small"
                              label={displayLabel}
                              sx={{ height: 20, fontSize: "0.65rem", fontWeight: 700, bgcolor: alpha(displayColor, 0.1), color: displayColor, border: `1px solid ${alpha(displayColor, 0.2)}` }}
                            />
                            <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600 }}>
                              {new Date(log.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                            </Typography>
                          </Stack>
                          {log.notes && (
                            <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
                              "{log.notes}"
                            </Typography>
                          )}
                          <Typography variant="caption" sx={{ color: "text.disabled", display: "block", mt: 0.5, fontSize: "0.65rem" }}>
                            By {log.user_email}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Stack>
                </Box>
              )}
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
      <Dialog open={dialogOpen || qcDialogOpen} onClose={() => { if (!submitting) { setDialogOpen(false); setQcDialogOpen(false); } }} maxWidth="xs" fullWidth fullScreen={isMobile} PaperProps={{ sx: { borderRadius: isMobile ? 0 : 3, p: 0.5 } }}>
        <DialogTitle sx={{ fontWeight: 800, fontSize: 18, pb: 0 }}>
          {isQuickCall ? `Log Call Outcome (${qcCurrentIndex + 1} of ${qcQueue.length})` : "Log Call Outcome"}
          {(activeItem || isQuickCall) && (() => {
            const item = isQuickCall ? qcQueue[qcCurrentIndex] : activeItem;
            return (
              <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 400 }}>
                {item?.name} · {item?.mobile} {item?.village ? `· ${item?.village}` : ""}
              </Typography>
            );
          })()}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>

          <Stack spacing={1} sx={{ mb: 2.5 }}>
            {CALL_OUTCOMES.filter(o => !(isQuickCall && o.value === "take_order")).map(o => (
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
          <Button onClick={() => { setDialogOpen(false); setQcDialogOpen(false); }} disabled={submitting} sx={{ borderRadius: 2, textTransform: "none" }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={submitOutcome}
            disabled={!outcome || submitting || (outcome === "callback" && !callbackDate)}
            startIcon={submitting ? <CircularProgress size={14} color="inherit" /> : <CheckIcon />}
            sx={{ borderRadius: 2, textTransform: "none", fontWeight: 700, boxShadow: "none" }}
          >
            {submitting ? "Saving…" : (isQuickCall && qcCurrentIndex < qcQueue.length - 1 ? "Save & Next" : "Submit")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Estimation Calculator Dialog ── */}
      <Dialog open={calcOpen} onClose={() => setCalcOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile} PaperProps={{ sx: { borderRadius: isMobile ? 0 : 3 } }}>
        <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>
          <Stack direction="row" alignItems="center" gap={1}>
            <CalculateIcon color="primary" />
            Estimation Calculator
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>

          </Typography>

          {calcLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}><CircularProgress /></Box>
          ) : (
            <Stack spacing={3}>
              <FormControl fullWidth>
                <Autocomplete
                  options={mantris}
                  getOptionLabel={(m) => `${m.mantri_name || m.name || ""} ${m.village ? `(${m.village})` : ""}`}
                  value={mantris.find(m => m.distributor_id === Number(selectedMantriId)) || null}
                  onChange={(e, newValue) => {
                    setSelectedMantriId(newValue ? String(newValue.distributor_id) : "");
                  }}
                  renderInput={(params) => (
                    <TextField {...params} label="Select Mantri / Distributor" sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }} />
                  )}
                />
              </FormControl>

              {(() => {
                const selectedMantri = mantris.find(m => m.distributor_id === Number(selectedMantriId));
                if (!selectedMantri) return null;

                const sabhasadCount = selectedMantri.contact_in_group || 0;
                const totalLiter = sabhasadCount * (approxLiter || 0);

                return (
                  <Paper sx={{ p: 2.5, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, 0.04), border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}` }}>
                    <Grid container spacing={2} alignItems="center">
                      <Grid item xs={12} sm={4}>
                        <Typography variant="caption" color="text.secondary">Sabhasads in Group</Typography>
                        <Typography variant="h6" fontWeight={700}>{sabhasadCount}</Typography>
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <TextField
                          label="Approx Liter/Sabhasad"
                          type="number"
                          size="small"
                          fullWidth
                          value={approxLiter}
                          onChange={(e) => setApproxLiter(Number(e.target.value))}
                          inputProps={{ min: 0, step: 0.5 }}
                        />
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: "#2563eb", color: "#fff", textAlign: "center" }}>
                          <Typography variant="caption" sx={{ opacity: 0.8, display: "block" }}>Estimated Total</Typography>
                          <Typography variant="h6" fontWeight={800}>{totalLiter} L</Typography>
                        </Box>
                      </Grid>
                    </Grid>
                  </Paper>
                );
              })()}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setCalcOpen(false)} sx={{ borderRadius: 2, textTransform: "none" }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ── Take Order Dialog ── */}
      <Dialog open={orderDialogOpen} onClose={() => !orderLoading && setOrderDialogOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile} PaperProps={{ sx: { borderRadius: isMobile ? 0 : 3 } }}>
        <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>
          Take Order
          {activeItem && (
            <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 400 }}>
              {activeItem.name} · {activeItem.mobile} · {activeItem.village}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            {orderItems.map((item, idx) => (
              <Paper key={idx} sx={{ p: 2, borderRadius: 2, border: `1px solid ${border}` }}>
                <Grid container spacing={1.5} alignItems="center">
                  <Grid item xs={12} sm={5}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Product</InputLabel>
                      <Select
                        value={item.product_id}
                        label="Product"
                        onChange={(e) => {
                          const pid = Number(e.target.value);
                          const prod = productsList.find((p: any) => p.product_id === pid);
                          const rate = prod?.standard_rate || prod?.rate_gujarat || 0;
                          const newItems = [...orderItems];
                          newItems[idx] = { ...newItems[idx], product_id: pid, product_name: prod?.product_name || "", rate, amount: newItems[idx].quantity * rate };
                          setOrderItems(newItems);
                        }}
                      >
                        {productsList.map((p: any) => (
                          <MenuItem key={p.product_id} value={p.product_id}>
                            {p.product_name} {p.capacity_ltr ? `(${p.capacity_ltr}L)` : ""}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={4} sm={2}>
                    <TextField
                      label="Qty"
                      type="number"
                      size="small"
                      fullWidth
                      value={item.quantity}
                      onChange={(e) => {
                        const qty = Number(e.target.value) || 0;
                        const newItems = [...orderItems];
                        newItems[idx] = { ...newItems[idx], quantity: qty, amount: qty * newItems[idx].rate };
                        setOrderItems(newItems);
                      }}
                      inputProps={{ min: 1 }}
                    />
                  </Grid>
                  <Grid item xs={3} sm={2}>
                    <TextField
                      label="Rate"
                      type="number"
                      size="small"
                      fullWidth
                      value={item.rate}
                      onChange={(e) => {
                        const rate = Number(e.target.value) || 0;
                        const newItems = [...orderItems];
                        newItems[idx] = { ...newItems[idx], rate, amount: newItems[idx].quantity * rate };
                        setOrderItems(newItems);
                      }}
                    />
                  </Grid>
                  <Grid item xs={3} sm={2}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      ₹{item.amount.toLocaleString("en-IN")}
                    </Typography>
                  </Grid>
                  <Grid item xs={1} sm={1}>
                    {orderItems.length > 1 && (
                      <IconButton size="small" onClick={() => setOrderItems(orderItems.filter((_, i) => i !== idx))}>
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Grid>
                </Grid>
              </Paper>
            ))}
            <Button
              variant="outlined"
              onClick={() => setOrderItems([...orderItems, { product_id: 0, product_name: "", quantity: 1, rate: 0, amount: 0 }])}
              size="small"
              sx={{ borderRadius: 2, textTransform: "none" }}
            >
              + Add Product
            </Button>
            <Box sx={{ textAlign: "right", fontWeight: 700, fontSize: 16, mt: 1 }}>
              Total: ₹{orderItems.reduce((s, i) => s + i.amount, 0).toLocaleString("en-IN")}
            </Box>
                        <TextField
              label="Order Confirmation Date (IST)"
              type="datetime-local"
              fullWidth
              required
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            />
            <TextField
              label="Notes (optional)"
              multiline
              rows={2}
              fullWidth
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, justifyContent: "space-between" }}>
          <Button onClick={() => setOrderDialogOpen(false)} disabled={orderLoading} sx={{ borderRadius: 2, textTransform: "none" }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={submitTelecallerOrder}
            disabled={orderLoading}
            startIcon={orderLoading ? <CircularProgress size={14} color="inherit" /> : <ShoppingCartIcon />}
            sx={{ borderRadius: 2, textTransform: "none", fontWeight: 700, boxShadow: "none", bgcolor: "#16a34a", "&:hover": { bgcolor: "#15803d" } }}
          >
            {orderLoading ? "Submitting…" : "Submit Order"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Toast */}
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity={toast?.sev || "info"} onClose={() => setToast(null)} sx={{ borderRadius: 2, fontWeight: 500 }}>{toast?.msg}</Alert>
      </Snackbar>

      {/* Help Dialog */}
      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 800, pb: 1, display: "flex", alignItems: "center", gap: 1 }}>
          <HelpIcon color="primary" />
          How to Use Calling List
          <IconButton onClick={() => setHelpOpen(false)} sx={{ ml: "auto" }} size="small"><CloseIcon fontSize="small" /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 0 }}>
          <Stack spacing={2}>
            {[
              { title: "Priority Colours", desc: "Each card has a left border colour. GREEN (Urgent/High) = call first, YELLOW (Medium) = normal, RED (Low) = call last." },
              { title: "Making a Call", desc: "Tap the green Call button. Your phone will open automatically. After the call, an outcome dialog appears." },
              { title: "Logging Call Outcome", desc: "Choose: Connected, Not Reachable, Call Back Later, Wrong Number, or Take Order. Add notes and tap Submit." },
              { title: "Callback Scheduling", desc: "If you pick \"Call Back Later\", select a date the system schedules a reminder for that day." },
              { title: "Take Order", desc: "Selecting \"Take Order\" logs the call and takes you to the New Sale screen pre-filled with this contact's details." },
              { title: "Estimation Calculator", desc: "Use the Calculator button to estimate total product need for a Mantri pick a Mantri and set approx. liters per Sabhasad." },
              { title: "Customer History", desc: "Tap anywhere on a card (not the Call button) to see that contact's full purchase history, paid/pending amounts." },
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
