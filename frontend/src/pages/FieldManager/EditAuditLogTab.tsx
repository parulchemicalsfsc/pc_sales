/**
 * EditAuditLogTab.tsx
 * ──────────────────────────────────────────────────────────────────────────
 * Tab 5: Forensic Before/After Edit Audit Log
 * - Filter bar: Field Officer, Entity Type, Date Range
 * - Forensic Cards / Diff Viewer:
 *   - Header: Officer Name, Entity Type, Entity ID, Timestamp
 *   - Mandatory FO Reason Box (amber alert)
 *   - Side-by-side JSON comparison with red (old) and green (new) diff
 */

import { useState, useEffect } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  TextField,
  MenuItem,
  Chip,
  Alert,
  Paper,
  CircularProgress,
  Divider,
} from "@mui/material";
import {
  History as HistoryIcon,
  WarningAmber as WarningIcon,
  CompareArrows as DiffIcon,
} from "@mui/icons-material";
import { auraManagerAPI } from "../../services/auraApi";
import type { EditAuditLog } from "../../types/aura";

interface Props {
  selectedFoId: string | "all";
}

// ─── JSON Diff Row ────────────────────────────────────────────────────────────

function JsonDiffViewer({
  before,
  after,
}: {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}) {
  const allKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));

  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={6}>
        <Paper
          variant="outlined"
          sx={{
            p: 1.5,
            bgcolor: "rgba(211, 47, 47, 0.04)",
            borderColor: "error.light",
            borderRadius: 1,
            maxHeight: 280,
            overflowY: "auto",
          }}
        >
          <Typography variant="caption" fontWeight={700} color="error.main" display="block" mb={1}>
            BEFORE SNAPSHOT (Original)
          </Typography>
          <Box component="pre" sx={{ m: 0, fontSize: "0.78rem", fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
            {allKeys.map((key) => {
              const bVal = JSON.stringify(before[key]);
              const aVal = JSON.stringify(after[key]);
              const isDifferent = bVal !== aVal;
              return (
                <Box
                  key={key}
                  sx={{
                    bgcolor: isDifferent ? "rgba(211, 47, 47, 0.15)" : "transparent",
                    px: 0.5,
                    py: 0.2,
                    borderRadius: 0.5,
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{key}</span>: {bVal ?? "undefined"}
                </Box>
              );
            })}
          </Box>
        </Paper>
      </Grid>
      <Grid item xs={12} md={6}>
        <Paper
          variant="outlined"
          sx={{
            p: 1.5,
            bgcolor: "rgba(46, 125, 50, 0.04)",
            borderColor: "success.light",
            borderRadius: 1,
            maxHeight: 280,
            overflowY: "auto",
          }}
        >
          <Typography variant="caption" fontWeight={700} color="success.main" display="block" mb={1}>
            AFTER SNAPSHOT (Mutated)
          </Typography>
          <Box component="pre" sx={{ m: 0, fontSize: "0.78rem", fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
            {allKeys.map((key) => {
              const bVal = JSON.stringify(before[key]);
              const aVal = JSON.stringify(after[key]);
              const isDifferent = bVal !== aVal;
              return (
                <Box
                  key={key}
                  sx={{
                    bgcolor: isDifferent ? "rgba(46, 125, 50, 0.15)" : "transparent",
                    px: 0.5,
                    py: 0.2,
                    borderRadius: 0.5,
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{key}</span>: {aVal ?? "undefined"}
                </Box>
              );
            })}
          </Box>
        </Paper>
      </Grid>
    </Grid>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EditAuditLogTab({ selectedFoId }: Props) {
  const [logs, setLogs] = useState<EditAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      setError(null);
      try {
        const params: Record<string, string | undefined> = {
          fo_user_id: selectedFoId === "all" ? undefined : selectedFoId,
          entity_type: entityTypeFilter === "all" ? undefined : entityTypeFilter,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        };
        const res = await auraManagerAPI.getEditLogs(params);
        const data: EditAuditLog[] = res.data?.logs ?? res.data ?? [];
        setLogs(data);
      } catch (e: unknown) {
        const err = e as { message?: string };
        setError(err.message ?? "Failed to load audit logs");
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [selectedFoId, entityTypeFilter, dateFrom, dateTo]);

  const entityColorMap: Record<string, "primary" | "secondary" | "warning" | "info" | "default"> = {
    route_plan: "warning",
    order: "primary",
    receipt: "secondary",
    visit: "info",
  };

  return (
    <Box>
      {/* Filter Bar */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={4}>
              <TextField
                select
                label="Entity Type"
                value={entityTypeFilter}
                onChange={(e) => setEntityTypeFilter(e.target.value)}
                fullWidth
                size="small"
              >
                <MenuItem value="all">All Entities</MenuItem>
                <MenuItem value="route_plan">Route Plan</MenuItem>
                <MenuItem value="order">Sales Order</MenuItem>
                <MenuItem value="receipt">Payment Receipt</MenuItem>
                <MenuItem value="visit">Visit Details</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                label="From Date"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                label="To Date"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      ) : logs.length === 0 ? (
        <Alert severity="info">No edit audit records found matching the current filters.</Alert>
      ) : (
        <Box display="flex" flexDirection="column" gap={2}>
          {logs.map((log) => (
            <Card key={log.log_id} variant="outlined" sx={{ borderLeft: "4px solid #ed6c02" }}>
              <CardContent>
                {/* Header */}
                <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1} mb={1}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Chip
                      label={log.entity_type.replace("_", " ").toUpperCase()}
                      color={entityColorMap[log.entity_type] ?? "default"}
                      size="small"
                    />
                    <Typography variant="subtitle2" fontWeight={700}>
                      {log.fo_name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      (ID: {log.entity_id})
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(log.edited_at).toLocaleString()}
                  </Typography>
                </Box>

                {/* Mandatory FO Reason Alert Box */}
                <Alert
                  severity="warning"
                  icon={<WarningIcon fontSize="inherit" />}
                  sx={{
                    mb: 2,
                    bgcolor: "rgba(237, 108, 2, 0.08)",
                    border: "1px solid rgba(237, 108, 2, 0.3)",
                  }}
                >
                  <Typography variant="body2" fontWeight={600}>
                    Mandatory Field Officer Reason:
                  </Typography>
                  <Typography variant="body2" sx={{ fontStyle: "italic" }}>
                    &ldquo;{log.edit_reason}&rdquo;
                  </Typography>
                </Alert>

                {/* Diff Viewer */}
                <Box display="flex" alignItems="center" gap={0.5} mb={1}>
                  <DiffIcon fontSize="small" color="action" />
                  <Typography variant="caption" fontWeight={700} color="text.secondary" textTransform="uppercase">
                    Payload Comparison
                  </Typography>
                </Box>
                <JsonDiffViewer before={log.before_snapshot} after={log.after_snapshot} />
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
    </Box>
  );
}

