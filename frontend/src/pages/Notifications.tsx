import { useState, useEffect } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Alert,
  IconButton,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Button,
  Menu,
  MenuItem,
  Divider,
  Badge,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  TextField,
} from "@mui/material";
import { ListSkeleton } from "../components/Skeletons";
import {
  Notifications as NotificationsIcon,
  NotificationsActive as NotificationsActiveIcon,
  CheckCircle as CheckCircleIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Delete as DeleteIcon,
  MoreVert as MoreVertIcon,
  Refresh as RefreshIcon,
  DoneAll as DoneAllIcon,
  FilterList as FilterListIcon,
  Circle as CircleIcon,
} from "@mui/icons-material";
import axios from "axios";
import { useAuth } from "../contexts/AuthContext";
import { useTranslation } from "../hooks/useTranslation";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "https://pc-sales-8phu.onrender.com";

interface Notification {
  notification_id: number;
  user_email?: string;
  title: string;
  message: string;
  notification_type: string;
  entity_type?: string;
  entity_id?: number;
  action_url?: string;
  is_read: boolean;
  created_at: string;
}

const notificationIcons: Record<string, any> = {
  info: <InfoIcon />,
  success: <CheckCircleIcon />,
  warning: <WarningIcon />,
  error: <ErrorIcon />,
};

const notificationColors: Record<string, string> = {
  info: "#2196f3",
  success: "#4caf50",
  warning: "#ff9800",
  error: "#f44336",
};

