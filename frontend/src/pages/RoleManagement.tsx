import React, { useEffect, useState, useCallback } from "react";
import {
    Box,
    Typography,
    Paper,
    Grid,
    Chip,
    Button,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Checkbox,
    FormControlLabel,
    CircularProgress,
    Alert,
    Tooltip,
    Divider,
    Badge,
} from "@mui/material";
import {
    Add as AddIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
    Shield as ShieldIcon,
    Lock as LockIcon,
    CheckCircle as CheckCircleIcon,
    Group as GroupIcon,
    Refresh as RefreshIcon,
} from "@mui/icons-material";
import { rbacAPI } from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import { useTranslation } from "../hooks/useTranslation";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Role {
    role_id: number;
    role_key: string;
    display_name: string;
    description: string;
    is_system: boolean;
    permission_count: number;
}

interface Permission {
    permission_id: number;
    permission_key: string;
    display_name: string;
    description: string;
    module: string;
}

// ─── Module colour mapping (for chips) ───────────────────────────────────────
const MODULE_COLORS: Record<string, string> = {
    Dashboard: "#6366f1",
    Customers: "#0ea5e9",
    Sales: "#10b981",
    Orders: "#f59e0b",
    Payments: "#ef4444",
    Demos: "#8b5cf6",
    Distributors: "#14b8a6",
    Reports: "#f97316",
    "Calling List": "#ec4899",
    "Products & Pricing": "#84cc16",
    "Data Import": "#64748b",
    Chat: "#06b6d4",
    Admin: "#dc2626",
};

