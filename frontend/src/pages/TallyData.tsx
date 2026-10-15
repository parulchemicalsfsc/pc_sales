import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  TextField,
  MenuItem,
  Button,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
  InputAdornment,
  CircularProgress,
  useTheme,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
} from "@mui/material";
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  FilterList as FilterListIcon,
  Clear as ClearIcon,
  ReceiptLong as ReceiptLongIcon,
  DeleteSweep as DeleteSweepIcon,
  Sync as SyncIcon,
  Visibility as VisibilityIcon,
  AccountBalanceWallet as WalletIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  ArrowForward as ArrowForwardIcon,
} from "@mui/icons-material";
import { DataGrid, GridColDef, GridRenderCellParams } from "@mui/x-data-grid";
import { tallyAPI } from "../services/api";
import type { TallyVoucher, TallyStats, TallyFilterOptions } from "../types";
import { TableSkeleton } from "../components/Skeletons";

export default function TallyData() {
  const theme = useTheme();

  // Stats state
  const [stats, setStats] = useState<TallyStats>({
    total_active: 0,
    total_deleted: 0,
    last_synced_at: null,
  });

  // Filter options state
  const [filterOptions, setFilterOptions] = useState<TallyFilterOptions>({
    voucher_types: [],
    customers: [],
  });

  // Filters state
  const [search, setSearch] = useState("");
  const [voucherType, setVoucherType] = useState<string>("");
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // View mode: 'all' | 'customer'
  const [viewMode, setViewMode] = useState<"all" | "customer">("all");

  // Grid / Data state
  const [vouchers, setVouchers] = useState<TallyVoucher[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [page, setPage] = useState(0); // 0-indexed for DataGrid
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Selected voucher dialog
  const [selectedVoucher, setSelectedVoucher] = useState<TallyVoucher | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Customer Breakdown State
  const [customerVouchers, setCustomerVouchers] = useState<TallyVoucher[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);

  // Load stats & filter options on mount
  const fetchMetadata = useCallback(async () => {
    try {
      const [statsData, optionsData] = await Promise.all([
        tallyAPI.getStats(),
        tallyAPI.getFilterOptions(),
      ]);
      setStats(statsData);
      setFilterOptions(optionsData);
    } catch (err) {
      console.error("Failed to load Tally metadata", err);
    }
  }, []);

  // Fetch paginated vouchers
  const fetchVouchers = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {
        page: page + 1, // 1-indexed for backend
        page_size: pageSize,
      };
      if (search.trim()) params.search = search.trim();
      if (voucherType) params.voucher_type = voucherType;
      if (selectedCustomer) params.customer = selectedCustomer;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const res = await tallyAPI.getVouchers(params);
      setVouchers(res.data || []);
      setTotalRows(res.total || 0);
    } catch (err) {
      console.error("Failed to fetch vouchers", err);
      setVouchers([]);
      setTotalRows(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, voucherType, selectedCustomer, dateFrom, dateTo]);

  // Fetch full customer statement for Customer Breakdown view
  const fetchCustomerBreakdown = useCallback(async (custName: string) => {
    if (!custName) {
      setCustomerVouchers([]);
      return;
    }
    setCustomerLoading(true);
    try {
      const res = await tallyAPI.getVouchers({
        customer: custName,
        page: 1,
        page_size: 200, // Load up to 200 for full statement view
      });
      setCustomerVouchers(res.data || []);
    } catch (err) {
      console.error("Failed to load customer breakdown", err);
      setCustomerVouchers([]);
    } finally {
      setCustomerLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  useEffect(() => {
    if (viewMode === "all") {
      fetchVouchers();
    }
  }, [fetchVouchers, viewMode]);

  useEffect(() => {
    if (viewMode === "customer" && selectedCustomer) {
      fetchCustomerBreakdown(selectedCustomer);
    }
  }, [viewMode, selectedCustomer, fetchCustomerBreakdown]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchMetadata(),
      viewMode === "all" ? fetchVouchers() : fetchCustomerBreakdown(selectedCustomer),
    ]);
    setRefreshing(false);
  };

  const handleResetFilters = () => {
    setSearch("");
    setVoucherType("");
    setSelectedCustomer("");
    setDateFrom("");
    setDateTo("");
    setPage(0);
  };

  // Helper for Voucher Type Color Chip
  const getVchTypeColor = (type?: string): "success" | "info" | "warning" | "secondary" | "error" | "default" => {
    if (!type) return "default";
    const lower = type.toLowerCase();
    if (lower.includes("sales")) return "success";
    if (lower.includes("receipt")) return "info";
    if (lower.includes("payment")) return "warning";
    if (lower.includes("contra")) return "secondary";
    if (lower.includes("purchase")) return "error";
    return "default";
  };

  // Format INR currency
  const formatINR = (val?: number) => {
    if (val === undefined || val === null) return "₹0.00";
    return `₹${Number(val).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  // Customer Breakdown Totals & Running Balance
  const customerSummary = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;

    // Vouchers sorted chronologically for statement
    const sorted = [...customerVouchers].sort((a, b) => {
      const d1 = a.date || "";
      const d2 = b.date || "";
      return d1.localeCompare(d2);
    });

    let runningBalance = 0;
    const withRunningBalance = sorted.map((v) => {
      const deb = Number(v.debit || 0);
      const cred = Number(v.credit || 0);
      totalDebit += deb;
      totalCredit += cred;
      runningBalance += deb - cred;
      return {
        ...v,
        running_balance: runningBalance,
      };
    });

    return {
      totalDebit,
      totalCredit,
      closingBalance: totalDebit - totalCredit,
      records: withRunningBalance,
    };
  }, [customerVouchers]);

  // Columns for DataGrid in "All Vouchers"
  const columns: GridColDef[] = useMemo(
    () => [
      {
        field: "date",
        headerName: "Date",
        width: 110,
        renderCell: (params: GridRenderCellParams) => (
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {params.value || "-"}
          </Typography>
        ),
      },
      {
        field: "voucher_no",
        headerName: "Vch No",
        width: 140,
        renderCell: (params: GridRenderCellParams) => (
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              fontFamily: "monospace",
              color: theme.palette.mode === "dark" ? "#90caf9" : "#1565c0",
            }}
          >
            {params.value || "-"}
          </Typography>
        ),
      },
      {
        field: "voucher_type",
        headerName: "Type",
        width: 120,
        renderCell: (params: GridRenderCellParams) => (
          <Chip
            label={params.value || "Other"}
            size="small"
            color={getVchTypeColor(params.value)}
            variant="outlined"
            sx={{ fontWeight: 600, textTransform: "capitalize" }}
          />
        ),
      },
      {
        field: "customer_name",
        headerName: "Customer / Party",
        flex: 1,
        minWidth: 180,
        renderCell: (params: GridRenderCellParams) => (
          <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
            {params.value || "-"}
          </Typography>
        ),
      },
      {
        field: "particulars",
        headerName: "Particulars",
        flex: 1,
        minWidth: 160,
        renderCell: (params: GridRenderCellParams) => (
          <Typography variant="body2" color="text.secondary" noWrap>
            {params.value || "-"}
          </Typography>
        ),
      },
      {
        field: "narration",
        headerName: "Narration / Items",
        flex: 1,
        minWidth: 200,
        renderCell: (params: GridRenderCellParams) => {
          const text = params.row.items_summary || params.row.narration || "-";
          return (
            <Tooltip title={text} arrow>
              <Typography variant="body2" color="text.secondary" noWrap>
                {text}
              </Typography>
            </Tooltip>
          );
        },
      },
      {
        field: "debit",
        headerName: "Debit (₹)",
        width: 120,
        align: "right",
        headerAlign: "right",
        renderCell: (params: GridRenderCellParams) => (
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              color: params.value > 0 ? "error.main" : "text.secondary",
            }}
          >
            {params.value > 0 ? formatINR(params.value) : "-"}
          </Typography>
        ),
      },
      {
        field: "credit",
        headerName: "Credit (₹)",
        width: 120,
        align: "right",
        headerAlign: "right",
        renderCell: (params: GridRenderCellParams) => (
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              color: params.value > 0 ? "success.main" : "text.secondary",
            }}
          >
            {params.value > 0 ? formatINR(params.value) : "-"}
          </Typography>
        ),
      },
      {
        field: "actions",
        headerName: "",
        width: 70,
        sortable: false,
        align: "center",
        renderCell: (params: GridRenderCellParams) => (
          <IconButton
            size="small"
            color="primary"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedVoucher(params.row as TallyVoucher);
              setDetailsOpen(true);
            }}
          >
            <VisibilityIcon fontSize="small" />
          </IconButton>
        ),
      },
    ],
    [theme.palette.mode]
  );

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, display: "flex", flexDirection: "column", gap: 3 }}>
      {/* Header & Stats Banner */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 1.5 }}>
            <ReceiptLongIcon sx={{ fontSize: 36, color: "primary.main" }} />
            Tally Data
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Synchronized financial accounting transactions and ledger statements from TallyPrime
          </Typography>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, val) => val && setViewMode(val)}
            size="small"
            color="primary"
          >
            <ToggleButton value="all" sx={{ px: 2, fontWeight: 600 }}>
              Master DB
            </ToggleButton>
            <ToggleButton value="customer" sx={{ px: 2, fontWeight: 600 }}>
              Ledger Breakdown
            </ToggleButton>
          </ToggleButtonGroup>

          <Button
            variant="outlined"
            startIcon={
              <RefreshIcon
                sx={{
                  animation: refreshing ? "spin 1s linear infinite" : "none",
                  "@keyframes spin": {
                    "0%": { transform: "rotate(0deg)" },
                    "100%": { transform: "rotate(360deg)" },
                  },
                }}
              />
            }
            onClick={handleRefresh}
            disabled={refreshing || loading}
            sx={{ textTransform: "none", fontWeight: 600 }}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={2}>
        <Grid item xs={12} sm={4}>
          <Card
            elevation={0}
            sx={{
              p: 2,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
              background:
                theme.palette.mode === "dark"
                  ? "linear-gradient(135deg, rgba(25,118,210,0.12) 0%, rgba(13,71,161,0.05) 100%)"
                  : "linear-gradient(135deg, rgba(227,242,253,0.8) 0%, rgba(255,255,255,0.9) 100%)",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Box
                sx={{
                  p: 1.2,
                  borderRadius: 1.5,
                  bgcolor: "primary.main",
                  color: "white",
                  display: "flex",
                }}
              >
                <ReceiptLongIcon />
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: "uppercase" }}>
                  Active Vouchers
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  {stats.total_active.toLocaleString()}
                </Typography>
              </Box>
            </Box>
          </Card>
        </Grid>

        <Grid item xs={12} sm={4}>
          <Card
            elevation={0}
            sx={{
              p: 2,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
              background:
                theme.palette.mode === "dark"
                  ? "linear-gradient(135deg, rgba(237,108,2,0.12) 0%, rgba(230,81,0,0.05) 100%)"
                  : "linear-gradient(135deg, rgba(255,243,224,0.8) 0%, rgba(255,255,255,0.9) 100%)",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Box
                sx={{
                  p: 1.2,
                  borderRadius: 1.5,
                  bgcolor: "warning.main",
                  color: "white",
                  display: "flex",
                }}
              >
                <DeleteSweepIcon />
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: "uppercase" }}>
                  Soft Deleted in Tally
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  {stats.total_deleted.toLocaleString()}
                </Typography>
              </Box>
            </Box>
          </Card>
        </Grid>

        <Grid item xs={12} sm={4}>
          <Card
            elevation={0}
            sx={{
              p: 2,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
              background:
                theme.palette.mode === "dark"
                  ? "linear-gradient(135deg, rgba(46,125,50,0.12) 0%, rgba(27,94,32,0.05) 100%)"
                  : "linear-gradient(135deg, rgba(232,245,233,0.8) 0%, rgba(255,255,255,0.9) 100%)",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Box
                sx={{
                  p: 1.2,
                  borderRadius: 1.5,
                  bgcolor: "success.main",
                  color: "white",
                  display: "flex",
                }}
              >
                <SyncIcon />
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: "uppercase" }}>
                  Last Synced At
                </Typography>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {stats.last_synced_at
                    ? new Date(stats.last_synced_at).toLocaleString()
                    : "Not yet synced"}
                </Typography>
              </Box>
            </Box>
          </Card>
        </Grid>
      </Grid>

      {/* Filter Toolbar */}
      <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
        <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
          <Grid container spacing={2} alignItems="center">
            {/* Search Input */}
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                fullWidth
                size="small"
                placeholder="Search voucher, party, items..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" color="action" />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>

            {/* Voucher Type Dropdown */}
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                select
                fullWidth
                size="small"
                label="Voucher Type"
                value={voucherType}
                onChange={(e) => {
                  setVoucherType(e.target.value);
                  setPage(0);
                }}
              >
                <MenuItem value="">
                  <em>All Types</em>
                </MenuItem>
                {filterOptions.voucher_types.map((t) => (
                  <MenuItem key={t} value={t}>
                    {t}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            {/* Customer Dropdown */}
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                select
                fullWidth
                size="small"
                label="Customer / Party"
                value={selectedCustomer}
                onChange={(e) => {
                  setSelectedCustomer(e.target.value);
                  setPage(0);
                }}
              >
                <MenuItem value="">
                  <em>All Customers</em>
                </MenuItem>
                {filterOptions.customers.map((c) => (
                  <MenuItem key={c} value={c}>
                    {c}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            {/* Date From */}
            <Grid item xs={6} sm={3} md={1.5}>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="From Date"
                InputLabelProps={{ shrink: true }}
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(0);
                }}
              />
            </Grid>

            {/* Date To */}
            <Grid item xs={6} sm={3} md={1.5}>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="To Date"
                InputLabelProps={{ shrink: true }}
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(0);
                }}
              />
            </Grid>

            {/* Clear Filters Button */}
            <Grid item xs={12} md={1} sx={{ display: "flex", justifyContent: "flex-end" }}>
              <Tooltip title="Reset Filters">
                <Button
                  variant="outlined"
                  color="inherit"
                  onClick={handleResetFilters}
                  sx={{ minWidth: 40, p: 1 }}
                >
                  <ClearIcon fontSize="small" />
                </Button>
              </Tooltip>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Main Content: Mode View */}
      {viewMode === "all" ? (
        <Card
          elevation={0}
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2,
            minHeight: 520,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Box sx={{ flex: 1, height: 600, width: "100%" }}>
            {loading && vouchers.length === 0 ? (
              <Box sx={{ p: 3 }}>
                <TableSkeleton rows={10} columns={7} />
              </Box>
            ) : (
              <DataGrid
                rows={vouchers}
                columns={columns}
                getRowId={(row) => row.id}
                rowCount={totalRows}
                loading={loading}
                paginationMode="server"
                paginationModel={{ page, pageSize }}
                onPaginationModelChange={(model) => {
                  setPage(model.page);
                  setPageSize(model.pageSize);
                }}
                pageSizeOptions={[25, 50, 100]}
                disableRowSelectionOnClick
                onRowClick={(params) => {
                  setSelectedVoucher(params.row as TallyVoucher);
                  setDetailsOpen(true);
                }}
                sx={{
                  border: "none",
                  "& .MuiDataGrid-row:hover": {
                    cursor: "pointer",
                  },
                }}
              />
            )}
          </Box>
        </Card>
      ) : (
        /* Customer Breakdown View */
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {/* Customer Summary Cards */}
          {selectedCustomer ? (
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 2,
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                  }}
                >
                  <TrendingDownIcon color="error" sx={{ fontSize: 32 }} />
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      TOTAL INVOICED (DEBIT)
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: "error.main" }}>
                      {formatINR(customerSummary.totalDebit)}
                    </Typography>
                  </Box>
                </Paper>
              </Grid>

              <Grid item xs={12} sm={4}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 2,
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                  }}
                >
                  <TrendingUpIcon color="success" sx={{ fontSize: 32 }} />
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      TOTAL RECEIVED (CREDIT)
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: "success.main" }}>
                      {formatINR(customerSummary.totalCredit)}
                    </Typography>
                  </Box>
                </Paper>
              </Grid>

              <Grid item xs={12} sm={4}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 2,
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                  }}
                >
                  <WalletIcon color="primary" sx={{ fontSize: 32 }} />
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      CLOSING BALANCE
                    </Typography>
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: 700,
                        color:
                          customerSummary.closingBalance >= 0
                            ? "error.main"
                            : "success.main",
                      }}
                    >
                      {formatINR(Math.abs(customerSummary.closingBalance))}{" "}
                      {customerSummary.closingBalance >= 0 ? "Dr" : "Cr"}
                    </Typography>
                  </Box>
                </Paper>
              </Grid>
            </Grid>
          ) : (
            <Paper
              elevation={0}
              sx={{
                p: 4,
                textAlign: "center",
                border: "1px dashed",
                borderColor: "divider",
                borderRadius: 2,
              }}
            >
              <Typography variant="subtitle1" color="text.secondary">
                Please select a Customer / Party from the dropdown above to view their chronological ledger statement.
              </Typography>
            </Paper>
          )}

          {/* Statement Table */}
          {selectedCustomer && (
            <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
              <TableContainer>
                {customerLoading ? (
                  <Box sx={{ p: 4 }}>
                    <TableSkeleton rows={8} columns={7} />
                  </Box>
                ) : (
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: "action.hover" }}>
                        <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Vch No</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Particulars</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">
                          Debit (₹)
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">
                          Credit (₹)
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">
                          Running Balance (₹)
                        </TableCell>
                        <TableCell align="center"></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {customerSummary.records.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} align="center" sx={{ py: 4, color: "text.secondary" }}>
                            No transactions found for this customer.
                          </TableCell>
                        </TableRow>
                      ) : (
                        customerSummary.records.map((row) => (
                          <TableRow
                            key={row.id}
                            hover
                            sx={{ cursor: "pointer" }}
                            onClick={() => {
                              setSelectedVoucher(row);
                              setDetailsOpen(true);
                            }}
                          >
                            <TableCell>{row.date || "-"}</TableCell>
                            <TableCell sx={{ fontFamily: "monospace", fontWeight: 600 }}>
                              {row.voucher_no || "-"}
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={row.voucher_type || "Other"}
                                size="small"
                                color={getVchTypeColor(row.voucher_type)}
                                variant="outlined"
                              />
                            </TableCell>
                            <TableCell>{row.particulars || "-"}</TableCell>
                            <TableCell align="right" sx={{ color: "error.main", fontWeight: 600 }}>
                              {row.debit > 0 ? formatINR(row.debit) : "-"}
                            </TableCell>
                            <TableCell align="right" sx={{ color: "success.main", fontWeight: 600 }}>
                              {row.credit > 0 ? formatINR(row.credit) : "-"}
                            </TableCell>
                            <TableCell
                              align="right"
                              sx={{
                                fontWeight: 700,
                                color: (row as any).running_balance >= 0 ? "error.main" : "success.main",
                              }}
                            >
                              {formatINR(Math.abs((row as any).running_balance))}{" "}
                              {(row as any).running_balance >= 0 ? "Dr" : "Cr"}
                            </TableCell>
                            <TableCell align="center">
                              <IconButton size="small">
                                <VisibilityIcon fontSize="small" />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                )}
              </TableContainer>
            </Card>
          )}
        </Box>
      )}

      {/* Voucher Detail Modal */}
      <Dialog
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <ReceiptLongIcon color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Voucher Details
            </Typography>
          </Box>
          {selectedVoucher && (
            <Chip
              label={selectedVoucher.voucher_type}
              color={getVchTypeColor(selectedVoucher.voucher_type)}
              size="small"
            />
          )}
        </DialogTitle>
        <DialogContent dividers>
          {selectedVoucher && (
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">
                  VOUCHER NO
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600, fontFamily: "monospace" }}>
                  {selectedVoucher.voucher_no || "-"}
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">
                  DATE
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {selectedVoucher.date || "-"}
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">
                  CUSTOMER / PARTY NAME
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {selectedVoucher.customer_name || "-"}
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">
                  PARTICULARS (CONTRA)
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {selectedVoucher.particulars || "-"}
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">
                  DEBIT AMOUNT
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 700, color: "error.main" }}>
                  {formatINR(selectedVoucher.debit)}
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">
                  CREDIT AMOUNT
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 700, color: "success.main" }}>
                  {formatINR(selectedVoucher.credit)}
                </Typography>
              </Grid>

              <Grid item xs={12}>
                <Divider sx={{ my: 1 }} />
              </Grid>

              <Grid item xs={12}>
                <Typography variant="caption" color="text.secondary">
                  NARRATION / DESCRIPTION
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {selectedVoucher.narration || "No narration provided."}
                </Typography>
              </Grid>

              {selectedVoucher.items_summary && (
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary">
                    ITEMS / ALLOCATION SUMMARY
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5, fontFamily: "monospace", bgcolor: "action.hover", p: 1, borderRadius: 1 }}>
                    {selectedVoucher.items_summary}
                  </Typography>
                </Grid>
              )}

              {selectedVoucher.extra_fields && Object.keys(selectedVoucher.extra_fields).length > 0 && (
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary">
                    EXTRA / CUSTOM TALLY FIELDS
                  </Typography>
                  <Box
                    component="pre"
                    sx={{
                      m: 0,
                      mt: 0.5,
                      p: 1.5,
                      bgcolor: "action.hover",
                      borderRadius: 1,
                      fontSize: 12,
                      fontFamily: "monospace",
                      overflowX: "auto",
                    }}
                  >
                    {JSON.stringify(selectedVoucher.extra_fields, null, 2)}
                  </Box>
                </Grid>
              )}

              <Grid item xs={12}>
                <Divider sx={{ my: 1 }} />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">
                  VOUCHER ID (TALLY MASTER ID)
                </Typography>
                <Typography variant="caption" display="block" sx={{ fontFamily: "monospace" }}>
                  {selectedVoucher.voucher_id}
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">
                  SYNCED AT / CONNECTOR
                </Typography>
                <Typography variant="caption" display="block">
                  {selectedVoucher.synced_at ? new Date(selectedVoucher.synced_at).toLocaleString() : "-"} (
                  {selectedVoucher.connector_version || "v1.0"})
                </Typography>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsOpen(false)} sx={{ fontWeight: 600 }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
