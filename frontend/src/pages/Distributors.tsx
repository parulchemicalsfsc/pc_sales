import { useState, useEffect } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Typography,
  IconButton,
  Chip,
  Alert,
  CircularProgress,
  InputAdornment,
  Grid,
  Divider,
  Tooltip,
  MenuItem,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Phone as PhoneIcon,
  LocationOn as LocationOnIcon,
  Refresh as RefreshIcon,
  Group as GroupIcon,
} from "@mui/icons-material";
import { TableSkeleton } from "../components/Skeletons";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import { distributorAPI } from "../services/api";
import type { Distributor } from "../types";
import { useTranslation } from "../hooks/useTranslation";
import PermissionGate from "../components/PermissionGate";
import { PERMISSIONS } from "../config/permissions";

export default function Distributors() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { t, tf } = useTranslation();
  const [distributors, setDistributors] = useState<Distributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingDistributor, setEditingDistributor] =
    useState<Distributor | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [columnNames, setColumnNames] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem("distributorColumnNames");
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem("distributorColumnNames", JSON.stringify(columnNames));
  }, [columnNames]);

  const [renameField, setRenameField] = useState<string | null>(null);
  const [newColumnName, setNewColumnName] = useState("");

  const handleRenameClick = (field: string) => {
    setRenameField(field);
    setNewColumnName(columnNames[field] || "");
  };

  const handleSaveRename = () => {
    if (renameField) {
      setColumnNames((prev) => ({
        ...prev,
        [renameField]: newColumnName,
      }));
      setRenameField(null);
    }
  };

  const handleCloseRename = () => {
    setRenameField(null);
    setNewColumnName("");
  };
  
  const [formData, setFormData] = useState<Partial<Distributor>>({
    village: "",
    taluka: "",
    district: "",
    state: "Gujarat",
    mantri_name: "",
    mantri_mobile: "",
    sabhasad_morning: 0,
    sabhasad_evening: 0,
    sabhasad_count: 0,
    contact_in_group: 0,
    status: "Active",
    record_date: new Date().toISOString().split('T')[0],
    dairy_type: "",
    dairy_time_morning: "",
    dairy_time_evening: "",
    milk_collection_morning: 0,
    milk_collection_evening: 0,
    nature_of_sabhasad: "",
    support: "",
    animal_delivery_period: "",
    payment_recovery_demo: 0,
    payment_recovery_dispatch: 0,
    decision_maker_availability_morning: "",
    decision_maker_availability_evening: "",
    high_holder_to_low_holder_villages: "",
    current_status_of_business: "",
  });

  useEffect(() => {
    loadDistributors();
  }, []);

  const loadDistributors = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await distributorAPI.getAll({ limit: 1000 });
      setDistributors(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("distributors.loadError", "Failed to load Mantri"),
      );
      console.error("Error loading distributors:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (distributor?: Distributor) => {
    if (distributor) {
      setEditingDistributor(distributor);
      setFormData(distributor);
    } else {
      setEditingDistributor(null);
      setFormData({
        village: "",
        taluka: "",
        district: "",
        state: "Gujarat",
        mantri_name: "",
        mantri_mobile: "",
        sabhasad_morning: 0,
        sabhasad_evening: 0,
        sabhasad_count: 0,
        contact_in_group: 0,
        status: "Active",
        record_date: new Date().toISOString().split('T')[0],
        dairy_type: "",
        dairy_time_morning: "",
        dairy_time_evening: "",
        milk_collection_morning: 0,
        milk_collection_evening: 0,
        nature_of_sabhasad: "",
        support: "",
        animal_delivery_period: "",
        payment_recovery_demo: 0,
        payment_recovery_dispatch: 0,
        decision_maker_availability_morning: "",
        decision_maker_availability_evening: "",
        high_holder_to_low_holder_villages: "",
        current_status_of_business: "",
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingDistributor(null);
  };

  const handleSubmit = async () => {
    try {
      if (!formData.village || !formData.taluka || !formData.mantri_name) {
        setError("Village, Taluka and Mantri Name are required");
        return;
      }

      if (editingDistributor) {
        console.log("🚀 PAYLOAD BEING SENT:", formData);
        await distributorAPI.update(
          editingDistributor.distributor_id!,
          formData as Distributor,
        );
      } else {
        await distributorAPI.create(formData as Distributor);
      }

      handleCloseDialog();
      loadDistributors();
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("distributors.saveError", "Failed to save Mantri"),
      );
      console.error("Error saving distributor:", err);
    }
  };

  const getRowColor = (row: Distributor) => {
    // RED (Critical Issue): Missing core contact or identity data
    const redFields = ["village", "taluka", "mantri_name", "mantri_mobile"];
    const isRed = redFields.some(
      (field) =>
        row[field as keyof Distributor] === null ||
        row[field as keyof Distributor] === undefined ||
        row[field as keyof Distributor] === "",
    );
    if (isRed) return "red";

    // GREEN (Strictly Complete): ALL specified data points must be present
    const greenFields = [
      "village",
      "taluka",
      "mantri_name",
      "sabhasad_morning",
      "sabhasad_evening",
    ];
    const isGreen = greenFields.every(
      (field) =>
        row[field as keyof Distributor] !== null &&
        row[field as keyof Distributor] !== undefined &&
        row[field as keyof Distributor] !== "",
    );
    if (isGreen) return "green";

    // ORANGE (Partial): Critical fields exist, but others are missing
    return "orange";
  };

  const StatusDot = ({ color }: { color: string }) => (
    <Box
      sx={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        backgroundColor:
          color === "green"
            ? "#16a34a"
            : color === "orange"
              ? "#ea580c"
              : "#ef4444",
        flexShrink: 0,
      }}
    />
  );

  const displayValue = (val: any) => {
    if (val === null || val === undefined || val === "") return "N/A";
    return val;
  };

  const renderBadge = (params: any) => {
    const value = params.value;
    const field = params.field;

    if (value === null || value === undefined) return "N/A";

    const getBadgeColor = (fieldName: string, val: any) => {
      if (!val || val === 0) return "#6b7280"; // gray for 0/null/empty
      if (fieldName.includes("sabhasad")) return "#2563eb"; // blue
      if (fieldName.includes("contact") || fieldName.includes("group"))
        return "#7c3aed"; // purple
      if (fieldName.includes("milk")) return "#16a34a"; // green
      if (fieldName.includes("payment")) return "#ea580c"; // orange
      return "#2563eb"; // default
    };

    const bgColor = getBadgeColor(field, value);

    return (
      <span
        style={{
          backgroundColor: bgColor,
          color: "white",
          borderRadius: "999px",
          padding: "4px 10px",
          fontSize: "12px",
          fontWeight: 500,
          display: "inline-block",
          minWidth: "28px",
          textAlign: "center",
          boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
        }}
      >
        {value}
      </span>
    );
  };

  const baseColumns: GridColDef[] = [
    {
      field: "actions",
      headerName: t("common.actions"),
      width: 120,
      sortable: false,
      headerAlign: "center",
      align: "center",
      headerClassName: "multi-line-header",
      renderCell: (params) => (
        <Box>
          <PermissionGate permission={PERMISSIONS.EDIT_DISTRIBUTOR}>
            <IconButton
              size="small"
              onClick={() => handleOpenDialog(params.row)}
              color="primary"
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </PermissionGate>
        </Box>
      ),
    },
    // 1. Mantri (Moved to start)
    {
      field: "mantri_name",
      headerName: t("distributors.mantriName", "Mantri Name"),
      width: 220,
      minWidth: 180,
      headerAlign: "center",
      align: "center",
      headerClassName: "multi-line-header",
      renderCell: (params) => (
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          width: '100%',
          overflow: 'hidden'
        }}>
          <StatusDot color={getRowColor(params.row)} />
          <span style={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {displayValue(params.value)}
          </span>
        </Box>
      ),
    },
    {
      field: "mantri_mobile",
      headerName: t("distributors.mobile", "Mantri Mobile"),
      width: 150,
      headerAlign: "center",
      align: "center",
      headerClassName: "multi-line-header",
      renderCell: (params) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, height: "100%" }}>
          <PhoneIcon sx={{ fontSize: 16 }} />
          <span>{displayValue(params.value)}</span>
        </Box>
      ),
    },

    // 2. Identity
    {
      field: "village",
      headerName: tf("village"),
      width: 150,
      minWidth: 120,
      headerAlign: "center",
      align: "center",
      headerClassName: "multi-line-header",
      renderCell: (params) => <span>{displayValue(params.value)}</span>,
    },
    {
      field: "taluka",
      headerName: tf("taluka"),
      width: 150,
      minWidth: 120,
      headerAlign: "center",
      align: "center",
      headerClassName: "multi-line-header",
      renderCell: (params) => <span>{displayValue(params.value)}</span>,
    },
    {
      field: "district",
      headerName: tf("district"),
      width: 150,
      minWidth: 120,
      headerAlign: "center",
      align: "center",
      headerClassName: "multi-line-header",
    },
    {
      field: "state",
      headerName: tf("state"),
      width: 150,
      minWidth: 120,
      headerAlign: "center",
      align: "center",
      headerClassName: "multi-line-header",
    },
    {
      field: "record_date",
      headerName: t("distributors.recordDate", "Record Date"),
      width: 150,
      minWidth: 120,
      headerAlign: "center",
      align: "center",
      headerClassName: "multi-line-header",
      valueFormatter: (params) =>
        params.value ? new Date(params.value).toLocaleDateString("en-GB") : "N/A",
      sortComparator: (v1, v2) =>
        new Date(v1 as string).getTime() - new Date(v2 as string).getTime(),
    },

    // 3. Core Data
    {
      field: "sabhasad_morning",
      headerName: "Sabhasad (M)",
      width: 120,
      headerAlign: "center",
      align: "center",
      headerClassName: "multi-line-header",
      renderCell: renderBadge,
    },
    {
      field: "sabhasad_evening",
      headerName: "Sabhasad (E)",
      width: 120,
      headerAlign: "center",
      align: "center",
      headerClassName: "multi-line-header",
      renderCell: renderBadge,
    },
    {
      field: "sabhasad_count",
      headerName: "Total Sabhasad",
      width: 140,
      headerAlign: "center",
      align: "center",
      headerClassName: "multi-line-header",
      renderCell: renderBadge,
    },
    {
      field: "milk_collection_morning",
      headerName: "Milk (M)",
      width: 120,
      headerAlign: "center",
      align: "center",
      headerClassName: "multi-line-header",
      renderCell: renderBadge,
    },
    {
      field: "milk_collection_evening",
      headerName: "Milk (E)",
      width: 120,
      headerAlign: "center",
      align: "center",
      headerClassName: "multi-line-header",
      renderCell: renderBadge,
    },

    // 4. Operational
    {
      field: "dairy_type",
      headerName: "Dairy Type",
      width: 150,
      headerAlign: "center",
      align: "center",
      headerClassName: "multi-line-header",
    },
    {
      field: "dairy_time_morning",
      headerName: "Dairy Time (M)",
      width: 150,
      headerAlign: "center",
      align: "center",
      headerClassName: "multi-line-header",
      valueFormatter: (params) =>
        params.value ? String(params.value).slice(0, 5) : "N/A",
      sortComparator: (v1, v2) =>
        (v1 as string || "").localeCompare(v2 as string || ""),
    },
    {
      field: "dairy_time_evening",
      headerName: "Dairy Time (E)",
      width: 150,
      headerAlign: "center",
      align: "center",
      headerClassName: "multi-line-header",
      valueFormatter: (params) =>
        params.value ? String(params.value).slice(0, 5) : "N/A",
      sortComparator: (v1, v2) =>
        (v1 as string || "").localeCompare(v2 as string || ""),
    },
    {
      field: "nature_of_sabhasad",
      headerName: "Nature of Sabhasad",
      width: 150,
      headerAlign: "center",
      align: "center",
      headerClassName: "multi-line-header",
    },

    // 5. Advanced
    {
      field: "payment_recovery_demo",
      headerName: "Recovery (Demo)",
      width: 150,
      headerAlign: "center",
      align: "center",
      headerClassName: "multi-line-header",
      renderCell: renderBadge,
    },
    {
      field: "payment_recovery_dispatch",
      headerName: "Recovery (Dispatch)",
      width: 150,
      headerAlign: "center",
      align: "center",
      headerClassName: "multi-line-header",
      renderCell: renderBadge,
    },
    {
      field: "decision_maker_availability_morning",
      headerName: "DM Avail (M)",
      width: 150,
      headerAlign: "center",
      align: "center",
      headerClassName: "multi-line-header",
    },
    {
      field: "decision_maker_availability_evening",
      headerName: "DM Avail (E)",
      width: 150,
      headerAlign: "center",
      align: "center",
      headerClassName: "multi-line-header",
    },

    // 6. Long Text
    {
      field: "support",
      headerName: "Support",
      width: 250,
      headerAlign: "center",
      align: "center",
      headerClassName: "multi-line-header",
      renderCell: (params) => (
        <Tooltip title={params.value || "N/A"}>
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displayValue(params.value)}
          </span>
        </Tooltip>
      ),
    },
    {
      field: "high_holder_to_low_holder_villages",
      headerName: "High/Low Villages",
      width: 250,
      headerAlign: "center",
      align: "center",
      headerClassName: "multi-line-header",
      renderCell: (params) => (
        <Tooltip title={params.value || "N/A"}>
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displayValue(params.value)}
          </span>
        </Tooltip>
      ),
    },
    {
      field: "current_status_of_business",
      headerName: "Business Status",
      width: 250,
      headerAlign: "center",
      align: "center",
      headerClassName: "multi-line-header",
      renderCell: (params) => (
        <Tooltip title={params.value || "N/A"}>
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displayValue(params.value)}
          </span>
        </Tooltip>
      ),
    },

    // 7. Admin
    {
      field: "contact_in_group",
      headerName: "In Group",
      width: 120,
      headerAlign: "center",
      align: "center",
      headerClassName: "multi-line-header",
      renderCell: renderBadge,
    },
    {
      field: "status",
      headerName: tf("status"),
      width: 100,
      headerAlign: "center",
      align: "center",
      headerClassName: "multi-line-header",
      renderCell: (params) => (
        <Chip
          label={
            params.value === "Active"
              ? t("distributors.active")
              : t("distributors.inactive")
          }
          size="small"
          color={params.value === "Active" ? "success" : "default"}
          sx={{
            boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
            fontWeight: 500,
            fontSize: "12px",
            borderRadius: "999px",
            px: 0.5,
          }}
        />
      ),
    },
  ];

  const columns: GridColDef[] = baseColumns.map((col) => ({
    ...col,
    headerName: columnNames[col.field] || col.headerName,
    renderHeader: (params: any) => (
      <Tooltip title="Double click to rename">
        <Box
          onDoubleClick={() => handleRenameClick(params.field)}
          sx={{
            width: "100%",
            cursor: "pointer",
            textAlign: "center",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
          }}
        >
          {columnNames[params.field] || params.colDef.headerName}
        </Box>
      </Tooltip>
    ),
  }));

  const filteredDistributors = distributors.filter((distributor) =>
    Object.values(distributor).some((value) =>
      value?.toString().toLowerCase().includes(searchTerm.toLowerCase()),
    ),
  );

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: { xs: 2, md: 4 } }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
          <GroupIcon sx={{ mr: 1, verticalAlign: "middle" }} />
          {t("distributors.title")}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {t("distributors.subtitle", "Manage your distributor network")}
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Actions Bar */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box
            sx={{
              display: "flex",
              gap: 2,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <TextField
              placeholder={t("common.search")}
              size="small"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
              sx={{ flexGrow: 1, minWidth: 250 }}
            />
            <PermissionGate permission={PERMISSIONS.CREATE_DISTRIBUTOR}>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => handleOpenDialog()}
              >
                {t("distributors.addDistributor")}
              </Button>
            </PermissionGate>
            <IconButton onClick={loadDistributors} color="primary">
              <RefreshIcon />
            </IconButton>
          </Box>
        </CardContent>
      </Card>

      {/* Data Grid */}
      <Card>
        <CardContent>
          <Box sx={{ height: 600, width: "100%", overflowX: "auto" }}>
            {loading ? (
              <TableSkeleton rows={10} columns={5} />
            ) : (
              <DataGrid
                rows={filteredDistributors}
                columns={columns}
                getRowId={(row) => row.distributor_id}
                columnBuffer={10}
                pageSizeOptions={[10, 25, 50]}
                disableRowSelectionOnClick
                scrollbarSize={8}
                rowHeight={48}
                localeText={{
                  noRowsLabel: "No distributor data available",
                }}
                initialState={{
                  pagination: {
                    paginationModel: { pageSize: 25 },
                  },
                }}
                getRowClassName={(params) => `row-${getRowColor(params.row)}`}
                getRowSpacing={() => ({
                  top: 4,
                  bottom: 4,
                })}
                sx={{
                  border: "none",
                  "& .multi-line-header": {
                    whiteSpace: "normal !important",
                    lineHeight: "1.2 !important",
                    textAlign: "center",
                  },
                  "& .MuiDataGrid-row": {
                    borderRadius: "6px",
                    marginBottom: "6px",
                    transition: "all 0.2s ease",
                    bgcolor: "#fff",
                    "&:hover": {
                      cursor: "pointer",
                    },
                  },
                  "& .row-green": {
                    backgroundColor: "#d1fae5 !important",
                    borderLeft: "5px solid #16a34a !important",
                    "&:hover": {
                      backgroundColor: "#bbf7d0 !important",
                    },
                  },
                  "& .row-orange": {
                    backgroundColor: "#ffedd5 !important",
                    borderLeft: "5px solid #ea580c !important",
                    "&:hover": {
                      backgroundColor: "#fed7aa !important",
                    },
                  },
                  "& .row-red": {
                    backgroundColor: "#fee2e2 !important",
                    borderLeft: "5px solid #dc2626 !important",
                    "&:hover": {
                      backgroundColor: "#fecaca !important",
                    },
                  },
                  "& .MuiDataGrid-cell": {
                    borderBottom: "none",
                    display: "flex",
                    alignItems: "center",
                    fontWeight: 500,
                    fontSize: "14px",
                    px: 2,
                    whiteSpace: "nowrap",
                  },
                  "& .MuiDataGrid-columnHeaders": {
                    bgcolor: "rgba(0,0,0,0.01)",
                    borderRadius: 0,
                    borderBottom: "1px solid rgba(0,0,0,0.08)",
                    color: "#111827",
                    fontWeight: 600,
                    fontSize: "14px",
                  },
                }}
              />
            )}
          </Box>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog
        open={openDialog}
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>
          {editingDistributor
            ? t("distributors.editDistributor")
            : t("distributors.addDistributor")}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {/* Section 1: Basic Info */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="primary" sx={{ fontWeight: 600 }}>
                {t("distributors.basicInfo", "Basic Information")}
              </Typography>
              <Divider sx={{ mt: 0.5, mb: 1.5 }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={t("distributors.mantriName", "Mantri Name")}
                value={formData.mantri_name}
                onChange={(e) =>
                  setFormData({ ...formData, mantri_name: e.target.value })
                }
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={t("distributors.mantriMobile", "Mantri Mobile")}
                value={formData.mantri_mobile}
                onChange={(e) =>
                  setFormData({ ...formData, mantri_mobile: e.target.value })
                }
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">+91</InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="date"
                label={t("distributors.recordDate", "Record Date")}
                value={formData.record_date || ""}
                onChange={(e) =>
                  setFormData({ ...formData, record_date: e.target.value })
                }
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={tf("village")}
                value={formData.village}
                onChange={(e) =>
                  setFormData({ ...formData, village: e.target.value })
                }
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label={tf("taluka")}
                value={formData.taluka}
                onChange={(e) =>
                  setFormData({ ...formData, taluka: e.target.value })
                }
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label={tf("district")}
                value={formData.district}
                onChange={(e) =>
                  setFormData({ ...formData, district: e.target.value })
                }
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label={tf("state")}
                value={formData.state || ""}
                onChange={(e) =>
                  setFormData({ ...formData, state: e.target.value })
                }
              />
            </Grid>

            {/* Section 2: Sabhasad & Counts */}
            <Grid item xs={12} sx={{ mt: 2 }}>
              <Typography variant="subtitle2" color="primary" sx={{ fontWeight: 600 }}>
                {t("distributors.sabhasadDetails", "Sabhasad & Participation")}
              </Typography>
              <Divider sx={{ mt: 0.5, mb: 1.5 }} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                type="number"
                label={t("distributors.sabhasadMorning", "Sabhasad Morning")}
                value={formData.sabhasad_morning}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    sabhasad_morning: Number(e.target.value) || 0,
                  })
                }
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                type="number"
                label={t("distributors.sabhasadEvening", "Sabhasad Evening")}
                value={formData.sabhasad_evening}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    sabhasad_evening: Number(e.target.value) || 0,
                  })
                }
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                type="number"
                label={t("distributors.sabhasadCount", "Total Sabhasad")}
                value={formData.sabhasad_count || 0}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    sabhasad_count: Number(e.target.value) || 0,
                  })
                }
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label={t("distributors.contactInGroup", "Contact in Group")}
                value={formData.contact_in_group}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    contact_in_group: Number(e.target.value) || 0,
                  })
                }
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                select
                label={tf("status")}
                value={formData.status}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value })
                }
              >
                <MenuItem value="Active">{t("distributors.active")}</MenuItem>
                <MenuItem value="Inactive">
                  {t("distributors.inactive")}
                </MenuItem>
              </TextField>
            </Grid>

            {/* Section 3: Dairy Operations */}
            <Grid item xs={12} sx={{ mt: 2 }}>
              <Typography variant="subtitle2" color="primary" sx={{ fontWeight: 600 }}>
                {t("distributors.dairyOps", "Dairy Operations")}
              </Typography>
              <Divider sx={{ mt: 0.5, mb: 1.5 }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={t("distributors.dairyType", "Dairy Type")}
                value={formData.dairy_type || ""}
                onChange={(e) =>
                  setFormData({ ...formData, dairy_type: e.target.value })
                }
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={t("distributors.nature", "Nature of Sabhasad")}
                value={formData.nature_of_sabhasad || ""}
                onChange={(e) =>
                  setFormData({ ...formData, nature_of_sabhasad: e.target.value })
                }
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                fullWidth
                type="time"
                label={t("distributors.dairyTimeM", "Dairy Time (M)")}
                value={formData.dairy_time_morning || ""}
                onChange={(e) =>
                  setFormData({ ...formData, dairy_time_morning: e.target.value })
                }
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                fullWidth
                type="time"
                label={t("distributors.dairyTimeE", "Dairy Time (E)")}
                value={formData.dairy_time_evening || ""}
                onChange={(e) =>
                  setFormData({ ...formData, dairy_time_evening: e.target.value })
                }
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                fullWidth
                type="number"
                label={t("distributors.milkM", "Milk (M)")}
                value={formData.milk_collection_morning || 0}
                onChange={(e) =>
                  setFormData({ ...formData, milk_collection_morning: Number(e.target.value) || 0 })
                }
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                fullWidth
                type="number"
                label={t("distributors.milkE", "Milk (E)")}
                value={formData.milk_collection_evening || 0}
                onChange={(e) =>
                  setFormData({ ...formData, milk_collection_evening: Number(e.target.value) || 0 })
                }
              />
            </Grid>

            {/* Section 4: Business Insights */}
            <Grid item xs={12} sx={{ mt: 2 }}>
              <Typography variant="subtitle2" color="primary" sx={{ fontWeight: 600 }}>
                {t("distributors.businessInsights", "Business & Recovery")}
              </Typography>
              <Divider sx={{ mt: 0.5, mb: 1.5 }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label={t("distributors.recoveryDemo", "Recovery Days (Demo)")}
                value={formData.payment_recovery_demo || 0}
                onChange={(e) =>
                  setFormData({ ...formData, payment_recovery_demo: Number(e.target.value) || 0 })
                }
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label={t("distributors.recoveryDispatch", "Recovery Days (Dispatch)")}
                value={formData.payment_recovery_dispatch || 0}
                onChange={(e) =>
                  setFormData({ ...formData, payment_recovery_dispatch: Number(e.target.value) || 0 })
                }
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={t("distributors.dmAvailM", "DM Avail (M)")}
                value={formData.decision_maker_availability_morning || ""}
                onChange={(e) =>
                  setFormData({ ...formData, decision_maker_availability_morning: e.target.value })
                }
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={t("distributors.dmAvailE", "DM Avail (E)")}
                value={formData.decision_maker_availability_evening || ""}
                onChange={(e) =>
                  setFormData({ ...formData, decision_maker_availability_evening: e.target.value })
                }
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label={t("distributors.support", "Support Level")}
                value={formData.support || ""}
                onChange={(e) =>
                  setFormData({ ...formData, support: e.target.value })
                }
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={2}
                label={t("distributors.highLowVillages", "High to Low Holder Villages")}
                value={formData.high_holder_to_low_holder_villages || ""}
                onChange={(e) =>
                  setFormData({ ...formData, high_holder_to_low_holder_villages: e.target.value })
                }
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={2}
                label={t("distributors.businessStatus", "Current Status of Business")}
                value={formData.current_status_of_business || ""}
                onChange={(e) =>
                  setFormData({ ...formData, current_status_of_business: e.target.value })
                }
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>{t("common.cancel")}</Button>
          <Button onClick={handleSubmit} variant="contained">
            {t("common.save")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rename Column Dialog */}
      <Dialog open={Boolean(renameField)} onClose={handleCloseRename} maxWidth="xs" fullWidth>
        <DialogTitle>{t("common.renameColumn", "Rename Column")}</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <TextField
              autoFocus
              fullWidth
              size="small"
              label={t("common.newColumnName", "New Column Name")}
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveRename();
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseRename}>{t("common.cancel", "Cancel")}</Button>
          <Button onClick={handleSaveRename} variant="contained" color="primary">
            {t("common.save", "Save")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
