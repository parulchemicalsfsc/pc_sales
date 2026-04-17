import { useState, useEffect, useCallback, useRef } from "react";
import {
  Box,
  Typography,
  Paper,
  Stack,
  Chip,
  CircularProgress,
  Alert,
  TextField,
  Avatar,
  useTheme,
  alpha,
} from "@mui/material";
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  CloudUpload as ImportIcon,
  CloudDownload as ExportIcon,
  Login as LoginIcon,
  Logout as LogoutIcon,
  Phone as PhoneIcon,
  ShoppingCart as SaleIcon,
  Payment as PaymentIcon,
  Person as PersonIcon,
  CalendarToday as CalendarIcon,
  Timeline as TimelineIcon,
  Timer as TimerIcon,
} from "@mui/icons-material";
import { activityAPI } from "../services/api";
import { useTranslation } from "../hooks/useTranslation";
import { useAuth } from "../contexts/AuthContext";
import { useSessionTracker } from "../hooks/useSessionTracker";

// ── Action icons & colors ──────────────────────────────────────
const ACTION_CONFIG: Record<
  string,
  { icon: React.ReactElement; color: string; bg: string }
> = {
  CREATE: {
    icon: <AddIcon sx={{ fontSize: 18 }} />,
    color: "#16a34a",
    bg: "#f0fdf4",
  },
  UPDATE: {
    icon: <EditIcon sx={{ fontSize: 18 }} />,
    color: "#2563eb",
    bg: "#eff6ff",
  },
  DELETE: {
    icon: <DeleteIcon sx={{ fontSize: 18 }} />,
    color: "#dc2626",
    bg: "#fef2f2",
  },
  VIEW: {
    icon: <ViewIcon sx={{ fontSize: 18 }} />,
    color: "#6b7280",
    bg: "#f9fafb",
  },
  IMPORT: {
    icon: <ImportIcon sx={{ fontSize: 18 }} />,
    color: "#7c3aed",
    bg: "#f5f3ff",
  },
  EXPORT: {
    icon: <ExportIcon sx={{ fontSize: 18 }} />,
    color: "#0891b2",
    bg: "#ecfeff",
  },
  LOGIN: {
    icon: <LoginIcon sx={{ fontSize: 18 }} />,
    color: "#059669",
    bg: "#ecfdf5",
  },
  LOGOUT: {
    icon: <LogoutIcon sx={{ fontSize: 18 }} />,
    color: "#d97706",
    bg: "#fffbeb",
  },
  CALL: {
    icon: <PhoneIcon sx={{ fontSize: 18 }} />,
    color: "#0d9488",
    bg: "#f0fdfa",
  },
};

const ENTITY_ICON: Record<string, React.ReactElement> = {
  sale: <SaleIcon sx={{ fontSize: 14 }} />,
  payment: <PaymentIcon sx={{ fontSize: 14 }} />,
  customer: <PersonIcon sx={{ fontSize: 14 }} />,
};

// ── Field label prettifier ─────────────────────────────────────
function prettyField(field: string): string {
  return field
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(val: any): string {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "object") {
    try {
      return JSON.stringify(val, null, 2);
    } catch (e) {
      return String(val);
    }
  }
  return String(val);
}

