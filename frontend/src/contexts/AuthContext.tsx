import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { Session, User } from "@supabase/supabase-js";
import { activityAPI } from "../services/api";
import { supabase } from "../lib/supabaseClient";

// Re-export single canonical Supabase client for all consumers
export { supabase };

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

/** Single call at login — returns permissions, role, and is_active together */
const fetchLoginData = async (
  email: string
): Promise<{ permissions: Set<string>; role: string | null; is_active: boolean }> => {
  try {
    const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
    let token = localStorage.getItem("supabase_token");
    if (!token) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          token = session.access_token;
          try {
            localStorage.setItem("supabase_token", token);
          } catch (_) {}
        }
      } catch (_) {}
    }
    const headers: Record<string, string> = { "x-user-email": email };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await fetch(`${API_BASE}/api/rbac/my-permissions`, {
      headers,
    });
    if (res.status === 403) {
      // Backend returned ACCOUNT_DEACTIVATED
      return { permissions: new Set(), role: null, is_active: false };
    }
    if (!res.ok) {
      console.warn("[Auth] Could not load permissions:", res.status);
      return { permissions: new Set(), role: null, is_active: true };
    }
    const data = await res.json();
    return {
      permissions: new Set<string>(data.permissions || []),
      role: data.role ?? null,
      is_active: data.is_active ?? true,
    };
  } catch (err) {
    console.error("[Auth] fetchLoginData error:", err);
    return { permissions: new Set(), role: null, is_active: true };
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
  const loadPermissions = useCallback(async (
    currentUser: User | null,
    opts?: { throwIfDeactivated?: boolean }
  ) => {
    if (!currentUser?.email) {
      setPermissions(new Set());
      setPermissionsLoaded(true);
      return;
    }

    setPermissionsLoaded(false);
    const { permissions: perms, role: backendRole, is_active } = await fetchLoginData(currentUser.email);

    // Account deactivated — sign out and optionally throw so signIn can handle it
    if (!is_active) {
      await supabase.auth.signOut();
      localStorage.removeItem("user_email");
      localStorage.removeItem("supabase_token");
      setPermissions(new Set());
      setPermissionsLoaded(true);
      if (opts?.throwIfDeactivated) throw new Error("ACCOUNT_DEACTIVATED");
      window.location.href = "/login";
      return;
    }

    setPermissions(perms);
    // Use role from backend (authoritative) instead of JWT metadata
    if (backendRole) {
      setRole(backendRole);
      localStorage.setItem("user_role", backendRole); // persist for api.ts header use
    }
    setPermissionsLoaded(true);
    console.log(`[Auth] Loaded ${perms.size} permissions for ${currentUser.email} (role=${backendRole})`);
  }, []);

  // ── Initial auth check + subscriber ─────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user?.email) {
        localStorage.setItem("user_email", s.user.email);
      }
      if (s?.access_token) {
        localStorage.setItem("supabase_token", s.access_token);
      } else {
        localStorage.removeItem("supabase_token");
      }
      
      const activeUser = s?.user ?? null;
      setUser(activeUser);
      setRole(normalizeRole(s?.user?.user_metadata?.role) || (activeUser ? localStorage.getItem("user_role") : null));

      if (activeUser) {
        loadPermissions(activeUser).finally(() => setLoading(false));
      } else {
        setPermissions(new Set());
        setPermissionsLoaded(true);
        setLoading(false);
      }
    }).catch((err) => {
      console.error("[Auth] Initial getSession error:", err);
      setSession(null);
      setUser(null);
      setPermissions(new Set());
      setPermissionsLoaded(true);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, s) => {
        if (event === "TOKEN_REFRESHED_FAILED" as any) {
          console.warn("[Auth] Supabase token refresh failed");
        }

        if (event === "SIGNED_OUT") {
          setSession(null);
          setUser(null);
          setRole(null);
          setPermissions(new Set());
          setPermissionsLoaded(true);
          localStorage.removeItem("user_email");
          localStorage.removeItem("user_role");
          localStorage.removeItem("supabase_token");
          return;
        }

        setSession(s);
        const currentUser = s?.user ?? null;
        setUser(currentUser);
        setRole(normalizeRole(s?.user?.user_metadata?.role) || (currentUser ? localStorage.getItem("user_role") : null));

        if (s?.user?.email) {
          localStorage.setItem("user_email", s.user.email);
        }
        if (s?.access_token) {
          localStorage.setItem("supabase_token", s.access_token);
        } else {
          localStorage.removeItem("supabase_token");
        }

        if (event !== "SIGNED_IN" && event !== "TOKEN_REFRESHED") {
          if (currentUser) {
            loadPermissions(currentUser);
          } else {
            setPermissions(new Set());
            setPermissionsLoaded(true);
          }
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
      const currentRole = (role || localStorage.getItem('user_role') || '').toLowerCase();
      if (currentRole === 'admin' || currentRole === 'developer') {
        return true;
      }
      return permissions.has(permission);
    },
    [user, permissions, role]
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
    if (data.session?.access_token) {
      localStorage.setItem("supabase_token", data.session.access_token);
    }

    // ── Single call: fetches is_active + role + permissions together ─────────
    // Drops the old separate check-status round trip entirely.
    if (data.user) {
      setUser(data.user);
      setSession(data.session);
      // loadPermissions will override role with the authoritative backend value
      await loadPermissions(data.user, { throwIfDeactivated: true });

      // Log LOGIN event (fire-and-forget, only on explicit user sign-in)
      activityAPI.logAuth("LOGIN").catch(() => { });
    }
  };

  // ── Sign out ─────────────────────────────────────────────────────────────────
  const signOut = async () => {
    // Log LOGOUT event first (silent fail ok — don't block actual logout)
    activityAPI.logAuth("LOGOUT").catch(() => { });
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setRole(null);
    setPermissions(new Set());
    setPermissionsLoaded(false);
    localStorage.removeItem("user_email");
    localStorage.removeItem("user_role");
    localStorage.removeItem("supabase_token");
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
