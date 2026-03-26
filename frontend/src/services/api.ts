import axios, { AxiosError } from "axios";

// Resolve API base URL with multiple fallbacks and optional window override
const resolveApiBaseUrl = (): string => {
  // 1) Runtime override from window (if provided via script tag or inline config)
  const windowOverride =
    typeof window !== "undefined"
      ? (window as any).__API_BASE_URL__
      : undefined;

  // 2) Vite env vars (support both names)
  const envBase =
    (import.meta as any)?.env?.VITE_API_BASE_URL ||
    (import.meta as any)?.env?.VITE_API_URL;

  // 3) Default fallback (FORCING LOCALHOST FOR TESTING)
  const fallback = "http://localhost:8000";

  const chosen = (windowOverride || envBase || fallback) as string;

  // Normalize trailing slashes
  return chosen.replace(/\/+$/, "");
};

// Create axios instance with base configuration
const API_BASE_URL = resolveApiBaseUrl();

// Log the chosen API base URL once at startup (useful for debugging mismatches)
if (typeof console !== "undefined") {
  // eslint-disable-next-line no-console
  console.info(`[API] Using base URL: ${API_BASE_URL}`);
}

const apiClient = axios.create({
  baseURL: API_BASE_URL,

  timeout: 30000, // 30 second timeout

  headers: {
    "Content-Type": "application/json",
  },
});

// Add request interceptor to include user email in headers
apiClient.interceptors.request.use(
  (config) => {
    // Get user email from localStorage (set after login)
    const userEmail = localStorage.getItem("user_email");
    if (userEmail) {
      config.headers["x-user-email"] = userEmail;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Add response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.code === "ECONNABORTED" || error.message.includes("timeout")) {
      const timeoutError = new Error(
        "Request timeout - Server may be starting up",
      );
      (timeoutError as any).isTimeout = true;
      (timeoutError as any).status = 3000;
      throw timeoutError;
    }

    if (!error.response) {
      const networkError = new Error("Network error - Unable to reach server");
      (networkError as any).isNetworkError = true;
      throw networkError;
    }

    throw error;
  },
);

// Dashboard API
export const dashboardAPI = {
  getMetrics: async (startDate?: string, endDate?: string) => {
    let url = "/api/dashboard/metrics";
    const params = new URLSearchParams();
    if (startDate) params.append("start_date", startDate);
    if (endDate) params.append("end_date", endDate);

    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    const response = await apiClient.get(url);
    return response.data;
  },
  getRecentSales: async (limit?: number) => {
    const response = await apiClient.get("/api/dashboard/recent-sales", {
      params: limit ? { limit } : undefined,
    });
    return response.data;
  },
  getTopProducts: async () => {
    const response = await apiClient.get("/api/dashboard/top-products");
    return response.data;
  },
  getTopCustomers: async () => {
    const response = await apiClient.get("/api/dashboard/top-customers");
    return response.data;
  },
  getSalesChart: async (period: string = "7d") => {
    const response = await apiClient.get(
      `/api/dashboard/sales-chart?period=${period}`,
    );
    return response.data;
  },

  getSalesTrend: async (days?: number) => {
    const response = await apiClient.get("/api/dashboard/sales-trend", {
      params: days ? { days } : undefined,
    });
    return response.data;
  },

  getUpcomingDemos: async (limit?: number) => {
    const response = await apiClient.get("/api/dashboard/upcoming-demos", {
      params: limit ? { limit } : undefined,
    });

    return response.data;
  },
  getCollectedPayments: async (startDate: string, endDate: string) => {
    const response = await apiClient.get("/api/dashboard/collected-payments", {
      params: { start_date: startDate, end_date: endDate },
    });
    return response.data;
  },
};

// Customer API
export const customerAPI = {
  getAll: async (params?: any) => {
    const response = await apiClient.get("/api/customers", { params });
    return response.data;
  },
  getById: async (id: number) => {
    const response = await apiClient.get(`/api/customers/${id}`);
    return response.data;
  },
  getSummary: async (id: number) => {
    const response = await apiClient.get(`/api/customers/${id}/summary`);
    return response.data;
  },
  create: async (data: any) => {
    const response = await apiClient.post("/api/customers", data);
    return response.data;
  },
  update: async (id: number, data: any) => {
    const response = await apiClient.put(`/api/customers/${id}`, data);
    return response.data;
  },
  delete: async (id: number) => {
    const response = await apiClient.delete(`/api/customers/${id}`);
    return response.data;
  },
};

