import { useState, useEffect, useCallback, useMemo } from "react";
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
  Tooltip,
  LinearProgress,
  Stack,
  CircularProgress,
  Snackbar,
} from "@mui/material";
import {
  Refresh as RefreshIcon,
  CalendarMonth as CalendarIcon,
  Phone as PhoneIcon,
  AssignmentTurnedIn as OrderIcon,
  AccessTime as TimeIcon,
  CheckCircle as CheckCircleIcon,
  ShoppingCart as ShoppingCartIcon,
  SearchOff as SearchOffIcon,
  PictureAsPdf as PdfIcon,
  TableChart as ExcelIcon,
  Download as DownloadIcon,
} from "@mui/icons-material";
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
import { reportsAPI, apiClient } from "../../services/api";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getToday = () => {
  const today = new Date().toISOString().split("T")[0];
  return { start: today, end: today };
};

const getYesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yest = d.toISOString().split("T")[0];
  return { start: yest, end: yest };
};

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

const getProgressColor = (pct: number) => {
  if (pct >= 80) return "success";
  if (pct >= 50) return "warning";
  return "error";
};

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

// ─── Main Component ──────────────────────────────────────────────────────────

export default function TelecallerMyReports() {
  const { user } = useAuth();
  const theme = useTheme();

  const thisMonth = getThisMonth();
  const [filters, setFilters] = useState({
    preset: "this_month",
    start_date: thisMonth.start,
    end_date: thisMonth.end,
    order_status: "all",
    view_by: "daily" as "daily" | "weekly" | "monthly",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [chartsData, setChartsData] = useState<any>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const myEmail = user?.email;

  // ── Download handler ──────────────────────────────────────────────────────
  const handleDownload = async (reportType: string, format: "pdf" | "excel") => {
    if (!myEmail) return;
    const downloadId = `${reportType}-${format}`;
    setDownloading(downloadId);
    setDownloadError(null);
    try {
      const blob = await reportsAPI.downloadTelecallerReport({
        report: reportType,
        format,
        start_date: filters.start_date,
        end_date: filters.end_date,
        telecaller_email: myEmail,
        order_status: filters.order_status === "all" ? undefined : filters.order_status,
        role: "telecaller",
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `My_${reportType}_${filters.start_date}.${format === "excel" ? "xlsx" : "pdf"}`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Download failed", err);
      setDownloadError("Failed to generate report. Please try again.");
    } finally {
      setDownloading(null);
    }
  };

  // ── Load data ─────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!myEmail) return;
    if (!filters.start_date || !filters.end_date) return;
    setLoading(true);
    setError(null);
    try {
      const [response, chartsRes] = await Promise.all([
        reportsAPI.getTelecallerDashboard({
          start_date: filters.start_date,
          end_date: filters.end_date,
          telecaller_email: myEmail,
          order_status: filters.order_status === "all" ? undefined : filters.order_status,
          role: "telecaller",
        }),
        reportsAPI.getTelecallerCharts({
          start_date: filters.start_date,
          end_date: filters.end_date,
          telecaller_email: myEmail,
          view_by: filters.view_by,
          role: "telecaller",
        }),
      ]);
      setData(response);
      setChartsData(chartsRes);
    } catch (e: any) {
      setError(e?.message || "Failed to load your reports");
    } finally {
      setLoading(false);
    }
  }, [myEmail, filters]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ── Preset helper ─────────────────────────────────────────────────────────
  const applyPreset = (preset: string) => {
    if (preset === "today") {
      const r = getToday();
      setFilters((f) => ({ ...f, preset, start_date: r.start, end_date: r.end }));
    } else if (preset === "yesterday") {
      const r = getYesterday();
      setFilters((f) => ({ ...f, preset, start_date: r.start, end_date: r.end }));
    } else if (preset === "this_month") {
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
  const myPerf = performance[0] || null; // scoped to self — only 1 row expected

  const tableHeaderStyle = {
    bgcolor: "rgba(0,0,0,0.02)",
    fontWeight: 700,
    color: "text.primary",
    borderBottom: "2px solid",
    borderColor: "divider",
    py: 2,
    position: "sticky" as const,
    top: 0,
    zIndex: 1,
  };

  // ── Download button helper ────────────────────────────────────────────────
  const DownloadButtons = ({ reportType }: { reportType: string }) => (
    <Stack direction="row" spacing={1}>
      <Button
        size="small"
        variant="outlined"
        color="error"
        startIcon={downloading === `${reportType}-pdf` ? <CircularProgress size={14} /> : <PdfIcon />}
        onClick={() => handleDownload(reportType, "pdf")}
        disabled={!!downloading}
        sx={{ fontWeight: 600, fontSize: "0.75rem" }}
      >
        PDF
      </Button>
      <Button
        size="small"
        variant="outlined"
        color="success"
        startIcon={downloading === `${reportType}-excel` ? <CircularProgress size={14} /> : <ExcelIcon />}
        onClick={() => handleDownload(reportType, "excel")}
        disabled={!!downloading}
        sx={{ fontWeight: 600, fontSize: "0.75rem" }}
      >
        Excel
      </Button>
    </Stack>
  );

  return (
    <Box sx={{ animation: "fadeIn 0.5s ease-in-out", "@keyframes fadeIn": { "0%": { opacity: 0 }, "100%": { opacity: 1 } } }}>

      {/* ── Header ── */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, color: "text.primary" }}>
          My Reports
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Your personal performance, attendance, call logs, and orders — download as PDF or Excel
        </Typography>
        {myEmail && (
          <Chip label={myEmail} size="small" sx={{ mt: 1, fontWeight: 600 }} color="primary" variant="outlined" />
        )}
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
              <ToggleButton value="today" sx={{ px: 2, fontWeight: 600 }}>Today</ToggleButton>
              <ToggleButton value="yesterday" sx={{ px: 2, fontWeight: 600 }}>Yesterday</ToggleButton>
              <ToggleButton value="this_month" sx={{ px: 2, fontWeight: 600 }}>This Month</ToggleButton>
              <ToggleButton value="last_month" sx={{ px: 2, fontWeight: 600 }}>Last Month</ToggleButton>
              <ToggleButton value="custom" sx={{ px: 2, fontWeight: 600 }}>Custom</ToggleButton>
            </ToggleButtonGroup>

            {filters.preset === "custom" && (
              <Box sx={{ display: "flex", gap: 2, ml: 1 }}>
                <TextField size="small" type="date" label="From" value={filters.start_date} onChange={(e) => setFilters((f) => ({ ...f, start_date: e.target.value }))} InputLabelProps={{ shrink: true }} sx={{ width: 160 }} />
                <TextField size="small" type="date" label="To" value={filters.end_date} onChange={(e) => setFilters((f) => ({ ...f, end_date: e.target.value }))} InputLabelProps={{ shrink: true }} sx={{ width: 160 }} />
              </Box>
            )}

            <Box sx={{ ml: "auto", display: "flex", gap: 1 }}>
              <Tooltip title="Refresh your reports">
                <span>
                  <Button size="small" variant="contained" color="primary" startIcon={<RefreshIcon />} onClick={loadAll} disabled={loading} sx={{ fontWeight: 600, px: 2 }}>
                    Refresh
                  </Button>
                </span>
              </Tooltip>
            </Box>
          </Box>

          <Divider sx={{ mb: 2 }} />

          <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
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

      {loading && <LinearProgress sx={{ mb: 3, borderRadius: 1 }} />}

      {/* ── KPI Cards ── */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard label="Total Calls" value={summary.total_calls || "0"} icon={<PhoneIcon fontSize="medium" />} color={theme.palette.primary.main} loading={loading} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard label="Total Orders" value={summary.total_orders || "0"} icon={<OrderIcon fontSize="medium" />} color={theme.palette.success.main} loading={loading} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard label="Orders Value" value={summary.total_order_value ? `₹${Number(summary.total_order_value).toLocaleString("en-IN")}` : "₹0"} icon={<ShoppingCartIcon fontSize="medium" />} color={theme.palette.warning.main} loading={loading} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard label="Days Present" value={summary.present_count || "0"} icon={<CheckCircleIcon fontSize="medium" />} color={theme.palette.info.main} loading={loading} />
        </Grid>
      </Grid>

      {/* ── My Performance Card ── */}
      {myPerf && (
        <Card sx={{ mb: 4, borderRadius: 2, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
          <CardContent>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>My Performance Summary</Typography>
              <DownloadButtons reportType="performance" />
            </Box>
            <Divider sx={{ mb: 2 }} />
            <Grid container spacing={2}>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">Total Calls</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>{myPerf.total_calls || 0}</Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">Avg Call Duration</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>{formatDuration(myPerf.avg_call_duration || 0)}</Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">Orders Generated</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>{myPerf.total_orders || 0}</Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">Conversion Rate</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: theme.palette.success.main }}>
                  {myPerf.conversion_rate ? `${Number(myPerf.conversion_rate).toFixed(1)}%` : "0%"}
                </Typography>
              </Grid>
              {myPerf.target_calls != null && (
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary">Target Progress</Typography>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2, mt: 0.5 }}>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(((myPerf.total_calls || 0) / myPerf.target_calls) * 100, 100)}
                      color={getProgressColor(((myPerf.total_calls || 0) / myPerf.target_calls) * 100) as any}
                      sx={{ flex: 1, height: 8, borderRadius: 4 }}
                    />
                    <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 60 }}>
                      {myPerf.total_calls || 0} / {myPerf.target_calls}
                    </Typography>
                  </Box>
                </Grid>
              )}
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* ── Attendance Section ── */}
      <Card sx={{ mb: 4, borderRadius: 2, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
        <CardContent>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>My Attendance</Typography>
            <DownloadButtons reportType="attendance" />
          </Box>
          <Divider sx={{ mb: 2 }} />
          {loading ? (
            <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 1 }} />
          ) : attendance.length === 0 ? (
            <EmptyState message="No attendance records for this period" />
          ) : (
            <TableContainer sx={{ maxHeight: 320 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={tableHeaderStyle}>Date</TableCell>
                    <TableCell sx={tableHeaderStyle}>Status</TableCell>
                    <TableCell sx={tableHeaderStyle}>Check In</TableCell>
                    <TableCell sx={tableHeaderStyle}>Check Out</TableCell>
                    <TableCell sx={tableHeaderStyle}>Hours</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {attendance.map((row: any, i: number) => (
                    <TableRow key={i} sx={{ "&:hover": { bgcolor: "action.hover" } }}>
                      <TableCell>{row.date || row.work_date || "-"}</TableCell>
                      <TableCell>
                        <Chip
                          label={row.status || (row.is_present ? "Present" : "Absent")}
                          size="small"
                          color={row.is_present || row.status === "present" ? "success" : "default"}
                          sx={{ fontWeight: 600 }}
                        />
                      </TableCell>
                      <TableCell>{row.check_in_time || row.login_time || "-"}</TableCell>
                      <TableCell>{row.check_out_time || row.logout_time || "-"}</TableCell>
                      <TableCell>{row.work_hours ? `${Number(row.work_hours).toFixed(1)}h` : "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* ── My Orders Section ── */}
      <Card sx={{ mb: 4, borderRadius: 2, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
        <CardContent>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>My Orders</Typography>
            <DownloadButtons reportType="user-orders" />
          </Box>
          <Divider sx={{ mb: 2 }} />
          {loading ? (
            <Skeleton variant="rectangular" height={180} sx={{ borderRadius: 1 }} />
          ) : orders.length === 0 ? (
            <EmptyState message="No orders found for this period" />
          ) : (
            <TableContainer sx={{ maxHeight: 360 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={tableHeaderStyle}>Date</TableCell>
                    <TableCell sx={tableHeaderStyle}>Customer</TableCell>
                    <TableCell sx={tableHeaderStyle}>Product</TableCell>
                    <TableCell sx={tableHeaderStyle} align="right">Qty</TableCell>
                    <TableCell sx={tableHeaderStyle} align="right">Amount</TableCell>
                    <TableCell sx={tableHeaderStyle}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {orders.map((row: any, i: number) => (
                    <TableRow key={i} sx={{ "&:hover": { bgcolor: "action.hover" } }}>
                      <TableCell>{row.order_date || row.created_at?.split("T")[0] || "-"}</TableCell>
                      <TableCell>{row.customer_name || row.sabhasad_name || "-"}</TableCell>
                      <TableCell>{row.product_name || "-"}</TableCell>
                      <TableCell align="right">{row.quantity || "-"}</TableCell>
                      <TableCell align="right">{row.total_amount ? `₹${Number(row.total_amount).toLocaleString("en-IN")}` : "-"}</TableCell>
                      <TableCell>
                        <Chip
                          label={row.status || "pending"}
                          size="small"
                          color={row.status === "approved" ? "success" : row.status === "rejected" ? "error" : "warning"}
                          sx={{ fontWeight: 600 }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Call Logs / Notes Section ── */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 2, boxShadow: "0 2px 8px rgba(0,0,0,0.05)", height: "100%" }}>
            <CardContent>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Call Logs</Typography>
                <DownloadButtons reportType="call-logs" />
              </Box>
              <Divider sx={{ mb: 2 }} />
              {loading ? (
                <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 1 }} />
              ) : callOutcomes.length === 0 ? (
                <EmptyState message="No call logs for this period" />
              ) : (
                <Box>
                  {callOutcomes.map((row: any, i: number) => (
                    <Box key={i} sx={{ display: "flex", justifyContent: "space-between", py: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, textTransform: "capitalize" }}>
                        {row.outcome || row.call_outcome || "Unknown"}
                      </Typography>
                      <Chip label={row.count || 0} size="small" color="primary" variant="outlined" />
                    </Box>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 2, boxShadow: "0 2px 8px rgba(0,0,0,0.05)", height: "100%" }}>
            <CardContent>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>My Notes</Typography>
                <DownloadButtons reportType="notes" />
              </Box>
              <Divider sx={{ mb: 2 }} />
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Download your notes as PDF or Excel for sharing.
              </Typography>
              <Stack direction="row" spacing={2}>
                <Button
                  variant="contained"
                  color="error"
                  startIcon={<PdfIcon />}
                  onClick={() => handleDownload("notes", "pdf")}
                  disabled={!!downloading}
                  sx={{ fontWeight: 600 }}
                >
                  {downloading === "notes-pdf" ? <CircularProgress size={18} color="inherit" /> : "Download Notes PDF"}
                </Button>
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<ExcelIcon />}
                  onClick={() => handleDownload("notes", "excel")}
                  disabled={!!downloading}
                  sx={{ fontWeight: 600 }}
                >
                  {downloading === "notes-excel" ? <CircularProgress size={18} color="inherit" /> : "Download Notes Excel"}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── Chart: Activity Over Time ── */}
      {chartsData?.trend_data && chartsData.trend_data.length > 0 && (
        <Card sx={{ mb: 4, borderRadius: 2, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>My Activity Trend</Typography>
            <Divider sx={{ mb: 2 }} />
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartsData.trend_data}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <RechartsTooltip />
                <Legend />
                <Bar dataKey="calls" fill={theme.palette.primary.main} name="Calls" radius={[4, 4, 0, 0]} />
                <Bar dataKey="orders" fill={theme.palette.success.main} name="Orders" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Download All Section ── */}
      <Card sx={{ mb: 4, borderRadius: 2, boxShadow: "0 2px 8px rgba(0,0,0,0.05)", background: "linear-gradient(135deg, #f8faff 0%, #eef2ff 100%)" }}>
        <CardContent>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
            <DownloadIcon sx={{ mr: 1, verticalAlign: "middle" }} />
            Download All Reports
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Download any report as PDF or Excel to share on WhatsApp or save offline.
          </Typography>
          <Grid container spacing={2}>
            {[
              { key: "performance", label: "Performance Report" },
              { key: "attendance", label: "Attendance Report" },
              { key: "call-logs", label: "Call Logs Report" },
              { key: "user-orders", label: "Orders Report" },
              { key: "notes", label: "Notes Report" },
            ].map(({ key, label }) => (
              <Grid item xs={12} sm={6} md={4} key={key}>
                <Box sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: 2, bgcolor: "background.paper" }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>{label}</Typography>
                  <Stack direction="row" spacing={1}>
                    <Button size="small" variant="outlined" color="error" startIcon={<PdfIcon />}
                      onClick={() => handleDownload(key, "pdf")} disabled={!!downloading} sx={{ fontWeight: 600, fontSize: "0.72rem" }}>
                      {downloading === `${key}-pdf` ? <CircularProgress size={12} /> : "PDF"}
                    </Button>
                    <Button size="small" variant="outlined" color="success" startIcon={<ExcelIcon />}
                      onClick={() => handleDownload(key, "excel")} disabled={!!downloading} sx={{ fontWeight: 600, fontSize: "0.72rem" }}>
                      {downloading === `${key}-excel` ? <CircularProgress size={12} /> : "Excel"}
                    </Button>
                  </Stack>
                </Box>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      <Snackbar
        open={!!downloadError}
        autoHideDuration={5000}
        onClose={() => setDownloadError(null)}
        message={downloadError}
      />
    </Box>
  );
}
