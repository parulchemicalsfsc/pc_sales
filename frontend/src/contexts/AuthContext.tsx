import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { Session, User } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { activityAPI } from "../services/api";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ─── Types ────────────────────────────────────────────────────────────────────
interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: string | null;
  /** Set of permission_keys fetched from the backend — the single source of truth */
  permissions: Set<string>;
  /** True once the initial permission load has finished */
  permissionsLoaded: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Instant JS check — no network, no DB */
  hasPermission: (permission: string) => boolean;
  /** Force-refresh permissions from the server (e.g. after role change) */
  refreshPermissions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalize Supabase metadata role string → snake_case key */
const normalizeRole = (raw: string | undefined | null): string | null => {
  if (!raw) return null;
  return raw.toLowerCase().replace(/ /g, "_");
};

/** Fetch the user's permission set from the backend (single call at login) */
const fetchPermissionsFromBackend = async (
  email: string
): Promise<Set<string>> => {
  try {
    const API_BASE =
      import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
    const res = await fetch(`${API_BASE}/api/rbac/my-permissions`, {
      headers: { "x-user-email": email },
    });
    if (!res.ok) {
      console.warn("[Auth] Could not load permissions:", res.status);
      return new Set();
    }
    const data = await res.json();
    return new Set<string>(data.permissions || []);
  } catch (err) {
    console.error("[Auth] fetchPermissions error:", err);
    return new Set();
  }
};

// ─── Provider ─────────────────────────────────────────────────────────────────
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);

  // ── Load permissions for a given user ───────────────────────────────────────
  const loadPermissions = useCallback(async (currentUser: User | null) => {
    if (!currentUser?.email) {
      setPermissions(new Set());
      setPermissionsLoaded(true);
      return;
    }

    setPermissionsLoaded(false);
    const perms = await fetchPermissionsFromBackend(currentUser.email);
    setPermissions(perms);
    setPermissionsLoaded(true);
    console.log(`[Auth] Loaded ${perms.size} permissions for ${currentUser.email}`);
  }, []);

  // ── Initial auth check + subscriber ─────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setRole(normalizeRole(s?.user?.user_metadata?.role));

      // Set user email in localStorage for API client interceptor
      if (s?.user?.email) {
        localStorage.setItem("user_email", s.user.email);
      }

      loadPermissions(s?.user ?? null).finally(() => setLoading(false));
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, s) => {
        setSession(s);
        setUser(s?.user ?? null);
        setRole(normalizeRole(s?.user?.user_metadata?.role));

        if (s?.user?.email) {
          localStorage.setItem("user_email", s.user.email);
        } else {
          localStorage.removeItem("user_email");
        }

        // Skip permission load on SIGNED_IN — signIn() already handles it
        // to avoid resetting permissionsLoaded mid-navigation.
        if (event !== "SIGNED_IN") {
          loadPermissions(s?.user ?? null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [loadPermissions]);

  // ── Midnight IST auto-logout (no activity log) ──────────────────────────────
  useEffect(() => {
    const msUntilMidnightIST = () => {
      const now = new Date();
      const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      const midnight = new Date(ist);
      midnight.setHours(24, 0, 0, 0);
      return midnight.getTime() - ist.getTime();
    };

    const scheduleLogout = () => {
      const ms = msUntilMidnightIST();
      console.log(`[Auth] Auto-logout scheduled in ${Math.round(ms / 60000)} minutes`);
      return setTimeout(async () => {
        console.log("[Auth] Midnight IST — auto-logging out all users");
        await supabase.auth.signOut();
        setPermissions(new Set());
        setPermissionsLoaded(false);
        localStorage.removeItem("user_email");
        window.location.href = "/login";
      }, ms);
    };

    const tid = scheduleLogout();
    return () => clearTimeout(tid);
  }, []);

  // ── hasPermission: pure JS, instant ─────────────────────────────────────────
  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (!user) return false;
      return permissions.has(permission);
    },
    [user, permissions]
  );

  // ── refreshPermissions: force re-fetch ──────────────────────────────────────
  const refreshPermissions = useCallback(async () => {
    await loadPermissions(user);
  }, [user, loadPermissions]);

  // ── Sign in ─────────────────────────────────────────────────────────────────
  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;

    if (data.user?.email) {
      localStorage.setItem("user_email", data.user.email);
    }

    // Load permissions NOW so the caller can navigate immediately after.
    // This avoids a race where navigate fires before permissionsLoaded is true.
    if (data.user) {
      setUser(data.user);
      setSession(data.session);
      setRole(normalizeRole(data.user.user_metadata?.role));
      await loadPermissions(data.user);

      // Log LOGIN event (fire-and-forget, only on explicit user sign-in)
      activityAPI.logAuth("LOGIN").catch(() => { });
    }
  };

  // ── Sign out ─────────────────────────────────────────────────────────────────
  const signOut = async () => {
    // Log LOGOUT event first (silent fail ok — don't block actual logout)
    await activityAPI.logAuth("LOGOUT").catch(() => { });
    await supabase.auth.signOut();
    setPermissions(new Set());
    setPermissionsLoaded(false);
    localStorage.removeItem("user_email");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        role,
        permissions,
        permissionsLoaded,
        loading,
        signIn,
        signOut,
        hasPermission,
        refreshPermissions,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────
export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};
