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
import { AdminSessionsView } from "./AdminSessionsView";
import { useAuth } from "../contexts/AuthContext";
import { PERMISSIONS } from "../config/permissions";
import { automationAPI } from "../services/api";
import { useTranslation } from "../hooks/useTranslation";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

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
// ══════════════════════════════════════════════════════════════
// ACTIVITY LOGS PAGE
// ══════════════════════════════════════════════════════════════
export default function AdminLogs() {
  const { user, hasPermission } = useAuth();
  const { t } = useTranslation();
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterUserEmail, setFilterUserEmail] = useState("");
  const [filterActionType, setFilterActionType] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [activeTab, setActiveTab] = useState(0);
  const [total, setTotal] = useState(0);

  const loadActivities = async () => {
    if (!user || !hasPermission(PERMISSIONS.VIEW_ACTIVITY_LOGS)) return;
    try {
      setLoading(true);
      setError(null);
      const params: any = { limit: rowsPerPage, offset: page * rowsPerPage };
      if (filterUserEmail) params.user_email = filterUserEmail;
      if (filterActionType) params.action_type = filterActionType;
      if (selectedDate) params.selected_date = selectedDate;

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
  }, [user, page, rowsPerPage, filterUserEmail, filterActionType, selectedDate]);

  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    const isAware = dateString.endsWith("Z") || dateString.match(/[+-]\d{2}:\d{2}$/);
    const utcDate = isAware ? new Date(dateString) : new Date(dateString + "Z");
    if (isNaN(utcDate.getTime())) return "-";
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

  const clearDateFilter = () => {
    setSelectedDate("");
    setPage(0);
  };

  if (!user || !hasPermission(PERMISSIONS.VIEW_ACTIVITY_LOGS)) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <Alert severity="error">Access denied. You need activity log permissions.</Alert>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: { xs: 2, md: 3 } }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5, display: "flex", alignItems: "center", gap: 1 }}>
          <HistoryIcon color="primary" /> {t("admin.activityLogs", "User Activity Logs")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("admin.trackActions", "Track all user actions across the system")}
        </Typography>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}>
        <Tabs value={activeTab} onChange={(_e, newValue) => setActiveTab(newValue)}>
          <Tab label={t("admin.activityLogs", "User Activity Logs")} />
          <Tab label={t("admin.userSessions", "User Sessions")} />
        </Tabs>
      </Box>

      {/* Content based on Active Tab */}
      {activeTab === 0 && (
      <Card>
      <CardContent>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {t("admin.recentActivity", "Recent Activity")} ({total} {t("admin.total", "total")})
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
            <TextField fullWidth label={t("common.search", "Search")} variant="outlined" size="small" value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <TextField fullWidth label={t("admin.filterByUser", "Filter by User")} variant="outlined" size="small" select
              value={filterUserEmail} onChange={e => setFilterUserEmail(e.target.value)}>
              <MenuItem value="">{t("admin.allUsers", "All Users")}</MenuItem>
              {uniqueUsers.map(email => <MenuItem key={email} value={email}>{email}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} md={3}>
            <TextField fullWidth label={t("admin.filterByAction", "Filter by Action Type")} variant="outlined" size="small" select
              value={filterActionType} onChange={e => setFilterActionType(e.target.value)}>
              <MenuItem value="">{t("admin.allActions", "All Actions")}</MenuItem>
              {uniqueActionTypes.map(type => <MenuItem key={type} value={type}>{type}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              size="small"
              type="date"
              label={t("fields.date", "Date")}
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setPage(0);
              }}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <Button
              fullWidth
              variant="outlined"
              onClick={clearDateFilter}
              disabled={!selectedDate}
            >
              {t("common.clear", "Clear")}
            </Button>
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
                    <TableCell sx={{ fontWeight: 600 }}>{t("admin.user", "User")}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{t("admin.action", "Action")}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{t("admin.description", "Description")}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{t("admin.entity", "Entity")}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{t("admin.dateTime", "Date & Time")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredActivities.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">{t("admin.noActivities", "No activities found")}</Typography>
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
    )}

    {activeTab === 1 && <AdminSessionsView />}
  </Box>
  );
}
