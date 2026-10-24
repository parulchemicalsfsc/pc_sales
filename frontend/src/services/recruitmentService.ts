import { apiClient } from "./api";

// ── Status Types ─────────────────────────────────────────────────────────────

export type RecruitmentStatus =
  | "Lead Generated"
  | "Shortlisted"
  | "Profile on Hold"
  | "Rejected";

export const ALLOWED_RECRUITMENT_STATUSES: RecruitmentStatus[] = [
  "Lead Generated",
  "Shortlisted",
  "Profile on Hold",
  "Rejected",
];

export const STATUS_COLORS: Record<RecruitmentStatus, "info" | "primary" | "warning" | "error" | "default"> = {
  "Lead Generated": "info",
  "Shortlisted": "primary",
  "Profile on Hold": "warning",
  "Rejected": "error",
};

// ── Validation Helpers ────────────────────────────────────────────────────────

/**
 * Validate that a URL uses http/https protocol and points to drive.google.com or docs.google.com.
 * Returns valid: boolean and an optional error message.
 */
export function validateGoogleDriveUrl(url?: string | null): { valid: boolean; error?: string } {
  if (!url || !url.trim()) return { valid: true };
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { valid: false, error: "Resume URL must use http or https protocol" };
    }
    const host = parsed.hostname.toLowerCase();
    const allowed = ["drive.google.com", "docs.google.com"];
    const isValid = allowed.includes(host) || allowed.some((a) => host.endsWith("." + a));
    if (!isValid) {
      return {
        valid: false,
        error: "Resume link must be a valid Google Drive URL (drive.google.com or docs.google.com)",
      };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
}

// ── Models ───────────────────────────────────────────────────────────────────

