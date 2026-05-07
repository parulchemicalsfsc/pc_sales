import {
  BrowserRouter as Router,
  Routes,
  Route,

  Navigate,
} from "react-router-dom";
import { ThemeProvider, CssBaseline } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import Sales from "./pages/Sales";
import Payments from "./pages/Payments";
import Demos from "./pages/Demos";
import Distributors from "./pages/Distributors";
import Shopkeepers from "./pages/Shopkeepers";
import Doctors from "./pages/Doctors";
import Reports from "./pages/Reports";
import Forecasting from "./pages/Forecasting";
import DataImport from "./pages/DataImport";
import CallingList from "./pages/CallingList";
import OrderManagement from "./pages/OrderManagement";
import Admin from "./pages/Admin";
import CallDistribution from "./pages/CallDistribution";
import Algorithm from "./pages/Algorithm";
import UserManagement from "./pages/UserManagement";
import ProductPricing from "./pages/ProductPricing";
import Notifications from "./pages/Notifications";
import RoleManagement from "./pages/RoleManagement";
import Chat from "./pages/Chat";
import Activity from "./pages/Activity";
import LeadDashboard from "./pages/LeadDashboard";
import LeadPipeline from "./pages/LeadPipeline";
import LeadWorkspace from "./pages/LeadWorkspace";
import LeadHistory from "./pages/LeadHistory";
import { createAppTheme } from "./theme/theme";
import { PERMISSIONS } from "./config/permissions";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000,
    },
  },
});

function App() {
  const [mode, setMode] = useState<"light" | "dark">("light");
  const theme = createAppTheme(mode);

  const toggleTheme = () => {
    setMode((prevMode) => (prevMode === "light" ? "dark" : "light"));
  };

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <Router>
            <AuthProvider>
              <Routes>
                {/* Public Route */}
                <Route path="/login" element={<Login />} />

                {/* Protected Routes */}
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <Navigate to="/dashboard" replace />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_DASHBOARD}>
                      <Layout toggleTheme={toggleTheme} themeMode={mode}>
                        <Dashboard />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/customers"
                  element={
                    <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_CUSTOMERS}>
                      <Layout toggleTheme={toggleTheme} themeMode={mode}>
                        <Customers />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/sales"
                  element={
                    <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_SALES}>
                      <Layout toggleTheme={toggleTheme} themeMode={mode}>
                        <Sales />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/payments"
                  element={
                    <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_PAYMENTS}>
                      <Layout toggleTheme={toggleTheme} themeMode={mode}>
                        <Payments />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/demos"
                  element={
                    <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_DEMOS}>
                      <Layout toggleTheme={toggleTheme} themeMode={mode}>
                        <Demos />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/distributors"
                  element={
                    <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_DISTRIBUTORS}>
                      <Layout toggleTheme={toggleTheme} themeMode={mode}>
                        <Distributors />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/shopkeepers"
                  element={
                    <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_SHOPKEEPERS}>
                      <Layout toggleTheme={toggleTheme} themeMode={mode}>
                        <Shopkeepers />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/doctors"
                  element={
                    <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_DOCTORS}>
                      <Layout toggleTheme={toggleTheme} themeMode={mode}>
                        <Doctors />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/reports"
                  element={
                    <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_REPORTS}>
                      <Layout toggleTheme={toggleTheme} themeMode={mode}>
                        <Reports />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/forecasting"
                  element={
                    <ProtectedRoute requiredPermission={PERMISSIONS.RUN_FORECASTING}>
                      <Layout toggleTheme={toggleTheme} themeMode={mode}>
                        <Forecasting />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/import"
                  element={
                    <ProtectedRoute requiredPermission={PERMISSIONS.IMPORT_DATA}>
                      <Layout toggleTheme={toggleTheme} themeMode={mode}>
                        <DataImport />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/calling-list"
                  element={
                    <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_CALLING_LIST}>
                      <Layout toggleTheme={toggleTheme} themeMode={mode}>
                        <CallingList />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/activity"
                  element={
                    <ProtectedRoute>
                      <Layout toggleTheme={toggleTheme} themeMode={mode}>
                        <Activity />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/orders"
                  element={
                    <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_ORDERS}>
                      <Layout toggleTheme={toggleTheme} themeMode={mode}>
                        <OrderManagement />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_ACTIVITY_LOGS}>
                      <Layout toggleTheme={toggleTheme} themeMode={mode}>
                        <Admin />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/call-distribution"
                  element={
                    <ProtectedRoute requiredPermission={PERMISSIONS.RUN_CALL_DISTRIBUTION}>
                      <Layout toggleTheme={toggleTheme} themeMode={mode}>
                        <CallDistribution />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/user-management"
                  element={
                    <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_USERS}>
                      <Layout toggleTheme={toggleTheme} themeMode={mode}>
                        <UserManagement />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/product-pricing"

                  element={
                    <ProtectedRoute requiredPermission={PERMISSIONS.MANAGE_PRICING}>
                      <Layout toggleTheme={toggleTheme} themeMode={mode}>
                        <ProductPricing />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/role-management"
                  element={
                    <ProtectedRoute requiredPermission={PERMISSIONS.MANAGE_ROLES}>
                      <Layout toggleTheme={toggleTheme} themeMode={mode}>
                        <RoleManagement />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/algorithm"
                  element={
                    <ProtectedRoute requiredPermission={PERMISSIONS.RUN_ALGORITHM}>
                      <Layout toggleTheme={toggleTheme} themeMode={mode}>
                        <Algorithm />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/notifications"
                  element={
                    <ProtectedRoute>
                      <Layout toggleTheme={toggleTheme} themeMode={mode}>
                        <Notifications />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/chat"
                  element={
                    <ProtectedRoute>
                      <Layout toggleTheme={toggleTheme} themeMode={mode}>
                        <Chat />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/lead-dashboard"
                  element={
                    <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_LEAD_DASHBOARD}>
                      <Layout toggleTheme={toggleTheme} themeMode={mode}>
                        <LeadDashboard />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/leads"
                  element={
                    <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_ALL_LEADS}>
                      <Layout toggleTheme={toggleTheme} themeMode={mode}>
                        <LeadPipeline />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/lead-workspace"
                  element={
                    <ProtectedRoute requiredPermission={PERMISSIONS.WORK_LEADS}>
                      <Layout toggleTheme={toggleTheme} themeMode={mode}>
                        <LeadWorkspace />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/lead-history"
                  element={
                    <ProtectedRoute requiredPermission={PERMISSIONS.WORK_LEADS}>
                      <Layout toggleTheme={toggleTheme} themeMode={mode}>
                        <LeadHistory />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="*"
                  element={
                    <ProtectedRoute>
                      <Navigate to="/dashboard" replace />
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </AuthProvider>
          </Router>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
