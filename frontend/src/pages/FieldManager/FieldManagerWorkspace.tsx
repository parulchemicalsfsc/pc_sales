/**
 * FieldManagerWorkspace.tsx
 * ──────────────────────────────────────────────────────────────────────────
 * Main Workspace for MOD-16: Field Officer Management & Verification Console.
 *
 * Layout:
 * - Persistent top bar:
 *   - Field Officer Selector (1 : N Dropdown / "All My Officers")
 *   - Date & Month Pickers
 *   - Live Notification Bell for FO plan/order edits (with badge and popover)
 * - MUI v5 <Tabs> across 6 operational sub-views:
 *   1. Team Overview & Targets
 *   2. Route Audit & Live GPS Map
 *   3. Visit Verification & 2nd-Pitch
 *   4. Discount Analytics Ledger
 *   5. Forensic Edit Audit Log
 *   6. Stock & Sample Approvals
 */

import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Card,
  CardContent,
  Grid,
  TextField,
  MenuItem,
  IconButton,
  Badge,
  Menu,
  MenuItem as MuiMenuItem,
  ListItemText,
  Divider,
  Button,
  Chip,
  Paper,
} from "@mui/material";
import {
  Notifications as BellIcon,
  People as TeamIcon,
  Map as RouteIcon,
  VerifiedUser as VerifyIcon,
  Discount as DiscountIcon,
  History as AuditIcon,
  Inventory as StockIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import { format } from "date-fns";

import TeamTargetsTab from "./TeamTargetsTab";
import RouteAuditTab from "./RouteAuditTab";
import VisitVerificationTab from "./VisitVerificationTab";
import DiscountAnalyticsTab from "./DiscountAnalyticsTab";
import EditAuditLogTab from "./EditAuditLogTab";
import StockApprovalTab from "./StockApprovalTab";

import { auraManagerAPI } from "../../services/auraApi";
import type { FieldOfficer, AuraNotification } from "../../types/aura";

export default function FieldManagerWorkspace() {
  const [tabIndex, setTabIndex] = useState<number>(0);
  const [selectedFoId, setSelectedFoId] = useState<string | "all">("all");
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), "yyyy-MM"));
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));

  const [officers, setOfficers] = useState<FieldOfficer[]>([]);
  const [notifications, setNotifications] = useState<AuraNotification[]>([]);
  const [notifAnchor, setNotifAnchor] = useState<null | HTMLElement>(null);

  // Fetch officers for selector dropdown
  const loadOfficers = async () => {
    try {
      const res = await auraManagerAPI.getOfficers({ month: selectedMonth });
      const data: FieldOfficer[] = res.data?.officers ?? res.data ?? [];
      setOfficers(data);
    } catch (e) {
      console.warn("Could not load officers for dropdown", e);
    }
  };

  // Fetch notifications
  const loadNotifications = async () => {
    try {
      const res = await auraManagerAPI.getNotifications({ unread_only: true });
      const data: AuraNotification[] = res.data?.notifications ?? res.data ?? [];
      setNotifications(data);
    } catch (e) {
      console.warn("Could not load notifications", e);
    }
  };

  useEffect(() => {
    loadOfficers();
    loadNotifications();
  }, [selectedMonth]);

  const handleMarkRead = async (id: string) => {
    try {
      await auraManagerAPI.markNotificationRead(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (e) {
      console.warn("Failed to mark notification read", e);
    }
  };

  const handleNavigateToRoute = (foId: string) => {
    setSelectedFoId(foId);
    setTabIndex(1); // Jump to Route Audit Tab
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 3,
          borderRadius: 2,
          border: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <Grid container spacing={2} alignItems="center">
          {/* Title & Subtitle */}
          <Grid item xs={12} md={4}>
            <Box display="flex" alignItems="center" gap={1}>
              <Typography variant="h5" fontWeight={700}>
                Field Officer Console
              </Typography>
              <Chip label="MOD-16" size="small" color="primary" variant="outlined" />
            </Box>
            <Typography variant="caption" color="text.secondary">
              AURA Management, Route Audit &amp; Verification Terminal
            </Typography>
          </Grid>

          {/* Controls: FO Selector, Month, Date, Notifications */}
          <Grid item xs={12} md={8}>
            <Box display="flex" gap={1.5} justifyContent={{ xs: "flex-start", md: "flex-end" }} flexWrap="wrap" alignItems="center">
              {/* Field Officer 1:N Selector */}
              <TextField
                select
                size="small"
                label="Select Officer"
                value={selectedFoId}
                onChange={(e) => setSelectedFoId(e.target.value)}
                sx={{ minWidth: 200 }}
              >
                <MenuItem value="all">
                  <em>All My Officers ({officers.length})</em>
                </MenuItem>
                {officers.map((fo) => (
                  <MenuItem key={fo.fo_user_id} value={fo.fo_user_id}>
                    {fo.name} ({fo.today_status.replace("_", " ")})
                  </MenuItem>
                ))}
              </TextField>

              {/* Month Picker */}
              <TextField
                type="month"
                size="small"
                label="Month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 145 }}
              />

              {/* Date Picker */}
              <TextField
                type="date"
                size="small"
                label="Date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 155 }}
              />

              {/* Refresh Button */}
              <IconButton onClick={() => { loadOfficers(); loadNotifications(); }} title="Refresh Data">
                <RefreshIcon />
              </IconButton>

              {/* Notification Bell */}
              <IconButton
                onClick={(e) => setNotifAnchor(e.currentTarget)}
                color={notifications.length > 0 ? "primary" : "default"}
              >
                <Badge badgeContent={notifications.length} color="error">
                  <BellIcon />
                </Badge>
              </IconButton>

              {/* Notification Popover Menu */}
              <Menu
                anchorEl={notifAnchor}
                open={Boolean(notifAnchor)}
                onClose={() => setNotifAnchor(null)}
                PaperProps={{ sx: { width: 340, maxHeight: 420 } }}
              >
                <Box p={1.5} borderBottom="1px solid" borderColor="divider">
                  <Typography variant="subtitle2" fontWeight={700}>
                    Field Officer Live Edits &amp; Alerts
                  </Typography>
                </Box>
                {notifications.length === 0 ? (
                  <Box p={2} textAlign="center">
                    <Typography variant="body2" color="text.secondary">
                      No unread alerts
                    </Typography>
                  </Box>
                ) : (
                  notifications.map((n) => (
                    <MuiMenuItem
                      key={n.id}
                      onClick={() => handleMarkRead(n.id)}
                      sx={{ alignItems: "flex-start", py: 1 }}
                    >
                      <ListItemText
                        primary={
                          <Typography variant="body2" fontWeight={600}>
                            {n.title}
                          </Typography>
                        }
                        secondary={
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              {n.body}
                            </Typography>
                            <Typography variant="caption" color="text.disabled" display="block">
                              {new Date(n.created_at).toLocaleTimeString()}
                            </Typography>
                          </Box>
                        }
                      />
                    </MuiMenuItem>
                  ))
                )}
              </Menu>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* ── Operational Tabs ────────────────────────────────────────────── */}
      <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}>
        <Tabs
          value={tabIndex}
          onChange={(_, idx) => setTabIndex(idx)}
          variant="scrollable"
          scrollButtons="auto"
          textColor="primary"
          indicatorColor="primary"
        >
          <Tab icon={<TeamIcon />} iconPosition="start" label="Team &amp; Targets" />
          <Tab icon={<RouteIcon />} iconPosition="start" label="Route Audit &amp; GPS" />
          <Tab icon={<VerifyIcon />} iconPosition="start" label="Visit Verification" />
          <Tab icon={<DiscountIcon />} iconPosition="start" label="Discount Ledger" />
          <Tab icon={<AuditIcon />} iconPosition="start" label="Edit Audit Log" />
          <Tab icon={<StockIcon />} iconPosition="start" label="Stock Approvals" />
        </Tabs>
      </Box>

      {/* ── Tab Views ───────────────────────────────────────────────────── */}
      {tabIndex === 0 && (
        <TeamTargetsTab
          selectedFoId={selectedFoId}
          selectedMonth={selectedMonth}
          onViewRoute={handleNavigateToRoute}
        />
      )}

      {tabIndex === 1 && (
        <RouteAuditTab
          selectedFoId={selectedFoId}
          selectedDate={selectedDate}
        />
      )}

      {tabIndex === 2 && (
        <VisitVerificationTab
          selectedFoId={selectedFoId}
          selectedDate={selectedDate}
        />
      )}

      {tabIndex === 3 && (
        <DiscountAnalyticsTab
          selectedFoId={selectedFoId}
          selectedMonth={selectedMonth}
        />
      )}

      {tabIndex === 4 && (
        <EditAuditLogTab
          selectedFoId={selectedFoId}
        />
      )}

      {tabIndex === 5 && (
        <StockApprovalTab
          selectedFoId={selectedFoId}
        />
      )}
    </Box>
  );
}

