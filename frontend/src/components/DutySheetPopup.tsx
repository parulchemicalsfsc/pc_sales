import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "../hooks/useTranslation";
import {
  Dialog,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  CircularProgress,
  Box,
  Switch,
  FormControlLabel,
  Alert,
  LinearProgress,
  Grid,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField,
  Chip,
  Stack,
} from "@mui/material";
import {
  CheckCircle as CheckIcon,
  Map as MapIcon,
  Warning as WarningIcon,
  PhoneDisabled as PhoneDisabledIcon,
} from "@mui/icons-material";
import { useAuth } from "../contexts/AuthContext";
import { attendanceAPI, automationAPI } from "../services/api";
import apiClient from "../services/api";

// Google Fonts: IBM Plex Mono
const FONT_LINK_ID = "ibm-plex-mono-font";
if (typeof document !== "undefined" && !document.getElementById(FONT_LINK_ID)) {
  const link = document.createElement("link");
  link.id = FONT_LINK_ID;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap";
  document.head.appendChild(link);
}

// ─── Design tokens ──────────────────────────────────────────────────────────
const T = {
  bg: "#f5f5f0",           // off-white body
  surface: "#ffffff",       // card/dialog surface
  charcoal: "#111111",      // dark header, submit button
  charcoalMid: "#1a1a1a",   // slightly lighter charcoal
  amber: "#f59e0b",         // accent color
  amberDark: "#d97706",     // amber hover
  amberLight: "#fef3c7",    // amber tint
  green: "#15803d",         // ON toggle
  gray: "#9ca3af",          // OFF toggle
  border: "#e2e2e2",        // standard border
  borderDark: "#d1d1d1",    // slightly darker border
  textPrimary: "#111111",
  textSecondary: "#6b6b6b",
  textMuted: "#9ca3af",
  red: "#dc2626",
  redLight: "#fee2e2",
  mono: "'IBM Plex Mono', 'JetBrains Mono', monospace",
  sans: "'Inter', 'Helvetica Neue', Arial, sans-serif",
  bgHover: "#e5e7eb",
};

// ─── Roles allowed to manage the duty sheet ─────────────────────────────────
const DUTY_ROLES = ["admin", "sales_manager", "manager"];

interface Telecaller {
  email: string;
  name: string;
  role: string;
  is_on_duty: boolean;
  group?: string;
}

// ─── Custom toggle switch styles ────────────────────────────────────────────
const switchSx = (isOn: boolean) => ({
  "& .MuiSwitch-switchBase.Mui-checked": {
    color: T.green,
    "&:hover": { backgroundColor: "transparent" },
  },
  "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
    backgroundColor: T.green,
    opacity: 1,
  },
  "& .MuiSwitch-switchBase": {
    color: "#ffffff",
    "&:hover": { backgroundColor: "transparent" },
  },
  "& .MuiSwitch-track": {
    backgroundColor: isOn ? T.green : T.gray,
    opacity: 1,
    borderRadius: 2,
  },
  "& .MuiSwitch-thumb": {
    boxShadow: "none",
    borderRadius: 1,
  },
});

