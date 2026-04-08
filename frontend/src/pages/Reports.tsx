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
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  useTheme,
  Divider,
  Skeleton,
  ToggleButton,
  ToggleButtonGroup,
  Autocomplete,
  Tooltip,
  LinearProgress,
} from "@mui/material";
import {
  TrendingUp as TrendingUpIcon,
  Download as DownloadIcon,
  LocationOn as LocationIcon,
  Category as ProductIcon,
  Group as PeopleIcon,
  Store as StoreIcon,
  AttachMoney as MoneyIcon,
  Opacity as LitersIcon,
  ShoppingCart as CartIcon,
  Star as TrophyIcon,
  Refresh as RefreshIcon,
  CalendarMonth as CalendarIcon,
  PictureAsPdf as PdfIcon,
  TableChart as TableIcon,
} from "@mui/icons-material";
import { useAuth } from "../contexts/AuthContext";
import { reportsAPI } from "../services/api";
import { useTranslation } from "../hooks/useTranslation";

// ─── Types ──────────────────────────────────────────────────────────────────
interface Filters {
  preset: "this_month" | "last_month" | "custom";
  start_date: string;
  end_date: string;
  district: string;
  village: string;
  product_id: number | null;
}

interface KPISummary {
  total_orders: number;
  total_revenue: number;
  total_liters: number;
  avg_order_value: number;
  top_district: string | null;
  top_district_amount: number;
  top_product: string | null;
  top_product_amount: number;
}

interface DimensionRow {
  rank: number;
  label: string;
  secondary_label: string | null;
  orders: number;
  revenue: number;
  liters: number;
  pct: number;
}

interface FilterOptions {
  districts: string[];
  villages: string[];
  products: { product_id: number; label: string }[];
}

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

const toFilterParams = (f: Filters) => ({
  start_date: f.start_date,
  end_date: f.end_date,
  district: f.district || undefined,
  village: f.village || undefined,
  product_id: f.product_id ?? undefined,
});

