/**
 * DiscountAnalyticsTab.tsx
 * ──────────────────────────────────────────────────────────────────────────
 * Tab 4: Discount & Revenue Analytics Ledger
 * - Top KPI Summary: Gross Sales, Net Sales, Total Discounts, Avg Discount %
 * - Sub-A: Field Officer Discount Comparison Table
 * - Sub-B: Order-Wise Discount Ledger with expandable line items & edit reason alert
 * - Sub-C: Payment Receipts Audit Ledger with direct PDF download link
 */

import { useState, useEffect } from "react";
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Chip,
  Alert,
  IconButton,
  Tooltip,
  Collapse,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Divider,
} from "@mui/material";
import {
  DataGrid,
  type GridColDef,
  type GridRenderCellParams,
} from "@mui/x-data-grid";
import {
  AttachMoney as GrossIcon,
  CheckCircleOutline as NetIcon,
  LocalOffer as DiscountIcon,
  Percent as PercentIcon,
  PictureAsPdf as PdfIcon,
  KeyboardArrowDown as ExpandIcon,
  KeyboardArrowUp as CollapseIcon,
  WarningAmber as WarningIcon,
} from "@mui/icons-material";
import { auraManagerAPI } from "../../services/auraApi";
import type {
  DiscountAnalytics,
  OfficerDiscountSummary,
  OrderDiscount,
  PaymentReceipt,
} from "../../types/aura";

interface Props {
  selectedFoId: string | "all";
  selectedMonth: string;
}

// ─── Order Row with expandable line items ─────────────────────────────────────

