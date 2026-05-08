import { useState, useEffect, useCallback } from "react";
import {
  Box, Card, CardContent, Typography, Grid, Chip, CircularProgress,
  Alert, Paper, Divider, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Avatar, Tooltip,
} from "@mui/material";
import {
  TrendingUp as TrendingUpIcon,
  Assignment as AssignmentIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Warning as WarningIcon,
  Inbox as InboxIcon,
  AccessTime as AccessTimeIcon,
  WorkOutline as WorkIcon,
} from "@mui/icons-material";
import { useAuth } from "../contexts/AuthContext";
import { leadsService, PipelineStats, Lead } from "../services/leadsService";

const STATUS_COLOR: Record<string, string> = {
  Unassigned: "#9e9e9e",
  Assigned: "#2196f3",
  "In Progress": "#ff9800",
  "Follow-up": "#ff5722",
  Converted: "#4caf50",
  Rejected: "#f44336",
};

function StatCard({
  title, value, icon, color, subtitle,
}: {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
}) {
  return (
    <Card sx={{ height: "100%", position: "relative", overflow: "hidden" }}>
      <Box
        sx={{
          position: "absolute", top: 0, right: 0, width: 80, height: 80,
          borderRadius: "0 0 0 80px",
          bgcolor: color + "20",
          display: "flex", alignItems: "flex-start", justifyContent: "flex-end",
          p: 1,
        }}
      >
        <Box sx={{ color }}>{icon}</Box>
      </Box>
      <CardContent>
        <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase" letterSpacing={0.5}>
          {title}
        </Typography>
        <Typography variant="h3" fontWeight={700} sx={{ my: 0.5, color }}>
          {value}
        </Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
        )}
      </CardContent>
    </Card>
  );
}

