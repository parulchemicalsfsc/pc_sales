import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Button,
  TextField,
  MenuItem,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  useTheme,
  Divider,
  Skeleton,
  ToggleButton,
  ToggleButtonGroup,
  Autocomplete,
  Tooltip,
  LinearProgress,
  Avatar,
  Stack,
  CircularProgress,
  Snackbar,
} from "@mui/material";
import {
  Refresh as RefreshIcon,
  CalendarMonth as CalendarIcon,
  Group as PeopleIcon,
  Phone as PhoneIcon,
  AssignmentTurnedIn as OrderIcon,
  AccessTime as TimeIcon,
  CheckCircle as CheckCircleIcon,
  Leaderboard as LeaderboardIcon,
  ShoppingCart as ShoppingCartIcon,
  SearchOff as SearchOffIcon,
  PictureAsPdf as PdfIcon,
  TableChart as ExcelIcon,
  Download as DownloadIcon,
  Timeline as TimelineIcon,
  LocationOn as LocationIcon,
  Storefront as StoreIcon,
} from "@mui/icons-material";
import { DimensionTable } from "./DimensionTable";
import { KpiCard } from "./KpiCard";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useAuth } from "../../contexts/AuthContext";
import { reportsAPI } from "../../services/api";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getThisMonth = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const end = now.toISOString().split("T")[0];
  return { start, end };
};

const getLastMonth = () => {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  return {
    start: first.toISOString().split("T")[0],
    end: last.toISOString().split("T")[0],
  };
};

