import { useEffect, useState, useCallback } from "react";
import {
  Box, Typography, Paper, Stack, Chip, Button, IconButton,
  CircularProgress, Alert, Tabs, Tab, Tooltip, Badge,
  Grid, Divider, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, LinearProgress, useTheme,
  alpha, useMediaQuery, Avatar,
} from "@mui/material";
import {
  Science as ScienceIcon,
  AutoAwesome as AIIcon,
  CheckCircle as DoneIcon,
  Schedule as PendingIcon,
  Cancel as CancelledIcon,
  Refresh as RefreshIcon,
  Add as AddIcon,
  LocationOn as LocationIcon,
  Group as GroupIcon,
  TrendingUp as ScoreIcon,
  CalendarMonth as CalIcon,
  AccessTime as TimeIcon,
  LightbulbOutlined as TipIcon,
  FlashOn as UrgentIcon,
  Person as PersonIcon,
  Edit as EditIcon,
} from "@mui/icons-material";
import { demoAPI } from "../services/api";
import DemoDialog from "../components/DemoDialog";
import PermissionGate from "../components/PermissionGate";
import { PERMISSIONS } from "../config/permissions";

// ── Types ──────────────────────────────────────────────────────────
interface DemoRecord {
  demo_id: number;
  customer_name?: string;
  customer_mobile?: string;
  village?: string;
  product_name?: string;
  distributor_name?: string;
  distributor_id?: number;
  demo_date: string;
  demo_time?: string;
  demo_location?: string;
  conversion_status: string;
  notes?: string;
  follow_up_date?: string;
}

interface Suggestion {
  distributor_id: number;
  mantri_name?: string;
  village?: string;
  taluka?: string;
  district?: string;
  contact_in_group: number;
  priority_label: string;
  priority_score: number;
  total_demos: number;
  last_demo_date?: string;
  last_demo_status?: string;
  days_since_last_demo?: number;
  suggestion_score: number;
  reason: string;
}

// ── Helpers ────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; color: string; icon: JSX.Element }> = {
  Scheduled: { label: "Scheduled",  color: "#2563eb", icon: <PendingIcon  sx={{ fontSize: 15 }} /> },
  Completed:  { label: "Completed",  color: "#16a34a", icon: <DoneIcon    sx={{ fontSize: 15 }} /> },
  Converted:  { label: "Converted",  color: "#7c3aed", icon: <DoneIcon    sx={{ fontSize: 15 }} /> },
  Cancelled:  { label: "Cancelled",  color: "#dc2626", icon: <CancelledIcon sx={{ fontSize: 15 }} /> },
  "No Show":  { label: "No Show",   color: "#ea580c", icon: <CancelledIcon sx={{ fontSize: 15 }} /> },
};

const PRIORITY_COLOR: Record<string, string> = {
  HIGH: "#dc2626", MEDIUM: "#ea580c", LOW: "#16a34a",
};

function fmtDate(d?: string) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return d; }
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? "#dc2626" : score >= 45 ? "#ea580c" : "#2563eb";
  return (
    <Box sx={{
      display: "inline-flex", alignItems: "center", gap: 0.5,
      px: 1.5, py: 0.3, borderRadius: 99, bgcolor: alpha(color, 0.1),
      border: `1px solid ${alpha(color, 0.3)}`,
    }}>
      <UrgentIcon sx={{ fontSize: 13, color }} />
      <Typography sx={{ fontSize: 12, fontWeight: 700, color }}>{score}</Typography>
    </Box>
  );
}