// Product API
export const productAPI = {
  getAll: async (params?: any) => {
    const response = await apiClient.get("/api/products", { params });
    return response.data;
  },
  getById: async (id: number) => {
    const response = await apiClient.get(`/api/products/${id}`);
    return response.data;
  },
  create: async (data: any) => {
    const response = await apiClient.post("/api/products", data);
    return response.data;
  },
  update: async (id: number, data: any) => {
    const response = await apiClient.put(`/api/products/${id}`, data);
    return response.data;
  },
  delete: async (id: number) => {
    const response = await apiClient.delete(`/api/products/${id}`);
    return response.data;
  },
};

// Reports API
export const reportsAPI = {
  getSalesTrend: async (params: { interval: string, start_date?: string, end_date?: string }) => {
    const response = await apiClient.get("/api/reports/sales-trend", { params });
    return response.data;
  },
  getPaymentTrend: async (params: { interval: string, start_date?: string, end_date?: string }) => {
    const response = await apiClient.get("/api/reports/payment-trend", { params });
    return response.data;
  },
  getSalesOrderSummaryPdf: async (params: { start_date?: string, end_date?: string }) => {
    const response = await apiClient.get("/api/reports/sales-order-summary-pdf", {
      params,
      responseType: "blob",
    });
    return response.data;
  },

  getCustomersPdf: async (params: { status?: string }) => {
    const response = await apiClient.get("/api/reports/customers-pdf", {
      params,
      responseType: "blob",
    });
    return response.data;
  },

  getInvoicesPdf: async (params: { start_date?: string; end_date?: string }) => {
    const response = await apiClient.get("/api/reports/invoices-pdf", {
      params,
      responseType: "blob",
    });
    return response.data;
  },

  getPaymentsPdf: async (params: { start_date?: string; end_date?: string }) => {
    const response = await apiClient.get("/api/reports/payments-pdf", {
      params,
      responseType: "blob",
    });
    return response.data;
  },

  getCallingListPdf: async () => {
    const response = await apiClient.get("/api/reports/calling-list-pdf", {
      responseType: "blob",
    });
    return response.data;
  },

};

// Distributor API
export const distributorAPI = {
  getAll: async (params?: any) => {
    const response = await apiClient.get("/api/distributors", { params });
    return response.data;
  },
  getById: async (id: number) => {
    const response = await apiClient.get(`/api/distributors/${id}`);
    return response.data;
  },
  create: async (data: any) => {
    const response = await apiClient.post("/api/distributors", data);
    return response.data;
  },
  update: async (id: number, data: any) => {
    const response = await apiClient.put(`/api/distributors/${id}`, data);
    return response.data;
  },
  delete: async (id: number) => {
    const response = await apiClient.delete(`/api/distributors/${id}`);
    return response.data;
  },
};

// Sales API
export const salesAPI = {
  getAll: async (params?: any) => {
    const response = await apiClient.get("/api/sales", { params });
    return response.data;
  },
  getById: async (id: number) => {
    const response = await apiClient.get(`/api/sales/${id}`);
    return response.data;
  },
  create: async (data: any) => {
    const response = await apiClient.post("/api/sales", data);
    return response.data;
  },
  update: async (id: number, data: any) => {
    const response = await apiClient.put(`/api/sales/${id}`, data);
    return response.data;
  },
  delete: async (id: number) => {
    const response = await apiClient.delete(`/api/sales/${id}`);
    return response.data;
  },
  getPending: async () => {
    const response = await apiClient.get("/api/sales/pending-payments");
    return response.data;
  },
};

