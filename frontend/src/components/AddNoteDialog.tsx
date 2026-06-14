/**
 * AddNoteDialog.tsx
 * -----------------
 * Standalone "Add Note" entry point in the Sales toolbar.
 * Step 1: User picks customer type → customer name → invoice (with product details)
 * Step 2: Opens the existing NotesDialog for the selected sale
 */
import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Typography,
  Box,
  Chip,
  Autocomplete,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  CircularProgress,
  Divider,
} from "@mui/material";
import {
  Description as NoteIcon,
  Receipt as ReceiptIcon,
  Inventory2 as ProductIcon,
} from "@mui/icons-material";
import { notesAPI } from "../services/api";
import NotesDialog from "./NotesDialog";

interface AddNoteDialogProps {
  open: boolean;
  onClose: () => void;
  onNoteChange?: () => void;
  sales?: any[];
}

const BUYER_TYPES = [
  { value: "mantri",        label: "Mantri" },
  { value: "customer",      label: "Sabhasad" },
  { value: "doctor",        label: "Doctor" },
  { value: "shopkeeper",    label: "Shopkeeper" },
  { value: "field_officer", label: "Field Officer" },
];

export default function AddNoteDialog({
  open,
  onClose,
  onNoteChange,
  sales = [],
}: AddNoteDialogProps) {
  // Step 1 state
  const [buyerType, setBuyerType] = useState("mantri");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null);

  // Product details for selected invoice
  const [loadingItems, setLoadingItems] = useState(false);
  const [saleItems, setSaleItems] = useState<any[]>([]);
  const [saleInfo, setSaleInfo] = useState<any | null>(null);

  // Step 2 state
  const [notesOpen, setNotesOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<any | null>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setBuyerType("mantri");
      setSelectedName(null);
      setSelectedSaleId(null);
      setSelectedSale(null);
      setSaleItems([]);
      setSaleInfo(null);
      setNotesOpen(false);
    }
  }, [open]);

  // Fetch product details when an invoice is selected
  useEffect(() => {
    if (!selectedSaleId) {
      setSaleItems([]);
      setSaleInfo(null);
      return;
    }
    setLoadingItems(true);
    setSaleItems([]);
    setSaleInfo(null);
    notesAPI.getSaleItems(selectedSaleId)
      .then((data) => {
        setSaleInfo(data.sale || null);
        setSaleItems(data.items || []);
      })
      .catch(() => {
        // If endpoint fails, fall back silently
        setSaleItems([]);
      })
      .finally(() => setLoadingItems(false));
  }, [selectedSaleId]);

  // Unique names from sales for the chosen buyer_type
  const nameOptions = useMemo(() => {
    const salesForType = sales.filter(
      (s) => (s.buyer_type || "customer") === buyerType
    );
    const seen = new Set<string>();
    const names: string[] = [];
    for (const s of salesForType) {
      const n = s.customer_name;
      if (n && !seen.has(n)) {
        seen.add(n);
        names.push(n);
      }
    }
    return names.sort();
  }, [sales, buyerType]);

  // All sales for the selected name + type
  const nameSales = useMemo(() => {
    if (!selectedName) return [];
    return sales
      .filter(
        (s) =>
          (s.buyer_type || "customer") === buyerType &&
          s.customer_name === selectedName
      )
      .sort((a, b) => new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime());
  }, [sales, selectedName, buyerType]);

  const handleProceed = () => {
    const sale = nameSales.find((s) => s.sale_id === selectedSaleId);
    if (!sale) return;
    setSelectedSale(sale);
    setNotesOpen(true);
  };

  const handleNotesClose = () => {
    setNotesOpen(false);
    onClose();
  };

  const handleNoteChange = () => {
    onNoteChange?.();
    setNotesOpen(false);
    onClose();
  };

  const typeLabel = BUYER_TYPES.find((b) => b.value === buyerType)?.label ?? "";
  const selectedSaleObj = nameSales.find((s) => s.sale_id === selectedSaleId);

  const fmt = (n: number) =>
    `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <>
      {/* Step 1: Selector Dialog */}
      <Dialog open={open && !notesOpen} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <NoteIcon color="warning" />
            <Typography variant="h6" fontWeight={700}>
              Add Credit / Debit Note
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary">
            Select the customer and invoice to add a note against
          </Typography>
        </DialogTitle>

        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, pt: 1 }}>

            {/* 1. Customer Type */}
            <TextField
              label="Customer Type"
              select
              fullWidth
              value={buyerType}
              onChange={(e) => {
                setBuyerType(e.target.value);
                setSelectedName(null);
                setSelectedSaleId(null);
              }}
              size="small"
            >
              {BUYER_TYPES.map((bt) => (
                <MenuItem key={bt.value} value={bt.value}>
                  {bt.label}
                </MenuItem>
              ))}
            </TextField>

            {/* 2. Name Autocomplete */}
            <Autocomplete
              options={nameOptions}
              value={selectedName}
              onChange={(_, val) => {
                setSelectedName(val);
                setSelectedSaleId(null);
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={`${typeLabel} Name`}
                  size="small"
                  placeholder="Search by name..."
                />
              )}
              noOptionsText={`No ${typeLabel} with existing sales found`}
            />

            {/* 3. Invoice dropdown */}
            {selectedName && (
              <>
                {nameSales.length === 0 ? (
                  <Box sx={{ textAlign: "center", py: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      No invoices found for <strong>{selectedName}</strong>
                    </Typography>
                  </Box>
                ) : (
                  <TextField
                    label="Select Invoice"
                    select
                    fullWidth
                    value={selectedSaleId ?? ""}
                    onChange={(e) => setSelectedSaleId(Number(e.target.value))}
                    size="small"
                    SelectProps={{
                      renderValue: (val) => {
                        const sale = nameSales.find((s) => s.sale_id === val);
                        return sale
                          ? `${sale.invoice_no} — ₹${sale.total_amount?.toLocaleString()}`
                          : "";
                      },
                    }}
                  >
                    {nameSales.map((sale) => (
                      <MenuItem
                        key={sale.sale_id}
                        value={sale.sale_id}
                        sx={{ display: "block", py: 1 }}
                      >
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.25 }}>
                          <Chip
                            label={sale.invoice_no}
                            size="small"
                            color={
                              sale.payment_status === "Paid" ? "success" :
                              sale.payment_status === "Refund Due" ? "secondary" :
                              sale.payment_status === "Partial" ? "warning" : "default"
                            }
                            icon={<ReceiptIcon style={{ fontSize: 12 }} />}
                          />
                          <Typography variant="body2" fontWeight={600}>
                            ₹{sale.total_amount?.toLocaleString()}
                          </Typography>
                          <Chip
                            label={sale.payment_status}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: "0.65rem", height: 18 }}
                          />
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", pl: 0.5 }}>
                          {new Date(sale.sale_date).toLocaleDateString()}
                        </Typography>
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              </>
            )}

            {/* 4. Product Details Panel — shown after invoice is selected */}
            {selectedSaleId && (
              <>
                <Divider />
                <Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                    <ProductIcon fontSize="small" color="action" />
                    <Typography variant="subtitle2" fontWeight={600}>
                      Product Details
                    </Typography>
                    {selectedSaleObj && (
                      <Chip
                        label={new Date(selectedSaleObj.sale_date).toLocaleDateString()}
                        size="small"
                        variant="outlined"
                        sx={{ ml: "auto", fontSize: "0.65rem" }}
                      />
                    )}
                  </Box>

                  {loadingItems ? (
                    <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                      <CircularProgress size={20} />
                    </Box>
                  ) : saleItems.length > 0 ? (
                    <Paper variant="outlined" sx={{ borderRadius: 1, overflow: "hidden" }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ bgcolor: "action.selected" }}>
                            <TableCell><strong>Product</strong></TableCell>
                            <TableCell align="center"><strong>Qty</strong></TableCell>
                            <TableCell align="right"><strong>Rate</strong></TableCell>
                            <TableCell align="right"><strong>Amount</strong></TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {saleItems.map((item, idx) => (
                            <TableRow key={idx}>
                              <TableCell>
                                <Typography variant="body2" fontWeight={500}>
                                  {item.product_name}
                                </Typography>
                                {item.already_returned_qty > 0 && (
                                  <Chip
                                    label={`${item.already_returned_qty} returned`}
                                    size="small"
                                    color="warning"
                                    variant="outlined"
                                    sx={{ fontSize: "0.6rem", height: 16, mt: 0.25 }}
                                  />
                                )}
                              </TableCell>
                              <TableCell align="center">{item.quantity}</TableCell>
                              <TableCell align="right">{fmt(item.rate)}</TableCell>
                              <TableCell align="right">
                                <Typography variant="body2" fontWeight={600} color="primary">
                                  {fmt(item.amount)}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          ))}
                          {/* Total row */}
                          <TableRow sx={{ bgcolor: "action.hover" }}>
                            <TableCell colSpan={3}>
                              <Typography variant="body2" fontWeight={700}>Total</Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2" fontWeight={700} color="success.main">
                                {fmt(saleItems.reduce((s, i) => s + i.amount, 0))}
                              </Typography>
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </Paper>
                  ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ pl: 1 }}>
                      No product details available for this invoice.
                    </Typography>
                  )}
                </Box>
              </>
            )}
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} color="inherit">
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            disabled={!selectedSaleId}
            onClick={handleProceed}
            startIcon={<NoteIcon />}
          >
            Add Note
          </Button>
        </DialogActions>
      </Dialog>

      {/* Step 2: NotesDialog for the chosen sale */}
      {selectedSale && (
        <NotesDialog
          open={notesOpen}
          onClose={handleNotesClose}
          saleId={selectedSale.sale_id}
          invoiceNo={selectedSale.invoice_no}
          totalAmount={selectedSale.total_amount}
          paymentStatus={selectedSale.payment_status}
          onNoteChange={handleNoteChange}
        />
      )}
    </>
  );
}