export interface RecruitmentCategory {
  category_id: number;
  category_name: string;
  name?: string;
  description?: string | null;
  display_order?: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface RecruitmentLead {
  lead_id: number;
  lead_code: string;
  category_id: number;
  category_name?: string | null;
  candidate_name: string;
  phone: string;
  alternate_phone?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  current_city?: string | null;
  source?: string | null;
  total_experience_years: number;
  highest_qualification?: string | null;
  current_company?: string | null;
  current_designation?: string | null;
  current_ctc?: number | null;
  expected_ctc?: number | null;
  notice_period_days?: number | null;
  key_skills?: string | null;
  resume_url?: string | null;
  questionnaire_responses?: Record<string, any> | null;
  status: RecruitmentStatus;
  status_notes?: string | null;
  follow_up_date?: string | null;
  assigned_to?: string | null;
  created_by?: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface RecruitmentActivity {
  activity_id: number;
  lead_id: number;
  activity_type: string;
  summary: string;
  details?: string | null;
  outcome?: string | null;
  next_action?: string | null;
  follow_up_date?: string | null;
  status_from?: string | null;
  status_to?: string | null;
  logged_by: string;
  logged_at: string;
}

export interface RecruitmentLeadFilterParams {
  status?: string;
  category_id?: number | string;
  search?: string;
  follow_up?: "overdue" | "today" | "upcoming" | "has_follow_up" | "all" | "";
  is_archived?: boolean;
  limit?: number;
  offset?: number;
}

export interface RecruitmentLeadListResponse {
  leads: RecruitmentLead[];
  total: number;
  limit: number;
  offset: number;
}

export interface RecruitmentActivitiesResponse {
  lead_id: number;
  candidate_name?: string;
  lead_code?: string;
  activities: RecruitmentActivity[];
  total: number;
  order: string;
  limit: number;
  offset: number;
}

export interface CreateCandidatePayload {
  candidate_name: string;
  phone: string;
  category_id?: number;
  category_name?: string;
  alternate_phone?: string;
  email?: string;
  city?: string;
  state?: string;
  source?: string;
  total_experience_years?: number;
  highest_qualification?: string;
  current_company?: string;
  current_designation?: string;
  current_ctc?: number;
  expected_ctc?: number;
  notice_period_days?: number;
  key_skills?: string;
  resume_url?: string;
  questionnaire_responses?: Record<string, any>;
  status?: RecruitmentStatus;
  status_notes?: string;
  follow_up_date?: string;
  assigned_to?: string;
  allow_duplicate?: boolean;
}

export type UpdateCandidatePayload = Partial<CreateCandidatePayload> & {
  is_archived?: boolean;
};

// ── Service ──────────────────────────────────────────────────────────────────

export const recruitmentService = {
  /**
   * Fetch active recruitment categories.
   */
  getCategories: async (includeInactive = false): Promise<RecruitmentCategory[]> => {
    const res = await apiClient.get<any[]>("/api/recruitment/categories", {
      params: { include_inactive: includeInactive },
    });
    const items = res.data || [];
    return items.map((cat: any) => ({
      ...cat,
      category_id: cat.category_id,
      category_name: cat.category_name || cat.name || "",
      name: cat.name || cat.category_name || "",
      is_active: cat.is_active ?? true,
    }));
  },

  /**
   * Fetch paginated list of candidate leads with filters.
   */
  getLeads: async (params: RecruitmentLeadFilterParams): Promise<RecruitmentLeadListResponse> => {
    const cleanParams: Record<string, any> = {};
    if (params.status) cleanParams.status = params.status;
    if (params.category_id !== undefined && params.category_id !== "" && params.category_id !== null) {
      cleanParams.category_id = Number(params.category_id);
    }
    if (params.search?.trim()) cleanParams.search = params.search.trim();
    if (params.follow_up) cleanParams.follow_up = params.follow_up;
    if (params.is_archived !== undefined) cleanParams.is_archived = params.is_archived;
    if (params.limit !== undefined) cleanParams.limit = params.limit;
    if (params.offset !== undefined) cleanParams.offset = params.offset;

    const res = await apiClient.get<RecruitmentLeadListResponse>("/api/recruitment/leads", {
      params: cleanParams,
    });
    return res.data;
  },

  /**
   * Get candidate details by ID.
   */
  getLead: async (leadId: number): Promise<RecruitmentLead> => {
    const res = await apiClient.get<RecruitmentLead>(`/api/recruitment/leads/${leadId}`);
    return res.data;
  },

  /**
   * Check for duplicate candidate phone or email before submitting.
   */
  checkDuplicate: async (params: {
    phone?: string;
    email?: string;
    exclude_id?: number;
  }): Promise<{ duplicate_found: boolean; matches: RecruitmentLead[] }> => {
    const cleanParams: Record<string, any> = {};
    if (params.phone?.trim()) cleanParams.phone = params.phone.trim();
    if (params.email?.trim()) cleanParams.email = params.email.trim();
    if (params.exclude_id !== undefined) cleanParams.exclude_id = params.exclude_id;

    const res = await apiClient.get<{ duplicate_found: boolean; matches: RecruitmentLead[] }>(
      "/api/recruitment/leads/check-duplicate",
      { params: cleanParams }
    );
    return res.data;
  },

  /**
   * Create a new candidate lead (manage_recruitment permission required).
   */
  createLead: async (payload: CreateCandidatePayload): Promise<RecruitmentLead> => {
    const res = await apiClient.post<RecruitmentLead>("/api/recruitment/leads", payload);
    return res.data;
  },

  /**
   * Update an existing candidate lead (manage_recruitment permission required).
   */
  updateLead: async (leadId: number, payload: UpdateCandidatePayload): Promise<RecruitmentLead> => {
    const res = await apiClient.patch<RecruitmentLead>(`/api/recruitment/leads/${leadId}`, payload);
    return res.data;
  },

  /**
   * Get candidate activity timeline ordered chronologically.
   */
  getActivities: async (
    leadId: number,
    order: "asc" | "desc" = "desc",
    limit = 50,
    offset = 0
  ): Promise<RecruitmentActivitiesResponse> => {
    const res = await apiClient.get<RecruitmentActivitiesResponse>(
      `/api/recruitment/leads/${leadId}/activities`,
      {
        params: { order, limit, offset },
      }
    );
    return res.data;
  },

  /**
   * Update candidate status.
   */
  updateStatus: async (
    leadId: number,
    status: RecruitmentStatus,
    statusNotes?: string
  ): Promise<{ success: boolean; lead: RecruitmentLead; activity?: RecruitmentActivity }> => {
    const res = await apiClient.post(`/api/recruitment/leads/${leadId}/status`, {
      status,
      status_notes: statusNotes,
    });
    return res.data;
  },
};
