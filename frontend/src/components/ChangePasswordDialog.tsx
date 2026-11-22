import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  CircularProgress,
  IconButton,
  InputAdornment,
  Stack,
} from "@mui/material";
import {
  Lock as LockIcon,
  Visibility,
  VisibilityOff,
  CheckCircle as SuccessIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import { supabase } from "../lib/supabaseClient";

interface ChangePasswordDialogProps {
  open: boolean;
  onClose: () => void;
  isMandatory?: boolean; // When password expired >90 days, prompts user (can snooze)
}

export default function ChangePasswordDialog({
  open,
  onClose,
  isMandatory = false,
}: ChangePasswordDialogProps) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleClose = () => {
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setSuccess(false);
    onClose();
  };

  const handleSnooze = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        const snoozeUntil = Date.now() + 24 * 60 * 60 * 1000; // Snooze for 24 hours
        localStorage.setItem(`pwd_prompt_snoozed_until_${user.email.toLowerCase()}`, String(snoozeUntil));
      }
    } catch {
      // ignore
    }
    handleClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirm password do not match.");
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
        data: { last_password_change: new Date().toISOString() },
      });

      if (updateError) {
        throw updateError;
      }

      // Record password change timestamp with normalized email key
      if (user?.email) {
        const emailKey = user.email.toLowerCase();
        localStorage.setItem(`last_pwd_change_${emailKey}`, new Date().toISOString());
        localStorage.removeItem(`pwd_prompt_snoozed_until_${emailKey}`);
      }

      setSuccess(true);
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (err: any) {
      setError(err?.message || "Failed to update password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={isMandatory ? handleSnooze : handleClose}
      maxWidth="xs"
      fullWidth
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <LockIcon color="primary" />
            <Typography variant="h6" fontWeight={700}>
              {isMandatory ? "Password Update Required" : "Change Password"}
            </Typography>
          </Box>
          <IconButton size="small" onClick={isMandatory ? handleSnooze : handleClose} disabled={loading}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          {isMandatory && (
            <Alert severity="info" sx={{ mb: 2 }}>
              For security compliance, telecaller accounts must update passwords every 60–90 days.
              You can set a new password now or remind me later.
            </Alert>
          )}

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {success ? (
            <Box sx={{ py: 3, textAlign: "center" }}>
              <SuccessIcon color="success" sx={{ fontSize: 50, mb: 1 }} />
              <Typography variant="h6" color="success.main" fontWeight={600}>
                Password Changed Successfully!
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Your credentials have been securely updated.
              </Typography>
            </Box>
          ) : (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label="New Password"
                type={showPassword ? "text" : "password"}
                fullWidth
                size="small"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                helperText="Minimum 6 characters"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <TextField
                label="Confirm New Password"
                type={showPassword ? "text" : "password"}
                fullWidth
                size="small"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </Stack>
          )}
        </DialogContent>

        {!success && (
          <DialogActions sx={{ px: 3, py: 2 }}>
            {isMandatory ? (
              <Button onClick={handleSnooze} disabled={loading} color="inherit">
                Remind Me Later
              </Button>
            ) : (
              <Button onClick={handleClose} disabled={loading}>
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              variant="contained"
              disabled={loading || newPassword.length < 6 || !confirmPassword}
            >
              {loading ? <CircularProgress size={20} color="inherit" /> : "Update Password"}
            </Button>
          </DialogActions>
        )}
      </form>
    </Dialog>
  );
}
