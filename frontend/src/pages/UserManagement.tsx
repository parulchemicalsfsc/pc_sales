import { useState, useEffect } from "react";
import {
    Box,
    Card,
    CardContent,
    Typography,
    Alert,
    Chip,
    TextField,
    Grid,
    IconButton,
    Tooltip,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    InputAdornment,
    Avatar,
    Button,
    Select,
    FormControl,
    InputLabel,
    MenuItem,
    CircularProgress,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Tabs,
    Tab,
    Snackbar,
    Divider,
    Paper,
} from "@mui/material";
import {
    Refresh as RefreshIcon,
    Search as SearchIcon,
    PersonAdd as PersonAddIcon,
    People as PeopleIcon,
    Edit as EditIcon,
    Block as BlockIcon,
    CheckCircle as CheckCircleIcon,
    Key as KeyIcon,
    PersonOff as PersonOffIcon,
    ManageAccounts as ManageAccountsIcon,
} from "@mui/icons-material";
import { TableSkeleton } from "../components/Skeletons";
import { useAuth } from "../contexts/AuthContext";
import { PERMISSIONS } from "../config/permissions";
import PermissionGate from "../components/PermissionGate";
import { useTranslation } from "../hooks/useTranslation";
import { adminAPI, rbacAPI } from "../services/api";

// ─── Types ────────────────────────────────────────────────────────────────────
interface AppUser {
    id?: number;
    email: string;
    name?: string;
    role: string;
    is_active: boolean;
    created_at?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getRoleColor = (
    roleKey: string
): "error" | "info" | "warning" | "success" | "secondary" | "default" => {
    switch (roleKey) {
        case "admin": return "error";
        case "developer": return "secondary";
        case "sales_manager": return "success";
        case "business_analyst": return "info";
        case "marketing_manager": return "warning";
        default: return "default";
    }
};

const getAvatarBg = (roleKey: string): string => {
    switch (roleKey) {
        case "admin": return "#d32f2f";
        case "developer": return "#7b1fa2";
        case "sales_manager": return "#388e3c";
        case "business_analyst": return "#0288d1";
        case "marketing_manager": return "#f57c00";
        default: return "#546e7a";
    }
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function UserManagement() {
    const { user } = useAuth();
    const { t } = useTranslation();

    // — Data —
    const [users, setUsers] = useState<AppUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [roles, setRoles] = useState<{ role_key: string; display_name: string }[]>([]);

    // — Search & Tab —
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState<"active" | "inactive">("active");

    // — Feedback —
    const [pageError, setPageError] = useState<string | null>(null);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
        open: false, message: "", severity: "success",
    });

    // — Create User —
    const [newUserName, setNewUserName] = useState("");
    const [newUserEmail, setNewUserEmail] = useState("");
    const [newUserPassword, setNewUserPassword] = useState("");
    const [newUserRole, setNewUserRole] = useState("");
    const [creatingUser, setCreatingUser] = useState(false);
    const [creationSuccess, setCreationSuccess] = useState<string | null>(null);

    // — Edit Dialog —
    const [editUser, setEditUser] = useState<AppUser | null>(null);
    const [editName, setEditName] = useState("");
    const [editRole, setEditRole] = useState("");
    const [editPassword, setEditPassword] = useState("");
    const [savingName, setSavingName] = useState(false);
    const [savingRole, setSavingRole] = useState(false);
    const [savingPassword, setSavingPassword] = useState(false);

    // — Deactivate Confirm —
    const [confirmDeactivate, setConfirmDeactivate] = useState<AppUser | null>(null);
    const [deactivating, setDeactivating] = useState(false);

    // — Activate loading per user —
    const [activatingEmail, setActivatingEmail] = useState<string | null>(null);

