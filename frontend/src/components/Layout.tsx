import { useState, useEffect, useRef, useCallback } from "react";
import { useSessionTracker } from "../hooks/useSessionTracker";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  useTheme,
  useMediaQuery,
  Avatar,
  Tooltip,
  Badge,
  Menu,
  MenuItem,
  ListItemAvatar,
  Snackbar,
  Alert,
  Slide,
  Paper,
  Button,
  Collapse,
} from "@mui/material";

import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  People as PeopleIcon,
  ShoppingCart as ShoppingCartIcon,
  Payment as PaymentIcon,
  Science as ScienceIcon,
  Group as GroupIcon,
  Assessment as AssessmentIcon,
  CloudUpload as CloudUploadIcon,
  PhoneInTalk as PhoneInTalkIcon,
  LocalShipping as LocalShippingIcon,
  Brightness4,
  Brightness7,
  Notifications,
  Timeline as TimelineIcon,
  Settings,
  AccountCircle,
  Language as LanguageIcon,
  Logout as LogoutIcon,
  AdminPanelSettings as AdminIcon,
  AttachMoney as MoneyIcon,
  Shield as ShieldIcon,
  ManageAccounts as ManageAccountsIcon,
  Chat as ChatIcon,
  History as HistoryIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  ArrowBack as ArrowBackIcon,
  TrendingUp as TrendingUpIcon,
  ExpandLess,
  ExpandMore,
} from "@mui/icons-material";

import { useTranslation } from "../hooks/useTranslation";
import { useLanguageStore } from "../store/languageStore";
import type { Language } from "../i18n/i18n";
import { languages } from "../i18n/i18n";
import { useAuth, supabase } from "../contexts/AuthContext";
import { notificationsAPI, activityAPI } from "../services/api";
import { PERMISSIONS } from "../config/permissions";


const EXPANDED_DRAWER_WIDTH = 240;
const COLLAPSED_DRAWER_WIDTH = 72;
const SIDEBAR_STORAGE_KEY = "layout_sidebar_expanded";
const TOP_LEVEL_ROUTES = new Set([
  "/dashboard",
  "/customers",
  "/sales",
  "/payments",
  "/demos",
  "/distributors",
  "/shopkeepers",
  "/doctors",
  "/reports",
  "/import",
  "/calling-list",
  "/activity",
  "/orders",
  "/admin",
  "/call-distribution",
  "/user-management",
  "/product-pricing",
  "/role-management",
  "/algorithm",
  "/notifications",
  "/chat",
  "/forecasting",
]);

interface LayoutProps {
  children: React.ReactNode;
  toggleTheme: () => void;
  themeMode: "light" | "dark";
}

interface NavItem {
  id: string;
  labelKey: string;
  icon: React.ReactElement;
  path: string;
  badge?: number;
  permission?: string;
  children?: NavItem[];
}

const navigationItems: NavItem[] = [
  {
    id: "dashboard",
    labelKey: "nav.dashboard",
    icon: <DashboardIcon />,
    path: "/dashboard",
    permission: PERMISSIONS.VIEW_DASHBOARD,
  },
  {
    id: "distributors-group",
    labelKey: "nav.distributorsGroup",
    icon: <GroupIcon />,
    path: "#",
    children: [
      {
        id: "distributors",
        labelKey: "nav.distributors",
        icon: <GroupIcon />,
        path: "/distributors",
        permission: PERMISSIONS.VIEW_DISTRIBUTORS,
      },
      {
        id: "shopkeepers",
        labelKey: "nav.shopkeepers",
        icon: <GroupIcon />,
        path: "/shopkeepers",
        permission: PERMISSIONS.VIEW_SHOPKEEPERS,
      },
      {
        id: "doctors",
        labelKey: "nav.doctors",
        icon: <GroupIcon />,
        path: "/doctors",
        permission: PERMISSIONS.VIEW_DOCTORS,
      },
    ]
  },
  {
    id: "orders",
    labelKey: "nav.orders",
    icon: <LocalShippingIcon />,
    path: "/orders",
    permission: PERMISSIONS.VIEW_ORDERS,
  },
  {
    id: "payments",
    labelKey: "nav.payments",
    icon: <PaymentIcon />,
    path: "/payments",
    permission: PERMISSIONS.VIEW_PAYMENTS,
  },
  {
    id: "sales",
    labelKey: "nav.sales",
    icon: <ShoppingCartIcon />,
    path: "/sales",
    permission: PERMISSIONS.VIEW_SALES,
  },
  {
    id: "customers",
    labelKey: "nav.customers",
    icon: <PeopleIcon />,
    path: "/customers",
    permission: PERMISSIONS.VIEW_CUSTOMERS,
  },
  {
    id: "demos",
    labelKey: "nav.demos",
    icon: <ScienceIcon />,
    path: "/demos",
    permission: PERMISSIONS.VIEW_DEMOS,
  },
  {
    id: "reports",
    labelKey: "nav.reports",
    icon: <AssessmentIcon />,
    path: "/reports",
    permission: PERMISSIONS.VIEW_REPORTS,
  },
  {
    id: "calling-list",
    labelKey: "nav.callingList",
    icon: <PhoneInTalkIcon />,
    path: "/calling-list",
    permission: PERMISSIONS.VIEW_CALLING_LIST,
  },
  {
    id: "forecasting",
    labelKey: "nav.forecasting",
    icon: <TrendingUpIcon />,
    path: "/forecasting",
    permission: PERMISSIONS.RUN_FORECASTING,
  },
  {
    id: "import",
    labelKey: "nav.import",
    icon: <CloudUploadIcon />,
    path: "/import",
    permission: PERMISSIONS.IMPORT_DATA,
  },
  {
    id: "chat",
    labelKey: "nav.chat",
    icon: <ChatIcon />,
    path: "/chat",
  },
  {
    id: "activity",
    labelKey: "nav.activity",
    icon: <TimelineIcon />,
    path: "/activity",
    // No permission needed - visible to all authenticated users
  },
];

