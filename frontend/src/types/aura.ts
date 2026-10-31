/**
 * aura.ts
 * ──────────────────────────────────────────────────────────────────────────
 * TypeScript interfaces for all AURA API response shapes used in MOD-16.
 */

// ─── Field Officers ───────────────────────────────────────────────────────────

export interface FieldOfficer {
  fo_user_id: string;
  name: string;
  phone: string;
  email: string;
  assigned_districts: string[];
  assigned_talukas: string[];
  today_status: "plan_locked" | "in_visit" | "on_break" | "idle" | "off";
  monthly_target_amount: number;
  monthly_target_liters: number;
  monthly_target_visits: number;
  achieved_sales_amount: number;
  achieved_sales_liters: number;
  target_shortfall: number;
  kms_this_month: number;
  total_duration_hours: number;
  discounts_given: number;
}

// ─── Monthly Targets ──────────────────────────────────────────────────────────

export interface MonthlyTarget {
  id: string;
  fo_user_id: string;
  month_year: string;
  target_amount: number;
  target_liters: number;
  target_visits: number;
  created_at: string;
  updated_at: string;
}

// ─── Route Audit ──────────────────────────────────────────────────────────────

export interface RoutePlanItem {
  stop_number: number;
  customer_id: string;
  customer_name: string;
  village: string;
  taluka: string;
  planned_time: string;       // "HH:MM"
  lat?: number;
  lng?: number;
  source?: "manual" | "manager_assigned" | "auto_followup";
}

export interface ActualVisitStop {
  customer_id: string;
  customer_name: string;
  checkin_time: string;       // ISO datetime
  checkout_time?: string;
  duration_minutes?: number;
  checkin_lat?: number;
  checkin_lng?: number;
  checkout_lat?: number;
  checkout_lng?: number;
  status: "on_sequence" | "out_of_sequence" | "missed" | "adhoc";
}

export interface LocationPoint {
  lat: number;
  lng: number;
  timestamp: string;          // ISO datetime
  speed_kmph?: number;
}

export interface RouteAudit {
  fo_user_id: string;
  date: string;
  plan_submitted_at?: string;
  plan_status: "not_submitted" | "submitted" | "locked";
  is_edited: boolean;
  edit_revision_number?: number;
  edit_reason?: string;
  edited_at?: string;
  plan_before_edit?: RoutePlanItem[];
  planned_stops: RoutePlanItem[];
  actual_stops: ActualVisitStop[];
  location_points: LocationPoint[];
}

// ─── Customer Visits ──────────────────────────────────────────────────────────

export interface VisitPhoto {
  url: string;
  upload_timestamp: string;
  exif_timestamp?: string;
}

export interface OrderLineItem {
  sku: string;
  qty: number;
  unit_price: number;
  discount_amount: number;
  net_amount: number;
}

export interface LinkedOrder {
  order_id: string;
  order_type: "sale" | "receipt";
  total_amount: number;
  discount_amount?: number;
  line_items?: OrderLineItem[];
}

export interface CustomerVisit {
  visit_id: string;
  fo_user_id: string;
  fo_name: string;
  customer_id: string;
  customer_name: string;
  village: string;
  taluka: string;
  phone: string;
  date: string;
  checkin_time: string;
  checkout_time?: string;
  duration_minutes?: number;
  checkin_lat?: number;
  checkin_lng?: number;
  checkout_lat?: number;
  checkout_lng?: number;
  photos: VisitPhoto[];
  fo_notes?: string;
  follow_up_at?: string;
  verification_status: "pending" | "verified" | "disputed" | "unreachable";
  manager_call_notes?: string;
  second_pitch_outcome?: string;
  linked_orders: LinkedOrder[];
}

// ─── Discounts ────────────────────────────────────────────────────────────────

export interface OfficerDiscountSummary {
  fo_user_id: string;
  fo_name: string;
  gross_sales: number;
  net_sales: number;
  total_discount: number;
  discount_pct: number;
}

export interface OrderDiscount {
  order_id: string;
  fo_user_id: string;
  fo_name: string;
  customer_name: string;
  order_date: string;
  gross_amount: number;
  discount_amount: number;
  net_amount: number;
  discount_reason?: string;
  is_edited?: boolean;
  edit_reason?: string;
  line_items?: OrderLineItem[];
}

export interface DiscountAnalytics {
  summary: {
    gross_sales: number;
    net_sales: number;
    total_discount: number;
    avg_discount_pct: number;
  };
  by_officer: OfficerDiscountSummary[];
  orders: OrderDiscount[];
}

// ─── Payment Receipts ─────────────────────────────────────────────────────────

export interface PaymentReceipt {
  receipt_id: string;
  fo_user_id: string;
  fo_name: string;
  customer_name: string;
  date: string;
  amount: number;
  mode: string;
  pdf_url?: string;
}

// ─── Edit Audit Logs ──────────────────────────────────────────────────────────

export interface EditAuditLog {
  log_id: string;
  fo_user_id: string;
  fo_name: string;
  entity_type: "route_plan" | "order" | "receipt" | "visit";
  entity_id: string;
  edited_at: string;
  edit_reason: string;
  before_snapshot: Record<string, unknown>;
  after_snapshot: Record<string, unknown>;
}

// ─── Stock Requests ───────────────────────────────────────────────────────────

export interface StockRequest {
  request_id: string;
  fo_user_id: string;
  fo_name: string;
  sku: string;
  requested_qty: number;
  approved_qty?: number;
  status: "pending" | "approved" | "dispatched" | "rejected";
  requested_at: string;
  notes?: string;
  manager_notes?: string;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export interface AuraNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
  metadata?: Record<string, unknown>;
}

// ─── Team KPI (aggregated) ────────────────────────────────────────────────────

export interface TeamKPI {
  total_target_amount: number;
  total_achieved_amount: number;
  team_shortfall_amount: number;
  team_shortfall_pct: number;
  officers_submitted_plan: number;
  officers_active_in_field: number;
  total_visits_today: number;
  total_officers: number;
  verified_visits: number;
  pending_verification: number;
  disputed_visits: number;
  total_discounts_given: number;
  discount_pct_of_gross: number;
}

