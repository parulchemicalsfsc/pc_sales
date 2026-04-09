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
} from "@mui/icons-material";
import { TableSkeleton } from "../components/Skeletons";
import { DataGrid, GridColDef, GridRenderCellParams } from "@mui/x-data-grid";
import { customerAPI } from "../services/api";
import type { Customer } from "../types";
import { useTranslation } from "../hooks/useTranslation";
import PermissionGate from "../components/PermissionGate";
import { PERMISSIONS } from "../config/permissions";

export default function Customers() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<Partial<Customer>>({
    name: "",
    mobile: "",
    village: "",
    taluka: "",
    district: "",
    state: "Gujarat",
    adhar_no: "",
    status: "Active",
  });

  const { t, tf } = useTranslation();

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await customerAPI.getAll({ limit: 1000 });
      setCustomers(response.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("customers.loadError", "Failed to load Sabhasad"));
      console.error("Error loading Sabhasad:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (customer?: Customer) => {
    if (customer) {
      setEditingCustomer(customer);
      setFormData(customer);
    } else {
      setEditingCustomer(null);
      setFormData({
        name: "",
        mobile: "",
        village: "",
        taluka: "",
        district: "",
        state: "Gujarat",
        adhar_no: "",
        status: "Active",
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingCustomer(null);
    setFormData({
      name: "",
      mobile: "",
      village: "",
      taluka: "",
      district: "",
      state: "Gujarat",
      adhar_no: "",
      status: "Active",
    });
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (!formData.name || !formData.mobile) {
        setError("Name and mobile are required");
        setSubmitting(false);
        return;
      }

      if (editingCustomer && editingCustomer.customer_id) {
        await customerAPI.update(
          editingCustomer.customer_id,
          formData as Customer,
        );
      } else {
        await customerAPI.create(formData as Customer);
      }

      // Close dialog immediately to prevent duplicate clicks while API completes
      handleCloseDialog();
      loadCustomers();
      setError(null);
    } catch (err: any) {
      if (err?.isNetworkError || err?.response?.status >= 500) {
        setError("Network error or server error. Please check if customer was saved before trying again.");
      } else {
        setError(err instanceof Error ? err.message : t("customers.saveError", "Failed to save Sabhasad"));
      }
      console.error("Error saving Sabhasad:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(t("customers.confirmDelete", "Are you sure you want to delete this Sabhasad?"))) {
      return;
    }

    try {
      await customerAPI.delete(id);
      loadCustomers();
      setError(null);
    } catch (err: any) {
      // Handle specific error messages from backend
      let errorMessage = t("customers.deleteError", "Failed to delete Sabhasad");

      if (err.response?.data?.detail) {
        // Backend returned a detailed error message
        errorMessage = err.response.data.detail;
      } else if (err.response?.status === 400) {
        errorMessage =
          t("customers.deleteDependencyError", "Cannot delete Sabhasad with existing records. Please delete related sales and demos first.");
      } else if (err.response?.status === 404) {
        errorMessage = t("customers.notFoundError", "Sabhasad not found. It may have been already deleted.");
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
      console.error("Error deleting Sabhasad:", err);
    }
  };

  const columns: GridColDef[] = [
    {
      field: "customer_code",
      headerName: tf("customer_code"),
      width: 120,
      renderCell: (params) => (
        <Chip
          label={params.value}
          size="small"
          color="primary"
          variant="outlined"
        />
      ),
    },
    {
      field: "name",
      headerName: tf("name"),
      flex: 1,
      minWidth: 200,
      renderCell: (params) => (
        <Typography variant="body2" fontWeight={600}>
          {params.value}
        </Typography>
      ),
    },
    {
      field: "mobile",
      headerName: tf("mobile"),
      width: 150,
      renderCell: (params) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <PhoneIcon sx={{ fontSize: 16, color: "text.secondary" }} />
          <Typography variant="body2">{params.value || "N/A"}</Typography>
        </Box>
      ),
    },
    {
      field: "village",
      headerName: tf("village"),
      width: 150,
      renderCell: (params) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <LocationOnIcon sx={{ fontSize: 16, color: "text.secondary" }} />
          <Typography variant="body2">{params.value || "N/A"}</Typography>
        </Box>
      ),
    },
    {
      field: "taluka",
      headerName: tf("taluka"),
      width: 130,
    },
    {
      field: "district",
      headerName: tf("district"),
      width: 130,
    },
    {
      field: "state",
      headerName: "State",
      width: 130,
    },
    {
      field: "status",
      headerName: tf("status"),
      width: 100,
      renderCell: (params) => (
        <Chip
          label={
            params.value === "Active"
              ? t("customers.active")
              : t("customers.inactive")
          }
          size="small"
          color={params.value === "Active" ? "success" : "default"}
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
          <PermissionGate permission={PERMISSIONS.EDIT_CUSTOMER}>
            <IconButton
              size="small"
              onClick={() => handleOpenDialog(params.row)}
              color="primary"
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </PermissionGate>
          <PermissionGate permission={PERMISSIONS.DELETE_CUSTOMER}>
            <IconButton
              size="small"
              onClick={() => handleDelete(params.row.customer_id)}
              color="error"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </PermissionGate>
        </Box>
      ),
    },
  ];

  const filteredCustomers = customers.filter((customer) =>
    Object.values(customer).some((value) =>
      value?.toString().toLowerCase().includes(searchTerm.toLowerCase()),
    ),
  );

  return (
    <PermissionGate permission={PERMISSIONS.VIEW_CUSTOMERS} page permissionLabel="view customers">
      <Box>
        {/* Header */}
        <Box sx={{ mb: { xs: 2, md: 4 } }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
            {t("customers.title")}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {t("customers.manageSubtitle", "Manage your customer database")}
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

              <PermissionGate permission={PERMISSIONS.CREATE_CUSTOMER}>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => handleOpenDialog()}
                >
                  {t("customers.addCustomer")}
                </Button>
              </PermissionGate>

              <IconButton onClick={loadCustomers} color="primary">
                <RefreshIcon />
              </IconButton>
            </Box>
          </CardContent>
        </Card>

        {/* Data Grid */}
        <Card>
          <CardContent>
            <Box sx={{ height: 600, width: "100%" }}>
              {loading ? (
                <TableSkeleton rows={10} columns={5} />
              ) : (
                <DataGrid
                  rows={filteredCustomers}
                  columns={columns}
                  getRowId={(row) => row.customer_id}
                  pageSizeOptions={[10, 25, 50, 100]}
                  initialState={{
                    pagination: {
                      paginationModel: { pageSize: 25 },
                    },
                  }}
                  disableRowSelectionOnClick
                  sx={{
                    "& .MuiDataGrid-cell:focus": {
                      outline: "none",
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
            {editingCustomer
              ? t("customers.editCustomer")
              : t("customers.addCustomer")}
          </DialogTitle>
          <DialogContent>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label={`${tf("name")} *`}
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label={`${tf("mobile")} *`}
                  value={formData.mobile}
                  onChange={(e) =>
                    setFormData({ ...formData, mobile: e.target.value })
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
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  select
                  label="State"
                  value={formData.state || "Gujarat"}
                  onChange={(e) =>
                    setFormData({ ...formData, state: e.target.value })
                  }
                >
                  <MenuItem value="Gujarat">Gujarat</MenuItem>
                  <MenuItem value="Maharashtra">Maharashtra</MenuItem>
                  <MenuItem value="Madhya Pradesh">Madhya Pradesh</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Adhar No"
                  value={formData.adhar_no || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, adhar_no: e.target.value })
                  }
                  placeholder="Enter 12-digit Aadhar"
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
                  <MenuItem value="Active">{t("customers.active")}</MenuItem>

                  <MenuItem value="Inactive">{t("customers.inactive")}</MenuItem>
                </TextField>
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDialog} disabled={submitting}>{t("common.cancel")}</Button>
            <Button
              onClick={handleSubmit}
              variant="contained"
              disabled={submitting}
              startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : undefined}
            >
              {submitting ? "Saving..." : t("common.save")}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </PermissionGate>
  );
}
