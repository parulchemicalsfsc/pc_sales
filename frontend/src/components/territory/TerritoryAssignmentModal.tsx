/**
 * TerritoryAssignmentModal.tsx
 * ──────────────────────────────────────────────────────────────────────────
 * Mandatory First-Time / On-Demand Territory Village Allocation Dialog.
 *
 * Requirements:
 * 1. Admin/Field Manager assigns specific villages to each Field Officer.
 * 2. Mobile AURA app restricts route plan creation to these assigned villages.
 *    Any extra village requires manager approval request.
 * 3. Actual check-in & check-out retain 100% full freedom.
 * 4. Mandatory setup dialog appears on first visit for admin / field manager;
 *    cannot proceed without submitting (submitting empty saves as null/empty,
 *    and can be edited at any time via "Territory Villages" button).
 * 5. Route Audit tab uses these village coordinates to accurately verify
 *    planned destinations against actual check-in & check-out locations.
 */

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  TextField,
  MenuItem,
  Button,
  Chip,
  IconButton,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tab,
  Alert,
  CircularProgress,
  Tooltip,
} from "@mui/material";
import {
  LocationOn as LocationIcon,
  AddLocationAlt as AddLocationIcon,
  Delete as DeleteIcon,
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  Close as CloseIcon,
  NotificationsActive as PendingIcon,
  Map as MapIcon,
  Save as SaveIcon,
} from "@mui/icons-material";

import {
  auraManagerAPI,
  lookupVillageCoordinates,
  GUJARAT_VILLAGE_COORDS,
} from "../../services/auraApi";
import type {
  FieldOfficerItem,
  AssignedVillage,
  VillageApprovalRequest,
} from "../../types/aura";

interface Props {
  open: boolean;
  onClose: () => void;
  officers: FieldOfficerItem[];
  selectedOfficerEmail?: string;
  isMandatoryFirstTime?: boolean;
  onSaved?: () => void;
}

