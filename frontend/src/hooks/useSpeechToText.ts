import { useState, useRef, useCallback, useEffect } from "react";
import { useLanguageStore } from "../store/languageStore";
import { callLoggerAPI } from "../services/api";

export type SpeechLanguage = "gu" | "hi" | "en";

export const SPEECH_LANG_MAP: Record<SpeechLanguage, { code: string; label: string; nativeName: string }> = {
  gu: { code: "gu-IN", label: "Gujarati", nativeName: "ગુજરાતી" },
  hi: { code: "hi-IN", label: "Hindi", nativeName: "हिन्दी" },
  en: { code: "en-IN", label: "English", nativeName: "English" },
};

interface UseSpeechToTextOptions {
  language?: SpeechLanguage;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onError?: (err: string) => void;
}

export function useSpeechToText(options: UseSpeechToTextOptions = {}) {
  const storeLang = useLanguageStore((state) => state.language);
  const initialLang: SpeechLanguage = options.language || (storeLang === "gu" || storeLang === "hi" ? storeLang : "gu");

  const [language, setLanguage] = useState<SpeechLanguage>(initialLang);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isManuallyStoppedRef = useRef(false);
  const callbacksRef = useRef(options);
  callbacksRef.current = options;

  const isBrowserSpeechSupported =
    typeof window !== "undefined" &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  // Stop listening
  const stopListening = useCallback(() => {
    isManuallyStoppedRef.current = true;
    setIsListening(false);
    setInterimTranscript("");

    // Stop Web Speech
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        // ignore already stopped
      }
      recognitionRef.current = null;
    }

    // Stop MediaRecorder fallback if active
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        // ignore
      }
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  // Start listening
  const startListening = useCallback(
    async (overrideLang?: SpeechLanguage) => {
      stopListening();
      setError(null);
      setInterimTranscript("");
      isManuallyStoppedRef.current = false;

      const activeLang = overrideLang || language;
      const langConfig = SPEECH_LANG_MAP[activeLang] || SPEECH_LANG_MAP.gu;

      // Check if native browser Web Speech API is supported
      const SpeechRecognitionConstructor =
        typeof window !== "undefined"
          ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
          : null;

      if (SpeechRecognitionConstructor) {
        try {
          const rec = new SpeechRecognitionConstructor();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = langConfig.code;
          rec.maxAlternatives = 1;

          rec.onstart = () => {
            setIsListening(true);
            setError(null);
          };

          rec.onresult = (event: any) => {
            let interim = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              const item = event.results[i];
              const transcript = item[0]?.transcript || "";
              if (item.isFinal) {
                callbacksRef.current.onTranscript?.(transcript, true);
              } else {
                interim += transcript;
              }
            }
            setInterimTranscript(interim);
            if (interim) {
              callbacksRef.current.onTranscript?.(interim, false);
            }
          };

          rec.onerror = (event: any) => {
            const errType = event.error;
            if (errType === "no-speech") {
              // benign silence timeout, don't show scary error
              return;
            }
            if (errType === "not-allowed" || errType === "service-not-allowed") {
              const msg = "Microphone access denied. Please allow microphone permissions in browser.";
              setError(msg);
              callbacksRef.current.onError?.(msg);
              stopListening();
            } else if (errType === "network") {
              const msg = "Network error while connecting to speech recognition.";
              setError(msg);
              callbacksRef.current.onError?.(msg);
            } else {
              console.warn("Speech recognition warning:", errType);
            }
          };

          rec.onend = () => {
            // If browser closed connection automatically due to brief silence but user didn't press stop, restart
            if (!isManuallyStoppedRef.current && recognitionRef.current) {
              try {
                rec.start();
                return;
              } catch (err) {
                // fall through to stopping
              }
            }
            setIsListening(false);
            setInterimTranscript("");
          };

          recognitionRef.current = rec;
          rec.start();
          return;
        } catch (err: any) {
          console.warn("Native SpeechRecognition failed, falling back to MediaRecorder:", err);
        }
      }

      // Fallback: Use MediaRecorder + Backend API
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        audioChunksRef.current = [];

        const mimeType = MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";

        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          if (audioChunksRef.current.length > 0) {
            const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
            try {
              const data = await callLoggerAPI.transcribeChunk(blob, activeLang, "sarvam");
              if (data && data.transcript) {
                callbacksRef.current.onTranscript?.(data.transcript, true);
              }
            } catch (backendErr: any) {
              console.warn("Fallback transcription error:", backendErr);
            }
          }
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
          }
          setIsListening(false);
          setInterimTranscript("");
        };

        recorder.start();
        setIsListening(true);
      } catch (micErr: any) {
        const msg = "Microphone access denied or unavailable.";
        setError(msg);
        callbacksRef.current.onError?.(msg);
        setIsListening(false);
      }
    },
    [language, stopListening]
  );

  const toggleListening = useCallback(
    (overrideLang?: SpeechLanguage) => {
      if (isListening) {
        stopListening();
      } else {
        startListening(overrideLang);
      }
    },
    [isListening, startListening, stopListening]
  );

  // Change language dynamically
  const changeLanguage = useCallback(
    (newLang: SpeechLanguage) => {
      setLanguage(newLang);
      if (isListening) {
        // Restart with new language
        startListening(newLang);
      }
    },
    [isListening, startListening]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  return {
    isListening,
    interimTranscript,
    error,
    language,
    isSupported: isBrowserSpeechSupported || typeof navigator !== "undefined" && !!navigator.mediaDevices,
    startListening,
    stopListening,
    toggleListening,
    setLanguage: changeLanguage,
  };
}
