import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  Chip,
  Alert,
  CircularProgress,
  IconButton,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Paper,
  InputAdornment,
  FormControlLabel,
  Checkbox,
} from "@mui/material";
import {
  Close as CloseIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  TrendingDown as CreditIcon,
  Person as PersonIcon,
  Receipt as ReceiptIcon,
} from "@mui/icons-material";
import { notesAPI } from "../services/api";

interface SaleItem {
  product_id: number;
  product_name: string;
  quantity: number;
  rate: number;
  amount: number;
  already_returned_qty: number;
  available_to_return_qty: number;
}

interface ReturnItem {
  product_id: number;
  product_name: string;
  original_qty: number;
  return_qty: number;
  rate: number;
  return_amount: number;
}

interface CreditNoteReturnDialogProps {
  open: boolean;
  onClose: () => void;
  saleId: number;
  /** Called when credit note is successfully created */
  onSuccess?: () => void;
}

const fmt = (n: number) =>
  `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function CreditNoteReturnDialog({
  open,
  onClose,
  saleId,
  onSuccess,
}: CreditNoteReturnDialogProps) {
  const [loadingItems, setLoadingItems] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sale details
  const [saleInfo, setSaleInfo] = useState<{
    invoice_no?: string;
    sale_date?: string;
    customer_name?: string;
    total_amount?: number;
  } | null>(null);

  // Original items with availability
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);

  // Return quantities: product_id → qty to return (0 = not returning)
  const [returnQtys, setReturnQtys] = useState<Record<number, number>>({});

  // Form fields
  const [reason, setReason] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split("T")[0]);
  const [amountOverride, setAmountOverride] = useState<string>("");
  const [amountEdited, setAmountEdited] = useState(false);
  const [requiresPickup, setRequiresPickup] = useState(false);
  const [pickupItemsOverride, setPickupItemsOverride] = useState("");
  const [pickupItemsEdited, setPickupItemsEdited] = useState(false);

  // ── Load sale items on open ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !saleId) return;
    setError(null);
    setLoadingItems(true);
    setReason("");
    setAmountOverride("");
    setAmountEdited(false);
    setReturnQtys({});
    setSaleInfo(null);
    setSaleItems([]);
    setRequiresPickup(false);
    setPickupItemsOverride("");
    setPickupItemsEdited(false);

    notesAPI.getSaleItems(saleId)
      .then((data) => {
        setSaleInfo(data.sale);
        setSaleItems(data.items || []);
        // Init all return qtys to 0
        const initQtys: Record<number, number> = {};
        for (const item of data.items || []) {
          initQtys[item.product_id] = 0;
        }
        setReturnQtys(initQtys);
      })
      .catch((err) => {
        setError(err?.response?.data?.detail || err?.message || "Failed to load sale items");
      })
      .finally(() => setLoadingItems(false));
  }, [open, saleId]);

  // ── Auto-calculate return amount ────────────────────────────────────────────
  const autoCalculatedAmount = saleItems.reduce((sum, item) => {
    const qty = returnQtys[item.product_id] ?? 0;
    return sum + qty * item.rate;
  }, 0);

  const displayAmount = amountEdited ? Number(amountOverride) : autoCalculatedAmount;

  // ── Auto-generate pickup items text from selected return qtys ───────────────
  const autoPickupItems = saleItems
    .filter((item) => (returnQtys[item.product_id] ?? 0) > 0)
    .map((item) => `${returnQtys[item.product_id]}x ${item.product_name}`)
    .join(", ");

  const displayPickupItems = pickupItemsEdited ? pickupItemsOverride : autoPickupItems;

  // ── Build return_items payload ──────────────────────────────────────────────
  const buildReturnItems = (): ReturnItem[] =>
    saleItems
      .filter((item) => (returnQtys[item.product_id] ?? 0) > 0)
      .map((item) => {
        const rqty = returnQtys[item.product_id];
        return {
          product_id: item.product_id,
          product_name: item.product_name,
          original_qty: item.quantity,
          return_qty: rqty,
          rate: item.rate, // Sale-time rate — never current product rate
          return_amount: rqty * item.rate,
        };
      });

  const totalReturnQty = Object.values(returnQtys).reduce((s, q) => s + q, 0);
  const canSubmit =
    totalReturnQty > 0 &&
    reason.trim().length > 0 &&
    displayAmount > 0 &&
    (!requiresPickup || displayPickupItems.trim().length > 0);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const returnItems = buildReturnItems();
      await notesAPI.create({
        note_type: "credit",
        sale_id: saleId,
        amount: displayAmount,
        reason: reason.trim(),
        issue_date: issueDate,
        return_items: returnItems,
        requires_pickup: requiresPickup,
        pickup_items: requiresPickup ? displayPickupItems.trim() : undefined,
      });
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Failed to create credit note");
    } finally {
      setSubmitting(false);
    }
  };

  const handleQtyChange = (productId: number, delta: number, maxAvailable: number) => {
    setReturnQtys((prev) => {
      const cur = prev[productId] ?? 0;
      const next = Math.max(0, Math.min(maxAvailable, cur + delta));
      return { ...prev, [productId]: next };
    });
    // Reset amount override when qty changes
    if (amountEdited) {
      setAmountEdited(false);
      setAmountOverride("");
    }
    // Reset pickup items override when qty changes (re-auto-calculate)
    if (pickupItemsEdited) {
      setPickupItemsEdited(false);
      setPickupItemsOverride("");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <CreditIcon color="warning" />
            <Typography variant="h6" fontWeight={700}>Issue Credit Note — Product Return</Typography>
          </Box>
          <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {loadingItems ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 5 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {/* ── Sale Info Header ── */}
            {saleInfo && (
              <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: "action.hover", borderRadius: 2 }}>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <PersonIcon fontSize="small" color="action" />
                    <Typography variant="body2" fontWeight={600}>{saleInfo.customer_name}</Typography>
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <ReceiptIcon fontSize="small" color="action" />
                    <Chip label={saleInfo.invoice_no || "—"} size="small" color="primary" />
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    Sale Date: {saleInfo.sale_date ? new Date(saleInfo.sale_date).toLocaleDateString() : "—"}
                  </Typography>
                  <Typography variant="body2" fontWeight={600} color="success.main">
                    Total: {fmt(saleInfo.total_amount ?? 0)}
                  </Typography>
                </Box>
              </Paper>
            )}

            {/* ── Item Selector ── */}
            <Typography variant="subtitle1" fontWeight={600} mb={1}>
              Select Items to Return
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
              Adjust quantity for each item being returned. Items fully returned in previous credit notes are shown as unavailable.
            </Typography>

            {saleItems.length === 0 ? (
              <Alert severity="info">No items found for this sale.</Alert>
            ) : (
              <Table size="small" component={Paper} variant="outlined" sx={{ mb: 3 }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: "action.selected" }}>
                    <TableCell><strong>Product</strong></TableCell>
                    <TableCell align="center"><strong>Orig Qty</strong></TableCell>
                    <TableCell align="center"><strong>Already Returned</strong></TableCell>
                    <TableCell align="center"><strong>Available</strong></TableCell>
                    <TableCell align="center"><strong>Rate</strong></TableCell>
                    <TableCell align="center"><strong>Return Qty</strong></TableCell>
                    <TableCell align="right"><strong>Return Amount</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {saleItems.map((item) => {
                    const returnQty = returnQtys[item.product_id] ?? 0;
                    const lineAmount = returnQty * item.rate;
                    const fullyReturned = item.available_to_return_qty === 0;
                    return (
                      <TableRow
                        key={item.product_id}
                        sx={{ opacity: fullyReturned ? 0.45 : 1 }}
                      >
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>{item.product_name}</Typography>
                          {fullyReturned && (
                            <Chip label="All returned" size="small" color="default" sx={{ fontSize: "0.65rem", height: 18, mt: 0.25 }} />
                          )}
                        </TableCell>
                        <TableCell align="center">{item.quantity}</TableCell>
                        <TableCell align="center">
                          {item.already_returned_qty > 0 ? (
                            <Chip label={item.already_returned_qty} size="small" color="warning" variant="outlined" />
                          ) : "—"}
                        </TableCell>
                        <TableCell align="center">
                          <Typography fontWeight={600} color={fullyReturned ? "text.disabled" : "primary"}>
                            {item.available_to_return_qty}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">{fmt(item.rate)}</TableCell>
                        <TableCell align="center">
                          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.5 }}>
                            <IconButton
                              size="small"
                              onClick={() => handleQtyChange(item.product_id, -1, item.available_to_return_qty)}
                              disabled={fullyReturned || returnQty <= 0}
                            >
                              <RemoveIcon fontSize="small" />
                            </IconButton>
                            <Typography
                              sx={{
                                minWidth: 32,
                                textAlign: "center",
                                fontWeight: 700,
                                color: returnQty > 0 ? "warning.main" : "text.disabled",
                              }}
                            >
                              {returnQty}
                            </Typography>
                            <IconButton
                              size="small"
                              onClick={() => handleQtyChange(item.product_id, +1, item.available_to_return_qty)}
                              disabled={fullyReturned || returnQty >= item.available_to_return_qty}
                            >
                              <AddIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Typography fontWeight={600} color={lineAmount > 0 ? "warning.main" : "text.disabled"}>
                            {lineAmount > 0 ? fmt(lineAmount) : "—"}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}

            {/* ── Summary + Amount ── */}
            <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start", flexWrap: "wrap", mb: 2 }}>
              <Paper variant="outlined" sx={{ p: 2, flex: 1, minWidth: 200, borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary">Auto-calculated Return Amount</Typography>
                <Typography variant="h5" fontWeight={700} color="warning.main" mt={0.5}>
                  {fmt(autoCalculatedAmount)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {totalReturnQty} item{totalReturnQty !== 1 ? "s" : ""} selected for return
                </Typography>
              </Paper>

              <Box sx={{ flex: 1, minWidth: 200 }}>
                <TextField
                  label="Credit Note Amount"
                  type="number"
                  fullWidth
                  size="small"
                  value={amountEdited ? amountOverride : autoCalculatedAmount.toFixed(2)}
                  onChange={(e) => {
                    setAmountOverride(e.target.value);
                    setAmountEdited(true);
                  }}
                  helperText={amountEdited ? "⚠ Amount overridden manually" : "Auto-calculated from selected items"}
                  InputProps={{
                    startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                  }}
                  inputProps={{ min: 0.01, step: 0.01 }}
                />
              </Box>
            </Box>

            <Divider sx={{ mb: 2 }} />

            {/* ── Reason + Date ── */}
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
              <TextField
                label="Reason for Return (required)"
                fullWidth
                multiline
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                helperText="E.g. Damaged goods, Wrong product delivered"
                sx={{ flex: 2, minWidth: 240 }}
                size="small"
              />
              <TextField
                label="Issue Date"
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                size="small"
                sx={{ flex: 1, minWidth: 160 }}
              />
            </Box>

            <Divider sx={{ mb: 2 }} />

            {/* ── Requires Physical Pickup ── */}
            <Box sx={{ mb: 2 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={requiresPickup}
                    onChange={(e) => setRequiresPickup(e.target.checked)}
                    color="warning"
                  />
                }
                label={
                  <Typography variant="body2" fontWeight={600}>
                    Requires Physical Pickup (Reverse Logistics)
                  </Typography>
                }
              />
              {requiresPickup && (
                <TextField
                  label="Items to Pickup"
                  fullWidth
                  size="small"
                  value={displayPickupItems}
                  onChange={(e) => {
                    setPickupItemsOverride(e.target.value);
                    setPickupItemsEdited(true);
                  }}
                  helperText={
                    pickupItemsEdited
                      ? "⚠ Items list edited manually"
                      : "Auto-filled from selected return items — edit if needed"
                  }
                  error={requiresPickup && displayPickupItems.trim().length === 0}
                  sx={{ mt: 1.5, ml: 4, width: "calc(100% - 32px)" }}
                />
              )}
            </Box>

            {requiresPickup && totalReturnQty > 0 && (
              <Alert severity="info" sx={{ mt: 1 }}>
                A <strong>reverse logistics pickup</strong> will be created for the {totalReturnQty} returned item{totalReturnQty !== 1 ? "s" : ""}. It will appear in <strong>Order Management → Return Pickups</strong>.
              </Alert>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button
          variant="contained"
          color="warning"
          onClick={handleSubmit}
          disabled={!canSubmit || submitting || loadingItems}
          startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <CreditIcon />}
        >
          {submitting ? "Creating..." : `Issue Credit Note ${displayAmount > 0 ? `(${fmt(displayAmount)})` : ""}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
