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
} from "@mui/icons-material";
import { supabase } from "../lib/supabaseClient";

interface ChangePasswordDialogProps {
  open: boolean;
  onClose: () => void;
  isMandatory?: boolean; // When password expired >90 days, cannot dismiss without changing
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
    if (isMandatory && !success) return; // Prevent closing if mandatory expiry
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setSuccess(false);
    onClose();
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
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        throw updateError;
      }

      // Record password change timestamp
      localStorage.setItem("last_password_change", new Date().toISOString());

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
      onClose={handleClose}
      maxWidth="xs"
      fullWidth
      disableEscapeKeyDown={isMandatory && !success}
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <LockIcon color="primary" />
          <Typography variant="h6" fontWeight={700}>
            {isMandatory ? "Password Update Required" : "Change Password"}
          </Typography>
        </DialogTitle>

        <DialogContent dividers>
          {isMandatory && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              For security compliance, your password must be updated every 60–90 days.
              Please set a new password to continue.
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
            {!isMandatory && (
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
