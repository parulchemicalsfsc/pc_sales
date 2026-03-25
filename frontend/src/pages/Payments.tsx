import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
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
  Grid,
  MenuItem,
  Alert,
  CircularProgress,
  Chip,
  IconButton,
  InputAdornment,
  Paper,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  Add as AddIcon,
  Payment as PaymentIcon,
  Refresh as RefreshIcon,
  Receipt as ReceiptIcon,
  Search as SearchIcon,
} from "@mui/icons-material";
import { TableSkeleton } from "../components/Skeletons";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import { paymentAPI, salesAPI } from "../services/api";
import type { Payment, PendingPayment } from "../types";
import { useTranslation } from "../hooks/useTranslation";
import PermissionGate from "../components/PermissionGate";
import { PERMISSIONS } from "../config/permissions";

export default function Payments() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { t, tf } = useTranslation();
  const location = useLocation();
  const pendingSectionRef = useRef<HTMLDivElement>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [formData, setFormData] = useState({
    sale_id: 0,
    payment_date: new Date().toISOString().split("T")[0],
    payment_method: "Cash",
    amount: 0,
    rrn: "",
    reference: "",
    notes: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  // Handle navigation from sales page
  useEffect(() => {
    if (location.state?.saleId && pendingPayments.length > 0) {
      const saleId = location.state.saleId;
      const pendingPayment = pendingPayments.find((p) => p.sale_id === saleId);
      if (pendingPayment) {
        handleOpenDialog(pendingPayment);
        // Clear the state to prevent reopening on refresh
        window.history.replaceState({}, document.title);
      }
    }
  }, [location.state, pendingPayments]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log("Loading payment data...");
      const [paymentsData, pendingData] = await Promise.all([
        paymentAPI.getAll({ limit: 1000 }),
        salesAPI.getPending(),
      ]);
      setPayments(paymentsData);
      setPendingPayments(pendingData);
    } catch (err: any) {
      console.error("Error loading payment data:", err);
      const errorMessage =
        err?.response?.data?.detail || err?.message || "Failed to load data";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (pendingPayment?: PendingPayment) => {
    console.log("Opening payment dialog with data:", pendingPayment);
    if (pendingPayment) {
      console.log("Sale ID:", pendingPayment.sale_id);
      console.log("Pending Amount:", pendingPayment.pending_amount);
      setFormData({
        sale_id: pendingPayment.sale_id,
        payment_date: new Date().toISOString().split("T")[0],
        payment_method: "Cash",
        amount: pendingPayment.pending_amount,
        rrn: "",
        reference: "",
        notes: "",
      });
    } else {
      setFormData({
        sale_id: 0,
        payment_date: new Date().toISOString().split("T")[0],
        payment_method: "Cash",
        amount: 0,
        rrn: "",
        reference: "",
        notes: "",
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  const handleSubmit = async () => {
    try {
      // Validate required fields
      if (!formData.sale_id || formData.sale_id === 0) {
        setError(
          t("payments.validationRequired", "Please select a sale/invoice"),
        );
        return;
      }

      if (!formData.amount || formData.amount <= 0) {
        setError(
          t("payments.validationRequired", "Please enter a valid amount"),
        );
        return;
      }

      if (!formData.payment_method) {
        setError(
          t("payments.validationRequired", "Please select a payment method"),
        );
        return;
      }

      console.log("Submitting payment with data:", {
        sale_id: formData.sale_id,
        payment_date: formData.payment_date,
        payment_method: formData.payment_method,
        amount: formData.amount,
        rrn: formData.rrn,
        reference: formData.reference,
        notes: formData.notes,
      });

      const response = await paymentAPI.create({
        sale_id: formData.sale_id,
        payment_date: formData.payment_date,
        payment_method: formData.payment_method,
        amount: Number(formData.amount),
        rrn: formData.rrn || undefined,
        reference: formData.reference || undefined,
        notes: formData.notes || undefined,
      });
      console.log("Payment response:", response);

      handleCloseDialog();
      loadData();
      setError(null);
    } catch (err: any) {
      console.error("Payment error:", err);
      const errorMessage =
        err?.response?.data?.detail ||
        err?.message ||
        "Failed to record payment";
      setError(errorMessage);
    }
  };

  const paymentColumns: GridColDef[] = [
    {
      field: "invoice_no",
      headerName: t("sales.invoiceNo", "Invoice No"),
      width: 140,
      renderCell: (params) => (
        <Chip label={params.value} size="small" color="primary" />
      ),
    },

    {
      field: "customer_name",

      headerName: t("customers.customerName"),

      flex: 1,

      minWidth: 200,
    },

    {
      field: "payment_date",

      headerName: t("fields.date", "Date"),

      width: 120,

      renderCell: (params) => new Date(params.value).toLocaleDateString(),
    },

    {
      field: "payment_method",

      headerName: t("payments.method"),
      width: 120,

      renderCell: (params) => (
        <Chip label={params.value} size="small" variant="outlined" />
      ),
    },

    {
      field: "amount",

      headerName: t("fields.amount", "Amount"),

      width: 130,

      renderCell: (params) => (
        <Typography variant="body2" fontWeight={600} color="success.main">
          ₹{params.value?.toLocaleString()}
        </Typography>
      ),
    },

    {
      field: "rrn",

      headerName: t("payments.rrn", "RRN/Ref"),

      width: 150,
    },
  ];

  const pendingColumns: GridColDef[] = [
    {
      field: "invoice_no",
      headerName: t("sales.invoiceNo", "Invoice No"),
      width: 140,
      renderCell: (params) => (
        <Chip label={params.value} size="small" color="warning" />
      ),
    },

    {
      field: "customer_name",

      headerName: t("customers.customerName"),

      flex: 1,

      minWidth: 200,
    },

    {
      field: "mobile",

      headerName: t("fields.mobile", "Mobile"),

      width: 130,
    },

    {
      field: "sale_date",

      headerName: t("sales.date", "Sale Date"),

      width: 120,

      renderCell: (params) => new Date(params.value).toLocaleDateString(),
    },

    {
      field: "total_amount",

      headerName: t("dashboard.amount"),
      width: 110,

      renderCell: (params) => `₹${params.value?.toLocaleString()}`,
    },

    {
      field: "paid_amount",

      headerName: t("dashboard.paid"),
      width: 110,

      renderCell: (params) => `₹${params.value?.toLocaleString()}`,
    },

    {
      field: "pending_amount",

      headerName: t("dashboard.pending"),

      width: 120,

      renderCell: (params) => (
        <Typography variant="body2" fontWeight={600} color="error.main">
          ₹{params.value?.toLocaleString()}
        </Typography>
      ),
    },

    {
      field: "actions",

      headerName: t("common.actions"),

      width: 120,

      sortable: false,

      renderCell: (params) => (
        <PermissionGate permission={PERMISSIONS.RECORD_PAYMENT}>
          <Button
            size="small"
            variant="contained"
            onClick={() => handleOpenDialog(params.row)}
            sx={{ fontSize: '0.75rem', px: 1 }}
          >
            {t("payments.recordPayment")}
          </Button>
        </PermissionGate>
      ),
    },
  ];

  const filteredPayments = payments.filter((p) =>
    (p.customer_name && p.customer_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.invoice_no && p.invoice_no.toLowerCase().includes(searchTerm.toLowerCase())) ||
    p.amount.toString().includes(searchTerm) ||
    (p.rrn && p.rrn.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredPendingPayments = pendingPayments.filter((p) =>
    (p.customer_name && p.customer_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.invoice_no && p.invoice_no.toLowerCase().includes(searchTerm.toLowerCase())) ||
    p.total_amount.toString().includes(searchTerm) ||
    p.pending_amount.toString().includes(searchTerm)
  );

  return (
    <PermissionGate permission={PERMISSIONS.VIEW_PAYMENTS} page permissionLabel="view payments">
      <Box>
        {/* Header with Action Button */}
        <Box sx={{ mb: { xs: 2, md: 4 }, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
              <PaymentIcon sx={{ mr: 1, verticalAlign: "middle" }} />
              {t("payments.title")}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {t("payments.subtitle", "Record and track payments")}
            </Typography>
          </Box>
          <TextField
            placeholder={t("common.search", "Search...")}
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
            sx={{ width: 300, bgcolor: 'background.paper' }}
          />
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Summary Cards */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card
              sx={{
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              }}
            >
              <CardContent>
                <Typography variant="body2" sx={{ color: "white", opacity: 0.9 }}>
                  {t("dashboard.totalPayments")}
                </Typography>
                <Typography
                  variant="h4"
                  sx={{ color: "white", fontWeight: 700, mt: 1 }}
                >
                  {payments.length}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card
              onClick={() => pendingSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
              sx={{
                background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
                cursor: 'pointer',
                transition: 'transform 0.2s',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: 4
                }
              }}
            >
              <CardContent>
                <Typography variant="body2" sx={{ color: "white", opacity: 0.9 }}>
                  {t("dashboard.pendingPayments")}
                </Typography>
                <Typography
                  variant="h4"
                  sx={{ color: "white", fontWeight: 700, mt: 1 }}
                >
                  {pendingPayments.length}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card
              onClick={() => pendingSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
              sx={{
                background: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
                cursor: 'pointer',
                transition: 'transform 0.2s',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: 4
                }
              }}
            >
              <CardContent>
                <Typography variant="body2" sx={{ color: "white", opacity: 0.9 }}>
                  {t("payments.totalPending", "Total Pending Amount")}
                </Typography>
                <Typography
                  variant="h4"
                  sx={{ color: "white", fontWeight: 700, mt: 1 }}
                >
                  ₹
                  {pendingPayments
                    .reduce((sum, p) => sum + p.pending_amount, 0)
                    .toLocaleString()}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card
              sx={{
                background: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
                transition: 'transform 0.2s',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: 4
                }
              }}
            >
              <CardContent>
                <Typography variant="body2" sx={{ color: "white", opacity: 0.9 }}>
                  {t("dashboard.totalCollected", "Total Collected")}
                </Typography>
                <Typography
                  variant="h4"
                  sx={{ color: "white", fontWeight: 700, mt: 1 }}
                >
                  ₹
                  {payments
                    .reduce((sum, p) => sum + p.amount, 0)
                    .toLocaleString()}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>


        {/* Pending Payments */}
        <div ref={pendingSectionRef}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mb: 2,
                }}
              >
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  {t("dashboard.pendingPayments")}
                </Typography>
                <IconButton onClick={loadData} color="primary">
                  <RefreshIcon />
                </IconButton>
              </Box>
              <Box sx={{ height: 600, width: "100%", overflowX: "auto" }}>
                {loading ? (
                  <TableSkeleton rows={10} columns={6} />
                ) : (
                  <DataGrid
                    rows={filteredPendingPayments}
                    columns={pendingColumns}
                    getRowId={(row) => row.sale_id}
                    pageSizeOptions={[5, 10, 25]}
                    initialState={{
                      pagination: { paginationModel: { pageSize: 10 } },
                    }}
                    disableRowSelectionOnClick
                  />
                )}
              </Box>
            </CardContent>
          </Card>

        </div>

        {/* Payment History */}
        <Card>
          <CardContent>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 2,
              }}
            >
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                {t("payments.history", "Payment History")}
              </Typography>
            </Box>
            <Box sx={{ height: 500, width: "100%", overflowX: "auto" }}>
              {loading ? (
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    height: "100%",
                  }}
                >
                  <CircularProgress />
                </Box>
              ) : (
                <DataGrid
                  rows={filteredPayments}
                  columns={paymentColumns}
                  getRowId={(row) => row.payment_id}
                  pageSizeOptions={[10, 25, 50]}
                  initialState={{
                    pagination: { paginationModel: { pageSize: 25 } },
                  }}
                  disableRowSelectionOnClick
                />
              )}
            </Box>
          </CardContent>
        </Card>

        {/* Payment Dialog */}
        <Dialog
          open={openDialog}
          onClose={handleCloseDialog}
          maxWidth="sm"
          fullWidth
          fullScreen={isMobile}
        >
          <DialogTitle>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <ReceiptIcon />
              {t("payments.recordPayment", "Record Payment")}
            </Box>
          </DialogTitle>
          <DialogContent>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  select
                  label={t("payments.selectInvoice", "Select Sale/Invoice *")}
                  value={formData.sale_id}
                  onChange={(e) =>
                    setFormData({ ...formData, sale_id: Number(e.target.value) })
                  }
                >
                  <MenuItem value={0}>
                    {t("payments.selectInvoice", "Select Invoice")}
                  </MenuItem>
                  {pendingPayments.map((sale) => (
                    <MenuItem key={sale.sale_id} value={sale.sale_id}>
                      {sale.invoice_no} - {sale.customer_name} (₹
                      {sale.pending_amount.toLocaleString()}{" "}
                      {t("dashboard.pending")})
                    </MenuItem>
                  ))}
                </TextField>

                {/* Purchase Summary Box */}
                {formData.sale_id > 0 && (() => {
                  const selectedSale = pendingPayments.find(p => p.sale_id === formData.sale_id);
                  if (selectedSale) {
                    return (
                      <Paper variant="outlined" sx={{ mt: 2, p: 2, bgcolor: 'background.default' }}>
                        <Typography variant="subtitle2" gutterBottom>Purchase Summary</Typography>
                        {selectedSale.items_summary && (
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontStyle: 'italic' }}>
                            Items: {selectedSale.items_summary}
                          </Typography>
                        )}
                        <Grid container spacing={2}>
                          <Grid item xs={4}>
                            <Typography variant="caption" color="text.secondary">Total Amount</Typography>
                            <Typography variant="body1" fontWeight="bold">₹{selectedSale.total_amount.toLocaleString()}</Typography>
                          </Grid>
                          <Grid item xs={4}>
                            <Typography variant="caption" color="text.secondary">Paid Amount</Typography>
                            <Typography variant="body1" color="success.main">₹{selectedSale.paid_amount.toLocaleString()}</Typography>
                          </Grid>
                          <Grid item xs={4}>
                            <Typography variant="caption" color="text.secondary">Pending</Typography>
                            <Typography variant="body1" color="error.main">₹{selectedSale.pending_amount.toLocaleString()}</Typography>
                          </Grid>
                        </Grid>
                      </Paper>
                    );
                  }
                  return null;
                })()}
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  type="date"
                  label={t("payments.date", "Payment Date")}
                  value={formData.payment_date}
                  onChange={(e) =>
                    setFormData({ ...formData, payment_date: e.target.value })
                  }
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  select
                  label={t("payments.method")}
                  value={formData.payment_method}
                  onChange={(e) =>
                    setFormData({ ...formData, payment_method: e.target.value })
                  }
                >
                  <MenuItem value="Cash">
                    {t("payments.methodCash", "Cash")}
                  </MenuItem>
                  <MenuItem value="UPI">
                    {t("payments.methodUpi", "UPI")}
                  </MenuItem>
                  <MenuItem value="Bank Transfer">
                    {t("payments.methodBank", "Bank Transfer")}
                  </MenuItem>
                  <MenuItem value="Cheque">
                    {t("payments.methodCheque", "Cheque")}
                  </MenuItem>
                  <MenuItem value="Card">
                    {t("payments.methodCard", "Card")}
                  </MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  type="number"
                  label={`${tf("amount")} *`}
                  value={formData.amount}
                  onChange={(e) =>
                    setFormData({ ...formData, amount: Number(e.target.value) })
                  }
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">₹</InputAdornment>
                    ),
                  }}
                  inputProps={{ min: 0, step: 0.01 }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label={t("payments.rrn", "RRN / Transaction ID")}
                  value={formData.rrn}
                  onChange={(e) =>
                    setFormData({ ...formData, rrn: e.target.value })
                  }
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label={t("payments.reference", "Reference")}
                  value={formData.reference}
                  onChange={(e) =>
                    setFormData({ ...formData, reference: e.target.value })
                  }
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label={tf("notes")}
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDialog}>{t("common.cancel")}</Button>
            <Button onClick={handleSubmit} variant="contained">
              {t("payments.recordPayment", "Record Payment")}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </PermissionGate>
  );
}
