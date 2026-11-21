/**
 * RouteAuditTab.tsx
 * ──────────────────────────────────────────────────────────────────────────
 * Tab 2: Date-Wise Planned vs. Executed Route Audit & Live GPS Map
 *
 * Strictly Date-Wise (No Session Dependency):
 * - Evaluates route plan destinations (Villages A, B, C) for the selected date.
 * - Matches actual check-in & check-out locations and villages tracked on that date.
 * - Computes a live execution score (e.g. "Completed 2/3 Destinations Today (67%)").
 * - Displays the full day's GPS trail, check-in pins, check-out pins, and execution sequence.
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
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Paper,
  Divider,
  Stack,
  Tooltip,
  LinearProgress,
} from "@mui/material";
import {
  AddLocationAlt as InjectIcon,
  WarningAmber as WarningIcon,
  CheckCircle as SuccessIcon,
  Cancel as MissedIcon,
  AccessTime as PendingIcon,
  Place as PlaceIcon,
  PlayCircleFilledWhite as StartPointIcon,
  Flag as EndPointIcon,
  Score as ScoreIcon,
  CalendarToday as CalendarIcon,
  Person as PersonIcon,
  AltRoute as RouteIcon,
  GpsFixed as GpsTrackedIcon,
  PictureAsPdf as PdfIcon,
} from "@mui/icons-material";
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip as LeafletTooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { auraManagerAPI, isUUID, type InjectStopPayload } from "../../services/auraApi";
import type { RouteAudit, RoutePlanItem, ActualVisitStop, LocationPoint, FieldOfficerItem } from "../../types/aura";
import OfficerReportModal from "../../components/reports/OfficerReportModal";

interface Props {
  selectedFoEmail: string | "all";
  selectedDate: string; // "YYYY-MM-DD"
  officers?: FieldOfficerItem[];
}

// ─── Distance Calculation (Haversine formula in meters) ────────────────────────

function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ─── Custom Leaflet Pin Icons ─────────────────────────────────────────────────

const createPlannedIcon = (num: number) =>
  L.divIcon({
    className: "planned-pin",
    html: `<div style="background-color:#1976d2;color:#ffffff;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.35);">${num}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });

const createCheckinIcon = () =>
  L.divIcon({
    className: "checkin-pin",
    html: `<div style="background-color:#2e7d32;color:#ffffff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.35);">✓</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

const createCheckoutIcon = (isDrift: boolean) =>
  L.divIcon({
    className: "checkout-pin",
    html: `<div style="background-color:${isDrift ? "#d32f2f" : "#ed6c02"};color:#ffffff;border-radius:50%;width:18px;height:18px;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.35);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

function RecenterMap({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RouteAuditTab({ selectedFoEmail, selectedDate, officers: propOfficers }: Props) {
  const [audit, setAudit] = useState<RouteAudit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Officers list
  const [officers, setOfficers] = useState<FieldOfficerItem[]>(propOfficers || []);

  // Inject Stop Dialog State
  const [injectDialogOpen, setInjectDialogOpen] = useState(false);
  const [injectForm, setInjectForm] = useState<InjectStopPayload>({
    fo_user_id: "",
    date: selectedDate,
    customer_id: "",
    customer_name: "",
    village: "",
    taluka: "",
    notes: "",
  });
  const [injectLoading, setInjectLoading] = useState(false);
  const [injectSuccess, setInjectSuccess] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);

  // 1. Sync officers if passed as prop, otherwise fetch from AURA
  useEffect(() => {
    if (propOfficers && propOfficers.length > 0) {
      setOfficers(propOfficers);
    } else {
      auraManagerAPI
        .getOfficersList()
        .then((res) => {
          const list = res.data?.field_officers || [];
          setOfficers(list);
        })
        .catch(() => { });
    }
  }, [propOfficers]);

  const effectiveEmail =
    selectedFoEmail === "all"
      ? officers[0]?.email || officers[0]?.user_id || "yashdave182@gmail.com"
      : selectedFoEmail;

  const currentOfficer = officers.find(
    (o) =>
      (o.email && o.email.toLowerCase() === effectiveEmail.toLowerCase()) ||
      (o.user_id && o.user_id.toLowerCase() === effectiveEmail.toLowerCase())
  );

  const targetIdentifier = currentOfficer?.email || currentOfficer?.user_id || effectiveEmail;

  // 2. Fetch route audit & GPS points strictly Date-Wise
  useEffect(() => {
    if (!targetIdentifier) return;

    let isCurrent = true;

    const fetchAudit = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await auraManagerAPI.getRouteAudit({
          fo_user_id: targetIdentifier,
          user_email: currentOfficer?.email || (effectiveEmail.includes("@") ? effectiveEmail : undefined),
          date: selectedDate,
        });
        if (isCurrent) {
          setAudit(res.data?.audit ?? null);
        }
      } catch (e: unknown) {
        if (isCurrent) {
          const err = e as { message?: string };
          setError(err.message ?? "Failed to load route audit");
        }
      } finally {
        if (isCurrent) {
          setLoading(false);
        }
      }
    };

    fetchAudit();

    return () => {
      isCurrent = false;
    };
  }, [targetIdentifier, selectedDate, currentOfficer?.email, effectiveEmail]);

  // Handle Inject Stop
  const handleInjectSubmit = async () => {
    setInjectLoading(true);
    try {
      await auraManagerAPI.injectStop({
        ...injectForm,
        fo_user_id: currentOfficer?.email || effectiveEmail,
        date: selectedDate,
        source: "manager_assigned",
      });
      setInjectSuccess(true);
      setTimeout(() => {
        setInjectDialogOpen(false);
        setInjectSuccess(false);
      }, 1200);

      // Reload route audit for date
      const res = await auraManagerAPI.getRouteAudit({
        fo_user_id: targetIdentifier,
        user_email: currentOfficer?.email || (effectiveEmail.includes("@") ? effectiveEmail : undefined),
        date: selectedDate,
      });
      setAudit(res.data?.audit ?? null);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to inject stop");
    } finally {
      setInjectLoading(false);
    }
  };

  // Metrics computation
  const plannedStops = audit?.planned_stops ?? [];
  const actualStops = audit?.actual_stops ?? [];
  const locationPoints = audit?.location_points ?? [];

  const totalPlanned = plannedStops.length;
  const completedPlannedStops = plannedStops.filter((p) => p.status === "completed");
  const completedCount = completedPlannedStops.length;
  const pendingCount = plannedStops.filter((p) => p.status === "pending").length;
  const missedCount = plannedStops.filter((p) => p.status === "skipped").length;

  const adhocStops = actualStops.filter((a) => a.status === "adhoc" || a.is_unplanned);

  const completionPct =
    totalPlanned > 0
      ? Math.round((completedCount / totalPlanned) * 100)
      : actualStops.length > 0
        ? 100
        : 0;

  // Calculate default map center
  const defaultCenter: [number, number] = [22.3072, 73.1812]; // Vadodara, Gujarat center
  const mapCenter: [number, number] =
    locationPoints.length > 0
      ? [locationPoints[0].lat, locationPoints[0].lng]
      : actualStops.length > 0 && actualStops[0].checkin_lat
        ? [actualStops[0].checkin_lat, actualStops[0].checkin_lng]
        : defaultCenter;

  const polylinePositions: [number, number][] =
    locationPoints.map((p) => [p.lat, p.lng]);

  const formattedDate = (() => {
    try {
      const parts = selectedDate.split("-");
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return d.toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return selectedDate;
    }
  })();

  const isPastDate = selectedDate < new Date().toISOString().slice(0, 10);

  return (
    <Box>
      {selectedFoEmail === "all" && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Viewing Date-Wise route audit for <strong>{currentOfficer?.name || effectiveEmail}</strong>. Select any specific officer from the top bar to inspect their route execution.
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* ── Officer & Date Execution Summary Header ──────────────────────── */}
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          mb: 2.5,
          borderRadius: 2,
          background: "linear-gradient(135deg, rgba(25,118,210,0.04) 0%, rgba(46,125,50,0.04) 100%)",
        }}
      >
        <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
          <Box display="flex" alignItems="center" gap={1.5} flexWrap="wrap">
            <Box display="flex" alignItems="center" gap={0.8}>
              <PersonIcon color="primary" />
              <Typography variant="subtitle1" fontWeight={700}>
                {currentOfficer?.name || effectiveEmail}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                ({currentOfficer?.email || effectiveEmail})
              </Typography>
            </Box>
            <Divider orientation="vertical" flexItem sx={{ height: 20, my: "auto" }} />
            <Box display="flex" alignItems="center" gap={0.8}>
              <CalendarIcon color="action" fontSize="small" />
              <Typography variant="body2" fontWeight={600}>
                {formattedDate}
              </Typography>
            </Box>
          </Box>

          <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
            <Chip
              label={totalPlanned > 0 ? `Plan: ${audit?.plan_status?.toUpperCase() || "SUBMITTED"}` : "No Route Plan"}
              color={totalPlanned > 0 ? (audit?.plan_status === "locked" ? "success" : "primary") : "default"}
              size="small"
              variant="outlined"
            />
            {audit?.is_edited && (
              <Chip
                label={`Rev #${audit.edit_revision_number ?? 2} - Edited`}
                color="warning"
                size="small"
              />
            )}
            <Button
              variant="outlined"
              size="small"
              startIcon={<PdfIcon />}
              onClick={() => setReportModalOpen(true)}
              sx={{ textTransform: "none", fontWeight: 600 }}
            >
              Download Report
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={<InjectIcon />}
              onClick={() => {
                setInjectForm({
                  fo_user_id: currentOfficer?.email || effectiveEmail,
                  date: selectedDate,
                  customer_id: "",
                  customer_name: "",
                  village: "",
                  taluka: "",
                  notes: "",
                });
                setInjectDialogOpen(true);
              }}
              sx={{ textTransform: "none", fontWeight: 600 }}
            >
              + Inject Stop
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* Amber Alert Box if plan was edited */}
      {audit?.is_edited && (
        <Alert
          severity="warning"
          icon={<WarningIcon fontSize="inherit" />}
          sx={{
            mb: 2.5,
            bgcolor: "rgba(237, 108, 2, 0.08)",
            border: "1px solid rgba(237, 108, 2, 0.35)",
            borderRadius: 2,
          }}
        >
          <Typography variant="body2" fontWeight={700}>
            Route Plan Edited by FO {audit.edited_at ? `at ${new Date(audit.edited_at).toLocaleTimeString()}` : ""}
          </Typography>
          <Typography variant="caption" display="block">
            Reason: &ldquo;{audit.edit_reason || "No reason specified"}&rdquo;
          </Typography>
        </Alert>
      )}

      <Grid container spacing={2.5}>
        {/* ── Left Pane: Route Execution Score & Stops Timeline (40% width) ──── */}
        <Grid item xs={12} md={5}>
          <Stack spacing={2.5}>
            {/* 1. Date-Wise Route Execution Score Card */}
            <Card sx={{ borderRadius: 2, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <CardContent sx={{ p: 2.5 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <ScoreIcon sx={{ color: "primary.main" }} />
                    <Typography variant="subtitle2" fontWeight={800} textTransform="uppercase" color="text.secondary">
                      Daily Route Execution Score
                    </Typography>
                  </Box>
                  <Chip
                    label={`${completionPct}% Completed`}
                    color={completionPct === 100 ? "success" : completionPct > 0 ? "primary" : "default"}
                    size="small"
                    sx={{ fontWeight: 700 }}
                  />
                </Box>

                {totalPlanned > 0 ? (
                  <Box>
                    <Typography variant="h5" fontWeight={800} color={completedCount === totalPlanned ? "success.main" : "text.primary"}>
                      {completedCount} / {totalPlanned} Destinations Completed
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
                      Officer completed {completedCount} of {totalPlanned} planned destination villages on {formattedDate}.
                    </Typography>

                    <LinearProgress
                      variant="determinate"
                      value={completionPct}
                      sx={{
                        height: 10,
                        borderRadius: 5,
                        mb: 2,
                        bgcolor: "grey.200",
                        "& .MuiLinearProgress-bar": {
                          borderRadius: 5,
                          bgcolor: completionPct === 100 ? "#2e7d32" : "#1976d2",
                        },
                      }}
                    />

                    {/* Metric Pills */}
                    <Box display="flex" gap={1} flexWrap="wrap">
                      <Chip
                        icon={<SuccessIcon sx={{ fontSize: "14px !important" }} />}
                        label={`${completedCount} Completed`}
                        color="success"
                        size="small"
                        sx={{ fontWeight: 600 }}
                      />
                      {pendingCount > 0 && !isPastDate && (
                        <Chip
                          icon={<PendingIcon sx={{ fontSize: "14px !important" }} />}
                          label={`${pendingCount} Pending`}
                          color="info"
                          size="small"
                          sx={{ fontWeight: 600 }}
                        />
                      )}
                      {missedCount > 0 && (
                        <Chip
                          icon={<MissedIcon sx={{ fontSize: "14px !important" }} />}
                          label={`${missedCount} Missed`}
                          color="error"
                          size="small"
                          sx={{ fontWeight: 600 }}
                        />
                      )}
                      {adhocStops.length > 0 && (
                        <Chip
                          label={`+ ${adhocStops.length} Ad-Hoc`}
                          size="small"
                          sx={{ bgcolor: "#9c27b0", color: "white", fontWeight: 600 }}
                        />
                      )}
                      <Chip
                        label={`${locationPoints.length} GPS Points`}
                        size="small"
                        variant="outlined"
                        sx={{ fontWeight: 500 }}
                      />
                    </Box>
                  </Box>
                ) : (
                  <Box>
                    <Typography variant="h6" fontWeight={700}>
                      {actualStops.length} Field Visits Recorded
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
                      No planned route plan was submitted for this officer on {formattedDate}.
                    </Typography>
                    <Box display="flex" gap={1} flexWrap="wrap">
                      <Chip
                        label={`${actualStops.length} Visits Tracked`}
                        color={actualStops.length > 0 ? "success" : "default"}
                        size="small"
                        sx={{ fontWeight: 600 }}
                      />
                      <Chip
                        label={`${locationPoints.length} GPS Points Tracked`}
                        size="small"
                        variant="outlined"
                        sx={{ fontWeight: 500 }}
                      />
                    </Box>
                  </Box>
                )}
              </CardContent>
            </Card>

            {/* 2. Stops Execution Sequence Card */}
            <Card sx={{ borderRadius: 2, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <CardContent sx={{ p: 2.5 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <RouteIcon sx={{ color: "primary.main" }} />
                    <Typography variant="subtitle2" fontWeight={800} textTransform="uppercase" color="text.secondary">
                      Destinations &amp; Visits Execution
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {formattedDate}
                  </Typography>
                </Box>

                {loading ? (
                  <Box display="flex" justifyContent="center" py={5}>
                    <CircularProgress size={32} />
                  </Box>
                ) : (
                  <Stack spacing={2}>
                    {/* Planned Stops List */}
                    {plannedStops.map((planned) => {
                      const actualMatch = actualStops.find(
                        (a) =>
                          a.matched_planned_stop_number === planned.stop_number ||
                          (a.customer_id && a.customer_id === planned.customer_id) ||
                          (planned.village &&
                            a.village &&
                            (a.village.toLowerCase().includes(planned.village.toLowerCase()) ||
                              planned.village.toLowerCase().includes(a.village.toLowerCase())))
                      );

                      const isDone = planned.status === "completed" || Boolean(actualMatch);
                      const destinationVillage = planned.village_name || planned.village || "";

                      return (
                        <Paper
                          key={planned.customer_id || planned.stop_number}
                          variant="outlined"
                          sx={{
                            p: 2,
                            borderRadius: 1.5,
                            borderLeft: "5px solid",
                            borderLeftColor: isDone
                              ? "success.main"
                              : isPastDate
                                ? "error.main"
                                : "primary.main",
                            bgcolor: isDone ? "rgba(46,125,50,0.02)" : "background.paper",
                          }}
                        >
                          <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={1}>
                            <Box display="flex" alignItems="flex-start" gap={1.2}>
                              <Box
                                sx={{
                                  width: 26,
                                  height: 26,
                                  borderRadius: "50%",
                                  bgcolor: isDone ? "success.main" : "primary.main",
                                  color: "white",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontWeight: 800,
                                  fontSize: "12px",
                                  flexShrink: 0,
                                  mt: 0.2,
                                }}
                              >
                                {planned.stop_number}
                              </Box>

                              <Box>
                                <Typography variant="subtitle2" fontWeight={700}>
                                  {destinationVillage ? `Village: ${destinationVillage}` : planned.customer_name}
                                </Typography>
                                {planned.customer_name && destinationVillage && (
                                  <Typography variant="caption" color="text.secondary" display="block">
                                    Customer: {planned.customer_name}
                                  </Typography>
                                )}
                                <Box display="flex" alignItems="center" gap={0.5} mt={0.3}>
                                  <PlaceIcon sx={{ fontSize: 13, color: "error.main" }} />
                                  <Typography variant="caption" color="text.secondary">
                                    {planned.taluka ? `${planned.taluka} · ` : ""}Planned: {planned.planned_time || "09:00"}
                                  </Typography>
                                </Box>
                              </Box>
                            </Box>

                            {/* Status Chip */}
                            {isDone ? (
                              <Chip
                                icon={<SuccessIcon sx={{ fontSize: "15px !important" }} />}
                                label="Completed"
                                color="success"
                                size="small"
                                sx={{ fontWeight: 700, fontSize: "11px" }}
                              />
                            ) : isPastDate ? (
                              <Chip
                                icon={<MissedIcon sx={{ fontSize: "15px !important" }} />}
                                label="Missed"
                                color="error"
                                size="small"
                                variant="outlined"
                                sx={{ fontWeight: 600, fontSize: "11px" }}
                              />
                            ) : (
                              <Chip
                                icon={<PendingIcon sx={{ fontSize: "15px !important" }} />}
                                label="Pending"
                                color="info"
                                size="small"
                                variant="outlined"
                                sx={{ fontWeight: 600, fontSize: "11px" }}
                              />
                            )}
                          </Box>

                          {/* Verification & Execution details */}
                          {actualMatch && (
                            <Box
                              mt={1.5}
                              pt={1.2}
                              borderTop="1px dashed"
                              borderColor="divider"
                              sx={{
                                bgcolor: "rgba(46,125,50,0.05)",
                                p: 1,
                                borderRadius: 1,
                              }}
                            >
                              <Typography variant="caption" fontWeight={600} color="success.dark" display="block">
                                ✓ Location Verified · Checked in at {new Date(actualMatch.checkin_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                {actualMatch.checkout_time
                                  ? ` - ${new Date(actualMatch.checkout_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} (${actualMatch.duration_minutes ?? 0}m)`
                                  : " (Active)"}
                              </Typography>
                              {(actualMatch.checkin_location || actualMatch.checkin_village_name || actualMatch.village) && (
                                <Typography variant="caption" color="text.secondary" display="block">
                                  Tracked Place: {actualMatch.checkin_location || actualMatch.checkin_village_name || actualMatch.village}
                                </Typography>
                              )}
                              {actualMatch.notes && (
                                <Typography variant="caption" color="text.secondary" display="block" fontStyle="italic">
                                  Notes: &ldquo;{actualMatch.notes}&rdquo;
                                </Typography>
                              )}
                            </Box>
                          )}
                        </Paper>
                      );
                    })}

                    {/* Ad-Hoc / Additional Visits */}
                    {adhocStops.length > 0 && (
                      <Box mt={2}>
                        <Typography
                          variant="caption"
                          fontWeight={800}
                          textTransform="uppercase"
                          color="secondary.main"
                          display="block"
                          mb={1}
                        >
                          Additional / Ad-Hoc Visits ({adhocStops.length})
                        </Typography>

                        <Stack spacing={1.5}>
                          {adhocStops.map((adhoc, idx) => (
                            <Paper
                              key={adhoc.visit_id || adhoc.customer_id || idx}
                              variant="outlined"
                              sx={{
                                p: 1.5,
                                borderRadius: 1.5,
                                borderLeft: "5px solid #9c27b0",
                                bgcolor: "rgba(156, 39, 176, 0.04)",
                              }}
                            >
                              <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                                <Box>
                                  <Typography variant="body2" fontWeight={700}>
                                    {adhoc.customer_name}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary" display="block">
                                    {adhoc.checkin_location || adhoc.checkin_village_name || adhoc.village || "Location Tracked"}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    Checked In: {new Date(adhoc.checkin_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                    {adhoc.checkout_time ? ` · ${adhoc.duration_minutes ?? 0} mins` : " (Active)"}
                                  </Typography>
                                </Box>
                                <Chip
                                  label="Ad-Hoc Visit"
                                  size="small"
                                  sx={{
                                    bgcolor: "#9c27b0",
                                    color: "white",
                                    fontWeight: 700,
                                    fontSize: "10px",
                                    height: "22px",
                                  }}
                                />
                              </Box>
                            </Paper>
                          ))}
                        </Stack>
                      </Box>
                    )}

                    {/* Empty State */}
                    {plannedStops.length === 0 && actualStops.length === 0 && (
                      <Box textAlign="center" py={4}>
                        <Typography variant="body2" color="text.secondary" mb={2}>
                          No route plan or field visits recorded for <strong>{currentOfficer?.name || effectiveEmail}</strong> on <strong>{formattedDate}</strong>.
                        </Typography>
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<InjectIcon />}
                          onClick={() => {
                            setInjectForm({
                              fo_user_id: currentOfficer?.email || effectiveEmail,
                              date: selectedDate,
                              customer_id: "",
                              customer_name: "",
                              village: "",
                              taluka: "",
                              notes: "",
                            });
                            setInjectDialogOpen(true);
                          }}
                        >
                          + Assign Planned Destination
                        </Button>
                      </Box>
                    )}
                  </Stack>
                )}
              </CardContent>
            </Card>
          </Stack>
        </Grid>

        {/* ── Right Pane: Live Leaflet Route & Geofence Map (60% width) ───── */}
        <Grid item xs={12} md={7}>
          <Card sx={{ height: "100%", minHeight: 600, display: "flex", flexDirection: "column", borderRadius: 2, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <CardContent sx={{ p: 1.5, flex: 1, display: "flex", flexDirection: "column" }}>
              <Box display="flex" justifyContent="space-between" alignItems="center" px={1} py={0.8} flexWrap="wrap" gap={1}>
                <Box>
                  <Typography variant="subtitle2" fontWeight={800}>
                    Date Route &amp; Geofence Verification Map
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formattedDate} · {locationPoints.length} GPS trace points · {actualStops.length} recorded visits
                  </Typography>
                </Box>
                <Box display="flex" gap={0.8} flexWrap="wrap">
                  <Chip size="small" label="Blue: Planned Destination" sx={{ bgcolor: "#1976d2", color: "white", fontSize: "11px", height: "22px" }} />
                  <Chip size="small" label="Green: Check-In" sx={{ bgcolor: "#2e7d32", color: "white", fontSize: "11px", height: "22px" }} />
                  <Chip size="small" label="Orange: Check-Out" sx={{ bgcolor: "#ed6c02", color: "white", fontSize: "11px", height: "22px" }} />
                </Box>
              </Box>

              <Box sx={{ flex: 1, minHeight: 520, borderRadius: 2, overflow: "hidden", mt: 1 }}>
                <MapContainer
                  center={mapCenter}
                  zoom={12}
                  style={{ height: "100%", minHeight: "520px", width: "100%" }}
                >
                  <RecenterMap center={mapCenter} />
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />

                  {/* Polyline Breadcrumb Trail for the Date */}
                  {polylinePositions.length > 1 && (
                    <Polyline
                      positions={polylinePositions}
                      color="#1976d2"
                      weight={4}
                      opacity={0.7}
                      dashArray="4, 6"
                    />
                  )}

                  {/* Planned Destination Pins */}
                  {plannedStops.map((planned) => {
                    if (!planned.lat || !planned.lng) return null;
                    return (
                      <Marker
                        key={`planned-${planned.customer_id || planned.stop_number}`}
                        position={[planned.lat, planned.lng]}
                        icon={createPlannedIcon(planned.stop_number)}
                      >
                        <LeafletTooltip direction="top" offset={[0, -14]} opacity={0.95}>
                          <div style={{ fontWeight: 700, fontSize: "12px" }}>
                            Stop #{planned.stop_number}: {planned.village_name || planned.village || planned.customer_name}
                          </div>
                          <div style={{ fontSize: "11px", color: "#444" }}>
                            Planned Time: {planned.planned_time || "09:00"}
                          </div>
                          <div style={{ fontSize: "10px", color: planned.status === "completed" ? "#2e7d32" : "#1976d2", fontWeight: 700 }}>
                            Status: {planned.status.toUpperCase()}
                          </div>
                        </LeafletTooltip>
                        <Popup>
                          <Typography variant="subtitle2" fontWeight={700}>
                            Stop #{planned.stop_number}: {planned.village_name || planned.village || planned.customer_name}
                          </Typography>
                          <Typography variant="caption" display="block">
                            Planned Time: {planned.planned_time || "09:00"} · {planned.taluka || ""}
                          </Typography>
                          <Typography variant="caption" color={planned.status === "completed" ? "success.main" : "text.secondary"}>
                            Status: {planned.status.toUpperCase()}
                          </Typography>
                        </Popup>
                      </Marker>
                    );
                  })}

                  {/* Actual Check-In and Check-Out Pins */}
                  {actualStops.map((actual) => {
                    if (!actual.checkin_lat || !actual.checkin_lng) return null;

                    // Geofence drift calculation
                    let isDrift = false;
                    let driftMeters = 0;
                    if (actual.checkout_lat && actual.checkout_lng) {
                      driftMeters = calculateDistanceMeters(
                        actual.checkin_lat,
                        actual.checkin_lng,
                        actual.checkout_lat,
                        actual.checkout_lng
                      );
                      if (driftMeters > 500) {
                        isDrift = true;
                      }
                    }

                    return (
                      <React.Fragment key={`actual-${actual.visit_id || actual.customer_id}`}>
                        {/* Check-In Pin */}
                        <Marker
                          position={[actual.checkin_lat, actual.checkin_lng]}
                          icon={createCheckinIcon()}
                        >
                          <LeafletTooltip direction="top" offset={[0, -12]} opacity={0.95}>
                            <div style={{ fontWeight: 700, color: "#2e7d32", fontSize: "12px" }}>
                              ✓ Checked In: {actual.checkin_village_name || actual.village ? `${actual.checkin_village_name || actual.village} · ` : ""}{actual.customer_name}
                            </div>
                            <div style={{ fontSize: "11px", color: "#333" }}>
                              Time: {new Date(actual.checkin_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                            </div>
                            {actual.checkin_location && (
                              <div style={{ fontSize: "10px", color: "#555" }}>
                                Place: {actual.checkin_location}
                              </div>
                            )}
                            <div style={{ fontSize: "10px", color: "#666" }}>
                              GPS: {actual.checkin_lat.toFixed(5)}, {actual.checkin_lng.toFixed(5)}
                            </div>
                          </LeafletTooltip>
                          <Popup>
                            <Typography variant="subtitle2" fontWeight={700}>
                              Checked In: {actual.customer_name}
                            </Typography>
                            <Typography variant="caption" display="block">
                              Village: {actual.checkin_village_name || actual.village || "Tracked Location"}
                            </Typography>
                            {actual.checkin_location && (
                              <Typography variant="caption" display="block">
                                Location: {actual.checkin_location}
                              </Typography>
                            )}
                            <Typography variant="caption" display="block">
                              Time: {new Date(actual.checkin_time).toLocaleTimeString()}
                            </Typography>
                          </Popup>
                        </Marker>

                        {/* Check-Out Pin if available */}
                        {actual.checkout_lat && actual.checkout_lng && (
                          <Marker
                            position={[actual.checkout_lat, actual.checkout_lng]}
                            icon={createCheckoutIcon(isDrift)}
                          >
                            <LeafletTooltip direction="top" offset={[0, -10]} opacity={0.95}>
                              <div style={{ fontWeight: 700, color: isDrift ? "#d32f2f" : "#ed6c02", fontSize: "12px" }}>
                                ⏹ Checked Out: {actual.checkout_village_name || actual.village ? `${actual.checkout_village_name || actual.village} · ` : ""}{actual.customer_name}
                              </div>
                              <div style={{ fontSize: "11px", color: "#333" }}>
                                Time: {new Date(actual.checkout_time!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} ({actual.duration_minutes ?? 0}m)
                              </div>
                              {actual.checkout_location && (
                                <div style={{ fontSize: "10px", color: "#555" }}>
                                  Place: {actual.checkout_location}
                                </div>
                              )}
                              <div style={{ fontSize: "10px", color: "#666" }}>
                                GPS: {actual.checkout_lat.toFixed(5)}, {actual.checkout_lng.toFixed(5)}
                              </div>
                              {isDrift && (
                                <div style={{ fontSize: "10px", color: "#d32f2f", fontWeight: 700 }}>
                                  ⚠ Geofence Drift: {driftMeters.toFixed(0)}m from check-in
                                </div>
                              )}
                            </LeafletTooltip>
                            <Popup>
                              <Typography variant="subtitle2" fontWeight={700}>
                                Checked Out: {actual.customer_name}
                              </Typography>
                              <Typography variant="caption" display="block">
                                Time: {new Date(actual.checkout_time!).toLocaleTimeString()} ({actual.duration_minutes ?? 0}m)
                              </Typography>
                              {actual.checkout_location && (
                                <Typography variant="caption" display="block">
                                  Location: {actual.checkout_location}
                                </Typography>
                              )}
                            </Popup>
                          </Marker>
                        )}
                      </React.Fragment>
                    );
                  })}

                  {/* Route Start Point Marker */}
                  {locationPoints.length > 0 && (
                    <Marker
                      position={[locationPoints[0].lat, locationPoints[0].lng]}
                      icon={createCheckinIcon()}
                    >
                      <Popup>
                        <Box display="flex" alignItems="center" gap={0.5}>
                          <StartPointIcon sx={{ fontSize: 16, color: "success.main" }} />
                          <Typography variant="subtitle2" fontWeight={700}>
                            Day Route Start Location
                          </Typography>
                        </Box>
                        <Typography variant="caption" display="block">
                          Time: {new Date(locationPoints[0].timestamp).toLocaleTimeString()}
                        </Typography>
                        <Typography variant="caption" display="block">
                          GPS: {locationPoints[0].lat.toFixed(5)}, {locationPoints[0].lng.toFixed(5)}
                        </Typography>
                      </Popup>
                    </Marker>
                  )}

                  {/* Route End / Latest Location Marker */}
                  {locationPoints.length > 1 && (
                    <Marker
                      position={[
                        locationPoints[locationPoints.length - 1].lat,
                        locationPoints[locationPoints.length - 1].lng,
                      ]}
                      icon={createCheckoutIcon(false)}
                    >
                      <Popup>
                        <Box display="flex" alignItems="center" gap={0.5}>
                          <EndPointIcon sx={{ fontSize: 16, color: "primary.main" }} />
                          <Typography variant="subtitle2" fontWeight={700}>
                            Day Route End Location
                          </Typography>
                        </Box>
                        <Typography variant="caption" display="block">
                          Time: {new Date(locationPoints[locationPoints.length - 1].timestamp).toLocaleTimeString()}
                        </Typography>
                        <Typography variant="caption" display="block">
                          GPS: {locationPoints[locationPoints.length - 1].lat.toFixed(5)}, {locationPoints[locationPoints.length - 1].lng.toFixed(5)}
                        </Typography>
                      </Popup>
                    </Marker>
                  )}
                </MapContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── Inject Mandatory Destination Dialog ──────────────────────── */}
      <Dialog open={injectDialogOpen} onClose={() => setInjectDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Inject Mandatory Destination / Follow-Up</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} mt={1}>
            {injectSuccess && <Alert severity="success">Destination injected! Added to route plan for {formattedDate}.</Alert>}
            <TextField
              label="Destination Village Name"
              placeholder="e.g. Rangola, Shivaji Nagar, Pimpri"
              value={injectForm.village}
              onChange={(e) => setInjectForm((f) => ({ ...f, village: e.target.value, customer_name: f.customer_name || e.target.value }))}
              fullWidth
              required
            />
            <TextField
              label="Customer Name / Point of Contact"
              placeholder="e.g. Village Sarpanch, Yash Dave, Harshil"
              value={injectForm.customer_name}
              onChange={(e) => setInjectForm((f) => ({ ...f, customer_name: e.target.value }))}
              fullWidth
              required
            />
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField
                  label="Taluka"
                  placeholder="e.g. Umreth, Anand"
                  value={injectForm.taluka}
                  onChange={(e) => setInjectForm((f) => ({ ...f, taluka: e.target.value }))}
                  fullWidth
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  label="Customer ID / Code (Optional)"
                  placeholder="e.g. CUST-1002"
                  value={injectForm.customer_id}
                  onChange={(e) => setInjectForm((f) => ({ ...f, customer_id: e.target.value }))}
                  fullWidth
                />
              </Grid>
            </Grid>
            <TextField
              label="Manager Instructions / Reason"
              placeholder="e.g. Priority order follow-up, product sample delivery"
              value={injectForm.notes}
              onChange={(e) => setInjectForm((f) => ({ ...f, notes: e.target.value }))}
              fullWidth
              multiline
              rows={2}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setInjectDialogOpen(false)} disabled={injectLoading}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleInjectSubmit}
            disabled={injectLoading || (!injectForm.customer_name && !injectForm.village)}
            startIcon={injectLoading ? <CircularProgress size={18} /> : null}
            sx={{ fontWeight: 700 }}
          >
            Assign Destination
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Officer Timeline Report Modal ──────────────────────── */}
      <OfficerReportModal
        open={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        initialFoEmail={currentOfficer?.email || effectiveEmail}
        initialDate={selectedDate}
        officersList={officers}
      />
    </Box>
  );
}
