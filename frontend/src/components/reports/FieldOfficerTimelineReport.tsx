/**
 * FieldOfficerTimelineReport.tsx
 * ──────────────────────────────────────────────────────────────────────────
 * Component for generating and downloading Field Officer Timeline Reports
 * with custom date ranges, check-in to check-out distances (in KM),
 * durations, and walking vs motorcycle speed breakdowns.
 *
 * Formatted identically to the Vikas Ghatage Biz Analyst PDF report.
 */

import React, { useState, useEffect } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  TextField,
  MenuItem,
  Button,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  Stack,
  Divider,
} from "@mui/material";
import {
  PictureAsPdf as PdfIcon,
  Refresh as RefreshIcon,
  Person as PersonIcon,
  CalendarToday as CalendarIcon,
  DirectionsWalk as WalkIcon,
  TwoWheeler as BikeIcon,
  Straighten as DistIcon,
  AccessTime as TimeIcon,
} from "@mui/icons-material";
import { format, subDays, startOfMonth } from "date-fns";

import { auraManagerAPI } from "../../services/auraApi";
import type { FieldOfficerItem } from "../../types/aura";
import {
  exportOfficerTimelinePDF,
  cleanVisitNotes,
  type OfficerTimelineVisit,
} from "../../utils/individualTimelinePdf";

interface Props {
  initialFoEmail?: string;
  initialDate?: string;
  officersList?: FieldOfficerItem[];
}

