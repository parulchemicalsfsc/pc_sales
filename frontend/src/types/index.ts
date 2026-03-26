// Type definitions for Sales Management System

export interface Customer {
  customer_id?: number;
  customer_code?: string;
  name: string;
  mobile?: string;
  village?: string;
  taluka?: string;
  district?: string;
  state?: string;
  adhar_no?: string;
  status?: string;
  created_date?: string;
  updated_date?: string;
}

export interface Product {
  product_id?: number;
  product_name: string;
  packing_type?: string;
  capacity_ltr?: number;
  category?: string;
  standard_rate?: number;
  rate_gujarat?: number;
  rate_maharashtra?: number;
  rate_mp?: number;
  is_active?: number;
  created_date?: string;
}

export interface Sale {
  sale_id?: number;
  invoice_no?: string;
  customer_id: number;
  customer_name?: string;
  village?: string;
  sale_date: string;
  total_amount: number;
  total_liters: number;
  payment_status?: string;
  notes?: string;
  created_date?: string;
  updated_date?: string;
}

export interface SaleItem {
  item_id?: number;
  sale_id?: number;
  product_id: number;
  product_name?: string;
  quantity: number;
  rate: number;
  amount: number;
  created_date?: string;
}

export interface SaleCreate {
  customer_id: number;
  invoice_no?: string;
  sale_date: string;
  items: SaleItem[];
  notes?: string;
}

export interface SaleDetails {
  sale: Sale;
  items: SaleItem[];
  payments: Payment[];
}

export interface Payment {
  payment_id?: number;
  sale_id: number;
  invoice_no?: string;
  customer_name?: string;
  payment_date: string;
  payment_method: string;
  amount: number;
  rrn?: string;
  reference?: string;
  status?: string;
  notes?: string;
  created_date?: string;
}

export interface PendingPayment {
  sale_id: number;
  invoice_no: string;
  customer_name: string;
  mobile?: string;
  village?: string;
  total_amount: number;
  sale_date: string;
  paid_amount: number;
  pending_amount: number;
  items_summary?: string;
}

export interface Demo {
  demo_id?: number;
  customer_id: number;
  customer_name?: string;
  village?: string;
  mobile?: string;
  distributor_id?: number;
  distributor_name?: string;
  demo_date: string;
  demo_time: string;
  product_id: number;
  product_name?: string;
  quantity_provided: number;
  follow_up_date?: string;
  conversion_status?: string;
  notes?: string;
  demo_location?: string;
  created_date?: string;
  updated_date?: string;
}

export interface Distributor {
  distributor_id?: number;
  name: string;
  village?: string;
  taluka?: string;
  district?: string;
  mantri_name?: string;
  mantri_mobile?: string;
  sabhasad_count?: number;
  sabhasad_morning?: number;
  sabhasad_evening?: number;
  contact_in_group?: number;
  status?: string;
  created_date?: string;
  updated_date?: string;
}

export interface DashboardMetrics {
  total_sales: number;
  total_payments: number;
  pending_amount: number;
  total_customers: number;
  total_transactions: number;
  demo_conversion_rate: number;
  payment_method_distribution?: Record<string, number>;
}

export interface SalesTrendData {
  sale_date: string;
  total_amount: number;
}

export interface RecentSale {
  invoice_no: string;
  customer_name: string;
  village?: string;
  total_amount: number;
  sale_date: string;
  payment_status: string;
}

export interface UpcomingDemo {
  demo_id: number;
  customer_name: string;
  village?: string;
  product_name: string;
  demo_date: string;
  demo_time: string;
  conversion_status: string;
}

export interface ProductPerformance {
  product_name: string;
  sales_count: number;
  total_quantity: number;
  total_revenue: number;
}

export interface PaymentDistribution {
  payment_method: string;
  total_amount: number;
  count: number;
}

export interface DemoConversionStats {
  conversion_status: string;
  count: number;
}

export interface SalesSummary {
  total_sales: number;
  total_revenue: number;
  avg_sale_value: number;
  total_liters: number;
}

export interface CustomerSummary {
  total_customers: number;
  active_customers: number;
  village_distribution: {
    village: string;
    count: number;
  }[];
}

export interface ApiResponse<T> {
  data?: T;
  total?: number;
  message?: string;
  error?: string;
}

export interface PaginationParams {
  skip?: number;
  limit?: number;
  search?: string;
  status?: string;
}

export interface FileUpload {
  filename: string;
  size: number;
  modified: string;
}

export interface UploadResponse {
  filename: string;
  size: number;
  path: string;
  message: string;
}

// Form interfaces
export interface CustomerFormData {
  name: string;
  mobile: string;
  village: string;
  taluka: string;
  district: string;
  status: string;
}

export interface SaleFormData {
  customer_id: number;
  sale_date: string;
  items: SaleItemFormData[];
  notes?: string;
}

export interface SaleItemFormData {
  product_id: number;
  quantity: number;
  rate: number;
}

export interface PaymentFormData {
  sale_id: number;
  payment_date: string;
  payment_method: string;
  amount: number;
  rrn?: string;
  reference?: string;
  notes?: string;
}

export interface DemoFormData {
  customer_id: number;
  distributor_id?: number;
  demo_date: string;
  demo_time: string;
  product_id: number;
  quantity_provided: number;
  follow_up_date?: string;
  demo_location?: string;
  notes?: string;
}

export interface DistributorFormData {
  name: string;
  village: string;
  taluka: string;
  district: string;
  mantri_name: string;
  mantri_mobile: string;
  sabhasad_count: number;
  sabhasad_morning?: number;
  sabhasad_evening?: number;
  contact_in_group: number;
}

// Chart data types
export interface ChartDataPoint {
  name: string;
  value: number;
  [key: string]: string | number;
}

export interface LineChartData {
  date: string;
  amount: number;
}

export interface PieChartData {
  name: string;
  value: number;
  color?: string;
}

export interface BarChartData {
  category: string;
  value: number;
  [key: string]: string | number;
}

// Filter types
export interface CustomerFilters {
  search?: string;
  status?: string;
  village?: string;
}

export interface SaleFilters {
  search?: string;
  payment_status?: string;
  start_date?: string;
  end_date?: string;
}

export interface DemoFilters {
  search?: string;
  conversion_status?: string;
  start_date?: string;
  end_date?: string;
}

// Navigation types
export type PageRoute =
  | "dashboard"
  | "customers"
  | "sales"
  | "payments"
  | "demos"
  | "distributors"
  | "reports"
  | "import";

export interface NavItem {
  id: PageRoute;
  label: string;
  icon: string;
  path: string;
}

// Theme types
export interface ThemeColors {
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  error: string;
  info: string;
}

export type ThemeMode = "light" | "dark";

// Notification types
export interface Notification {
  id: string;
  type: "success" | "error" | "warning" | "info";
  message: string;
  duration?: number;
}

// Table column types
export interface TableColumn<T = any> {
  id: string;
  label: string;
  field: keyof T | string;
  sortable?: boolean;
  filterable?: boolean;
  width?: number;
  align?: "left" | "center" | "right";
  format?: (value: any) => string | number;
  render?: (row: T) => React.ReactNode;
}

// Export utility types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };
