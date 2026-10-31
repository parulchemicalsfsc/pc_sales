import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  Button,
  IconButton,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  InputAdornment,
  Drawer,
  Divider,
  Alert,
  Tooltip,
  Snackbar,
  CircularProgress,
  useTheme,
  useMediaQuery,
  Paper,
  Tabs,
  Tab,
} from "@mui/material";
import {
  DataGrid,
  GridColDef,
  GridPaginationModel,
  GridRenderCellParams,
} from "@mui/x-data-grid";
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Add as AddIcon,
  Close as CloseIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  LocationOn as LocationOnIcon,
  Work as WorkIcon,
  CalendarToday as CalendarIcon,
  OpenInNew as OpenInNewIcon,
  Visibility as VisibilityIcon,
  History as HistoryIcon,
  AssignmentInd as CandidateIcon,
  FilterList as FilterIcon,
  Clear as ClearIcon,
  Schedule as ScheduleIcon,
  CheckCircle as CheckCircleIcon,
  ThumbDown as RejectedIcon,
  PauseCircle as HoldIcon,
  Link as LinkIcon,
  Edit as EditIcon,
} from "@mui/icons-material";
import { useAuth } from "../contexts/AuthContext";
import { PERMISSIONS } from "../config/permissions";
import PermissionGate from "../components/PermissionGate";
import { TableSkeleton } from "../components/Skeletons";
import { useTranslation } from "../hooks/useTranslation";
import CandidateFormDialog from "../components/CandidateFormDialog";
import {
  recruitmentService,
  RecruitmentLead,
  RecruitmentCategory,
  RecruitmentActivity,
  RecruitmentStatus,
  ALLOWED_RECRUITMENT_STATUSES,
} from "../services/recruitmentService";

const STATUS_COLOR_MAP: Record<RecruitmentStatus, "info" | "primary" | "warning" | "error" | "default"> = {
  "Lead Generated": "info",
  "Shortlisted": "primary",
  "Profile on Hold": "warning",
  "Rejected": "error",
};

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`recruitment-tabpanel-${index}`}
      aria-labelledby={`recruitment-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 2.5 }}>{children}</Box>}
    </div>
  );
}

export default function RecruitmentWorkspace() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { t } = useTranslation();
  const { hasPermission, loading: authLoading } = useAuth();

  // ── State: Data & Pagination ───────────────────────────────────────────────
  const [leads, setLeads] = useState<RecruitmentLead[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<RecruitmentCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState<boolean>(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 25,
  });

  // ── State: Filters & Debounce ──────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [followUpFilter, setFollowUpFilter] = useState<string>("");

  // Request race condition and unmount prevention
  const latestRequestIdRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      latestRequestIdRef.current++;
    };
  }, []);

  // Debounce search term to prevent rapid API requests on keystrokes
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPaginationModel((p) => ({ ...p, page: 0 }));
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // ── State: Details Drawer ──────────────────────────────────────────────────
  const [selectedLead, setSelectedLead] = useState<RecruitmentLead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [drawerTab, setDrawerTab] = useState<number>(0);
  const [activities, setActivities] = useState<RecruitmentActivity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState<boolean>(false);

  // ── State: Multi-Step Candidate Form Dialog (Phase 4.2) ───────────────────
  const [candidateFormOpen, setCandidateFormOpen] = useState<boolean>(false);
  const [editingCandidate, setEditingCandidate] = useState<RecruitmentLead | null>(null);

  // ── State: Feedback Snackbars ──────────────────────────────────────────────
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error" | "info";
  }>({
    open: false,
    message: "",
    severity: "info",
  });

  // ── Load Categories ────────────────────────────────────────────────────────
  const loadCategories = useCallback(async () => {
    if (authLoading) return;
    setCategoriesLoading(true);
    setCategoriesError(null);
    try {
      const data = await recruitmentService.getCategories();
      if (isMountedRef.current) {
        setCategories(data || []);
        setCategoriesError(null);
      }
    } catch (err: any) {
      console.error("Failed to load recruitment categories:", err);
      if (isMountedRef.current) {
        setCategoriesError(
          err?.response?.data?.detail || "Failed to load recruitment categories."
        );
      }
    } finally {
      if (isMountedRef.current) {
        setCategoriesLoading(false);
      }
    }
  }, [authLoading]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // ── Load Leads ─────────────────────────────────────────────────────────────
  const fetchLeads = useCallback(async () => {
    if (authLoading) return;
    const reqId = ++latestRequestIdRef.current;
    try {
      setLoading(true);
      setError(null);
      const offset = paginationModel.page * paginationModel.pageSize;
      const resp = await recruitmentService.getLeads({
        search: debouncedSearch,
        status: statusFilter,
        category_id: categoryFilter ? Number(categoryFilter) : undefined,
        follow_up: (followUpFilter as any) || undefined,
        limit: paginationModel.pageSize,
        offset,
      });
      // Prevent stale requests or unmounted component from overwriting state
      if (reqId === latestRequestIdRef.current && isMountedRef.current) {
        setLeads(resp.leads || []);
        setTotalCount(resp.total || 0);
        setError(null);
      }
    } catch (err: any) {
      if (reqId === latestRequestIdRef.current && isMountedRef.current) {
        console.error("Error fetching candidate leads:", err);
        const status = err?.response?.status;
        if (status === 401) {
          setError(
            err?.response?.data?.detail || "Authentication required. Your session may have expired. Please log in again."
          );
        } else {
          setError(
            err?.response?.data?.detail || "Failed to load candidate leads. Please try again."
          );
        }
      }
    } finally {
      if (reqId === latestRequestIdRef.current && isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [
    authLoading,
    paginationModel.page,
    paginationModel.pageSize,
    debouncedSearch,
    statusFilter,
    categoryFilter,
    followUpFilter,
  ]);

  useEffect(() => {
    if (!authLoading) {
      fetchLeads();
    }
  }, [fetchLeads, authLoading]);

  // ── Load Activities for Details Drawer ─────────────────────────────────────
  const loadActivities = useCallback(async (leadId: number) => {
    try {
      setActivitiesLoading(true);
      const resp = await recruitmentService.getActivities(leadId, "desc");
      if (isMountedRef.current) {
        setActivities(resp.activities || []);
      }
    } catch (err) {
      console.error("Error loading candidate activities:", err);
    } finally {
      if (isMountedRef.current) {
        setActivitiesLoading(false);
      }
    }
  }, []);

  const handleOpenDetails = (lead: RecruitmentLead) => {
    setSelectedLead(lead);
    setDrawerTab(0);
    setDrawerOpen(true);
    loadActivities(lead.lead_id);
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setSelectedLead(null);
    setActivities([]);
  };

  // ── Multi-Step Form Handlers (Phase 4.2) ───────────────────────────────────
  const handleOpenCreateDialog = () => {
    setEditingCandidate(null);
    setCandidateFormOpen(true);
  };

  const handleOpenEditDialog = (lead: RecruitmentLead) => {
    setEditingCandidate(lead);
    setCandidateFormOpen(true);
  };

  const handleCloseCandidateForm = () => {
    setCandidateFormOpen(false);
    setEditingCandidate(null);
  };

  const handleCandidateFormSuccess = (savedLead: RecruitmentLead, isEdit: boolean) => {
    setSnackbar({
      open: true,
      message: isEdit
        ? `Candidate ${savedLead.candidate_name} (${savedLead.lead_code}) updated successfully!`
        : `Candidate ${savedLead.candidate_name} (${savedLead.lead_code}) registered successfully!`,
      severity: "success",
    });
    setCandidateFormOpen(false);
    setEditingCandidate(null);
    fetchLeads();
    if (selectedLead && selectedLead.lead_id === savedLead.lead_id) {
      setSelectedLead(savedLead);
      loadActivities(savedLead.lead_id);
    }
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setDebouncedSearch("");
    setStatusFilter("");
    setCategoryFilter("");
    setFollowUpFilter("");
    setPaginationModel((prev) => ({ ...prev, page: 0 }));
  };

  const hasActiveFilters = Boolean(
    searchTerm.trim() || statusFilter || categoryFilter || followUpFilter
  );

  // ── DataGrid Columns ───────────────────────────────────────────────────────
  const columns: GridColDef<RecruitmentLead>[] = [
    {
      field: "lead_code",
      headerName: "Candidate Code",
      width: 135,
      renderCell: (params: GridRenderCellParams<RecruitmentLead, string>) => (
        <Chip
          label={params.value}
          size="small"
          color="primary"
          variant="outlined"
          sx={{ fontWeight: 600, fontSize: "0.75rem" }}
        />
      ),
    },
    {
      field: "candidate_name",
      headerName: "Candidate Name",
      flex: 1.2,
      minWidth: 180,
      renderCell: (params: GridRenderCellParams<RecruitmentLead, string>) => (
        <Box sx={{ overflow: "hidden" }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: "text.primary" }}>
            {params.value}
          </Typography>
          {(params.row.current_designation || params.row.current_company) && (
            <Typography variant="caption" color="text.secondary" noWrap display="block">
              {[params.row.current_designation, params.row.current_company]
                .filter(Boolean)
                .join(" at ")}
            </Typography>
          )}
        </Box>
      ),
    },
    {
      field: "category_name",
      headerName: "Category",
      width: 160,
      renderCell: (params: GridRenderCellParams<RecruitmentLead, string>) => (
        <Chip
          label={params.value || "Uncategorized"}
          size="small"
          sx={{
            bgcolor: theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)",
            fontWeight: 500,
            fontSize: "0.75rem",
          }}
        />
      ),
    },
    {
      field: "phone",
      headerName: "Contact",
      width: 140,
      renderCell: (params: GridRenderCellParams<RecruitmentLead, string>) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <PhoneIcon sx={{ fontSize: 15, color: "text.secondary" }} />
          <Typography variant="body2">{params.value}</Typography>
        </Box>
      ),
    },
    {
      field: "status",
      headerName: "Status",
      width: 150,
      renderCell: (params: GridRenderCellParams<RecruitmentLead, RecruitmentStatus>) => {
        const status = params.value || "Lead Generated";
        const color = STATUS_COLOR_MAP[status] || "default";
        return (
          <Chip
            label={status}
            color={color}
            size="small"
            sx={{ fontWeight: 600, fontSize: "0.75rem" }}
          />
        );
      },
    },
    {
      field: "total_experience_years",
      headerName: "Experience",
      width: 110,
      renderCell: (params: GridRenderCellParams<RecruitmentLead, number>) => (
        <Typography variant="body2">
          {params.value !== undefined && params.value !== null ? `${params.value} yrs` : "—"}
        </Typography>
      ),
    },
    {
      field: "follow_up_date",
      headerName: "Follow-up",
      width: 130,
      renderCell: (params: GridRenderCellParams<RecruitmentLead, string | null>) => {
        if (!params.value) return <Typography variant="caption" color="text.secondary">—</Typography>;
        const todayStr = new Date().toISOString().slice(0, 10);
        const isOverdue = params.value < todayStr;
        const isToday = params.value === todayStr;

        return (
          <Chip
            icon={<CalendarIcon sx={{ fontSize: "14px !important" }} />}
            label={params.value}
            size="small"
            color={isOverdue ? "error" : isToday ? "warning" : "default"}
            variant={isOverdue || isToday ? "filled" : "outlined"}
            sx={{ fontSize: "0.72rem" }}
          />
        );
      },
    },
    {
      field: "resume_url",
      headerName: "Resume",
      width: 100,
      align: "center",
      headerAlign: "center",
      renderCell: (params: GridRenderCellParams<RecruitmentLead, string | null>) => {
        if (!params.value) return <Typography variant="caption" color="text.secondary">—</Typography>;
        return (
          <Tooltip title="Open Google Drive Resume">
            <IconButton
              size="small"
              color="primary"
              component="a"
              href={params.value}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              <OpenInNewIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        );
      },
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 110,
      sortable: false,
      align: "center",
      headerAlign: "center",
      renderCell: (params: GridRenderCellParams<RecruitmentLead>) => (
        <Button
          size="small"
          variant="outlined"
          startIcon={<VisibilityIcon sx={{ fontSize: 16 }} />}
          onClick={(e) => {
            e.stopPropagation();
            handleOpenDetails(params.row);
          }}
          sx={{
            py: 0.25,
            px: 1,
            textTransform: "none",
            fontSize: "0.75rem",
            fontWeight: 600,
            borderRadius: 1.5,
          }}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 }, maxWidth: 1600, mx: "auto" }}>
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          justifyContent: "space-between",
          alignItems: { xs: "flex-start", sm: "center" },
          gap: 2,
          mb: 3,
        }}
      >
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Box
              sx={{
                width: 42,
                height: 42,
                borderRadius: 2,
                bgcolor: "primary.main",
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 12px rgba(37, 99, 235, 0.25)",
              }}
            >
              <CandidateIcon />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                {t("recruitment.title", "Recruitment Workspace")}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t("recruitment.subtitle", "Candidate talent pipeline, applications, and status tracker")}
              </Typography>
            </Box>
          </Box>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, width: { xs: "100%", sm: "auto" } }}>
          <Tooltip title="Refresh Candidate List">
            <IconButton
              onClick={fetchLeads}
              disabled={loading}
              sx={{
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 2,
              }}
            >
              <RefreshIcon sx={{ animation: loading ? "spin 1s linear infinite" : undefined }} />
            </IconButton>
          </Tooltip>

          {/* Create Candidate Action - Restricted to manage_recruitment */}
          <PermissionGate permission={PERMISSIONS.MANAGE_RECRUITMENT}>
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={handleOpenCreateDialog}
              sx={{
                textTransform: "none",
                fontWeight: 600,
                borderRadius: 2,
                px: 2.5,
                boxShadow: "0 4px 14px rgba(37, 99, 235, 0.35)",
              }}
            >
              {t("recruitment.addCandidate", "Add Candidate")}
            </Button>
          </PermissionGate>
        </Box>
      </Box>

      {/* ── Error Banner ─────────────────────────────────────────────────────── */}
      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2.5, borderRadius: 2 }}
          action={
            error.toLowerCase().includes("authentication") ||
            error.toLowerCase().includes("log in") ||
            error.toLowerCase().includes("session") ? (
              <Button color="inherit" size="small" onClick={() => (window.location.href = "/login")}>
                Log In
              </Button>
            ) : (
              <Button color="inherit" size="small" onClick={fetchLeads}>
                Retry
              </Button>
            )
          }
        >
          {error}
        </Alert>
      )}

      {/* ── Filter Card ──────────────────────────────────────────────────────── */}
      <Card
        sx={{
          mb: 3,
          borderRadius: 2.5,
          border: "1px solid",
          borderColor: "divider",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
          <Grid container spacing={2} alignItems="center">
            {/* Search Input */}
            <Grid item xs={12} sm={6} md={3.5}>
              <TextField
                fullWidth
                size="small"
                placeholder={t("recruitment.searchPlaceholder", "Search by name, phone, email, code...")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: "text.secondary", fontSize: 20 }} />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>

            {/* Status Filter */}
            <Grid item xs={12} sm={6} md={2.5}>
              <FormControl fullWidth size="small">
                <InputLabel>{t("common.status", "Status")}</InputLabel>
                <Select
                  value={statusFilter}
                  label={t("common.status", "Status")}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPaginationModel((p) => ({ ...p, page: 0 }));
                  }}
                >
                  <MenuItem value="">{t("common.allStatuses", "All Statuses")}</MenuItem>
                  {ALLOWED_RECRUITMENT_STATUSES.map((st) => (
                    <MenuItem key={st} value={st}>
                      {st}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Category Filter */}
            <Grid item xs={12} sm={6} md={2.5}>
              <FormControl fullWidth size="small">
                <InputLabel>{t("recruitment.category", "Category")}</InputLabel>
                <Select
                  value={categoryFilter}
                  label={t("recruitment.category", "Category")}
                  onChange={(e) => {
                    setCategoryFilter(e.target.value);
                    setPaginationModel((p) => ({ ...p, page: 0 }));
                  }}
                >
                  <MenuItem value="">{t("common.allCategories", "All Categories")}</MenuItem>
                  {categories.map((cat) => (
                    <MenuItem key={cat.category_id} value={cat.category_id}>
                      {cat.category_name || cat.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Follow-up State Filter */}
            <Grid item xs={12} sm={6} md={2.5}>
              <FormControl fullWidth size="small">
                <InputLabel>{t("recruitment.followUp", "Follow-up")}</InputLabel>
                <Select
                  value={followUpFilter}
                  label={t("recruitment.followUp", "Follow-up")}
                  onChange={(e) => {
                    setFollowUpFilter(e.target.value);
                    setPaginationModel((p) => ({ ...p, page: 0 }));
                  }}
                >
                  <MenuItem value="">All Follow-up States</MenuItem>
                  <MenuItem value="today">Scheduled Today</MenuItem>
                  <MenuItem value="overdue">Overdue</MenuItem>
                  <MenuItem value="upcoming">Upcoming</MenuItem>
                  <MenuItem value="has_follow_up">Any Scheduled Follow-up</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* Clear Button */}
            {hasActiveFilters && (
              <Grid item xs={12} md={1} sx={{ display: "flex", justifyContent: "flex-end" }}>
                <Tooltip title="Clear All Filters">
                  <Button
                    size="small"
                    variant="text"
                    color="inherit"
                    startIcon={<ClearIcon />}
                    onClick={handleClearFilters}
                    sx={{ textTransform: "none", fontSize: "0.8rem" }}
                  >
                    Clear
                  </Button>
                </Tooltip>
              </Grid>
            )}
          </Grid>
        </CardContent>
      </Card>

      {/* ── Candidates DataGrid Card ─────────────────────────────────────────── */}
      <Card
        sx={{
          borderRadius: 2.5,
          border: "1px solid",
          borderColor: "divider",
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <Box sx={{ height: 620, width: "100%" }}>
          {loading && leads.length === 0 ? (
            <TableSkeleton rows={8} columns={6} />
          ) : (
            <DataGrid
              rows={leads}
              columns={columns}
              getRowId={(row) => row.lead_id}
              rowCount={totalCount}
              loading={loading}
              paginationMode="server"
              paginationModel={paginationModel}
              onPaginationModelChange={setPaginationModel}
              pageSizeOptions={[10, 25, 50, 100]}
              disableRowSelectionOnClick
              onRowClick={(params) => handleOpenDetails(params.row)}
              sx={{
                border: "none",
                cursor: "pointer",
                "& .MuiDataGrid-row:hover": {
                  backgroundColor:
                    theme.palette.mode === "dark"
                      ? "rgba(255, 255, 255, 0.04)"
                      : "rgba(0, 0, 0, 0.02)",
                },
                "& .MuiDataGrid-cell:focus": {
                  outline: "none",
                },
                "& .MuiDataGrid-columnHeaders": {
                  backgroundColor:
                    theme.palette.mode === "dark"
                      ? "rgba(255, 255, 255, 0.05)"
                      : "rgba(0, 0, 0, 0.02)",
                  fontWeight: 700,
                },
              }}
              localeText={{
                noRowsLabel: (
                  <Box sx={{ py: 6, textAlign: "center" }}>
                    <CandidateIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                      No candidate leads found
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {hasActiveFilters
                        ? "Try clearing filters to see more results."
                        : "Click 'Add Candidate' to record the first applicant."}
                    </Typography>
                  </Box>
                ) as any,
              }}
            />
          )}
        </Box>
      </Card>

      {/* ── Candidate Details Drawer ─────────────────────────────────────────── */}
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={handleCloseDrawer}
        PaperProps={{
          sx: {
            width: { xs: "100%", sm: 540 },
            p: 0,
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        {selectedLead && (
          <>
            {/* Drawer Header */}
            <Box
              sx={{
                p: 2.5,
                borderBottom: "1px solid",
                borderColor: "divider",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                bgcolor:
                  theme.palette.mode === "dark"
                    ? "rgba(255, 255, 255, 0.02)"
                    : "rgba(0, 0, 0, 0.01)",
              }}
            >
              <Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    {selectedLead.candidate_name}
                  </Typography>
                  <Chip
                    label={selectedLead.lead_code}
                    size="small"
                    color="primary"
                    variant="outlined"
                    sx={{ fontWeight: 600, fontSize: "0.72rem" }}
                  />
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  <Chip
                    label={selectedLead.status}
                    color={STATUS_COLOR_MAP[selectedLead.status] || "default"}
                    size="small"
                    sx={{ fontWeight: 600, fontSize: "0.72rem" }}
                  />
                  <Chip
                    label={selectedLead.category_name || "Uncategorized"}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: "0.72rem" }}
                  />
                </Box>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <PermissionGate permission={PERMISSIONS.MANAGE_RECRUITMENT}>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<EditIcon sx={{ fontSize: 16 }} />}
                    onClick={() => handleOpenEditDialog(selectedLead)}
                    sx={{
                      textTransform: "none",
                      fontWeight: 600,
                      borderRadius: 1.5,
                      fontSize: "0.75rem",
                    }}
                  >
                    Edit
                  </Button>
                </PermissionGate>
                <IconButton onClick={handleCloseDrawer} size="small">
                  <CloseIcon />
                </IconButton>
              </Box>
            </Box>

            {/* Drawer Tabs */}
            <Box sx={{ borderBottom: 1, borderColor: "divider", px: 2.5 }}>
              <Tabs
                value={drawerTab}
                onChange={(_, newVal) => setDrawerTab(newVal)}
                variant="standard"
              >
                <Tab label="Candidate Profile" sx={{ textTransform: "none", fontWeight: 600 }} />
                <Tab
                  label={`Activities (${activities.length})`}
                  sx={{ textTransform: "none", fontWeight: 600 }}
                />
              </Tabs>
            </Box>

            {/* Drawer Body */}
            <Box sx={{ p: 2.5, flex: 1, overflowY: "auto" }}>
              {/* Tab 0: Profile Overview */}
              <TabPanel value={drawerTab} index={0}>
                {/* Contact Information */}
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: "primary.main" }}>
                  Contact Information
                </Typography>
                <Grid container spacing={2} sx={{ mb: 3 }}>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Primary Phone
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                      <PhoneIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {selectedLead.phone}
                      </Typography>
                    </Box>
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Alternate Phone
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      {selectedLead.alternate_phone || "—"}
                    </Typography>
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Email Address
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                      <EmailIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                      <Typography variant="body2">
                        {selectedLead.email || "—"}
                      </Typography>
                    </Box>
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Current City
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                      <LocationOnIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                      <Typography variant="body2">
                        {selectedLead.current_city || "—"}
                      </Typography>
                    </Box>
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      State
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      {selectedLead.state || "—"}
                    </Typography>
                  </Grid>
                </Grid>

                <Divider sx={{ my: 2 }} />

                {/* Professional Details */}
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: "primary.main" }}>
                  Professional Details
                </Typography>
                <Grid container spacing={2} sx={{ mb: 3 }}>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Current Company
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500, mt: 0.5 }}>
                      {selectedLead.current_company || "—"}
                    </Typography>
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Current Designation
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500, mt: 0.5 }}>
                      {selectedLead.current_designation || "—"}
                    </Typography>
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Total Experience
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5 }}>
                      {selectedLead.total_experience_years} years
                    </Typography>
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Notice Period
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      {selectedLead.notice_period_days ? `${selectedLead.notice_period_days} days` : "—"}
                    </Typography>
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Current CTC
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      {selectedLead.current_ctc ? `₹ ${selectedLead.current_ctc.toLocaleString()}` : "—"}
                    </Typography>
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Highest Qualification
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500, mt: 0.5 }}>
                      {selectedLead.highest_qualification || "—"}
                    </Typography>
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Expected CTC
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      {selectedLead.expected_ctc ? `₹ ${selectedLead.expected_ctc.toLocaleString()}` : "—"}
                    </Typography>
                  </Grid>

                  <Grid item xs={12}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Key Skills
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      {selectedLead.key_skills || "—"}
                    </Typography>
                  </Grid>
                </Grid>

                <Divider sx={{ my: 2 }} />

                {/* Resume & Follow-up */}
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: "primary.main" }}>
                  Resume & Follow-up
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Google Drive Resume Link
                    </Typography>
                    {selectedLead.resume_url ? (
                      <Box sx={{ mt: 1 }}>
                        <Button
                          variant="outlined"
                          color="primary"
                          startIcon={<LinkIcon />}
                          endIcon={<OpenInNewIcon />}
                          component="a"
                          href={selectedLead.resume_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          sx={{ textTransform: "none", borderRadius: 2 }}
                        >
                          View Resume on Google Drive
                        </Button>
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        No resume URL attached.
                      </Typography>
                    )}
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Scheduled Follow-up Date
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5 }}>
                      {selectedLead.follow_up_date || "None scheduled"}
                    </Typography>
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Created By
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      {selectedLead.created_by || "System"}
                    </Typography>
                  </Grid>

                  {selectedLead.status_notes && (
                    <Grid item xs={12}>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Status Notes
                      </Typography>
                      <Paper
                        variant="outlined"
                        sx={{ p: 1.5, mt: 0.5, borderRadius: 2, bgcolor: "action.hover" }}
                      >
                        <Typography variant="body2">{selectedLead.status_notes}</Typography>
                      </Paper>
                    </Grid>
                  )}
                </Grid>

                {/* Screening Questionnaire Responses */}
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: "primary.main" }}>
                  Screening Questionnaire Responses
                </Typography>
                {selectedLead.questionnaire_responses && Object.keys(selectedLead.questionnaire_responses).length > 0 ? (
                  <Grid container spacing={2}>
                    {/* Willing to Relocate */}
                    {(selectedLead.questionnaire_responses.willing_to_relocate !== undefined) && (
                      <Grid item xs={12} sm={6}>
                        <Typography variant="caption" color="text.secondary" display="block">
                          Willing to Travel / Relocate
                        </Typography>
                        <Chip
                          size="small"
                          label={
                            typeof selectedLead.questionnaire_responses.willing_to_relocate === "boolean"
                              ? (selectedLead.questionnaire_responses.willing_to_relocate ? "Yes" : "No")
                              : String(selectedLead.questionnaire_responses.willing_to_relocate)
                          }
                          color={
                            String(selectedLead.questionnaire_responses.willing_to_relocate).toLowerCase().includes("no")
                              ? "default"
                              : "primary"
                          }
                          sx={{ mt: 0.5, fontWeight: 600 }}
                        />
                      </Grid>
                    )}

                    {/* Driving License */}
                    {(selectedLead.questionnaire_responses.has_driving_license || selectedLead.questionnaire_responses.has_valid_license !== undefined) && (
                      <Grid item xs={12} sm={6}>
                        <Typography variant="caption" color="text.secondary" display="block">
                          Driving License
                        </Typography>
                        <Chip
                          size="small"
                          label={
                            selectedLead.questionnaire_responses.has_driving_license ||
                            (selectedLead.questionnaire_responses.has_valid_license ? "Yes" : "No")
                          }
                          color="primary"
                          sx={{ mt: 0.5, fontWeight: 600 }}
                        />
                      </Grid>
                    )}

                    {/* Own Vehicle */}
                    {(selectedLead.questionnaire_responses.own_two_wheeler || selectedLead.questionnaire_responses.own_vehicle !== undefined) && (
                      <Grid item xs={12} sm={6}>
                        <Typography variant="caption" color="text.secondary" display="block">
                          Owns Two-Wheeler / Vehicle
                        </Typography>
                        <Chip
                          size="small"
                          label={
                            selectedLead.questionnaire_responses.own_two_wheeler ||
                            (selectedLead.questionnaire_responses.own_vehicle ? "Yes" : "No")
                          }
                          color={
                            String(selectedLead.questionnaire_responses.own_two_wheeler || selectedLead.questionnaire_responses.own_vehicle).toLowerCase() === "no"
                              ? "default"
                              : "success"
                          }
                          sx={{ mt: 0.5, fontWeight: 600 }}
                        />
                      </Grid>
                    )}

                    {/* Relevant Industry Experience */}
                    {(selectedLead.questionnaire_responses.relevant_industry_experience || selectedLead.questionnaire_responses.has_chemical_industry_experience !== undefined) && (
                      <Grid item xs={12} sm={6}>
                        <Typography variant="caption" color="text.secondary" display="block">
                          Chemical / Agro-Chemical Background
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500, mt: 0.5 }}>
                          {selectedLead.questionnaire_responses.relevant_industry_experience ||
                            (selectedLead.questionnaire_responses.has_chemical_industry_experience ? "Yes" : "No")}
                        </Typography>
                      </Grid>
                    )}

                    {/* Territory Knowledge */}
                    {(selectedLead.questionnaire_responses.primary_territory_knowledge || selectedLead.questionnaire_responses.territory_knowledge) && (
                      <Grid item xs={12}>
                        <Typography variant="caption" color="text.secondary" display="block">
                          Primary Territory / Market Route Knowledge
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 0.5 }}>
                          {selectedLead.questionnaire_responses.primary_territory_knowledge || selectedLead.questionnaire_responses.territory_knowledge}
                        </Typography>
                      </Grid>
                    )}

                    {/* Languages Known */}
                    {(selectedLead.questionnaire_responses.languages_known || selectedLead.questionnaire_responses.languages_spoken) && (
                      <Grid item xs={12}>
                        <Typography variant="caption" color="text.secondary" display="block">
                          Languages Known
                        </Typography>
                        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.5 }}>
                          {Array.isArray(selectedLead.questionnaire_responses.languages_known) ? (
                            selectedLead.questionnaire_responses.languages_known.map((lang: string) => (
                              <Chip key={lang} label={lang} size="small" variant="outlined" />
                            ))
                          ) : (
                            <Typography variant="body2">
                              {String(selectedLead.questionnaire_responses.languages_known || selectedLead.questionnaire_responses.languages_spoken)}
                            </Typography>
                          )}
                        </Box>
                      </Grid>
                    )}

                    {/* Interviewer Notes */}
                    {selectedLead.questionnaire_responses.interviewer_notes && (
                      <Grid item xs={12}>
                        <Typography variant="caption" color="text.secondary" display="block">
                          Initial Screening Assessment Notes
                        </Typography>
                        <Paper variant="outlined" sx={{ p: 1.5, mt: 0.5, borderRadius: 2, bgcolor: "action.hover" }}>
                          <Typography variant="body2">{selectedLead.questionnaire_responses.interviewer_notes}</Typography>
                        </Paper>
                      </Grid>
                    )}
                  </Grid>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No screening questionnaire responses recorded.
                  </Typography>
                )}
              </TabPanel>

              {/* Tab 1: Activity Timeline */}
              <TabPanel value={drawerTab} index={1}>
                {activitiesLoading ? (
                  <Box sx={{ py: 4, display: "flex", justifyContent: "center" }}>
                    <CircularProgress size={32} />
                  </Box>
                ) : activities.length === 0 ? (
                  <Box sx={{ py: 4, textAlign: "center" }}>
                    <HistoryIcon sx={{ fontSize: 36, color: "text.disabled", mb: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      No activity records logged for this candidate yet.
                    </Typography>
                  </Box>
                ) : (
                  <Box>
                    {activities.map((act) => (
                      <Box
                        key={act.activity_id}
                        sx={{
                          py: 1.5,
                          px: 2,
                          mb: 1.5,
                          borderRadius: 2,
                          borderLeft: "3px solid",
                          borderColor:
                            act.activity_type === "Creation"
                              ? "success.main"
                              : act.activity_type === "Status Change"
                              ? "warning.main"
                              : "primary.main",
                          bgcolor: "action.hover",
                        }}
                      >
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                          <Chip
                            label={act.activity_type}
                            size="small"
                            sx={{ fontWeight: 600, fontSize: "0.68rem" }}
                          />
                          {act.status_to && (
                            <Typography variant="caption" sx={{ fontWeight: 600 }}>
                              Status: {act.status_to}
                            </Typography>
                          )}
                          <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
                            {new Date(act.logged_at).toLocaleString("en-IN", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </Typography>
                        </Box>

                        <Typography variant="body2" sx={{ fontWeight: 500, mt: 0.5 }}>
                          {act.summary}
                        </Typography>

                        {act.details && (
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            {act.details}
                          </Typography>
                        )}

                        {act.outcome && (
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                            <strong>Outcome:</strong> {act.outcome}
                          </Typography>
                        )}

                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                          Logged by: {act.logged_by}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                )}
              </TabPanel>
            </Box>
          </>
        )}
      </Drawer>

      {/* ── Multi-Step Candidate Form Dialog (Phase 4.2) ────────────────────────── */}
      <CandidateFormDialog
        open={candidateFormOpen}
        onClose={handleCloseCandidateForm}
        onSuccess={handleCandidateFormSuccess}
        categories={categories}
        categoriesLoading={categoriesLoading}
        categoriesError={categoriesError}
        initialData={editingCandidate}
      />

      {/* ── Notification Feedback Snackbar ───────────────────────────────────── */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((p) => ({ ...p, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          onClose={() => setSnackbar((p) => ({ ...p, open: false }))}
          severity={snackbar.severity}
          sx={{ width: "100%", borderRadius: 2 }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