const formatDuration = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const extractNameFromEmail = (email: string) => {
  if (!email) return "Unknown";
  const part = email.split("@")[0];
  return part.split(/[\.\-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
};

const getRankDisplay = (rank: number) => {
  if (rank === 1) return "🥇 1";
  if (rank === 2) return "🥈 2";
  if (rank === 3) return "🥉 3";
  return rank.toString();
};

const getProgressColor = (pct: number) => {
  if (pct >= 80) return "success";
  if (pct >= 50) return "warning";
  return "error";
};

// ─── Components ──────────────────────────────────────────────────────────────


function EmptyState({ message }: { message: string }) {
  return (
    <Box sx={{ p: 6, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", opacity: 0.7 }}>
      <SearchOffIcon sx={{ fontSize: 64, color: "text.disabled", mb: 2 }} />
      <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 500 }}>
        {message}
      </Typography>
    </Box>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────

export default function TelecallerReports() {
  const { user } = useAuth();
  const theme = useTheme();

  const thisMonth = getThisMonth();
  const [filters, setFilters] = useState({
    preset: "this_month",
    start_date: thisMonth.start,
    end_date: thisMonth.end,
    telecaller_email: null as string | null,
    order_status: "all",
    view_by: "daily" as "daily" | "weekly" | "monthly",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [chartsData, setChartsData] = useState<any>(null);

  // Derive unique telecallers from performance data if possible, or leave empty
  const telecallerOptions = data?.performance?.map((p: any) => p.email) || [];

  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownload = async (reportType: string, format: "pdf" | "excel") => {
    const downloadId = `${reportType}-${format}`;
    setDownloading(downloadId);
    setDownloadError(null);
    try {
      const blob = await reportsAPI.downloadTelecallerReport({
        report: reportType,
        format,
        start_date: filters.start_date,
        end_date: filters.end_date,
        telecaller_email: filters.telecaller_email || undefined,
        order_status: filters.order_status === "all" ? undefined : filters.order_status,
      });

      // Handle the blob download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      // Note: Backend sets Content-Disposition header, but browser might require a filename fallback.
      // Usually passing no explicit download attribute tells the browser to respect Content-Disposition
      // But it's safer to provide a fallback name if needed, or just let it download.
      link.setAttribute("download", `Telecaller_${reportType}_${filters.start_date}.${format === "excel" ? "xlsx" : "pdf"}`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Download failed", err);
      if (err.response?.status === 404 || err.response?.status === 400) {
        setDownloadError("No data available to download.");
      } else {
        setDownloadError("Failed to generate report. Please try again.");
      }
    } finally {
      setDownloading(null);
    }
  };

  const loadAll = useCallback(async () => {
    if (!user?.email) return;
    setLoading(true);
    setError(null);
    try {
      const [response, chartsRes] = await Promise.all([
        reportsAPI.getTelecallerDashboard({
          start_date: filters.start_date,
          end_date: filters.end_date,
          telecaller_email: filters.telecaller_email || undefined,
          order_status: filters.order_status === "all" ? undefined : filters.order_status,
        }),
        reportsAPI.getTelecallerCharts({
          start_date: filters.start_date,
          end_date: filters.end_date,
          telecaller_email: filters.telecaller_email || undefined,
          view_by: filters.view_by,
        })
      ]);
      console.log("DEBUG: Frontend chartsRes:", chartsRes);
      setData(response);
      setChartsData(chartsRes);
    } catch (e: any) {
      setError(e?.message || "Failed to load telecaller dashboard");
    } finally {
      setLoading(false);
    }
  }, [user, filters]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const applyPreset = (preset: string) => {
    if (preset === "this_month") {
      const r = getThisMonth();
      setFilters((f) => ({ ...f, preset, start_date: r.start, end_date: r.end }));
    } else if (preset === "last_month") {
      const r = getLastMonth();
      setFilters((f) => ({ ...f, preset, start_date: r.start, end_date: r.end }));
    } else {
      setFilters((f) => ({ ...f, preset }));
    }
  };

  const summary = data?.summary || {};
  const performance = data?.performance || [];
  const callOutcomes = data?.call_outcomes || [];
  const attendance = data?.attendance || [];
  const orders = data?.orders || [];

  const tableHeaderStyle = {
    bgcolor: "rgba(0,0,0,0.02)",
    fontWeight: 700,
    color: "text.primary",
    borderBottom: "2px solid",
    borderColor: "divider",
    py: 2,
    position: "sticky",
    top: 0,
    zIndex: 1,
  };

  return (
    <Box sx={{ animation: "fadeIn 0.5s ease-in-out", "@keyframes fadeIn": { "0%": { opacity: 0 }, "100%": { opacity: 1 } } }}>
      
      {/* ── Header ── */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, color: "text.primary" }}>
          Telecaller Performance
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Analyze call logs, attendance, and generated orders
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* ── Filters ── */}
      <Card sx={{ mb: 4, borderRadius: 2, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
        <CardContent sx={{ pb: "16px !important" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", mb: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CalendarIcon fontSize="small" color="primary" />
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Time Period</Typography>
            </Box>
            <ToggleButtonGroup
              value={filters.preset}
              exclusive
              size="small"
              onChange={(_, v) => { if (v) applyPreset(v); }}
            >
              <ToggleButton value="this_month" sx={{ px: 3, fontWeight: 600 }}>This Month</ToggleButton>
              <ToggleButton value="last_month" sx={{ px: 3, fontWeight: 600 }}>Last Month</ToggleButton>
              <ToggleButton value="custom" sx={{ px: 3, fontWeight: 600 }}>Custom</ToggleButton>
            </ToggleButtonGroup>

            {filters.preset === "custom" && (
              <Box sx={{ display: "flex", gap: 2, ml: 1 }}>
                <TextField size="small" type="date" label="From" value={filters.start_date} onChange={(e) => setFilters((f) => ({ ...f, start_date: e.target.value }))} InputLabelProps={{ shrink: true }} sx={{ width: 160 }} />
                <TextField size="small" type="date" label="To" value={filters.end_date} onChange={(e) => setFilters((f) => ({ ...f, end_date: e.target.value }))} InputLabelProps={{ shrink: true }} sx={{ width: 160 }} />
              </Box>
            )}

            <Box sx={{ ml: "auto", display: "flex", gap: 1 }}>
              <Tooltip title="Refresh dashboard data">
                <Button size="small" variant="contained" color="primary" startIcon={<RefreshIcon />} onClick={loadAll} disabled={loading} sx={{ fontWeight: 600, px: 2 }}>
                  Refresh
                </Button>
              </Tooltip>
            </Box>
          </Box>

          <Divider sx={{ mb: 2.5 }} />

          <Box sx={{ display: "flex", alignItems: "center", gap: 3, flexWrap: "wrap" }}>
            <Autocomplete
              size="small"
              options={telecallerOptions}
              value={filters.telecaller_email}
              onChange={(_, v) => setFilters((f) => ({ ...f, telecaller_email: v }))}
              renderInput={(params) => <TextField {...params} label="Filter by Telecaller" placeholder="All Telecallers" />}
              sx={{ minWidth: 260 }}
            />
            <TextField
              select
              size="small"
              label="Order Status"
              value={filters.order_status}
              onChange={(e) => setFilters((f) => ({ ...f, order_status: e.target.value }))}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="all">All Orders</MenuItem>
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="approved">Approved</MenuItem>
              <MenuItem value="rejected">Rejected</MenuItem>
            </TextField>

            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
            
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "text.secondary" }}>View By:</Typography>
              <ToggleButtonGroup
                value={filters.view_by}
                exclusive
                size="small"
                onChange={(_, v) => { if (v) setFilters((f) => ({ ...f, view_by: v })); }}
              >
                <ToggleButton value="daily" sx={{ px: 2, fontWeight: 600 }}>Daily</ToggleButton>
                <ToggleButton value="weekly" sx={{ px: 2, fontWeight: 600 }}>Weekly</ToggleButton>
                <ToggleButton value="monthly" sx={{ px: 2, fontWeight: 600 }}>Monthly</ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* ── KPI Cards ── */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={4} lg={2.4}>
          <KpiCard
            label="Total Calls"
            value={summary.total_calls || "0"}
            icon={<PhoneIcon fontSize="medium" />}
            color={theme.palette.primary.main}
            loading={loading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={2.4}>
          <KpiCard
            label="Connected Calls"
            value={summary.connected_calls || "0"}
            percentage={summary.connected_pct !== undefined ? `${summary.connected_pct}%` : undefined}
            icon={<CheckCircleIcon fontSize="medium" />}
            color={theme.palette.success.main}
            loading={loading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={2.4}>
          <KpiCard
            label="Telecallers Present"
            value={summary.present_telecallers || "0"}
            subLabel={`Out of ${summary.total_telecallers || "0"} total`}
            icon={<PeopleIcon fontSize="medium" />}
            color={theme.palette.info.main}
            loading={loading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={2.4}>
          <KpiCard
            label="Orders Generated"
            value={summary.total_orders || "0"}
            percentage={summary.conversion_rate !== undefined ? `${summary.conversion_rate}% Conv.` : undefined}
            icon={<OrderIcon fontSize="medium" />}
            color={theme.palette.warning.main}
            loading={loading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={2.4}>
          <KpiCard
            label="Avg Call Duration"
            value={summary.avg_duration ? formatDuration(summary.avg_duration) : "0s"}
            icon={<TimeIcon fontSize="medium" />}
            color="#9c27b0"
            loading={loading}
          />
        </Grid>
      </Grid>

      {/* ── Main Tables Area ── */}
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, mt: 4, display: "flex", alignItems: "center", gap: 1 }}>
        <LeaderboardIcon color="primary" />
        Dimension Analysis
      </Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        
        {/* Performance Table */}
        <Grid item xs={12}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ p: 0 }}>
              <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "center", gap: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
                <Box sx={{ color: "primary.main" }}><LeaderboardIcon /></Box>
                <Typography variant="h6" sx={{ fontWeight: 700, fontSize: "0.95rem" }}>
                  Main Performance
                </Typography>
                <Chip label={performance.length} size="small" sx={{ ml: "auto" }} />
              </Box>
              
              {loading ? (
                <Box sx={{ p: 2 }}>{[...Array(5)].map((_, i) => <Skeleton key={i} height={40} sx={{ mb: 0.5 }} />)}</Box>
              ) : performance.length === 0 ? (
                <Box sx={{ p: 4, textAlign: "center" }}><Typography color="text.secondary" variant="body2">No data for selected filters</Typography></Box>
              ) : (
                <TableContainer sx={{ maxHeight: 340 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700, width: 36 }}>#</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Telecaller</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">Total Calls</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">Connected</TableCell>
                        <TableCell sx={{ fontWeight: 700, minWidth: 80 }} align="right">Connected %</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">Callback</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">Not Reachable</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">Wrong Number</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">Orders</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">Conversion %</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">Attendance %</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">Avg Duration</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {performance.map((row: any, i: number) => (
                        <TableRow 
                          key={row.email}
                          hover
                          sx={{ "&:nth-of-type(even)": { bgcolor: "action.hover" } }}
                        >
                          <TableCell>
                            <Typography variant="caption" sx={{ fontWeight: 700, color: i < 3 ? "warning.main" : "text.secondary" }}>
                              {i + 1}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {extractNameFromEmail(row.email)}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">{row.calls}</Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">{row.connected_calls || 0}</Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.5 }}>
                              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                                {row.connected_pct}%
                              </Typography>
                              <LinearProgress 
                                variant="determinate" 
                                value={row.connected_pct} 
                                sx={{ width: 50, height: 4, borderRadius: 2, bgcolor: "action.hover" }}
                                color="primary"
                              />
                            </Box>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" color="text.secondary">{row.callback || 0}</Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" color="text.secondary">{row.not_reachable || 0}</Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" color="text.secondary">{row.wrong_number || 0}</Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{row.orders}</Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" color="warning.main" sx={{ fontWeight: 600 }}>{row.conversion_pct}%</Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">{row.attendance_pct}%</Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" color="text.secondary">
                              {formatDuration(row.avg_duration)}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Call Outcomes Table */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ p: 0 }}>
              <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "center", gap: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
                <Box sx={{ color: "primary.main" }}><PhoneIcon /></Box>
                <Typography variant="h6" sx={{ fontWeight: 700, fontSize: "0.95rem" }}>
                  Call Outcomes
                </Typography>
                <Chip label={callOutcomes.length} size="small" sx={{ ml: "auto" }} />
              </Box>
              {loading ? (
                <Box sx={{ p: 2 }}>{[...Array(3)].map((_, i) => <Skeleton key={i} height={40} sx={{ mb: 0.5 }} />)}</Box>
              ) : callOutcomes.length === 0 ? (
                <Box sx={{ p: 4, textAlign: "center" }}><Typography color="text.secondary" variant="body2">No data</Typography></Box>
              ) : (
                <TableContainer sx={{ maxHeight: 340 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Outcome</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">Count</TableCell>
                        <TableCell sx={{ fontWeight: 700, minWidth: 80 }} align="right">Share</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {callOutcomes.map((row: any) => (
                        <TableRow key={row.outcome} hover sx={{ "&:nth-of-type(even)": { bgcolor: "action.hover" } }}>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{row.outcome}</Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">{row.count}</Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.5 }}>
                              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                                {row.percentage}%
                              </Typography>
                              <LinearProgress 
                                variant="determinate" 
                                value={row.percentage} 
                                sx={{ width: 50, height: 4, borderRadius: 2, bgcolor: "action.hover" }}
                                color="info"
                              />
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Attendance Summary */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ p: 0 }}>
              <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "center", gap: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
                <Box sx={{ color: "primary.main" }}><PeopleIcon /></Box>
                <Typography variant="h6" sx={{ fontWeight: 700, fontSize: "0.95rem" }}>
                  Attendance Summary
                </Typography>
                <Chip label={attendance.length} size="small" sx={{ ml: "auto" }} />
              </Box>
              {loading ? (
                <Box sx={{ p: 2 }}>{[...Array(3)].map((_, i) => <Skeleton key={i} height={40} sx={{ mb: 0.5 }} />)}</Box>
              ) : attendance.length === 0 ? (
                <Box sx={{ p: 4, textAlign: "center" }}><Typography color="text.secondary" variant="body2">No data</Typography></Box>
              ) : (
                <TableContainer sx={{ maxHeight: 340 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Telecaller</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">Present</TableCell>
                        <TableCell sx={{ fontWeight: 700, minWidth: 80 }} align="right">Att %</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {attendance.map((row: any) => (
                        <TableRow key={row.email} hover sx={{ "&:nth-of-type(even)": { bgcolor: "action.hover" } }}>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {extractNameFromEmail(row.email)}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">{row.present_days}</Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.5 }}>
                              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                                {row.attendance_pct}%
                              </Typography>
                              <LinearProgress 
                                variant="determinate" 
                                value={row.attendance_pct} 
                                sx={{ width: 50, height: 4, borderRadius: 2, bgcolor: "action.hover" }}
                                color="success"
                              />
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Orders Summary */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ p: 0 }}>
              <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "center", gap: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
                <Box sx={{ color: "primary.main" }}><OrderIcon /></Box>
                <Typography variant="h6" sx={{ fontWeight: 700, fontSize: "0.95rem" }}>
                  Orders Summary
                </Typography>
                <Chip label={orders.length} size="small" sx={{ ml: "auto" }} />
              </Box>
              {loading ? (
                <Box sx={{ p: 2 }}>{[...Array(3)].map((_, i) => <Skeleton key={i} height={40} sx={{ mb: 0.5 }} />)}</Box>
              ) : orders.length === 0 ? (
                <Box sx={{ p: 4, textAlign: "center" }}><Typography color="text.secondary" variant="body2">No data</Typography></Box>
              ) : (
                <TableContainer sx={{ maxHeight: 340 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Telecaller</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">Total</TableCell>
                        <TableCell sx={{ fontWeight: 700, minWidth: 80 }} align="right">Approval %</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {orders.map((row: any) => (
                        <TableRow key={row.email} hover sx={{ "&:nth-of-type(even)": { bgcolor: "action.hover" } }}>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {extractNameFromEmail(row.email)}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">{row.total_orders}</Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.5 }}>
                              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                                {row.approval_rate}%
                              </Typography>
                              <LinearProgress 
                                variant="determinate" 
                                value={row.approval_rate} 
                                sx={{ width: 50, height: 4, borderRadius: 2, bgcolor: "action.hover" }}
                                color="warning"
                              />
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Grid>
        
      </Grid>

      {/* ── Geographical Analysis ── */}
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, mt: 4, display: "flex", alignItems: "center", gap: 1 }}>
        <LocationIcon color="primary" />
        Geographical Analysis
      </Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <DimensionTable
            title="Telecalling by District"
            icon={<LocationIcon />}
            rows={data?.district_breakdown || []}
            loading={loading}
            colLabel="District"
            mode="telecaller"
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <DimensionTable
            title="Telecalling by Village"
            icon={<StoreIcon />}
            rows={data?.village_breakdown || []}
            loading={loading}
            colLabel="Village"
            colSub="District"
            mode="telecaller"
          />
        </Grid>
      </Grid>

      {/* ── Performance Analytics Charts ── */}
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, mt: 4, display: "flex", alignItems: "center", gap: 1 }}>
        <TimelineIcon color="primary" />
        Performance Analytics
      </Typography>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Calls Trend (Bar) */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: "100%", borderRadius: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>Calls Trend</Typography>
              <Box sx={{ width: "100%", height: 300 }}>
                {loading ? <Skeleton variant="rectangular" width="100%" height="100%" /> : (
                  <ResponsiveContainer>
                    <BarChart data={chartsData?.calls_trend || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <RechartsTooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                      <Bar dataKey="calls" name="Total Calls" fill={theme.palette.primary.main} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Orders Trend (Bar) */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: "100%", borderRadius: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>Orders Trend</Typography>
              <Box sx={{ width: "100%", height: 300 }}>
                {loading ? <Skeleton variant="rectangular" width="100%" height="100%" /> : (
                  <ResponsiveContainer>
                    <BarChart data={chartsData?.orders_trend || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <RechartsTooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                      <Bar dataKey="orders" name="Orders Generated" fill={theme.palette.warning.main} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Call Outcomes (Stacked Bar) */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: "100%", borderRadius: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>Call Outcome Analysis</Typography>
              <Box sx={{ width: "100%", height: 300 }}>
                {loading ? <Skeleton variant="rectangular" width="100%" height="100%" /> : (
                  <ResponsiveContainer>
                    <BarChart data={chartsData?.outcomes_trend || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <RechartsTooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                      <Legend />
                      <Bar dataKey="connected" stackId="a" name="Connected" fill={theme.palette.success.main} />
                      <Bar dataKey="callback" stackId="a" name="Callback" fill={theme.palette.info.main} />
                      <Bar dataKey="not_reachable" stackId="a" name="Not Reachable" fill={theme.palette.warning.main} />
                      <Bar dataKey="wrong_number" stackId="a" name="Wrong Number" fill={theme.palette.error.main} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Top Performing Telecallers (Horizontal Bar) */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: "100%", borderRadius: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>Top Performing Telecallers</Typography>
              <Box sx={{ width: "100%", height: 300 }}>
                {loading ? <Skeleton variant="rectangular" width="100%" height="100%" /> : (
                  <ResponsiveContainer>
                    <BarChart layout="vertical" data={chartsData?.top_telecallers?.map((t: any) => ({ ...t, name: extractNameFromEmail(t.telecaller_email) })) || []} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 12 }} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={80} />
                      <RechartsTooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                      <Bar dataKey="orders_generated" name="Orders Generated" fill={theme.palette.secondary.main} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>



      {/* ── Enhanced Downloads Section ── */}
      <Card sx={{ mt: 2, mb: 3 }}>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", justifyItems: "space-between", gap: 1, mb: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <DownloadIcon color="primary" />
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Enhanced Downloads
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
              Downloads match your active filters exactly.
            </Typography>
          </Box>
          <Grid container spacing={2}>
            {[
              { key: "performance", label: "Performance PDF", format: "pdf", color: "primary" as const, icon: <PdfIcon /> },
              { key: "performance", label: "Performance Excel", format: "excel", color: "success" as const, icon: <ExcelIcon /> },
              { key: "attendance", label: "Attendance PDF", format: "pdf", color: "info" as const, icon: <PdfIcon /> },
              { key: "attendance", label: "Attendance Excel", format: "excel", color: "success" as const, icon: <ExcelIcon /> },
              { key: "call-logs", label: "Call Logs PDF", format: "pdf", color: "secondary" as const, icon: <PdfIcon /> },
              { key: "call-logs", label: "Call Logs Excel", format: "excel", color: "success" as const, icon: <ExcelIcon /> },
              { key: "orders", label: "Orders PDF", format: "pdf", color: "warning" as const, icon: <PdfIcon /> },
              { key: "orders", label: "Orders Excel", format: "excel", color: "success" as const, icon: <ExcelIcon /> },
            ].map((item, idx) => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={idx}>
                <Button
                  fullWidth
                  variant="outlined"
                  color={item.color}
                  startIcon={
                    downloading === `${item.key}-${item.format}` ? <CircularProgress size={16} color="inherit" /> : item.icon
                  }
                  onClick={() => handleDownload(item.key, item.format as "pdf" | "excel")}
                  disabled={downloading !== null}
                  sx={{ fontWeight: 600, py: 1 }}
                >
                  {item.label}
                </Button>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      {/* Error Snackbar */}
      <Snackbar
        open={!!downloadError}
        autoHideDuration={6000}
        onClose={() => setDownloadError(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="error" onClose={() => setDownloadError(null)} sx={{ fontWeight: 600 }}>
          {downloadError}
        </Alert>
      </Snackbar>
    </Box>
  );
}