// ── Render before→after diff chips ────────────────────────────
function ChangeDiff({ changes }: { changes: { field: string; from: any; to: any }[] }) {
  if (!changes || changes.length === 0) return null;
  return (
    <Box sx={{ mt: 0.75, display: "flex", flexDirection: "column", gap: 0.5 }}>
      {changes.map((c, i) => {
        const isComplex = (typeof c.from === "object" && c.from !== null) || (typeof c.to === "object" && c.to !== null);
        
        return (
          <Box
            key={i}
            sx={{
              display: isComplex ? "block" : "inline-flex",
              alignItems: "center",
              gap: 0.4,
              bgcolor: "#f1f5f9",
              border: "1px solid #e2e8f0",
              borderRadius: 1.5,
              px: isComplex ? 1.5 : 0.9,
              py: isComplex ? 1 : 0.3,
              fontSize: "11px",
              fontFamily: "'JetBrains Mono','Fira Code',monospace",
              lineHeight: 1.4,
              width: "fit-content",
              maxWidth: "100%",
            }}
          >
            <Box component="span" sx={{ color: "#64748b", fontWeight: 600, display: isComplex ? "block" : "inline", mb: isComplex ? 0.5 : 0 }}>
              {prettyField(c.field)}:
            </Box>

            <Box
              component={isComplex ? "pre" : "span"}
              sx={{
                m: 0,
                display: isComplex ? "block" : "inline",
                color: "#dc2626",
                textDecoration: isComplex ? "none" : "line-through",
                opacity: 0.75,
                wordBreak: "break-all",
                whiteSpace: isComplex ? "pre-wrap" : "normal",
                bgcolor: isComplex ? alpha("#dc2626", 0.05) : "transparent",
                px: isComplex ? 1.5 : 0,
                py: isComplex ? 1 : 0,
                borderRadius: 1,
              }}
            >
              {formatValue(c.from)}
            </Box>

            <Box component="span" sx={{ color: "#64748b", display: isComplex ? "block" : "inline", my: isComplex ? 0.5 : 0, textAlign: "center" }}>
              {isComplex ? "↓" : "→"}
            </Box>

            <Box
              component={isComplex ? "pre" : "span"}
              sx={{
                m: 0,
                display: isComplex ? "block" : "inline",
                color: "#16a34a",
                fontWeight: 600,
                wordBreak: "break-all",
                whiteSpace: isComplex ? "pre-wrap" : "normal",
                bgcolor: isComplex ? alpha("#16a34a", 0.05) : "transparent",
                px: isComplex ? 1.5 : 0,
                py: isComplex ? 1 : 0,
                borderRadius: 1,
              }}
            >
              {formatValue(c.to)}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

function parseDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const isAware = dateStr.endsWith("Z") || dateStr.match(/[+-]\d{2}:\d{2}$/);
  return isAware ? new Date(dateStr) : new Date(dateStr + "Z");
}

function formatTime(dateStr: string): string {
  const d = parseDate(dateStr);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

// ── IST date helper ────────────────────────────────────────────
function getISTDateStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD
}

// ── Format seconds → HH:MM:SS ─────────────────────────────────
function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ── Multi-tab lock helpers ─────────────────────────────────────
const TAB_ID = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const LS_LEADER_KEY = "session_leader_tab";
const LS_LEADER_PING = "session_leader_ping";
const LEADER_TIMEOUT_MS = 5000; // If leader doesn't ping for 5s, take over

function claimLeadership() {
  localStorage.setItem(LS_LEADER_KEY, TAB_ID);
  localStorage.setItem(LS_LEADER_PING, String(Date.now()));
}

function isLeader(): boolean {
  const leader = localStorage.getItem(LS_LEADER_KEY);
  if (leader === TAB_ID) return true;
  // Check if leader is stale
  const lastPing = Number(localStorage.getItem(LS_LEADER_PING) || "0");
  if (Date.now() - lastPing > LEADER_TIMEOUT_MS) {
    claimLeadership();
    return true;
  }
  return false;
}

function pingLeader() {
  if (isLeader()) {
    localStorage.setItem(LS_LEADER_PING, String(Date.now()));
  }
}

export default function Activity() {
  const theme = useTheme();
  const { t } = useTranslation();
  const isDark = theme.palette.mode === "dark";
  const border = isDark ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)";
  const surface = isDark ? "#1e1e1e" : "#fff";

  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use global session tracker so timing continues across the whole website
  const { user } = useAuth();
  const { timerSeconds } = useSessionTracker({ userEmail: user?.email });

  // ── Load activity logs ─────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await activityAPI.getMyLogs(date);
      setLogs(res.logs || []);
    } catch (e: any) {
      setError(
        e?.response?.data?.detail ||
          e?.message ||
          "Failed to load activity logs",
      );
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const isToday = date === new Date().toISOString().split("T")[0];

  // Group logs by hour
  const grouped: Record<string, any[]> = {};
  logs.forEach((log) => {
    const d = parseDate(log.created_at);
    if (isNaN(d.getTime())) return;
    const hourStr = d.toLocaleString("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Kolkata",
    });
    const h = parseInt(hourStr, 10);
    const label =
      h < 12 ? `${h === 0 ? 12 : h} AM` : `${h === 12 ? 12 : h - 12} PM`;
    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(log);
  });

  return (
    <Box sx={{ maxWidth: 700, mx: "auto", p: { xs: 2, md: 3 } }}>
      {/* Header */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              gap: 1,
            }}
          >
            <TimelineIcon sx={{ color: "#7c3aed" }} />{" "}
            {t("activity.title", "User Activity")}
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: "text.secondary", mt: 0.25 }}
          >
            {isToday
              ? t("activity.todayLog", "Today's activity log")
              : `${t("activity.activityFor", "Activity for")} ${new Date(date).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5} alignItems="center">
          {/* Session Timer */}
          <Paper
            elevation={0}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              px: 1.5,
              py: 0.75,
              borderRadius: 2,
              border: `1px solid ${border}`,
              bgcolor: isDark
                ? "rgba(124,58,237,0.1)"
                : "rgba(124,58,237,0.06)",
            }}
          >
            <TimerIcon sx={{ fontSize: 18, color: "#7c3aed" }} />
            <Typography
              variant="body2"
              sx={{
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontWeight: 700,
                fontSize: "0.85rem",
                color: "#7c3aed",
                letterSpacing: "0.05em",
                minWidth: 64,
                textAlign: "center",
              }}
            >
              {formatDuration(timerSeconds)}
            </Typography>
          </Paper>
          <TextField
            type="date"
            size="small"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            inputProps={{ max: new Date().toISOString().split("T")[0] }}
            sx={{ width: 160, "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
          />
        </Stack>
      </Stack>

      {/* Stats */}
      <Stack direction="row" spacing={1.5} sx={{ mb: 3 }}>
        <Paper
          sx={{
            flex: 1,
            p: 1.5,
            borderRadius: 2.5,
            border: `1px solid ${border}`,
            bgcolor: surface,
            textAlign: "center",
          }}
        >
          <Typography variant="h5" sx={{ fontWeight: 800, color: "#2563eb" }}>
            {logs.length}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {t("activity.totalActions", "Total Actions")}
          </Typography>
        </Paper>
        {(["CREATE", "UPDATE", "DELETE"] as const).map((type) => {
          const count = logs.filter((l) => l.action_type === type).length;
          const cfg = ACTION_CONFIG[type];
          return (
            <Paper
              key={type}
              sx={{
                flex: 1,
                p: 1.5,
                borderRadius: 2.5,
                border: `1px solid ${border}`,
                bgcolor: surface,
                textAlign: "center",
              }}
            >
              <Typography
                variant="h5"
                sx={{ fontWeight: 800, color: cfg.color }}
              >
                {count}
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                {type === "CREATE"
                  ? t("activity.creates", "Creates")
                  : type === "UPDATE"
                    ? t("activity.updates", "Updates")
                    : t("activity.deletes", "Deletes")}
              </Typography>
            </Paper>
          );
        })}
      </Stack>

      {/* Timeline */}
      <Paper
        sx={{
          borderRadius: 3,
          border: `1px solid ${border}`,
          bgcolor: surface,
          overflow: "hidden",
        }}
      >
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress size={28} />
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ m: 2, borderRadius: 2 }}>
            {error}
          </Alert>
        ) : logs.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <CalendarIcon
              sx={{ fontSize: 48, color: "text.disabled", mb: 1 }}
            />
            <Typography
              variant="h6"
              sx={{ color: "text.disabled", fontWeight: 600 }}
            >
              {t("activity.noActivity", "No activity recorded")}
            </Typography>
            <Typography variant="body2" sx={{ color: "text.disabled" }}>
              {isToday
                ? t(
                    "activity.startWorking",
                    "Start working and your actions will appear here.",
                  )
                : t(
                    "activity.noActivityOnDay",
                    "No activity was logged on this day.",
                  )}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ p: 2 }}>
            {Object.entries(grouped).map(([hour, hourLogs]) => (
              <Box key={hour} sx={{ mb: 2 }}>
                <Typography
                  variant="overline"
                  sx={{
                    color: "text.secondary",
                    fontWeight: 700,
                    display: "block",
                    mb: 1,
                    fontSize: 11,
                  }}
                >
                  {hour}
                </Typography>
                <Stack spacing={1}>
                  {hourLogs.map((log: any, i: number) => {
                    const cfg =
                      ACTION_CONFIG[log.action_type] || ACTION_CONFIG.VIEW;
                    const entityIcon = ENTITY_ICON[log.entity_type] || null;
                    return (
                      <Box
                        key={log.id || i}
                        sx={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 1.5,
                          p: 1.5,
                          borderRadius: 2,
                          border: `1px solid ${border}`,
                          transition: "background .15s",
                          "&:hover": { bgcolor: alpha(cfg.color, 0.03) },
                        }}
                      >
                        <Avatar
                          sx={{
                            width: 34,
                            height: 34,
                            bgcolor: cfg.bg,
                            color: cfg.color,
                            flexShrink: 0,
                          }}
                        >
                          {cfg.icon}
                        </Avatar>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, lineHeight: 1.3 }}
                          >
                            {log.action_description ||
                              `${log.action_type} ${log.entity_type || ""}`}
                          </Typography>
                          {/* Show before/after diff if present */}
                          {log.metadata?.changes && (
                            <ChangeDiff changes={log.metadata.changes} />
                          )}
                          <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
                            sx={{ mt: 0.5 }}
                          >
                            <Typography
                              variant="caption"
                              sx={{ color: "text.secondary" }}
                            >
                              {formatTime(log.created_at)}
                            </Typography>
                            {log.entity_type && (
                              <Chip
                                size="small"
                                icon={entityIcon || undefined}
                                label={log.entity_type}
                                sx={{
                                  height: 20,
                                  fontSize: 10,
                                  bgcolor: cfg.bg,
                                  color: cfg.color,
                                  fontWeight: 600,
                                  "& .MuiChip-icon": { color: cfg.color },
                                }}
                              />
                            )}
                          </Stack>
                        </Box>
                        <Chip
                          size="small"
                          label={log.action_type}
                          sx={{
                            height: 22,
                            fontSize: 10,
                            fontWeight: 700,
                            bgcolor: cfg.bg,
                            color: cfg.color,
                          }}
                        />
                      </Box>
                    );
                  })}
                </Stack>
              </Box>
            ))}
          </Box>
        )}
      </Paper>
    </Box>
  );
}