// ── Component ──────────────────────────────────────────────────────
export default function DemoScheduler() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isDark = theme.palette.mode === "dark";
  const surface   = isDark ? "#1e1e2e" : "#fff";
  const surfaceMuted = isDark ? "#262637" : "#f8fafc";
  const border    = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";

  const [tab, setTab]         = useState(0);  // 0=All, 1=Scheduled, 2=Done, 3=AI Suggest
  const [demos, setDemos]     = useState<DemoRecord[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingDemos, setLoadingDemos]         = useState(true);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Status-update dialog
  const [statusDialog, setStatusDialog] = useState<{ open: boolean; demo: DemoRecord | null }>({ open: false, demo: null });
  const [newStatus, setNewStatus]   = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [updating, setUpdating]     = useState(false);

  // New demo dialog
  const [newDemoOpen, setNewDemoOpen] = useState(false);
  const [suggestedDistributor, setSuggestedDistributor] = useState<Suggestion | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────
  const loadDemos = useCallback(async () => {
    try {
      setLoadingDemos(true);
      setError(null);
      const data = await demoAPI.getAll({ limit: 1000 });
      setDemos(data || []);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to load demos");
    } finally {
      setLoadingDemos(false);
    }
  }, []);

  const loadSuggestions = useCallback(async () => {
    try {
      setLoadingSuggestions(true);
      const data = await demoAPI.getSuggestions(30);
      setSuggestions(data || []);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to load suggestions");
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  useEffect(() => { loadDemos(); }, [loadDemos]);
  useEffect(() => { if (tab === 3) loadSuggestions(); }, [tab, loadSuggestions]);

  // ── Derived stats ──────────────────────────────────────────────
  const scheduled  = demos.filter(d => d.conversion_status === "Scheduled");
  const completed  = demos.filter(d => ["Completed", "Converted"].includes(d.conversion_status));
  const pending    = demos.filter(d => !["Completed", "Converted", "Cancelled", "No Show"].includes(d.conversion_status));
  const cancelled  = demos.filter(d => d.conversion_status === "Cancelled");
  const noShow     = demos.filter(d => d.conversion_status === "No Show");
  const convRate   = demos.length > 0 ? Math.round((completed.length / demos.length) * 100) : 0;

  const tabDemos = tab === 0 ? demos
    : tab === 1 ? scheduled
    : tab === 2 ? completed
    : demos;

  // ── Status update ──────────────────────────────────────────────
  const openStatusDialog = (demo: DemoRecord) => {
    setStatusDialog({ open: true, demo });
    setNewStatus(demo.conversion_status);
    setStatusNote(demo.notes || "");
  };

  const submitStatus = async () => {
    if (!statusDialog.demo) return;
    try {
      setUpdating(true);
      await demoAPI.updateStatus(statusDialog.demo.demo_id, newStatus, statusNote);
      setStatusDialog({ open: false, demo: null });
      loadDemos();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to update demo status");
    } finally {
      setUpdating(false);
    }
  };

  // ── Demo Card ──────────────────────────────────────────────────
  function DemoCard({ demo }: { demo: DemoRecord }) {
    const meta = STATUS_META[demo.conversion_status] || STATUS_META["Scheduled"];
    return (
      <Paper
        variant="outlined"
        sx={{
          p: 2, borderRadius: 2.5, bgcolor: surface,
          borderColor: border,
          transition: "all 0.15s",
          "&:hover": { borderColor: meta.color, boxShadow: `0 4px 20px ${alpha(meta.color, 0.12)}` },
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={1}>
          <Typography fontWeight={700} fontSize={14} noWrap sx={{ flex: 1, mr: 1 }}>
            {demo.customer_name || demo.distributor_name || "—"}
          </Typography>
          <Chip
            size="small"
            label={meta.label}
            icon={meta.icon}
            sx={{ bgcolor: alpha(meta.color, 0.1), color: meta.color, fontWeight: 700, fontSize: 11, border: `1px solid ${alpha(meta.color, 0.25)}` }}
          />
        </Stack>

        <Stack spacing={0.5} mb={1.5}>
          {demo.product_name && (
            <Stack direction="row" spacing={0.6} alignItems="center">
              <ScienceIcon sx={{ fontSize: 13, color: "text.secondary" }} />
              <Typography fontSize={12} color="text.secondary">{demo.product_name}</Typography>
            </Stack>
          )}
          {demo.village && (
            <Stack direction="row" spacing={0.6} alignItems="center">
              <LocationIcon sx={{ fontSize: 13, color: "text.secondary" }} />
              <Typography fontSize={12} color="text.secondary">{demo.village}</Typography>
            </Stack>
          )}
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
            <Stack direction="row" spacing={0.5} alignItems="center">
              <CalIcon sx={{ fontSize: 13, color: "text.secondary" }} />
              <Typography fontSize={12} color="text.secondary">{fmtDate(demo.demo_date)}</Typography>
            </Stack>
            {demo.demo_time && (
              <Stack direction="row" spacing={0.5} alignItems="center">
                <TimeIcon sx={{ fontSize: 13, color: "text.secondary" }} />
                <Typography fontSize={12} color="text.secondary">{demo.demo_time}</Typography>
              </Stack>
            )}
          </Stack>
        </Stack>

        <Divider sx={{ mb: 1 }} />
        <PermissionGate permission={PERMISSIONS.EDIT_DEMO}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<EditIcon sx={{ fontSize: 14 }} />}
            onClick={() => openStatusDialog(demo)}
            sx={{ borderRadius: 2, textTransform: "none", fontSize: 12, fontWeight: 600 }}
          >
            Update Status
          </Button>
        </PermissionGate>
      </Paper>
    );
  }

  // ── Suggestion Card ────────────────────────────────────────────
  function SuggestionCard({ s, rank }: { s: Suggestion; rank: number }) {
    const urgency = s.suggestion_score >= 70 ? "HIGH" : s.suggestion_score >= 45 ? "MEDIUM" : "LOW";
    const urgColor = PRIORITY_COLOR[urgency];
    return (
      <Paper
        variant="outlined"
        sx={{
          p: 2.5, borderRadius: 3, bgcolor: surface, borderColor: alpha(urgColor, 0.3),
          position: "relative", overflow: "hidden",
          "&::before": {
            content: '""', position: "absolute", top: 0, left: 0, bottom: 0,
            width: 4, bgcolor: urgColor, borderRadius: "3px 0 0 3px",
          },
          "&:hover": { boxShadow: `0 6px 24px ${alpha(urgColor, 0.15)}` },
          transition: "all 0.15s",
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={1.5}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Avatar sx={{ width: 36, height: 36, bgcolor: alpha(urgColor, 0.12), color: urgColor, fontWeight: 800, fontSize: 14 }}>
              {rank}
            </Avatar>
            <Box>
              <Typography fontWeight={800} fontSize={14}>{s.mantri_name || "Unknown"}</Typography>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <LocationIcon sx={{ fontSize: 12, color: "text.secondary" }} />
                <Typography fontSize={12} color="text.secondary">
                  {[s.village, s.taluka, s.district].filter(Boolean).join(", ") || "—"}
                </Typography>
              </Stack>
            </Box>
          </Stack>
          <ScoreBadge score={s.suggestion_score} />
        </Stack>

        <Stack direction="row" spacing={2} flexWrap="wrap" mb={1.5}>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <GroupIcon sx={{ fontSize: 14, color: "#2563eb" }} />
            <Typography fontSize={12} fontWeight={600}>{s.contact_in_group} contacts</Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <ScoreIcon sx={{ fontSize: 14, color: PRIORITY_COLOR[s.priority_label] || "#2563eb" }} />
            <Typography fontSize={12} fontWeight={600}>{s.priority_label}</Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <ScienceIcon sx={{ fontSize: 14, color: "text.secondary" }} />
            <Typography fontSize={12} color="text.secondary">{s.total_demos} demos done</Typography>
          </Stack>
          {s.last_demo_date && (
            <Stack direction="row" spacing={0.5} alignItems="center">
              <CalIcon sx={{ fontSize: 14, color: "text.secondary" }} />
              <Typography fontSize={12} color="text.secondary">Last: {fmtDate(s.last_demo_date)}</Typography>
            </Stack>
          )}
        </Stack>

        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha("#2563eb", 0.05), mb: 1.5 }}>
          <Stack direction="row" spacing={0.8} alignItems="flex-start">
            <TipIcon sx={{ fontSize: 15, color: "#2563eb", mt: 0.1 }} />
            <Typography fontSize={12} color="text.secondary" sx={{ lineHeight: 1.5 }}>{s.reason}</Typography>
          </Stack>
        </Box>

        <PermissionGate permission={PERMISSIONS.SCHEDULE_DEMO}>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon sx={{ fontSize: 14 }} />}
            onClick={() => { setSuggestedDistributor(s); setNewDemoOpen(true); }}
            sx={{ borderRadius: 2, textTransform: "none", fontWeight: 700, fontSize: 12, boxShadow: "none" }}
          >
            Schedule Demo
          </Button>
        </PermissionGate>
      </Paper>
    );
  }

  // ── Render ─────────────────────────────────────────────────────
  return (
    <Box sx={{ width: "100%" }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3} flexWrap="wrap" gap={2}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
            <ScienceIcon sx={{ color: "#2563eb", fontSize: 28 }} />
            <Typography variant="h5" fontWeight={800} letterSpacing={-0.5}>Demo Scheduler</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Track scheduled demos, view completion status, and get AI-powered suggestions on who to demo next.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <PermissionGate permission={PERMISSIONS.SCHEDULE_DEMO}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => { setSuggestedDistributor(null); setNewDemoOpen(true); }}
              sx={{ borderRadius: 2.5, textTransform: "none", fontWeight: 700, boxShadow: "none" }}
            >
              New Demo
            </Button>
          </PermissionGate>
          <IconButton onClick={loadDemos} sx={{ border: `1px solid ${border}`, borderRadius: 2 }}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* Stats Row */}
      {!loadingDemos && (
        <Grid container spacing={2} mb={3}>
          {[
            { label: "Total",      value: demos.length,      color: "#2563eb" },
            { label: "Scheduled",  value: scheduled.length,  color: "#ea580c" },
            { label: "Completed",  value: completed.length,  color: "#16a34a" },
            { label: "Cancelled",  value: cancelled.length,  color: "#dc2626" },
            { label: "No Show",    value: noShow.length,     color: "#ea580c" },
            { label: "Conv. Rate", value: `${convRate}%`,    color: "#7c3aed" },
          ].map(s => (
            <Grid item xs={6} sm={4} md={2.4} key={s.label}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5, bgcolor: surface, borderColor: border, textAlign: "center" }}>
                <Typography variant="h5" fontWeight={800} sx={{ color: s.color }}>{s.value}</Typography>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>{s.label}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Conversion Progress Bar */}
      {!loadingDemos && demos.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 2.5, bgcolor: surface, borderColor: border }}>
          <Stack direction="row" justifyContent="space-between" mb={1}>
            <Typography fontSize={13} fontWeight={600}>Conversion Progress</Typography>
            <Typography fontSize={13} fontWeight={700} color={convRate >= 50 ? "#16a34a" : "#ea580c"}>{convRate}%</Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={convRate}
            sx={{
              height: 10, borderRadius: 99,
              bgcolor: alpha("#e5e7eb", 0.5),
              "& .MuiLinearProgress-bar": {
                borderRadius: 99,
                background: convRate >= 50
                  ? "linear-gradient(90deg,#16a34a,#4ade80)"
                  : "linear-gradient(90deg,#2563eb,#60a5fa)",
              },
            }}
          />
          <Stack direction="row" spacing={2} mt={1} flexWrap="wrap">
            {[
              { label: "Scheduled", count: scheduled.length, color: "#2563eb" },
              { label: "Completed", count: completed.length, color: "#16a34a" },
              { label: "Cancelled", count: cancelled.length, color: "#dc2626" },
              { label: "No Show",   count: noShow.length,    color: "#ea580c" },
            ].map(s => (
              <Stack key={s.label} direction="row" spacing={0.5} alignItems="center">
                <Box sx={{ width: 8, height: 8, borderRadius: 99, bgcolor: s.color }} />
                <Typography fontSize={11} color="text.secondary">{s.label}: <b>{s.count}</b></Typography>
              </Stack>
            ))}
          </Stack>
        </Paper>
      )}

      {/* Tabs */}
      <Paper variant="outlined" sx={{ borderRadius: 2.5, bgcolor: surface, borderColor: border, mb: 3 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant={isMobile ? "scrollable" : "fullWidth"}
          scrollButtons="auto"
          sx={{ px: 1, "& .MuiTab-root": { textTransform: "none", fontWeight: 600 } }}
        >
          <Tab label={`All Demos (${demos.length})`} />
          <Tab label={`Scheduled (${scheduled.length})`} icon={<PendingIcon sx={{ fontSize: 16 }} />} iconPosition="start" />
          <Tab label={`Completed (${completed.length})`} icon={<DoneIcon sx={{ fontSize: 16 }} />} iconPosition="start" />
          <Tab
            label="Demo Suggestions"
            icon={<Badge badgeContent={suggestions.length || undefined} color="error"><AIIcon sx={{ fontSize: 16 }} /></Badge>}
            iconPosition="start"
          />
        </Tabs>
      </Paper>

      {/* Tab Content */}
      {tab !== 3 ? (
        loadingDemos ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress /></Box>
        ) : tabDemos.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 6, borderRadius: 2.5, textAlign: "center", borderColor: border }}>
            <ScienceIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
            <Typography color="text.secondary" fontWeight={500}>No demos found for this filter.</Typography>
          </Paper>
        ) : (
          <Grid container spacing={2}>
            {tabDemos.map(demo => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={demo.demo_id}>
                <DemoCard demo={demo} />
              </Grid>
            ))}
          </Grid>
        )
      ) : (
        /* AI Suggestions Tab */
        <Box>
          <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 2.5, bgcolor: alpha("#7c3aed", 0.04), borderColor: alpha("#7c3aed", 0.2) }}>
            <Stack direction="row" spacing={1.5} alignItems="flex-start">
              <AIIcon sx={{ color: "#7c3aed", mt: 0.3 }} />
              <Box>
                <Typography fontWeight={700} fontSize={14} sx={{ color: "#7c3aed" }}>Demo Suggestions</Typography>
                <Typography fontSize={12} color="text.secondary" mt={0.3}>
                  Distributors are ranked by a composite score: recency of last demo (35 pts) + priority score (30 pts) + group size (15 pts) + never-demoed bonus (20 pts). Higher score = schedule a demo sooner.
                </Typography>
              </Box>
            </Stack>
          </Paper>

          {loadingSuggestions ? (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 6, gap: 2 }}>
              <CircularProgress color="secondary" />
              <Typography fontSize={13} color="text.secondary">Running algorithm…</Typography>
            </Box>
          ) : suggestions.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 6, borderRadius: 2.5, textAlign: "center", borderColor: border }}>
              <AIIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
              <Typography color="text.secondary" fontWeight={500}>No suggestions available. Make sure distributors are active and scored.</Typography>
            </Paper>
          ) : (
            <Grid container spacing={2}>
              {suggestions.map((s, i) => (
                <Grid item xs={12} sm={6} md={4} key={s.distributor_id}>
                  <SuggestionCard s={s} rank={i + 1} />
                </Grid>
              ))}
            </Grid>
          )}
        </Box>
      )}

      {/* ── New Demo Dialog ── */}
      <DemoDialog
        open={newDemoOpen}
        onClose={() => { setNewDemoOpen(false); setSuggestedDistributor(null); }}
        onSuccess={() => { setNewDemoOpen(false); setSuggestedDistributor(null); loadDemos(); }}
      />

      {/* ── Status Update Dialog ── */}
      <Dialog
        open={statusDialog.open}
        onClose={() => setStatusDialog({ open: false, demo: null })}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <EditIcon color="primary" />
            Update Demo Status
          </Stack>
        </DialogTitle>
        <DialogContent>
          {statusDialog.demo && (
            <Typography fontSize={13} color="text.secondary" mb={2}>
              Updating <b>{statusDialog.demo.customer_name || statusDialog.demo.distributor_name}</b> — {fmtDate(statusDialog.demo.demo_date)}
            </Typography>
          )}
          <Stack spacing={2} mt={1}>
            {/* Status picker as chip group */}
            <Typography fontSize={13} fontWeight={600}>New Status</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {Object.entries(STATUS_META).map(([key, meta]) => (
                <Chip
                  key={key}
                  label={meta.label}
                  onClick={() => setNewStatus(key)}
                  sx={{
                    fontWeight: 700, cursor: "pointer",
                    bgcolor: newStatus === key ? alpha(meta.color, 0.15) : undefined,
                    color: newStatus === key ? meta.color : undefined,
                    border: `1px solid ${newStatus === key ? meta.color : "transparent"}`,
                  }}
                />
              ))}
            </Stack>
            <TextField
              label="Notes (optional)"
              multiline
              rows={2}
              fullWidth
              size="small"
              value={statusNote}
              onChange={e => setStatusNote(e.target.value)}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, justifyContent: "space-between" }}>
          <Button onClick={() => setStatusDialog({ open: false, demo: null })} sx={{ borderRadius: 2, textTransform: "none" }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={submitStatus}
            disabled={!newStatus || updating}
            startIcon={updating ? <CircularProgress size={14} color="inherit" /> : <DoneIcon />}
            sx={{ borderRadius: 2, textTransform: "none", fontWeight: 700, boxShadow: "none" }}
          >
            {updating ? "Saving…" : "Save Status"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