export default function FieldOfficerTimelineReport({
  initialFoEmail,
  initialDate,
  officersList: propOfficers,
}: Props) {
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const defaultStart = initialDate || todayStr;
  const defaultEnd = initialDate || todayStr;

  const [officers, setOfficers] = useState<FieldOfficerItem[]>(propOfficers || []);
  const [selectedFoEmail, setSelectedFoEmail] = useState<string>(
    initialFoEmail && initialFoEmail !== "all" ? initialFoEmail : ""
  );
  const [startDate, setStartDate] = useState<string>(defaultStart);
  const [endDate, setEndDate] = useState<string>(defaultEnd);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [visits, setVisits] = useState<OfficerTimelineVisit[]>([]);
  const [officerName, setOfficerName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Load officers list if not passed
  useEffect(() => {
    if (propOfficers && propOfficers.length > 0) {
      setOfficers(propOfficers);
      if (!selectedFoEmail) {
        setSelectedFoEmail(propOfficers[0]?.email || "");
      }
    } else {
      auraManagerAPI
        .getOfficersList()
        .then((res) => {
          const list = res.data?.field_officers || [];
          setOfficers(list);
          if (!selectedFoEmail && list.length > 0) {
            setSelectedFoEmail(list[0]?.email || "");
          }
        })
        .catch(() => {});
    }
  }, [propOfficers]);

  // Sync initialFoEmail if changes
  useEffect(() => {
    if (initialFoEmail && initialFoEmail !== "all") {
      setSelectedFoEmail(initialFoEmail);
    }
  }, [initialFoEmail]);

  // Load report data
  const loadReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const emailOrId = selectedFoEmail || officers[0]?.email || "yashdave182@gmail.com";
      const res = await auraManagerAPI.getOfficerTimelineReport({
        fo_email_or_id: emailOrId,
        start_date: startDate,
        end_date: endDate,
      });

      const list = res.data?.visits || [];
      setVisits(list);

      const resolvedOfficer = officers.find(
        (o) =>
          o.email?.toLowerCase() === emailOrId.toLowerCase() ||
          o.user_id?.toLowerCase() === emailOrId.toLowerCase()
      );
      setOfficerName(resolvedOfficer?.name || res.data?.officer?.name || emailOrId.split("@")[0]);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message || "Failed to load timeline report");
      setVisits([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedFoEmail || officers.length > 0) {
      loadReport();
    }
  }, [selectedFoEmail, startDate, endDate]);

  // Quick date presets
  const applyPreset = (preset: "today" | "yesterday" | "last7" | "thisMonth") => {
    const today = new Date();
    if (preset === "today") {
      const s = format(today, "yyyy-MM-dd");
      setStartDate(s);
      setEndDate(s);
    } else if (preset === "yesterday") {
      const y = format(subDays(today, 1), "yyyy-MM-dd");
      setStartDate(y);
      setEndDate(y);
    } else if (preset === "last7") {
      setStartDate(format(subDays(today, 6), "yyyy-MM-dd"));
      setEndDate(format(today, "yyyy-MM-dd"));
    } else if (preset === "thisMonth") {
      setStartDate(format(startOfMonth(today), "yyyy-MM-dd"));
      setEndDate(format(today, "yyyy-MM-dd"));
    }
  };

  // Metrics
  const totalMeetings = visits.length;
  const totalMinutes = visits.reduce((a, v) => a + (v.duration_minutes || 0), 0);
  const totalWalkMins = visits.reduce((a, v) => a + (v.walking_minutes || v.duration_minutes || 0), 0);
  const totalBikeMins = visits.reduce((a, v) => a + (v.motorcycle_minutes || 0), 0);
  const totalDistanceKm = visits
    .reduce((a, v) => a + (v.distance_km || 0), 0)
    .toFixed(2);

  const fmtDur = (m: number) => {
    if (m <= 0) return "0m";
    if (m >= 60) return `${(m / 60).toFixed(1)}h`;
    return `${m}m`;
  };

  // Export to PDF
  const handleExportPDF = async () => {
    setDownloading(true);
    try {
      const dateRangeStr =
        startDate === endDate
          ? format(new Date(startDate), "dd MMM yyyy")
          : `${format(new Date(startDate), "dd MMM yyyy")} - ${format(new Date(endDate), "dd MMM yyyy")}`;

      await exportOfficerTimelinePDF({
        officerName: officerName || selectedFoEmail.split("@")[0] || "Field Officer",
        officerEmail: selectedFoEmail,
        dateRangeStr,
        visits,
      });
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message || "Failed to generate PDF");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Box>
      {/* ── Control Header ────────────────────────────────────────────── */}
      <Paper
        variant="outlined"
        sx={{
          p: 2.5,
          mb: 3,
          borderRadius: 2,
          background: "linear-gradient(135deg, rgba(25,118,210,0.03) 0%, rgba(46,125,50,0.03) 100%)",
        }}
      >
        <Grid container spacing={2} alignItems="center">
          {/* Officer Selector */}
          <Grid item xs={12} sm={6} md={3.5}>
            <TextField
              select
              fullWidth
              size="small"
              label="Select Field Officer"
              value={selectedFoEmail}
              onChange={(e) => setSelectedFoEmail(e.target.value)}
            >
              {officers.map((fo) => (
                <MenuItem key={fo.user_id || fo.email} value={fo.email || fo.user_id}>
                  {fo.name} ({fo.email})
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          {/* Start Date */}
          <Grid item xs={6} sm={3} md={2}>
            <TextField
              type="date"
              fullWidth
              size="small"
              label="From Date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          {/* End Date */}
          <Grid item xs={6} sm={3} md={2}>
            <TextField
              type="date"
              fullWidth
              size="small"
              label="To Date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          {/* Action Buttons */}
          <Grid item xs={12} md={4.5} display="flex" gap={1} justifyContent={{ xs: "flex-start", md: "flex-end" }} flexWrap="wrap">
            <Button
              variant="outlined"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={loadReport}
              disabled={loading}
            >
              Refresh
            </Button>
            <Button
              variant="contained"
              color="primary"
              size="small"
              startIcon={downloading ? <CircularProgress size={16} color="inherit" /> : <PdfIcon />}
              onClick={handleExportPDF}
              disabled={loading || downloading || visits.length === 0}
              sx={{ fontWeight: 700 }}
            >
              {downloading ? "Generating..." : "Download PDF Report"}
            </Button>
          </Grid>

          {/* Date Presets Row */}
          <Grid item xs={12}>
            <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
              <Typography variant="caption" fontWeight={700} color="text.secondary">
                Quick Range:
              </Typography>
              <Chip
                label="Today"
                size="small"
                clickable
                onClick={() => applyPreset("today")}
                color={startDate === todayStr && endDate === todayStr ? "primary" : "default"}
              />
              <Chip
                label="Yesterday"
                size="small"
                clickable
                onClick={() => applyPreset("yesterday")}
              />
              <Chip
                label="Last 7 Days"
                size="small"
                clickable
                onClick={() => applyPreset("last7")}
              />
              <Chip
                label="This Month"
                size="small"
                clickable
                onClick={() => applyPreset("thisMonth")}
              />
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2.5 }}>{error}</Alert>}

      {/* ── Summary KPI Cards ─────────────────────────────────────────── */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={6} sm={4} md={2.4}>
          <Card variant="outlined" sx={{ borderRadius: 2 }}>
            <CardContent sx={{ p: 2, textAlign: "center" }}>
              <Typography variant="caption" color="text.secondary" fontWeight={700}>
                TOTAL VISITS
              </Typography>
              <Typography variant="h5" fontWeight={800} color="primary.main">
                {totalMeetings}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Completed Check-Ins
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={4} md={2.4}>
          <Card variant="outlined" sx={{ borderRadius: 2 }}>
            <CardContent sx={{ p: 2, textAlign: "center" }}>
              <Typography variant="caption" color="text.secondary" fontWeight={700}>
                TOTAL TIME
              </Typography>
              <Typography variant="h5" fontWeight={800} color="text.primary">
                {fmtDur(totalMinutes)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Duration in Field
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={4} md={2.4}>
          <Card variant="outlined" sx={{ borderRadius: 2 }}>
            <CardContent sx={{ p: 2, textAlign: "center" }}>
              <Typography variant="caption" color="text.secondary" fontWeight={700}>
                IN-TO-OUT DISTANCE
              </Typography>
              <Typography variant="h5" fontWeight={800} color="success.main">
                {totalDistanceKm} km
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Checkin-Checkout Dist
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={6} md={2.4}>
          <Card variant="outlined" sx={{ borderRadius: 2 }}>
            <CardContent sx={{ p: 2, textAlign: "center" }}>
              <Typography variant="caption" color="text.secondary" fontWeight={700}>
                WALKING / IDLE
              </Typography>
              <Typography variant="h5" fontWeight={800} color="info.main">
                {fmtDur(totalWalkMins)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Speed &lt; 5 km/h
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={6} md={2.4}>
          <Card variant="outlined" sx={{ borderRadius: 2 }}>
            <CardContent sx={{ p: 2, textAlign: "center" }}>
              <Typography variant="caption" color="text.secondary" fontWeight={700}>
                MOTORCYCLE
              </Typography>
              <Typography variant="h5" fontWeight={800} color="warning.main">
                {fmtDur(totalBikeMins)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Speed &ge; 5 km/h
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── Visits Table Preview ───────────────────────────────────────── */}
      <Card variant="outlined" sx={{ borderRadius: 2 }}>
        <Box p={2} display="flex" justifyContent="space-between" alignItems="center" borderBottom="1px solid" borderColor="divider">
          <Box display="flex" alignItems="center" gap={1}>
            <PersonIcon color="primary" />
            <Typography variant="subtitle1" fontWeight={700}>
              {officerName} &mdash; Timeline Visits ({visits.length})
            </Typography>
          </Box>
          <Chip
            icon={<DistIcon sx={{ fontSize: "14px !important" }} />}
            label={`Total In-Out Dist: ${totalDistanceKm} km`}
            size="small"
            color="success"
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
        </Box>

        {loading ? (
          <Box display="flex" justifyContent="center" py={8}>
            <CircularProgress size={36} />
          </Box>
        ) : visits.length === 0 ? (
          <Box textAlign="center" py={6}>
            <Typography variant="body2" color="text.secondary" mb={1}>
              No visits recorded for <strong>{officerName}</strong> in this date range.
            </Typography>
            <Typography variant="caption" color="text.disabled">
              Select another date range or field officer above.
            </Typography>
          </Box>
        ) : (
          <TableContainer sx={{ maxHeight: 520 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, bgcolor: "grey.100" }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: "grey.100" }}>Party Name</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: "grey.100" }}>Check In Details</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: "grey.100" }}>Check Out Details</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: "grey.100" }}>In-Out Dist (KM)</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: "grey.100" }}>Time &amp; Speed Breakdown</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: "grey.100" }}>Notes / Comment</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visits.map((v) => {
                  const cust = v.customers;
                  const dateStr = new Date(v.checked_in_at).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "2-digit",
                  });
                  const inTime = new Date(v.checked_in_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const outTime = v.checked_out_at
                    ? new Date(v.checked_out_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "In Progress";

                  const distStr = `${(v.distance_km || 0).toFixed(2)} km`;

                  return (
                    <TableRow key={v.id} hover>
                      <TableCell sx={{ whiteSpace: "nowrap", fontWeight: 600 }}>{dateStr}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>
                        {v.party_name || v.customer_name || cust?.name || "Customer"}
                        {cust?.village && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            {cust.village}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600} color="success.dark">
                          {inTime}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {v.checkin_location || v.checkin_village_name || cust?.village || "Location logged"}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600} color={v.checked_out_at ? "warning.dark" : "text.secondary"}>
                          {outTime}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {v.checkout_location || v.checkout_village_name || cust?.village || "Location logged"}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={distStr}
                          size="small"
                          color={v.distance_km && v.distance_km > 0.5 ? "warning" : "default"}
                          sx={{ fontWeight: 700, fontSize: "11px" }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={700} color="primary.main">
                          {fmtDur(v.duration_minutes || 0)}
                        </Typography>
                        <Box display="flex" gap={0.5} mt={0.3} flexWrap="wrap">
                          <Chip
                            icon={<WalkIcon sx={{ fontSize: "12px !important" }} />}
                            label={`Walk: ${fmtDur(v.walking_minutes || 0)}`}
                            size="small"
                            sx={{ height: 18, fontSize: "9px" }}
                          />
                          <Chip
                            icon={<BikeIcon sx={{ fontSize: "12px !important" }} />}
                            label={`Bike: ${fmtDur(v.motorcycle_minutes || 0)}`}
                            size="small"
                            color="warning"
                            variant="outlined"
                            sx={{ height: 18, fontSize: "9px" }}
                          />
                        </Box>
                      </TableCell>
                      <TableCell sx={{ maxWidth: 180 }}>
                        <Typography variant="caption" color="text.secondary">
                          {cleanVisitNotes(v.notes) || "—"}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>
    </Box>
  );
}
