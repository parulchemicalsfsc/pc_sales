import { useState, useCallback, useRef, useEffect } from "react";
import { callLoggerAPI } from "../services/api";

export type AIFields = {
  call_connected: boolean;
  customer_reached: boolean | null;
  interest: "interested" | "not_interested" | null;
  introduced_product: boolean;
  customer_details: string;
  not_interested_reason: string | null;
  reason_details: string;
  quality_followup_date: string | null;
  not_reached_reason: string | null;
  retry_or_close: "retry" | "close" | null;
  callback_datetime: string | null;
  notes: string;
};

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  return "";
}

export function useCallLogger(language: "auto" | "hi" | "gu" = "auto") {
  const [micPermission, setMicPermission] = useState<"unknown" | "granted" | "denied">("unknown");
  const [isRecording, setIsRecording] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const stoppingRef = useRef(false);
  const transcriptRef = useRef(""); 

  const requestMicPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicPermission("granted");
      return true;
    } catch {
      setMicPermission("denied");
      return false;
    }
  }, []);

  const transcribeChunk = async (blob: Blob): Promise<string> => {
    try {
      const data = await callLoggerAPI.transcribeChunk(blob, language, "sarvam"); // fallback to groq is done on backend if sarvam is absent or we can just send it as needed. For now the backend proxies it to Sarvam or Groq.
      return data.transcript || "";
    } catch (e: any) {
      console.warn("Transcription chunk failed:", e);
      return "";
    }
  };

  const startRecording = useCallback(async () => {
    setError(null);
    transcriptRef.current = "";
    setLiveTranscript("");
    stoppingRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setIsRecording(true);
      setMicPermission("granted");

      const recordNextChunk = () => {
        if (stoppingRef.current || !streamRef.current) return;
        const chunks: Blob[] = [];
        const mimeType = pickMimeType();
        const recorder = new MediaRecorder(streamRef.current, { mimeType: mimeType || undefined });
        recorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = async () => {
          const blob = new Blob(chunks, { type: recorder.mimeType });
          if (blob.size > 1000) {
            const text = await transcribeChunk(blob);
            if (text) {
              transcriptRef.current += (transcriptRef.current ? " " : "") + text;
              setLiveTranscript(transcriptRef.current);
            }
          }
          if (!stoppingRef.current) recordNextChunk();
        };

        recorder.start();
        setTimeout(() => {
          if (recorder.state !== "inactive") recorder.stop();
        }, 20000);
      };

      recordNextChunk();
    } catch (e: any) {
      setError("Microphone access denied or unavailable.");
      setMicPermission("denied");
      setIsRecording(false);
    }
  }, [language]);

  const stopRecording = useCallback(() => {
    stoppingRef.current = true;
    if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const cancelRecording = useCallback(() => {
    stopRecording();
    transcriptRef.current = "";
    setLiveTranscript("");
  }, [stopRecording]);

  const analyze = useCallback(async (): Promise<AIFields> => {
    setIsAnalyzing(true);
    try {
      const res = await callLoggerAPI.analyzeTranscript(transcriptRef.current);
      return res as AIFields;
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  // safety: cleanup on unmount
  useEffect(() => {
    return () => stopRecording();
  }, [stopRecording]);

  return {
    micPermission,
    isRecording,
    liveTranscript,
    isAnalyzing,
    error,
    requestMicPermission,
    startRecording,
    stopRecording,
    cancelRecording,
    analyze,
  };
}