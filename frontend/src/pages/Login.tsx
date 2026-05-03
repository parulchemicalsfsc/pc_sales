import { useState } from "react";
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Alert,
  InputAdornment,
  CircularProgress,
  Container,
} from "@mui/material";
import {
  MailOutline as MailOutlineIcon,
  LockOutlined as LockOutlinedIcon,
} from "@mui/icons-material";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "../hooks/useTranslation";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

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

      if (err.message?.includes("ACCOUNT_DEACTIVATED")) {
        setError("Your account has been deactivated. Please contact your administrator.");
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

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #7A1C9A 0%, #D48888 50%, #7A1C9A 100%)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <Container maxWidth="md" sx={{ display: "flex", justifyContent: "center" }}>
        <Paper
          elevation={0}
          sx={{
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            width: "100%",
            maxWidth: 900,
            minHeight: 550,
            borderRadius: 6,
            background: "rgba(255, 255, 255, 0.25)",
            backdropFilter: "blur(20px)",
            boxShadow: "0 15px 35px rgba(0,0,0,0.2)",
            overflow: "hidden",
          }}
        >
          {/* Left Side: Video */}
          <Box
            sx={{
              flex: 1,
              p: 2,
              display: "flex",
              alignItems: "stretch",
            }}
          >
            <Box
              sx={{
                width: "100%",
                height: "100%",
                borderRadius: 5,
                overflow: "hidden",
                boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
                backgroundColor: "#7A1C9A", // Placeholder color while video loads
                backgroundImage: "linear-gradient(135deg, #4A0E64 0%, #2A0845 100%)", // Matching deep tone
              }}
            >
              <video
                src="/animate.mp4"
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                disablePictureInPicture
                disableRemotePlayback
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            </Box>
          </Box>

          {/* Right Side: Form */}
          <Box
            sx={{
              flex: 1,
              p: { xs: 4, md: 6 },
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <Typography
              variant="h3"
              sx={{
                mb: 6,
                fontWeight: 300,
                color: "#2a1538",
                textAlign: "center",
                letterSpacing: 1.5,
              }}
            >
              Login
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            <form onSubmit={handleSubmit}>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <TextField
                  fullWidth
                  variant="standard"
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <MailOutlineIcon sx={{ color: "#2a1538" }} fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                  sx={{
                    "& .MuiInput-underline:before": { borderBottomColor: "rgba(42,21,56,0.3)" },
                    "& .MuiInput-underline:hover:not(.Mui-disabled):before": { borderBottomColor: "rgba(42,21,56,0.6)" },
                    "& .MuiInput-underline:after": { borderBottomColor: "#2a1538" },
                    "& label": { color: "rgba(42,21,56,0.7)", fontWeight: 500 },
                    "& label.Mui-focused": { color: "#2a1538" },
                    "& input": { color: "#2a1538" },
                  }}
                />

                <TextField
                  fullWidth
                  variant="standard"
                  label="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <LockOutlinedIcon sx={{ color: "#2a1538" }} fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                  sx={{
                    "& .MuiInput-underline:before": { borderBottomColor: "rgba(42,21,56,0.3)" },
                    "& .MuiInput-underline:hover:not(.Mui-disabled):before": { borderBottomColor: "rgba(42,21,56,0.6)" },
                    "& .MuiInput-underline:after": { borderBottomColor: "#2a1538" },
                    "& label": { color: "rgba(42,21,56,0.7)", fontWeight: 500 },
                    "& label.Mui-focused": { color: "#2a1538" },
                    "& input": { color: "#2a1538" },
                  }}
                />

                <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={isLoading}
                    sx={{
                      px: 5,
                      py: 1,
                      borderRadius: 8,
                      backgroundColor: "#1c0d26",
                      color: "#fff",
                      textTransform: "none",
                      fontWeight: 600,
                      fontSize: "1rem",
                      boxShadow: "0 4px 14px rgba(28, 13, 38, 0.4)",
                      "&:hover": {
                        backgroundColor: "#311842",
                        boxShadow: "0 6px 20px rgba(28, 13, 38, 0.5)",
                      },
                      "&:disabled": {
                        backgroundColor: "rgba(28, 13, 38, 0.5)",
                      }
                    }}
                  >
                    {isLoading ? <CircularProgress size={24} color="inherit" /> : "Login"}
                  </Button>
                </Box>
              </Box>
            </form>

            <Box
              sx={{
                mt: 8,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Typography
                variant="body2"
                sx={{ 
                  color: "rgba(42,21,56,0.7)", 
                  fontSize: "0.85rem",
                  cursor: "pointer", 
                  "&:hover": { color: "#2a1538" } 
                }}
              >
                Creat an account
              </Typography>
              <Typography
                variant="body2"
                sx={{ 
                  color: "rgba(42,21,56,0.7)", 
                  fontSize: "0.85rem",
                  cursor: "pointer", 
                  "&:hover": { color: "#2a1538" } 
                }}
              >
                Forgot your password
              </Typography>
            </Box>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
