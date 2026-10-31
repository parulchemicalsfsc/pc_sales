/**
 * VisitVerificationTab.tsx
 * ──────────────────────────────────────────────────────────────────────────
 * Tab 3: Visit Verification & "Second-Go" Product Pitch Terminal
 * - Left List: Chronological feed of visits for selected FO/date (filterable)
 * - Right Verification Cockpit (Selected Visit):
 *   1. Customer & Visit Telemetry Card (tel: link, checkin/out, duration, follow-up)
 *   2. FO's Mandatory Evidence Box (photo gallery lightbox, notes, linked orders)
 *   3. Manager Verification & "Second-Go" Pitch Form:
 *      - Verification Toggle (Verified / Disputed / Unreachable)
 *      - Second-Go Pitch Outcome Selector
 *      - Manager Call Notes with VoiceTextField (Alt+V dictation)
 *      - Next Follow-Up Scheduler
 *      - Submit button -> PATCH /api/v1/manager/visits/{visit_id}/verify
 */

import { useState, useEffect } from "react";
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Chip,
  Button,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  FormLabel,
  TextField,
  MenuItem,
  CircularProgress,
  Alert,
  IconButton,
  Dialog,
  DialogContent,
  List,
  ListItemButton,
  ListItemText,
  Divider,
  Stack,
  Tooltip,
} from "@mui/material";
import {
  Phone as PhoneIcon,
  CheckCircle as VerifiedIcon,
  Cancel as DisputedIcon,
  HelpOutline as UnreachableIcon,
  AccessTime as TimeIcon,
  LocationOn as LocationIcon,
  PhotoCamera as PhotoIcon,
  ShoppingBag as OrderIcon,
  CalendarMonth as CalendarIcon,
  FilterList as FilterIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import VoiceTextField from "../../components/VoiceTextField";
import { auraManagerAPI, type VerifyVisitPayload } from "../../services/auraApi";
import type { CustomerVisit, VisitPhoto } from "../../types/aura";

interface Props {
  selectedFoId: string | "all";
  selectedDate: string; // "YYYY-MM-DD"
}

export default function VisitVerificationTab({ selectedFoId, selectedDate }: Props) {
  const [visits, setVisits] = useState<CustomerVisit[]>([]);
  const [selectedVisit, setSelectedVisit] = useState<CustomerVisit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Form state
  const [verificationStatus, setVerificationStatus] = useState<"verified" | "disputed" | "unreachable">("verified");
  const [secondPitchOutcome, setSecondPitchOutcome] = useState<string>("high_conversion");
  const [managerNotes, setManagerNotes] = useState<string>("");
  const [followUpDate, setFollowUpDate] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Lightbox modal state
  const [lightboxPhoto, setLightboxPhoto] = useState<VisitPhoto | null>(null);

  const fetchVisits = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: {
        fo_user_id?: string;
        date?: string;
        verification_status?: string;
      } = {
        fo_user_id: selectedFoId === "all" ? undefined : selectedFoId,
        date: selectedDate,
        verification_status: statusFilter === "all" ? undefined : statusFilter,
      };
      const res = await auraManagerAPI.getVisits(params);
      const data: CustomerVisit[] = res.data?.visits ?? res.data ?? [];
      setVisits(data);
      if (data.length > 0 && !selectedVisit) {
        setSelectedVisit(data[0]);
      } else if (data.length === 0) {
        setSelectedVisit(null);
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to load visits");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVisits();
  }, [selectedFoId, selectedDate, statusFilter]);

  // When selected visit changes, populate form
  useEffect(() => {
    if (selectedVisit) {
      setVerificationStatus(
        selectedVisit.verification_status === "pending" ? "verified" : selectedVisit.verification_status
      );
      setSecondPitchOutcome(selectedVisit.second_pitch_outcome || "high_conversion");
      setManagerNotes(selectedVisit.manager_call_notes || "");
      setFollowUpDate(selectedVisit.follow_up_at ? selectedVisit.follow_up_at.slice(0, 16) : "");
      setSaveSuccess(false);
    }
  }, [selectedVisit]);

  const handleSubmitVerification = async () => {
    if (!selectedVisit) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: VerifyVisitPayload = {
        verification_status: verificationStatus,
        manager_call_notes: managerNotes,
        second_pitch_outcome: secondPitchOutcome,
        follow_up_at: followUpDate ? new Date(followUpDate).toISOString() : undefined,
      };
      await auraManagerAPI.verifyVisit(selectedVisit.visit_id, payload);
      setSaveSuccess(true);
      await fetchVisits();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to save verification");
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusChip = (status: CustomerVisit["verification_status"]) => {
    switch (status) {
      case "verified":
        return <Chip label="Verified" color="success" size="small" icon={<VerifiedIcon />} />;
      case "disputed":
        return <Chip label="Disputed" color="error" size="small" icon={<DisputedIcon />} />;
      case "unreachable":
        return <Chip label="Unreachable" color="warning" size="small" icon={<UnreachableIcon />} />;
      default:
        return <Chip label="Pending" color="default" size="small" />;
    }
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={2}>
        {/* Left List: Visits Feed (35% width) */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <Box p={2} borderBottom="1px solid" borderColor="divider">
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                <Typography variant="subtitle1" fontWeight={700}>
                  Visits Feed ({visits.length})
                </Typography>
                <FilterIcon color="action" fontSize="small" />
              </Box>
              <TextField
                select
                size="small"
                fullWidth
                label="Filter Status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <MenuItem value="all">All Visits</MenuItem>
                <MenuItem value="pending">Pending Verification</MenuItem>
                <MenuItem value="verified">Verified</MenuItem>
                <MenuItem value="disputed">Disputed</MenuItem>
                <MenuItem value="unreachable">Unreachable</MenuItem>
              </TextField>
            </Box>

            {loading ? (
              <Box display="flex" justifyContent="center" py={6}>
                <CircularProgress size={32} />
              </Box>
            ) : visits.length === 0 ? (
              <Box p={3} textAlign="center">
                <Typography variant="body2" color="text.secondary">
                  No visits recorded for this date.
                </Typography>
              </Box>
            ) : (
              <List sx={{ overflowY: "auto", flex: 1, p: 0 }}>
                {visits.map((v) => {
                  const isSelected = selectedVisit?.visit_id === v.visit_id;
                  return (
                    <ListItemButton
                      key={v.visit_id}
                      selected={isSelected}
                      onClick={() => setSelectedVisit(v)}
                      sx={{
                        borderLeft: isSelected ? "4px solid" : "4px solid transparent",
                        borderLeftColor: "primary.main",
                        borderBottom: "1px solid",
                        borderBottomColor: "divider",
                      }}
                    >
                      <ListItemText
                        primary={
                          <Box display="flex" justifyContent="space-between" alignItems="center">
                            <Typography variant="body2" fontWeight={600}>
                              {v.customer_name}
                            </Typography>
                            {getStatusChip(v.verification_status)}
                          </Box>
                        }
                        secondary={
                          <Box mt={0.5}>
                            <Typography variant="caption" color="text.secondary" display="block">
                              📍 {v.village}, {v.taluka}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              ⏰ {v.checkin_time ? new Date(v.checkin_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"} · {v.duration_minutes ?? 0}m
                            </Typography>
                          </Box>
                        }
                      />
                    </ListItemButton>
                  );
                })}
              </List>
            )}
          </Card>
        </Grid>

        {/* Right Cockpit: Selected Visit Details & Pitch Terminal (65% width) */}
        <Grid item xs={12} md={8}>
          {selectedVisit ? (
            <Box display="flex" flexDirection="column" gap={2}>
              {/* 1. Customer & Visit Telemetry Card */}
              <Card>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={1}>
                    <Box>
                      <Typography variant="h6" fontWeight={700}>
                        {selectedVisit.customer_name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        <LocationIcon fontSize="inherit" sx={{ verticalAlign: "middle", mr: 0.5 }} />
                        {selectedVisit.village}, {selectedVisit.taluka}
                      </Typography>
                    </Box>

                    {/* Clickable phone number */}
                    {selectedVisit.phone && (
                      <Button
                        variant="contained"
                        color="success"
                        startIcon={<PhoneIcon />}
                        href={`tel:${selectedVisit.phone}`}
                        component="a"
                        size="medium"
                      >
                        Call: {selectedVisit.phone}
                      </Button>
                    )}
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  <Grid container spacing={2}>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" color="text.secondary">
                        Field Officer
                      </Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {selectedVisit.fo_name}
                      </Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" color="text.secondary">
                        Check-In Time
                      </Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {selectedVisit.checkin_time ? new Date(selectedVisit.checkin_time).toLocaleTimeString() : "—"}
                      </Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" color="text.secondary">
                        Check-Out Time
                      </Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {selectedVisit.checkout_time ? new Date(selectedVisit.checkout_time).toLocaleTimeString() : "—"}
                      </Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" color="text.secondary">
                        Total Duration
                      </Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {selectedVisit.duration_minutes ?? 0} minutes
                      </Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>

              {/* 2. Field Officer's Mandatory Evidence Box */}
              <Card>
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                    Field Officer Evidence & Observations
                  </Typography>

                  {/* Photo Gallery Lightbox Viewer */}
                  <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                    <PhotoIcon fontSize="inherit" sx={{ verticalAlign: "middle", mr: 0.5 }} />
                    Mandatory Photos ({selectedVisit.photos?.length || 0} Uploaded):
                  </Typography>

                  <Box display="flex" gap={1.5} flexWrap="wrap" mb={2}>
                    {selectedVisit.photos && selectedVisit.photos.length > 0 ? (
                      selectedVisit.photos.map((p, idx) => (
                        <Box
                          key={idx}
                          component="img"
                          src={p.url}
                          alt={`Visit photo ${idx + 1}`}
                          onClick={() => setLightboxPhoto(p)}
                          sx={{
                            width: 100,
                            height: 100,
                            objectFit: "cover",
                            borderRadius: 1.5,
                            border: "1px solid",
                            borderColor: "divider",
                            cursor: "pointer",
                            transition: "transform 0.2s",
                            "&:hover": { transform: "scale(1.05)" },
                          }}
                        />
                      ))
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        No photos uploaded for this visit.
                      </Typography>
                    )}
                  </Box>

                  {/* FO Notes */}
                  <Typography variant="caption" color="text.secondary" display="block">
                    Field Officer Checkout Notes:
                  </Typography>
                  <Paper
                    variant="outlined"
                    sx={{ p: 1.5, mt: 0.5, bgcolor: "action.hover", borderRadius: 1 }}
                  >
                    <Typography variant="body2">
                      {selectedVisit.fo_notes || "No observation notes submitted."}
                    </Typography>
                  </Paper>

                  {/* Orders & Receipts Booked */}
                  {selectedVisit.linked_orders && selectedVisit.linked_orders.length > 0 && (
                    <Box mt={2}>
                      <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                        <OrderIcon fontSize="inherit" sx={{ verticalAlign: "middle", mr: 0.5 }} />
                        Orders Booked in This Visit:
                      </Typography>
                      {selectedVisit.linked_orders.map((ord, i) => (
                        <Paper key={i} variant="outlined" sx={{ p: 1, mb: 1 }}>
                          <Box display="flex" justifyContent="space-between">
                            <Typography variant="body2" fontWeight={600}>
                              Order #{ord.order_id} ({ord.order_type.toUpperCase()})
                            </Typography>
                            <Typography variant="body2" color="success.main" fontWeight={700}>
                              ₹{ord.total_amount.toLocaleString("en-IN")}
                            </Typography>
                          </Box>
                          {ord.line_items && (
                            <Typography variant="caption" color="text.secondary">
                              SKUs: {ord.line_items.map((li) => `${li.sku} x${li.qty}`).join(", ")}
                            </Typography>
                          )}
                        </Paper>
                      ))}
                    </Box>
                  )}
                </CardContent>
              </Card>

              {/* 3. Manager Verification & "Second-Go" Pitch Form */}
              <Card sx={{ borderLeft: "4px solid #1976d2" }}>
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                    Manager Audit & &ldquo;Second-Go&rdquo; Product Pitch Terminal
                  </Typography>

                  {saveSuccess && (
                    <Alert severity="success" sx={{ mb: 2 }}>
                      Visit audit saved and synced with AURA backend!
                    </Alert>
                  )}

                  <Box display="flex" flexDirection="column" gap={2}>
                    {/* Visit Verification Status Toggle */}
                    <FormControl component="fieldset">
                      <FormLabel component="legend" sx={{ fontWeight: 600, fontSize: "0.85rem" }}>
                        Verification Status
                      </FormLabel>
                      <RadioGroup
                        row
                        value={verificationStatus}
                        onChange={(e) =>
                          setVerificationStatus(e.target.value as "verified" | "disputed" | "unreachable")
                        }
                      >
                        <FormControlLabel
                          value="verified"
                          control={<Radio color="success" size="small" />}
                          label="✅ Verified Visit"
                        />
                        <FormControlLabel
                          value="disputed"
                          control={<Radio color="error" size="small" />}
                          label="❌ Disputed / Did Not Visit"
                        />
                        <FormControlLabel
                          value="unreachable"
                          control={<Radio color="warning" size="small" />}
                          label="⚠️ Customer Unreachable"
                        />
                      </RadioGroup>
                    </FormControl>

                    {/* Second-Go Pitch Outcome Selector */}
                    <TextField
                      select
                      label="Second-Go Product Pitch Outcome (F.S. Calcival)"
                      value={secondPitchOutcome}
                      onChange={(e) => setSecondPitchOutcome(e.target.value)}
                      fullWidth
                      size="small"
                    >
                      <MenuItem value="booked_second_order">🎉 Booked Second Order (F.S. Calcival)</MenuItem>
                      <MenuItem value="high_conversion">⭐ High Conversion Probability (Follow-Up Soon)</MenuItem>
                      <MenuItem value="needs_senior_vet">🩺 Needs Senior Vet Escalation</MenuItem>
                      <MenuItem value="not_interested">❌ Customer Not Interested / Switched Brand</MenuItem>
                    </TextField>

                    {/* Voice-Enabled Call Notes using existing VoiceTextField */}
                    <VoiceTextField
                      label="Manager Call & Veterinary Notes (Voice-Enabled Alt+V)"
                      placeholder="Dictate call notes in Hindi, Gujarati, or Marathi... Press Alt+V to speak."
                      value={managerNotes}
                      onValueChange={(val) => setManagerNotes(val)}
                      multiline
                      rows={3}
                      fullWidth
                      showLanguageSelector
                    />

                    {/* Follow-Up Scheduler */}
                    <TextField
                      label="Next Follow-Up Reminder (Date & Time)"
                      type="datetime-local"
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                      fullWidth
                      size="small"
                      InputLabelProps={{ shrink: true }}
                    />

                    {/* Submit Button */}
                    <Box display="flex" justifyContent="flex-end">
                      <Button
                        variant="contained"
                        color="primary"
                        onClick={handleSubmitVerification}
                        disabled={submitting}
                        startIcon={submitting ? <CircularProgress size={18} /> : <VerifiedIcon />}
                      >
                        Save &amp; Submit Audit
                      </Button>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Box>
          ) : (
            <Card>
              <CardContent sx={{ py: 8, textAlign: "center" }}>
                <Typography color="text.secondary">
                  Select a visit from the feed on the left to inspect evidence and perform audit.
                </Typography>
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>

      {/* Lightbox Modal for Photo Inspection */}
      <Dialog open={Boolean(lightboxPhoto)} onClose={() => setLightboxPhoto(null)} maxWidth="md">
        <DialogContent sx={{ position: "relative", p: 1 }}>
          <IconButton
            onClick={() => setLightboxPhoto(null)}
            sx={{ position: "absolute", top: 8, right: 8, bgcolor: "rgba(0,0,0,0.6)", color: "white" }}
          >
            <CloseIcon />
          </IconButton>
          {lightboxPhoto && (
            <Box>
              <Box
                component="img"
                src={lightboxPhoto.url}
                alt="Enlarged visit photo"
                sx={{ width: "100%", maxHeight: "80vh", objectFit: "contain", borderRadius: 1 }}
              />
              <Box p={1}>
                <Typography variant="caption" color="text.secondary">
                  Uploaded: {new Date(lightboxPhoto.upload_timestamp).toLocaleString()}
                  {lightboxPhoto.exif_timestamp ? ` · EXIF: ${new Date(lightboxPhoto.exif_timestamp).toLocaleString()}` : ""}
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}