export default function TerritoryAssignmentModal({
  open,
  onClose,
  officers,
  selectedOfficerEmail,
  isMandatoryFirstTime = false,
  onSaved,
}: Props) {
  const [tabIndex, setTabIndex] = useState<number>(0);
  const [currentOfficerEmail, setCurrentOfficerEmail] = useState<string>("");
  const [assignedVillages, setAssignedVillages] = useState<AssignedVillage[]>([]);
  const [pendingRequests, setPendingRequests] = useState<VillageApprovalRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);

  // New Village Inputs
  const [newVillageName, setNewVillageName] = useState("");
  const [newTaluka, setNewTaluka] = useState("");
  const [newLat, setNewLat] = useState("");
  const [newLng, setNewLng] = useState("");

  // Select initial officer
  useEffect(() => {
    if (selectedOfficerEmail && selectedOfficerEmail !== "all") {
      setCurrentOfficerEmail(selectedOfficerEmail);
    } else if (officers.length > 0) {
      setCurrentOfficerEmail(officers[0].email || officers[0].user_id || "yashdave182@gmail.com");
    } else {
      setCurrentOfficerEmail("yashdave182@gmail.com");
    }
  }, [selectedOfficerEmail, officers, open]);

  // Load officer's assigned villages and pending requests
  const loadData = async (email: string) => {
    if (!email) return;
    setLoading(true);
    setFeedback(null);
    try {
      const [villagesList, requestsList] = await Promise.all([
        auraManagerAPI.getAssignedVillages(email),
        auraManagerAPI.getPendingVillageRequests(),
      ]);
      setAssignedVillages(villagesList || []);
      const officerRequests = (requestsList || []).filter(
        (r) => !r.officer_email || r.officer_email.toLowerCase() === email.toLowerCase()
      );
      setPendingRequests(officerRequests);
    } catch {
      // Fallback already handled inside auraManagerAPI
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && currentOfficerEmail) {
      loadData(currentOfficerEmail);
    }
  }, [open, currentOfficerEmail]);

  // Auto-fill coordinates & taluka when user types village name
  const handleVillageNameChange = (name: string) => {
    setNewVillageName(name);
    const match = lookupVillageCoordinates(name);
    if (match) {
      setNewTaluka(match.taluka);
      setNewLat(match.lat.toString());
      setNewLng(match.lng.toString());
    }
  };

  // Add Village to list
  const handleAddVillage = (
    villageName = newVillageName,
    taluka = newTaluka,
    latStr = newLat,
    lngStr = newLng
  ) => {
    const trimmed = villageName.trim();
    if (!trimmed) {
      setFeedback({ type: "error", msg: "Please enter a valid village name." });
      return;
    }

    // Check duplicate
    if (assignedVillages.some((v) => v.village_name.toLowerCase() === trimmed.toLowerCase())) {
      setFeedback({ type: "info", msg: `"${trimmed}" is already assigned to this officer.` });
      return;
    }

    const match = lookupVillageCoordinates(trimmed);
    const finalLat = parseFloat(latStr) || match?.lat || 22.3072;
    const finalLng = parseFloat(lngStr) || match?.lng || 73.1812;
    const finalTaluka = taluka.trim() || match?.taluka || "Vadodara";

    const newItem: AssignedVillage = {
      officer_email: currentOfficerEmail,
      village_name: trimmed,
      taluka: finalTaluka,
      latitude: finalLat,
      longitude: finalLng,
    };

    setAssignedVillages((prev) => [...prev, newItem]);
    setNewVillageName("");
    setNewTaluka("");
    setNewLat("");
    setNewLng("");
    setFeedback({ type: "success", msg: `Added ${trimmed} to assigned territory.` });
  };

  // Remove Village
  const handleRemoveVillage = (index: number) => {
    setAssignedVillages((prev) => prev.filter((_, i) => i !== index));
  };

  // Quick Preset Add
  const handleQuickAdd = (presetKey: string) => {
    const data = GUJARAT_VILLAGE_COORDS[presetKey];
    if (!data) return;
    const properName = presetKey.charAt(0).toUpperCase() + presetKey.slice(1);
    handleAddVillage(properName, data.taluka, data.lat.toString(), data.lng.toString());
  };

  // Save All Villages for Current Officer
  const handleSaveVillages = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await auraManagerAPI.saveAssignedVillages(currentOfficerEmail, assignedVillages);
      localStorage.setItem("aura_territory_setup_completed", "true");
      setFeedback({ type: "success", msg: "Territory villages successfully saved and synced!" });
      if (onSaved) onSaved();

      if (isMandatoryFirstTime) {
        setTimeout(() => {
          onClose();
        }, 800);
      }
    } catch {
      setFeedback({ type: "error", msg: "Failed to save territory villages. Please retry." });
    } finally {
      setSaving(false);
    }
  };

  // Approve / Reject Village Request
  const handleReviewRequest = async (requestId: string, status: "approved" | "rejected", reqItem: VillageApprovalRequest) => {
    try {
      await auraManagerAPI.reviewVillageRequest(requestId, status, currentOfficerEmail, reqItem);
      if (status === "approved") {
        // Automatically add to assigned villages if not already present
        if (!assignedVillages.some((v) => v.village_name.toLowerCase() === reqItem.village_name.toLowerCase())) {
          const match = lookupVillageCoordinates(reqItem.village_name);
          const newV: AssignedVillage = {
            officer_email: currentOfficerEmail,
            village_name: reqItem.village_name,
            taluka: reqItem.taluka || match?.taluka || "Vadodara",
            latitude: match?.lat || 22.3072,
            longitude: match?.lng || 73.1812,
          };
          const updated = [...assignedVillages, newV];
          setAssignedVillages(updated);
          await auraManagerAPI.saveAssignedVillages(currentOfficerEmail, updated);
        }
      }
      setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
      setFeedback({
        type: "success",
        msg: `Request for "${reqItem.village_name}" has been ${status}.`,
      });
    } catch {
      setFeedback({ type: "error", msg: `Failed to ${status} request.` });
    }
  };

  return (
    <Dialog
      open={open}
      onClose={isMandatoryFirstTime ? undefined : onClose}
      disableEscapeKeyDown={isMandatoryFirstTime}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          boxShadow: "0 10px 40px rgba(0,0,0,0.18)",
        },
      }}
    >
      {/* ── Dialog Header ──────────────────────────────────────────────── */}
      <DialogTitle
        sx={{
          p: 2.5,
          background: isMandatoryFirstTime
            ? "linear-gradient(135deg, #1565c0 0%, #0d47a1 100%)"
            : "linear-gradient(135deg, #1976d2 0%, #1565c0 100%)",
          color: "white",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Box display="flex" alignItems="center" gap={1.5}>
          <LocationIcon sx={{ fontSize: 28, color: "#90caf9" }} />
          <Box>
            <Typography variant="h6" fontWeight={800} sx={{ color: "white" }}>
              {isMandatoryFirstTime
                ? "Mandatory Territory Setup: Assign Officer Villages"
                : "Territory Village Allocation & Route Geofencing"}
            </Typography>
            <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.85)" }}>
              Define designated villages per Field Officer. Route plans require choosing from assigned villages.
            </Typography>
          </Box>
        </Box>
        {!isMandatoryFirstTime && (
          <IconButton size="small" onClick={onClose} sx={{ color: "white" }}>
            <CloseIcon />
          </IconButton>
        )}
      </DialogTitle>

      <DialogContent dividers sx={{ p: { xs: 2, md: 3 } }}>
        {isMandatoryFirstTime && (
          <Alert severity="warning" sx={{ mb: 2.5, borderRadius: 2 }}>
            <strong>Mandatory Initial Configuration:</strong> Please review or assign designated villages for your Field Officers.
            If you wish to configure later, you can click <strong>&quot;Submit &amp; Save Territory&quot;</strong> (defaults to empty/null)
            and edit anytime via the <strong>Territory Villages</strong> button in the top bar.
          </Alert>
        )}

        {feedback && (
          <Alert severity={feedback.type} sx={{ mb: 2, borderRadius: 2 }} onClose={() => setFeedback(null)}>
            {feedback.msg}
          </Alert>
        )}

        {/* ── Officer Selector ────────────────────────────────────────────── */}
        <Paper variant="outlined" sx={{ p: 2, mb: 2.5, borderRadius: 2, bgcolor: "grey.50" }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={6}>
              <TextField
                select
                fullWidth
                size="small"
                label="Select Field Officer"
                value={currentOfficerEmail}
                onChange={(e) => {
                  setCurrentOfficerEmail(e.target.value);
                }}
              >
                {officers.map((fo) => (
                  <MenuItem key={fo.user_id || fo.email} value={fo.email || fo.user_id}>
                    {fo.name} ({fo.email || fo.user_id})
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Box display="flex" gap={1} alignItems="center">
                <Chip
                  icon={<LocationIcon />}
                  label={`${assignedVillages.length} Assigned Villages`}
                  color="primary"
                  variant="outlined"
                  sx={{ fontWeight: 600 }}
                />
                {pendingRequests.length > 0 && (
                  <Chip
                    icon={<PendingIcon />}
                    label={`${pendingRequests.length} Pending Approval`}
                    color="warning"
                    sx={{ fontWeight: 700 }}
                  />
                )}
              </Box>
            </Grid>
          </Grid>
        </Paper>

        {/* ── Tabs: Assigned vs Pending Requests ──────────────────────────── */}
        <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}>
          <Tabs value={tabIndex} onChange={(_, val) => setTabIndex(val)} textColor="primary" indicatorColor="primary">
            <Tab label={`Assigned Villages (${assignedVillages.length})`} />
            <Tab
              label={
                <Box display="flex" alignItems="center" gap={0.8}>
                  <span>Pending Village Requests</span>
                  {pendingRequests.length > 0 && (
                    <Chip label={pendingRequests.length} size="small" color="error" sx={{ height: 18, fontSize: "0.7rem" }} />
                  )}
                </Box>
              }
            />
          </Tabs>
        </Box>

        {/* ── Tab 0: Assigned Villages Management ─────────────────────────── */}
        {tabIndex === 0 && (
          <Box>
            {/* Quick Presets for Vadodara & Gujarat */}
            <Box mb={2}>
              <Typography variant="caption" color="text.secondary" fontWeight={700} textTransform="uppercase" display="block" mb={0.8}>
                Quick Add Vadodara &amp; Surrounding Villages:
              </Typography>
              <Box display="flex" gap={0.8} flexWrap="wrap">
                {["gorwa", "gotri", "bhayli", "bil", "chapad", "sevasi", "manjalpur", "padra", "waghodia", "gadh", "palitana", "becharaji"].map(
                  (vKey) => (
                    <Chip
                      key={vKey}
                      label={`+ ${vKey.charAt(0).toUpperCase() + vKey.slice(1)}`}
                      size="small"
                      onClick={() => handleQuickAdd(vKey)}
                      clickable
                      sx={{ bgcolor: "grey.100", "&:hover": { bgcolor: "primary.light", color: "white" } }}
                    />
                  )
                )}
              </Box>
            </Box>

            {/* Add Village Form */}
            <Paper variant="outlined" sx={{ p: 2, mb: 2.5, borderRadius: 2 }}>
              <Typography variant="subtitle2" fontWeight={700} mb={1.5} display="flex" alignItems="center" gap={1}>
                <AddLocationIcon fontSize="small" color="primary" /> Add Village to Officer Territory
              </Typography>
              <Grid container spacing={1.5} alignItems="center">
                <Grid item xs={12} sm={4}>
                  <TextField
                    size="small"
                    fullWidth
                    label="Village Name"
                    placeholder="e.g. Gorwa, Bhayli"
                    value={newVillageName}
                    onChange={(e) => handleVillageNameChange(e.target.value)}
                  />
                </Grid>
                <Grid item xs={12} sm={3}>
                  <TextField
                    size="small"
                    fullWidth
                    label="Taluka"
                    placeholder="e.g. Vadodara"
                    value={newTaluka}
                    onChange={(e) => setNewTaluka(e.target.value)}
                  />
                </Grid>
                <Grid item xs={6} sm={2.5}>
                  <TextField
                    size="small"
                    fullWidth
                    label="Latitude"
                    placeholder="22.3364"
                    value={newLat}
                    onChange={(e) => setNewLat(e.target.value)}
                  />
                </Grid>
                <Grid item xs={6} sm={2.5}>
                  <TextField
                    size="small"
                    fullWidth
                    label="Longitude"
                    placeholder="73.1610"
                    value={newLng}
                    onChange={(e) => setNewLng(e.target.value)}
                  />
                </Grid>
                <Grid item xs={12}>
                  <Box display="flex" justifyContent="flex-end">
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={<AddLocationIcon />}
                      onClick={() => handleAddVillage()}
                      disabled={!newVillageName.trim()}
                      sx={{ textTransform: "none", fontWeight: 700 }}
                    >
                      + Add to Territory
                    </Button>
                  </Box>
                </Grid>
              </Grid>
            </Paper>

            {/* Current Assigned Villages Table */}
            {loading ? (
              <Box display="flex" justifyContent="center" py={4}>
                <CircularProgress size={30} />
              </Box>
            ) : assignedVillages.length === 0 ? (
              <Box p={3} textAlign="center" bgcolor="grey.50" borderRadius={2}>
                <Typography variant="body2" color="text.secondary">
                  No villages currently assigned to this officer. (Defaults to null).
                </Typography>
                <Typography variant="caption" color="text.disabled" display="block" mt={0.5}>
                  Add villages above or click the quick-add chips to assign designated destinations.
                </Typography>
              </Box>
            ) : (
              <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, maxHeight: 280 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>#</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Village Name</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Taluka</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Coordinates (Lat, Lng)</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {assignedVillages.map((v, idx) => {
                      const latStr = typeof v.latitude === "number" ? v.latitude.toFixed(4) : "22.3072";
                      const lngStr = typeof v.longitude === "number" ? v.longitude.toFixed(4) : "73.1812";
                      return (
                        <TableRow key={idx} hover>
                          <TableCell>{idx + 1}</TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight={700}>
                              {v.village_name}
                            </Typography>
                          </TableCell>
                          <TableCell>{v.taluka || "Vadodara"}</TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              variant="outlined"
                              label={`${latStr}, ${lngStr}`}
                              icon={<MapIcon sx={{ fontSize: "14px !important" }} />}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Tooltip title="Remove Village">
                              <IconButton size="small" color="error" onClick={() => handleRemoveVillage(idx)}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}

        {/* ── Tab 1: Pending Village Requests ─────────────────────────────── */}
        {tabIndex === 1 && (
          <Box>
            <Typography variant="body2" color="text.secondary" mb={2}>
              When a Field Officer encounters an unassigned village they wish to visit, they can submit an approval request from the mobile AURA app. Review requests below:
            </Typography>

            {pendingRequests.length === 0 ? (
              <Box p={3} textAlign="center" bgcolor="grey.50" borderRadius={2}>
                <Typography variant="body2" color="text.secondary">
                  No pending village approval requests from this officer.
                </Typography>
              </Box>
            ) : (
              <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Village Name</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Taluka</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Reason for Visit</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Requested Date</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Decision</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pendingRequests.map((req) => (
                      <TableRow key={req.id || req.village_name}>
                        <TableCell>
                          <Typography variant="body2" fontWeight={700} color="primary.main">
                            {req.village_name}
                          </Typography>
                        </TableCell>
                        <TableCell>{req.taluka || "N/A"}</TableCell>
                        <TableCell>
                          <Typography variant="caption" color="text.secondary">
                            &ldquo;{req.reason || "Field visit needed"}&rdquo;
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption">
                            {req.created_at ? new Date(req.created_at).toLocaleDateString("en-IN") : "Today"}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Box display="flex" gap={1} justifyContent="flex-end">
                            <Button
                              size="small"
                              variant="contained"
                              color="success"
                              startIcon={<ApproveIcon />}
                              onClick={() => {
                                if (req.id) handleReviewRequest(req.id, "approved", req);
                              }}
                              disabled={!req.id}
                              sx={{ textTransform: "none", py: 0.2 }}
                            >
                              Approve
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              startIcon={<RejectIcon />}
                              onClick={() => {
                                if (req.id) handleReviewRequest(req.id, "rejected", req);
                              }}
                              disabled={!req.id}
                              sx={{ textTransform: "none", py: 0.2 }}
                            >
                              Reject
                            </Button>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}
      </DialogContent>

      {/* ── Dialog Actions ──────────────────────────────────────────────── */}
      <DialogActions sx={{ p: 2.5, bgcolor: "grey.50", display: "flex", justifyContent: "space-between" }}>
        <Box>
          <Typography variant="caption" color="text.secondary">
            {assignedVillages.length} villages designated for {currentOfficerEmail}
          </Typography>
        </Box>
        <Box display="flex" gap={1.5}>
          {!isMandatoryFirstTime && (
            <Button onClick={onClose} variant="outlined" color="inherit">
              Cancel
            </Button>
          )}
          <Button
            variant="contained"
            color="primary"
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
            onClick={handleSaveVillages}
            disabled={saving}
            sx={{
              fontWeight: 700,
              textTransform: "none",
              px: 3,
            }}
          >
            {saving ? "Saving Territory..." : "Submit & Save Territory"}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
