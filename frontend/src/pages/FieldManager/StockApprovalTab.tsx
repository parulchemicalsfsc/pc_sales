/**
 * StockApprovalTab.tsx
 * ──────────────────────────────────────────────────────────────────────────
 * Tab 6: Field Officer Stock & Sample Request Approvals
 * - Table / Cards of fo_stock_requests:
 *   - Request ID, FO Name, SKU Requested, Requested Qty, Approved Qty, Status, Request Date, FO Notes
 * - Action Buttons:
 *   - Approve Full Qty
 *   - Modify Qty & Approve (Dialog)
 *   - Mark Dispatched
 *   - Reject Request (Dialog with mandatory reason)
 */

import { useState, useEffect } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  Button,
  IconButton,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  MenuItem,
  Grid,
} from "@mui/material";
import {
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  LocalShipping as DispatchIcon,
  Edit as ModifyIcon,
} from "@mui/icons-material";
import { auraManagerAPI } from "../../services/auraApi";
import type { StockRequest } from "../../types/aura";

interface Props {
  selectedFoEmail: string | "all";
}

export default function StockApprovalTab({ selectedFoEmail }: Props) {
  const [requests, setRequests] = useState<StockRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Dialog state for Modify & Approve
  const [modifyDialogOpen, setModifyDialogOpen] = useState(false);
  const [selectedReq, setSelectedReq] = useState<StockRequest | null>(null);
  const [approvedQty, setApprovedQty] = useState<number>(0);
  const [managerNotes, setManagerNotes] = useState<string>("");

  // Dialog state for Reject
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState<string>("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: { fo_user_id?: string; status?: string } = {
        fo_user_id: selectedFoEmail === "all" ? undefined : selectedFoEmail,
        status: statusFilter === "all" ? undefined : statusFilter,
      };
      const res = await auraManagerAPI.getStockRequests(params);
      const data: StockRequest[] = res.data?.requests ?? [];
      setRequests(data);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to load stock requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [selectedFoEmail, statusFilter]);

  // Handle Approve Full
  const handleApproveFull = async (req: StockRequest) => {
    setActionLoading(true);
    try {
      await auraManagerAPI.updateStockRequest(req.request_id, {
        status: "approved",
        approved_qty: req.requested_qty,
      });
      await fetchRequests();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to approve request");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Modify & Approve Submit
  const handleModifySubmit = async () => {
    if (!selectedReq) return;
    setActionLoading(true);
    try {
      await auraManagerAPI.updateStockRequest(selectedReq.request_id, {
        status: "approved",
        approved_qty: approvedQty,
        manager_notes: managerNotes,
      });
      setModifyDialogOpen(false);
      await fetchRequests();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to update request");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Dispatch
  const handleDispatch = async (req: StockRequest) => {
    setActionLoading(true);
    try {
      await auraManagerAPI.updateStockRequest(req.request_id, {
        status: "dispatched",
      });
      await fetchRequests();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to mark as dispatched");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Reject Submit
  const handleRejectSubmit = async () => {
    if (!selectedReq || !rejectReason.trim()) return;
    setActionLoading(true);
    try {
      await auraManagerAPI.updateStockRequest(selectedReq.request_id, {
        status: "rejected",
        manager_notes: rejectReason,
      });
      setRejectDialogOpen(false);
      await fetchRequests();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to reject request");
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusChip = (status: StockRequest["status"]) => {
    switch (status) {
      case "approved":
        return <Chip label="Approved" color="success" size="small" />;
      case "dispatched":
        return <Chip label="Dispatched" color="primary" size="small" />;
      case "rejected":
        return <Chip label="Rejected" color="error" size="small" />;
      default:
        return <Chip label="Pending" color="warning" size="small" />;
    }
  };

  return (
    <Box>
      {/* Filter */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={4}>
              <TextField
                select
                label="Filter by Status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                fullWidth
                size="small"
              >
                <MenuItem value="all">All Statuses</MenuItem>
                <MenuItem value="pending">Pending Approval</MenuItem>
                <MenuItem value="approved">Approved</MenuItem>
                <MenuItem value="dispatched">Dispatched</MenuItem>
                <MenuItem value="rejected">Rejected</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Requests Table */}
      <Card>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} mb={2}>
            Stock & Sample Requests
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Request ID / Date</TableCell>
                <TableCell>Field Officer</TableCell>
                <TableCell>SKU / Product</TableCell>
                <TableCell align="right">Requested Qty</TableCell>
                <TableCell align="right">Approved Qty</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Notes</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={30} />
                  </TableCell>
                </TableRow>
              ) : requests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      No stock requests found.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                requests.map((req) => (
                  <TableRow key={req.request_id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {req.request_id}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(req.requested_at || req.request_date || Date.now()).toLocaleDateString()}
                      </Typography>
                    </TableCell>
                    <TableCell>{req.fo_name || req.field_officer?.name || "Field Officer"}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{req.sku || req.sku_name || "Item"}</TableCell>
                    <TableCell align="right">{req.requested_qty}</TableCell>
                    <TableCell align="right">
                      {req.approved_qty !== undefined ? (
                        <Typography color="success.main" fontWeight={600} variant="body2">
                          {req.approved_qty}
                        </Typography>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{getStatusChip(req.status)}</TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary" display="block">
                        FO: {req.notes || "None"}
                      </Typography>
                      {req.manager_notes && (
                        <Typography variant="caption" color="primary.main" display="block">
                          Mgr: {req.manager_notes}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Box display="flex" justifyContent="center" gap={0.5}>
                        {req.status === "pending" && (
                          <>
                            <Tooltip title="Approve Full Qty">
                              <IconButton
                                size="small"
                                color="success"
                                onClick={() => handleApproveFull(req)}
                                disabled={actionLoading}
                              >
                                <ApproveIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Modify Qty & Approve">
                              <IconButton
                                size="small"
                                color="primary"
                                onClick={() => {
                                  setSelectedReq(req);
                                  setApprovedQty(req.requested_qty);
                                  setManagerNotes("");
                                  setModifyDialogOpen(true);
                                }}
                                disabled={actionLoading}
                              >
                                <ModifyIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Reject Request">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => {
                                  setSelectedReq(req);
                                  setRejectReason("");
                                  setRejectDialogOpen(true);
                                }}
                                disabled={actionLoading}
                              >
                                <RejectIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                        {req.status === "approved" && (
                          <Tooltip title="Mark Dispatched">
                            <Button
                              size="small"
                              variant="outlined"
                              color="primary"
                              startIcon={<DispatchIcon />}
                              onClick={() => handleDispatch(req)}
                              disabled={actionLoading}
                            >
                              Dispatch
                            </Button>
                          </Tooltip>
                        )}
                        {(req.status === "dispatched" || req.status === "rejected") && (
                          <Typography variant="caption" color="text.secondary">
                            Completed
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modify Qty Modal */}
      <Dialog open={modifyDialogOpen} onClose={() => setModifyDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Modify Qty & Approve</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} mt={1}>
            <Typography variant="body2">
              SKU: <strong>{selectedReq?.sku}</strong> (Requested: {selectedReq?.requested_qty})
            </Typography>
            <TextField
              label="Approved Quantity"
              type="number"
              value={approvedQty}
              onChange={(e) => setApprovedQty(Number(e.target.value))}
              fullWidth
              inputProps={{ min: 1, max: selectedReq?.requested_qty }}
            />
            <TextField
              label="Manager Note (Optional)"
              value={managerNotes}
              onChange={(e) => setManagerNotes(e.target.value)}
              fullWidth
              multiline
              rows={2}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModifyDialogOpen(false)} disabled={actionLoading}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleModifySubmit} disabled={actionLoading || approvedQty <= 0}>
            Approve {approvedQty} units
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reject Modal */}
      <Dialog open={rejectDialogOpen} onClose={() => setRejectDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Reject Stock Request</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} mt={1}>
            <Typography variant="body2" color="error.main">
              Please provide a mandatory reason for rejecting this request:
            </Typography>
            <TextField
              label="Rejection Reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              fullWidth
              multiline
              rows={3}
              required
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectDialogOpen(false)} disabled={actionLoading}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleRejectSubmit}
            disabled={actionLoading || !rejectReason.trim()}
          >
            Confirm Rejection
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

