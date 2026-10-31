import React, { useRef, useEffect } from "react";
import {
  TextField,
  TextFieldProps,
  InputAdornment,
  IconButton,
  Tooltip,
  Box,
  Typography,
  Chip,
  Stack,
  alpha,
  useTheme,
  keyframes,
} from "@mui/material";
import KeyboardVoiceIcon from "@mui/icons-material/KeyboardVoice";
import StopCircleIcon from "@mui/icons-material/StopCircle";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { useSpeechToText, SpeechLanguage, SPEECH_LANG_MAP } from "../hooks/useSpeechToText";

// Pulsing animation for active mic
const pulseAnimation = keyframes`
  0% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
    transform: scale(1);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(239, 68, 68, 0);
    transform: scale(1.06);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
    transform: scale(1);
  }
`;

const waveBarAnimation = keyframes`
  0%, 100% { height: 6px; }
  50% { height: 16px; }
`;

export interface VoiceTextFieldProps extends Omit<TextFieldProps, "onChange"> {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onValueChange?: (val: string) => void;
  speechLang?: SpeechLanguage;
  showLanguageSelector?: boolean;
}

export const VoiceTextField: React.FC<VoiceTextFieldProps> = ({
  value = "",
  onChange,
  onValueChange,
  speechLang,
  showLanguageSelector = true,
  InputProps,
  placeholder,
  ...props
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  // Holds text that was present in the input before the current voice session began
  const baseValueRef = useRef(value);

  // Keep baseValueRef synced when idle so manual typing is tracked
  const isListeningRef = useRef(false);

  const updateValue = (newValue: string) => {
    if (onValueChange) {
      onValueChange(newValue);
    }
    if (onChange) {
      const syntheticEvent = {
        target: { value: newValue },
      } as React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;
      onChange(syntheticEvent);
    }
  };

  const handleTranscript = (fullSessionText: string, isFinal: boolean) => {
    const cleanSessionText = fullSessionText.trim();
    if (!cleanSessionText) return;

    const base = baseValueRef.current.trim();
    const separator = base ? " " : "";
    const combined = base ? `${base}${separator}${cleanSessionText}` : cleanSessionText;

    updateValue(combined);

    if (isFinal) {
      baseValueRef.current = combined;
    }
  };

  const {
    isListening,
    liveTranscript,
    audioLevel,
    error,
    language,
    startListening,
    stopListening,
    toggleListening,
    setLanguage,
  } = useSpeechToText({
    language: speechLang,
    onTranscript: handleTranscript,
  });

  isListeningRef.current = isListening;

  // When speech starts, snapshot whatever is in the input box right now
  const handleToggle = () => {
    if (!isListening) {
      baseValueRef.current = value || "";
      toggleListening();
    } else {
      stopListening();
    }
  };

  // Allow manual typing to update base value
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    baseValueRef.current = e.target.value;
    if (onChange) {
      onChange(e);
    }
  };

  // Keyboard shortcut Alt+V to toggle speech-to-text
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey && (e.key === "v" || e.key === "V")) {
      e.preventDefault();
      handleToggle();
    }
    if (props.onKeyDown) {
      props.onKeyDown(e);
    }
  };

  return (
    <Box sx={{ width: "100%", position: "relative" }}>
      <TextField
        {...props}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={isListening ? "Listening... start talking now" : placeholder}
        InputProps={{
          ...InputProps,
          endAdornment: (
            <InputAdornment
              position="end"
              sx={{
                alignSelf: props.multiline ? "flex-start" : "center",
                mt: props.multiline ? 0.75 : 0,
                ml: 1,
              }}
            >
              <Tooltip
                title={
                  isListening
                    ? "Click or press Alt+V to stop dictation"
                    : `Keyboard Voice Typing: Click or press Alt+V to speak in ${SPEECH_LANG_MAP[language].label}`
                }
                arrow
              >
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleToggle();
                  }}
                  color={isListening ? "error" : "primary"}
                  sx={{
                    p: 0.75,
                    bgcolor: isListening
                      ? alpha(theme.palette.error.main, 0.15)
                      : alpha(theme.palette.primary.main, 0.08),
                    color: isListening ? theme.palette.error.main : theme.palette.primary.main,
                    border: `1px solid ${
                      isListening
                        ? alpha(theme.palette.error.main, 0.5)
                        : alpha(theme.palette.primary.main, 0.2)
                    }`,
                    animation: isListening ? `${pulseAnimation} 1.5s infinite` : "none",
                    "&:hover": {
                      bgcolor: isListening
                        ? alpha(theme.palette.error.main, 0.25)
                        : alpha(theme.palette.primary.main, 0.15),
                    },
                  }}
                >
                  {isListening ? (
                    <StopCircleIcon sx={{ fontSize: 22 }} />
                  ) : (
                    <KeyboardVoiceIcon sx={{ fontSize: 20 }} />
                  )}
                </IconButton>
              </Tooltip>
            </InputAdornment>
          ),
        }}
      />

      {/* Active Voice Bar */}
      {isListening && (
        <Box
          sx={{
            mt: 0.75,
            p: 1,
            borderRadius: 2,
            bgcolor: isDark ? "rgba(239, 68, 68, 0.1)" : "#fff1f2",
            border: `1px solid ${alpha(theme.palette.error.main, 0.3)}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 1,
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1}>
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                bgcolor: "#ef4444",
                boxShadow: "0 0 8px #ef4444",
              }}
            />
            <Typography variant="caption" sx={{ fontWeight: 700, color: "error.main", letterSpacing: 0.5 }}>
              LISTENING ({SPEECH_LANG_MAP[language].nativeName}):
            </Typography>

            {/* Audio Wave Bars */}
            <Box sx={{ display: "flex", alignItems: "center", gap: "2px", height: 16 }}>
              <Box
                sx={{
                  width: 3,
                  bgcolor: "#ef4444",
                  borderRadius: 1,
                  height: audioLevel > 10 ? Math.max(6, Math.min(16, audioLevel / 4)) : 6,
                  transition: "height 0.1s ease",
                }}
              />
              <Box
                sx={{
                  width: 3,
                  bgcolor: "#ef4444",
                  borderRadius: 1,
                  height: audioLevel > 10 ? Math.max(8, Math.min(18, audioLevel / 3)) : 8,
                  transition: "height 0.1s ease",
                }}
              />
              <Box
                sx={{
                  width: 3,
                  bgcolor: "#ef4444",
                  borderRadius: 1,
                  height: audioLevel > 10 ? Math.max(5, Math.min(14, audioLevel / 5)) : 5,
                  transition: "height 0.1s ease",
                }}
              />
            </Box>

            <Typography
              variant="caption"
              sx={{
                color: "text.primary",
                fontStyle: liveTranscript ? "normal" : "italic",
                fontWeight: liveTranscript ? 600 : 400,
                maxWidth: { xs: 140, sm: 220 },
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {liveTranscript || "Speak into microphone…"}
            </Typography>
          </Stack>

          {showLanguageSelector && (
            <Stack direction="row" spacing={0.5} alignItems="center">
              {(["gu", "hi", "en"] as SpeechLanguage[]).map((lang) => (
                <Chip
                  key={lang}
                  label={SPEECH_LANG_MAP[lang].nativeName}
                  size="small"
                  onClick={() => setLanguage(lang)}
                  color={language === lang ? "primary" : "default"}
                  variant={language === lang ? "filled" : "outlined"}
                  sx={{
                    height: 24,
                    fontSize: "0.72rem",
                    fontWeight: language === lang ? 700 : 500,
                    cursor: "pointer",
                  }}
                />
              ))}
              <Chip
                label="Done (Alt+V)"
                size="small"
                color="error"
                onClick={stopListening}
                sx={{ height: 24, fontSize: "0.72rem", fontWeight: 700, cursor: "pointer", ml: 0.5 }}
              />
            </Stack>
          )}
        </Box>
      )}

      {/* Error notification */}
      {error && !isListening && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            mt: 0.75,
            p: 1,
            borderRadius: 1.5,
            bgcolor: isDark ? "rgba(239, 68, 68, 0.12)" : "#fef2f2",
            border: `1px solid ${alpha(theme.palette.error.main, 0.25)}`,
          }}
        >
          <ErrorOutlineIcon color="error" sx={{ fontSize: 16 }} />
          <Typography variant="caption" color="error.main" sx={{ fontWeight: 500 }}>
            {error}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default VoiceTextField;
