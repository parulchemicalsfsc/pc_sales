import { useEffect, useState, useCallback } from "react";
import {
    Box,
    Grid,
    Card,
    CardContent,
    Typography,
    Button,
    Paper,
    useTheme,
    Chip,
    TextField,
    IconButton,
    Tooltip,
    Skeleton,
} from "@mui/material";
import {
    TrendingUp,
    AttachMoney,
    People,
    Timeline,
    ShowChart,
    Receipt,
    PersonAdd,
    ShoppingCart,
    Science,
    Payment,
    ArrowForward,
    Schedule,
    Refresh as RefreshIcon,
    Lock as LockIcon,
} from "@mui/icons-material";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    Legend,
    ResponsiveContainer,
} from "recharts";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "../hooks/useTranslation";
import { dashboardAPI, reportsAPI } from "../services/api";
import {
    DashboardSkeleton,
    MetricCardSkeleton,
    ChartSkeleton,
    ListSkeleton,
} from "../components/Skeletons";
import PermissionGate from "../components/PermissionGate";
import { useAuth } from "../contexts/AuthContext";
import { PERMISSIONS } from "../config/permissions";
import type {
    DashboardMetrics,
    SalesTrendData,
    RecentSale,
    UpcomingDemo,
} from "../types";

// ─── MetricCard ───────────────────────────────────────────────────────────────

interface MetricCardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: React.ReactElement;
    color: string;
    trend?: number;
}

