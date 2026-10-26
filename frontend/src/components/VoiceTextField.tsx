import React, { useState, useRef, useEffect } from "react";
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
import { useSpeechToText, SpeechLanguage, SPEECH_LANG_MAP } from "../hooks/useSpeechToText";

// Pulsing animation for active mic
const pulseAnimation = keyframes`
  0% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
    transform: scale(1);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(239, 68, 68, 0);
    transform: scale(1.05);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
    transform: scale(1);
  }
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

  // Keep a ref to the latest base value when speech started
  const currentValueRef = useRef(value);
  currentValueRef.current = value;

  // Track the text that was finalized during this dictation session
  const sessionFinalRef = useRef("");

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

  const handleTranscript = (text: string, isFinal: boolean) => {
    const base = currentValueRef.current;
    const cleanText = text.trim();
    if (!cleanText) return;

    if (isFinal) {
      // Append finalized speech to the field
      const separator = base && !base.endsWith(" ") && !base.endsWith("\n") ? " " : "";
      const updated = base + separator + cleanText;
      updateValue(updated);
      sessionFinalRef.current += (sessionFinalRef.current ? " " : "") + cleanText;
    }
  };

  const {
    isListening,
    interimTranscript,
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

  // Handle Alt+V hotkey to toggle voice typing when focused
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey && (e.key === "v" || e.key === "V")) {
      e.preventDefault();
      toggleListening();
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
        onChange={onChange}
        onKeyDown={handleKeyDown}
        placeholder={isListening ? "Listening... speak now" : placeholder}
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
                    : `Voice Typing (Click or press Alt+V to speak in ${SPEECH_LANG_MAP[language].label})`
                }
                arrow
              >
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleListening();
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
                        ? alpha(theme.palette.error.main, 0.4)
                        : alpha(theme.palette.primary.main, 0.2)
                    }`,
                    animation: isListening ? `${pulseAnimation} 1.8s infinite` : "none",
                    "&:hover": {
                      bgcolor: isListening
                        ? alpha(theme.palette.error.main, 0.25)
                        : alpha(theme.palette.primary.main, 0.15),
                    },
                  }}
                >
                  {isListening ? (
                    <StopCircleIcon sx={{ fontSize: 20 }} />
                  ) : (
                    <KeyboardVoiceIcon sx={{ fontSize: 20 }} />
                  )}
                </IconButton>
              </Tooltip>
            </InputAdornment>
          ),
        }}
      />

      {/* Active Voice Dictation Banner / Language Controls */}
      {isListening && (
        <Box
          sx={{
            mt: 0.75,
            p: 1,
            borderRadius: 1.5,
            bgcolor: isDark ? "rgba(239,68,68,0.08)" : "#fef2f2",
            border: `1px solid ${alpha(theme.palette.error.main, 0.25)}`,
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
                width: 8,
                height: 8,
                borderRadius: "50%",
                bgcolor: "#ef4444",
                boxShadow: "0 0 6px #ef4444",
              }}
            />
            <Typography variant="caption" sx={{ fontWeight: 700, color: "error.main" }}>
              LISTENING ({SPEECH_LANG_MAP[language].label.toUpperCase()}):
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: "text.primary",
                fontStyle: interimTranscript ? "normal" : "italic",
                maxWidth: 220,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {interimTranscript || "Speak clearly into microphone…"}
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
                    height: 22,
                    fontSize: "0.7rem",
                    fontWeight: language === lang ? 700 : 500,
                    cursor: "pointer",
                  }}
                />
              ))}
              <Chip
                label="Done"
                size="small"
                color="error"
                onClick={stopListening}
                sx={{ height: 22, fontSize: "0.7rem", fontWeight: 700, cursor: "pointer", ml: 0.5 }}
              />
            </Stack>
          )}
        </Box>
      )}

      {error && !isListening && (
        <Typography variant="caption" color="error.main" sx={{ display: "block", mt: 0.5, px: 0.5 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
};

export default VoiceTextField;