// Payment API
export const paymentAPI = {
  getAll: async (params?: any) => {
    const response = await apiClient.get("/api/payments", { params });
    return response.data;
  },
  getById: async (id: number) => {
    const response = await apiClient.get(`/api/payments/${id}`);
    return response.data;
  },
  create: async (data: any) => {
    const response = await apiClient.post("/api/payments", data);
    return response.data;
  },
  update: async (id: number, data: any) => {
    const response = await apiClient.put(`/api/payments/${id}`, data);
    return response.data;
  },
  delete: async (id: number) => {
    const response = await apiClient.delete(`/api/payments/${id}`);
    return response.data;
  },
  getHistory: async (saleId: number) => {
    const response = await apiClient.get(`/api/payments/sale/${saleId}`);
    return response.data;
  },
  getPending: async () => {
    const response = await apiClient.get("/api/payments/pending");
    return response.data;
  },
};

// Demo API
export const demoAPI = {
  getAll: async (params?: any) => {
    const response = await apiClient.get("/api/demos", { params });
    return response.data;
  },
  getById: async (id: number) => {
    const response = await apiClient.get(`/api/demos/${id}`);
    return response.data;
  },
  create: async (data: any) => {
    const response = await apiClient.post("/api/demos", data);
    return response.data;
  },
  update: async (id: number, data: any) => {
    const response = await apiClient.put(`/api/demos/${id}`, data);
    return response.data;
  },
  delete: async (id: number) => {
    const response = await apiClient.delete(`/api/demos/${id}`);
    return response.data;
  },
};

export const automationAPI = {
  getMyAssignments: async (params?: { status?: string; page?: number; limit?: number }) => {
    const response = await apiClient.get("/api/automation/my-assignments", { params });
    return response.data;
  },
  updateCallStatus: async (assignmentId: number, outcome: string, notes?: string, callbackDate?: string) => {
    const payload: any = {
      assignment_id: assignmentId,
      call_outcome: outcome,
      notes,
    };
    if (callbackDate) {
      payload.callback_date = callbackDate;
    }
    const response = await apiClient.post("/api/automation/update-call-status", payload);
    return response.data;
  },
  getTelecallers: async () => {
    const response = await apiClient.get("/api/automation/telecallers");
    return response.data;
  },
  getAdminAssignments: async (params?: { target_date?: string; page?: number; limit?: number }) => {
    const response = await apiClient.get("/api/automation/admin/assignments", { params });
    return response.data;
  },
  adminDistribute: async () => {
    const response = await apiClient.post("/api/automation/admin/distribute");
    return response.data;
  },
  adminReassign: async (assignmentId: number, newUserEmail: string) => {
    const response = await apiClient.post("/api/automation/admin/reassign", {
      assignment_id: assignmentId,
      new_user_email: newUserEmail,
    });
    return response.data;
  },
  getDistributionStatus: async () => {
    const response = await apiClient.get("/api/automation/distribution-status");
    return response.data;
  },
  bulkReassign: async (targetEmail: string, priority: string, count: number) => {
    const response = await apiClient.post("/api/automation/admin/bulk-reassign", {
      target_email: targetEmail,
      priority,
      count,
    });
    return response.data;
  },
  refreshDistribution: async () => {
    const response = await apiClient.post("/api/automation/admin/refresh-distribution");
    return response.data;
  },
};
// File/Import API

export const fileAPI = {
  uploadFile: async (formData: FormData) => {
    const response = await apiClient.post("/api/imports/excel", formData, {
      headers: {
        "Content-Type": undefined, // Force browser/axios to set it
      },
    });
    return response.data;
  },
  upload: async (formData: FormData) => {
    // Explicitly set Content-Type: undefined to let axios/browser handle it
    const response = await apiClient.post("/api/imports/excel", formData, {
      headers: {
        "Content-Type": undefined,
      },
    });
    return response.data;
  },
  getImportHistory: async () => {
    const response = await apiClient.get("/api/import/history");
    return response.data;
  },
};