    // ── Derived lists ─────────────────────────────────────────────────────────
    const activeUsers = users.filter((u) => u.is_active);
    const inactiveUsers = users.filter((u) => !u.is_active);
    const currentList = activeTab === "active" ? activeUsers : inactiveUsers;
    const filteredUsers = currentList.filter((u) => {
        if (!searchTerm) return true;
        const s = searchTerm.toLowerCase();
        return (
            u.email?.toLowerCase().includes(s) ||
            (u.name || "").toLowerCase().includes(s) ||
            u.role?.toLowerCase().includes(s)
        );
    });

    // ── Helpers ───────────────────────────────────────────────────────────────
    const showSnackbar = (message: string, severity: "success" | "error") =>
        setSnackbar({ open: true, message, severity });

    const getRoleDisplayName = (roleKey: string) => {
        const role = roles.find((r) => r.role_key === roleKey);
        return role?.display_name || roleKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    };

    // ── Data Fetching ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (!user?.email) return;
        rbacAPI.getRoles().then((data) => setRoles(data || [])).catch(console.error);
    }, [user?.email]);

    const loadUsers = async () => {
        if (!user) return;
        try {
            setLoading(true);
            setPageError(null);
            const data = await adminAPI.getAppUsers("all");
            setUsers(data?.users || []);
        } catch (err: any) {
            setPageError(err.response?.data?.detail || "Failed to load users");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { if (user) loadUsers(); }, [user]);

    // ── Create User ───────────────────────────────────────────────────────────
    const handleCreateUser = async () => {
        if (!newUserName || !newUserEmail || !newUserPassword || !newUserRole) {
            setPageError("Please fill in all fields");
            return;
        }
        try {
            setCreatingUser(true);
            setPageError(null);
            setCreationSuccess(null);
            await adminAPI.createUser({
                name: newUserName,
                email: newUserEmail,
                password: newUserPassword,
                role: newUserRole,
            });
            setCreationSuccess(`User ${newUserEmail} created successfully`);
            setNewUserName(""); setNewUserEmail(""); setNewUserPassword(""); setNewUserRole("");
            loadUsers();
        } catch (err: any) {
            setPageError(err.response?.data?.detail || "Failed to create user");
        } finally {
            setCreatingUser(false);
        }
    };

    // ── Edit Dialog ───────────────────────────────────────────────────────────
    const openEditDialog = (u: AppUser) => {
        setEditUser(u);
        setEditName(u.name || "");
        setEditRole(u.role || "");
        setEditPassword("");
    };

    const handleSaveName = async () => {
        if (!editUser) return;
        try {
            setSavingName(true);
            await adminAPI.updateUserProfile(editUser.email, editName.trim());
            showSnackbar("Name updated successfully", "success");
            setEditUser({ ...editUser, name: editName.trim() });
            loadUsers();
        } catch (err: any) {
            showSnackbar(err.response?.data?.detail || "Failed to update name", "error");
        } finally { setSavingName(false); }
    };

    const handleSaveRole = async () => {
        if (!editUser) return;
        try {
            setSavingRole(true);
            await adminAPI.updateUserRole(editUser.email, editRole);
            showSnackbar("Role updated successfully", "success");
            setEditUser({ ...editUser, role: editRole });
            loadUsers();
        } catch (err: any) {
            showSnackbar(err.response?.data?.detail || "Failed to update role", "error");
        } finally { setSavingRole(false); }
    };

    const handleResetPassword = async () => {
        if (!editUser || !editPassword) return;
        try {
            setSavingPassword(true);
            await adminAPI.resetUserPassword(editUser.email, editPassword);
            showSnackbar("Password reset successfully", "success");
            setEditPassword("");
        } catch (err: any) {
            showSnackbar(err.response?.data?.detail || "Failed to reset password", "error");
        } finally { setSavingPassword(false); }
    };

    // ── Activate / Deactivate ─────────────────────────────────────────────────
    const handleActivate = async (u: AppUser) => {
        try {
            setActivatingEmail(u.email);
            await adminAPI.setUserStatus(u.email, true);
            showSnackbar(`${u.name || u.email} has been activated`, "success");
            loadUsers();
        } catch (err: any) {
            showSnackbar(err.response?.data?.detail || "Failed to activate user", "error");
        } finally { setActivatingEmail(null); }
    };

    const handleDeactivateConfirm = async () => {
        if (!confirmDeactivate) return;
        try {
            setDeactivating(true);
            await adminAPI.setUserStatus(confirmDeactivate.email, false);
            showSnackbar(`${confirmDeactivate.name || confirmDeactivate.email} has been deactivated`, "success");
            setConfirmDeactivate(null);
            loadUsers();
        } catch (err: any) {
            showSnackbar(err.response?.data?.detail || "Failed to deactivate user", "error");
        } finally { setDeactivating(false); }
    };

    // ── JSX ───────────────────────────────────────────────────────────────────
    return (
        <Box>
            {/* ── Header ── */}
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, display: "flex", alignItems: "center", gap: 1 }}>
                    <PeopleIcon color="primary" />
                    {t("userMgmt.title", "User Management")}
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    {t("userMgmt.subtitle", "Manage user accounts, roles, and access. Active users can log in; inactive users cannot.")}
                </Typography>
            </Box>

            {pageError && (
                <Alert severity="error" sx={{ mb: 3 }} onClose={() => setPageError(null)}>
                    {pageError}
                </Alert>
            )}

            {/* ── Create User Card ── */}
            <PermissionGate permission={PERMISSIONS.CREATE_USER}>
                <Card sx={{ mb: 4 }}>
                    <CardContent>
                        <Typography variant="h6" fontWeight="bold" sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                            <PersonAddIcon color="primary" />
                            {t("userMgmt.createNewUser", "Create New User")}
                        </Typography>
                        <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                            {t("userMgmt.createUserDesc", "New users can log in immediately. The admin role cannot be assigned here.")}
                        </Typography>

                        {creationSuccess && (
                            <Alert severity="success" sx={{ mb: 2 }} onClose={() => setCreationSuccess(null)}>
                                {creationSuccess}
                            </Alert>
                        )}

                        <Grid container spacing={2} alignItems="center">
                            <Grid item xs={12} md={3}>
                                <TextField
                                    fullWidth size="small"
                                    label={t("userMgmt.name", "Full Name")}
                                    value={newUserName}
                                    onChange={(e) => setNewUserName(e.target.value)}
                                />
                            </Grid>
                            <Grid item xs={12} md={3}>
                                <TextField
                                    fullWidth size="small"
                                    label={t("userMgmt.emailAddress", "Email Address")}
                                    type="email"
                                    value={newUserEmail}
                                    onChange={(e) => setNewUserEmail(e.target.value)}
                                />
                            </Grid>
                            <Grid item xs={12} md={2}>
                                <TextField
                                    fullWidth size="small"
                                    label={t("userMgmt.password", "Password")}
                                    type="password"
                                    value={newUserPassword}
                                    onChange={(e) => setNewUserPassword(e.target.value)}
                                />
                            </Grid>
                            <Grid item xs={12} md={2}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>{t("userMgmt.role", "Role")}</InputLabel>
                                    <Select
                                        value={newUserRole}
                                        label={t("userMgmt.role", "Role")}
                                        onChange={(e) => setNewUserRole(e.target.value)}
                                    >
                                        {roles
                                            .filter((r) => r.role_key !== "admin")
                                            .map((role) => (
                                                <MenuItem key={role.role_key} value={role.role_key}>
                                                    {role.display_name}
                                                </MenuItem>
                                            ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} md={2}>
                                <Button
                                    fullWidth variant="contained"
                                    onClick={handleCreateUser}
                                    disabled={creatingUser}
                                    startIcon={creatingUser ? undefined : <PersonAddIcon />}
                                >
                                    {creatingUser
                                        ? <CircularProgress size={22} color="inherit" />
                                        : t("userMgmt.createUser", "Create User")}
                                </Button>
                            </Grid>
                        </Grid>
                    </CardContent>
                </Card>
            </PermissionGate>

            {/* ── Users Table Card ── */}
            <Card>
                <CardContent sx={{ pb: 0 }}>
                    {/* Tab bar + search + refresh */}
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
                        <Tabs
                            value={activeTab}
                            onChange={(_, v) => { setActiveTab(v); setSearchTerm(""); }}
                            sx={{ minHeight: 40 }}
                        >
                            <Tab
                                value="active"
                                label={
                                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                                        <CheckCircleIcon sx={{ fontSize: 16, color: "success.main" }} />
                                        {t("userMgmt.activeUsers", "Active Users")}
                                        <Chip label={activeUsers.length} size="small" color="success" sx={{ height: 18, fontSize: "0.7rem" }} />
                                    </Box>
                                }
                                sx={{ textTransform: "none", fontWeight: 600 }}
                            />
                            <Tab
                                value="inactive"
                                label={
                                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                                        <PersonOffIcon sx={{ fontSize: 16, color: "text.disabled" }} />
                                        {t("userMgmt.inactiveUsers", "Inactive Users")}
                                        <Chip label={inactiveUsers.length} size="small" sx={{ height: 18, fontSize: "0.7rem" }} />
                                    </Box>
                                }
                                sx={{ textTransform: "none", fontWeight: 600 }}
                            />
                        </Tabs>

                        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                            <TextField
                                size="small"
                                placeholder={t("userMgmt.searchUsers", "Search users...")}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <SearchIcon sx={{ fontSize: 18 }} />
                                        </InputAdornment>
                                    ),
                                }}
                                sx={{ minWidth: 220 }}
                            />
                            <Tooltip title="Refresh">
                                <IconButton onClick={loadUsers} color="primary" disabled={loading}>
                                    <RefreshIcon />
                                </IconButton>
                            </Tooltip>
                        </Box>
                    </Box>
                </CardContent>

                <TableContainer>
                    {loading ? (
                        <Box sx={{ p: 2 }}>
                            <TableSkeleton rows={6} columns={activeTab === "active" ? 5 : 4} />
                        </Box>
                    ) : (
                        <Table>
                            <TableHead>
                                <TableRow sx={{ "& th": { fontWeight: 700, bgcolor: "action.hover" } }}>
                                    <TableCell>{t("admin.user", "User")}</TableCell>
                                    <TableCell>{t("userMgmt.email", "Email")}</TableCell>
                                    <TableCell>{t("userMgmt.role", "Role")}</TableCell>
                                    <TableCell>{t("userMgmt.status", "Status")}</TableCell>
                                    <TableCell align="right">{t("userMgmt.actions", "Actions")}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {filteredUsers.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                                            <Typography color="text.secondary">
                                                {searchTerm
                                                    ? t("userMgmt.noResults", "No users match your search")
                                                    : activeTab === "active"
                                                        ? t("userMgmt.noActiveUsers", "No active users")
                                                        : t("userMgmt.noInactiveUsers", "No inactive users")}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredUsers.map((u) => (
                                        <TableRow
                                            key={u.email}
                                            hover
                                            sx={{ opacity: u.is_active ? 1 : 0.65 }}
                                        >
                                            {/* User column */}
                                            <TableCell>
                                                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                                                    <Avatar
                                                        sx={{
                                                            width: 34, height: 34,
                                                            bgcolor: getAvatarBg(u.role),
                                                            fontSize: "0.85rem", fontWeight: 700,
                                                        }}
                                                    >
                                                        {(u.name || u.email).charAt(0).toUpperCase()}
                                                    </Avatar>
                                                    <Typography variant="body2" fontWeight={600}>
                                                        {u.name || u.email}
                                                    </Typography>
                                                </Box>
                                            </TableCell>

                                            {/* Email column */}
                                            <TableCell>
                                                <Typography variant="body2" color="text.secondary">
                                                    {u.email}
                                                </Typography>
                                            </TableCell>

                                            {/* Role column */}
                                            <TableCell>
                                                <Chip
                                                    label={getRoleDisplayName(u.role)}
                                                    size="small"
                                                    color={getRoleColor(u.role)}
                                                    variant="outlined"
                                                    sx={{ fontWeight: 500 }}
                                                />
                                            </TableCell>

                                            {/* Status column */}
                                            <TableCell>
                                                <Chip
                                                    label={u.is_active
                                                        ? t("userMgmt.active", "Active")
                                                        : t("userMgmt.inactive", "Inactive")}
                                                    size="small"
                                                    color={u.is_active ? "success" : "default"}
                                                    variant={u.is_active ? "filled" : "outlined"}
                                                    icon={u.is_active ? <CheckCircleIcon /> : <BlockIcon />}
                                                    sx={{ fontWeight: 500 }}
                                                />
                                            </TableCell>

                                            {/* Actions column */}
                                            <TableCell align="right">
                                                {u.is_active ? (
                                                    /* ── Active user actions ── */
                                                    <PermissionGate permission={PERMISSIONS.MANAGE_USERS}>
                                                        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 0.5 }}>
                                                            <Tooltip title={t("userMgmt.edit", "Edit User")}>
                                                                <IconButton
                                                                    size="small"
                                                                    color="primary"
                                                                    onClick={() => openEditDialog(u)}
                                                                >
                                                                    <EditIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                            <Tooltip title={t("userMgmt.deactivate", "Deactivate User")}>
                                                                <IconButton
                                                                    size="small"
                                                                    color="error"
                                                                    onClick={() => setConfirmDeactivate(u)}
                                                                >
                                                                    <BlockIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                        </Box>
                                                    </PermissionGate>
                                                ) : (
                                                    /* ── Inactive user actions ── */
                                                    <PermissionGate permission={PERMISSIONS.MANAGE_USERS}>
                                                        <Tooltip title={t("userMgmt.activate", "Activate User")}>
                                                            <span>
                                                                <IconButton
                                                                    size="small"
                                                                    color="success"
                                                                    onClick={() => handleActivate(u)}
                                                                    disabled={activatingEmail === u.email}
                                                                >
                                                                    {activatingEmail === u.email
                                                                        ? <CircularProgress size={16} color="inherit" />
                                                                        : <CheckCircleIcon fontSize="small" />}
                                                                </IconButton>
                                                            </span>
                                                        </Tooltip>
                                                    </PermissionGate>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    )}
                </TableContainer>
            </Card>

            {/* ═══════════════════════════════════════════════════ */}
            {/* Edit User Dialog                                     */}
            {/* ═══════════════════════════════════════════════════ */}
            <Dialog
                open={!!editUser}
                onClose={() => setEditUser(null)}
                maxWidth="sm"
                fullWidth
                PaperProps={{ sx: { borderRadius: 3 } }}
            >
                <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pb: 1 }}>
                    <ManageAccountsIcon color="primary" />
                    <Box>
                        <Typography variant="h6" fontWeight="bold">
                            {t("userMgmt.editUser", "Edit User")}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {editUser?.email}
                        </Typography>
                    </Box>
                </DialogTitle>

                <DialogContent dividers sx={{ display: "flex", flexDirection: "column", gap: 3, pt: 2.5 }}>
                    {/* — Edit Name — */}
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            {t("userMgmt.displayName", "Display Name")}
                        </Typography>
                        <Box sx={{ display: "flex", gap: 1.5 }}>
                            <TextField
                                fullWidth size="small"
                                label={t("userMgmt.name", "Full Name")}
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                            />
                            <Button
                                variant="contained"
                                onClick={handleSaveName}
                                disabled={savingName || !editName.trim()}
                                sx={{ minWidth: 90, whiteSpace: "nowrap" }}
                            >
                                {savingName ? <CircularProgress size={20} color="inherit" /> : t("common.save", "Save")}
                            </Button>
                        </Box>
                    </Box>

                    <Divider />

                    {/* — Edit Role — */}
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            {t("userMgmt.changeRole", "Change Role")}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                            {t("userMgmt.changeRoleNote", "Admin and Developer roles cannot be assigned here.")}
                        </Typography>
                        <Box sx={{ display: "flex", gap: 1.5 }}>
                            <FormControl fullWidth size="small">
                                <InputLabel>{t("userMgmt.role", "Role")}</InputLabel>
                                <Select
                                    value={editRole}
                                    label={t("userMgmt.role", "Role")}
                                    onChange={(e) => setEditRole(e.target.value)}
                                >
                                    {roles
                                        .filter((r) => r.role_key !== "admin" && r.role_key !== "developer")
                                        .map((role) => (
                                            <MenuItem key={role.role_key} value={role.role_key}>
                                                {role.display_name}
                                            </MenuItem>
                                        ))}
                                </Select>
                            </FormControl>
                            <Button
                                variant="contained"
                                onClick={handleSaveRole}
                                disabled={savingRole || !editRole || editRole === editUser?.role}
                                sx={{ minWidth: 90, whiteSpace: "nowrap" }}
                            >
                                {savingRole ? <CircularProgress size={20} color="inherit" /> : t("common.save", "Save")}
                            </Button>
                        </Box>
                    </Box>

                    <Divider />

                    {/* — Reset Password — */}
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            <KeyIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: "middle" }} />
                            {t("userMgmt.resetPassword", "Reset Password")}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                            {t("userMgmt.resetPasswordNote", "Set a new password directly. User will need to use this new password on next login.")}
                        </Typography>
                        <Box sx={{ display: "flex", gap: 1.5 }}>
                            <TextField
                                fullWidth size="small"
                                label={t("userMgmt.newPassword", "New Password")}
                                type="password"
                                value={editPassword}
                                onChange={(e) => setEditPassword(e.target.value)}
                                helperText={t("userMgmt.passwordMinLength", "Minimum 6 characters")}
                            />
                            <Button
                                variant="outlined"
                                color="warning"
                                onClick={handleResetPassword}
                                disabled={savingPassword || editPassword.length < 6}
                                sx={{ minWidth: 90, whiteSpace: "nowrap", alignSelf: "flex-start" }}
                            >
                                {savingPassword ? <CircularProgress size={20} color="inherit" /> : t("userMgmt.reset", "Reset")}
                            </Button>
                        </Box>
                    </Box>
                </DialogContent>

                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button onClick={() => setEditUser(null)} variant="outlined">
                        {t("common.close", "Close")}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ═══════════════════════════════════════════════════ */}
            {/* Deactivate Confirmation Dialog                       */}
            {/* ═══════════════════════════════════════════════════ */}
            <Dialog
                open={!!confirmDeactivate}
                onClose={() => !deactivating && setConfirmDeactivate(null)}
                maxWidth="xs"
                fullWidth
                PaperProps={{ sx: { borderRadius: 3 } }}
            >
                <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <BlockIcon color="error" />
                    {t("userMgmt.deactivateUser", "Deactivate User")}
                </DialogTitle>
                <DialogContent>
                    <Typography>
                        {t("userMgmt.deactivateConfirm",
                            `Are you sure you want to deactivate `)}
                        <strong>{confirmDeactivate?.name || confirmDeactivate?.email}</strong>
                        {`? They will no longer be able to log into the system.`}
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button
                        onClick={() => setConfirmDeactivate(null)}
                        disabled={deactivating}
                        variant="outlined"
                    >
                        {t("common.cancel", "Cancel")}
                    </Button>
                    <Button
                        onClick={handleDeactivateConfirm}
                        disabled={deactivating}
                        variant="contained"
                        color="error"
                        startIcon={deactivating ? undefined : <BlockIcon />}
                    >
                        {deactivating
                            ? <CircularProgress size={20} color="inherit" />
                            : t("userMgmt.deactivate", "Deactivate")}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ═══════════════════════════════════════════════════ */}
            {/* Snackbar Feedback                                    */}
            {/* ═══════════════════════════════════════════════════ */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert
                    severity={snackbar.severity}
                    onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
                    sx={{ width: "100%" }}
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}
