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
  const [formData, setFormData] = useState<Partial<Distributor>>({
    name: "",
    village: "",
    taluka: "",
    district: "",
    mantri_name: "",
    mantri_mobile: "",
    sabhasad_morning: 0,
    sabhasad_evening: 0,
    contact_in_group: 0,
    status: "Active",
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
        name: "",
        village: "",
        taluka: "",
        district: "",
        mantri_name: "",
        mantri_mobile: "",
        sabhasad_morning: 0,
        sabhasad_evening: 0,
        contact_in_group: 0,
        status: "Active",
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
      if (!formData.name || !formData.mantri_name) {
        setError("Name and Mantri Name are required");
        return;
      }

      if (editingDistributor) {
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
    const redFields = ["name", "village", "mantri_name", "mantri_mobile"];
    const isRed = redFields.some(
      (field) =>
        row[field as keyof Distributor] === null ||
        row[field as keyof Distributor] === undefined ||
        row[field as keyof Distributor] === "",
    );
    if (isRed) return "red";

    // GREEN (Strictly Complete): ALL specified data points must be present
    const greenFields = [
      "name",
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
      component="span"
      sx={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        bgcolor:
          color === "green"
            ? "#16a34a"
            : color === "orange"
              ? "#ea580c"
              : "#dc2626",
        display: "inline-block",
        mr: 1,
        boxShadow: "0 0 0 2px rgba(255,255,255,0.5)",
      }}
    />
  );

  const displayValue = (val: any) => {
    if (val === null || val === undefined || val === "") return "N/A";
    return val;
  };

  const columns: GridColDef[] = [
    {
      field: "name",
      headerName: t("distributors.distributorName"),
      flex: 1,
      minWidth: 200,
      renderCell: (params) => (
        <Box sx={{ display: "flex", alignItems: "center", height: "100%", gap: 1 }}>
          <StatusDot color={getRowColor(params.row)} />
          <Typography
            sx={{
              fontSize: "14px",
              fontWeight: 600,
              color: "#111827",
              letterSpacing: "0.2px",
            }}
          >
            {params.value}
          </Typography>
        </Box>
      ),
    },
    {
      field: "village",
      headerName: tf("village"),
      width: 150,
      renderCell: (params) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, height: "100%" }}>
          <LocationOnIcon sx={{ fontSize: 14, color: "#4b5563" }} />
          <Typography sx={{ fontSize: "13px", fontWeight: 600, color: "#111827" }}>
            {displayValue(params.value)}
          </Typography>
        </Box>
      ),
    },
    {
      field: "mantri_name",
      headerName: t("distributors.mantriName", "Mantri Name"),
      width: 180,
      renderCell: (params) => (
        <Typography sx={{ fontSize: "13px", fontWeight: 600, color: "#111827" }}>
          {displayValue(params.value)}
        </Typography>
      ),
    },
    {
      field: "mantri_mobile",
      headerName: t("distributors.mobile", "Mantri Mobile"),
      width: 150,
      renderCell: (params) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, height: "100%" }}>
          <PhoneIcon sx={{ fontSize: 14, color: "#4b5563" }} />
          <Typography sx={{ fontSize: "13px", fontWeight: 600, color: "#111827" }}>
            {displayValue(params.value)}
          </Typography>
        </Box>
      ),
    },
    {
      field: "sabhasad_morning",
      headerName: t("distributors.sabhasadMorning", "Sabhasad Morning"),
      width: 120,
      renderCell: (params) => (
        <Chip
          label={displayValue(params.value)}
          size="small"
          color="primary"
          sx={{
            boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
            px: 1.2,
            fontWeight: 500,
            fontSize: "12px",
            borderRadius: "999px",
          }}
        />
      ),
    },
    {
      field: "sabhasad_evening",
      headerName: t("distributors.sabhasadEvening", "Sabhasad Evening"),
      width: 120,
      renderCell: (params) => (
        <Chip
          label={displayValue(params.value)}
          size="small"
          color="info"
          sx={{
            boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
            px: 1.2,
            fontWeight: 500,
            fontSize: "12px",
            borderRadius: "999px",
          }}
        />
      ),
    },
    {
      field: "sabhasad_count",
      headerName: t("distributors.sabhasadCount", "Sabhasad"),
      width: 140,
      renderCell: (params) => (
        <Chip
          label={displayValue(params.value)}
          size="small"
          color="secondary"
          sx={{
            boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
            px: 1.2,
            fontWeight: 500,
            fontSize: "12px",
            borderRadius: "999px",
          }}
        />
      ),
    },
    {
      field: "contact_in_group",
      headerName: t("distributors.contactInGroup", "In Group"),
      width: 120,
      renderCell: (params) => (
        <Chip
          label={displayValue(params.value)}
          size="small"
          color="secondary"
          sx={{
            boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
            px: 1.2,
            fontWeight: 500,
            fontSize: "12px",
            borderRadius: "999px",
          }}
        />
      ),
    },
    {
      field: "status",
      headerName: tf("status"),
      width: 100,
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
    {
      field: "actions",
      headerName: t("common.actions"),
      width: 120,
      sortable: false,
      renderCell: (params) => (
        <Box>
          <IconButton
            size="small"
            onClick={() => handleOpenDialog(params.row)}
            color="primary"
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ];

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
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => handleOpenDialog()}
            >
              {t("distributors.addDistributor")}
            </Button>
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
                pageSizeOptions={[10, 25, 50, 100]}
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
                    fontSize: "13px",
                    px: 2,
                  },
                  "& .MuiDataGrid-columnHeaders": {
                    bgcolor: "rgba(0,0,0,0.01)",
                    borderRadius: 0,
                    borderBottom: "1px solid rgba(0,0,0,0.08)",
                    color: "#111827",
                    fontWeight: 700,
                    fontSize: "13px",
                  },
                }}
                disableRowSelectionOnClick
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
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={`${t("distributors.distributorName")} *`}
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
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
                label={tf("village")}
                value={formData.village}
                onChange={(e) =>
                  setFormData({ ...formData, village: e.target.value })
                }
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={tf("taluka")}
                value={formData.taluka}
                onChange={(e) =>
                  setFormData({ ...formData, taluka: e.target.value })
                }
              />
            </Grid>
            <Grid item xs={12} sm={6}>
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
            <Grid item xs={12} sm={4}>
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
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>{t("common.cancel")}</Button>
          <Button onClick={handleSubmit} variant="contained">
            {t("common.save")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
