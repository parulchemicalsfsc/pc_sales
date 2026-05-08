import { apiClient } from "./api";

// ── Types ─────────────────────────────────────────────────────────────────────

export type LeadStatus =
  | "Unassigned"
  | "Assigned"
  | "In Progress"
  | "Follow-up"
  | "Converted"
  | "Rejected";

export interface Lead {
  lead_id: string;
  source_id?: string;
  source_website: string;
  full_name: string;
  email?: string;
  phone?: string;
  country?: string;
  company_name?: string;
  product_interest?: string;
  message?: string;
  status: LeadStatus;
  assigned_to?: string;
  follow_up_date?: string;
  closure_type?: string;
  rejection_reason?: string;
  conversion_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface LeadActivity {
  activity_id: number;
  lead_id: string;
  activity_type: string;
  summary?: string;
  outcome?: string;
  next_action?: string;
  follow_up_date?: string;
  logged_by: string;
  logged_at: string;
  is_auto: boolean;
}

export interface PipelineStats {
  total: number;
  unassigned: number;
  assigned: number;
  in_progress: number;
  follow_up: number;
  converted: number;
  rejected: number;
  overdue: number;
  converted_this_month: number;
  by_source: Record<string, number>;
  by_status: Record<string, number>;
}

// ── API calls ─────────────────────────────────────────────────────────────────

export const leadsService = {
  /** Lead Manager: fetch all leads with optional filters */
  getAll: (params?: {
    status?: string;
    assigned_to?: string;
    source?: string;
    date_from?: string;
    date_to?: string;
    limit?: number;
    offset?: number;
  }) => apiClient.get<{ leads: Lead[]; total: number }>("/api/leads/", { params }),

  /** Lead Owner: fetch only their own leads */
  getMy: (status?: string) =>
    apiClient.get<{ leads: Lead[]; total: number }>("/api/leads/my", {
      params: status ? { status } : undefined,
    }),

  /** Lead Manager: get one lead by ID */
  getOne: (leadId: string) => apiClient.get<Lead>(`/api/leads/${leadId}`),

  /** Lead Owner: get one lead (scoped to assigned_to) */
  getMyLead: (leadId: string) => apiClient.get<Lead>(`/api/leads/${leadId}/detail`),

  /** Both roles: get activity timeline for a lead */
  getActivities: (leadId: string) =>
    apiClient.get<{ activities: LeadActivity[] }>(`/api/leads/${leadId}/activities`),

  /** Both roles: pipeline/dashboard KPI stats */
  getPipelineStats: () => apiClient.get<PipelineStats>("/api/leads/stats/pipeline"),

  /** Lead Manager: assign or reassign a lead */
  assign: (leadId: string, assigned_to: string, note?: string) =>
    apiClient.post(`/api/leads/${leadId}/assign`, { assigned_to, note }),

  /** Lead Manager: leave a manager note */
  comment: (leadId: string, text: string) =>
    apiClient.post(`/api/leads/${leadId}/comment`, { text }),

  /** Lead Owner: update editable fields */
  update: (
    leadId: string,
    data: Partial<Pick<Lead, "phone" | "company_name" | "status" | "follow_up_date" | "product_interest">>
  ) => apiClient.patch(`/api/leads/${leadId}`, data),

  /** Lead Owner: log a Call/Email/Meeting/Note */
  logActivity: (
    leadId: string,
    data: {
      activity_type: "Call" | "Email" | "Meeting" | "Note";
      summary: string;
      outcome?: string;
      next_action?: string;
      follow_up_date?: string;
    }
  ) => apiClient.post(`/api/leads/${leadId}/activities`, data),

  /** Lead Owner: close lead as Converted or Rejected */
  close: (
    leadId: string,
    data: {
      closure_type: "Converted" | "Rejected";
      rejection_reason?: string;
      conversion_notes?: string;
    }
  ) => apiClient.post(`/api/leads/${leadId}/close`, data),

  /** Lead Manager: get list of available lead owners for assign dropdown */
  getOwners: () =>
    apiClient.get<{ owners: { email: string; name: string }[] }>("/api/leads/owners/list"),
};
