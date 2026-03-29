import { useState, useEffect } from "react";
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Card,
  CardContent,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Stepper,
  Step,
  StepLabel,
  Tooltip,
  Alert,
  Menu,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  Add as AddIcon,
  Edit as EditIcon,
  Visibility as VisibilityIcon,
  LocalShipping as ShippingIcon,
  CheckCircle as CheckCircleIcon,
  Payment as PaymentIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  MoreVert as MoreVertIcon,
  Undo as UndoIcon,
  Autorenew as ReprocessIcon,
  ArrowUpward as NextStatusIcon,
  Cancel as CancelIcon,
  Print as PrintIcon,
  Delete as DeleteIcon,
} from "@mui/icons-material";
import { TableSkeleton } from "../components/Skeletons";
import { customerAPI, salesAPI, paymentAPI } from "../services/api";
import { useTranslation } from "../hooks/useTranslation";

interface Customer {
  customer_id: number;
  name: string;
  mobile?: string;
  village?: string;
  [key: string]: any;
}

interface Order {
  sale_id: number;
  invoice_no: string;
  customer_id: number;
  customer_name?: string;
  customer_mobile?: string;
  sale_date: string;
  total_amount: number;
  total_liters: number;
  payment_status: string;
  order_status?: string;
  shipment_status?: string;
  shipment_date?: string;
  dispatch_date?: string;
  delivery_date?: string;
  tracking_number?: string;
  notes?: string;
  sale_code?: string;
  payment_terms?: string;
}

interface OrderStatusUpdate {
  order_status: string;
  shipment_status: string;
  shipment_date?: string;
  dispatch_date?: string;
  delivery_date?: string;
  tracking_number?: string;
  notes?: string;
}

