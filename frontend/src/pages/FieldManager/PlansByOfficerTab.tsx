/**
 * PlansByOfficerTab.tsx
 * ──────────────────────────────────────────────────────────────────────────
 * Tab: Plans by Field Officer with Customer Names
 * - Displays all route plans grouped by field officer
 * - Shows customer names, villages, planned times, and visit status
 * - Sorts by field officer name, then by planned sequence
 */

import React, { useState, useEffect } from "react";
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Chip,
  Button,
  Alert,
  Select,
  MenuItem,
  CircularProgress,
  TableContainer,
  Table,
  TableRow,
  TableCell,
  TableHead,
} from "@mui/material";
import { apiClient } from "../../services/api";
import { format } from "date-fns";

interface PlanStop {
  item_id: string;
  plan_id: string;
  assigned_officer_email: string;
  assigned_officer_name: string;
  sequence_order: number;
  planned_time: string;
  task_type: "order" | "collection" | "demo" | "followup";
  status: "pending" | "completed" | "skipped";
  actual_visit?: {
    visit_id: string;
    checked_in_at: string;
    checked_out_at?: string | null;
    duration_minutes?: number | null;
    notes?: string | null;
  } | null;
}

interface CustomerPlannedRoute {
  customer_id: string;
  customer_name: string;
  village?: string | null;
  taluka?: string | null;
  district?: string | null;
  contact_no?: string | null;
  planned_stops: PlanStop[];
}

interface Props {
  selectedDate: string; // "YYYY-MM-DD"
  selectedFoEmail: string | "all";
}

export default function PlansByOfficerTab({ selectedDate, selectedFoEmail }: Props) {
  const [plans, setPlans] = useState<CustomerPlannedRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPlans = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get("/api/v1/plans/by-customer", {
          params: {
            plan_date: selectedDate,
            user_email: selectedFoEmail === "all" ? undefined : selectedFoEmail,
          },
        });
        setPlans(res.data ?? []);
      } catch (e: unknown) {
        setError(
          e instanceof Error ? e.message : "Failed to fetch plans by customer"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchPlans();
  }, [selectedDate, selectedFoEmail]);

  // Filter plans by selected field officer if not "all"
  const displayedPlans =
    selectedFoEmail === "all"
      ? plans
      : plans.filter((p) =>
          p.planned_stops.some(
            (stop) => stop.assigned_officer_email === selectedFoEmail
          )
        );

  const officerNames = [
    ...new Set(
      displayedPlans.flatMap((p) =>
        p.planned_stops.map((s) => s.assigned_officer_name)
      )
    ),
  ];
  const sortedOfficerNames = officerNames.sort();

  return (
    <Box sx={{ p: 2 }}>
      {/* Header */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Plans by Field Officer — {selectedDate}
        </Typography>
        {error && (
          <Alert severity="error">{error}</Alert>
        )}
        {loading && <CircularProgress sx={{ mr: 1 }} />}
      </Box>

      {/* Officer Filter */}
      {selectedFoEmail !== "all" && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" color="text.secondary">
            Showing plans for: {selectedFoEmail}
          </Typography>
        </Box>
      )}

      {/* Plans Table */}
      {displayedPlans.length > 0 || sortedOfficerNames.length > 0 ? (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Field Officer</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell>Village</TableCell>
                <TableCell>Taluka</TableCell>
                <TableCell>District</TableCell>
                <TableCell>Planned Stops</TableCell>
                <TableCell>Total Planned</TableCell>
              </TableRow>
            </TableHead>

            {displayedPlans.map((plan, pIdx) => {
              const officerStops = plan.planned_stops;
              const officerName =
                officerStops[0]?.assigned_officer_name || "Unknown Officer";
              const totalStops = officerStops.length;
              const completedStops = officerStops.filter(
                (s) => s.status === "completed"
              ).length;
              const pendingStops = officerStops.filter(
                (s) => s.status === "pending"
              ).length;

              return (
                <TableRow key={pIdx} sx={{ height: 120 }}>
                  <TableCell component="td" sx={{ fontWeight: 500 }}>
                    {officerName}
                  </TableCell>
                  <TableCell>{plan.customer_name}</TableCell>
                  <TableCell>{plan.village || "-"}</TableCell>
                  <TableCell>{plan.taluka || "-"}</TableCell>
                  <TableCell>{plan.district || "-"}</TableCell>
                  <TableCell>
                    <Box display="flex" flexWrap="wrap" gap={1}>
                      {officerStops.map((stop, sIdx) => {
                        const statusColor =
                          stop.status === "completed"
                            ? "success"
                            : stop.status === "pending"
                            ? "warning"
                            : "error";
                        return (
                          <Chip
                            key={sIdx}
                            label={stop.task_type}
                            size="small"
                            variant={statusColor === "error" ? "outlined" : "filled"}
                            color={statusColor}
                          />
                        );
                      })}
                    </Box>
                  </TableCell>
                  <TableCell>{totalStops}</TableCell>
                  <TableCell>
                    <Box display="flex" alignItems="center" gap={2}>
                      <Typography variant="body2" fontWeight={600}>
                        {completedStops} / {totalStops}
                      </Typography>
                      {totalStops > 0 && (
                        <CircularProgress
                          size="small"
                          value={
                            totalStops > 0
                              ? (completedStops / totalStops) * 100
                              : 0
                          }
                        />
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
          </Table>
        </TableContainer>
      ) : (
        <Box sx={{ py: 4, textAlign: "center", color: "text.secondary" }}>
          No plans found for {selectedDate}.{" "}
          {selectedFoEmail !== "all" && (
            <span>for field officer {selectedFoEmail}</span>
          )}
        </Box>
      )}
    </Box>
  );
}