// Admin API
export const adminAPI = {
  getActivityLogs: async (params?: {
    limit?: number;
    offset?: number;
    user_email?: string;
    action_type?: string;
    entity_type?: string;
    start_date?: string;
    end_date?: string;
  }) => {
    const response = await apiClient.get("/api/admin/activity-logs", {
      params,
    });
    return response.data;
  },

  getActivityStats: async (days?: number) => {
    const response = await apiClient.get("/api/admin/activity-logs/stats", {
      params: days ? { days } : undefined,
    });
    return response.data;
  },

  getUsers: async () => {
    const response = await apiClient.get("/api/admin/users");
    return response.data;
  },

  deleteActivityLog: async (logId: number) => {
    const response = await apiClient.delete(
      `/api/admin/activity-logs/${logId}`,
    );
    return response.data;
  },

  deleteOldActivityLogs: async (daysOld: number = 90) => {
    const response = await apiClient.delete("/api/admin/activity-logs/bulk", {
      params: { days_old: daysOld },
    });
    return response.data;
  },
};

// Notifications API
export const notificationsAPI = {
  getAll: async (params?: {
    limit?: number;
    offset?: number;
    is_read?: boolean;
    notification_type?: string;
  }) => {
    const response = await apiClient.get("/api/notifications", { params });
    return response.data;
  },

  getUnreadCount: async () => {
    const response = await apiClient.get("/api/notifications/unread-count");
    return response.data;
  },

  getById: async (id: number) => {
    const response = await apiClient.get(`/api/notifications/${id}`);
    return response.data;
  },

  create: async (data: {
    user_email?: string;
    title: string;
    message: string;
    notification_type: string;
    entity_type?: string;
    entity_id?: number;
    action_url?: string;
  }) => {
    const response = await apiClient.post("/api/notifications", data);
    return response.data;
  },

  markAsRead: async (id: number) => {
    const response = await apiClient.put(
      `/api/notifications/${id}/mark-read`,
      {},
    );
    return response.data;
  },

  markAllAsRead: async () => {
    const response = await apiClient.put(
      "/api/notifications/mark-all-read",
      {},
    );
    return response.data;
  },

  delete: async (id: number) => {
    const response = await apiClient.delete(`/api/notifications/${id}`);
    return response.data;
  },

  deleteOld: async (daysOld: number = 30) => {
    const response = await apiClient.delete(
      `/api/notifications/delete-old?days_old=${daysOld}`,
    );
    return response.data;
  },
};

// Algorithm API
export const algorithmAPI = {
  run: async (file?: File, useSample: boolean = false) => {
    if (useSample) {
      const response = await apiClient.post('/api/algorithm/run?use_sample=true', undefined, {
        timeout: 60000,
      });
      return response.data;
    }
    const formData = new FormData();
    if (file) formData.append('file', file);
    const response = await apiClient.post('/api/algorithm/run', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    });
    return response.data;
  },
};

// Helper to set user email for requests
export const setUserEmail = (email: string) => {
  localStorage.setItem("user_email", email);
};

export const clearUserEmail = () => {
  localStorage.removeItem("user_email");
};

// ─── RBAC API ─────────────────────────────────────────────────────────────────
export const rbacAPI = {
  /** Get full list of roles (admin only) */
  getRoles: () => apiClient.get("/api/rbac/roles").then((r) => r.data),

  /** Get master permission list (admin only) */
  getPermissions: () =>
    apiClient.get("/api/rbac/permissions").then((r) => r.data),

  /** Get permission IDs assigned to a specific role */
  getRolePermissions: (roleId: number) =>
    apiClient
      .get(`/api/rbac/roles/${roleId}/permissions`)
      .then((r) => r.data),

  /** Replace a role's permissions with a new list */
  updateRolePermissions: (roleId: number, permissionIds: number[]) =>
    apiClient
      .put(`/api/rbac/roles/${roleId}/permissions`, permissionIds)
      .then((r) => r.data),

  /** Create a new custom role */
  createRole: (displayName: string, description?: string) =>
    apiClient
      .post("/api/rbac/roles", { display_name: displayName, description })
      .then((r) => r.data),

  /** Delete a non-system role */
  deleteRole: (roleId: number) =>
    apiClient.delete(`/api/rbac/roles/${roleId}`).then((r) => r.data),
};

// Activity API
export const activityAPI = {
  getMyLogs: async (date?: string) => {
    const params = date ? { date } : {};
    const response = await apiClient.get("/api/admin/my-logs", { params });
    return response.data;
  },
};

// Export the axios instance for direct use if needed
export default apiClient;