export default function OrderManagement() {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [orderUpdate, setOrderUpdate] = useState<OrderStatusUpdate>({
    order_status: "pending",
    shipment_status: "not_shipped",
  });
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedMenuOrder, setSelectedMenuOrder] = useState<Order | null>(null);
  const [selectedOrderItems, setSelectedOrderItems] = useState<any[]>([]); // New state for items
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Load each independently — a 403 on one shouldn't break the whole page
      const [salesResult, customersResult] = await Promise.allSettled([
        salesAPI.getAll(),
        customerAPI.getAll(),
      ]);

      let salesData: any[] = [];
      let customersData: Customer[] = [];

      if (salesResult.status === "fulfilled") {
        salesData = salesResult.value.data || salesResult.value || [];
      } else {
        console.error("Error fetching sales:", salesResult.reason?.response?.data?.detail || salesResult.reason?.message);
      }

      if (customersResult.status === "fulfilled") {
        customersData = customersResult.value.data || [];
      } else {
        console.error("Error fetching customers:", customersResult.reason?.response?.data?.detail || customersResult.reason?.message);
      }

      // Map customer data to sales
      const customersMap = new Map<number, Customer>(
        customersData.map((c: Customer) => [c.customer_id, c]),
      );

      const ordersData = salesData.map(
        (sale: any) => {
          const customer =
            customersMap.get(sale.customer_id) || ({} as Customer);
          return {
            ...sale,
            customer_name: customer.name || "Unknown",
            customer_mobile: customer.mobile || "N/A",
            order_status: sale.order_status || "pending",
            shipment_status: sale.shipment_status || "not_shipped",
          };
        },
      );

      setOrders(ordersData);
      setCustomers(customersData);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getOrderStatusColor = (status: string) => {
    const statusColors: { [key: string]: any } = {
      pending: "warning",
      prepared_for_shipment: "info",
      dispatch: "primary",
      delivered: "success",
      verified: "success",
      completed: "success",
      cancelled: "error",
    };
    return statusColors[status] || "default";
  };

  const getOrderStatusLabel = (status: string) => {
    const statusLabels: { [key: string]: string } = {
      pending: t("orderManagement.pending", "Pending"),
      prepared_for_shipment: t("orderManagement.prepared", "Prepared for Shipment"),
      dispatch: t("orderManagement.dispatched", "Dispatched"),
      delivered: t("orderManagement.delivered", "Delivered"),
      verified: t("orderManagement.verified", "Verified"),
      completed: t("orderManagement.verified", "Verified"),
      cancelled: t("orderManagement.cancelled", "Cancelled")
    };
    return statusLabels[status] || status;
  };

  const getShipmentStatusColor = (status: string) => {
    const statusColors: { [key: string]: any } = {
      not_shipped: "default",
      preparing: "warning",
      shipped: "info",
      in_transit: "primary",
      delivered: "success",
    };
    return statusColors[status] || "default";
  };

  const getPaymentStatusColor = (status: string) => {
    const statusColors: { [key: string]: any } = {
      Pending: "error",
      Partial: "warning",
      Paid: "success",
    };
    return statusColors[status] || "default";
  };

  const getOrderSteps = (order: Order) => {
    const currentStatus = order.order_status?.toLowerCase() || "pending";
    const steps = [
      {
        label: t("orderManagement.pending", "Pending"),
        date: order.sale_date,
        completed: ["pending", "prepared_for_shipment", "dispatch", "delivered", "verified", "completed"].includes(currentStatus)
      },
      {
        label: t("orderManagement.prepared", "Prepared for Shipment"),
        date: order.shipment_date,
        completed: ["prepared_for_shipment", "dispatch", "delivered", "verified", "completed"].includes(currentStatus),
      },
      {
        label: t("orderManagement.dispatched", "Dispatched"),
        date: order.dispatch_date,
        completed: ["dispatch", "delivered", "verified", "completed"].includes(currentStatus),
      },
      {
        label: t("orderManagement.delivered", "Delivered"),
        date: order.delivery_date,
        completed: ["delivered", "verified", "completed"].includes(currentStatus),
      },
    ];
    return steps;
  };

  const getNextStatus = (currentStatus: string) => {
    const sequence = ["pending", "prepared_for_shipment", "dispatch", "delivered"];
    const currentIndex = sequence.indexOf(currentStatus);
    if (currentIndex !== -1 && currentIndex < sequence.length - 1) {
      return sequence[currentIndex + 1];
    }
    return null;
  };

  const handleImmediateUpdate = async (newStatus: string) => {
    if (!selectedOrder) return;
    try {
      // Only send fields that exist in the sales table (whitelist approach)
      // This prevents read-only fields from joins (customer_name, mobile, village, etc.) from being sent
      const validSaleFields = {
        sale_id: selectedOrder.sale_id,
        invoice_no: selectedOrder.invoice_no,
        customer_id: selectedOrder.customer_id,
        sale_date: selectedOrder.sale_date,
        total_amount: selectedOrder.total_amount,
        total_liters: selectedOrder.total_liters,
        payment_status: selectedOrder.payment_status,
        notes: selectedOrder.notes,
        sale_code: selectedOrder.sale_code,
        payment_terms: selectedOrder.payment_terms,
        order_status: newStatus,
        shipment_status: orderUpdate.shipment_status,
        shipment_date: orderUpdate.shipment_date,
        dispatch_date: orderUpdate.dispatch_date,
        delivery_date: orderUpdate.delivery_date,
        tracking_number: orderUpdate.tracking_number,
      };

      await salesAPI.update(selectedOrder.sale_id, validSaleFields);
      setUpdateDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error("Error updating order:", error);
    }
  };

  const getPreviousStatus = (currentStatus: string) => {
    const sequence = ["pending", "prepared_for_shipment", "dispatch", "delivered"];
    const currentIndex = sequence.indexOf(currentStatus);
    if (currentIndex > 0) {
      return sequence[currentIndex - 1];
    }
    return null;
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, order: Order) => {
    setMenuAnchor(event.currentTarget);
    setSelectedMenuOrder(order);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setSelectedMenuOrder(null);
  };

  const handleReturnToPrevious = async () => {
    if (!selectedMenuOrder) return;
    const previousStatus = getPreviousStatus(selectedMenuOrder.order_status || "pending");
    if (previousStatus) {
      try {
        const validSaleFields = {
          sale_id: selectedMenuOrder.sale_id,
          invoice_no: selectedMenuOrder.invoice_no,
          customer_id: selectedMenuOrder.customer_id,
          sale_date: selectedMenuOrder.sale_date,
          total_amount: selectedMenuOrder.total_amount,
          total_liters: selectedMenuOrder.total_liters,
          payment_status: selectedMenuOrder.payment_status,
          notes: selectedMenuOrder.notes,
          sale_code: selectedMenuOrder.sale_code,
          payment_terms: selectedMenuOrder.payment_terms,
          order_status: previousStatus,
          shipment_status: selectedMenuOrder.shipment_status,
          shipment_date: selectedMenuOrder.shipment_date,
          dispatch_date: selectedMenuOrder.dispatch_date,
          delivery_date: selectedMenuOrder.delivery_date,
          tracking_number: selectedMenuOrder.tracking_number,
        };

        await salesAPI.update(selectedMenuOrder.sale_id, validSaleFields);
        handleMenuClose();
        fetchData();
      } catch (error) {
        console.error("Error returning to previous status:", error);
      }
    }
  };

  const handleReprocessOrder = async () => {
    if (!selectedMenuOrder) return;
    try {
      const validSaleFields = {
        sale_id: selectedMenuOrder.sale_id,
        invoice_no: selectedMenuOrder.invoice_no,
        customer_id: selectedMenuOrder.customer_id,
        sale_date: selectedMenuOrder.sale_date,
        total_amount: selectedMenuOrder.total_amount,
        total_liters: selectedMenuOrder.total_liters,
        payment_status: selectedMenuOrder.payment_status,
        notes: selectedMenuOrder.notes,
        sale_code: selectedMenuOrder.sale_code,
        payment_terms: selectedMenuOrder.payment_terms,
        order_status: "prepared_for_shipment", // Set to prepared_for_shipment when cancelled
        shipment_status: "returned", // Mark as returned/reprocessed for tracking
        shipment_date: selectedMenuOrder.shipment_date,
        dispatch_date: selectedMenuOrder.dispatch_date,
        delivery_date: selectedMenuOrder.delivery_date,
        tracking_number: selectedMenuOrder.tracking_number,
      };

      await salesAPI.update(selectedMenuOrder.sale_id, validSaleFields);
      handleMenuClose();
      fetchData();
    } catch (error) {
      console.error("Error reprocessing order:", error);
    }
  };

  const handleCancelOrder = async () => {
    if (!selectedMenuOrder) return;
    try {
      const validSaleFields = {
        sale_id: selectedMenuOrder.sale_id,
        invoice_no: selectedMenuOrder.invoice_no,
        customer_id: selectedMenuOrder.customer_id,
        sale_date: selectedMenuOrder.sale_date,
        total_amount: selectedMenuOrder.total_amount,
        total_liters: selectedMenuOrder.total_liters,
        payment_status: selectedMenuOrder.payment_status,
        notes: selectedMenuOrder.notes,
        sale_code: selectedMenuOrder.sale_code,
        payment_terms: selectedMenuOrder.payment_terms,
        order_status: "cancelled", // Set status to cancelled
        shipment_status: selectedMenuOrder.shipment_status,
        shipment_date: selectedMenuOrder.shipment_date,
        dispatch_date: selectedMenuOrder.dispatch_date,
        delivery_date: selectedMenuOrder.delivery_date,
        tracking_number: selectedMenuOrder.tracking_number,
      };

      await salesAPI.update(selectedMenuOrder.sale_id, validSaleFields);
      handleMenuClose();
      fetchData();
    } catch (error) {
      console.error("Error cancelling order:", error);
    }
  };

  const handleEditOrder = () => {
    if (!selectedMenuOrder) return;
    handleMenuClose();
    handleUpdateStatus(selectedMenuOrder);
  };

  const handleDeleteConfirm = () => {
    if (!selectedMenuOrder) return;
    setOrderToDelete(selectedMenuOrder);
    setDeleteConfirmOpen(true);
    handleMenuClose();
  };

  const handleDeleteOrder = async () => {
    if (!orderToDelete) return;
    try {
      await salesAPI.delete(orderToDelete.sale_id);
      setDeleteConfirmOpen(false);
      setOrderToDelete(null);
      fetchData();
    } catch (error) {
      console.error("Error deleting order:", error);
    }
  };

  const handleNextStatus = () => {
    const next = getNextStatus(orderUpdate.order_status);
    if (next) {
      handleImmediateUpdate(next);
    }
  };

  const handleViewDetails = async (order: Order) => {
    setSelectedOrder(order);
    setDetailsDialogOpen(true);

    // Fetch items for this order
    try {
      const response = await salesAPI.getById(order.sale_id);
      if (response && response.items) {
        setSelectedOrderItems(response.items);
      } else {
        setSelectedOrderItems([]);
      }
    } catch (error) {
      console.error("Error fetching order details:", error);
      setSelectedOrderItems([]);
    }
  };

  const handleQuickStatusAdvance = async (order: Order) => {
    const nextStatus = getNextStatus(order.order_status || "pending");
    if (!nextStatus) return;

    try {
      // Determine which date field to update
      const today = new Date().toISOString().split('T')[0];
      const dateUpdates: any = {};

      if (nextStatus === "prepared_for_shipment") dateUpdates.shipment_date = today;
      if (nextStatus === "dispatch") dateUpdates.dispatch_date = today;
      if (nextStatus === "delivered") dateUpdates.delivery_date = today;

      // Whitelist fields
      // Whitelist fields - verify these exist in your Supabase 'sales' table!
      // Removing sale_id (PK) and sale_code (not in schema) to prevent errors.
      const validSaleFields = {
        invoice_no: order.invoice_no,
        customer_id: order.customer_id,
        sale_date: order.sale_date,
        total_amount: order.total_amount,
        total_liters: order.total_liters,
        payment_status: order.payment_status,
        notes: order.notes,
        payment_terms: order.payment_terms,
        order_status: nextStatus,
        shipment_status: order.shipment_status || "not_shipped",
        shipment_date: order.shipment_date,
        dispatch_date: order.dispatch_date,
        delivery_date: order.delivery_date,
        tracking_number: order.tracking_number,
        ...dateUpdates // Overwrite with new date
      };

      await salesAPI.update(order.sale_id, validSaleFields);
      fetchData();
    } catch (error) {
      console.error("Error advancing order status:", error);
    }
  };

  const handleUpdateStatus = (order: Order) => {
    setSelectedOrder(order);
    setOrderUpdate({
      order_status: order.order_status || "pending",
      shipment_status: order.shipment_status || "not_shipped",
      shipment_date: order.shipment_date,
      dispatch_date: order.dispatch_date,
      delivery_date: order.delivery_date,
      tracking_number: order.tracking_number,
      notes: order.notes,
    });
    setUpdateDialogOpen(true);
  };

  const handleSaveUpdate = async () => {
    if (!selectedOrder) return;

    try {
      await salesAPI.update(selectedOrder.sale_id, {
        ...selectedOrder,
        ...orderUpdate,
      });
      setUpdateDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error("Error updating order:", error);
    }
  };

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.invoice_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer_mobile?.includes(searchTerm);

    const matchesStatus =
      statusFilter === "all" || order.shipment_status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getStatusStats = () => {
    return {
      pending: orders.filter((o) => o.order_status === "pending").length,
      prepared: orders.filter((o) => o.order_status === "prepared_for_shipment").length,
      returned: orders.filter((o) => o.shipment_status === "returned").length,
      cancelled: orders.filter((o) => o.order_status === "cancelled").length,
      dispatched: orders.filter((o) => o.order_status === "dispatch").length,
      delivered: orders.filter((o) => o.order_status === "delivered").length,
    };
  };

  const stats = getStatusStats();

  return (
    <Box>
      {/* Header */}
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={{ xs: 2, md: 3 }}
        flexWrap="wrap"
        gap={1}
      >
        <Typography variant="h4" fontWeight="bold">
          {t("orderManagement.title", "Order Management")}
        </Typography>
      </Box>

      {/* Statistics Cards */}
      <Grid container spacing={{ xs: 1.5, md: 3 }} mb={{ xs: 2, md: 3 }}>
        <Grid item xs={6} sm={3}>
          <Card
            sx={{
              borderLeft: 6,
              borderColor: "warning.main",
              boxShadow: 2,
              transition: "transform 0.2s",
              "&:hover": { transform: "translateY(-4px)" },
            }}
          >
            <CardContent sx={{ position: "relative", overflow: "hidden" }}>
              <Box
                sx={{
                  position: "absolute",
                  right: -20,
                  top: -20,
                  opacity: 0.1,
                  transform: "rotate(15deg)",
                }}
              >
                <ShippingIcon sx={{ fontSize: { xs: 50, md: 100 }, color: "warning.main" }} />
              </Box>
              <Typography color="textSecondary" variant="subtitle2" gutterBottom sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}>
                {t("orderManagement.pending", "Pending")}
                <Chip
                  label={`${t("orderManagement.return", "Return")}: ${stats.returned}`}
                  size="small"
                  color="warning"
                  sx={{ ml: 0.5, height: 18, fontSize: "0.6rem", fontWeight: "bold" }}
                />
              </Typography>
              <Typography variant="h4" fontWeight="bold" color="warning.main">
                {stats.pending}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card
            sx={{
              borderLeft: 6,
              borderColor: "info.main",
              boxShadow: 2,
              transition: "transform 0.2s",
              "&:hover": { transform: "translateY(-4px)" },
            }}
          >
            <CardContent sx={{ position: "relative", overflow: "hidden" }}>
              <Box
                sx={{
                  position: "absolute",
                  right: -20,
                  top: -20,
                  opacity: 0.1,
                  transform: "rotate(15deg)",
                }}
              >
                <ShippingIcon sx={{ fontSize: { xs: 50, md: 100 }, color: "info.main" }} />
              </Box>
              <Typography color="textSecondary" variant="subtitle2" gutterBottom>
                {t("orderManagement.prepared", "Prepared")}
              </Typography>
              <Typography variant="h4" fontWeight="bold" color="info.main">
                {stats.prepared}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card
            sx={{
              borderLeft: 6,
              borderColor: "primary.main",
              boxShadow: 2,
              transition: "transform 0.2s",
              "&:hover": { transform: "translateY(-4px)" },
            }}
          >
            <CardContent sx={{ position: "relative", overflow: "hidden" }}>
              <Box
                sx={{
                  position: "absolute",
                  right: -20,
                  top: -20,
                  opacity: 0.1,
                  transform: "rotate(15deg)",
                }}
              >
                <ShippingIcon sx={{ fontSize: { xs: 50, md: 100 }, color: "primary.main" }} />
              </Box>
              <Typography color="textSecondary" variant="subtitle2" gutterBottom>
                {t("orderManagement.dispatched", "Dispatched")}
              </Typography>
              <Typography variant="h4" fontWeight="bold" color="primary.main">
                {stats.dispatched}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card
            sx={{
              borderLeft: 6,
              borderColor: "success.main",
              boxShadow: 2,
              transition: "transform 0.2s",
              "&:hover": { transform: "translateY(-4px)" },
            }}
          >
            <CardContent sx={{ position: "relative", overflow: "hidden" }}>
              <Box
                sx={{
                  position: "absolute",
                  right: -20,
                  top: -20,
                  opacity: 0.1,
                  transform: "rotate(15deg)",
                }}
              >
                <CheckCircleIcon sx={{ fontSize: { xs: 50, md: 100 }, color: "success.main" }} />
              </Box>
              <Typography color="textSecondary" variant="subtitle2" gutterBottom sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}>
                {t("orderManagement.delivered", "Delivered")}
                <Chip
                  label={`${t("orderManagement.cancelled", "Cancel")}: ${stats.cancelled}`}
                  size="small"
                  color="error"
                  sx={{ ml: 0.5, height: 18, fontSize: "0.6rem", fontWeight: "bold" }}
                />
              </Typography>
              <Typography variant="h4" fontWeight="bold" color="success.main">
                {stats.delivered}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              placeholder={t("orderManagement.searchPlaceholder", "Search by invoice, customer name, or mobile...")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <SearchIcon sx={{ mr: 1, color: "grey.500" }} />
                ),
              }}
            />
          </Grid>

        </Grid>
      </Paper>

      {/* Orders Table */}
      <TableContainer component={Paper} sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: "grey.100" }}>
              <TableCell>
                <strong>{t("fields.invoice_no", "Invoice No")}</strong>
              </TableCell>
              <TableCell>
                <strong>{t("customers.title", "Sabhasad")}</strong>
              </TableCell>
              <TableCell>
                <strong>{t("orderManagement.orderDate", "Order Date")}</strong>
              </TableCell>
              <TableCell align="right">
                <strong>{t("fields.amount", "Amount")}</strong>
              </TableCell>
              <TableCell align="center">
                <strong>{t("orderManagement.orderStatus", "Order Status")}</strong>
              </TableCell>
              <TableCell align="center">
                <strong>{t("common.actions", "Actions")}</strong>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                  <Typography color="textSecondary">{t("orderManagement.noOrders", "No orders found")}</Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredOrders.map((order) => (
                <TableRow key={order.sale_id} hover>
                  <TableCell>
                    <Typography fontWeight="bold" color="primary">
                      {order.invoice_no}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {order.customer_name}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      {order.customer_mobile}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {new Date(order.sale_date).toLocaleDateString()}
                  </TableCell>
                  <TableCell align="right">
                    <Typography fontWeight="bold">
                      ₹{order.total_amount?.toLocaleString()}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      {order.total_liters}L
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={getOrderStatusLabel(order.order_status || "pending")}
                      color={getOrderStatusColor(
                        order.order_status || "pending",
                      )}
                      size="small"
                      onDelete={
                        getNextStatus(order.order_status || "pending")
                          ? () => handleQuickStatusAdvance(order)
                          : undefined
                      }
                      deleteIcon={
                        <Tooltip title={`Advance to ${getOrderStatusLabel(getNextStatus(order.order_status || "pending") || "")}`}>
                          <NextStatusIcon />
                        </Tooltip>
                      }
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title={t("orderManagement.viewDetails", "View Details")}>
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => handleViewDetails(order)}
                        sx={{ mr: 1 }}
                      >
                        <VisibilityIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t("orderManagement.updateStatus", "Update Status")}>
                      <IconButton
                        size="small"
                        color="secondary"
                        onClick={() => handleUpdateStatus(order)}
                        sx={{ mr: 1 }}
                      >
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t("orderManagement.moreActions", "More Actions")}>
                      <IconButton
                        size="small"
                        onClick={(e) => handleMenuOpen(e, order)}
                      >
                        <MoreVertIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Order Details Dialog */}
      <Dialog
        open={detailsDialogOpen}
        onClose={() => setDetailsDialogOpen(false)}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>Order Details - {selectedOrder?.invoice_no}</DialogTitle>
        <DialogContent>
          {selectedOrder && (
            <Box>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" color="textSecondary">
                    {t("customers.title", "Sabhasad")} Information
                  </Typography>
                  <Typography variant="body1" fontWeight="bold">
                    {selectedOrder.customer_name}
                  </Typography>
                  <Typography variant="body2">
                    {selectedOrder.customer_mobile}
                  </Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" color="textSecondary">
                    Order Information
                  </Typography>
                  <Typography variant="body2">
                    Date:{" "}
                    {new Date(selectedOrder.sale_date).toLocaleDateString()}
                  </Typography>
                  <Typography variant="body2">
                    Amount: ₹{selectedOrder.total_amount?.toLocaleString()}
                  </Typography>
                  <Typography variant="body2">
                    Volume: {selectedOrder.total_liters}L
                  </Typography>
                </Grid>
              </Grid>

              {/* Purchased Items Table */}
              <Box mt={4}>
                <Typography variant="subtitle2" color="textSecondary" mb={2}>
                  Purchased Items
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: "grey.50" }}>
                        <TableCell><strong>Product</strong></TableCell>
                        <TableCell align="right"><strong>Qty</strong></TableCell>
                        <TableCell align="right"><strong>Rate</strong></TableCell>
                        <TableCell align="right"><strong>Amount</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {selectedOrderItems.length > 0 ? (
                        selectedOrderItems.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell>{item.product_name || "Unknown Product"}</TableCell>
                            <TableCell align="right">{item.quantity}</TableCell>
                            <TableCell align="right">₹{item.rate?.toLocaleString()}</TableCell>
                            <TableCell align="right">₹{item.amount?.toLocaleString()}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4} align="center">
                            <Typography variant="caption" color="textSecondary">
                              No items found
                            </Typography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>



              <Box mt={4}>
                <Typography variant="subtitle2" color="textSecondary" mb={2}>
                  Order Timeline
                </Typography>
                <Stepper
                  activeStep={
                    getOrderSteps(selectedOrder).filter((s) => s.completed)
                      .length - 1
                  }
                  alternativeLabel
                >
                  {getOrderSteps(selectedOrder).map((step, index) => (
                    <Step key={index} completed={step.completed}>
                      <StepLabel>
                        <Typography variant="body2">{step.label}</Typography>
                        {step.date && (
                          <Typography variant="caption" color="textSecondary">
                            {new Date(step.date).toLocaleDateString()}
                          </Typography>
                        )}
                      </StepLabel>
                    </Step>
                  ))}
                </Stepper>
              </Box>

              {selectedOrder.notes && (
                <Box mt={3}>
                  <Typography variant="subtitle2" color="textSecondary">
                    Notes
                  </Typography>
                  <Typography variant="body2">{selectedOrder.notes}</Typography>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Update Status Dialog */}
      <Dialog
        open={updateDialogOpen}
        onClose={() => setUpdateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>Update Order Status</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                {/* Advance Button */}
                {getNextStatus(orderUpdate.order_status) && (
                  <Button
                    fullWidth
                    variant="contained"
                    onClick={handleNextStatus}
                    sx={{
                      mb: 2,
                      py: 1.5,
                      bgcolor: "#e3f2fd",
                      color: "#0288d1",
                      "&:hover": {
                        bgcolor: "#b3e5fc"
                      }
                    }}
                  >
                    {getOrderStatusLabel(getNextStatus(orderUpdate.order_status)!)}
                  </Button>
                )}

              </Grid>





              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Notes"
                  multiline
                  rows={3}
                  value={orderUpdate.notes || ""}
                  onChange={(e) =>
                    setOrderUpdate({ ...orderUpdate, notes: e.target.value })
                  }
                />
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUpdateDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSaveUpdate}
            variant="contained"
            color="primary"
          >
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Three-dot Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
      >
        {selectedMenuOrder && getPreviousStatus(selectedMenuOrder.order_status || "pending") && (
          <MenuItem onClick={handleReturnToPrevious}>
            <UndoIcon sx={{ mr: 1 }} fontSize="small" />
            Return to {getOrderStatusLabel(getPreviousStatus(selectedMenuOrder.order_status || "pending")!)}
          </MenuItem>
        )}
        {selectedMenuOrder && selectedMenuOrder.order_status !== "delivered" && (
          <MenuItem onClick={handleReprocessOrder}>
            <ReprocessIcon sx={{ mr: 1 }} fontSize="small" color="primary" />
            Reprocess Order
          </MenuItem>
        )}
        {selectedMenuOrder && selectedMenuOrder.order_status !== "cancelled" && selectedMenuOrder.order_status !== "delivered" && (
          <MenuItem onClick={handleCancelOrder}>
            <CancelIcon sx={{ mr: 1 }} fontSize="small" color="error" />
            Cancel Order
          </MenuItem>
        )}
        <MenuItem onClick={handleEditOrder}>
          <EditIcon sx={{ mr: 1 }} fontSize="small" color="secondary" />
          Edit Order
        </MenuItem>
        <MenuItem onClick={handleDeleteConfirm} sx={{ color: 'error.main' }}>
          <DeleteIcon sx={{ mr: 1 }} fontSize="small" color="error" />
          Delete Order
        </MenuItem>
      </Menu>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
      >
        <DialogTitle>Delete Order</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete order <strong>{orderToDelete?.invoice_no}</strong>?
            This will permanently remove the order and all its items.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button
            onClick={handleDeleteOrder}
            variant="contained"
            color="error"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
