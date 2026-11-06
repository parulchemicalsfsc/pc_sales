import { useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Button,
  IconButton,
  Tooltip,
  LinearProgress,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Collapse,
  useTheme,
  Stack,
  TextField,
  MenuItem,
} from "@mui/material";
import {
  Schedule as TimeIcon,
  Phone as PhoneIcon,
  CheckCircle as ConvertedIcon,
  Flag as TargetIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  CalendarMonth as CalendarIcon,
  TrendingUp,
} from "@mui/icons-material";
import { useQuery } from "@tanstack/react-query";
import { automationAPI } from "../services/api";
import { useAuth } from "../contexts/AuthContext";

export default function MyPerformanceWidget() {
  const theme = useTheme();
  const { user, role } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [dateFilter, setDateFilter] = useState<string>("month"); // "today" | "week" | "month" | "all"

  // Compute date range
  const getDateRange = () => {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    if (dateFilter === "today") {
      return { start: todayStr, end: todayStr };
    } else if (dateFilter === "week") {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      return { start: d.toISOString().split("T")[0], end: todayStr };
    } else if (dateFilter === "month") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      return { start: firstDay, end: todayStr };
    }
    return { start: undefined, end: undefined };
  };

  const { start, end } = getDateRange();

  const {
    data: perf,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["my-performance", user?.email, dateFilter, start, end],
    queryFn: () =>
      automationAPI.getMyPerformance({
        start_date: start,
        end_date: end,
      }),
    enabled: !!user?.email,
    staleTime: 60 * 1000,
  });

  const dailyHours = perf?.daily_working_hours || [];
  const recentOrders = perf?.recent_conversions || [];

  return (
    <Card
      elevation={2}
      sx={{
        mb: 3,
        borderRadius: 3,
        border: `1px solid ${theme.palette.divider}`,
        background: `linear-gradient(135deg, ${theme.palette.background.paper} 0%, ${theme.palette.action.hover} 100%)`,
      }}
    >
      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
        {/* Header */}
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            justifyContent: "space-between",
            alignItems: { xs: "flex-start", sm: "center" },
            gap: 1.5,
            mb: 2.5,
          }}
        >
          <Box>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="h6" sx={{ fontWeight: 700, color: "text.primary" }}>
                My Performance &amp; Reports
              </Typography>
              <Chip
                label={role ? role.replace("_", " ").toUpperCase() : "STAFF"}
                size="small"
                color="primary"
                variant="outlined"
                sx={{ fontSize: "0.7rem", height: 20 }}
              />
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Live tracking of your working hours, calling targets, and conversions
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              select
              size="small"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              sx={{ minWidth: 130 }}
            >
              <MenuItem value="today">Today</MenuItem>
              <MenuItem value="week">Last 7 Days</MenuItem>
              <MenuItem value="month">This Month</MenuItem>
              <MenuItem value="all">All Time</MenuItem>
            </TextField>

            <Tooltip title="Refresh Performance">
              <IconButton size="small" onClick={() => refetch()} disabled={isFetching}>
                <RefreshIcon fontSize="small" sx={{ animation: isFetching ? "spin 1s linear infinite" : "none" }} />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>

        {isLoading ? (
          <Box sx={{ width: "100%", py: 3 }}>
            <LinearProgress />
          </Box>
        ) : (
          <>
            {/* 4 Performance KPI Cards */}
            <Grid container spacing={2}>
              {/* 1. Total Working Hours */}
              <Grid item xs={12} sm={6} md={3}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    height: "100%",
                    borderRadius: 2,
                    bgcolor: "background.paper",
                    borderColor: "#1976d240",
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>
                        TOTAL WORKING HOURS
                      </Typography>
                      <Typography variant="h5" sx={{ fontWeight: 700, color: "#1976d2", my: 0.5 }}>
                        {perf?.total_working_formatted || "0s"}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Today: <strong>{perf?.today_working_formatted || "0s"}</strong>
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        p: 1,
                        borderRadius: 1.5,
                        bgcolor: "#1976d215",
                        color: "#1976d2",
                        display: "flex",
                      }}
                    >
                      <TimeIcon />
                    </Box>
                  </Stack>
                </Paper>
              </Grid>

              {/* 2. Target Given */}
              <Grid item xs={12} sm={6} md={3}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    height: "100%",
                    borderRadius: 2,
                    bgcolor: "background.paper",
                    borderColor: "#ed6c0240",
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>
                        TARGET GIVEN
                      </Typography>
                      <Typography variant="h5" sx={{ fontWeight: 700, color: "#ed6c02", my: 0.5 }}>
                        {perf?.target_calls ?? 0}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Assigned calls in queue
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        p: 1,
                        borderRadius: 1.5,
                        bgcolor: "#ed6c0215",
                        color: "#ed6c02",
                        display: "flex",
                      }}
                    >
                      <TargetIcon />
                    </Box>
                  </Stack>
                </Paper>
              </Grid>

              {/* 3. Calls Attempted vs Target */}
              <Grid item xs={12} sm={6} md={3}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    height: "100%",
                    borderRadius: 2,
                    bgcolor: "background.paper",
                    borderColor: "#2e7d3240",
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box sx={{ width: "100%" }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>
                        CALLS ATTEMPTED
                      </Typography>
                      <Typography variant="h5" sx={{ fontWeight: 700, color: "#2e7d32", my: 0.5 }}>
                        {perf?.calls_attempted ?? 0}{" "}
                        <Typography component="span" variant="body2" color="text.secondary">
                          / {perf?.target_calls ?? 0}
                        </Typography>
                      </Typography>
                      <Box sx={{ mt: 1 }}>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min(100, perf?.completion_rate || 0)}
                          sx={{ height: 6, borderRadius: 3, bgcolor: "action.hover" }}
                          color="success"
                        />
                        <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
                          <Typography variant="caption" color="text.secondary">
                            {perf?.completion_rate ?? 0}% completed
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {perf?.pending_calls ?? 0} pending
                          </Typography>
                        </Stack>
                      </Box>
                    </Box>
                    <Box
                      sx={{
                        p: 1,
                        borderRadius: 1.5,
                        bgcolor: "#2e7d3215",
                        color: "#2e7d32",
                        display: "flex",
                        ml: 1,
                      }}
                    >
                      <PhoneIcon />
                    </Box>
                  </Stack>
                </Paper>
              </Grid>

              {/* 4. Leads Converted */}
              <Grid item xs={12} sm={6} md={3}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    height: "100%",
                    borderRadius: 2,
                    bgcolor: "background.paper",
                    borderColor: "#9c27b040",
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>
                        LEADS CONVERTED
                      </Typography>
                      <Typography variant="h5" sx={{ fontWeight: 700, color: "#9c27b0", my: 0.5 }}>
                        {perf?.leads_converted ?? 0}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Conversion Rate: <strong>{perf?.conversion_rate ?? 0}%</strong>
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        p: 1,
                        borderRadius: 1.5,
                        bgcolor: "#9c27b015",
                        color: "#9c27b0",
                        display: "flex",
                      }}
                    >
                      <ConvertedIcon />
                    </Box>
                  </Stack>
                </Paper>
              </Grid>
            </Grid>

            {/* Toggle Detailed Breakdown Button */}
            <Box sx={{ mt: 2, display: "flex", justifyContent: "center" }}>
              <Button
                size="small"
                variant="text"
                onClick={() => setExpanded(!expanded)}
                endIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                sx={{ textTransform: "none", fontWeight: 600 }}
              >
                {expanded ? "Hide Daily Working Hours & Breakdown" : "View Daily Working Hours with Dates"}
              </Button>
            </Box>

            {/* Collapsible Daily Working Hours Breakdown Table */}
            <Collapse in={expanded} timeout="auto" unmountOnExit>
              <Box sx={{ mt: 2, pt: 2, borderTop: `1px dashed ${theme.palette.divider}` }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, display: "flex", alignItems: "center", gap: 1 }}>
                  <CalendarIcon fontSize="small" color="primary" />
                  Daily Working Hours Breakdown
                </Typography>

                {dailyHours.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                    No session activity recorded for this period. Active tab timer will log hours as you work.
                  </Typography>
                ) : (
                  <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 260, borderRadius: 2 }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Working Duration</TableCell>
                          <TableCell sx={{ fontWeight: 700 }} align="right">Hours</TableCell>
                          <TableCell sx={{ fontWeight: 700 }} align="right">Status</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {dailyHours.map((row: any) => (
                          <TableRow key={row.date} hover>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {row.date}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={row.formatted}
                                size="small"
                                sx={{ fontWeight: 600, bgcolor: "#1976d215", color: "#1976d2" }}
                              />
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2">{row.hours}h</Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Chip
                                label={row.hours >= 4 ? "Full Day" : row.hours > 0 ? "Half Day / Active" : "Inactive"}
                                size="small"
                                color={row.hours >= 4 ? "success" : row.hours > 0 ? "warning" : "default"}
                                variant="outlined"
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Box>
            </Collapse>
          </>
        )}
      </CardContent>
    </Card>
  );
}

