/**
 * auraApi.ts
 * ──────────────────────────────────────────────────────────────────────────
 * Dedicated Axios client for the AURA FastAPI backend (fom-1.onrender.com).
 * This client is intentionally separate from api.ts — AURA data must NEVER
 * be routed through the PC-Sales backend.
 *
 * Auth headers injected on every request:
 *   X-Aura-Api-Key  : shared secret from VITE_AURA_BRIDGE_KEY
 *   x-manager-email : logged-in user's email (from localStorage)
 *   x-user-role     : logged-in user's role  (from localStorage)
 *
 * Role-based filtering (handled server-side by AURA):
 *   admin / developer   → returns all managers' teams
 *   sales_manager / caller → filters by profiles.manager_email == x-manager-email
 */

import axios from "axios";

const auraClient = axios.create({
  baseURL: (import.meta.env.VITE_AURA_API_URL as string | undefined) ?? "https://fom-1.onrender.com/api/v1",
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

auraClient.interceptors.request.use((config) => {
  const email = localStorage.getItem("user_email") ?? "";
  const role = localStorage.getItem("user_role") ?? "";
  const apiKey = (import.meta.env.VITE_AURA_BRIDGE_KEY as string | undefined) ?? "";

  config.headers["X-Aura-Api-Key"] = apiKey;
  if (email) config.headers["x-manager-email"] = email;
  if (role) config.headers["x-user-role"] = role;
  return config;
});

// ─── Typed payload / param interfaces ────────────────────────────────────────

export interface AssignOfficerPayload {
  fo_user_id: string;
  manager_email: string;
}

export interface SetTargetPayload {
  fo_user_id: string;
  month_year: string;       // "YYYY-MM"
  target_amount: number;    // ₹
  target_liters: number;
  target_visits: number;
}

export interface InjectStopPayload {
  fo_user_id: string;
  date: string;             // "YYYY-MM-DD"
  customer_id: string;
  customer_name: string;
  village?: string;
  taluka?: string;
  lat?: number;
  lng?: number;
  notes?: string;
  source?: string;          // "manager_assigned"
}

export interface VerifyVisitPayload {
  verification_status: "verified" | "disputed" | "unreachable";
  manager_call_notes?: string;
  second_pitch_outcome?: string;
  follow_up_at?: string;    // ISO datetime
}

export interface UpdateStockRequestPayload {
  status: "approved" | "dispatched" | "rejected";
  approved_qty?: number;
  manager_notes?: string;
}

// ─── API surface ──────────────────────────────────────────────────────────────

export const auraManagerAPI = {
  // Team & Targets
  getOfficers: (params: { manager_email?: string; month?: string }) =>
    auraClient.get("/manager/officers", { params }),

  assignOfficer: (data: AssignOfficerPayload) =>
    auraClient.post("/manager/assign-officer", data),

  setTarget: (data: SetTargetPayload) =>
    auraClient.post("/manager/targets", data),

  // Route Audit
  getRouteAudit: (params: { fo_user_id: string; date: string }) =>
    auraClient.get("/manager/route-audit", { params }),

  injectStop: (data: InjectStopPayload) =>
    auraClient.post("/manager/route-plans/inject-stop", data),

  // Visit Verification
  getVisits: (params: {
    fo_user_id?: string;
    date?: string;
    month?: string;
    verification_status?: string;
  }) => auraClient.get("/manager/visits", { params }),

  verifyVisit: (visitId: string, data: VerifyVisitPayload) =>
    auraClient.patch(`/manager/visits/${visitId}/verify`, data),

  // Discounts & Receipts
  getDiscounts: (params: { fo_user_id?: string; month?: string }) =>
    auraClient.get("/manager/discounts", { params }),

  getReceipts: (params: { fo_user_id?: string; month?: string; date?: string }) =>
    auraClient.get("/manager/receipts", { params }),

  // Edit Audit Logs
  getEditLogs: (params: {
    fo_user_id?: string;
    entity_type?: string;
    date_from?: string;
    date_to?: string;
  }) => auraClient.get("/manager/edit-logs", { params }),

  // Stock Requests
  getStockRequests: (params: { fo_user_id?: string; status?: string; month?: string }) =>
    auraClient.get("/manager/stock-requests", { params }),

  updateStockRequest: (id: string, data: UpdateStockRequestPayload) =>
    auraClient.patch(`/manager/stock-requests/${id}`, data),

  // Notifications
  getNotifications: (params: { unread_only?: boolean }) =>
    auraClient.get("/manager/notifications", { params }),

  markNotificationRead: (id: string) =>
    auraClient.patch(`/manager/notifications/${id}/read`, {}),
};

export default auraClient;