export default function Notifications() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filterRead, setFilterRead] = useState<boolean | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedNotification, setSelectedNotification] =
    useState<Notification | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    loadNotifications();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [filterRead, filterType]);

  const loadNotifications = async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      const params: any = {
        limit: 100,
        offset: 0,
      };

      if (filterRead !== null) {
        params.is_read = filterRead;
      }

      if (filterType) {
        params.notification_type = filterType;
      }

      const response = await axios.get(`${API_BASE_URL}/api/notifications`, {
        params,
        headers: {
          "x-user-email": user.email,
        },
      });

      setNotifications(response.data.data || []);
      setUnreadCount(response.data.unread_count || 0);
    } catch (err: any) {
      console.error("Error loading notifications:", err);
      setError(err.response?.data?.detail || "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (notificationId: number) => {
    if (!user) return;

    try {
      await axios.put(
        `${API_BASE_URL}/api/notifications/${notificationId}/mark-read`,
        {},
        {
          headers: {
            "x-user-email": user.email,
          },
        },
      );

      // Update local state
      setNotifications(
        notifications.map((n) =>
          n.notification_id === notificationId ? { ...n, is_read: true } : n,
        ),
      );
      setUnreadCount(Math.max(0, unreadCount - 1));
    } catch (err: any) {
      console.error("Error marking notification as read:", err);
      setError("Failed to mark notification as read");
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;

    try {
      await axios.put(
        `${API_BASE_URL}/api/notifications/mark-all-read`,
        {},
        {
          headers: {
            "x-user-email": user.email,
          },
        },
      );

      // Update local state
      setNotifications(notifications.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err: any) {
      console.error("Error marking all as read:", err);
      setError("Failed to mark all as read");
    }
  };

  const handleDelete = async (notificationId: number) => {
    if (!user) return;

    try {
      await axios.delete(
        `${API_BASE_URL}/api/notifications/${notificationId}`,
        {
          headers: {
            "x-user-email": user.email,
          },
        },
      );

      // Update local state
      setNotifications(
        notifications.filter((n) => n.notification_id !== notificationId),
      );
    } catch (err: any) {
      console.error("Error deleting notification:", err);
      setError("Failed to delete notification");
    }
  };

  const handleDeleteOld = async () => {
    if (!user) return;

    try {
      const response = await axios.delete(
        `${API_BASE_URL}/api/notifications/delete-old?days_old=30`,
        {
          headers: {
            "x-user-email": user.email,
          },
        },
      );

      setError(null);
      await loadNotifications();
      alert(`Deleted ${response.data.count} old notifications`);
    } catch (err: any) {
      console.error("Error deleting old notifications:", err);
      setError("Failed to delete old notifications");
    }
  };

  const handleMenuOpen = (
    event: React.MouseEvent<HTMLElement>,
    notification: Notification,
  ) => {
    setAnchorEl(event.currentTarget);
    setSelectedNotification(notification);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedNotification(null);
  };

  const handleShowDetails = (notification: Notification) => {
    setSelectedNotification(notification);
    setDetailsOpen(true);
    handleMenuClose();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  };

  const getNotificationIcon = (type: string) => {
    return notificationIcons[type] || <InfoIcon />;
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              {t("notifications.title", "Notifications")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {unreadCount > 0
                ? `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}`
                : "All caught up!"}
            </Typography>
          </Box>

          <Box sx={{ display: "flex", gap: 1 }}>
            <Tooltip title="Refresh">
              <IconButton onClick={loadNotifications} color="primary">
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            {unreadCount > 0 && (
              <Tooltip title="Mark all as read">
                <IconButton onClick={handleMarkAllAsRead} color="primary">
                  <DoneAllIcon />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Notifications List */}
      <Card>
        <CardContent>
          {loading ? (
            <ListSkeleton count={5} />
          ) : notifications.length === 0 ? (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 400,
                gap: 2,
              }}
            >
              <NotificationsIcon
                sx={{ fontSize: 80, color: "text.secondary", opacity: 0.3 }}
              />
              <Typography variant="h6" color="text.secondary">
                No notifications
              </Typography>
              <Typography variant="body2" color="text.secondary">
                You're all caught up! Check back later for updates.
              </Typography>
            </Box>
          ) : (
            <List sx={{ p: 0 }}>
              {notifications.map((notification, index) => (
                <Box key={notification.notification_id}>
                  {index > 0 && <Divider />}
                  <ListItem
                    sx={{
                      bgcolor: notification.is_read
                        ? "transparent"
                        : "action.hover",
                      "&:hover": {
                        bgcolor: "action.selected",
                      },
                      cursor: "pointer",
                      py: 2,
                    }}
                    onClick={() => {
                      if (!notification.is_read) {
                        handleMarkAsRead(notification.notification_id);
                      }
                      handleShowDetails(notification);
                    }}
                    secondaryAction={
                      <IconButton
                        edge="end"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMenuOpen(e, notification);
                        }}
                      >
                        <MoreVertIcon />
                      </IconButton>
                    }
                  >
                    <ListItemIcon>
                      <Box
                        sx={{
                          width: 48,
                          height: 48,
                          borderRadius: 2,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          bgcolor:
                            notificationColors[notification.notification_type] +
                            "20",
                          color:
                            notificationColors[notification.notification_type],
                        }}
                      >
                        {getNotificationIcon(notification.notification_type)}
                      </Box>
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            mb: 0.5,
                          }}
                        >
                          {!notification.is_read && (
                            <CircleIcon
                              sx={{
                                fontSize: 10,
                                color: "primary.main",
                              }}
                            />
                          )}
                          <Typography
                            variant="body1"
                            sx={{
                              fontWeight: notification.is_read ? 400 : 600,
                            }}
                          >
                            {notification.title}
                          </Typography>
                          {notification.entity_type && (
                            <Chip
                              label={notification.entity_type}
                              size="small"
                              sx={{ height: 20, fontSize: "0.7rem" }}
                            />
                          )}
                        </Box>
                      }
                      secondary={
                        <Box>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }}
                          >
                            {notification.message}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ mt: 0.5, display: "block" }}
                          >
                            {formatDate(notification.created_at)}
                          </Typography>
                        </Box>
                      }
                    />
                  </ListItem>
                </Box>
              ))}
            </List>
          )}
        </CardContent>
      </Card>

      {/* Context Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        {selectedNotification && !selectedNotification.is_read && (
          <MenuItem
            onClick={() => {
              handleMarkAsRead(selectedNotification.notification_id);
              handleMenuClose();
            }}
          >
            <CheckCircleIcon sx={{ mr: 1 }} fontSize="small" />
            Mark as read
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            if (selectedNotification) {
              handleShowDetails(selectedNotification);
            }
          }}
        >
          <InfoIcon sx={{ mr: 1 }} fontSize="small" />
          View details
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            if (selectedNotification) {
              handleDelete(selectedNotification.notification_id);
              handleMenuClose();
            }
          }}
          sx={{ color: "error.main" }}
        >
          <DeleteIcon sx={{ mr: 1 }} fontSize="small" />
          Delete
        </MenuItem>
      </Menu>

      {/* Details Dialog */}
      <Dialog
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor:
                  notificationColors[
                  selectedNotification?.notification_type || "info"
                  ] + "20",
                color:
                  notificationColors[
                  selectedNotification?.notification_type || "info"
                  ],
              }}
            >
              {getNotificationIcon(
                selectedNotification?.notification_type || "info",
              )}
            </Box>
            <Typography variant="h6">{selectedNotification?.title}</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <Typography variant="body1" sx={{ mb: 2 }}>
              {selectedNotification?.message}
            </Typography>

            <Divider sx={{ my: 2 }} />

            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">
                  Type
                </Typography>
                <Typography variant="body2">
                  {selectedNotification?.notification_type}
                </Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">
                  Status
                </Typography>
                <Typography variant="body2">
                  {selectedNotification?.is_read ? "Read" : "Unread"}
                </Typography>
              </Grid>
              {selectedNotification?.entity_type && (
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">
                    Entity
                  </Typography>
                  <Typography variant="body2">
                    {selectedNotification.entity_type}
                    {selectedNotification.entity_id &&
                      ` #${selectedNotification.entity_id}`}
                  </Typography>
                </Grid>
              )}
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">
                  Created
                </Typography>
                <Typography variant="body2">
                  {selectedNotification?.created_at &&
                    new Date(selectedNotification.created_at).toLocaleString(
                      "en-IN",
                      {
                        dateStyle: "medium",
                        timeStyle: "short",
                      },
                    )}
                </Typography>
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsOpen(false)}>Close</Button>
          {selectedNotification && !selectedNotification.is_read && (
            <Button
              variant="contained"
              onClick={() => {
                handleMarkAsRead(selectedNotification.notification_id);
                setDetailsOpen(false);
              }}
            >
              Mark as Read
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