const adminNavigationItem: NavItem = {
  id: "admin",
  labelKey: "nav.admin",
  icon: <AdminIcon />,
  path: "/admin",
};

const roleManagementNavItem: NavItem = {
  id: "role-management",
  labelKey: "nav.roleManagement",
  icon: <ShieldIcon />,
  path: "/role-management",
};

export default function Layout({
  children,
  toggleTheme,
  themeMode,
}: LayoutProps) {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return stored === null ? true : stored === "true";
  });
  const [languageAnchorEl, setLanguageAnchorEl] = useState<null | HTMLElement>(
    null,
  );
  const [userMenuAnchorEl, setUserMenuAnchorEl] = useState<null | HTMLElement>(
    null,
  );
  const [openSubMenus, setOpenSubMenus] = useState<Record<string, boolean>>({});
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguageStore();

  const { user, signOut, hasPermission } = useAuth();

  // Run session tracking globally from Layout so it continues across all pages
  useSessionTracker({ userEmail: user?.email });
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  // Ref so the realtime callback always sees the latest pathname without re-subscribing
  const pathnameRef = useRef(location.pathname);
  useEffect(() => { pathnameRef.current = location.pathname; }, [location.pathname]);

  // localStorage key per user — stores the last time they visited /chat
  const chatSeenKey = user?.email ? `chat_last_seen_${user.email}` : null;

  // ── Chat unread badge logic ──────────────────────────────────────────────────
  // Uses localStorage to track "last time user visited /chat", so the count
  // survives page refreshes without depending on Supabase read receipts at all.
  const initChatUnread = useCallback(async () => {
    if (!user?.email) return;

    // Read the last-seen timestamp from localStorage (written when user visits /chat)
    const key = `chat_last_seen_${user.email}`;
    const lastSeen = localStorage.getItem(key);
    // If the user has never opened chat, don't show a badge for historical messages
    if (!lastSeen) { setChatUnreadCount(0); return; }

    // Get all conversations this user is in
    const { data: parts } = await supabase
      .from("chat_participants")
      .select("conversation_id")
      .eq("user_email", user.email);
    if (!parts || parts.length === 0) { setChatUnreadCount(0); return; }
    const convIds = parts.map((p: any) => p.conversation_id);

    // Count messages that arrived after the last /chat visit
    let total = 0;
    await Promise.all(convIds.map(async (id: number) => {
      const { count } = await supabase
        .from("chat_messages")
        .select("*", { count: "exact", head: true })
        .eq("conversation_id", id)
        .eq("is_deleted", false)
        .gt("created_at", lastSeen)
        .neq("sender_email", user.email);
      total += count ?? 0;
    }));
    setChatUnreadCount(total);
  }, [user?.email]);
  const desktopDrawerWidth = sidebarExpanded
    ? EXPANDED_DRAWER_WIDTH
    : COLLAPSED_DRAWER_WIDTH;
  const pathSegments = location.pathname.split("/").filter(Boolean);
  const showBackButton =
    location.pathname !== "/" &&
    !TOP_LEVEL_ROUTES.has(location.pathname) &&
    pathSegments.length > 0;

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarExpanded));
  }, [sidebarExpanded]);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const toggleSidebar = () => {
    setSidebarExpanded((prev) => !prev);
  };

  const handleNavigation = (path: string) => {
    navigate(path);
    if (isMobile) {
      setMobileOpen(false);
    }
  };

  const handleLanguageMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setLanguageAnchorEl(event.currentTarget);
  };

  const handleLanguageMenuClose = () => {
    setLanguageAnchorEl(null);
  };

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
    handleLanguageMenuClose();
  };

  const handleUserMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setUserMenuAnchorEl(event.currentTarget);
  };

  const handleUserMenuClose = () => {
    setUserMenuAnchorEl(null);
  };

  const handleLogout = async () => {
    try {
      await signOut();
      handleUserMenuClose();
      navigate("/login");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const isActive = (path: string) => location.pathname === path;

  // Fetch unread notifications count
  const fetchUnreadCount = async () => {
    if (!user?.email) return;
    try {
      const response = await notificationsAPI.getUnreadCount();
      const data = response.data; // Assuming response.data is the object containing count

      // Safety check before accessing count
      if (data && typeof data.count === "number") {
        setUnreadCount(data.count);
      } else {
        setUnreadCount(0);
      }
    } catch (error) {
      console.error("Error fetching unread count:", error);
      setUnreadCount(0); // Set to 0 on error to prevent UI issues
    }
  };

  // Fetch unread count on mount and periodically
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000); // Every 30 seconds

    // Add realtime listener so the bell icon instantly pops up when mentioned
    if (!user?.email) return () => clearInterval(interval);

    const channel = supabase
      .channel(`notifications-${user.email}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_email=eq.${user.email}`,
        },
        (payload) => {
          // Instantly refresh the count when a new notification arrives
          fetchUnreadCount();

          // Spawn native notification
          if ("Notification" in window && Notification.permission === "granted") {
            const newNotif = payload.new as any;
            if (newNotif && newNotif.title) {
              new Notification(newNotif.title, {
                body: newNotif.message || "",
                icon: "/logo.png"
              });
            }
          }
        },
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [user?.email]);

  // Refresh unread count when navigating away from notifications page
  useEffect(() => {
    if (location.pathname !== "/notifications") {
      fetchUnreadCount();
    }
  }, [location.pathname]);

  // ── Chat unread badge: initial load + realtime maintenance ──────────────────
  useEffect(() => {
    if (!user?.email) return;
    // One-time initial count on mount
    initChatUnread();

    // Realtime: increment when a new message arrives while NOT on /chat
    const chatChannel = supabase
      .channel(`layout-chat-unread-${user.email}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const msg = payload.new as any;
          // Ignore own messages and messages received while on the chat page
          if (msg.sender_email === user.email) return;
          if (pathnameRef.current === "/chat") return;
          setChatUnreadCount((n) => n + 1);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(chatChannel); };
  }, [user?.email]);

  // Zero the chat badge the moment the user navigates TO /chat,
  // and stamp localStorage so the next mount knows what's already been seen.
  useEffect(() => {
    if (location.pathname === "/chat" && user?.email) {
      const key = `chat_last_seen_${user.email}`;
      localStorage.setItem(key, new Date().toISOString());
      setChatUnreadCount(0);
    }
  }, [location.pathname, user?.email]);

  // Real-time Activity Toast Polling
  const [activityToast, setActivityToast] = useState<{
    msg: string;
    severity: "success" | "info";
  } | null>(null);
  const lastActivityId = useRef<number | null>(null);

  const fetchRecentActivity = async () => {
    if (!user?.email) return;
    try {
      // Only fetch 1 to make it light
      const res = await activityAPI.getMyLogs(
        new Date().toISOString().split("T")[0],
      );
      if (res.logs && res.logs.length > 0) {
        const latest = res.logs[0];
        // Only show toast if we already initialized (lastActivityId.current !== null)
        // and it's a new ID
        if (
          lastActivityId.current !== null &&
          latest.id !== lastActivityId.current
        ) {
          const isDeleted = latest.action_type === "DELETE";
          setActivityToast({
            msg:
              latest.action_description ||
              `${latest.action_type} ${latest.entity_type}`,
            severity: isDeleted ? "info" : "success",
          });
        }
        lastActivityId.current = latest.id;
      }
    } catch (error) {
      // silently fail
    }
  };

  useEffect(() => {
    fetchRecentActivity();
    const interval = setInterval(fetchRecentActivity, 5000); // Check every 5 seconds (faster)
    return () => clearInterval(interval);
  }, [user?.email]);

  const handleCloseToast = () => setActivityToast(null);

  const handleNotificationsClick = () => {
    navigate("/notifications");
  };

  const drawer = (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Logo Section */}
      <Box
        sx={{
          py: 2,
          px: sidebarExpanded ? 2 : 1.5,
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          justifyContent: sidebarExpanded ? "flex-start" : "center",
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          color: "white",
          minHeight: 64,
          transition: theme.transitions.create(["padding"], {
            duration: theme.transitions.duration.shorter,
          }),
        }}
      >
        <Avatar
          src="/logo.png"
          alt="Sales Management Logo"
          sx={{
            width: 40,
            height: 40,
            bgcolor: "rgba(255, 255, 255, 0.2)",
            flexShrink: 0,
          }}
        />
        {sidebarExpanded && (
          <Box sx={{ minWidth: 0, overflow: "hidden" }}>
            <Typography
              sx={{
                fontWeight: 700,
                fontSize: "0.9rem",
                lineHeight: 1.2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              Sales Management
            </Typography>
            <Typography
              sx={{
                opacity: 0.85,
                fontSize: "0.75rem",
                lineHeight: 1.2,
                whiteSpace: "nowrap",
              }}
            >
              System
            </Typography>
          </Box>
        )}
      </Box>

      <Divider />

      {/* Navigation Items */}
      <List sx={{ flex: 1, py: 2, px: 1 }}>
        {navigationItems
          .filter((item) => {
            if (item.permission) {
              return hasPermission(item.permission);
            }
            return true;
          })
          .map((item) => {
            const active = isActive(item.path);
            // Inject live badge count for chat nav item
            // Suppress chat badge when user is already on /chat page
            const chatBadge = location.pathname === "/chat" ? 0 : chatUnreadCount;
            const badgeCount =
              item.id === "chat" ? chatBadge || undefined : item.badge;
            return (
              <Box key={item.id}>
                <ListItem disablePadding sx={{ mb: 0.5 }}>
                  <ListItemButton
                    onClick={() => {
                      if (item.children) {
                        setOpenSubMenus((prev) => ({
                          ...prev,
                          [item.id]: !prev[item.id],
                        }));
                      } else {
                        handleNavigation(item.path);
                      }
                    }}
                    sx={{
                      borderRadius: sidebarExpanded ? 2 : "50%",
                      mx: sidebarExpanded ? 1 : "auto",
                      my: sidebarExpanded ? 0 : 0.25,
                      width: sidebarExpanded ? "auto" : 44,
                      height: sidebarExpanded ? "auto" : 44,
                      minHeight: sidebarExpanded ? 48 : 44,
                      px: sidebarExpanded ? 2 : 0,
                      py: sidebarExpanded ? 1 : 0,
                      justifyContent: "center",
                      backgroundColor: active
                        ? theme.palette.mode === "dark"
                          ? "rgba(144, 202, 249, 0.16)"
                          : "rgba(25, 118, 210, 0.08)"
                        : "transparent",
                      color: active ? theme.palette.primary.main : "inherit",
                      "&:hover": {
                        backgroundColor:
                          theme.palette.mode === "dark"
                            ? "rgba(144, 202, 249, 0.08)"
                            : "rgba(25, 118, 210, 0.04)",
                      },
                      transition: "all 0.2s",
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        color: active ? theme.palette.primary.main : "inherit",
                        minWidth: sidebarExpanded ? 40 : 0,
                        justifyContent: "center",
                      }}
                    >
                      {badgeCount ? (
                        <Badge badgeContent={badgeCount} color="error">
                          {item.icon}
                        </Badge>
                      ) : (
                        item.icon
                      )}
                    </ListItemIcon>
                    {sidebarExpanded && (
                      <ListItemText
                        primary={item.id === "distributors-group" ? "Distributors" : t(item.labelKey)}
                        primaryTypographyProps={{
                          fontWeight: active ? 600 : 500,
                          fontSize: "0.875rem",
                          noWrap: true,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      />
                    )}
                    {sidebarExpanded && item.children && (
                      openSubMenus[item.id] ? <ExpandLess /> : <ExpandMore />
                    )}
                  </ListItemButton>
                </ListItem>
                {item.children && sidebarExpanded && (
                  <Collapse in={openSubMenus[item.id]} timeout="auto" unmountOnExit>
                    <List component="div" disablePadding>
                      {item.children.map((child) => (
                        <ListItem key={child.id} disablePadding sx={{ mb: 0.5 }}>
                          <ListItemButton
                            onClick={() => handleNavigation(child.path)}
                            sx={{
                              borderRadius: 2,
                              mx: 1,
                              my: 0,
                              minHeight: 40,
                              pl: 4,
                              backgroundColor: isActive(child.path)
                                ? theme.palette.mode === "dark"
                                  ? "rgba(144, 202, 249, 0.16)"
                                  : "rgba(25, 118, 210, 0.08)"
                                : "transparent",
                              color: isActive(child.path) ? theme.palette.primary.main : "inherit",
                              "&:hover": {
                                backgroundColor:
                                  theme.palette.mode === "dark"
                                    ? "rgba(144, 202, 249, 0.08)"
                                    : "rgba(25, 118, 210, 0.04)",
                              },
                            }}
                          >
                            <ListItemIcon sx={{ minWidth: 32, color: isActive(child.path) ? theme.palette.primary.main : "inherit" }}>
                              {child.icon}
                            </ListItemIcon>
                            <ListItemText
                              primary={t(child.labelKey)}
                              primaryTypographyProps={{
                                fontWeight: isActive(child.path) ? 600 : 500,
                                fontSize: "0.85rem",
                              }}
                            />
                          </ListItemButton>
                        </ListItem>
                      ))}
                    </List>
                  </Collapse>
                )}
              </Box>
            );
          })}

        {/* Admin Navigation - Only for users with admin permissions */}
        {(hasPermission(PERMISSIONS.VIEW_ACTIVITY_LOGS) ||
          hasPermission(PERMISSIONS.RUN_CALL_DISTRIBUTION) ||
          hasPermission(PERMISSIONS.VIEW_USERS) ||
          hasPermission(PERMISSIONS.MANAGE_PRICING) ||
          hasPermission(PERMISSIONS.MANAGE_ROLES)) && (
            <>
              <Divider sx={{ my: 1 }} />
              {hasPermission(PERMISSIONS.RUN_CALL_DISTRIBUTION) && (
                <ListItem disablePadding sx={{ mb: 0.5 }}>
                  <ListItemButton
                    onClick={() => handleNavigation("/call-distribution")}
                    sx={{
                      borderRadius: sidebarExpanded ? 2 : "50%",
                      mx: sidebarExpanded ? 1 : "auto",
                      my: sidebarExpanded ? 0 : 0.25,
                      width: sidebarExpanded ? "auto" : 44,
                      height: sidebarExpanded ? "auto" : 44,
                      minHeight: sidebarExpanded ? 48 : 44,
                      px: sidebarExpanded ? 2 : 0,
                      py: sidebarExpanded ? 1 : 0,
                      justifyContent: "center",
                      backgroundColor: isActive("/call-distribution")
                        ? theme.palette.mode === "dark"
                          ? "rgba(244, 67, 54, 0.16)"
                          : "rgba(211, 47, 47, 0.08)"
                        : "transparent",
                      color: isActive("/call-distribution")
                        ? "error.main"
                        : "inherit",
                      "&:hover": {
                        backgroundColor:
                          theme.palette.mode === "dark"
                            ? "rgba(244, 67, 54, 0.08)"
                            : "rgba(211, 47, 47, 0.04)",
                      },
                      transition: "all 0.2s",
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        color: isActive("/call-distribution")
                          ? "error.main"
                          : "inherit",
                        minWidth: sidebarExpanded ? 40 : 0,
                        justifyContent: "center",
                      }}
                    >
                      <AdminIcon />
                    </ListItemIcon>
                    {sidebarExpanded && (
                      <ListItemText
                        primary={t("nav.callDistribution", "Call Distribution")}
                        primaryTypographyProps={{
                          fontWeight: isActive("/call-distribution") ? 600 : 500,
                          fontSize: "0.875rem",
                          noWrap: true,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      />
                    )}
                  </ListItemButton>
                </ListItem>
              )}
              {hasPermission(PERMISSIONS.VIEW_ACTIVITY_LOGS) && (
                <ListItem disablePadding sx={{ mb: 0.5 }}>
                  <ListItemButton
                    onClick={() => handleNavigation("/admin")}
                    sx={{
                      borderRadius: sidebarExpanded ? 2 : "50%",
                      mx: sidebarExpanded ? 1 : "auto",
                      my: sidebarExpanded ? 0 : 0.25,
                      width: sidebarExpanded ? "auto" : 44,
                      height: sidebarExpanded ? "auto" : 44,
                      minHeight: sidebarExpanded ? 48 : 44,
                      px: sidebarExpanded ? 2 : 0,
                      py: sidebarExpanded ? 1 : 0,
                      justifyContent: "center",
                      backgroundColor: isActive("/admin")
                        ? theme.palette.mode === "dark"
                          ? "rgba(244, 67, 54, 0.16)"
                          : "rgba(211, 47, 47, 0.08)"
                        : "transparent",
                      color: isActive("/admin") ? "error.main" : "inherit",
                      "&:hover": {
                        backgroundColor:
                          theme.palette.mode === "dark"
                            ? "rgba(244, 67, 54, 0.08)"
                            : "rgba(211, 47, 47, 0.04)",
                      },
                      transition: "all 0.2s",
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        color: isActive("/admin") ? "error.main" : "inherit",
                        minWidth: sidebarExpanded ? 40 : 0,
                        justifyContent: "center",
                      }}
                    >
                      <HistoryIcon />
                    </ListItemIcon>
                    {sidebarExpanded && (
                      <ListItemText
                        primary={t("nav.activityLogs", "Activity Logs")}
                        primaryTypographyProps={{
                          fontWeight: isActive("/admin") ? 600 : 500,
                          fontSize: "0.875rem",
                          noWrap: true,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      />
                    )}
                  </ListItemButton>
                </ListItem>
              )}
              {hasPermission(PERMISSIONS.VIEW_USERS) && (
                <ListItem disablePadding sx={{ mb: 0.5 }}>
                  <ListItemButton
                    onClick={() => handleNavigation("/user-management")}
                    sx={{
                      borderRadius: sidebarExpanded ? 2 : "50%",
                      mx: sidebarExpanded ? 1 : "auto",
                      my: sidebarExpanded ? 0 : 0.25,
                      width: sidebarExpanded ? "auto" : 44,
                      height: sidebarExpanded ? "auto" : 44,
                      minHeight: sidebarExpanded ? 48 : 44,
                      px: sidebarExpanded ? 2 : 0,
                      py: sidebarExpanded ? 1 : 0,
                      justifyContent: "center",
                      backgroundColor: isActive("/user-management")
                        ? theme.palette.mode === "dark"
                          ? "rgba(244, 67, 54, 0.16)"
                          : "rgba(211, 47, 47, 0.08)"
                        : "transparent",
                      color: isActive("/user-management")
                        ? "error.main"
                        : "inherit",
                      "&:hover": {
                        backgroundColor:
                          theme.palette.mode === "dark"
                            ? "rgba(244, 67, 54, 0.08)"
                            : "rgba(211, 47, 47, 0.04)",
                      },
                      transition: "all 0.2s",
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        color: isActive("/user-management")
                          ? "error.main"
                          : "inherit",
                        minWidth: sidebarExpanded ? 40 : 0,
                        justifyContent: "center",
                      }}
                    >
                      <ManageAccountsIcon />
                    </ListItemIcon>
                    {sidebarExpanded && (
                      <ListItemText
                        primary={t("nav.userManagement", "User Management")}
                        primaryTypographyProps={{
                          fontWeight: isActive("/user-management") ? 600 : 500,
                          fontSize: "0.875rem",
                          noWrap: true,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      />
                    )}
                  </ListItemButton>
                </ListItem>
              )}
              {hasPermission(PERMISSIONS.MANAGE_PRICING) && (
                <ListItem disablePadding sx={{ mb: 0.5 }}>
                  <ListItemButton
                    onClick={() => handleNavigation("/product-pricing")}
                    sx={{
                      borderRadius: sidebarExpanded ? 2 : "50%",
                      mx: sidebarExpanded ? 1 : "auto",
                      my: sidebarExpanded ? 0 : 0.25,
                      width: sidebarExpanded ? "auto" : 44,
                      height: sidebarExpanded ? "auto" : 44,
                      minHeight: sidebarExpanded ? 48 : 44,
                      px: sidebarExpanded ? 2 : 0,
                      py: sidebarExpanded ? 1 : 0,
                      justifyContent: "center",
                      backgroundColor: isActive("/product-pricing")
                        ? theme.palette.mode === "dark"
                          ? "rgba(244, 67, 54, 0.16)"
                          : "rgba(211, 47, 47, 0.08)"
                        : "transparent",
                      color: isActive("/product-pricing")
                        ? "error.main"
                        : "inherit",
                      "&:hover": {
                        backgroundColor:
                          theme.palette.mode === "dark"
                            ? "rgba(244, 67, 54, 0.08)"
                            : "rgba(211, 47, 47, 0.04)",
                      },
                      transition: "all 0.2s",
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        color: isActive("/product-pricing")
                          ? "error.main"
                          : "inherit",
                        minWidth: sidebarExpanded ? 40 : 0,
                        justifyContent: "center",
                      }}
                    >
                      <MoneyIcon />
                    </ListItemIcon>
                    {sidebarExpanded && (
                      <ListItemText
                        primary={t("nav.productPricing", "Product Pricing")}
                        primaryTypographyProps={{
                          fontWeight: isActive("/product-pricing") ? 600 : 500,
                          fontSize: "0.875rem",
                          noWrap: true,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      />
                    )}
                  </ListItemButton>
                </ListItem>
              )}
              {hasPermission(PERMISSIONS.MANAGE_ROLES) && (
                <ListItem disablePadding sx={{ mb: 0.5 }}>
                  <ListItemButton
                    onClick={() => handleNavigation(roleManagementNavItem.path)}
                    sx={{
                      borderRadius: sidebarExpanded ? 2 : "50%",
                      mx: sidebarExpanded ? 1 : "auto",
                      my: sidebarExpanded ? 0 : 0.25,
                      width: sidebarExpanded ? "auto" : 44,
                      height: sidebarExpanded ? "auto" : 44,
                      minHeight: sidebarExpanded ? 48 : 44,
                      px: sidebarExpanded ? 2 : 0,
                      py: sidebarExpanded ? 1 : 0,
                      justifyContent: "center",
                      backgroundColor: isActive(roleManagementNavItem.path)
                        ? theme.palette.mode === "dark"
                          ? "rgba(244, 67, 54, 0.16)"
                          : "rgba(211, 47, 47, 0.08)"
                        : "transparent",
                      color: isActive(roleManagementNavItem.path)
                        ? "error.main"
                        : "inherit",
                      "&:hover": {
                        backgroundColor:
                          theme.palette.mode === "dark"
                            ? "rgba(244, 67, 54, 0.08)"
                            : "rgba(211, 47, 47, 0.04)",
                      },
                      transition: "all 0.2s",
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        color: isActive(roleManagementNavItem.path)
                          ? "error.main"
                          : "inherit",
                        minWidth: sidebarExpanded ? 40 : 0,
                        justifyContent: "center",
                      }}
                    >
                      <ShieldIcon />
                    </ListItemIcon>
                    {sidebarExpanded && (
                      <ListItemText
                        primary={t(
                          roleManagementNavItem.labelKey,
                          "Role Management",
                        )}
                        primaryTypographyProps={{
                          fontWeight: isActive(roleManagementNavItem.path)
                            ? 600
                            : 500,
                          fontSize: "0.875rem",
                          noWrap: true,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      />
                    )}
                  </ListItemButton>
                </ListItem>
              )}
            </>
          )}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      {/* AppBar */}
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${desktopDrawerWidth}px)` },
          ml: { md: `${desktopDrawerWidth}px` },
          boxShadow: theme.palette.mode === "dark" ? 1 : 2,
          bgcolor: theme.palette.background.paper,
          color: theme.palette.text.primary,
          transition: theme.transitions.create(["width", "margin-left"], {
            duration: theme.transitions.duration.standard,
          }),
        }}
        elevation={0}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { md: "none" } }}
          >
            <MenuIcon />
          </IconButton>

          <Typography
            variant="h6"
            noWrap
            component="div"
            sx={{
              flexGrow: 1,
              fontWeight: 600,
              fontSize: { xs: "0.95rem", sm: "1.25rem" },
            }}
          >
            {location.pathname === "/admin"
              ? t("nav.admin", "Admin")
              : location.pathname === "/product-pricing"
                ? t("nav.productPricing", "Product Pricing")
                : navigationItems.find(
                  (item) => item.path === location.pathname,
                )
                  ? t(
                    navigationItems.find(
                      (item) => item.path === location.pathname,
                    )?.labelKey || "nav.dashboard",
                  )
                  : t("nav.dashboard")}
          </Typography>

          {/* Actions */}
          <Box
            sx={{
              display: "flex",
              gap: { xs: 0, sm: 1 },
              alignItems: "center",
            }}
          >
            {/* Language Switcher - hide on smallest screens */}
            <Tooltip title={t("layout.changeLanguage")}>
              <IconButton
                onClick={handleLanguageMenuOpen}
                color="inherit"
                sx={{ display: { xs: "none", sm: "inline-flex" } }}
              >
                <LanguageIcon />
              </IconButton>
            </Tooltip>

            <Menu
              anchorEl={languageAnchorEl}
              open={Boolean(languageAnchorEl)}
              onClose={handleLanguageMenuClose}
            >
              {(Object.keys(languages) as Language[]).map((lang) => (
                <MenuItem
                  key={lang}
                  onClick={() => handleLanguageChange(lang)}
                  selected={language === lang}
                >
                  {languages[lang]}
                </MenuItem>
              ))}
            </Menu>

            <Tooltip title={t("layout.toggleTheme")}>
              <IconButton onClick={toggleTheme} color="inherit">
                {themeMode === "dark" ? <Brightness7 /> : <Brightness4 />}
              </IconButton>
            </Tooltip>

            <Tooltip title={t("layout.notifications")}>
              <IconButton color="inherit" onClick={handleNotificationsClick}>
                <Badge badgeContent={unreadCount} color="error">
                  <Notifications />
                </Badge>
              </IconButton>
            </Tooltip>

            <Tooltip title={t("layout.settings")}>
              <IconButton
                color="inherit"
                sx={{ display: { xs: "none", sm: "inline-flex" } }}
              >
                <Settings />
              </IconButton>
            </Tooltip>

            <Tooltip title={user?.email || t("layout.profile")}>
              <IconButton color="inherit" onClick={handleUserMenuOpen}>
                <AccountCircle />
              </IconButton>
            </Tooltip>

            {/* User Menu */}
            <Menu
              anchorEl={userMenuAnchorEl}
              open={Boolean(userMenuAnchorEl)}
              onClose={handleUserMenuClose}
              anchorOrigin={{
                vertical: "bottom",
                horizontal: "right",
              }}
              transformOrigin={{
                vertical: "top",
                horizontal: "right",
              }}
            >
              <MenuItem disabled>
                <ListItemAvatar>
                  <Avatar sx={{ bgcolor: "primary.main" }}>
                    {user?.email?.charAt(0).toUpperCase() || "U"}
                  </Avatar>
                </ListItemAvatar>
                <Box>
                  <Typography variant="subtitle2">
                    {user?.email || "User"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t("layout.signedIn", "Signed In")}
                  </Typography>
                </Box>
              </MenuItem>
              <Divider />
              <MenuItem onClick={handleLogout}>
                <ListItemIcon>
                  <LogoutIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>{t("layout.logout", "Logout")}</ListItemText>
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Drawer */}
      <Box
        component="nav"
        sx={{ width: { md: desktopDrawerWidth }, flexShrink: { md: 0 } }}
        aria-label="navigation"
      >
        {/* Mobile drawer */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true, // Better open performance on mobile.
          }}
          sx={{
            display: { xs: "block", md: "none" },
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: EXPANDED_DRAWER_WIDTH,
            },
          }}
        >
          {drawer}
        </Drawer>

        {/* Desktop drawer */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: "none", md: "block" },
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: desktopDrawerWidth,
              borderRight: `1px solid ${theme.palette.divider}`,
              overflowX: "hidden",
              transition: theme.transitions.create("width", {
                duration: theme.transitions.duration.standard,
              }),
            },
          }}
          open
        >
          {drawer}
        </Drawer>

        {/* Fixed sidebar toggle - simple plain circle at bottom 10% */}
        <IconButton
          onClick={toggleSidebar}
          sx={{
            position: "fixed",
            left: desktopDrawerWidth - 14,
            bottom: "10%",
            zIndex: 1201,
            width: 28,
            height: 28,
            bgcolor: theme.palette.background.paper,
            border: `1px solid ${theme.palette.divider}`,
            boxShadow: theme.shadows[2],
            display: { xs: "none", md: "flex" },
            transition: theme.transitions.create(["left"], {
              duration: theme.transitions.duration.standard,
            }),
            "&:hover": {
              bgcolor: theme.palette.background.paper,
            },
          }}
        >
          {sidebarExpanded ? (
            <ChevronLeftIcon sx={{ fontSize: 18, color: "text.secondary" }} />
          ) : (
            <ChevronRightIcon sx={{ fontSize: 18, color: "text.secondary" }} />
          )}
        </IconButton>
      </Box>

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { md: `calc(100% - ${desktopDrawerWidth}px)` },
          minHeight: "100vh",
          bgcolor: theme.palette.background.default,
          transition: theme.transitions.create("width", {
            duration: theme.transitions.duration.standard,
          }),
        }}
      >
        <Toolbar /> {/* Spacer for AppBar */}
        <Box
          sx={{
            p: location.pathname === "/chat" ? 0
              : location.pathname === "/calling-list" ? { xs: 1, sm: 1.5, md: 2 }
                : { xs: 1.5, sm: 2.5, md: 3 },
            maxWidth: "100%",
            overflowX: "hidden",
            height: location.pathname === "/chat" ? "calc(100vh - 64px)" : "auto",
            display: "flex",
            flexDirection: "column"
          }}
        >
          {showBackButton && (
            <Box sx={{ mb: 2 }}>
              <Button
                variant="text"
                startIcon={<ArrowBackIcon />}
                onClick={() => navigate(-1)}
                sx={{
                  alignSelf: "flex-start",
                  textTransform: "none",
                  color: "text.secondary",
                  px: 0.5,
                  minWidth: 0,
                }}
              >
                Back
              </Button>
            </Box>
          )}
          {children}
        </Box>
      </Box>

      {/* Floating Activity Toast */}
      <Snackbar
        open={!!activityToast}
        autoHideDuration={4000}
        onClose={handleCloseToast}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        TransitionComponent={Slide}
      >
        <Paper
          elevation={6}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            p: 2,
            minWidth: 280,
            borderRadius: 3,
            borderLeft: `6px solid ${activityToast?.severity === "success"
                ? theme.palette.success.main
                : theme.palette.info.main
              }`,
            bgcolor: theme.palette.background.paper,
            color: theme.palette.text.primary,
          }}
        >
          <Avatar
            sx={{
              bgcolor:
                activityToast?.severity === "success"
                  ? `${theme.palette.success.main}1A`
                  : `${theme.palette.info.main}1A`,
              color:
                activityToast?.severity === "success"
                  ? theme.palette.success.main
                  : theme.palette.info.main,
              width: 40,
              height: 40,
            }}
          >
            <TimelineIcon />
          </Avatar>
          <Box>
            <Typography variant="subtitle2" fontWeight={600}>
              Live Activity
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {activityToast?.msg}
            </Typography>
          </Box>
        </Paper>
      </Snackbar>
    </Box>
  );
}
