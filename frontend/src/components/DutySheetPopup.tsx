import React, { useEffect, useState, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  CircularProgress,
  Box,
  Switch,
  FormControlLabel,
  Divider,
  Chip,
  Avatar,
  Alert,
  alpha,
  useTheme,
  LinearProgress,
} from "@mui/material";
import {
  AccessTime as ClockIcon,
  Groups as GroupsIcon,
  CheckCircle as CheckIcon,
  Warning as WarningIcon,
  Person as PersonIcon,
} from "@mui/icons-material";
import { useAuth } from "../contexts/AuthContext";
import { attendanceAPI } from "../services/api";

// ─── Roles allowed to manage the duty sheet ─────────────────────────────────
const DUTY_ROLES = ["admin", "sales_manager", "manager"];

interface Telecaller {
  email: string;
  name: string;
  role: string;
  is_on_duty: boolean;
}

// ─── Small utility: IST time string ─────────────────────────────────────────
const getISTTimeString = (): string => {
  return new Date().toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const getISTDateString = (): string => {
  return new Date().toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

// ─── Component ───────────────────────────────────────────────────────────────
const DutySheetPopup: React.FC = () => {
  const { user, role } = useAuth();
  const theme = useTheme();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [telecallers, setTelecallers] = useState<Telecaller[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [currentTime, setCurrentTime] = useState(getISTTimeString());

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(getISTTimeString()), 30000);
    return () => clearInterval(timer);
  }, []);

  // ── Check if popup should open ──────────────────────────────────────────
  useEffect(() => {
    if (!user || !role) {
      setLoading(false);
      return;
    }

    const normalizedRole = role.toLowerCase().replace(/ /g, "_");
    if (!DUTY_ROLES.includes(normalizedRole)) {
      setLoading(false);
      return;
    }

    const check = async () => {
      try {
        const res = await attendanceAPI.getDutySheetStatus();
        if (res.data.should_show_popup) {
          // Fetch telecaller list
          const tcRes = await attendanceAPI.getAllTelecallers();
          setTelecallers(tcRes.data.telecallers || []);
          setOpen(true);
        }
      } catch (err) {
        console.error("[DutySheet] Failed to check status:", err);
      } finally {
        setLoading(false);
      }
    };

    check();
  }, [user, role]);

  // ── Toggle individual telecaller ────────────────────────────────────────
  const handleToggle = useCallback((email: string) => {
    setTelecallers((prev) =>
      prev.map((tc) =>
        tc.email === email ? { ...tc, is_on_duty: !tc.is_on_duty } : tc
      )
    );
  }, []);

  // ── Select / Clear All ──────────────────────────────────────────────────
  const handleSelectAll = () =>
    setTelecallers((prev) => prev.map((tc) => ({ ...tc, is_on_duty: true })));

  const handleClearAll = () =>
    setTelecallers((prev) => prev.map((tc) => ({ ...tc, is_on_duty: false })));

  // ── Submit duty sheet ───────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);

    try {
      await attendanceAPI.submitDutySheet(
        telecallers.map((tc) => ({ email: tc.email, is_on_duty: tc.is_on_duty }))
      );
      setSubmitSuccess(true);
      // Close after a brief success flash
      setTimeout(() => setOpen(false), 1500);
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;

      if (status === 409) {
        setSubmitError("Duty sheet was already submitted for today by another user.");
        setTimeout(() => setOpen(false), 2500);
      } else if (status === 400) {
        setSubmitError(
          detail ||
            "Submission window has closed (must be before 10:00 AM IST)."
        );
      } else if (status === 403) {
        setSubmitError("You do not have permission to submit the duty sheet.");
      } else {
        setSubmitError(detail || "Submission failed. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onDutyCount = telecallers.filter((tc) => tc.is_on_duty).length;
  const totalCount = telecallers.length;
  const dutyProgress = totalCount > 0 ? (onDutyCount / totalCount) * 100 : 0;

  if (loading || !open) return null;

  return (
    <Dialog
      open={open}
      disableEscapeKeyDown
      onClose={(_, reason) => {
        if (reason === "backdropClick") return;
      }}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          overflow: "hidden",
          background:
            theme.palette.mode === "dark"
              ? "linear-gradient(145deg, #1a1a2e 0%, #16213e 100%)"
              : "linear-gradient(145deg, #ffffff 0%, #f8f9ff 100%)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.25)",
        },
      }}
    >
      {/* ── Header ── */}
      <Box
        sx={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          px: 3,
          py: 2.5,
          color: "white",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5 }}>
          <GroupsIcon sx={{ fontSize: 28 }} />
          <Typography variant="h5" fontWeight={700} letterSpacing={-0.5}>
            Daily Telecaller Duty Sheet
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, opacity: 0.9 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <ClockIcon sx={{ fontSize: 14 }} />
            <Typography variant="caption" fontWeight={600}>
              {currentTime} IST
            </Typography>
          </Box>
          <Typography variant="caption">•</Typography>
          <Typography variant="caption">{getISTDateString()}</Typography>
        </Box>
        <Typography
          variant="caption"
          sx={{
            display: "block",
            mt: 0.5,
            opacity: 0.8,
            fontStyle: "italic",
          }}
        >
          Must be submitted before 10:00 AM · Affects today's call distribution
        </Typography>
      </Box>

      <DialogContent sx={{ px: 3, pt: 3, pb: 0 }}>
        {/* ── Error / Success Alerts ── */}
        {submitError && (
          <Alert
            severity={submitError.includes("already submitted") ? "warning" : "error"}
            sx={{ mb: 2, borderRadius: 2 }}
            onClose={() => setSubmitError(null)}
          >
            {submitError}
          </Alert>
        )}
        {submitSuccess && (
          <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }} icon={<CheckIcon />}>
            Duty sheet submitted! Distribution will proceed with{" "}
            <strong>{onDutyCount}</strong> telecaller
            {onDutyCount !== 1 ? "s" : ""}.
          </Alert>
        )}

        {/* ── Duty summary bar ── */}
        <Box
          sx={{
            p: 2,
            borderRadius: 2,
            bgcolor: alpha(theme.palette.primary.main, 0.06),
            border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
            mb: 2.5,
          }}
        >
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mb: 1,
            }}
          >
            <Typography variant="body2" fontWeight={600} color="text.secondary">
              On Duty Today
            </Typography>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              <Chip
                label={`${onDutyCount} / ${totalCount}`}
                size="small"
                color={onDutyCount === 0 ? "error" : "primary"}
                sx={{ fontWeight: 700, fontSize: "0.85rem" }}
              />
            </Box>
          </Box>
          <LinearProgress
            variant="determinate"
            value={dutyProgress}
            color={onDutyCount === 0 ? "error" : "primary"}
            sx={{ borderRadius: 4, height: 6 }}
          />
        </Box>

        {/* ── Zero duty warning ── */}
        {onDutyCount === 0 && !submitSuccess && (
          <Alert
            severity="warning"
            icon={<WarningIcon />}
            sx={{ mb: 2, borderRadius: 2 }}
          >
            <strong>No telecallers on duty.</strong> Auto-distribution will be
            skipped today and you'll be notified.
          </Alert>
        )}

        {/* ── Instruction ── */}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Toggle ON for telecallers who are present today. Call distribution
          will only include ON-duty telecallers.
        </Typography>

        {/* ── Select/Clear All ── */}
        <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
          <Button
            size="small"
            variant="outlined"
            onClick={handleSelectAll}
            disabled={submitting || submitSuccess}
            sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600 }}
          >
            ✅ Select All
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={handleClearAll}
            disabled={submitting || submitSuccess}
            sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600 }}
          >
            Clear All
          </Button>
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* ── Telecaller list ── */}
        {telecallers.length === 0 ? (
          <Box
            sx={{
              textAlign: "center",
              py: 4,
              color: "text.secondary",
            }}
          >
            <PersonIcon sx={{ fontSize: 48, opacity: 0.3, mb: 1 }} />
            <Typography variant="body2">No telecallers found in the system.</Typography>
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mb: 1 }}>
            {telecallers.map((tc) => (
              <Box
                key={tc.email}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  p: 1.5,
                  borderRadius: 2,
                  border: `1px solid ${
                    tc.is_on_duty
                      ? alpha(theme.palette.success.main, 0.3)
                      : alpha(theme.palette.divider, 0.8)
                  }`,
                  bgcolor: tc.is_on_duty
                    ? alpha(theme.palette.success.main, 0.04)
                    : "transparent",
                  transition: "all 0.2s ease",
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                  <Avatar
                    sx={{
                      width: 36,
                      height: 36,
                      bgcolor: tc.is_on_duty
                        ? theme.palette.success.main
                        : alpha(theme.palette.text.secondary, 0.25),
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      transition: "background-color 0.2s",
                    }}
                  >
                    {(tc.name || tc.email).charAt(0).toUpperCase()}
                  </Avatar>
                  <Box>
                    <Typography variant="body2" fontWeight={600} lineHeight={1.2}>
                      {tc.name || tc.email}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontSize: "0.7rem" }}
                    >
                      {tc.email}
                    </Typography>
                  </Box>
                </Box>

                <FormControlLabel
                  control={
                    <Switch
                      checked={tc.is_on_duty}
                      onChange={() => handleToggle(tc.email)}
                      disabled={submitting || submitSuccess}
                      color="success"
                      size="medium"
                    />
                  }
                  label={
                    <Typography
                      variant="caption"
                      fontWeight={700}
                      color={tc.is_on_duty ? "success.main" : "text.disabled"}
                      sx={{ minWidth: 28 }}
                    >
                      {tc.is_on_duty ? "ON" : "OFF"}
                    </Typography>
                  }
                  labelPlacement="start"
                  sx={{ m: 0, gap: 0.5 }}
                />
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>

      {/* ── Actions ── */}
      <DialogActions
        sx={{
          px: 3,
          py: 2.5,
          gap: 1,
          borderTop: `1px solid ${theme.palette.divider}`,
          mt: 2,
        }}
      >
        <Button
          variant="contained"
          size="large"
          fullWidth
          onClick={handleSubmit}
          disabled={submitting || submitSuccess}
          startIcon={
            submitting ? (
              <CircularProgress size={18} color="inherit" />
            ) : submitSuccess ? (
              <CheckIcon />
            ) : undefined
          }
          sx={{
            py: 1.4,
            borderRadius: 2,
            fontWeight: 700,
            fontSize: "0.95rem",
            textTransform: "none",
            background: submitSuccess
              ? theme.palette.success.main
              : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            "&:hover": {
              background: submitSuccess
                ? theme.palette.success.dark
                : "linear-gradient(135deg, #5568d3 0%, #6941a0 100%)",
            },
            "&.Mui-disabled": {
              background: theme.palette.action.disabledBackground,
            },
          }}
        >
          {submitting
            ? "Submitting..."
            : submitSuccess
            ? "✅ Duty Sheet Submitted!"
            : `Submit Duty Sheet (${onDutyCount} on duty)`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DutySheetPopup;
