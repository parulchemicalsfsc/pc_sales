/**
 * permissions.ts
 * ──────────────
 * Permission key constants. These are the authoritative string keys that
 * exist in the DB `permissions.permission_key` column and in the backend.
 *
 * Important: ROLE_PERMISSIONS and the static hasPermission() have been
 * removed. Permission checking now happens dynamically via AuthContext
 * (fetched from the backend once at login, cached in React state).
 */

// ─── Permission Key Registry ──────────────────────────────────────────────────
export const PERMISSIONS = {
    // Dashboard
    VIEW_DASHBOARD: "view_dashboard",

    // Customers
    VIEW_CUSTOMERS: "view_customers",
    CREATE_CUSTOMER: "create_customer",
    EDIT_CUSTOMER: "edit_customer",
    DELETE_CUSTOMER: "delete_customer",

    // Sales
    VIEW_SALES: "view_sales",
    CREATE_SALE: "create_sale",
    EDIT_SALE: "edit_sale",
    DELETE_SALE: "delete_sale",
    DOWNLOAD_INVOICE: "download_invoice",

    // Orders
    VIEW_ORDERS: "view_orders",
    UPDATE_ORDER_STATUS: "update_order_status",
    UPDATE_SHIPMENT_STATUS: "update_shipment_status",
    CANCEL_ORDER: "cancel_order",

    // Payments
    VIEW_PAYMENTS: "view_payments",
    RECORD_PAYMENT: "record_payment",
    EDIT_PAYMENT: "edit_payment",
    DELETE_PAYMENT: "delete_payment",

    // Demos
    VIEW_DEMOS: "view_demos",
    SCHEDULE_DEMO: "schedule_demo",
    EDIT_DEMO: "edit_demo",
    DELETE_DEMO: "delete_demo",

    // Distributors
    VIEW_DISTRIBUTORS: "view_distributors",
    CREATE_DISTRIBUTOR: "create_distributor",
    EDIT_DISTRIBUTOR: "edit_distributor",

    // Shopkeepers
    VIEW_SHOPKEEPERS: "view_shopkeepers",
    CREATE_SHOPKEEPER: "create_shopkeeper",
    EDIT_SHOPKEEPER: "edit_shopkeeper",

    // Doctors
    VIEW_DOCTORS: "view_doctors",
    CREATE_DOCTOR: "create_doctor",
    EDIT_DOCTOR: "edit_doctor",

    // Reports
    VIEW_REPORTS: "view_reports",
    EXPORT_REPORTS: "export_reports",
    RUN_FORECASTING: "run_forecasting",

    // Calling List
    VIEW_CALLING_LIST: "view_calling_list",
    RUN_CALL_DISTRIBUTION: "run_call_distribution",

    // Products & Pricing
    VIEW_PRODUCTS: "view_products",
    MANAGE_PRODUCTS: "manage_products",
    MANAGE_PRICING: "manage_pricing",

    // Data Import
    IMPORT_DATA: "import_data",

    // Algorithm
    RUN_ALGORITHM: "run_algorithm",

    // Chat
    DELETE_MESSAGE: "delete_message",

    // Admin
    VIEW_ACTIVITY_LOGS: "view_activity_logs",
    MANAGE_ACTIVITY_LOGS: "manage_activity_logs",
    VIEW_USERS: "view_users",
    CREATE_USER: "create_user",
    MANAGE_USERS: "manage_users",
    MANAGE_ROLES: "manage_roles",
    MANAGE_NOTIFICATIONS: "manage_notifications",
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// ─── Role Key Registry ────────────────────────────────────────────────────────
// These match the `role_key` values in the `roles` DB table.
export enum UserRole {
    ADMIN = "admin",
    DEVELOPER = "developer",
    SALES_MANAGER = "sales_manager",
    LOGISTICS_MANAGER = "logistics_manager",
    TELECALLER = "telecaller",
    MARKETING_MANAGER = "marketing_manager",
    BUSINESS_ANALYST = "business_analyst",
    PRODUCT_MANAGER = "product_manager",
}
