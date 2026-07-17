import React from "react";
import {
  Box,
  Card,
  CardContent,
  Chip,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useTheme,
} from "@mui/material";

// We keep fmtCurrency internal to this component or assume caller formats it.
// Actually, since revenue requires currency formatting, let's format it here.
const fmtCurrency = (val: number) => `₹${val.toLocaleString("en-IN")}`;

export interface DimensionRow {
  rank: number;
  label: string;
  secondary_label?: string;
  orders: number;
  revenue: number;
  liters: number;
  pct: number;
}

export function DimensionTable({
  title,
  icon,
  rows,
  loading,
  colLabel,
  colSub,
  showLitersAs,
  mode = "sales",
}: {
  title: string;
  icon: React.ReactNode;
  rows: DimensionRow[];
  loading: boolean;
  colLabel: string;
  colSub?: string;
  showLitersAs?: "liters" | "qty";
  mode?: "sales" | "telecaller";
}) {
  const theme = useTheme();

  return (
    <Card sx={{ height: "100%" }}>
      <CardContent sx={{ p: 0 }}>
        <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "center", gap: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
          <Box sx={{ color: "primary.main" }}>{icon}</Box>
          <Typography variant="h6" sx={{ fontWeight: 700, fontSize: "0.95rem" }}>
            {title}
          </Typography>
          <Chip label={rows.length} size="small" sx={{ ml: "auto" }} />
        </Box>
        
        {loading ? (
          <Box sx={{ p: 2 }}>
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} height={40} sx={{ mb: 0.5 }} />
            ))}
          </Box>
        ) : rows.length === 0 ? (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography color="text.secondary" variant="body2">No data for selected filters</Typography>
          </Box>
        ) : (
          <TableContainer sx={{ maxHeight: 340 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, width: 36 }}>#</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{colLabel}</TableCell>
                  {colSub && <TableCell sx={{ fontWeight: 700, display: { xs: "none", sm: "table-cell" } }}>{colSub}</TableCell>}
                  <TableCell sx={{ fontWeight: 700 }} align="right">{mode === "telecaller" ? "Total Calls" : "Orders"}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">{mode === "telecaller" ? "Connected" : "Revenue"}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">{mode === "telecaller" ? "Orders" : (showLitersAs === "qty" ? "Qty" : "Liters")}</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 80 }} align="right">{mode === "telecaller" ? "Conv %" : "Share"}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.rank}
                    hover
                    sx={{ "&:nth-of-type(even)": { bgcolor: "action.hover" } }}
                  >
                    <TableCell>
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 700,
                          color: row.rank <= 3 ? "warning.main" : "text.secondary",
                        }}
                      >
                        {row.rank}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {row.label}
                      </Typography>
                      {row.secondary_label && colSub === undefined && (
                        <Typography variant="caption" color="text.secondary">
                          {row.secondary_label}
                        </Typography>
                      )}
                    </TableCell>
                    {colSub && (
                      <TableCell sx={{ display: { xs: "none", sm: "table-cell" } }}>
                        <Typography variant="caption" color="text.secondary">
                          {row.secondary_label || "—"}
                        </Typography>
                      </TableCell>
                    )}
                    <TableCell align="right">
                      <Typography variant="body2">{row.orders}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontWeight: 600, color: mode === "telecaller" ? "info.main" : "success.main" }}>
                        {mode === "telecaller" ? row.revenue : fmtCurrency(row.revenue)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">{row.liters}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {row.pct}%
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>
  );
}
