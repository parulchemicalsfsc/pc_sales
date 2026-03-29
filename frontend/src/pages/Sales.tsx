import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
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
  Divider,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
  InputAdornment,
  useMediaQuery,
  useTheme,
  Menu,
} from "@mui/material";
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ShoppingCart as ShoppingCartIcon,
  Receipt as ReceiptIcon,
  Refresh as RefreshIcon,
  PersonAdd as PersonAddIcon,
  People as PeopleIcon,
  Download as DownloadIcon,
  CheckCircle as CheckCircleIcon,
  Search as SearchIcon,
  MoreVert as MoreVertIcon,
  Edit as EditIcon,
} from "@mui/icons-material";
import { TableSkeleton } from "../components/Skeletons";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import { salesAPI, customerAPI, productAPI } from "../services/api";
import type { Sale, Customer, Product, SaleItem } from "../types";

import { useTranslation } from "../hooks/useTranslation";
import PermissionGate from "../components/PermissionGate";
import { PERMISSIONS } from "../config/permissions";

export default function Sales() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { t, tf } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [openDialog, setOpenDialog] = useState(false);
  const [openInvoiceDialog, setOpenInvoiceDialog] = useState(false);
  const [createdSaleId, setCreatedSaleId] = useState<number | null>(null);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [customerMode, setCustomerMode] = useState<"existing" | "new">(
    "existing",
  );
  const [customerCategory, setCustomerCategory] = useState("Sabhasad");
  const [formData, setFormData] = useState({
    customer_id: 0,
    invoice_no: "",
    sale_date: new Date().toISOString().split("T")[0],
    notes: "",
    paid_amount: 0,
  });
  const [newCustomerData, setNewCustomerData] = useState({
    name: "",
    mobile: "",
    village: "",
    taluka: "",
    district: "",
    state: "Gujarat",
    adhar_no: "",
    status: "Active",
  });
  const [items, setItems] = useState<Partial<SaleItem>[]>([
    { product_id: 0, quantity: 1, rate: 0, amount: 0 },
  ]);
  const [paymentTerms, setPaymentTerms] = useState({
    type: 'after_delivery' as 'advance' | 'after_delivery' | 'after_days' | 'emi' | 'on_delivery',
    days: 0,
    emiParts: [
      { part: 1, days: 0, percentage: 25 },
      { part: 2, days: 0, percentage: 25 },
      { part: 3, days: 0, percentage: 25 },
      { part: 4, days: 0, percentage: 25 },
    ],
  });

  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedActionSale, setSelectedActionSale] = useState<Sale | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editingSaleId, setEditingSaleId] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  // Check router state from CallingList "Take Order" navigation
  const takeOrderHandled = useRef(false);
  useEffect(() => {
    const state = location.state as any;
    if (state?.openNewSale && customers.length > 0 && !openDialog && !takeOrderHandled.current) {
      takeOrderHandled.current = true;
      handleOpenDialog();
      if (state.customerId) {
        setFormData(prev => ({ ...prev, customer_id: state.customerId }));
      }
      // clear the state so it doesn't reopen on refresh
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, customers, openDialog, navigate]);

  const loadData = async (background = false) => {
    try {
      if (!background) setLoading(true);
      setError(null);

      // Load each independently — a 403 on products shouldn't block the sales list
      const [salesResult, customersResult, productsResult] = await Promise.allSettled([
        salesAPI.getAll({ limit: 1000 }),
        customerAPI.getAll({ limit: 1000 }),
        productAPI.getAll(),
      ]);

      if (salesResult.status === "fulfilled") {
        setSales(salesResult.value);
      } else {
        console.error("Error loading sales:", salesResult.reason);
        setError(salesResult.reason?.response?.data?.detail || salesResult.reason?.message || t("messages.error"));
      }

      if (customersResult.status === "fulfilled") {
        setCustomers(customersResult.value.data || []);
      } else {
        console.warn("Could not load customers:", customersResult.reason?.message);
      }

      if (productsResult.status === "fulfilled") {
        setProducts(productsResult.value);
      } else {
        console.warn("Could not load products (user may lack view_products permission):", productsResult.reason?.message);
      }
    } catch (err: any) {
      console.error("Error loading sales data:", err);
      const errorMessage =
        err?.response?.data?.detail || err?.message || t("messages.error");
      setError(errorMessage);
    } finally {
      if (!background) setLoading(false);
    }
  };

  const handleOpenDialog = () => {
    setEditingSaleId(null);
    setFormData({
      customer_id: 0,
      invoice_no: "",
      sale_date: new Date().toISOString().split("T")[0],
      notes: "",
      paid_amount: 0,
    });
    setNewCustomerData({
      name: "",
      mobile: "",
      village: "",
      taluka: "",
      district: "",
      state: "Gujarat",
      adhar_no: "",
      status: "Active",
    });
    setCustomerMode("existing");
    setCustomerCategory("Sabhasad");
    setItems([{ product_id: 0, quantity: 1, rate: 0, amount: 0 }]);
    setPaymentTerms({
      type: 'after_delivery',
      days: 0,
      emiParts: [
        { part: 1, days: 0, percentage: 25 },
        { part: 2, days: 0, percentage: 25 },
        { part: 3, days: 0, percentage: 25 },
        { part: 4, days: 0, percentage: 25 },
      ],
    });
    setOpenDialog(true);
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, sale: Sale) => {
    setMenuAnchor(event.currentTarget);
    setSelectedActionSale(sale);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    // Do not clear selectedActionSale here, keep it for dialogs
  };

  const handleDeleteClick = () => {
    handleMenuClose();
    // Use timeout to prevent MUI Dialog and Menu focus trap race conditions (aria-hidden error)
    setTimeout(() => {
      setDeleteConfirmOpen(true);
    }, 10);
  };

  const confirmDeleteSale = async () => {
    if (!selectedActionSale) return;
    try {
      await salesAPI.delete(selectedActionSale.sale_id || 0);
      setDeleteConfirmOpen(false);
      setSelectedActionSale(null);
      loadData(true);
    } catch (err: any) {
      console.error("Error deleting sale:", err);
      setError(err?.response?.data?.detail || "Failed to delete sale");
    }
  };

  const handleEditClick = () => {
    if (!selectedActionSale) return;
    const saleId = selectedActionSale.sale_id || 0;
    handleMenuClose();

    // Use timeout to prevent MUI Dialog and Menu focus trap race conditions
    setTimeout(async () => {
      try {
        setLoading(true);
        // Fetch full sale details to get items
        const responseData = await salesAPI.getById(saleId);
        const sale = responseData.sale;
        const fetchedItems = responseData.items;

        setEditingSaleId(saleId);
        setCustomerMode("existing");
        setCustomerCategory("Sabhasad");

        // Safe Date Parsing
        let safeDateString = new Date().toISOString().split("T")[0];
        if (sale && sale.sale_date) {
          const d = new Date(sale.sale_date);
          if (!isNaN(d.getTime())) {
            safeDateString = d.toISOString().split("T")[0];
          } else if (typeof sale.sale_date === 'string' && sale.sale_date.length >= 10) {
            safeDateString = sale.sale_date.substring(0, 10); // fallback for YYYY-MM-DD
          }
        }

        setFormData({
          customer_id: sale ? sale.customer_id : 0,
          invoice_no: (sale && sale.invoice_no) ? sale.invoice_no : "",
          sale_date: safeDateString,
          notes: (sale && sale.notes) ? sale.notes : "",
          paid_amount: 0, // Paid amount tracking might be decoupled in payments
        });

        if (sale && sale.payment_terms) {
          try {
            const terms = JSON.parse(sale.payment_terms);
            setPaymentTerms(prev => ({
              ...prev,
              ...terms
            }));
          } catch (e) { }
        }

        if (fetchedItems && fetchedItems.length > 0) {
          setItems(fetchedItems.map((item: any) => ({
            product_id: item.product_id,
            quantity: item.quantity,
            rate: item.rate,
            amount: item.amount,
          })));
        } else {
          setItems([{ product_id: 0, quantity: 1, rate: 0, amount: 0 }]);
        }

        setOpenDialog(true);
      } catch (err: any) {
        console.error("Error fetching sale details:", err);
        setError(err?.response?.data?.detail || "Failed to load sale details");
      } finally {
        setLoading(false);
      }
    }, 10);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  const handleAddItem = () => {
    setItems([...items, { product_id: 0, quantity: 1, rate: 0, amount: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };

    // Auto-fill rate from product with region and category logic
    if (field === "product_id" || field === "quantity" || field === "rate") {
      const product = products.find((p) => p.product_id === newItems[index].product_id);
      if (product && field === "product_id") {
        // Determine rate based on customer state
        let rate = product.standard_rate || 0;
        let customerState = "Gujarat";

        if (customerMode === "existing") {
          const selectedCustomer = customers.find(c => c.customer_id === formData.customer_id);
          if (selectedCustomer?.state) {
            customerState = selectedCustomer.state;
          }
        } else {
          customerState = newCustomerData.state || "Gujarat";
        }

        // Apply region and category rate
        const rKey = customerState === "Madhya Pradesh" ? "mp" : customerState.toLowerCase();
        const catKey = customerCategory.toLowerCase().replace(" ", "_");
        const priceField = `rate_${rKey}_${catKey}` as keyof Product;
        const baseField = `rate_${rKey}` as keyof Product;

        rate = (product[priceField] as number) || (product[baseField] as number) || product.standard_rate || 0;

        newItems[index].rate = rate;
      }

      newItems[index].amount = (newItems[index].quantity || 0) * (newItems[index].rate || 0);
    }

    setItems(newItems);
  };

  const recalculateRates = (newCategory: string, newCustomerMode: string, customerId: number, newState: string) => {
    let customerState = "Gujarat";
    if (newCustomerMode === "existing") {
      const selectedCustomer = customers.find(c => c.customer_id === customerId);
      if (selectedCustomer?.state) {
        customerState = selectedCustomer.state;
      }
    } else {
      customerState = newState || "Gujarat";
    }

    const rKey = customerState === "Madhya Pradesh" ? "mp" : customerState.toLowerCase();
    const catKey = newCategory.toLowerCase().replace(" ", "_");
    const priceField = `rate_${rKey}_${catKey}` as keyof Product;
    const baseField = `rate_${rKey}` as keyof Product;

    const updatedItems = items.map(item => {
      if (!item.product_id) return item;
      const product = products.find(p => p.product_id === item.product_id);
      if (!product) return item;

      const rate = (product[priceField] as number) || (product[baseField] as number) || product.standard_rate || 0;
      return {
        ...item,
        rate,
        amount: (item.quantity || 0) * rate
      };
    });
    setItems(updatedItems);
  };

  const handleSubmit = async () => {
    try {
      let customerId = formData.customer_id;

      // If new customer mode, create customer first
      if (customerMode === "new") {
        // Validate new customer data
        if (
          !newCustomerData.name ||
          !newCustomerData.mobile ||
          !newCustomerData.village ||
          !newCustomerData.taluka ||
          !newCustomerData.district
        ) {
          setError(
            t(
              "sales.allFieldsRequired",
              "Customer Name, Mobile, Village, Taluka, and District are mandatory.",
            ),
          );
          return;
        }

        // Create new customer
        try {
          // CHECK FOR DUPLICATE CUSTOMER FIRST
          // Check if customer with same name+village+mobile exists
          const existingCustomer = customers.find(
            c =>
              c.mobile === newCustomerData.mobile &&
              c.name.toLowerCase().trim() === newCustomerData.name.toLowerCase().trim() &&
              (c.village || "").toLowerCase().trim() === (newCustomerData.village || "").toLowerCase().trim()
          );

          if (existingCustomer) {
            // Use existing customer
            customerId = existingCustomer.customer_id || 0;
            // Notify user
            console.log("Duplicate Sabhasad found, using existing: " + existingCustomer.name);
            if (!window.confirm(
              t("sales.duplicateCustomerConfirm", "Sabhasad \"{name}\" from {village} with mobile {mobile} already exists. Use existing Sabhasad?")
                .replace("{name}", existingCustomer.name)
                .replace("{village}", existingCustomer.village || 'N/A')
                .replace("{mobile}", newCustomerData.mobile)
            )) {
              return;
            }
          } else {
            const newCustomer = await customerAPI.create(
              newCustomerData as Customer,
            );
            customerId = newCustomer.customer_id;
            // Reload customers list
            const customersData = await customerAPI.getAll({ limit: 1000 });
            setCustomers(customersData.data || []);
          }
        } catch (err: any) {
          console.error("Error creating customer:", err);
          const errorMessage =
            err?.response?.data?.detail ||
            err?.message ||
            t("customers.createError", "Failed to create customer");
          setError(errorMessage);
          return;
        }
      } else {
        // Validate existing customer selection
        if (!customerId || customerId === 0) {
          setError(t("sales.selectCustomer", "Please select a Sabhasad"));
          return;
        }
      }

      // Validate items
      if (items.length === 0) {
        setError(t("sales.addAtLeastOneItem", "Please add at least one item"));
        return;
      }

      // Validate each item
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.product_id || item.product_id === 0) {
          setError(`Item ${i + 1}: Please select a product`);
          return;
        }
        if (!item.quantity || item.quantity <= 0) {
          setError(`Item ${i + 1}: Quantity must be greater than 0`);
          return;
        }
        if (!item.rate || item.rate <= 0) {
          setError(`Item ${i + 1}: Rate must be greater than 0`);
          return;
        }
      }

      const saleData = {
        customer_id: customerId,
        invoice_no: formData.invoice_no || undefined,
        sale_date: formData.sale_date,
        items: items.map((item) => ({
          product_id: item.product_id!,
          quantity: item.quantity!,
          rate: item.rate!,
          amount: item.amount!,
        })),
        notes: formData.notes || undefined,
        payment_terms: JSON.stringify(paymentTerms), // Store payment terms as JSON string
        paid_amount: formData.paid_amount || 0, // ADDED: Send initial payment amount
        payment_method: "Cash", // Default to Cash for now, or add UI for it
      };

      console.log(`${editingSaleId ? "Updating" : "Creating"} sale:`, saleData);

      let response;
      if (editingSaleId) {
        response = await salesAPI.update(editingSaleId, saleData);
        console.log("Sale updated:", response);
      } else {
        response = await salesAPI.create(saleData);
        console.log("Sale created:", response);
      }

      // Store sale ID and show invoice dialog (only on create)
      const saleId = response.sale?.sale_id;
      if (saleId && !editingSaleId) {
        setCreatedSaleId(saleId);
        setOpenInvoiceDialog(true);
      }

      handleCloseDialog();

      // OPTIMISTIC UPDATE: Add/Update sale in list immediately if possible
      if (response.sale) {
        try {
          const newSale = response.sale;
          const customer = customers.find(c => c.customer_id === newSale.customer_id);
          if (customer) {
            const enrichedSale = {
              ...newSale,
              customer_name: customer.name,
              village: customer.village,
              mobile: customer.mobile
            };

            if (editingSaleId) {
              setSales(prev => prev.map(s => s.sale_id === editingSaleId ? enrichedSale : s));
            } else {
              setSales(prev => [enrichedSale, ...prev]);
            }
          }
        } catch (e) {
          console.log("Optimistic update failed, waiting for refresh");
        }
      }

      // Background refresh (no spinner)
      loadData(true);
      setError(null);
    } catch (err: any) {
      console.error("Error creating sale:", err);
      console.error("Error creating sale:", err);
      let errorMessage = t("sales.createError", "Failed to create sale");

      if (err?.response?.data?.detail) {
        if (typeof err.response.data.detail === "string") {
          errorMessage = err.response.data.detail;
        } else if (Array.isArray(err.response.data.detail)) {
          // Handle Pydantic validation errors (array of objects)
          errorMessage = err.response.data.detail
            .map((e: any) => e.msg || JSON.stringify(e))
            .join(", ");
        } else {
          errorMessage = JSON.stringify(err.response.data.detail);
        }
      } else if (err?.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
    }
  };

  const getTotalAmount = () => {
    return items.reduce((sum, item) => sum + (item.amount || 0), 0);
  };

  const filteredSales = sales.filter((sale) => {
    const query = searchQuery.toLowerCase();
    return (
      (sale.invoice_no && sale.invoice_no.toLowerCase().includes(query)) ||
      (sale.customer_name && sale.customer_name.toLowerCase().includes(query)) ||
      (sale.village && sale.village.toLowerCase().includes(query)) ||
      (sale.notes && sale.notes.toLowerCase().includes(query))
    );
  });

  const columns: GridColDef[] = [
    {
      field: "invoice_no",
      headerName: tf("invoice_no"),
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
      field: "village",
      headerName: tf("village"),
      width: 150,
    },
    {
      field: "sale_date",
      headerName: tf("date"),
      width: 120,
      renderCell: (params) => new Date(params.value).toLocaleDateString(),
    },
    {
      field: "total_amount",
      headerName: tf("amount"),
      width: 130,
      renderCell: (params) => (
        <Typography variant="body2" fontWeight={600}>
          ₹{params.value?.toLocaleString()}
        </Typography>
      ),
    },
    {
      field: "payment_status",
      headerName: t("dashboard.paymentStatus"),
      width: 140,
      renderCell: (params) => {
        const isPending =
          params.value === "Pending" || params.value === "Partial";
        return (
          <Tooltip
            title={
              isPending
                ? t("sales.clickToAddPayment", "Click to add payment")
                : ""
            }
          >
            <Chip
              label={params.value}
              size="small"
              color={
                params.value === "Paid"
                  ? "success"
                  : params.value === "Partial"
                    ? "warning"
                    : (() => {
                      // Logic for "Pending" status color
                      // Default is error (Red) for overdue/advance
                      let statusColor: "error" | "warning" = "error";

                      try {
                        if (params.row.payment_terms) {
                          const terms = JSON.parse(params.row.payment_terms);
                          const type = terms.type;

                          if (type === 'after_delivery') {
                            // If not delivered yet, it's not overdue -> Orange
                            if (params.row.shipment_status !== 'delivered') {
                              statusColor = "warning";
                            }
                          } else if (type === 'after_days' && terms.days) {
                            // Check if due date has passed
                            const saleDate = new Date(params.row.sale_date);
                            const dueDate = new Date(saleDate);
                            dueDate.setDate(dueDate.getDate() + Number(terms.days));
                            // Normalize to YYYY-MM-DD comparisons to avoid time issues
                            const todayStr = new Date().toISOString().split('T')[0];
                            const dueDateStr = dueDate.toISOString().split('T')[0];

                            if (todayStr <= dueDateStr) {
                              statusColor = "warning"; // Still within credit period
                            }
                          } else if (type === 'emi') {
                            // Simple logic: if any part is pending but future -> Orange
                            // For now, let's treat EMI simplisticly: Orange implies active payment plan
                            statusColor = "warning";
                          }
                        }
                      } catch (e) {
                        // Fallback to error
                      }

                      return statusColor;
                    })()
              }
              onClick={
                isPending
                  ? () => {
                    navigate("/payments", {
                      state: { saleId: params.row.sale_id },
                    });
                  }
                  : undefined
              }
              sx={{
                cursor: isPending ? "pointer" : "default",
                "&:hover": isPending
                  ? {
                    opacity: 0.8,
                    transform: "scale(1.05)",
                  }
                  : {},
                transition: "all 0.2s",
              }}
            />
          </Tooltip>
        );
      },
    },
    {
      field: "payment_terms",
      headerName: "Payment Terms",
      width: 160,
      renderCell: (params) => {
        if (!params.value) return <Chip label="Standard" size="small" variant="outlined" />;
        try {
          const terms = JSON.parse(params.value);
          let label = "Standard";
          let color: "default" | "primary" | "secondary" | "info" = "default";
          let details = "";

          switch (terms.type) {
            case "advance":
              label = "Advance";
              color = "success" as any;
              details = "Full payment in advance";
              break;
            case "after_delivery":
              label = "On Delivery";
              color = "info";
              details = "Payment due on delivery";
              break;
            case "after_days":
              label = `${terms.days} Days Credit`;
              color = "warning" as any;
              details = `Payment due after ${terms.days} days`;
              break;
            case "emi":
              label = "EMI";
              color = "secondary";
              details = terms.emiParts?.map((p: any) =>
                `Part ${p.part}: ${p.percentage}% after ${p.days} days`
              ).join('\n');
              break;
          }

          return (
            <Tooltip title={<div style={{ whiteSpace: 'pre-line' }}>{details}</div>}>
              <Chip label={label} size="small" color={color} variant="outlined" />
            </Tooltip>
          );
        } catch (e) {
          return <Chip label="Standard" size="small" variant="outlined" />;
        }
      },
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 80,
      renderCell: (params) => (
        <IconButton size="small" onClick={(e) => handleMenuOpen(e, params.row)}>
          <MoreVertIcon fontSize="small" />
        </IconButton>
      ),
    },
  ];

  return (
    <PermissionGate permission={PERMISSIONS.VIEW_SALES} page permissionLabel="view sales">
      <Box>
        {/* Header */}
        <Box sx={{ mb: { xs: 2, md: 4 } }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
            <ShoppingCartIcon sx={{ mr: 1, verticalAlign: "middle" }} />
            {t("sales.title")}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {t("sales.subtitle", "Create and manage sales transactions")}
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Actions */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
              <PermissionGate permission={PERMISSIONS.CREATE_SALE}>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={handleOpenDialog}
                  size="large"
                >
                  {t("sales.addSale")}
                </Button>
              </PermissionGate>
              <IconButton onClick={() => loadData()} color="primary">
                <RefreshIcon />
              </IconButton>

              <TextField
                placeholder={t("sales.searchPlaceholder", "Search sales...")}
                size="small"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon color="action" />
                    </InputAdornment>
                  ),
                }}
                sx={{ width: 300, ml: 2 }}
              />

              <Box sx={{ ml: "auto", display: "flex", gap: 2 }}>
                <Chip
                  label={`${t("dashboard.totalSales")}: ${sales.length}`}
                  color="primary"
                />
                <Chip
                  label={`${t("dashboard.amount")}: ₹${sales.reduce((sum, s) => sum + s.total_amount, 0).toLocaleString()}`}
                  color="success"
                />
              </Box>
            </Box>
          </CardContent>
        </Card>

        {/* Sales Table */}
        <Card>
          <CardContent>
            <Box sx={{ height: 600, width: "100%", overflowX: "auto" }}>
              {loading ? (
                <TableSkeleton rows={10} columns={6} />
              ) : (
                <DataGrid
                  rows={filteredSales}
                  columns={columns}
                  getRowId={(row) => row.sale_id}
                  pageSizeOptions={[10, 25, 50, 100]}
                  initialState={{
                    pagination: {
                      paginationModel: { pageSize: 25 },
                    },
                  }}
                  disableRowSelectionOnClick
                />
              )}
            </Box>
          </CardContent>
        </Card>

        {/* Create/Edit Sale Dialog */}
        <Dialog
          open={openDialog}
          onClose={handleCloseDialog}
          maxWidth="md"
          fullWidth
          fullScreen={isMobile}
        >
          <DialogTitle>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <ReceiptIcon />
              {editingSaleId ? "Edit Sale" : t("sales.addSale")}
            </Box>
          </DialogTitle>
          <DialogContent>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              {/* Customer Mode Toggle */}
              <Grid item xs={12}>
                <Box
                  sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}
                >
                  <Typography variant="subtitle2" color="text.secondary">
                    {t("sales.customerSelection", "Sabhasad:")}
                  </Typography>
                  <ToggleButtonGroup
                    value={customerMode}
                    exclusive
                    onChange={(e, newMode) => {
                      if (newMode !== null) {
                        setCustomerMode(newMode);
                      }
                    }}
                    size="small"
                    color="primary"
                  >
                    <ToggleButton value="existing">
                      <PeopleIcon sx={{ mr: 1, fontSize: 18 }} />
                      {t("sales.existingCustomer", "Existing Sabhasad")}
                    </ToggleButton>
                    <ToggleButton value="new">
                      <PersonAddIcon sx={{ mr: 1, fontSize: 18 }} />
                      {t("sales.newCustomer", "New Sabhasad")}
                    </ToggleButton>
                  </ToggleButtonGroup>
                </Box>
                <Divider />
              </Grid>

              {/* Customer Category Selection */}
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  select
                  label="Customer Category (Pricing Tier)"
                  value={customerCategory}
                  onChange={(e) => {
                    setCustomerCategory(e.target.value);
                    recalculateRates(e.target.value, customerMode, formData.customer_id, newCustomerData.state);
                  }}
                >
                  {["Sabhasad", "Mantri", "Distributor", "Field Officer"].map((cat) => (
                    <MenuItem key={cat} value={cat}>
                      {cat}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              {/* Existing Customer Selection */}
              {customerMode === "existing" && (
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    select
                    label={`${t("customers.customerName")} *`}
                    value={formData.customer_id}
                    onChange={(e) => {
                      const newCustomerId = Number(e.target.value);
                      setFormData({
                        ...formData,
                        customer_id: newCustomerId,
                      });
                      recalculateRates(customerCategory, "existing", newCustomerId, newCustomerData.state);
                    }}
                  >
                    <MenuItem value={0}>
                      {t("sales.selectCustomer", "Select Sabhasad")}
                    </MenuItem>
                    {customers.map((customer) => (
                      <MenuItem
                        key={customer.customer_id}
                        value={customer.customer_id}
                      >
                        {customer.name} - {customer.village}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
              )}

              {/* New Customer Form */}
              {customerMode === "new" && (
                <>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label={`${t("customers.customerName")} *`}
                      value={newCustomerData.name}
                      onChange={(e) =>
                        setNewCustomerData({
                          ...newCustomerData,
                          name: e.target.value,
                        })
                      }
                      placeholder={t(
                        "sales.enterCustomerName",
                        "Enter Sabhasad name",
                      )}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label={`${tf("mobile")} *`}
                      value={newCustomerData.mobile}
                      onChange={(e) =>
                        setNewCustomerData({
                          ...newCustomerData,
                          mobile: e.target.value,
                        })
                      }
                      placeholder="9876543210"
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">+91</InputAdornment>
                        ),
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      required
                      label={tf("village")}
                      value={newCustomerData.village}
                      onChange={(e) =>
                        setNewCustomerData({
                          ...newCustomerData,
                          village: e.target.value,
                        })
                      }
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      required
                      label={tf("taluka")}
                      value={newCustomerData.taluka}
                      onChange={(e) =>
                        setNewCustomerData({
                          ...newCustomerData,
                          taluka: e.target.value,
                        })
                      }
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      required
                      label={tf("district")}
                      value={newCustomerData.district}
                      onChange={(e) =>
                        setNewCustomerData({
                          ...newCustomerData,
                          district: e.target.value,
                        })
                      }
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      select
                      required
                      label="State"
                      value={newCustomerData.state || "Gujarat"}
                      onChange={(e) => {
                        setNewCustomerData({
                          ...newCustomerData,
                          state: e.target.value,
                        });
                        recalculateRates(customerCategory, "new", formData.customer_id, e.target.value);
                      }}
                    >
                      <MenuItem value="Gujarat">Gujarat</MenuItem>
                      <MenuItem value="Maharashtra">Maharashtra</MenuItem>
                      <MenuItem value="Madhya Pradesh">Madhya Pradesh</MenuItem>
                    </TextField>
                  </Grid>
                </>
              )}

              {/* Sale Date */}
              <Grid item xs={12} sm={customerMode === "new" ? 12 : 6}>
                <TextField
                  fullWidth
                  type="date"
                  label={t("sales.date", "Sale Date")}
                  value={formData.sale_date}
                  onChange={(e) =>
                    setFormData({ ...formData, sale_date: e.target.value })
                  }
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              {/* Aadhar No for New Customer */}
              {customerMode === "new" && (
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Adhar No"
                    value={newCustomerData.adhar_no || ""}
                    onChange={(e) =>
                      setNewCustomerData({
                        ...newCustomerData,
                        adhar_no: e.target.value,
                      })
                    }
                    placeholder="12-digit Aadhar"
                  />
                </Grid>
              )}

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label={tf("invoice_no")}
                  value={formData.invoice_no}
                  onChange={(e) =>
                    setFormData({ ...formData, invoice_no: e.target.value })
                  }
                  placeholder={t("sales.invoiceNoPlaceholder", "Leave empty for auto-generation")}
                />
              </Grid>

              {/* Payment Terms */}
              <Grid item xs={12}>
                <Divider sx={{ my: 1 }} />
                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                  Payment Terms
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  select
                  label="Payment Type"
                  value={paymentTerms.type}
                  onChange={(e) => setPaymentTerms({ ...paymentTerms, type: e.target.value as any })}
                >
                  <MenuItem value="on_delivery">On Delivery</MenuItem>
                  <MenuItem value="after_delivery">After Delivery</MenuItem>
                  <MenuItem value="advance">Advance Payment</MenuItem>
                  <MenuItem value="after_days">After X Days</MenuItem>
                  <MenuItem value="emi">EMI (4 Parts)</MenuItem>
                </TextField>
              </Grid>

              {/* Paid Amount - Visible for 'On Delivery' and 'Advance Payment' */}
              {(paymentTerms.type === 'on_delivery' || paymentTerms.type === 'advance') && (
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Paid Amount"
                    type="number"
                    value={formData.paid_amount}
                    onChange={(e) =>
                      setFormData({ ...formData, paid_amount: Number(e.target.value) })
                    }
                    InputProps={{
                      startAdornment: <Typography sx={{ mr: 1 }}>₹</Typography>,
                    }}
                    helperText={paymentTerms.type === 'advance' ? "Enter advance payment amount" : "Enter amount received on delivery"}
                  />
                </Grid>
              )}

              {/* After X Days */}
              {paymentTerms.type === 'after_days' && (
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Payment Due After (Days)"
                    value={paymentTerms.days}
                    onChange={(e) => setPaymentTerms({ ...paymentTerms, days: Number(e.target.value) })}
                    inputProps={{ min: 0 }}
                  />
                </Grid>
              )}

              {/* EMI Configuration */}
              {paymentTerms.type === 'emi' && (
                <>
                  {paymentTerms.emiParts.map((part, idx) => (
                    <Grid item xs={12} sm={6} key={idx}>
                      <TextField
                        fullWidth
                        type="number"
                        label={`Part ${part.part} - Due After (Days)`}
                        value={part.days}
                        onChange={(e) => {
                          const newParts = [...paymentTerms.emiParts];
                          newParts[idx] = { ...newParts[idx], days: Number(e.target.value) };
                          setPaymentTerms({ ...paymentTerms, emiParts: newParts });
                        }}
                        inputProps={{ min: 0 }}
                        helperText={`${part.percentage}% of total amount`}
                      />
                    </Grid>
                  ))}
                </>
              )}
              <Grid item xs={12}>
                <Divider sx={{ my: 2 }} />
                <Box
                  sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}
                >
                  <Typography variant="h6">
                    {t("sales.itemsTitle", "Sale Items")}
                  </Typography>
                  <Button
                    startIcon={<AddIcon />}
                    onClick={handleAddItem}
                    size="small"
                  >
                    {t("sales.addItem", "Add Item")}
                  </Button>
                </Box>
              </Grid>
              {items.map((item, index) => (
                <Grid item xs={12} key={index}>
                  <Card variant="outlined">
                    <CardContent>
                      <Grid container spacing={2}>
                        <Grid item xs={12} sm={5}>
                          <TextField
                            fullWidth
                            select
                            size="small"
                            label={t("sales.product", "Product")}
                            value={item.product_id || 0}
                            onChange={(e) =>
                              handleItemChange(
                                index,
                                "product_id",
                                Number(e.target.value),
                              )
                            }
                          >
                            <MenuItem value={0}>
                              {t("sales.selectProduct", "Select Product")}
                            </MenuItem>
                            {products.map((product) => (
                              <MenuItem
                                key={product.product_id}
                                value={product.product_id}
                              >
                                {product.product_name}
                              </MenuItem>
                            ))}
                          </TextField>
                        </Grid>
                        <Grid item xs={12} sm={2}>
                          <TextField
                            fullWidth
                            size="small"
                            type="number"
                            label={tf("quantity")}
                            value={item.quantity}
                            onChange={(e) => {
                              const val = e.target.value;
                              // Just use Number() which handles "01" -> 1. 
                              // If the issue persists, the browser might be masking the update.
                              // But let's act on the user's string directly to be sure.
                              handleItemChange(
                                index,
                                "quantity",
                                Number(val),
                              )
                            }}
                          />
                        </Grid>
                        <Grid item xs={12} sm={2}>
                          <TextField
                            fullWidth
                            size="small"
                            type="number"
                            label={t("sales.rate", "Rate")}
                            value={item.rate}
                            onChange={(e) =>
                              handleItemChange(
                                index,
                                "rate",
                                Number(e.target.value),
                              )
                            }
                          />
                        </Grid>
                        <Grid item xs={12} sm={2}>
                          <TextField
                            fullWidth
                            size="small"
                            label={tf("amount")}
                            value={item.amount || 0}
                            InputProps={{
                              readOnly: true,
                            }}
                          />
                        </Grid>
                        <Grid item xs={12} sm={1}>
                          <IconButton
                            color="error"
                            onClick={() => handleRemoveItem(index)}
                            disabled={items.length === 1}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Grid>
                      </Grid>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
              <Grid item xs={12}>
                <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
                  <Typography variant="h6">
                    {t("dashboard.amount")}: ₹{getTotalAmount().toLocaleString()}
                  </Typography>
                </Box>
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
              {editingSaleId ? "Save Changes" : t("sales.addSale")}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Action Menu */}
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={handleMenuClose}
        >
          <PermissionGate permission={PERMISSIONS.EDIT_SALE}>
            <MenuItem onClick={handleEditClick}>
              <EditIcon sx={{ mr: 1 }} fontSize="small" color="secondary" />
              Edit Sale
            </MenuItem>
          </PermissionGate>
          <PermissionGate permission={PERMISSIONS.DELETE_SALE}>
            <MenuItem onClick={handleDeleteClick} sx={{ color: 'error.main' }}>
              <DeleteIcon sx={{ mr: 1 }} fontSize="small" color="error" />
              Delete Sale
            </MenuItem>
          </PermissionGate>
        </Menu>

        {/* Delete Confirmation */}
        <Dialog
          open={deleteConfirmOpen}
          onClose={() => setDeleteConfirmOpen(false)}
        >
          <DialogTitle>Delete Sale</DialogTitle>
          <DialogContent>
            <Typography>
              Are you sure you want to delete invoice <strong>{selectedActionSale?.invoice_no}</strong>?
              This will permanently remove the sale and all its items.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
            <Button onClick={confirmDeleteSale} color="error" variant="contained">
              Delete
            </Button>
          </DialogActions>
        </Dialog>

        {/* Invoice Download Dialog */}
        <Dialog
          open={openInvoiceDialog}
          onClose={() => setOpenInvoiceDialog(false)}
          maxWidth="sm"
          fullWidth
          fullScreen={isMobile}
        >
          <DialogTitle>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CheckCircleIcon sx={{ color: "success.main", fontSize: 32 }} />
              <Typography variant="h6">Sale Created Successfully!</Typography>
            </Box>
          </DialogTitle>
          <DialogContent>
            <Typography variant="body1" sx={{ mb: 2 }}>
              Would you like to download the invoice PDF for this sale?
            </Typography>
            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => {
                setOpenInvoiceDialog(false);
                setCreatedSaleId(null);
              }}
              disabled={downloadingPDF}
            >
              Skip
            </Button>
            <Button
              onClick={async () => {
                try {
                  setDownloadingPDF(true);
                  setError(null);

                  const API_BASE_URL =
                    import.meta.env.VITE_API_BASE_URL ||
                    "http://127.0.0.1:8000";

                  const response = await fetch(
                    `${API_BASE_URL}/api/sales/${createdSaleId}/invoice-pdf`,
                    {
                      headers: {
                        "x-user-email": localStorage.getItem("user_email") || "",
                      },
                    }
                  );

                  if (!response.ok) {
                    throw new Error("Failed to generate PDF");
                  }

                  // Create blob from response
                  const blob = await response.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `invoice_${createdSaleId}.pdf`;
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(url);
                  document.body.removeChild(a);

                  // Close dialog after successful download
                  setOpenInvoiceDialog(false);
                  setCreatedSaleId(null);
                } catch (err: any) {
                  console.error("Error downloading PDF:", err);
                  setError("Failed to download invoice PDF. Please try again.");
                } finally {
                  setDownloadingPDF(false);
                }
              }}
              variant="contained"
              startIcon={
                downloadingPDF ? (
                  <CircularProgress size={20} color="inherit" />
                ) : (
                  <DownloadIcon />
                )
              }
              disabled={downloadingPDF}
            >
              {downloadingPDF ? "Downloading..." : "Download PDF"}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </PermissionGate>
  );
}
