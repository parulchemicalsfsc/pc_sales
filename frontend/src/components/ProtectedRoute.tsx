import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Box, CircularProgress } from '@mui/material';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermission?: string;
}

export default function ProtectedRoute({ children, requiredPermission }: ProtectedRouteProps) {
  const { user, loading, hasPermission } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          bgcolor: 'background.default', // Use theme background instead of gradient
        }}
      >
        <CircularProgress size={40} color="primary" />
      </Box>
    );
  }

  // If not authenticated, redirect to login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check for required permission
  if (requiredPermission && !hasPermission(requiredPermission)) {
    // Prevent infinite loop if they are trying to access dashboard itself
    if (requiredPermission === 'view_dashboard') {
      if (hasPermission('view_lead_dashboard')) return <Navigate to="/lead-dashboard" replace />;
      if (hasPermission('view_all_leads')) return <Navigate to="/leads" replace />;
      if (hasPermission('work_leads')) return <Navigate to="/lead-workspace" replace />;
      if (hasPermission('view_calling_list')) return <Navigate to="/calling-list" replace />;
      if (hasPermission('view_customers')) return <Navigate to="/customers" replace />;
      if (hasPermission('view_sales')) return <Navigate to="/sales" replace />;
      if (hasPermission('view_orders')) return <Navigate to="/orders" replace />;
      if (hasPermission('view_demos')) return <Navigate to="/demos" replace />;
      if (hasPermission('view_distributors')) return <Navigate to="/distributors" replace />;
      if (hasPermission('view_shopkeepers')) return <Navigate to="/shopkeepers" replace />;
      if (hasPermission('view_doctors')) return <Navigate to="/doctors" replace />;
      if (hasPermission('view_reports')) return <Navigate to="/reports" replace />;
      if (hasPermission('view_activity_logs')) return <Navigate to="/admin" replace />;
      if (hasPermission('view_users')) return <Navigate to="/user-management" replace />;
      return <Navigate to="/activity" replace />;
    }
    
    // Default fallback
    if (hasPermission('view_dashboard')) return <Navigate to="/dashboard" replace />;
    if (hasPermission('view_lead_dashboard')) return <Navigate to="/lead-dashboard" replace />;
    if (hasPermission('view_all_leads')) return <Navigate to="/leads" replace />;
    if (hasPermission('work_leads')) return <Navigate to="/lead-workspace" replace />;
    return <Navigate to="/activity" replace />;
  }

  // User is authenticated, render the protected content
  return <>{children}</>;
}
