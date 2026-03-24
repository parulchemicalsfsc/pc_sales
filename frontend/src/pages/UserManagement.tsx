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
} from "@mui/material";
import {
    Refresh as RefreshIcon,
    Search as SearchIcon,
    PersonAdd as PersonAddIcon,
    People as PeopleIcon,
} from "@mui/icons-material";
import { TableSkeleton } from "../components/Skeletons";
import { useAuth } from "../contexts/AuthContext";
import { PERMISSIONS } from "../config/permissions";
import PermissionGate from "../components/PermissionGate";
import axios from "axios";

const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

interface AppUser {
    id?: number;
    email: string;
    name?: string;
    role: string;
    is_active: boolean;
    created_at?: string;
}

export default function UserManagement() {
    const { user, hasPermission } = useAuth();
    const [users, setUsers] = useState<AppUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");

    // Create User state
    const [newUserEmail, setNewUserEmail] = useState("");
    const [newUserPassword, setNewUserPassword] = useState("");
    const [newUserRole, setNewUserRole] = useState("");
    const [creatingUser, setCreatingUser] = useState(false);
    const [creationSuccess, setCreationSuccess] = useState<string | null>(null);

    // Roles fetched from DB
    const [roles, setRoles] = useState<{ role_key: string; display_name: string }[]>([]);

    // Fetch roles on mount
    useEffect(() => {
        const fetchRoles = async () => {
            try {
                const response = await axios.get(`${API_BASE_URL}/api/rbac/roles`, {
                    headers: { "x-user-email": user?.email || "" },
                });
                setRoles(response.data || []);
            } catch (err) {
                console.error("Failed to fetch roles:", err);
            }
        };
        if (user?.email) fetchRoles();
    }, [user?.email]);

    // Load users from app_users table
    const loadUsers = async () => {
        if (!user) return;
        try {
            setLoading(true);
            setError(null);
            const response = await axios.get(
                `${API_BASE_URL}/api/admin/app-users`,
                {
                    headers: { "x-user-email": user.email },
                }
            );
            setUsers(response.data?.users || []);
        } catch (err: any) {
            console.error("Error loading users:", err);
            setError(err.response?.data?.detail || "Failed to load users");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user) loadUsers();
    }, [user]);

    const handleCreateUser = async () => {
        if (!newUserEmail || !newUserPassword || !newUserRole) {
            setError("Please fill in all fields");
            return;
        }
        try {
            setCreatingUser(true);
            setError(null);
            setCreationSuccess(null);
            await axios.post(
                `${API_BASE_URL}/api/admin/users`,
                { email: newUserEmail, password: newUserPassword, role: newUserRole },
                { headers: { "x-user-email": user?.email || "" } }
            );
            setCreationSuccess(`User ${newUserEmail} created successfully with role ${newUserRole}`);
            setNewUserEmail("");
            setNewUserPassword("");
            setNewUserRole("");
            loadUsers();
        } catch (err: any) {
            console.error("Error creating user:", err);
            setError(err.response?.data?.detail || "Failed to create user");
        } finally {
            setCreatingUser(false);
        }
    };

    // Helpers
    const getRoleDisplayName = (roleKey: string) => {
        const role = roles.find((r) => r.role_key === roleKey);
        return role?.display_name || roleKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    };

    const filteredUsers = users.filter((u) => {
        if (!searchTerm) return true;
        const s = searchTerm.toLowerCase();
        return (
            u.email?.toLowerCase().includes(s) ||
            u.name?.toLowerCase().includes(s) ||
            u.role?.toLowerCase().includes(s)
        );
    });

    return (
        <Box>
            {/* Header */}
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, display: "flex", alignItems: "center", gap: 1 }}>
                    <PeopleIcon color="primary" /> User Management
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    View all users and their roles. Create new user accounts.
                </Typography>
            </Box>

            {/* Create User Card — only for users with manage_users permission */}
            <PermissionGate permission={PERMISSIONS.MANAGE_USERS}>
                <Card sx={{ mb: 4 }}>
                    <CardContent>
                        <Typography variant="h6" gutterBottom fontWeight="bold" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <PersonAddIcon color="primary" /> Create New User
                        </Typography>
                        <Typography variant="body2" color="textSecondary" paragraph>
                            Create new users and assign their roles. Changes take effect immediately.
                        </Typography>

                        {creationSuccess && (
                            <Alert severity="success" sx={{ mb: 3 }} onClose={() => setCreationSuccess(null)}>
                                {creationSuccess}
                            </Alert>
                        )}

                        <Grid container spacing={2} alignItems="center">
                            <Grid item xs={12} md={4}>
                                <TextField
                                    fullWidth
                                    label="Email Address"
                                    value={newUserEmail}
                                    onChange={(e) => setNewUserEmail(e.target.value)}
                                    size="small"
                                />
                            </Grid>
                            <Grid item xs={12} md={3}>
                                <TextField
                                    fullWidth
                                    label="Password"
                                    type="password"
                                    value={newUserPassword}
                                    onChange={(e) => setNewUserPassword(e.target.value)}
                                    size="small"
                                />
                            </Grid>
                            <Grid item xs={12} md={3}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Role</InputLabel>
                                    <Select
                                        value={newUserRole}
                                        label="Role"
                                        onChange={(e) => setNewUserRole(e.target.value)}
                                    >
                                        {roles.length === 0 ? (
                                            <MenuItem disabled>Loading roles...</MenuItem>
                                        ) : (
                                            roles.map((role) => (
                                                <MenuItem key={role.role_key} value={role.role_key}>
                                                    {role.display_name}
                                                </MenuItem>
                                            ))
                                        )}
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} md={2}>
                                <Button
                                    fullWidth
                                    variant="contained"
                                    onClick={handleCreateUser}
                                    disabled={creatingUser}
                                >
                                    {creatingUser ? <CircularProgress size={24} color="inherit" /> : "Create User"}
                                </Button>
                            </Grid>
                        </Grid>
                    </CardContent>
                </Card>
            </PermissionGate>

            {error && (
                <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}

            {/* Users Table */}
            <Card>
                <CardContent>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                            All Users ({filteredUsers.length})
                        </Typography>
                        <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
                            <TextField
                                size="small"
                                placeholder="Search users..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <SearchIcon />
                                        </InputAdornment>
                                    ),
                                }}
                                sx={{ minWidth: 250 }}
                            />
                            <Tooltip title="Refresh">
                                <IconButton onClick={loadUsers} color="primary" disabled={loading}>
                                    <RefreshIcon />
                                </IconButton>
                            </Tooltip>
                        </Box>
                    </Box>

                    {loading ? (
                        <TableSkeleton rows={8} columns={4} />
                    ) : (
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 600 }}>User</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>Email</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>Role</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {filteredUsers.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                                                <Typography color="text.secondary">
                                                    No users found
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredUsers.map((u, idx) => (
                                            <TableRow key={u.email || idx} hover>
                                                <TableCell>
                                                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                                        <Avatar
                                                            sx={{
                                                                width: 32,
                                                                height: 32,
                                                                bgcolor: "primary.main",
                                                                fontSize: "0.875rem",
                                                            }}
                                                        >
                                                            {(u.name || u.email || "?").charAt(0).toUpperCase()}
                                                        </Avatar>
                                                        <Typography variant="body2" fontWeight={500}>
                                                            {u.name || u.email}
                                                        </Typography>
                                                    </Box>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2">{u.email}</Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Chip
                                                        label={getRoleDisplayName(u.role)}
                                                        size="small"
                                                        color={u.role === "admin" ? "error" : u.role === "developer" ? "info" : "default"}
                                                        variant="outlined"
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Chip
                                                        label={u.is_active ? "Active" : "Inactive"}
                                                        size="small"
                                                        color={u.is_active ? "success" : "default"}
                                                    />
                                                </TableCell>

                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </CardContent>
            </Card>
        </Box>
    );
}