function MetricCard({ title, value, subtitle, icon, color, trend }: MetricCardProps) {
    const theme = useTheme();
    return (
        <Card
            sx={{
                height: "100%",
                background: `linear-gradient(135deg, ${color}15 0%, ${color}05 100%)`,
                border: `1px solid ${color}30`,
                transition: "all 0.3s ease",
                "&:hover": { transform: "translateY(-4px)", boxShadow: theme.shadows[8] },
            }}
        >
            <CardContent>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, mb: 1 }}>
                            {title}
                        </Typography>
                        <Typography variant="h4" sx={{ fontWeight: 700, color, mb: 0.5, fontSize: { xs: '1.1rem', sm: '1.5rem', md: '2.125rem' }, wordBreak: 'break-word' }}>
                            {value}
                        </Typography>
                        {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
                        {trend !== undefined && (
                            <Box sx={{ display: "flex", alignItems: "center", mt: 1, gap: 0.5 }}>
                                <TrendingUp sx={{ fontSize: 16, color: trend >= 0 ? "#4caf50" : "#f44336" }} />
                                <Typography variant="caption" sx={{ color: trend >= 0 ? "#4caf50" : "#f44336", fontWeight: 600 }}>
                                    {trend >= 0 ? "+" : ""}{trend}%
                                </Typography>
                            </Box>
                        )}
                    </Box>
                    <Box sx={{ width: { xs: 40, sm: 60 }, height: { xs: 40, sm: 60 }, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg, ${color} 0%, ${color}CC 100%)`, color: "white", flexShrink: 0 }}>
                        {icon}
                    </Box>
                </Box>
            </CardContent>
        </Card>
    );
}

// ─── Locked Section Placeholder ───────────────────────────────────────────────

function LockedSection({ label }: { label: string }) {
    const theme = useTheme();
    return (
        <Box
            sx={{
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", py: 6, gap: 1, opacity: 0.6,
                color: "text.secondary",
            }}
        >
            <LockIcon sx={{ fontSize: 36, color: "text.disabled" }} />
            <Typography variant="body2" fontWeight={500}>Requires &ldquo;{label}&rdquo; permission</Typography>
        </Box>
    );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
    const theme = useTheme();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { hasPermission } = useAuth();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
    const [salesTrend, setSalesTrend] = useState<SalesTrendData[]>([]);
    const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
    const [upcomingDemos, setUpcomingDemos] = useState<UpcomingDemo[]>([]);
    const [chartKey, setChartKey] = useState(0);
    const [loadingChart, setLoadingChart] = useState(false);
    const [collectedAmount, setCollectedAmount] = useState(0);
    const [loadingCollected, setLoadingCollected] = useState(false);

    const getLocalISODate = (d: Date) => {
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().split("T")[0];
    };

    const [salesDateRange, setSalesDateRange] = useState({
        start: "",
        end: getLocalISODate(new Date()),
    });

    const [collectedPaymentRange, setCollectedPaymentRange] = useState({
        start: "",
        end: getLocalISODate(new Date()),
    });

    useEffect(() => {
        const fetchStartDate = async () => {
            try {
                const data = await dashboardAPI.getSystemStartDate();
                const startDate = data?.start_date || "2024-01-01";
                setSalesDateRange(prev => ({ ...prev, start: startDate }));
                setCollectedPaymentRange(prev => ({ ...prev, start: startDate }));
            } catch (err) {
                console.error("Failed to fetch system start date", err);
                const fallback = "2024-01-01";
                setSalesDateRange(prev => ({ ...prev, start: fallback }));
                setCollectedPaymentRange(prev => ({ ...prev, start: fallback }));
            }
        };
        fetchStartDate();
    }, []);

    // Fetch collected payments — only if user has permission (skip API, not UI)
    useEffect(() => {
        if (!hasPermission(PERMISSIONS.VIEW_PAYMENTS)) return;
        const fetchCollectedPayments = async () => {
            try {
                setLoadingCollected(true);
                const data = await dashboardAPI.getCollectedPayments(
                    collectedPaymentRange.start,
                    collectedPaymentRange.end
                );
                setCollectedAmount(data.total_amount || 0);
            } catch (err) {
                console.error("Error fetching collected payments:", err);
            } finally {
                setLoadingCollected(false);
            }
        };
        if (collectedPaymentRange.start && collectedPaymentRange.end) {
            fetchCollectedPayments();
        }
    }, [collectedPaymentRange, hasPermission]);

    const loadSalesTrendByDateRange = useCallback(async () => {
        if (!hasPermission(PERMISSIONS.VIEW_REPORTS)) return;
        try {
            setLoadingChart(true);
            const data = await reportsAPI.getSalesTrend({
                interval: "daily",
                start_date: salesDateRange.start,
                end_date: salesDateRange.end,
            });
            const chartData = (data.trends || []).map((trend: any) => ({
                sale_date: trend.period,
                total_amount: parseFloat(trend.total_amount) || 0,
                sales_count: parseInt(trend.sales_count) || 0,
            }));
            setSalesTrend(chartData);
            setChartKey((prev) => prev + 1);
        } catch (err) {
            console.error("Error loading sales trend:", err);
            setSalesTrend([]);
        } finally {
            setLoadingChart(false);
        }
    }, [salesDateRange, hasPermission]);

    useEffect(() => {
        loadDashboardData();
    }, []);

    useEffect(() => {
        if (salesDateRange.start && salesDateRange.end) {
            loadSalesTrendByDateRange();
        }
    }, [salesDateRange, loadSalesTrendByDateRange]);

    const loadDashboardData = async () => {
        try {
            setLoading(true);
            setError(null);
            // Only call APIs the user is permitted to — skip API calls but keep UI rendered
            const [metricsData, salesData, demosData] = await Promise.all([
                hasPermission(PERMISSIONS.VIEW_DASHBOARD) ? dashboardAPI.getMetrics() : Promise.resolve(null),
                hasPermission(PERMISSIONS.VIEW_SALES) ? dashboardAPI.getRecentSales(10) : Promise.resolve([]),
                hasPermission(PERMISSIONS.VIEW_DEMOS) ? dashboardAPI.getUpcomingDemos(10) : Promise.resolve([]),
            ]);
            if (metricsData) setMetrics(metricsData);
            setRecentSales(salesData || []);
            setUpcomingDemos(demosData || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load dashboard data");
            console.error("Dashboard error:", err);
        } finally {
            setLoading(false);
        }
    };

    if (loading && !metrics && !hasPermission(PERMISSIONS.VIEW_DASHBOARD)) {
        // Non-dashboard users still see the shell, skip skeleton
    } else if (loading && !metrics) {
        return <DashboardSkeleton />;
    }

    if (error) {
        const isNetworkError = ["network", "reach server", "cors"].some((k) =>
            error.toLowerCase().includes(k)
        );
        return (
            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
                <Paper elevation={3} sx={{ p: 4, maxWidth: 500, textAlign: "center" }}>
                    <Typography variant="h5" color="error" gutterBottom>
                        {isNetworkError ? "Unable to Connect to Server" : "Error Loading Dashboard"}
                    </Typography>
                    <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                        {isNetworkError
                            ? "The backend server may be unavailable. Please try refreshing."
                            : error}
                    </Typography>
                    <Button variant="contained" startIcon={<RefreshIcon />}
                        onClick={() => { setError(null); loadDashboardData(); }}>
                        Refresh Page
                    </Button>
                </Paper>
            </Box>
        );
    }

    return (
        <Box>
            {/* Welcome Header */}
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
                     {t("dashboard.welcomeBack")}
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ fontSize: "1.05rem" }}>
                    {t("dashboard.subtitle")}
                </Typography>
            </Box>

            {/* ── Quick Action Cards ──────────────────────────────────────────────── */}
            {/* All 4 always rendered; greyed out + click-blocked if no permission   */}
            <Grid container spacing={2} sx={{ mb: 4 }}>
                <PermissionGate permission={PERMISSIONS.VIEW_CUSTOMERS}>
                    <Grid item xs={6} sm={6} md={3}>
                        <Card sx={{ background: "linear-gradient(135deg, #10b981 0%, #059669 100%)", color: "white", cursor: "pointer", transition: "all 0.3s ease", "&:hover": { transform: "translateY(-4px)", boxShadow: 6 } }}
                            onClick={() => navigate("/customers")}>
                            <CardContent>
                                <PersonAdd sx={{ fontSize: { xs: 28, sm: 40 }, mb: 1, opacity: 0.9 }} />
                                <Typography variant="h6" sx={{ fontWeight: 600 }}>{t("dashboard.quickActions.addCustomer.title")}</Typography>
                                <Typography variant="body2" sx={{ opacity: 0.9, mt: 0.5 }}>{t("dashboard.quickActions.addCustomer.subtitle")}</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                </PermissionGate>

                <PermissionGate permission={PERMISSIONS.VIEW_SALES}>
                    <Grid item xs={6} sm={6} md={3}>
                        <Card sx={{ background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)", color: "white", cursor: "pointer", transition: "all 0.3s ease", "&:hover": { transform: "translateY(-4px)", boxShadow: 6 } }}
                            onClick={() => navigate("/sales")}>
                            <CardContent>
                                <ShoppingCart sx={{ fontSize: { xs: 28, sm: 40 }, mb: 1, opacity: 0.9 }} />
                                <Typography variant="h6" sx={{ fontWeight: 600 }}>{t("dashboard.quickActions.newSale.title")}</Typography>
                                <Typography variant="body2" sx={{ opacity: 0.9, mt: 0.5 }}>{t("dashboard.quickActions.newSale.subtitle")}</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                </PermissionGate>

                <PermissionGate permission={PERMISSIONS.VIEW_DEMOS}>
                    <Grid item xs={6} sm={6} md={3}>
                        <Card sx={{ background: "linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)", color: "white", cursor: "pointer", transition: "all 0.3s ease", "&:hover": { transform: "translateY(-4px)", boxShadow: 6 } }}
                            onClick={() => navigate("/demos")}>
                            <CardContent>
                                <Science sx={{ fontSize: { xs: 28, sm: 40 }, mb: 1, opacity: 0.9 }} />
                                <Typography variant="h6" sx={{ fontWeight: 600 }}>{t("dashboard.quickActions.scheduleDemo.title")}</Typography>
                                <Typography variant="body2" sx={{ opacity: 0.9, mt: 0.5 }}>{t("dashboard.quickActions.scheduleDemo.subtitle")}</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                </PermissionGate>

                <PermissionGate permission={PERMISSIONS.VIEW_PAYMENTS}>
                    <Grid item xs={6} sm={6} md={3}>
                        <Card sx={{ background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)", color: "white", cursor: "pointer", transition: "all 0.3s ease", "&:hover": { transform: "translateY(-4px)", boxShadow: 6 } }}
                            onClick={() => navigate("/payments")}>
                            <CardContent>
                                <Payment sx={{ fontSize: { xs: 28, sm: 40 }, mb: 1, opacity: 0.9 }} />
                                <Typography variant="h6" sx={{ fontWeight: 600 }}>{t("dashboard.quickActions.recordPayment.title")}</Typography>
                                <Typography variant="body2" sx={{ opacity: 0.9, mt: 0.5 }}>{t("dashboard.quickActions.recordPayment.subtitle")}</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                </PermissionGate>
            </Grid>


            {/* ── Metric Cards ─────────────────────────────────────────────────────── */}
            {/* Always rendered; greyed out if no view_dashboard permission           */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <PermissionGate permission={PERMISSIONS.VIEW_DASHBOARD}>
                    <Grid item xs={12} sm={6} md={3}>
                        {metrics ? (
                            <MetricCard title={t("dashboard.totalSales")} value={`₹${metrics.total_sales.toLocaleString()}`}
                                subtitle={`${metrics.total_transactions} ${t("dashboard.transactions")}`}
                                icon={<AttachMoney sx={{ fontSize: 32 }} />} color="#1976d2" trend={12.5} />
                        ) : <MetricCardSkeleton />}
                    </Grid>
                </PermissionGate>
                <PermissionGate permission={PERMISSIONS.VIEW_DASHBOARD}>
                    <Grid item xs={12} sm={6} md={3}>
                        {metrics ? (
                            <MetricCard title={t("dashboard.pendingPayments")} value={`₹${metrics.pending_amount.toLocaleString()}`}
                                subtitle={t("dashboard.outstandingAmount")}
                                icon={<Receipt sx={{ fontSize: 32 }} />} color="#ed6c02" />
                        ) : <MetricCardSkeleton />}
                    </Grid>
                </PermissionGate>
                <PermissionGate permission={PERMISSIONS.VIEW_DASHBOARD}>
                    <Grid item xs={12} sm={6} md={3}>
                        {metrics ? (
                            <MetricCard title={t("dashboard.totalCustomers")} value={metrics.total_customers}
                                subtitle={t("dashboard.activeCustomers")}
                                icon={<People sx={{ fontSize: 32 }} />} color="#2e7d32" trend={8.3} />
                        ) : <MetricCardSkeleton />}
                    </Grid>
                </PermissionGate>
                <PermissionGate permission={PERMISSIONS.VIEW_DASHBOARD}>
                    <Grid item xs={12} sm={6} md={3}>
                        {metrics ? (
                            <MetricCard title={t("dashboard.demoConversion")} value={`${metrics?.demo_conversion_rate ?? 0}%`}
                                subtitle={t("dashboard.conversionRate")}
                                icon={<Timeline sx={{ fontSize: 32 }} />} color="#9c27b0" trend={5.2} />
                        ) : <MetricCardSkeleton />}
                    </Grid>
                </PermissionGate>
            </Grid>


            {/* ── Charts Row ───────────────────────────────────────────────────────── */}
            <Grid container spacing={3} sx={{ mb: 4 }}>

                {/* Sales Trend Chart — greyed out if no view_reports */}
                <PermissionGate permission={PERMISSIONS.VIEW_REPORTS}>
                    <Grid item xs={12} lg={8}>
                        <Card>
                            <CardContent>
                                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, flexWrap: "wrap", gap: 2 }}>
                                    <Box sx={{ display: "flex", alignItems: "center" }}>
                                        <ShowChart sx={{ mr: 1, color: theme.palette.primary.main }} />
                                        <Typography variant="h6" sx={{ fontWeight: 600 }}>Sales Trend</Typography>
                                    </Box>
                                    <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                                        <TextField type="date" size="small" label="From" value={salesDateRange.start}
                                            onChange={(e) => setSalesDateRange({ ...salesDateRange, start: e.target.value })}
                                            InputLabelProps={{ shrink: true }} sx={{ minWidth: 150 }} />
                                        <TextField type="date" size="small" label="To" value={salesDateRange.end}
                                            onChange={(e) => setSalesDateRange({ ...salesDateRange, end: e.target.value })}
                                            InputLabelProps={{ shrink: true }} sx={{ minWidth: 150 }} />
                                        <Tooltip title="Refresh">
                                            <IconButton size="small" onClick={loadSalesTrendByDateRange} color="primary" disabled={loadingChart}>
                                                <RefreshIcon />
                                            </IconButton>
                                        </Tooltip>
                                    </Box>
                                </Box>
                                {loadingChart ? (
                                    <ChartSkeleton height={300} />
                                ) : salesTrend.length === 0 ? (
                                    <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: 300, flexDirection: "column" }}>
                                        <ShowChart sx={{ fontSize: 64, color: theme.palette.text.disabled, mb: 2 }} />
                                        <Typography variant="body2" color="text.secondary">No sales data for selected date range</Typography>
                                    </Box>
                                ) : (
                                    <ResponsiveContainer width="100%" height={300} key={chartKey}>
                                        <LineChart data={salesTrend}>
                                            <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                                            <XAxis dataKey="sale_date" stroke={theme.palette.text.secondary} style={{ fontSize: "12px" }} />
                                            <YAxis stroke={theme.palette.text.secondary} style={{ fontSize: "12px" }} />
                                            <RechartsTooltip contentStyle={{ backgroundColor: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 8 }} />
                                            <Legend />
                                            <Line type="monotone" dataKey="total_amount" stroke={theme.palette.primary.main} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Sales Amount (₹)" />
                                        </LineChart>
                                    </ResponsiveContainer>
                                )}
                            </CardContent>
                        </Card>
                    </Grid>
                </PermissionGate>

                {/* Collected Payments — greyed out if no view_payments */}
                <PermissionGate permission={PERMISSIONS.VIEW_PAYMENTS}>
                    <Grid item xs={12} lg={4}>
                        <Card sx={{ height: "100%", background: "linear-gradient(135deg, #10b981 0%, #059669 100%)", color: "white", display: "flex", flexDirection: "column", justifyContent: "center", position: "relative", overflow: "hidden" }}>
                            <Box sx={{ position: "absolute", right: -20, top: -20, opacity: 0.1, transform: "rotate(15deg)" }}>
                                <Payment sx={{ fontSize: 180 }} />
                            </Box>
                            <CardContent sx={{ position: "relative", zIndex: 1, textAlign: "center" }}>
                                <Box sx={{ display: "flex", gap: 1, justifyContent: "center", mb: 2, background: "rgba(255,255,255,0.1)", p: 1, borderRadius: 2, flexWrap: "wrap" }}>
                                    <TextField type="date" size="small" value={collectedPaymentRange.start}
                                        onChange={(e) => setCollectedPaymentRange({ ...collectedPaymentRange, start: e.target.value })}
                                        sx={{ "& .MuiInputBase-input": { color: "white", py: 0.5, fontSize: "0.875rem" }, "& .MuiOutlinedInput-notchedOutline": { border: "none" } }} />
                                    <Typography sx={{ alignSelf: "center", opacity: 0.8 }}>-</Typography>
                                    <TextField type="date" size="small" value={collectedPaymentRange.end}
                                        onChange={(e) => setCollectedPaymentRange({ ...collectedPaymentRange, end: e.target.value })}
                                        sx={{ "& .MuiInputBase-input": { color: "white", py: 0.5, fontSize: "0.875rem" }, "& .MuiOutlinedInput-notchedOutline": { border: "none" } }} />
                                </Box>
                                <Typography variant="h5" sx={{ fontWeight: 600, mb: 1, opacity: 0.9 }}>Collected Payments</Typography>
                                {loadingCollected ? (
                                    <Skeleton variant="text" width="60%" height={60} sx={{ bgcolor: "rgba(255,255,255,0.3)", mx: "auto" }} />
                                ) : (
                                    <Typography variant="h2" sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', sm: '2.5rem', md: '3.75rem' } }}>₹{collectedAmount.toLocaleString()}</Typography>
                                )}
                            </CardContent>
                        </Card>
                    </Grid>
                </PermissionGate>
            </Grid>

            {/* ── Recent Activity ──────────────────────────────────────────────────── */}
            {/* Cards always render; content replaced with lock placeholder if denied */}
            <Grid container spacing={3}>

                {/* Recent Sales */}
                <Grid item xs={12} lg={6}>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                                <Typography variant="h6" sx={{ fontWeight: 600 }}>{t("dashboard.recentSales")}</Typography>
                                <PermissionGate permission={PERMISSIONS.VIEW_SALES} block permissionLabel="view sales">
                                    <Button size="small" endIcon={<ArrowForward />} onClick={() => navigate("/sales")}>View All</Button>
                                </PermissionGate>
                            </Box>
                            {hasPermission(PERMISSIONS.VIEW_SALES) ? (
                                <Box sx={{ maxHeight: 400, overflowY: "auto" }}>
                                    {loading ? (
                                        <ListSkeleton count={5} itemHeight={80} />
                                    ) : recentSales.length > 0 ? (
                                        recentSales.slice(0, 5).map((sale, index) => (
                                            <Paper key={index}
                                                sx={{ p: 2.5, mb: 1.5, display: "flex", justifyContent: "space-between", alignItems: "center", border: `1px solid ${theme.palette.divider}`, borderRadius: 2, cursor: "pointer", transition: "all 0.2s", "&:hover": { bgcolor: theme.palette.action.hover, transform: "translateX(4px)", borderColor: theme.palette.primary.main } }}
                                                onClick={() => navigate("/sales")}>
                                                <Box sx={{ flex: 1 }}>
                                                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                                                        <Chip label={sale.invoice_no} size="small" color="primary" variant="outlined" sx={{ height: 24, "& .MuiChip-label": { px: 1, fontSize: "0.75rem" } }} />
                                                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{sale.customer_name}</Typography>
                                                    </Box>
                                                    <Box sx={{ display: "flex", gap: 2, color: "text.secondary" }}>
                                                        <Typography variant="caption" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                                                            <Schedule sx={{ fontSize: 14 }} />{new Date(sale.sale_date).toLocaleDateString()}
                                                        </Typography>
                                                        <Typography variant="caption">{sale.village || "No Village"}</Typography>
                                                    </Box>
                                                </Box>
                                                <Box sx={{ textAlign: "right" }}>
                                                    <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 700 }}>₹{sale.total_amount?.toLocaleString() ?? 0}</Typography>
                                                    <Chip label={sale.payment_status} size="small"
                                                        color={sale.payment_status?.toLowerCase() === "paid" ? "success" : sale.payment_status?.toLowerCase() === "pending" ? "warning" : "default"}
                                                        sx={{ height: 20, mt: 0.5, "& .MuiChip-label": { px: 1, fontSize: "0.7rem" } }} />
                                                </Box>
                                            </Paper>
                                        ))
                                    ) : (
                                        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", py: 8, opacity: 0.6 }}>
                                            <ShoppingCart sx={{ fontSize: 48, mb: 2, color: "text.disabled" }} />
                                            <Typography variant="body1" color="text.secondary">No recent sales found</Typography>
                                        </Box>
                                    )}
                                </Box>
                            ) : (
                                <LockedSection label="view sales" />
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                {/* Upcoming Demos */}
                <Grid item xs={12} lg={6}>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                                <Typography variant="h6" sx={{ fontWeight: 600 }}>{t("dashboard.upcomingDemos")}</Typography>
                                <PermissionGate permission={PERMISSIONS.VIEW_DEMOS} block permissionLabel="view demos">
                                    <Button size="small" endIcon={<ArrowForward />} onClick={() => navigate("/demos")}>View All</Button>
                                </PermissionGate>
                            </Box>
                            {hasPermission(PERMISSIONS.VIEW_DEMOS) ? (
                                <Box sx={{ maxHeight: 400, overflowY: "auto" }}>
                                    {loading ? (
                                        <ListSkeleton count={5} itemHeight={80} />
                                    ) : upcomingDemos.length > 0 ? (
                                        upcomingDemos.slice(0, 5).map((demo, index) => (
                                            <Paper key={index}
                                                sx={{ p: 2.5, mb: 1.5, display: "flex", justifyContent: "space-between", alignItems: "center", border: `1px solid ${theme.palette.divider}`, borderRadius: 2, cursor: "pointer", transition: "all 0.2s", "&:hover": { bgcolor: theme.palette.action.hover, transform: "translateX(4px)", borderColor: theme.palette.secondary.main } }}
                                                onClick={() => navigate("/demos")}>
                                                <Box sx={{ flex: 1 }}>
                                                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                                                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{demo.customer_name}</Typography>
                                                        {demo.village && (
                                                            <Typography variant="caption" sx={{ color: "text.secondary", bgcolor: theme.palette.action.hover, px: 1, borderRadius: 1 }}>
                                                                {demo.village}
                                                            </Typography>
                                                        )}
                                                    </Box>
                                                    <Box sx={{ display: "flex", gap: 2, color: "text.secondary" }}>
                                                        <Typography variant="caption" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                                                            <Schedule sx={{ fontSize: 14 }} />{new Date(demo.demo_date).toLocaleDateString()} • {demo.demo_time || "No time"}
                                                        </Typography>
                                                        <Typography variant="caption">{demo.product_name}</Typography>
                                                    </Box>
                                                </Box>
                                                <Box>
                                                    <Chip label={demo.conversion_status} size="small"
                                                        color={demo.conversion_status === "Converted" ? "success" : "secondary"}
                                                        variant={demo.conversion_status === "Converted" ? "filled" : "outlined"} />
                                                </Box>
                                            </Paper>
                                        ))
                                    ) : (
                                        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", py: 8, opacity: 0.6 }}>
                                            <Science sx={{ fontSize: 48, mb: 2, color: "text.disabled" }} />
                                            <Typography variant="body1" color="text.secondary">No upcoming demos found</Typography>
                                        </Box>
                                    )}
                                </Box>
                            ) : (
                                <LockedSection label="view demos" />
                            )}
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </Box >
    );
}
