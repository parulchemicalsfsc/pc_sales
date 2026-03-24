import { useState, useEffect } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Alert,
  Chip,
  TextField,
  MenuItem,
  Grid,
  IconButton,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  InputAdornment,
  Avatar,
} from "@mui/material";
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  History as HistoryIcon,
} from "@mui/icons-material";
import { TableSkeleton } from "../components/Skeletons";
import { useAuth } from "../contexts/AuthContext";
import { PERMISSIONS } from "../config/permissions";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

interface ActivityLog {
  id: number;
  user_email: string;
  user_name?: string;
  action_type: string;
  action_description: string;
  entity_type?: string;
  entity_id?: number;
  entity_name?: string;
  metadata?: any;
  created_at: string;
}

const actionTypeColors: Record<
  string,
  "success" | "info" | "error" | "warning" | "default"
> = {
  CREATE: "success",
  UPDATE: "info",
  DELETE: "error",
  IMPORT: "warning",
  EXPORT: "info",
  LOGIN: "default",
  LOGOUT: "default",
  VIEW: "default",
};

export default function AdminLogs() {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterUserEmail, setFilterUserEmail] = useState("");
  const [filterActionType, setFilterActionType] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [total, setTotal] = useState(0);

  // Check if user has permission
  useEffect(() => {
    if (user && !hasPermission(PERMISSIONS.VIEW_ACTIVITY_LOGS)) {
      setError("Access denied. You need activity log permissions.");
      setTimeout(() => {
        navigate("/dashboard");
      }, 2000);
    }
  }, [user, navigate, hasPermission]);

  // Load activity logs
  const loadActivities = async () => {
    if (!user || !hasPermission(PERMISSIONS.VIEW_ACTIVITY_LOGS)) return;

    try {
      setLoading(true);
      setError(null);

      const params: any = {
        limit: rowsPerPage,
        offset: page * rowsPerPage,
      };

      if (filterUserEmail) params.user_email = filterUserEmail;
      if (filterActionType) params.action_type = filterActionType;

      const response = await axios.get(
        `${API_BASE_URL}/api/admin/activity-logs`,
        {
          params,
          headers: {
            "x-user-email": user.email,
          },
        },
      );

      setActivities(response.data.data || []);
      setTotal(response.data.total || 0);
    } catch (err: any) {
      console.error("Error loading activities:", err);
      setError(err.response?.data?.detail || "Failed to load activity logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && hasPermission(PERMISSIONS.VIEW_ACTIVITY_LOGS)) {
      loadActivities();
    }
  }, [user, page, rowsPerPage, filterUserEmail, filterActionType]);

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const formatDate = (dateString: string) => {
    const utcDate = dateString.endsWith("Z")
      ? new Date(dateString)
      : new Date(dateString + "Z");

    return utcDate.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  };

  const filteredActivities = activities.filter((activity) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      activity.user_email?.toLowerCase().includes(search) ||
      activity.action_description?.toLowerCase().includes(search) ||
      activity.entity_name?.toLowerCase().includes(search)
    );
  });

  // Get unique values for filters
  const uniqueUsers = Array.from(
    new Set(activities.map((a) => a.user_email).filter(Boolean)),
  );
  const uniqueActionTypes = Array.from(
    new Set(activities.map((a) => a.action_type).filter(Boolean)),
  );

  if (!user || !hasPermission(PERMISSIONS.VIEW_ACTIVITY_LOGS)) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "60vh",
        }}
      >
        <Alert severity="error">
          Access denied. You need activity log permissions to view this page.
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, display: "flex", alignItems: "center", gap: 1 }}>
          <HistoryIcon color="primary" /> Activity Logs
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Track all user actions across the system
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Activity Logs */}
      <Card>
        <CardContent>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mb: 2,
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Recent Activity ({total} total)
            </Typography>
            <Tooltip title="Refresh">
              <IconButton
                onClick={loadActivities}
                color="primary"
                disabled={loading}
              >
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Box>

          {/* Filters */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="Search"
                variant="outlined"
                size="small"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="Filter by User"
                variant="outlined"
                size="small"
                select
                value={filterUserEmail}
                onChange={(e) => setFilterUserEmail(e.target.value)}
              >
                <MenuItem value="">All Users</MenuItem>
                {uniqueUsers.map((email) => (
                  <MenuItem key={email} value={email}>
                    {email}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="Filter by Action Type"
                variant="outlined"
                size="small"
                select
                value={filterActionType}
                onChange={(e) => setFilterActionType(e.target.value)}
              >
                <MenuItem value="">All Actions</MenuItem>
                {uniqueActionTypes.map((type) => (
                  <MenuItem key={type} value={type}>
                    {type}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>

          {loading ? (
            <TableSkeleton rows={10} columns={5} />
          ) : (
            <>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>User</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Action</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>
                        Description
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Entity</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>
                        Date & Time
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredActivities.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          align="center"
                          sx={{ py: 4 }}
                        >
                          <Typography color="text.secondary">
                            No activities found
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredActivities.map((activity) => (
                        <TableRow key={activity.id} hover>
                          <TableCell>
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                              }}
                            >
                              <Avatar
                                sx={{
                                  width: 28,
                                  height: 28,
                                  bgcolor: "primary.main",
                                  fontSize: "0.75rem",
                                }}
                              >
                                {activity.user_email?.charAt(0).toUpperCase()}
                              </Avatar>
                              <Typography
                                variant="body2"
                                sx={{ fontWeight: 500 }}
                              >
                                {activity.user_email}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={activity.action_type}
                              color={
                                actionTypeColors[activity.action_type] ||
                                "default"
                              }
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">
                              {activity.action_description}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography
                              variant="body2"
                              color="text.secondary"
                            >
                              {activity.entity_name ||
                                activity.entity_type ||
                                "-"}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography
                              variant="body2"
                              color="text.secondary"
                            >
                              {formatDate(activity.created_at)}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                rowsPerPageOptions={[10, 25, 50, 100]}
                component="div"
                count={total}
                rowsPerPage={rowsPerPage}
                page={page}
                onPageChange={handleChangePage}
                onRowsPerPageChange={handleChangeRowsPerPage}
              />
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