function OrderRow({
  order,
}: {
  order: OrderDiscount;
}) {
  const [open, setOpen] = useState(false);
  const hasLineItems = Boolean(order.line_items && order.line_items.length > 0);

  return (
    <>
      <TableRow hover sx={{ "& > *": { borderBottom: "unset" } }}>
        <TableCell width={50}>
          {hasLineItems ? (
            <IconButton size="small" onClick={() => setOpen(!open)}>
              {open ? <CollapseIcon fontSize="small" /> : <ExpandIcon fontSize="small" />}
            </IconButton>
          ) : null}
        </TableCell>
        <TableCell>
          <Typography variant="body2" fontWeight={600}>
            {order.order_id}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {order.order_date}
          </Typography>
        </TableCell>
        <TableCell>{order.fo_name}</TableCell>
        <TableCell>{order.customer_name}</TableCell>
        <TableCell align="right">₹{order.gross_amount.toLocaleString("en-IN")}</TableCell>
        <TableCell align="right">
          <Typography color="error.main" fontWeight={600} variant="body2">
            ₹{order.discount_amount.toLocaleString("en-IN")}
          </Typography>
        </TableCell>
        <TableCell align="right">
          <Typography color="success.main" fontWeight={700} variant="body2">
            ₹{order.net_amount.toLocaleString("en-IN")}
          </Typography>
        </TableCell>
        <TableCell>
          <Box display="flex" flexDirection="column" gap={0.5}>
            <Typography variant="caption" color="text.secondary">
              {order.discount_reason || "Standard pricing"}
            </Typography>
            {order.is_edited && (
              <Chip
                icon={<WarningIcon fontSize="small" />}
                label={order.edit_reason ? `Edited: ${order.edit_reason}` : "Edited post-booking"}
                color="warning"
                size="small"
                variant="outlined"
              />
            )}
          </Box>
        </TableCell>
      </TableRow>
      {hasLineItems && (
        <TableRow>
          <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={8}>
            <Collapse in={open} timeout="auto" unmountOnExit>
              <Box sx={{ margin: 1, p: 1.5, bgcolor: "action.hover", borderRadius: 1 }}>
                <Typography variant="caption" fontWeight={700} textTransform="uppercase" color="text.secondary">
                  Line Items Breakdown
                </Typography>
                <Table size="small" sx={{ mt: 1 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>SKU / Product</TableCell>
                      <TableCell align="right">Quantity</TableCell>
                      <TableCell align="right">Unit Price (₹)</TableCell>
                      <TableCell align="right">Discount (₹)</TableCell>
                      <TableCell align="right">Net Amount (₹)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {order.line_items!.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{item.sku}</TableCell>
                        <TableCell align="right">{item.qty}</TableCell>
                        <TableCell align="right">₹{item.unit_price.toLocaleString("en-IN")}</TableCell>
                        <TableCell align="right">₹{item.discount_amount.toLocaleString("en-IN")}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>
                          ₹{item.net_amount.toLocaleString("en-IN")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </Collapse>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DiscountAnalyticsTab({ selectedFoId, selectedMonth }: Props) {
  const [data, setData] = useState<DiscountAnalytics | null>(null);
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const foParam = selectedFoId === "all" ? undefined : selectedFoId;
        const [discRes, recRes] = await Promise.all([
          auraManagerAPI.getDiscounts({ fo_user_id: foParam, month: selectedMonth }),
          auraManagerAPI.getReceipts({ fo_user_id: foParam, month: selectedMonth }),
        ]);

        setData(discRes.data);
        const rList = recRes.data?.receipts ?? recRes.data ?? [];
        setReceipts(rList);
      } catch (e: unknown) {
        const err = e as { message?: string };
        setError(err.message ?? "Failed to load discount analytics");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedFoId, selectedMonth]);

  const summary = data?.summary ?? {
    gross_sales: 0,
    net_sales: 0,
    total_discount: 0,
    avg_discount_pct: 0,
  };

  const officerColumns: GridColDef[] = [
    { field: "fo_name", headerName: "Officer Name", flex: 1.2 },
    {
      field: "gross_sales",
      headerName: "Gross Sales (₹)",
      flex: 1,
      renderCell: (p: GridRenderCellParams<OfficerDiscountSummary>) => `₹${p.row.gross_sales.toLocaleString("en-IN")}`,
    },
    {
      field: "net_sales",
      headerName: "Net Sales (₹)",
      flex: 1,
      renderCell: (p: GridRenderCellParams<OfficerDiscountSummary>) => (
        <Typography color="success.main" fontWeight={600} variant="body2">
          ₹{p.row.net_sales.toLocaleString("en-IN")}
        </Typography>
      ),
    },
    {
      field: "total_discount",
      headerName: "Total Discount (₹)",
      flex: 1,
      renderCell: (p: GridRenderCellParams<OfficerDiscountSummary>) => (
        <Typography color="error.main" fontWeight={600} variant="body2">
          ₹{p.row.total_discount.toLocaleString("en-IN")}
        </Typography>
      ),
    },
    {
      field: "discount_pct",
      headerName: "Discount % of Gross",
      flex: 1,
      renderCell: (p: GridRenderCellParams<OfficerDiscountSummary>) => (
        <Chip
          label={`${p.row.discount_pct.toFixed(1)}%`}
          size="small"
          color={p.row.discount_pct > 15 ? "error" : p.row.discount_pct > 10 ? "warning" : "default"}
        />
      ),
    },
  ];

  return (
    <Box>
      {/* Top 4 KPI Cards */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderLeft: "4px solid #1976d2" }}>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                <Typography variant="body2" color="text.secondary" fontWeight={600}>
                  Gross Sales Booked
                </Typography>
                <GrossIcon color="primary" />
              </Box>
              <Typography variant="h5" fontWeight={700}>
                ₹{summary.gross_sales.toLocaleString("en-IN")}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderLeft: "4px solid #2e7d32" }}>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                <Typography variant="body2" color="text.secondary" fontWeight={600}>
                  Net Sales Realized
                </Typography>
                <NetIcon color="success" />
              </Box>
              <Typography variant="h5" fontWeight={700} color="success.main">
                ₹{summary.net_sales.toLocaleString("en-IN")}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderLeft: "4px solid #d32f2f" }}>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                <Typography variant="body2" color="text.secondary" fontWeight={600}>
                  Total Discounts Approved
                </Typography>
                <DiscountIcon color="error" />
              </Box>
              <Typography variant="h5" fontWeight={700} color="error.main">
                ₹{summary.total_discount.toLocaleString("en-IN")}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderLeft: "4px solid #ed6c02" }}>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                <Typography variant="body2" color="text.secondary" fontWeight={600}>
                  Average Discount %
                </Typography>
                <PercentIcon color="warning" />
              </Box>
              <Typography variant="h5" fontWeight={700} color="warning.main">
                {summary.avg_discount_pct.toFixed(1)}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Sub-A: Field Officer Discount Comparison Table */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} mb={2}>
            Field Officer Discount Comparison
          </Typography>
          <DataGrid
            rows={data?.by_officer ?? []}
            getRowId={(r) => r.fo_user_id}
            columns={officerColumns}
            loading={loading}
            autoHeight
            initialState={{ pagination: { paginationModel: { pageSize: 5 } } }}
            pageSizeOptions={[5, 10]}
            disableRowSelectionOnClick
            density="comfortable"
          />
        </CardContent>
      </Card>

      {/* Sub-B: Order-Wise Discount Ledger */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} mb={2}>
            Order-Wise Discount Ledger
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell width={50} />
                <TableCell>Order ID / Date</TableCell>
                <TableCell>Officer</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell align="right">Gross (₹)</TableCell>
                <TableCell align="right">Discount (₹)</TableCell>
                <TableCell align="right">Net (₹)</TableCell>
                <TableCell>Reason / Alert</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(data?.orders ?? []).map((order) => (
                <OrderRow key={order.order_id} order={order} />
              ))}
              {(data?.orders ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    <Typography variant="body2" color="text.secondary" py={3}>
                      No discounted orders found for the selected period.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Sub-C: Payment Receipts Audit Ledger */}
      <Card>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} mb={2}>
            Payment Receipts Audit Ledger
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Receipt ID</TableCell>
                <TableCell>Officer Name</TableCell>
                <TableCell>Customer Name</TableCell>
                <TableCell>Date</TableCell>
                <TableCell align="right">Amount (₹)</TableCell>
                <TableCell>Payment Mode</TableCell>
                <TableCell align="center">PDF Receipt</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {receipts.map((rec) => (
                <TableRow key={rec.receipt_id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{rec.receipt_id}</TableCell>
                  <TableCell>{rec.fo_name}</TableCell>
                  <TableCell>{rec.customer_name}</TableCell>
                  <TableCell>{rec.date}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: "success.main" }}>
                    ₹{rec.amount.toLocaleString("en-IN")}
                  </TableCell>
                  <TableCell>
                    <Chip label={rec.mode.toUpperCase()} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell align="center">
                    {rec.pdf_url ? (
                      <Tooltip title="Download Receipt PDF">
                        <IconButton
                          size="small"
                          color="primary"
                          component="a"
                          href={rec.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <PdfIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        N/A
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {receipts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <Typography variant="body2" color="text.secondary" py={3}>
                      No payment receipts logged for this period.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Box>
  );
}