// ─── Component ───────────────────────────────────────────────────────────────
const DutySheetPopup: React.FC = () => {
  const { t, language } = useTranslation();

  const getISTTimeString = useCallback((): string => {
    const localeMap: { [key: string]: string } = {
      en: "en-IN",
      hi: "hi-IN",
      gu: "gu-IN",
    };
    return new Date().toLocaleTimeString(localeMap[language] || "en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }, [language]);

  const getISTDateString = useCallback((): string => {
    const localeMap: { [key: string]: string } = {
      en: "en-IN",
      hi: "hi-IN",
      gu: "gu-IN",
    };
    return new Date().toLocaleDateString(localeMap[language] || "en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }, [language]);

  const { user, role, permissionsLoaded } = useAuth();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [telecallers, setTelecallers] = useState<Telecaller[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [currentTime, setCurrentTime] = useState(getISTTimeString());
  const [step, setStep] = useState(1);
  const [locations, setLocations] = useState<any>({});
  const [selState, setSelState] = useState("");
  const [selDistrict, setSelDistrict] = useState("");
  const [selTaluka, setSelTaluka] = useState("");
  const [selVillage, setSelVillage] = useState("");
  const [selectedTelecallers, setSelectedTelecallers] = useState<string[]>([]);

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(getISTTimeString()), 30000);
    return () => clearInterval(timer);
  }, [getISTTimeString]);

  useEffect(() => {
    setCurrentTime(getISTTimeString());
  }, [language, getISTTimeString]);

  // ── Check if popup should open ──────────────────────────────────────────
  useEffect(() => {
    if (!permissionsLoaded || !user || !role) {
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
        const res = await apiClient.get("/api/attendance/duty-sheet-status", {
          headers: { "x-user-role": normalizedRole },
        });
        if (res.data.should_show_popup) {
          const [tcRes, locRes] = await Promise.all([
             attendanceAPI.getAllTelecallers(),
             automationAPI.getLocations().catch(() => ({})),
          ]);
          setLocations(locRes || {});
          const data = tcRes.data;
          const combined = [
             ...(data.sales_managers || []).map((t: any) => ({ ...t, group: "Sales Managers" })),
             ...(data.telecallers || []).map((t: any) => ({ ...t, group: "Telecallers" }))
          ];
          setTelecallers(combined);
          setOpen(true);
        }
      } catch (err) {
        console.error("[DutySheet] Failed to check status:", err);
      } finally {
        setLoading(false);
      }
    };

    check();
  }, [user, role, permissionsLoaded]);

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
      setTimeout(() => {
        setStep(2);
        setSubmitSuccess(false);
        setSelectedTelecallers(telecallers.filter(t => t.is_on_duty && t.group === "Telecallers").map(t => t.email));
      }, 1500);
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;

      if (status === 409) {
        setSubmitError(t("dutySheet.alreadySubmitted", "Duty sheet was already submitted for today by another user."));
        setTimeout(() => {
          setSubmitError(null);
          setStep(2);
          setSelectedTelecallers(telecallers.filter(t => t.is_on_duty && t.group === "Telecallers").map(t => t.email));
        }, 1500);
      } else if (status === 400) {
        setSubmitError(detail || t("dutySheet.windowClosed", "Submission window has closed (must be before 10:00 AM IST)."));
      } else if (status === 403) {
        setSubmitError(t("dutySheet.noPermission", "You do not have permission to submit the duty sheet."));
      } else {
        setSubmitError(detail || t("dutySheet.failed", "Submission failed. Please try again."));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssignSabhsads = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = {
        telecaller_emails: selectedTelecallers,
        state: selState,
        district: selDistrict,
        taluka: selTaluka,
        village: selVillage,
      };
      await automationAPI.adminDistributeSabhsads(payload);
      setSubmitSuccess(true);
      setTimeout(() => {
        setSubmitSuccess(false);
        setSelVillage("");
        setSelectedTelecallers([]);
      }, 1500);
    } catch (err: any) {
      setSubmitError(err?.response?.data?.detail || "Distribution failed.");
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
          borderRadius: "4px",
          overflow: "hidden",
          backgroundColor: T.bg,
          boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
          border: `1px solid ${T.borderDark}`,
        },
      }}
    >
      {/* ── Header ── */}
      <Box
        sx={{
          backgroundColor: T.charcoal,
          borderLeft: `4px solid ${T.amber}`,
          px: "20px",
          py: "16px",
          color: "#ffffff",
        }}
      >
        <Typography
          sx={{
            fontFamily: T.mono,
            fontWeight: 700,
            fontSize: "1rem",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "#ffffff",
            lineHeight: 1.3,
          }}
        >
          {t("dutySheet.title", "Daily Telecaller Duty Sheet")}
        </Typography>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            mt: "6px",
          }}
        >
          <Typography
            sx={{
              fontFamily: T.mono,
              fontSize: "0.72rem",
              color: T.amber,
              fontWeight: 500,
              letterSpacing: "0.06em",
            }}
          >
            {currentTime} IST
          </Typography>
          <Typography sx={{ color: T.textMuted, fontSize: "0.72rem" }}>·</Typography>
          <Typography
            sx={{
              fontFamily: T.mono,
              fontSize: "0.72rem",
              color: "#9ca3af",
              letterSpacing: "0.03em",
            }}
          >
            {getISTDateString()}
          </Typography>
        </Box>
        <Typography
          sx={{
            fontFamily: T.sans,
            fontSize: "0.72rem",
            color: "#6b7280",
            mt: "4px",
            letterSpacing: "0.01em",
          }}
        >
          {t("dutySheet.mustSubmitBefore", "Must be submitted before 10:00 AM · Affects today's call distribution")}
        </Typography>
      </Box>

      <DialogContent
        sx={{
          px: "20px",
          pt: "20px",
          pb: 0,
          backgroundColor: T.bg,
        }}
      >
        {/* ── Error / Success Alerts ── */}
        {submitError && (
          <Box
            sx={{
              mb: "16px",
              p: "12px 14px",
              backgroundColor: submitError.includes("already submitted")
                ? "#fffbeb"
                : T.redLight,
              border: `1px solid ${submitError.includes("already submitted") ? T.amber : "#fca5a5"}`,
              borderLeft: `3px solid ${submitError.includes("already submitted") ? T.amber : T.red}`,
              borderRadius: "4px",
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
            }}
          >
            <WarningIcon
              sx={{
                fontSize: 16,
                color: submitError.includes("already submitted") ? T.amber : T.red,
                mt: "1px",
                flexShrink: 0,
              }}
            />
            <Typography
              sx={{
                fontFamily: T.sans,
                fontSize: "0.8rem",
                color: T.textPrimary,
                lineHeight: 1.4,
              }}
            >
              {submitError}
            </Typography>
            <Box
              component="button"
              onClick={() => setSubmitError(null)}
              sx={{
                ml: "auto",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: T.textMuted,
                fontSize: "1rem",
                lineHeight: 1,
                p: 0,
                flexShrink: 0,
                "&:hover": { color: T.textPrimary },
              }}
            >
              ×
            </Box>
          </Box>
        )}

        {submitSuccess && (
          <Box
            sx={{
              mb: "16px",
              p: "12px 14px",
              backgroundColor: "#f0fdf4",
              border: "1px solid #86efac",
              borderLeft: `3px solid ${T.green}`,
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <CheckIcon sx={{ fontSize: 16, color: T.green, flexShrink: 0 }} />
            <Typography sx={{ fontFamily: T.sans, fontSize: "0.8rem", color: T.textPrimary }}>
              {t("dutySheet.dutySheetSubmitted", "Duty sheet submitted. Distribution will proceed with {count} telecallers.").replace("{count}", String(onDutyCount))}
            </Typography>
          </Box>
        )}

        {step === 1 && (<>
{/* ── Duty summary bar ── */}
        <Box
          sx={{
            p: "14px 16px",
            backgroundColor: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: "4px",
            mb: "16px",
          }}
        >
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              mb: "10px",
            }}
          >
            <Typography
              sx={{
                fontFamily: T.sans,
                fontSize: "0.75rem",
                fontWeight: 600,
                color: T.textSecondary,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {t("dutySheet.onDutyToday", "On Duty Today")}
            </Typography>
            <Typography
              sx={{
                fontFamily: T.mono,
                fontSize: "1.1rem",
                fontWeight: 700,
                color: onDutyCount === 0 ? T.red : T.charcoal,
                letterSpacing: "0.02em",
              }}
            >
              {onDutyCount}
              <Typography
                component="span"
                sx={{
                  fontFamily: T.mono,
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  color: T.textMuted,
                }}
              >
                {" "}/ {totalCount}
              </Typography>
            </Typography>
          </Box>
          {/* Progress bar: amber fill, dark gray track */}
          <Box
            sx={{
              height: "5px",
              backgroundColor: "#d1d5db",
              borderRadius: "2px",
              overflow: "hidden",
            }}
          >
            <Box
              sx={{
                height: "100%",
                width: `${dutyProgress}%`,
                backgroundColor: onDutyCount === 0 ? T.red : T.amber,
                borderRadius: "2px",
                transition: "width 0.3s ease",
              }}
            />
          </Box>
        </Box>

        {/* ── Zero duty warning ── */}
        {onDutyCount === 0 && !submitSuccess && (
          <Box
            sx={{
              mb: "16px",
              p: "10px 14px",
              backgroundColor: "#fffbeb",
              border: `1px solid ${T.amber}`,
              borderLeft: `3px solid ${T.amberDark}`,
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <WarningIcon sx={{ fontSize: 14, color: T.amberDark, flexShrink: 0 }} />
            <Typography sx={{ fontFamily: T.sans, fontSize: "0.78rem", color: "#92400e" }}>
              {t("dutySheet.noTelecallersWarning", "No telecallers on duty — distribution will be skipped today.")}
            </Typography>
          </Box>
        )}

        {/* ── Instruction ── */}
        <Typography
          sx={{
            fontFamily: T.sans,
            fontSize: "0.8rem",
            color: T.textSecondary,
            mb: "12px",
            lineHeight: 1.5,
          }}
        >
          {t("dutySheet.toggleOnInstruction", "Toggle ON for telecallers present today. Only ON-duty telecallers will receive call assignments.")}
        </Typography>

        {/* ── Select/Clear All — text-only ── */}
        <Box sx={{ display: "flex", gap: "16px", mb: "12px", alignItems: "center" }}>
          <Box
            component="button"
            onClick={handleSelectAll}
            disabled={submitting || submitSuccess}
            sx={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: T.sans,
              fontSize: "0.78rem",
              fontWeight: 600,
              color: T.green,
              textDecoration: "none",
              p: 0,
              opacity: submitting || submitSuccess ? 0.4 : 1,
              "&:hover": { textDecoration: "underline" },
              "&:disabled": { cursor: "not-allowed" },
            }}
          >
            {t("dutySheet.selectAll", "Select All")}
          </Box>
          <Box
            sx={{
              width: "1px",
              height: "12px",
              backgroundColor: T.border,
            }}
          />
          <Box
            component="button"
            onClick={handleClearAll}
            disabled={submitting || submitSuccess}
            sx={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: T.sans,
              fontSize: "0.78rem",
              fontWeight: 600,
              color: T.red,
              textDecoration: "none",
              p: 0,
              opacity: submitting || submitSuccess ? 0.4 : 1,
              "&:hover": { textDecoration: "underline" },
              "&:disabled": { cursor: "not-allowed" },
            }}
          >
            {t("dutySheet.clearAll", "Clear All")}
          </Box>
        </Box>

        {/* ── Divider ── */}
        <Box sx={{ height: "1px", backgroundColor: T.border, mb: "12px" }} />

        {/* ── Telecaller list ── */}
        {telecallers.length === 0 ? (
          <Box
            sx={{
              textAlign: "center",
              py: "32px",
              color: T.textMuted,
            }}
          >
            <PhoneDisabledIcon sx={{ fontSize: 36, opacity: 0.3, mb: "8px" }} />
            <Typography
              sx={{ fontFamily: T.sans, fontSize: "0.82rem", color: T.textMuted }}
            >
              {t("dutySheet.noTelecallersFound", "No telecallers found in the system.")}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: "16px", mb: "4px" }}>
            {["Sales Managers", "Telecallers"].map((groupName) => {
              const groupData = telecallers.filter((tc) => tc.group === groupName);
              if (groupData.length === 0) return null;
              
              return (
                <Box key={groupName} sx={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <Typography
                    sx={{
                      fontFamily: T.sans,
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: T.charcoalMid,
                      mb: "4px",
                      px: "4px"
                    }}
                  >
                    {groupName}
                  </Typography>
                  {groupData.map((tc) => (
                    <Box
                      key={tc.email}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        px: "14px",
                        py: "10px",
                        backgroundColor: tc.is_on_duty ? T.surface : "#fafafa",
                        border: `1px solid ${tc.is_on_duty ? T.border : T.border}`,
                        borderLeft: `3px solid ${tc.is_on_duty ? T.amber : T.border}`,
                        borderRadius: "4px",
                        transition: "border-color 0.15s ease, background-color 0.15s ease",
                      }}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        {/* Flat monogram square */}
                        <Box
                          sx={{
                            width: 34,
                            height: 34,
                            borderRadius: "4px",
                            backgroundColor: tc.is_on_duty ? T.amber : "#e5e7eb",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            transition: "background-color 0.15s ease",
                          }}
                        >
                          <Typography
                            sx={{
                              fontFamily: T.mono,
                              fontSize: "0.85rem",
                              fontWeight: 700,
                              color: tc.is_on_duty ? T.charcoal : T.textMuted,
                              lineHeight: 1,
                            }}
                          >
                            {(tc.name || tc.email).charAt(0).toUpperCase()}
                          </Typography>
                        </Box>

                        <Box>
                          <Typography
                            sx={{
                              fontFamily: T.sans,
                              fontSize: "0.85rem",
                              fontWeight: 600,
                              color: T.textPrimary,
                              lineHeight: 1.2,
                            }}
                          >
                            {tc.name || tc.email}
                          </Typography>
                          <Typography
                            sx={{
                              fontFamily: T.mono,
                              fontSize: "0.67rem",
                              color: T.textMuted,
                              letterSpacing: "0.01em",
                            }}
                          >
                            {tc.email}
                          </Typography>
                        </Box>
                      </Box>

                      <Box sx={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Typography
                          sx={{
                            fontFamily: T.mono,
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            color: tc.is_on_duty ? T.green : T.gray,
                            letterSpacing: "0.1em",
                            minWidth: "24px",
                            textAlign: "right",
                          }}
                        >
                          {tc.is_on_duty ? t("dutySheet.onDuty", "ON") : t("dutySheet.offDuty", "OFF")}
                        </Typography>
                        <Switch
                          checked={tc.is_on_duty}
                          onChange={() => handleToggle(tc.email)}
                          disabled={submitting || submitSuccess}
                          size="small"
                          sx={switchSx(tc.is_on_duty)}
                        />
                      </Box>
                    </Box>
                  ))}
                </Box>
              );
            })}
          </Box>
        )}
        </>)}

        {/* ── Step 2: Sabhsad Distribution ── */}
        {step === 2 && (
          <Box sx={{ mt: 2, pb: 4 }}>
            <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
              <MapIcon sx={{ color: T.amber }} />
              <Typography sx={{ fontFamily: T.sans, fontWeight: 600, fontSize: '0.9rem', color: T.textPrimary }}>
                Assign Sabhsads to Present Telecallers
              </Typography>
            </Box>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <FormControl size="small" fullWidth>
                  <InputLabel>State</InputLabel>
                  <Select label="State" value={selState} onChange={(e) => { setSelState(e.target.value); setSelDistrict(""); setSelTaluka(""); setSelVillage(""); }} sx={{ borderRadius: 1 }}>
                    <MenuItem value="">All States</MenuItem>
                    {Object.keys(locations).map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl size="small" fullWidth disabled={!selState}>
                  <InputLabel>District</InputLabel>
                  <Select label="District" value={selDistrict} onChange={(e) => { setSelDistrict(e.target.value); setSelTaluka(""); setSelVillage(""); }} sx={{ borderRadius: 1 }}>
                    <MenuItem value="">All Districts</MenuItem>
                    {selState && Object.keys(locations[selState] || {}).map(d => <MenuItem key={d} value={d}>{d}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl size="small" fullWidth disabled={!selDistrict}>
                  <InputLabel>Taluka</InputLabel>
                  <Select label="Taluka" value={selTaluka} onChange={(e) => { setSelTaluka(e.target.value); setSelVillage(""); }} sx={{ borderRadius: 1 }}>
                    <MenuItem value="">All Talukas</MenuItem>
                    {selDistrict && Object.keys(locations[selState]?.[selDistrict] || {}).map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl size="small" fullWidth disabled={!selTaluka}>
                  <InputLabel>Village</InputLabel>
                  <Select label="Village" value={selVillage} onChange={(e) => setSelVillage(e.target.value)} sx={{ borderRadius: 1 }}>
                    <MenuItem value="">All Villages</MenuItem>
                    {selTaluka && (locations[selState]?.[selDistrict]?.[selTaluka] || []).map((v: string) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Assign To</InputLabel>
                  <Select
                    label="Assign To"
                    multiple
                    value={selectedTelecallers}
                    onChange={(e) => setSelectedTelecallers(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
                    sx={{ borderRadius: 1 }}
                    renderValue={(selected) => (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {selected.map((value) => (
                          <Chip key={value} label={telecallers.find(t => t.email === value)?.name || value.split('@')[0]} size="small" />
                        ))}
                      </Box>
                    )}
                  >
                    {telecallers.filter(t => t.is_on_duty && t.group === 'Telecallers').map((t) => (
                      <MenuItem key={t.email} value={t.email}>
                        {t.name || t.email.split("@")[0]}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Box>
        )}
      </DialogContent>

      {/* ── Actions ── */}
      <DialogActions
        sx={{
          px: "20px",
          py: "16px",
          mt: "16px",
          borderTop: `1px solid ${T.border}`,
          backgroundColor: T.bg,
        }}
      >
        {step === 1 ? (
          <Box
            component="button"
            onClick={handleSubmit}
            disabled={submitting || submitSuccess}
            sx={{
              width: "100%",
              py: "12px",
              px: "20px",
              backgroundColor: submitSuccess ? T.green : T.charcoal,
              color: "#ffffff",
              border: "none",
              borderBottom: `3px solid ${submitSuccess ? "#166534" : T.amber}`,
              borderRadius: "4px",
              cursor: submitting || submitSuccess ? "not-allowed" : "pointer",
              fontFamily: T.mono,
              fontSize: "0.82rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              opacity: submitting ? 0.7 : 1,
              transition: "background-color 0.15s ease, opacity 0.15s ease",
              "&:hover:not(:disabled)": {
                backgroundColor: submitSuccess ? "#166534" : T.charcoalMid,
              },
            }}
          >
            {submitting ? (
              <>
                <CircularProgress size={14} sx={{ color: "#ffffff" }} />
                {t("dutySheet.confirming", "Submitting...")}
              </>
            ) : submitSuccess ? (
              <>
                <CheckIcon sx={{ fontSize: 16 }} />
                {t("dutySheet.confirmed", "Duty Sheet Confirmed")}
              </>
            ) : (
              "Next: Assign Villages →"
            )}
          </Box>
        ) : (
          <Box sx={{ display: 'flex', gap: '12px', width: '100%' }}>
            <Box
              component="button"
              onClick={() => setOpen(false)}
              sx={{
                flex: 1,
                py: "12px",
                px: "20px",
                backgroundColor: "transparent",
                color: T.charcoal,
                border: `1px solid ${T.borderDark}`,
                borderRadius: "4px",
                cursor: "pointer",
                fontFamily: T.mono,
                fontSize: "0.82rem",
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                "&:hover": {
                  backgroundColor: T.bgHover,
                },
              }}
            >
              Finish & Close
            </Box>
            <Box
              component="button"
              onClick={handleAssignSabhsads}
              disabled={submitting || submitSuccess || !selVillage || selectedTelecallers.length === 0}
              sx={{
                flex: 2,
                py: "12px",
                px: "20px",
                backgroundColor: submitSuccess ? T.green : T.charcoal,
                color: "#ffffff",
                border: "none",
                borderBottom: `3px solid ${submitSuccess ? "#166534" : T.amber}`,
                borderRadius: "4px",
                cursor: submitting || submitSuccess || !selVillage || selectedTelecallers.length === 0 ? "not-allowed" : "pointer",
                fontFamily: T.mono,
                fontSize: "0.82rem",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                opacity: (submitting || !selVillage || selectedTelecallers.length === 0) && !submitSuccess ? 0.6 : 1,
                transition: "background-color 0.15s ease, opacity 0.15s ease",
                "&:hover:not(:disabled)": {
                  backgroundColor: submitSuccess ? "#166534" : T.charcoalMid,
                },
              }}
            >
              {submitting ? (
                <>
                  <CircularProgress size={14} sx={{ color: "#ffffff" }} />
                  {t("dutySheet.confirming", "Assigning...")}
                </>
              ) : submitSuccess ? (
                <>
                  <CheckIcon sx={{ fontSize: 16 }} />
                  Assigned Successfully
                </>
              ) : (
                "Assign Village"
              )}
            </Box>
          </Box>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default DutySheetPopup;
