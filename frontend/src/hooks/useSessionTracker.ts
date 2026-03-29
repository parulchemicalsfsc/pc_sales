import { useState, useEffect, useRef, useCallback } from "react";
import { activityAPI } from "../services/api";

// ── Session Day helper (turns over at 12:07 PM IST) ─────────────
function getSessionDayStr(): string {
  const now = new Date();
  const istStr = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  const ist = new Date(istStr);

  // If before 12:07 PM IST, it belongs to the previous "session day"
  if (ist.getHours() < 12 || (ist.getHours() === 12 && ist.getMinutes() < 7)) {
    ist.setDate(ist.getDate() - 1);
  }

  const y = ist.getFullYear();
  const m = String(ist.getMonth() + 1).padStart(2, "0");
  const d = String(ist.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ── Multi-tab lock helpers ─────────────────────────────────────
const TAB_ID = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const LS_LEADER_KEY = "session_leader_tab";
const LS_LEADER_PING = "session_leader_ping";
const LEADER_TIMEOUT_MS = 5000; // If leader doesn't ping for 5s, take over

function claimLeadership() {
  localStorage.setItem(LS_LEADER_KEY, TAB_ID);
  localStorage.setItem(LS_LEADER_PING, String(Date.now()));
}

function isLeader(): boolean {
  const leader = localStorage.getItem(LS_LEADER_KEY);
  if (leader === TAB_ID) return true;
  // Check if leader is stale
  const lastPing = Number(localStorage.getItem(LS_LEADER_PING) || "0");
  if (Date.now() - lastPing > LEADER_TIMEOUT_MS) {
    claimLeadership();
    return true;
  }
  return false;
}

function pingLeader() {
  if (isLeader()) {
    localStorage.setItem(LS_LEADER_PING, String(Date.now()));
  }
}

// ── Format seconds → HH:MM:SS ─────────────────────────────────
export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface UseSessionTrackerOptions {
  userEmail?: string | null;
}

export function useSessionTracker({ userEmail }: UseSessionTrackerOptions) {
  // ── Session timer state ────────────────────────────────────────
  const [timerSeconds, setTimerSeconds] = useState(() => {
    // Instantly restore from localStorage on mount
    const storedDate = localStorage.getItem("session_current_date");
    const today = getSessionDayStr();
    if (storedDate === today) {
      return parseInt(localStorage.getItem("session_total_seconds") || "0", 10);
    }
    // Date changed — reset
    localStorage.setItem("session_current_date", today);
    localStorage.setItem("session_total_seconds", "0");
    return 0;
  });

  const [isTabVisible, setIsTabVisible] = useState(!document.hidden);
  const lastHeartbeatRef = useRef<number>(Date.now());
  const savedSecondsRef = useRef<number>(timerSeconds);
  const sessionStartRef = useRef<number>(Date.now());
  const pausedAtRef = useRef<number | null>(null);

  // Handle visibility change - pause when user switches to another website, resume when they return
  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = !document.hidden;
      setIsTabVisible(visible);

      if (visible) {
        // Tab became visible - resume timer
        if (pausedAtRef.current !== null) {
          // We were paused, now resuming
          // Reset the session start to continue from here
          sessionStartRef.current = Date.now();
          pausedAtRef.current = null;
        }
      } else {
        // Tab became hidden - pause timer
        // Save current elapsed time to savedSecondsRef
        const elapsed = Math.floor(
          (Date.now() - sessionStartRef.current) / 1000,
        );
        savedSecondsRef.current = savedSecondsRef.current + elapsed;
        localStorage.setItem(
          "session_total_seconds",
          String(savedSecondsRef.current),
        );
        pausedAtRef.current = Date.now();

        // Send heartbeat immediately when pausing
        if (isLeader() && userEmail) {
          const delta = Math.floor(
            (Date.now() - lastHeartbeatRef.current) / 1000,
          );
          if (delta > 0 && delta <= 120) {
            activityAPI.sendHeartbeat(delta).catch(() => {
              // Silent fail
            });
            lastHeartbeatRef.current = Date.now();
          }
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [userEmail]);

  // ── Session timer: init + tick + heartbeat + midnight reset ─────
  useEffect(() => {
    if (!userEmail) return;

    // Claim leadership on mount
    claimLeadership();

    // Restore from localStorage instantly (already done in useState init)
    const localSeconds = parseInt(
      localStorage.getItem("session_total_seconds") || "0",
      10,
    );
    const storedDate = localStorage.getItem("session_current_date") || "";
    const today = getSessionDayStr();

    if (storedDate !== today) {
      // New day — reset
      savedSecondsRef.current = 0;
      sessionStartRef.current = Date.now();
      localStorage.setItem("session_current_date", today);
      localStorage.setItem("session_total_seconds", "0");
    } else {
      savedSecondsRef.current = localSeconds;
      sessionStartRef.current = Date.now();
    }

    // Also fetch from API and use the higher value (API may have data from other sessions)
    activityAPI
      .getSessionToday()
      .then((res) => {
        const apiSeconds = res.total_seconds || 0;
        if (apiSeconds > savedSecondsRef.current) {
          savedSecondsRef.current = apiSeconds;
          sessionStartRef.current = Date.now();
          setTimerSeconds(apiSeconds);
          localStorage.setItem("session_total_seconds", String(apiSeconds));
        }
      })
      .catch(() => {
        // API failed — keep localStorage value
      });

    // 1-second tick - only when tab is visible (paused when user switches to other website)
    const tickInterval = setInterval(() => {
      // Only tick if tab is visible
      if (document.hidden) return;

      const elapsed = Math.floor((Date.now() - sessionStartRef.current) / 1000);
      const total = savedSecondsRef.current + elapsed;
      setTimerSeconds(total);

      // Persist to localStorage every tick
      localStorage.setItem("session_total_seconds", String(total));

      // Ping leadership every tick
      pingLeader();

      // Check 12:07 PM IST reset (session day changed)
      const currentDate = getSessionDayStr();
      const sd = localStorage.getItem("session_current_date") || currentDate;
      if (currentDate !== sd) {
        // 12:07 PM crossed — reset
        localStorage.setItem("session_current_date", currentDate);
        localStorage.setItem("session_total_seconds", "0");
        savedSecondsRef.current = 0;
        sessionStartRef.current = Date.now();
        setTimerSeconds(0);
      }
    }, 1000);

    // 60-second heartbeat (only leader sends, only when visible)
    const heartbeatInterval = setInterval(() => {
      if (!isLeader()) return;
      if (document.hidden) return; // Don't send heartbeat when tab is hidden

      const now = Date.now();
      const delta = Math.floor((now - lastHeartbeatRef.current) / 1000);
      if (delta > 0 && delta <= 120) {
        activityAPI
          .sendHeartbeat(delta)
          .then((res) => {
            savedSecondsRef.current =
              res.total_seconds || savedSecondsRef.current;
            sessionStartRef.current = Date.now();
            lastHeartbeatRef.current = now;
            localStorage.setItem(
              "session_total_seconds",
              String(savedSecondsRef.current),
            );
          })
          .catch(() => {
            // Silent fail — will retry next interval
          });
      }
      lastHeartbeatRef.current = now;
    }, 60000);

    // Store session day string
    localStorage.setItem("session_current_date", getSessionDayStr());

    // beforeunload — send final heartbeat via sync XHR
    const handleUnload = () => {
      if (!isLeader()) return;

      // Calculate final delta including any elapsed time since last heartbeat
      const elapsed = document.hidden
        ? 0
        : Math.floor((Date.now() - sessionStartRef.current) / 1000);
      const totalNow = savedSecondsRef.current + elapsed;
      localStorage.setItem("session_total_seconds", String(totalNow));

      const delta = Math.floor((Date.now() - lastHeartbeatRef.current) / 1000);
      if (delta > 0 && delta <= 120) {
        try {
          const url = `${(import.meta as any)?.env?.VITE_API_BASE_URL || "https://pc-sales-8phu.onrender.com"}/api/user-sessions/heartbeat`;
          const xhr = new XMLHttpRequest();
          xhr.open("POST", url, false); // synchronous
          xhr.setRequestHeader("Content-Type", "application/json");
          xhr.setRequestHeader("x-user-email", userEmail);
          xhr.send(JSON.stringify({ delta_seconds: delta }));
        } catch {
          // Ignore errors on unload
        }
      }
    };

    window.addEventListener("beforeunload", handleUnload);

    return () => {
      clearInterval(tickInterval);
      clearInterval(heartbeatInterval);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, [userEmail]);

  return {
    timerSeconds,
    isTabVisible,
    formattedTime: formatDuration(timerSeconds),
  };
}
