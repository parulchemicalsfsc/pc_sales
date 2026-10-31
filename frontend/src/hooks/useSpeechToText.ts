import { useState, useRef, useCallback, useEffect } from "react";
import { useLanguageStore } from "../store/languageStore";

export type SpeechLanguage = "gu" | "hi" | "en";

export const SPEECH_LANG_MAP: Record<SpeechLanguage, { code: string; label: string; nativeName: string }> = {
  gu: { code: "gu-IN", label: "Gujarati", nativeName: "ગુજરાતી" },
  hi: { code: "hi-IN", label: "Hindi", nativeName: "हिन्दी" },
  en: { code: "en-IN", label: "English", nativeName: "English" },
};

interface UseSpeechToTextOptions {
  language?: SpeechLanguage;
  onTranscript?: (fullText: string, isFinal: boolean) => void;
  onError?: (err: string) => void;
}

export function useSpeechToText(options: UseSpeechToTextOptions = {}) {
  const storeLang = useLanguageStore((state) => state.language);
  const initialLang: SpeechLanguage = options.language || (storeLang === "gu" || storeLang === "hi" ? storeLang : "gu");

  const [language, setLanguage] = useState<SpeechLanguage>(initialLang);
  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const finalAccumulatedRef = useRef("");
  const lastFullTextRef = useRef("");
  const isManuallyStoppedRef = useRef(false);
  const callbacksRef = useRef(options);
  callbacksRef.current = options;

  const isBrowserSpeechSupported =
    typeof window !== "undefined" &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  // Stop audio visualizer
  const stopAudioAnalyser = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {
        // ignore
      }
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setAudioLevel(0);
  };

  // Start audio visualizer to confirm mic input
  const startAudioAnalyser = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        audioContextRef.current = audioCtx;
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyserRef.current = analyser;

        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const checkAudio = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
          animFrameRef.current = requestAnimationFrame(checkAudio);
        };
        checkAudio();
      }
    } catch (e) {
      // AudioContext / analyser is a secondary helper, don't crash
    }
  };

  // Stop listening
  const stopListening = useCallback(() => {
    isManuallyStoppedRef.current = true;
    setIsListening(false);
    stopAudioAnalyser();

    // Commit whatever text we had recognized so far
    if (lastFullTextRef.current) {
      callbacksRef.current.onTranscript?.(lastFullTextRef.current, true);
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        // ignore
      }
      recognitionRef.current = null;
    }
  }, []);

  // Start listening
  const startListening = useCallback(
    async (overrideLang?: SpeechLanguage) => {
      stopListening();
      setError(null);
      setLiveTranscript("");
      finalAccumulatedRef.current = "";
      lastFullTextRef.current = "";
      isManuallyStoppedRef.current = false;

      const activeLang = overrideLang || language;
      const langConfig = SPEECH_LANG_MAP[activeLang] || SPEECH_LANG_MAP.gu;

      const SpeechRecognitionConstructor =
        typeof window !== "undefined"
          ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
          : null;

      if (!SpeechRecognitionConstructor) {
        const msg = "Speech Recognition is not supported by your current browser. Please open in Google Chrome or Microsoft Edge.";
        setError(msg);
        callbacksRef.current.onError?.(msg);
        return;
      }

      // Check secure context
      if (typeof window !== "undefined" && !window.isSecureContext && window.location.hostname !== "localhost") {
        const msg = "Microphone access requires HTTPS or localhost in your browser.";
        setError(msg);
        callbacksRef.current.onError?.(msg);
        return;
      }

      try {
        const rec = new SpeechRecognitionConstructor();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = langConfig.code;
        rec.maxAlternatives = 1;

        rec.onstart = () => {
          setIsListening(true);
          setError(null);
          startAudioAnalyser();
        };

        rec.onresult = (event: any) => {
          let currentFinal = "";
          let currentInterim = "";

          for (let i = 0; i < event.results.length; ++i) {
            const item = event.results[i];
            const transcript = item[0]?.transcript || "";
            if (item.isFinal) {
              currentFinal += (currentFinal ? " " : "") + transcript.trim();
            } else {
              currentInterim += (currentInterim ? " " : "") + transcript.trim();
            }
          }

          // Full text of this speech session = finalized parts + any ongoing interim words
          const fullSessionText = [currentFinal, currentInterim].filter(Boolean).join(" ").trim();

          if (fullSessionText) {
            setLiveTranscript(fullSessionText);
            lastFullTextRef.current = fullSessionText;
            // IMMEDIATELY notify listener in real-time as words are spoken!
            callbacksRef.current.onTranscript?.(fullSessionText, false);
          }
        };

        rec.onerror = (event: any) => {
          const errType = event.error;
          if (errType === "no-speech") {
            // benign pause, keep waiting
            return;
          }
          if (errType === "not-allowed" || errType === "service-not-allowed") {
            const msg = "Microphone permission is blocked. Click the lock/camera icon in your browser URL bar to allow microphone access.";
            setError(msg);
            callbacksRef.current.onError?.(msg);
            stopListening();
          } else if (errType === "audio-capture") {
            const msg = "No microphone found. Please connect a microphone or headset to your laptop/PC.";
            setError(msg);
            callbacksRef.current.onError?.(msg);
            stopListening();
          } else if (errType === "network") {
            const msg = "Network error connecting to speech recognition service. Please check your internet connection.";
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
              // stopped
            }
          }
          setIsListening(false);
          stopAudioAnalyser();
        };

        recognitionRef.current = rec;
        rec.start();
      } catch (err: any) {
        const msg = err.message || "Failed to start speech recognition. Please check microphone permissions.";
        setError(msg);
        callbacksRef.current.onError?.(msg);
        setIsListening(false);
        stopAudioAnalyser();
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

  const changeLanguage = useCallback(
    (newLang: SpeechLanguage) => {
      setLanguage(newLang);
      if (isListening) {
        startListening(newLang);
      }
    },
    [isListening, startListening]
  );

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  return {
    isListening,
    liveTranscript,
    audioLevel,
    error,
    language,
    isSupported: isBrowserSpeechSupported,
    startListening,
    stopListening,
    toggleListening,
    setLanguage: changeLanguage,
  };
}
