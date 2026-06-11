import { useState, useEffect } from "react";
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
  Divider,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  Stack,
  FormControlLabel,
  Checkbox,
} from "@mui/material";
import {
  AddCircleOutline as AddIcon,
  Block as VoidIcon,
  TrendingDown as CreditIcon,
  TrendingUp as DebitIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import { notesAPI, paymentAPI } from "../services/api";
import type { CreditDebitNote } from "../types";
import { useAuth } from "../contexts/AuthContext";
import CreditNoteReturnDialog from "./CreditNoteReturnDialog";

interface NotesDialogProps {
  open: boolean;
  onClose: () => void;
  saleId: number;
  invoiceNo?: string;
  totalAmount: number;
  /** Current payment_status of the sale — used to warn on already-paid sales */
  paymentStatus?: string;
  /** Called when a note is created or voided so the parent can refresh */
  onNoteChange?: () => void;
}

const NOTE_TYPES = [
  { value: "credit", label: "Credit Note", description: "Reduces the balance owed" },
  { value: "debit", label: "Debit Note", description: "Increases the balance owed" },
];

export default function NotesDialog({
  open,
  onClose,
  saleId,
  invoiceNo,
  totalAmount,
  paymentStatus,
  onNoteChange,
}: NotesDialogProps) {
  const { hasPermission } = useAuth();
  const canManageNotes = hasPermission("manage_notes");

  const [notes, setNotes] = useState<CreditDebitNote[]>([]);
  const [fetchedPaidAmount, setFetchedPaidAmount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [voidingId, setVoidingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Credit Note → opens CreditNoteReturnDialog instead of inline form
  const [creditReturnOpen, setCreditReturnOpen] = useState(false);

  // Form state
  const [form, setForm] = useState({
    note_type: "credit" as "credit" | "debit",
    amount: "",
    reason: "",
    issue_date: new Date().toISOString().split("T")[0],
    requires_pickup: false,
    pickup_items: "",
    debit_invoice_no: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Computed balance from existing active notes
  const activeNotes = notes.filter((n) => n.status === "active");
  const creditTotal = activeNotes
    .filter((n) => n.note_type === "credit")
    .reduce((sum, n) => sum + Number(n.amount), 0);
  const debitTotal = activeNotes
    .filter((n) => n.note_type === "debit")
    .reduce((sum, n) => sum + Number(n.amount), 0);
  const effectiveBalance = totalAmount - fetchedPaidAmount - creditTotal + debitTotal;

  const isPaidSale = paymentStatus === "Paid";

  useEffect(() => {
    if (open && saleId) {
      fetchNotes();
    }
  }, [open, saleId]);

  const fetchNotes = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch both notes and payment data to compute paid amount accurately
      const [notesData, paymentsData] = await Promise.all([
        notesAPI.getBySale(saleId),
        paymentAPI.getHistory(saleId).catch(() => [])
      ]);
      
      setNotes(notesData || []);
      
      // Calculate paid amount from payments
      const totalPaid = Array.isArray(paymentsData) 
        ? paymentsData.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0)
        : 0;
      setFetchedPaidAmount(totalPaid);
      
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to load notes");
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const errs: Record<string, string> = {};
    const amt = parseFloat(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0) {
      errs.amount = "Amount must be greater than 0";
    }
    if (!form.reason.trim()) {
      errs.reason = "Reason is required";
    }
    if (!form.issue_date) {
      errs.issue_date = "Issue date is required";
    }
    if (form.requires_pickup && !form.pickup_items.trim()) {
      errs.pickup_items = "Please specify what items need to be picked up";
    }
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    const amt = parseFloat(form.amount);

    try {
      setSubmitting(true);
      setError(null);
      await notesAPI.create({
        note_type: "debit",  // Inline form is debit-only; credit goes through CreditNoteReturnDialog
        sale_id: saleId,
        amount: amt,
        reason: form.reason.trim(),
        issue_date: form.issue_date,
        debit_invoice_no: form.debit_invoice_no.trim() || undefined,
      });
      setSuccess(`${form.note_type === "credit" ? "Credit" : "Debit"} note created successfully`);
      setForm({
        note_type: "credit",
        amount: "",
        reason: "",
        issue_date: new Date().toISOString().split("T")[0],
        requires_pickup: false,
        pickup_items: "",
        debit_invoice_no: "",
      });
      setFormErrors({});
      await fetchNotes();
      onNoteChange?.();
      // Close the dialog after a short delay so user sees the success banner
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to create note");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoid = async (note: CreditDebitNote) => {
    if (!canManageNotes) return;
    if (
      !window.confirm(
        `Are you sure you want to void this ${note.note_type} note of ₹${Number(note.amount).toFixed(2)}? ` +
          "This cannot be undone but the record will be preserved for auditing."
      )
    )
      return;

    try {
      setVoidingId(note.note_id!);
      setError(null);
      await notesAPI.void(note.note_id!);
      setSuccess("Note voided successfully");
      await fetchNotes();
      onNoteChange?.();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to void note");
    } finally {
      setVoidingId(null);
      setTimeout(() => setSuccess(null), 3000);
    }
  };

  const handleClose = () => {
    setError(null);
    setSuccess(null);
    setFormErrors({});
    setForm({
      note_type: "credit",
      amount: "",
      reason: "",
      issue_date: new Date().toISOString().split("T")[0],
      requires_pickup: false,
      pickup_items: "",
      debit_invoice_no: "",
    });
    onClose();
  };

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n);

  return (
    <>
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Box>
          <Typography variant="h6" fontWeight={700}>
            Manage Notes
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {invoiceNo ? `Invoice: ${invoiceNo}` : `Sale #${saleId}`}
          </Typography>
        </Box>
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {/* Balance Summary */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 2,
            mb: 3,
            p: 2,
            borderRadius: 2,
            bgcolor: "action.hover",
          }}
        >
          {[
            { label: "Total Amount", value: totalAmount, color: "text.primary" },
            { label: "Paid", value: fetchedPaidAmount, color: "success.main" },
            { label: "Credit Notes", value: creditTotal, color: "warning.main" },
            { label: "Debit Notes", value: debitTotal, color: "error.main" },
          ].map(({ label, value, color }) => (
            <Box key={label} sx={{ textAlign: "center" }}>
              <Typography variant="caption" color="text.secondary" display="block">
                {label}
              </Typography>
              <Typography variant="subtitle2" fontWeight={700} color={color}>
                {fmt(value)}
              </Typography>
            </Box>
          ))}
        </Box>

        <Box
          sx={{
            textAlign: "center",
            mb: 2,
            p: 1.5,
            borderRadius: 1,
            bgcolor: effectiveBalance < 0 ? "error.light" : effectiveBalance === 0 ? "success.light" : "info.light",
          }}
        >
          <Typography variant="body2" fontWeight={700}>
            Effective Remaining Balance: {fmt(effectiveBalance)}
            {effectiveBalance < 0 ? " ⚠ Refund Due to Customer" : effectiveBalance === 0 ? " (Fully Paid)" : ""}
          </Typography>
        </Box>

        {isPaidSale && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            This sale is marked as <strong>Paid</strong>. Adding a Debit Note will revert the
            payment status to Partial or Pending.
          </Alert>
        )}

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        {/* Add Note Form */}
        <Typography variant="subtitle1" fontWeight={600} mb={1.5}>
          Add New Note
        </Typography>

        {/* ── CREDIT NOTE: opens the full item-return dialog ── */}
        <Box
          sx={{
            mb: 2,
            p: 2,
            border: "1px dashed",
            borderColor: "warning.main",
            borderRadius: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
            flexWrap: "wrap",
          }}
        >
          <Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CreditIcon color="warning" />
              <Typography fontWeight={600}>Credit Note</Typography>
            </Box>
            <Typography variant="caption" color="text.secondary">
              Select returned items, auto-calculates the refund amount and creates a reverse pickup.
            </Typography>
          </Box>
          <Button
            variant="outlined"
            color="warning"
            startIcon={<AddIcon />}
            onClick={() => setCreditReturnOpen(true)}
          >
            Issue Credit Note
          </Button>
        </Box>

        <Divider sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary">OR</Typography>
        </Divider>

        {/* ── DEBIT NOTE: inline form ── */}
        <Typography variant="subtitle2" fontWeight={600} mb={1} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <DebitIcon color="error" fontSize="small" /> Debit Note (increases amount owed)
        </Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, mb: 2 }}>
          <TextField
            label="Amount (₹)"
            type="number"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            error={!!formErrors.amount}
            helperText={formErrors.amount}
            size="small"
            inputProps={{ min: 0.01, step: 0.01 }}
          />
          <TextField
            label="Issue Date"
            type="date"
            value={form.issue_date}
            onChange={(e) => setForm((f) => ({ ...f, issue_date: e.target.value }))}
            error={!!formErrors.issue_date}
            helperText={formErrors.issue_date}
            size="small"
            InputLabelProps={{ shrink: true }}
          />
        </Box>
        <TextField
          label="Reason (required)"
          fullWidth
          multiline
          rows={2}
          value={form.reason}
          onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
          error={!!formErrors.reason}
          helperText={formErrors.reason || "Briefly describe why this debit note is being issued"}
          size="small"
          sx={{ mb: 2 }}
        />
        <TextField
          label="New Sale Invoice No (optional)"
          fullWidth
          size="small"
          value={form.debit_invoice_no}
          onChange={(e) => setForm((f) => ({ ...f, debit_invoice_no: e.target.value }))}
          helperText="A new Sale record will be created. Leave blank to auto-generate invoice number."
          sx={{ mb: 2 }}
        />


        <Box sx={{ mb: 3 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={form.requires_pickup}
                onChange={(e) => setForm((f) => ({ ...f, requires_pickup: e.target.checked }))}
                color="primary"
              />
            }
            label={
              <Typography variant="body2" fontWeight={600}>
                Requires Physical Pickup (Reverse Logistics)
              </Typography>
            }
          />
          {form.requires_pickup && (
            <TextField
              label="Items to Pickup (Required for Returns)"
              fullWidth
              size="small"
              value={form.pickup_items}
              onChange={(e) => setForm((f) => ({ ...f, pickup_items: e.target.value }))}
              error={!!formErrors.pickup_items}
              helperText={formErrors.pickup_items || "e.g., 2x 5L Cans, 1x Box"}
              sx={{ mt: 1.5, ml: 4, width: 'calc(100% - 32px)' }}
            />
          )}
        </Box>

        <Button
          variant="contained"
          color="error"
          startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <AddIcon />}
          onClick={handleSubmit}
          disabled={submitting}
          sx={{ mb: 3 }}
        >
          {submitting ? "Creating..." : "Add Debit Note"}
        </Button>

        <Divider sx={{ mb: 2 }} />

        {/* Note History */}
        <Typography variant="subtitle1" fontWeight={600} mb={1.5}>
          Note History
        </Typography>

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress size={28} />
          </Box>
        ) : notes.length === 0 ? (
          <Typography color="text.secondary" variant="body2" sx={{ py: 2, textAlign: "center" }}>
            No credit or debit notes found for this sale.
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            {notes.map((note) => (
              <Box
                key={note.note_id}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  p: 1.5,
                  borderRadius: 1,
                  border: "1px solid",
                  borderColor: note.status === "void" ? "divider" : note.note_type === "credit" ? "warning.light" : "error.light",
                  bgcolor: note.status === "void" ? "action.disabledBackground" : "background.paper",
                  opacity: note.status === "void" ? 0.65 : 1,
                }}
              >
                {/* Icon */}
                {note.note_type === "credit" ? (
                  <CreditIcon color={note.status === "void" ? "disabled" : "warning"} />
                ) : (
                  <DebitIcon color={note.status === "void" ? "disabled" : "error"} />
                )}

                {/* Content */}
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.25 }}>
                    <Typography variant="body2" fontWeight={600}>
                      {note.note_type === "credit" ? "Credit" : "Debit"} Note — {fmt(Number(note.amount))}
                    </Typography>
                    <Chip
                      label={note.status === "void" ? "Voided" : "Active"}
                      size="small"
                      color={note.status === "void" ? "default" : "success"}
                      variant="outlined"
                    />
                  </Box>
                  {note.invoice_no && (
                    <Typography variant="caption" color="primary" display="block" fontWeight={600}>
                      Invoice: {note.invoice_no}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary" display="block">
                    {note.reason}
                  </Typography>
                  <Typography variant="caption" color="text.disabled">
                    Issued: {note.issue_date} &nbsp;|&nbsp; Created: {note.created_at?.split("T")[0]}
                    {note.status === "void" && note.updated_at
                      ? ` | Voided: ${note.updated_at.split("T")[0]}`
                      : ""}
                  </Typography>
                  {note.requires_pickup && (
                    <Box sx={{ mt: 1 }}>
                      <Chip 
                        label={`Return Pickup: ${note.pickup_status?.replace(/_/g, ' ').toUpperCase()}`} 
                        size="small" 
                        color={note.pickup_status === 'returned_to_company' ? 'success' : 'warning'} 
                        variant="filled"
                        sx={{ fontSize: '0.65rem', height: 20 }}
                      />
                      {note.pickup_items && (
                        <Typography variant="caption" color="text.secondary" sx={{ ml: 1, display: 'inline-block' }}>
                          Items: {note.pickup_items}
                        </Typography>
                      )}
                    </Box>
                  )}
                </Box>

                {/* Void action */}
                {note.status === "active" && canManageNotes && (
                  <Tooltip title="Void this note (preserves audit trail)">
                    <span>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleVoid(note)}
                        disabled={voidingId === note.note_id}
                      >
                        {voidingId === note.note_id ? (
                          <CircularProgress size={16} color="inherit" />
                        ) : (
                          <VoidIcon fontSize="small" />
                        )}
                      </IconButton>
                    </span>
                  </Tooltip>
                )}
              </Box>
            ))}
          </Stack>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} variant="outlined">
          Close
        </Button>
      </DialogActions>
    </Dialog>

    {/* Credit Note Return Dialog — opens when user clicks "Issue Credit Note" */}
    <CreditNoteReturnDialog
      open={creditReturnOpen}
      onClose={() => setCreditReturnOpen(false)}
      saleId={saleId}
      onSuccess={async () => {
        setCreditReturnOpen(false);
        setSuccess("Credit note created successfully");
        await fetchNotes();
        onNoteChange?.();
        setTimeout(() => setSuccess(null), 3000);
      }}
    />
    </>
  );
}
