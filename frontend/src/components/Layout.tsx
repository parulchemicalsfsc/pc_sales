import { useState, useEffect } from "react";
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
  Settings,
  AccountCircle,
  Language as LanguageIcon,
  Logout as LogoutIcon,
  AdminPanelSettings as AdminIcon,
  AttachMoney as MoneyIcon,
  Shield as ShieldIcon,
  ManageAccounts as ManageAccountsIcon,
} from "@mui/icons-material";

import { useTranslation } from "../hooks/useTranslation";
import { useLanguageStore } from "../store/languageStore";
import type { Language } from "../i18n/i18n";
import { languages } from "../i18n/i18n";
import { useAuth } from "../contexts/AuthContext";
import { notificationsAPI } from "../services/api";
import { PERMISSIONS } from "../config/permissions";

const drawerWidth = 260;

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
    id: "distributors",
    labelKey: "nav.distributors",
    icon: <GroupIcon />,
    path: "/distributors",
    permission: PERMISSIONS.VIEW_DISTRIBUTORS,
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
    id: "import",
    labelKey: "nav.import",
    icon: <CloudUploadIcon />,
    path: "/import",
    permission: PERMISSIONS.IMPORT_DATA,
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
  const [languageAnchorEl, setLanguageAnchorEl] = useState<null | HTMLElement>(
    null,
  );
  const [userMenuAnchorEl, setUserMenuAnchorEl] = useState<null | HTMLElement>(
    null,
  );
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguageStore();

  const { user, signOut, hasPermission } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
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
      if (data && typeof data.count === 'number') {
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
    return () => clearInterval(interval);
  }, [user?.email]);

  // Refresh unread count when navigating away from notifications page
  useEffect(() => {
    if (location.pathname !== "/notifications") {
      fetchUnreadCount();
    }
  }, [location.pathname]);

  const handleNotificationsClick = () => {
    navigate("/notifications");
  };

  const drawer = (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Logo Section */}
      <Box
        sx={{
          p: 3,
          display: "flex",
          alignItems: "center",
          gap: 2,
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          color: "white",
        }}
      >
        <Avatar
          src="/logo.jpg"
          alt="Sales Management Logo"
          sx={{
            width: 50,
            height: 50,
            bgcolor: "rgba(255, 255, 255, 0.2)",
          }}
        />
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            {t("common.salesManagementSystem").split(" ")[0]}
          </Typography>
          <Typography
            variant="body2"
            sx={{ opacity: 0.9, fontSize: "0.85rem" }}
          >
            {t("common.salesManagementSystem").split(" ").slice(1).join(" ")}
          </Typography>
        </Box>
      </Box>

      <Divider />

      {/* Navigation Items */}
      <List sx={{ flex: 1, py: 2, px: 1 }}>
        {navigationItems.filter(item => {
          if (item.permission) {
            return hasPermission(item.permission);
          }
          return true;
        }).map((item) => {
          const active = isActive(item.path);
          return (
            <ListItem key={item.id} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                onClick={() => handleNavigation(item.path)}
                sx={{
                  borderRadius: 2,
                  mx: 1,
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
                    minWidth: 40,
                  }}
                >
                  {item.badge ? (
                    <Badge badgeContent={item.badge} color="error">
                      {item.icon}
                    </Badge>
                  ) : (
                    item.icon
                  )}
                </ListItemIcon>
                <ListItemText
                  primary={t(item.labelKey)}
                  primaryTypographyProps={{
                    fontWeight: active ? 600 : 500,
                    fontSize: "0.95rem",
                  }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}

        {/* Admin Navigation - Only for users with admin permissions */}
        {(hasPermission(PERMISSIONS.VIEW_ACTIVITY_LOGS) || hasPermission(PERMISSIONS.VIEW_USERS) || hasPermission(PERMISSIONS.MANAGE_PRICING) || hasPermission(PERMISSIONS.MANAGE_ROLES)) && (
          <>
            <Divider sx={{ my: 1 }} />
            {hasPermission(PERMISSIONS.VIEW_ACTIVITY_LOGS) && (
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  onClick={() => handleNavigation("/admin")}
                  sx={{
                    borderRadius: 2,
                    mx: 1,
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
                  <ListItemIcon sx={{ color: isActive("/admin") ? "error.main" : "inherit", minWidth: 40 }}>
                    <AdminIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary={t("nav.activityLogs", "Activity Logs")}
                    primaryTypographyProps={{ fontWeight: isActive("/admin") ? 600 : 500, fontSize: "0.95rem" }}
                  />
                </ListItemButton>
              </ListItem>
            )}
            {hasPermission(PERMISSIONS.VIEW_USERS) && (
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  onClick={() => handleNavigation("/user-management")}
                  sx={{
                    borderRadius: 2,
                    mx: 1,
                    backgroundColor: isActive("/user-management")
                      ? theme.palette.mode === "dark"
                        ? "rgba(244, 67, 54, 0.16)"
                        : "rgba(211, 47, 47, 0.08)"
                      : "transparent",
                    color: isActive("/user-management") ? "error.main" : "inherit",
                    "&:hover": {
                      backgroundColor:
                        theme.palette.mode === "dark"
                          ? "rgba(244, 67, 54, 0.08)"
                          : "rgba(211, 47, 47, 0.04)",
                    },
                    transition: "all 0.2s",
                  }}
                >
                  <ListItemIcon sx={{ color: isActive("/user-management") ? "error.main" : "inherit", minWidth: 40 }}>
                    <ManageAccountsIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary={t("nav.userManagement", "User Management")}
                    primaryTypographyProps={{ fontWeight: isActive("/user-management") ? 600 : 500, fontSize: "0.95rem" }}
                  />
                </ListItemButton>
              </ListItem>
            )}
            {hasPermission(PERMISSIONS.MANAGE_PRICING) && (
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  onClick={() => handleNavigation("/product-pricing")}
                  sx={{
                    borderRadius: 2,
                    mx: 1,
                    backgroundColor: isActive("/product-pricing")
                      ? theme.palette.mode === "dark"
                        ? "rgba(244, 67, 54, 0.16)"
                        : "rgba(211, 47, 47, 0.08)"
                      : "transparent",
                    color: isActive("/product-pricing") ? "error.main" : "inherit",
                    "&:hover": {
                      backgroundColor:
                        theme.palette.mode === "dark"
                          ? "rgba(244, 67, 54, 0.08)"
                          : "rgba(211, 47, 47, 0.04)",
                    },
                    transition: "all 0.2s",
                  }}
                >
                  <ListItemIcon sx={{ color: isActive("/product-pricing") ? "error.main" : "inherit", minWidth: 40 }}>
                    <MoneyIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary={t("nav.productPricing", "Product Pricing")}
                    primaryTypographyProps={{ fontWeight: isActive("/product-pricing") ? 600 : 500, fontSize: "0.95rem" }}
                  />
                </ListItemButton>
              </ListItem>
            )}
            {hasPermission(PERMISSIONS.MANAGE_ROLES) && (
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  onClick={() => handleNavigation(roleManagementNavItem.path)}
                  sx={{
                    borderRadius: 2,
                    mx: 1,
                    backgroundColor: isActive(roleManagementNavItem.path)
                      ? theme.palette.mode === "dark"
                        ? "rgba(244, 67, 54, 0.16)"
                        : "rgba(211, 47, 47, 0.08)"
                      : "transparent",
                    color: isActive(roleManagementNavItem.path) ? "error.main" : "inherit",
                    "&:hover": {
                      backgroundColor:
                        theme.palette.mode === "dark"
                          ? "rgba(244, 67, 54, 0.08)"
                          : "rgba(211, 47, 47, 0.04)",
                    },
                    transition: "all 0.2s",
                  }}
                >
                  <ListItemIcon sx={{ color: isActive(roleManagementNavItem.path) ? "error.main" : "inherit", minWidth: 40 }}>
                    <ShieldIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary={t(roleManagementNavItem.labelKey, "Role Management")}
                    primaryTypographyProps={{ fontWeight: isActive(roleManagementNavItem.path) ? 600 : 500, fontSize: "0.95rem" }}
                  />
                </ListItemButton>
              </ListItem>
            )}
          </>
        )}
      </List>

      <Divider />

      {/* Footer */}
      <Box sx={{ p: 2, textAlign: "center" }}>
        <Typography variant="caption" color="text.secondary">
          {t("common.version")} 1.0.0
        </Typography>
        <Typography variant="caption" display="block" color="text.secondary">
          {t("common.copyright")}
        </Typography>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      {/* AppBar */}
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
          boxShadow: theme.palette.mode === "dark" ? 1 : 2,
          bgcolor: theme.palette.background.paper,
          color: theme.palette.text.primary,
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
            sx={{ flexGrow: 1, fontWeight: 600 }}
          >
            {location.pathname === "/admin"
              ? t("nav.admin", "Admin")
              : location.pathname === "/product-pricing"
                ? t("nav.productPricing", "Product Pricing")
                : navigationItems.find((item) => item.path === location.pathname)
                  ? t(
                    navigationItems.find(
                      (item) => item.path === location.pathname,
                    )?.labelKey || "nav.dashboard",
                  )
                  : t("nav.dashboard")}
          </Typography>

          {/* Actions */}
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            {/* Language Switcher */}
            <Tooltip title={t("layout.changeLanguage")}>
              <IconButton onClick={handleLanguageMenuOpen} color="inherit">
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
              <IconButton color="inherit">
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
        sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}
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
              width: drawerWidth,
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
              width: drawerWidth,
              borderRight: `1px solid ${theme.palette.divider}`,
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { md: `calc(100% - ${drawerWidth}px)` },
          minHeight: "100vh",
          bgcolor: theme.palette.background.default,
        }}
      >
        <Toolbar /> {/* Spacer for AppBar */}
        <Box sx={{ p: { xs: 2, sm: 3, md: 4 } }}>{children}</Box>
      </Box>
    </Box>
  );
}