export default function LeadDashboard() {
  const { user, role } = useAuth();
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [myLeads, setMyLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isOwner = role === "lead_owner";
  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      const [statsRes] = await Promise.all([leadsService.getPipelineStats()]);
      setStats(statsRes.data);

      if (isOwner) {
        const myRes = await leadsService.getMy();
        setMyLeads(myRes.data.leads || []);
      }
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, [user, isOwner]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
      <CircularProgress />
    </Box>
  );

  if (error) return <Alert severity="error">{error}</Alert>;

  const s = stats!;
  const rejectionRate = s.total > 0 ? ((s.rejected / s.total) * 100).toFixed(1) : "0";

  return (
    <Box>
      {/* Header */}
      <Box mb={4}>
        <Typography variant="h4" fontWeight={700}>
          {isOwner ? "My Lead Dashboard" : "Lead Pipeline Dashboard"}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {isOwner
            ? "Your assigned leads, follow-ups, and notifications at a glance"
            : "Full pipeline overview — all sources, all owners"}
        </Typography>
      </Box>

      {/* KPI Cards */}
      <Grid container spacing={3} mb={4}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Total Leads" value={s.total} icon={<TrendingUpIcon />} color="#6366f1" />
        </Grid>
        {!isOwner && (
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="Unassigned" value={s.unassigned} icon={<InboxIcon />} color="#9e9e9e"
              subtitle="Waiting for assignment" />
          </Grid>
        )}
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="In Progress" value={s.in_progress + s.follow_up + s.assigned} icon={<WorkIcon />} color="#ff9800"
            subtitle="Active leads" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Overdue" value={s.overdue} icon={<WarningIcon />} color="#f44336"
            subtitle="Follow-up date passed" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Converted This Month" value={s.converted_this_month} icon={<CheckCircleIcon />} color="#4caf50" />
        </Grid>
        {!isOwner && (
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="Rejection Rate" value={`${rejectionRate}%`} icon={<CancelIcon />} color="#ef5350" />
          </Grid>
        )}
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Total Converted" value={s.converted} icon={<CheckCircleIcon />} color="#2e7d32" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Total Rejected" value={s.rejected} icon={<CancelIcon />} color="#b71c1c" />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Status Breakdown */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={2}>Leads by Status</Typography>
              <Box display="flex" flexDirection="column" gap={1.5}>
                {Object.entries(s.by_status).map(([status, count]) => (
                  <Box key={status}>
                    <Box display="flex" justifyContent="space-between" mb={0.5}>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: STATUS_COLOR[status] || "#999" }} />
                        <Typography variant="body2">{status}</Typography>
                      </Box>
                      <Typography variant="body2" fontWeight={600}>{count}</Typography>
                    </Box>
                    <Box sx={{ height: 6, bgcolor: "action.hover", borderRadius: 3, overflow: "hidden" }}>
                      <Box sx={{
                        height: "100%", borderRadius: 3,
                        bgcolor: STATUS_COLOR[status] || "#999",
                        width: `${s.total > 0 ? (count / s.total) * 100 : 0}%`,
                        transition: "width 0.6s ease",
                      }} />
                    </Box>
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Source Breakdown */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={2}>Leads by Source Website</Typography>
              {Object.keys(s.by_source).length === 0 ? (
                <Typography color="text.secondary" variant="body2">No data yet</Typography>
              ) : (
                <Box display="flex" flexDirection="column" gap={2}>
                  {Object.entries(s.by_source).map(([src, count]) => (
                    <Box key={src} display="flex" alignItems="center" gap={2}>
                      <Avatar sx={{ width: 36, height: 36, bgcolor: "primary.main", fontSize: 13 }}>
                        {src.slice(0, 2).toUpperCase()}
                      </Avatar>
                      <Box flex={1}>
                        <Typography variant="body2" fontWeight={600}>{src}</Typography>
                        <Typography variant="caption" color="text.secondary">{count} lead{count !== 1 ? "s" : ""}</Typography>
                      </Box>
                      <Chip label={count} size="small" color="primary" variant="outlined" />
                    </Box>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Owner view: My active leads table */}
        {isOwner && myLeads.length > 0 && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight={600} mb={2}>My Active Leads</Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Lead ID</TableCell>
                        <TableCell>Name</TableCell>
                        <TableCell>Company</TableCell>
                        <TableCell>Product</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Follow-up Date</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {myLeads
                        .filter((l) => !["Converted", "Rejected"].includes(l.status))
                        .slice(0, 10)
                        .map((lead) => {
                          const isOverdue = lead.follow_up_date && lead.follow_up_date < today;
                          return (
                            <TableRow key={lead.lead_id} hover>
                              <TableCell><Typography variant="body2" fontFamily="monospace">{lead.lead_id}</Typography></TableCell>
                              <TableCell>{lead.full_name}</TableCell>
                              <TableCell>{lead.company_name || "—"}</TableCell>
                              <TableCell>{lead.product_interest || "—"}</TableCell>
                              <TableCell>
                                <Chip label={lead.status} size="small"
                                  sx={{ bgcolor: STATUS_COLOR[lead.status] + "22", color: STATUS_COLOR[lead.status], fontWeight: 600 }} />
                              </TableCell>
                              <TableCell>
                                <Tooltip title={isOverdue ? "Overdue!" : ""}>
                                  <Typography variant="body2" color={isOverdue ? "error" : "text.primary"}
                                    display="flex" alignItems="center" gap={0.5}>
                                    {isOverdue && <WarningIcon sx={{ fontSize: 14 }} />}
                                    {lead.follow_up_date || "—"}
                                  </Typography>
                                </Tooltip>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Manager view: overdue leads table */}
        {!isOwner && s.overdue > 0 && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={1} mb={2}>
                  <WarningIcon color="error" />
                  <Typography variant="h6" fontWeight={600} color="error.main">Overdue Follow-ups</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" mb={2}>
                  {s.overdue} lead{s.overdue !== 1 ? "s" : ""} with follow-up date in the past — action required.
                </Typography>
                <Divider />
                <Box mt={1}>
                  <Typography variant="caption" color="text.secondary">
                    Go to the <strong>Leads Pipeline</strong> page, filter by status to find overdue leads and take action.
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>
    </Box>
  );
}