const fmtCurrency = (v: number) =>
  `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const fmtLiters = (v: number) =>
  `${v.toLocaleString("en-IN", { maximumFractionDigits: 1 })} L`;

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  sub,
  icon,
  color,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  color: string;
  loading: boolean;
}) {
  return (
    <Card
      sx={{
        height: "100%",
        borderTop: `3px solid ${color}`,
        transition: "transform 0.18s, box-shadow 0.18s",
        "&:hover": { transform: "translateY(-2px)", boxShadow: 4 },
      }}
    >
      <CardContent sx={{ p: 2.5 }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {label}
            </Typography>
            {loading ? (
              <Skeleton width={100} height={36} />
            ) : (
              <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5, color }}>
                {value}
              </Typography>
            )}
            {sub && !loading && (
              <Typography variant="caption" color="text.secondary">
                {sub}
              </Typography>
            )}
          </Box>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: `${color}18`,
              color,
              flexShrink: 0,
            }}
          >
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

// ─── Dimension Table ──────────────────────────────────────────────────────────
function DimensionTable({
  title,
  icon,
  rows,
  loading,
  colLabel,
  colSub,
  showLitersAs,
}: {
  title: string;
  icon: React.ReactNode;
  rows: DimensionRow[];
  loading: boolean;
  colLabel: string;
  colSub?: string;
  showLitersAs?: "liters" | "qty";
}) {
  const theme = useTheme();
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent sx={{ p: 0 }}>
        <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "center", gap: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
          <Box sx={{ color: "primary.main" }}>{icon}</Box>
          <Typography variant="h6" sx={{ fontWeight: 700, fontSize: "0.95rem" }}>
            {title}
          </Typography>
          <Chip label={rows.length} size="small" sx={{ ml: "auto" }} />
        </Box>
        {loading ? (
          <Box sx={{ p: 2 }}>
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} height={40} sx={{ mb: 0.5 }} />
            ))}
          </Box>
        ) : rows.length === 0 ? (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography color="text.secondary" variant="body2">No data for selected filters</Typography>
          </Box>
        ) : (
          <TableContainer sx={{ maxHeight: 340 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, width: 36 }}>#</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{colLabel}</TableCell>
                  {colSub && <TableCell sx={{ fontWeight: 700, display: { xs: "none", sm: "table-cell" } }}>{colSub}</TableCell>}
                  <TableCell sx={{ fontWeight: 700 }} align="right">Orders</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Revenue</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">{showLitersAs === "qty" ? "Qty" : "Liters"}</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 80 }} align="right">Share</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.rank}
                    hover
                    sx={{ "&:nth-of-type(even)": { bgcolor: "action.hover" } }}
                  >
                    <TableCell>
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 700,
                          color: row.rank <= 3 ? "warning.main" : "text.secondary",
                        }}
                      >
                        {row.rank}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {row.label}
                      </Typography>
                      {row.secondary_label && colSub === undefined && (
                        <Typography variant="caption" color="text.secondary">
                          {row.secondary_label}
                        </Typography>
                      )}
                    </TableCell>
                    {colSub && (
                      <TableCell sx={{ display: { xs: "none", sm: "table-cell" } }}>
                        <Typography variant="caption" color="text.secondary">
                          {row.secondary_label || "—"}
                        </Typography>
                      </TableCell>
                    )}
                    <TableCell align="right">
                      <Typography variant="body2">{row.orders}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontWeight: 600, color: "success.main" }}>
                        {fmtCurrency(row.revenue)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" color="text.secondary">
                        {showLitersAs === "qty" ? row.liters : fmtLiters(row.liters)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.5 }}>
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>
                          {row.pct}%
                        </Typography>
                        <LinearProgress
                          variant="determinate"
                          value={row.pct}
                          sx={{ width: 50, height: 4, borderRadius: 2, bgcolor: "action.hover" }}
                          color="primary"
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
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Reports() {
  const { user } = useAuth();
  const theme = useTheme();
  const { t } = useTranslation();

  // === Filters ===
  const thisMonth = getThisMonth();
  const [filters, setFilters] = useState<Filters>({
    preset: "this_month",
    start_date: thisMonth.start,
    end_date: thisMonth.end,
    district: "",
    village: "",
    product_id: null,
  });

  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ districts: [], villages: [], products: [] });
  const [filterOptionsLoading, setFilterOptionsLoading] = useState(false);

  // === Data ===
  const [kpi, setKpi] = useState<KPISummary | null>(null);
  const [kpiLoading, setKpiLoading] = useState(false);

  const [districtRows, setDistrictRows] = useState<DimensionRow[]>([]);
  const [villageRows, setVillageRows] = useState<DimensionRow[]>([]);
  const [productRows, setProductRows] = useState<DimensionRow[]>([]);
  const [customerRows, setCustomerRows] = useState<DimensionRow[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);

  const [pdfLoading, setPdfLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // === Load filter options once ===
  useEffect(() => {
    if (!user?.email) return;
    setFilterOptionsLoading(true);
    reportsAPI.getFilterOptions()
      .then((data) => setFilterOptions(data))
      .catch(() => {/* non-critical */})
      .finally(() => setFilterOptionsLoading(false));
  }, [user]);

  // === Apply preset ===
  const applyPreset = (preset: Filters["preset"]) => {
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

  // === Load all analytics data ===
  const loadAll = useCallback(async () => {
    if (!user?.email) return;
    const params = toFilterParams(filters);

    setKpiLoading(true);
    setTablesLoading(true);
    setError(null);

    // KPI summary
    reportsAPI.getAnalyticsSummary(params)
      .then((data) => setKpi(data))
      .catch((e) => setError(e?.message || "Failed to load analytics summary"))
      .finally(() => setKpiLoading(false));

    // All four dimension tables in parallel
    Promise.all([
      reportsAPI.getDimensionBreakdown({ ...params, dimension: "district" }),
      reportsAPI.getDimensionBreakdown({ ...params, dimension: "village" }),
      reportsAPI.getDimensionBreakdown({ ...params, dimension: "product" }),
      reportsAPI.getDimensionBreakdown({ ...params, dimension: "customer" }),
    ])
      .then(([d, v, p, c]) => {
        setDistrictRows(d.rows || []);
        setVillageRows(v.rows || []);
        setProductRows(p.rows || []);
        setCustomerRows(c.rows || []);
      })
      .catch((e) => setError(e?.message || "Failed to load dimension data"))
      .finally(() => setTablesLoading(false));
  }, [user, filters]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // === Download helpers ===
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  type DownloadType = "sales_pdf" | "sales_excel" | "product_pdf" | "product_excel" | "customer_pdf" | "customer_excel" | "calling";
  
  const handleDownload = async (type: DownloadType) => {
    try {
      setPdfLoading(type);
      setError(null);
      const params = toFilterParams(filters);
      let blob: Blob;
      let filename: string;

      if (type === "sales_pdf") {
        blob = await reportsAPI.getSalesAnalyticsPdf(params);
        filename = `sales_analytics_${params.start_date || "all"}_to_${params.end_date || "all"}.pdf`;
      } else if (type === "sales_excel") {
        blob = await reportsAPI.getSalesAnalyticsExcel(params);
        filename = `sales_analytics_${params.start_date || "all"}_to_${params.end_date || "all"}.xlsx`;
      } else if (type === "product_pdf") {
        blob = await reportsAPI.getProductReportPdf(params);
        filename = `product_report_${params.start_date || "all"}_to_${params.end_date || "all"}.pdf`;
      } else if (type === "product_excel") {
        blob = await reportsAPI.getProductReportExcel(params);
        filename = `product_report_${params.start_date || "all"}_to_${params.end_date || "all"}.xlsx`;
      } else if (type === "customer_pdf") {
        blob = await reportsAPI.getCustomerAnalyticsPdf(params);
        filename = `customer_analytics_${params.start_date || "all"}_to_${params.end_date || "all"}.pdf`;
      } else if (type === "customer_excel") {
        blob = await reportsAPI.getCustomerAnalyticsExcel(params);
        filename = `customer_analytics_${params.start_date || "all"}_to_${params.end_date || "all"}.xlsx`;
      } else {
        blob = await reportsAPI.getCallingListPdf();
        filename = `calling_list_report.pdf`;
      }

      downloadBlob(blob, filename);
      setSuccess("Report downloaded successfully!");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e?.message || "Failed to download report");
    } finally {
      setPdfLoading(null);
    }
  };

  // ─── Derived active filter summary ─────────────────────────────────────────
  const activeFiltersCount = [filters.district, filters.village, filters.product_id !== null ? "p" : ""].filter(Boolean).length;

  return (
    <Box>
      {/* ── Page Header ── */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
          Reports & Analytics
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Filter by time, district, village or product — all sections update together
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* ═══════════════════════════════════════════════════════════
           FILTER BAR
      ═══════════════════════════════════════════════════════════ */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ pb: "16px !important" }}>
          {/* Time Presets */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", mb: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CalendarIcon fontSize="small" color="action" />
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Time Period</Typography>
            </Box>
            <ToggleButtonGroup
              value={filters.preset}
              exclusive
              size="small"
              onChange={(_, v) => { if (v) applyPreset(v); }}
            >
              <ToggleButton value="this_month" sx={{ px: 2, fontWeight: 600 }}>
                This Month
              </ToggleButton>
              <ToggleButton value="last_month" sx={{ px: 2, fontWeight: 600 }}>
                Last Month
              </ToggleButton>
              <ToggleButton value="custom" sx={{ px: 2, fontWeight: 600 }}>
                Custom
              </ToggleButton>
            </ToggleButtonGroup>

            {filters.preset === "custom" && (
              <Box sx={{ display: "flex", gap: 1 }}>
                <TextField
                  size="small"
                  type="date"
                  label="From"
                  value={filters.start_date}
                  onChange={(e) => setFilters((f) => ({ ...f, start_date: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: 155 }}
                />
                <TextField
                  size="small"
                  type="date"
                  label="To"
                  value={filters.end_date}
                  onChange={(e) => setFilters((f) => ({ ...f, end_date: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: 155 }}
                />
              </Box>
            )}

            <Box sx={{ ml: "auto", display: "flex", gap: 1 }}>
              <Tooltip title="Refresh data">
                <span>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<RefreshIcon />}
                    onClick={loadAll}
                    disabled={kpiLoading}
                  >
                    Refresh
                  </Button>
                </span>
              </Tooltip>
            </Box>
          </Box>

          <Divider sx={{ mb: 2 }} />

          {/* Dimension Filters */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <LocationIcon fontSize="small" color="action" />
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Filters</Typography>
              {activeFiltersCount > 0 && (
                <Chip label={`${activeFiltersCount} active`} size="small" color="primary" />
              )}
            </Box>

            <Autocomplete
              size="small"
              options={filterOptions.districts}
              value={filters.district || null}
              onChange={(_, v) => setFilters((f) => ({ ...f, district: v || "" }))}
              loading={filterOptionsLoading}
              renderInput={(params) => (
                <TextField {...params} label="District" placeholder="All Districts" />
              )}
              sx={{ minWidth: 180 }}
              clearOnBlur={false}
            />

            <Autocomplete
              size="small"
              options={filterOptions.villages}
              value={filters.village || null}
              onChange={(_, v) => setFilters((f) => ({ ...f, village: v || "" }))}
              loading={filterOptionsLoading}
              renderInput={(params) => (
                <TextField {...params} label="Village" placeholder="All Villages" />
              )}
              sx={{ minWidth: 180 }}
              clearOnBlur={false}
            />

            <Autocomplete
              size="small"
              options={filterOptions.products}
              getOptionLabel={(o) => o.label}
              value={filterOptions.products.find((p) => p.product_id === filters.product_id) || null}
              onChange={(_, v) => setFilters((f) => ({ ...f, product_id: v?.product_id ?? null }))}
              loading={filterOptionsLoading}
              renderInput={(params) => (
                <TextField {...params} label="Product / Packing" placeholder="All Products" />
              )}
              sx={{ minWidth: 220 }}
            />

            {activeFiltersCount > 0 && (
              <Button
                size="small"
                variant="text"
                color="error"
                onClick={() => setFilters((f) => ({ ...f, district: "", village: "", product_id: null }))}
              >
                Clear Filters
              </Button>
            )}
          </Box>

          {/* Date range indicator */}
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="caption" color="text.secondary">
              Showing:{" "}
              <strong>{filters.start_date}</strong> → <strong>{filters.end_date}</strong>
              {filters.district && ` · District: ${filters.district}`}
              {filters.village && ` · Village: ${filters.village}`}
              {filters.product_id !== null && ` · Product filtered`}
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════════
           PHASE 2: KPI CARDS
      ═══════════════════════════════════════════════════════════ */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={4} md={2}>
          <KpiCard
            label="Total Revenue"
            value={kpi ? fmtCurrency(kpi.total_revenue) : "—"}
            icon={<MoneyIcon />}
            color={theme.palette.success.main}
            loading={kpiLoading}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <KpiCard
            label="Total Volume"
            value={kpi ? fmtLiters(kpi.total_liters) : "—"}
            icon={<LitersIcon />}
            color={theme.palette.info.main}
            loading={kpiLoading}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <KpiCard
            label="Total Orders"
            value={kpi ? kpi.total_orders.toString() : "—"}
            icon={<CartIcon />}
            color={theme.palette.primary.main}
            loading={kpiLoading}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <KpiCard
            label="Avg Order Value"
            value={kpi ? fmtCurrency(kpi.avg_order_value) : "—"}
            icon={<TrendingUpIcon />}
            color={theme.palette.warning.main}
            loading={kpiLoading}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <KpiCard
            label="Top District"
            value={kpi?.top_district || "—"}
            sub={kpi?.top_district_amount ? fmtCurrency(kpi.top_district_amount) : undefined}
            icon={<TrophyIcon />}
            color="#9c27b0"
            loading={kpiLoading}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <KpiCard
            label="Top Product"
            value={kpi?.top_product || "—"}
            sub={kpi?.top_product_amount ? fmtCurrency(kpi.top_product_amount) : undefined}
            icon={<ProductIcon />}
            color="#ff5722"
            loading={kpiLoading}
          />
        </Grid>
      </Grid>

      {/* ═══════════════════════════════════════════════════════════
           DIMENSION TABLES (Phase 3 preview)
      ═══════════════════════════════════════════════════════════ */}
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
        <TableIcon color="primary" />
        Dimension Analysis
      </Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <DimensionTable
            title="Sales by District"
            icon={<LocationIcon />}
            rows={districtRows}
            loading={tablesLoading}
            colLabel="District"
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <DimensionTable
            title="Sales by Village"
            icon={<StoreIcon />}
            rows={villageRows}
            loading={tablesLoading}
            colLabel="Village"
            colSub="District"
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <DimensionTable
            title="Sales by Product / Packing"
            icon={<ProductIcon />}
            rows={productRows}
            loading={tablesLoading}
            colLabel="Product"
            colSub="Packing"
            showLitersAs="qty"
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <DimensionTable
            title="Top Customers"
            icon={<PeopleIcon />}
            rows={customerRows}
            loading={tablesLoading}
            colLabel="Sabhasad"
          />
        </Grid>
      </Grid>

      {/* ═══════════════════════════════════════════════════════════
           DOWNLOADS
      ═══════════════════════════════════════════════════════════ */}
      <Card>
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
              { key: "sales_pdf", label: "Analytics PDF", color: "primary" as const, icon: <PdfIcon /> },
              { key: "sales_excel", label: "Analytics Excel", color: "success" as const, icon: <TableIcon /> },
              { key: "product_pdf", label: "Product Rank PDF", color: "info" as const, icon: <PdfIcon /> },
              { key: "product_excel", label: "Product Rank Excel", color: "success" as const, icon: <TableIcon /> },
              { key: "customer_pdf", label: "Customer Rank PDF", color: "secondary" as const, icon: <PdfIcon /> },
              { key: "customer_excel", label: "Customer Rank Excel", color: "success" as const, icon: <TableIcon /> },
              { key: "calling", label: "Old Calling List PDF", color: "warning" as const, icon: <PdfIcon /> },
            ].map((item) => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={item.key}>
                <Button
                  fullWidth
                  variant="outlined"
                  color={item.color}
                  startIcon={
                    pdfLoading === item.key ? <CircularProgress size={16} color="inherit" /> : item.icon
                  }
                  onClick={() => handleDownload(item.key as any)}
                  disabled={pdfLoading !== null}
                  sx={{ fontWeight: 600, py: 1 }}
                >
                  {item.label}
                </Button>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>
    </Box>
  );
}