// ─── Main Page ─────────────────────────────────────────────────────────────────
const RoleManagement: React.FC = () => {
    const { refreshPermissions } = useAuth();
    const { t } = useTranslation();

    const [roles, setRoles] = useState<Role[]>([]);
    const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
    const [selectedRole, setSelectedRole] = useState<Role | null>(null);
    const [assignedPermIds, setAssignedPermIds] = useState<Set<number>>(new Set());
    const [pendingPermIds, setPendingPermIds] = useState<Set<number>>(new Set());
    const [loadingRoles, setLoadingRoles] = useState(true);
    const [loadingPerms, setLoadingPerms] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [isDirty, setIsDirty] = useState(false);

    // Create Role dialog
    const [createOpen, setCreateOpen] = useState(false);
    const [newRoleName, setNewRoleName] = useState("");
    const [newRoleDesc, setNewRoleDesc] = useState("");
    const [creating, setCreating] = useState(false);

    // Delete confirmation dialog
    const [deleteRole, setDeleteRole] = useState<Role | null>(null);
    const [deleting, setDeleting] = useState(false);

    // ── Fetch ──────────────────────────────────────────────────────────────────
    const fetchRoles = useCallback(async () => {
        setLoadingRoles(true);
        setError(null);
        try {
            const [rolesData, permsData] = await Promise.all([
                rbacAPI.getRoles(),
                rbacAPI.getPermissions(),
            ]);
            setRoles(rolesData);
            setAllPermissions(permsData);
        } catch (err: any) {
            setError(err?.response?.data?.detail || "Failed to load roles");
        } finally {
            setLoadingRoles(false);
        }
    }, []);

    useEffect(() => {
        fetchRoles();
    }, [fetchRoles]);

    // ── Select a role to edit ─────────────────────────────────────────────────
    const handleSelectRole = async (role: Role) => {
        setSelectedRole(role);
        setIsDirty(false);
        setSuccess(null);
        setError(null);
        setLoadingPerms(true);
        try {
            const ids: number[] = await rbacAPI.getRolePermissions(role.role_id);
            const idSet = new Set<number>(ids);
            setAssignedPermIds(idSet);
            setPendingPermIds(new Set(idSet)); // copy for editing
        } catch (err: any) {
            setError("Failed to load permissions for this role");
        } finally {
            setLoadingPerms(false);
        }
    };

    // ── Toggle a permission ───────────────────────────────────────────────────
    const togglePermission = (permId: number) => {
        setPendingPermIds((prev) => {
            const next = new Set(prev);
            if (next.has(permId)) next.delete(permId);
            else next.add(permId);
            return next;
        });
        setIsDirty(true);
    };

    // ── Save permissions ──────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!selectedRole) return;
        setSaving(true);
        setError(null);
        try {
            await rbacAPI.updateRolePermissions(
                selectedRole.role_id,
                Array.from(pendingPermIds)
            );
            setAssignedPermIds(new Set(pendingPermIds));
            setIsDirty(false);
            setSuccess(`Permissions for '${selectedRole.display_name}' updated!`);
            // Refresh current user's permissions in case they're editing their own role
            await refreshPermissions();
            // Refresh role list (permission_count updates)
            fetchRoles();
        } catch (err: any) {
            setError(err?.response?.data?.detail || "Failed to save permissions");
        } finally {
            setSaving(false);
        }
    };

    // ── Create role ───────────────────────────────────────────────────────────
    const handleCreate = async () => {
        if (!newRoleName.trim()) return;
        setCreating(true);
        try {
            await rbacAPI.createRole(newRoleName.trim(), newRoleDesc.trim());
            setCreateOpen(false);
            setNewRoleName("");
            setNewRoleDesc("");
            setSuccess("Role created successfully!");
            fetchRoles();
        } catch (err: any) {
            setError(err?.response?.data?.detail || "Failed to create role");
        } finally {
            setCreating(false);
        }
    };

    // ── Delete role ───────────────────────────────────────────────────────────
    const handleDelete = async () => {
        if (!deleteRole) return;
        setDeleting(true);
        try {
            await rbacAPI.deleteRole(deleteRole.role_id);
            setDeleteRole(null);
            if (selectedRole?.role_id === deleteRole.role_id) setSelectedRole(null);
            setSuccess(`Role '${deleteRole.display_name}' deleted.`);
            fetchRoles();
        } catch (err: any) {
            setError(err?.response?.data?.detail || "Failed to delete role");
        } finally {
            setDeleting(false);
        }
    };

    // ── Group permissions by module ────────────────────────────────────────────
    const groupedPermissions = allPermissions.reduce<Record<string, Permission[]>>(
        (acc, perm) => {
            if (!acc[perm.module]) acc[perm.module] = [];
            acc[perm.module].push(perm);
            return acc;
        },
        {}
    );

    // ─── Render ────────────────────────────────────────────────────────────────
    return (
        <Box sx={{ p: { xs: 2, md: 3 } }}>
            {/* Header */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
                <ShieldIcon sx={{ fontSize: 36, color: "primary.main" }} />
                <Box>
                    <Typography variant="h4" fontWeight={700}>
                        {t("roleMgmt.title", "Role Management")}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {t("roleMgmt.subtitle", "Manage roles and their permissions. Changes apply immediately to all users with that role.")}
                    </Typography>
                </Box>
                <Box sx={{ ml: "auto", display: "flex", gap: 1 }}>
                    <Tooltip title="Refresh">
                        <IconButton onClick={fetchRoles}>
                            <RefreshIcon />
                        </IconButton>
                    </Tooltip>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => setCreateOpen(true)}
                        sx={{ borderRadius: 2 }}
                    >
                        {t("roleMgmt.newRole", "New Role")}
                    </Button>
                </Box>
            </Box>

            {/* Alerts */}
            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}
            {success && (
                <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
                    {success}
                </Alert>
            )}

            <Grid container spacing={3}>
                {/* Left panel: Role list */}
                <Grid item xs={12} md={4}>
                    <Paper
                        elevation={0}
                        variant="outlined"
                        sx={{ borderRadius: 3, overflow: "hidden" }}
                    >
                        <Box
                            sx={{
                                p: 2,
                                bgcolor: "grey.50",
                                borderBottom: "1px solid",
                                borderColor: "divider",
                            }}
                        >
                            <Typography variant="subtitle1" fontWeight={600}>
                                <GroupIcon sx={{ mr: 1, verticalAlign: "middle", fontSize: 18 }} />
                                {t("roleMgmt.roles", "Roles")} ({roles.length})
                            </Typography>
                        </Box>

                        {loadingRoles ? (
                            <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
                                <CircularProgress />
                            </Box>
                        ) : (
                            roles.map((role) => (
                                <Box
                                    key={role.role_id}
                                    onClick={() => handleSelectRole(role)}
                                    sx={{
                                        p: 2,
                                        cursor: "pointer",
                                        borderBottom: "1px solid",
                                        borderColor: "divider",
                                        bgcolor:
                                            selectedRole?.role_id === role.role_id
                                                ? "primary.50"
                                                : "transparent",
                                        borderLeft:
                                            selectedRole?.role_id === role.role_id
                                                ? "3px solid"
                                                : "3px solid transparent",
                                        borderLeftColor: "primary.main",
                                        transition: "all 0.15s",
                                        "&:hover": { bgcolor: "grey.50" },
                                    }}
                                >
                                    <Box
                                        sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}
                                    >
                                        {role.is_system ? (
                                            <LockIcon sx={{ fontSize: 14, color: "error.main" }} />
                                        ) : (
                                            <ShieldIcon sx={{ fontSize: 14, color: "primary.main" }} />
                                        )}
                                        <Typography variant="subtitle2" fontWeight={600}>
                                            {role.display_name}
                                        </Typography>
                                        <Badge
                                            badgeContent={role.permission_count}
                                            color="primary"
                                            sx={{ ml: "auto" }}
                                        />
                                    </Box>
                                    <Typography
                                        variant="caption"
                                        color="text.secondary"
                                        sx={{
                                            display: "block",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {role.description || role.role_key}
                                    </Typography>

                                    {/* Actions (only non-system roles) */}
                                    {!role.is_system && (
                                        <Box sx={{ display: "flex", gap: 0.5, mt: 1 }}>
                                            <Tooltip title="Delete role">
                                                <IconButton
                                                    size="small"
                                                    color="error"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDeleteRole(role);
                                                    }}
                                                >
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                    )}
                                </Box>
                            ))
                        )}
                    </Paper>
                </Grid>

                {/* Right panel: Permission editor */}
                <Grid item xs={12} md={8}>
                    {!selectedRole ? (
                        <Paper
                            elevation={0}
                            variant="outlined"
                            sx={{
                                borderRadius: 3,
                                p: 6,
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                minHeight: 400,
                                color: "text.secondary",
                            }}
                        >
                            <EditIcon sx={{ fontSize: 56, mb: 2, opacity: 0.3 }} />
                            <Typography variant="h6">{t("roleMgmt.selectRole", "Select a role to edit")}</Typography>
                            <Typography variant="body2">
                                {t("roleMgmt.selectRoleDesc", "Click any role on the left to view and modify its permissions.")}
                            </Typography>
                        </Paper>
                    ) : (
                        <Paper
                            elevation={0}
                            variant="outlined"
                            sx={{ borderRadius: 3, overflow: "hidden" }}
                        >
                            {/* Role editor header */}
                            <Box
                                sx={{
                                    p: 2,
                                    bgcolor: "grey.50",
                                    borderBottom: "1px solid",
                                    borderColor: "divider",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 2,
                                }}
                            >
                                <Box sx={{ flex: 1 }}>
                                    <Typography variant="h6" fontWeight={600}>
                                        {selectedRole.display_name}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {pendingPermIds.size} {t("roleMgmt.permissionsAssigned", "permissions assigned")}
                                        {isDirty && ` · ${t("roleMgmt.unsavedChanges", "Unsaved changes")}`}
                                    </Typography>
                                </Box>
                                {selectedRole.is_system && (
                                    <Chip
                                        icon={<LockIcon />}
                                        label={t("roleMgmt.systemRole", "System Role")}
                                        size="small"
                                        color="error"
                                        variant="outlined"
                                    />
                                )}
                                <Button
                                    variant="contained"
                                    startIcon={
                                        saving ? (
                                            <CircularProgress size={16} color="inherit" />
                                        ) : (
                                            <CheckCircleIcon />
                                        )
                                    }
                                    onClick={handleSave}
                                    disabled={!isDirty || saving}
                                    sx={{ borderRadius: 2 }}
                                >
                                    {saving ? t("common.saving", "Saving...") : t("roleMgmt.saveChanges", "Save Changes")}
                                </Button>
                            </Box>

                            {/* Permission grid */}
                            {loadingPerms ? (
                                <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
                                    <CircularProgress />
                                </Box>
                            ) : (
                                <Box sx={{ p: 2 }}>
                                    {Object.entries(groupedPermissions).map(([module, perms]) => (
                                        <Box key={module} sx={{ mb: 3 }}>
                                            <Box
                                                sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}
                                            >
                                                <Box
                                                    sx={{
                                                        width: 10,
                                                        height: 10,
                                                        borderRadius: "50%",
                                                        bgcolor: MODULE_COLORS[module] || "#6b7280",
                                                    }}
                                                />
                                                <Typography
                                                    variant="subtitle2"
                                                    fontWeight={700}
                                                    color="text.secondary"
                                                    sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}
                                                >
                                                    {module}
                                                </Typography>
                                                <Divider sx={{ flex: 1 }} />
                                                <Typography variant="caption" color="text.secondary">
                                                    {perms.filter((p) => pendingPermIds.has(p.permission_id)).length}/{perms.length}
                                                </Typography>
                                            </Box>

                                            <Grid container spacing={1}>
                                                {perms.map((perm) => (
                                                    <Grid item xs={12} sm={6} key={perm.permission_id}>
                                                        <Box
                                                            onClick={() => togglePermission(perm.permission_id)}
                                                            sx={{
                                                                display: "flex",
                                                                alignItems: "flex-start",
                                                                gap: 1,
                                                                p: 1.5,
                                                                borderRadius: 2,
                                                                border: "1px solid",
                                                                cursor: "pointer",
                                                                transition: "all 0.15s",
                                                                borderColor: pendingPermIds.has(perm.permission_id)
                                                                    ? (MODULE_COLORS[module] || "primary.main")
                                                                    : "divider",
                                                                bgcolor: pendingPermIds.has(perm.permission_id)
                                                                    ? `${MODULE_COLORS[module]}15` || "primary.50"
                                                                    : "transparent",
                                                                "&:hover": { borderColor: "primary.main" },
                                                            }}
                                                        >
                                                            <Checkbox
                                                                checked={pendingPermIds.has(perm.permission_id)}
                                                                size="small"
                                                                sx={{ p: 0, mt: 0.2 }}
                                                                onChange={() => togglePermission(perm.permission_id)}
                                                            />
                                                            <Box>
                                                                <Typography variant="body2" fontWeight={500}>
                                                                    {perm.display_name}
                                                                </Typography>
                                                                <Typography variant="caption" color="text.secondary">
                                                                    {perm.description}
                                                                </Typography>
                                                            </Box>
                                                        </Box>
                                                    </Grid>
                                                ))}
                                            </Grid>



                                        </Box>
                                    ))}
                                </Box>
                            )}
                        </Paper>
                    )}
                </Grid>
            </Grid>

            {/* Create Role Dialog */}
            <Dialog
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                maxWidth="xs"
                fullWidth
            >
                <DialogTitle>{t("roleMgmt.createNewRole", "Create New Role")}</DialogTitle>
                <DialogContent sx={{ pt: 2 }}>
                    <TextField
                        label={t("roleMgmt.roleName", "Role Name")}
                        fullWidth
                        value={newRoleName}
                        onChange={(e) => setNewRoleName(e.target.value)}
                        placeholder="e.g. Field Officer"
                        sx={{ mb: 2 }}
                        helperText={`Key: ${newRoleName.toLowerCase().replace(/ /g, "_") || "role_key"}`}
                    />
                    <TextField
                        label={t("admin.description", "Description")}
                        fullWidth
                        multiline
                        rows={2}
                        value={newRoleDesc}
                        onChange={(e) => setNewRoleDesc(e.target.value)}
                        placeholder="Brief description of this role..."
                    />
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setCreateOpen(false)}>{t("common.cancel", "Cancel")}</Button>
                    <Button
                        variant="contained"
                        onClick={handleCreate}
                        disabled={!newRoleName.trim() || creating}
                        startIcon={
                            creating ? <CircularProgress size={16} color="inherit" /> : <AddIcon />
                        }
                    >
                        {creating ? t("roleMgmt.creating", "Creating...") : t("roleMgmt.createRole", "Create Role")}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog
                open={!!deleteRole}
                onClose={() => setDeleteRole(null)}
                maxWidth="xs"
                fullWidth
            >
                <DialogTitle>{t("roleMgmt.deleteRole", "Delete Role")}</DialogTitle>
                <DialogContent>
                    <Typography>
                        Are you sure you want to delete the role{" "}
                        <strong>{deleteRole?.display_name}</strong>? This cannot be undone.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setDeleteRole(null)}>{t("common.cancel", "Cancel")}</Button>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={handleDelete}
                        disabled={deleting}
                        startIcon={
                            deleting ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon />
                        }
                    >
                        {deleting ? t("roleMgmt.deleting", "Deleting...") : t("common.delete", "Delete")}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default RoleManagement;
