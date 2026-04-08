import { useState } from "react";
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Alert,
  InputAdornment,
  IconButton,
  CircularProgress,
  Container,
} from "@mui/material";
import {
  Visibility,
  VisibilityOff,
  Login as LoginIcon,
} from "@mui/icons-material";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "../hooks/useTranslation";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    // Basic validation
    if (!email || !password) {
      setError("Please enter both email and password");
      setIsLoading(false);
      return;
    }

    try {
      await signIn(email, password);
      navigate("/dashboard");
    } catch (err: any) {
      console.error("Login error:", err);

      // Handle specific error messages
      if (err.message?.includes("ACCOUNT_DEACTIVATED")) {
        setError(
          "Your account has been deactivated. Please contact your administrator."
        );
      } else if (err.message?.includes("Invalid login credentials")) {
        setError("Invalid email or password. Please try again.");
      } else if (err.message?.includes("Email not confirmed")) {
        setError("Please verify your email address before logging in.");
      } else if (err.message) {
        setError(err.message);
      } else {
        setError("Failed to sign in. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleTogglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        position: "relative",
        overflow: "hidden",
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background:
            "radial-gradient(circle at 20% 50%, rgba(255,255,255,0.1) 0%, transparent 50%)",
          pointerEvents: "none",
        },
      }}
    >
      <Container maxWidth="sm">
        <Paper
          elevation={24}
          sx={{
            p: { xs: 3, sm: 5 },
            borderRadius: 4,
            position: "relative",
            zIndex: 1,
            backdropFilter: "blur(10px)",
            backgroundColor: "rgba(255, 255, 255, 0.95)",
          }}
        >
          {/* Logo and Company Name */}
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              mb: 4,
            }}
          >
            <Box
              sx={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                mb: 2,
                boxShadow: "0 8px 16px rgba(102, 126, 234, 0.3)",
              }}
            >
              <Typography
                variant="h3"
                sx={{
                  color: "white",
                  fontWeight: 700,
                  fontSize: "2.5rem",
                }}
              >
                PC
              </Typography>
            </Box>

            <Typography
              variant="h4"
              sx={{
                fontWeight: 700,
                color: "primary.main",
                mb: 1,
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                textAlign: "center",
              }}
            >
              Parul Chemicals
            </Typography>

            <Typography
              variant="body1"
              sx={{
                color: "text.secondary",
                textAlign: "center",
                fontWeight: 500,
              }}
            >
              {t("common.salesManagementSystem", "Sales Management System")}
            </Typography>
          </Box>

          {/* Welcome Message */}
          <Box sx={{ mb: 3, textAlign: "center" }}>
            <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
              {t("login.welcomeBack", "Welcome Back")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("login.signInSubtitle", "Sign in to access your dashboard")}
            </Typography>
          </Box>

          {/* Error Alert */}
          {error && (
            <Alert
              severity="error"
              sx={{ mb: 3 }}
              onClose={() => setError(null)}
            >
              {error}
            </Alert>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit}>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
              <TextField
                fullWidth
                label={t("login.emailAddress", "Email Address")}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                autoComplete="email"
                autoFocus
                variant="outlined"
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                  },
                }}
              />

              <TextField
                fullWidth
                label={t("login.password", "Password")}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                autoComplete="current-password"
                variant="outlined"
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                  },
                }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={handleTogglePasswordVisibility}
                        edge="end"
                        disabled={isLoading}
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <Button
                type="submit"
                variant="contained"
                size="large"
                fullWidth
                disabled={isLoading}
                startIcon={
                  isLoading ? (
                    <CircularProgress size={20} color="inherit" />
                  ) : (
                    <LoginIcon />
                  )
                }
                sx={{
                  py: 1.5,
                  borderRadius: 2,
                  fontSize: "1rem",
                  fontWeight: 600,
                  textTransform: "none",
                  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  boxShadow: "0 4px 12px rgba(102, 126, 234, 0.4)",
                  "&:hover": {
                    boxShadow: "0 6px 16px rgba(102, 126, 234, 0.5)",
                    background:
                      "linear-gradient(135deg, #5568d3 0%, #6941a0 100%)",
                  },
                  "&:disabled": {
                    background: "rgba(0, 0, 0, 0.12)",
                  },
                }}
              >
                {isLoading ? t("login.signingIn", "Signing In...") : t("login.signIn", "Sign In")}
              </Button>
            </Box>
          </form>

          {/* Footer Text */}
          <Box sx={{ mt: 4, textAlign: "center" }}>
            <Typography variant="caption" color="text.secondary">
              © {new Date().getFullYear()} Parul Chemicals. {t("login.allRightsReserved", "All rights reserved.")}
            </Typography>
          </Box>
        </Paper>
      </Container>

      {/* Decorative Elements */}
      <Box
        sx={{
          position: "absolute",
          bottom: -100,
          right: -100,
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: "rgba(255, 255, 255, 0.1)",
          pointerEvents: "none",
        }}
      />
      <Box
        sx={{
          position: "absolute",
          top: -50,
          left: -50,
          width: 200,
          height: 200,
          borderRadius: "50%",
          background: "rgba(255, 255, 255, 0.1)",
          pointerEvents: "none",
        }}
      />
    </Box>
  );
}
