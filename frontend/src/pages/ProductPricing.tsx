import { useState, useEffect } from "react";
import {
    Box,
    Card,
    CardContent,
    Typography,
    CircularProgress,
    Alert,
    Button,
    TextField,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    InputAdornment,
    IconButton,
    Tooltip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Grid,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
} from "@mui/material";
import { TableSkeleton } from "../components/Skeletons";
import {
    Refresh as RefreshIcon,
    Save as SaveIcon,
    Edit as EditIcon,
    Cancel as CancelIcon,
    Add as AddIcon,
    Delete as DeleteIcon,
} from "@mui/icons-material";
import { useAuth } from "../contexts/AuthContext";
import { PERMISSIONS } from "../config/permissions";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

interface Product {
    product_id: number;
    product_name: string;
    packing_type?: string;
    capacity_ltr?: number;
    category?: string;
    standard_rate?: number;
    rate_gujarat?: number;
    rate_maharashtra?: number;
    rate_mp?: number;

    // Advanced Pricing
    rate_gujarat_sabhasad?: number;
    rate_gujarat_mantri?: number;
    rate_gujarat_distributor?: number;
    rate_gujarat_field_officer?: number;

    rate_maharashtra_sabhasad?: number;
    rate_maharashtra_mantri?: number;
    rate_maharashtra_distributor?: number;
    rate_maharashtra_field_officer?: number;

    rate_mp_sabhasad?: number;
    rate_mp_mantri?: number;
    rate_mp_distributor?: number;
    rate_mp_field_officer?: number;

    is_active: number;
}

interface PriceState {
    standard_rate?: number;
    rate_gujarat?: number;
    rate_maharashtra?: number;
    rate_mp?: number;

    // Advanced Pricing
    rate_gujarat_sabhasad?: number;
    rate_gujarat_mantri?: number;
    rate_gujarat_distributor?: number;
    rate_gujarat_field_officer?: number;

    rate_maharashtra_sabhasad?: number;
    rate_maharashtra_mantri?: number;
    rate_maharashtra_distributor?: number;
    rate_maharashtra_field_officer?: number;

    rate_mp_sabhasad?: number;
    rate_mp_mantri?: number;
    rate_mp_distributor?: number;
    rate_mp_field_officer?: number;
}

export default function ProductPricing() {
    const { user, hasPermission } = useAuth();
    const navigate = useNavigate();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [editingPrices, setEditingPrices] = useState<Record<number, PriceState>>(
        {},
    );
    const [editMode, setEditMode] = useState<Record<number, boolean>>({});

    // Add Product State
    const [openAddDialog, setOpenAddDialog] = useState(false);
    const [newProduct, setNewProduct] = useState<Partial<Product>>({
        product_name: "",
        packing_type: "",
        capacity_ltr: 0,
        category: "",
        standard_rate: 0,
        rate_gujarat: 0,
        rate_maharashtra: 0,
        rate_mp: 0,
        is_active: 1
    });

    // Delete Product State
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [productToDelete, setProductToDelete] = useState<number | null>(null);

    // Check if user has pricing permissions
    useEffect(() => {
        if (user && !hasPermission(PERMISSIONS.MANAGE_PRICING)) {
            setError("Access denied. You need pricing management privileges.");
            setTimeout(() => {
                navigate("/dashboard");
            }, 2000);
        }
    }, [user, navigate, hasPermission]);

    // Load all products
    const loadProducts = async () => {
        if (!user || !hasPermission(PERMISSIONS.MANAGE_PRICING)) return;

        try {
            setLoading(true);
            setError(null);

            const response = await axios.get(`${API_BASE_URL}/api/products/all`, {
                headers: {
                    "x-user-email": user.email,
                },
            });

            setProducts(response.data || []);
        } catch (err: any) {
            console.error("Error loading products:", err);
            setError(err.response?.data?.detail || "Failed to load products");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user && hasPermission(PERMISSIONS.MANAGE_PRICING)) {
            loadProducts();
        }
    }, [user]);

    const handleEdit = (product: Product) => {
        setEditMode({ ...editMode, [product.product_id]: true });

        // Helper to safely get a rate or fallback
        const getRate = (rate?: number) => rate || product.standard_rate || 0;
        const rateGj = product.rate_gujarat || product.standard_rate || 0;
        const rateMh = product.rate_maharashtra || product.standard_rate || 0;
        const rateMp = product.rate_mp || product.standard_rate || 0;

        setEditingPrices({
            ...editingPrices,
            [product.product_id]: {
                standard_rate: product.standard_rate || 0,
                // Old Fields (keeping them for now)
                rate_gujarat: rateGj,
                rate_maharashtra: rateMh,
                rate_mp: rateMp,

                // Advanced Pricing - Gujarat
                rate_gujarat_sabhasad: product.rate_gujarat_sabhasad || rateGj,
                rate_gujarat_mantri: product.rate_gujarat_mantri || rateGj,
                rate_gujarat_distributor: product.rate_gujarat_distributor || rateGj,
                rate_gujarat_field_officer: product.rate_gujarat_field_officer || rateGj,

                // Advanced Pricing - Maharashtra
                rate_maharashtra_sabhasad: product.rate_maharashtra_sabhasad || rateMh,
                rate_maharashtra_mantri: product.rate_maharashtra_mantri || rateMh,
                rate_maharashtra_distributor: product.rate_maharashtra_distributor || rateMh,
                rate_maharashtra_field_officer: product.rate_maharashtra_field_officer || rateMh,

                // Advanced Pricing - Madhya Pradesh
                rate_mp_sabhasad: product.rate_mp_sabhasad || rateMp,
                rate_mp_mantri: product.rate_mp_mantri || rateMp,
                rate_mp_distributor: product.rate_mp_distributor || rateMp,
                rate_mp_field_officer: product.rate_mp_field_officer || rateMp,
            },
        });
    };

    const handleCancel = (productId: number) => {
        const newEditMode = { ...editMode };
        const newEditingPrices = { ...editingPrices };
        delete newEditMode[productId];
        delete newEditingPrices[productId];
        setEditMode(newEditMode);
        setEditingPrices(newEditingPrices);
    };

    const handlePriceChange = (productId: number, field: keyof PriceState, value: string) => {
        const numValue = parseFloat(value) || 0;
        setEditingPrices({
            ...editingPrices,
            [productId]: {
                ...editingPrices[productId],
                [field]: numValue
            },
        });
    };

    const handleSave = async (product: Product) => {
        try {
            setSaving(true);
            setError(null);
            setSuccess(null);

            const priceData = editingPrices[product.product_id];

            await axios.put(
                `${API_BASE_URL}/api/admin/update-product-price/${product.product_id}`,
                priceData,
                {
                    headers: {
                        "x-user-email": user?.email,
                    },
                },
            );

            // Update local state
            setProducts(
                products.map((p) =>
                    p.product_id === product.product_id
                        ? { ...p, ...priceData }
                        : p,
                ),
            );

            // Exit edit mode
            handleCancel(product.product_id);

            setSuccess(`Price updated for ${product.product_name}`);
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            console.error("Error updating price:", err);
            setError(err.response?.data?.detail || "Failed to update price");
        } finally {
            setSaving(false);
        }
    };

    const handleSaveAll = async () => {
        try {
            setSaving(true);
            setError(null);
            setSuccess(null);

            // Update all products that are in edit mode
            const updates = Object.keys(editMode)
                .filter((key) => editMode[parseInt(key)])
                .map((key) => {
                    const productId = parseInt(key);
                    return {
                        product_id: productId,
                        ...editingPrices[productId],
                    };
                });

            if (updates.length === 0) {
                setError("No changes to save");
                return;
            }

            await axios.post(
                `${API_BASE_URL}/api/admin/update-product-prices-bulk`,
                { updates },
                {
                    headers: {
                        "x-user-email": user?.email,
                    },
                },
            );

            // Reload products
            await loadProducts();

            // Clear edit mode
            setEditMode({});
            setEditingPrices({});

            setSuccess(`Successfully updated ${updates.length} product prices`);
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            console.error("Error updating prices:", err);
            setError(err.response?.data?.detail || "Failed to update prices");
        } finally {
            setSaving(false);
        }
    };

    const handleAddClick = () => {
        setNewProduct({
            product_name: "",
            packing_type: "",
            capacity_ltr: 0,
            category: "",
            standard_rate: 0,
            rate_gujarat: 0,
            rate_maharashtra: 0,
            rate_mp: 0,
            is_active: 1
        });
        setOpenAddDialog(true);
    };

    const handleAddClose = () => {
        setOpenAddDialog(false);
    };

    const handleAddChange = (field: keyof Product, value: any) => {
        setNewProduct({
            ...newProduct,
            [field]: value
        });
    };

    const handleAddSubmit = async () => {
        try {
            setSaving(true);
            setError(null);

            // Validate
            if (!newProduct.product_name) {
                setError("Product name is required");
                setSaving(false);
                return;
            }

            const response = await axios.post(
                `${API_BASE_URL}/api/products/`,
                newProduct,
                {
                    headers: {
                        "x-user-email": user?.email,
                    },
                }
            );

            setSuccess("Product added successfully");
            setOpenAddDialog(false);
            loadProducts();
        } catch (err: any) {
            console.error("Error adding product:", err);
            setError(err.response?.data?.detail || "Failed to add product");
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteClick = (productId: number) => {
        setProductToDelete(productId);
        setDeleteDialogOpen(true);
    };

    const handleDeleteClose = () => {
        setDeleteDialogOpen(false);
        setProductToDelete(null);
    };

    const handleDeleteConfirm = async () => {
        if (!productToDelete) return;
        try {
            setSaving(true);
            setError(null);

            await axios.delete(
                `${API_BASE_URL}/api/products/${productToDelete}`,
                {
                    headers: {
                        "x-user-email": user?.email,
                    },
                }
            );

            setSuccess("Product deleted successfully");
            setDeleteDialogOpen(false);
            setProductToDelete(null);
            loadProducts();
        } catch (err: any) {
            console.error("Error deleting product:", err);
            setError(err.response?.data?.detail || "Failed to delete product");
        } finally {
            setSaving(false);
        }
    };

    if (!user || !hasPermission(PERMISSIONS.MANAGE_PRICING)) {
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
                    Access denied. You need pricing management privileges.
                </Alert>
            </Box>
        );
    }

    const hasChanges = Object.keys(editMode).some((key) => editMode[parseInt(key)]);

    // Region & Category Selection State
    const [selectedRegion, setSelectedRegion] = useState("Gujarat");
    const [selectedCategory, setSelectedCategory] = useState("Sabhasad");

    const regions = ["Gujarat", "Maharashtra", "Madhya Pradesh"];
    const categories = ["Sabhasad", "Mantri", "Distributor", "Field Officer"];

    // Helper to get the correct price field based on selection
    const getPriceField = (region: string, category: string): keyof PriceState => {
        const regionKey = region.toLowerCase().replace(" ", "_"); // gujarat, maharashtra, madhya_pradesh

        // Map region names to keys
        let rKey = regionKey;
        if (region === "Madhya Pradesh") rKey = "mp";

        const catKey = category.toLowerCase().replace(" ", "_"); // sabhasad, mantri, distributor, field_officer

        return `rate_${rKey}_${catKey}` as keyof PriceState;
    };

    const currentPriceField = getPriceField(selectedRegion, selectedCategory);

    return (
        <Box>
            {/* Header */}
            <Box sx={{ mb: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
                        Product Pricing Management
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        Update default prices for all products in the system
                    </Typography>
                </Box>
                <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                    <FormControl size="small" sx={{ minWidth: 150 }}>
                        <InputLabel>Region</InputLabel>
                        <Select
                            value={selectedRegion}
                            label="Region"
                            onChange={(e) => setSelectedRegion(e.target.value)}
                        >
                            {regions.map((region) => (
                                <MenuItem key={region} value={region}>
                                    {region}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <FormControl size="small" sx={{ minWidth: 150, mr: 2 }}>
                        <InputLabel>Category</InputLabel>
                        <Select
                            value={selectedCategory}
                            label="Category"
                            onChange={(e) => setSelectedCategory(e.target.value)}
                        >
                            {categories.map((category) => (
                                <MenuItem key={category} value={category}>
                                    {category}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={handleAddClick}
                        disabled={saving}
                    >
                        Add Product
                    </Button>
                    <Tooltip title="Refresh">
                        <IconButton onClick={loadProducts} color="primary" disabled={loading}>
                            <RefreshIcon />
                        </IconButton>
                    </Tooltip>
                    {hasChanges && (
                        <Button
                            variant="contained"
                            startIcon={<SaveIcon />}
                            onClick={handleSaveAll}
                            disabled={saving}
                            color="success"
                        >
                            Save All Changes
                        </Button>
                    )}
                </Box>
            </Box>

            {error && (
                <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}

            {success && (
                <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess(null)}>
                    {success}
                </Alert>
            )}

            {/* Products Table */}
            <Card>
                <CardContent>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                        All Products ({products.length})
                    </Typography>

                    {loading ? (
                        <TableSkeleton rows={10} columns={9} />
                    ) : (
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 600 }}>Product Name</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>Packing Type</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>Capacity (Ltr)</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>Category</TableCell>

                                        <TableCell sx={{ fontWeight: 600 }}>
                                            Rate ({selectedRegion === "Madhya Pradesh" ? "MP" : (selectedRegion === "Gujarat" ? "GJ" : "MH")} - {selectedCategory})
                                        </TableCell>

                                        <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {products.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                                                <Typography color="text.secondary">
                                                    No products found
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        products.map((product) => (
                                            <TableRow
                                                key={product.product_id}
                                                hover
                                                sx={{
                                                    "&:hover": {
                                                        bgcolor: "action.hover",
                                                    },
                                                }}
                                            >
                                                <TableCell>
                                                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                                        {product.product_name}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2">
                                                        {product.packing_type || "-"}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2">
                                                        {product.capacity_ltr || "-"}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2">
                                                        {product.category || "-"}
                                                    </Typography>
                                                </TableCell>

                                                {/* Dynamic Rate Column */}
                                                <TableCell>
                                                    {editMode[product.product_id] ? (
                                                        <TextField
                                                            size="small"
                                                            type="number"
                                                            value={editingPrices[product.product_id]?.[currentPriceField] || 0}
                                                            onChange={(e) =>
                                                                handlePriceChange(product.product_id, currentPriceField, e.target.value)
                                                            }
                                                            InputProps={{
                                                                startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                                                            }}
                                                            sx={{ width: 100 }}
                                                        />
                                                    ) : (
                                                        <Typography variant="body2">
                                                            ₹{product[currentPriceField]?.toFixed(2) || (product.standard_rate?.toFixed(2) || "0.00")}
                                                        </Typography>
                                                    )}
                                                </TableCell>

                                                <TableCell>
                                                    <Typography
                                                        variant="caption"
                                                        sx={{
                                                            px: 1,
                                                            py: 0.5,
                                                            borderRadius: 1,
                                                            bgcolor:
                                                                product.is_active === 1
                                                                    ? "success.light"
                                                                    : "error.light",
                                                            color:
                                                                product.is_active === 1
                                                                    ? "success.dark"
                                                                    : "error.dark",
                                                        }}
                                                    >
                                                        {product.is_active === 1 ? "Active" : "Inactive"}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell>
                                                    {editMode[product.product_id] ? (
                                                        <Box sx={{ display: "flex", gap: 1 }}>
                                                            <Tooltip title="Save">
                                                                <IconButton
                                                                    size="small"
                                                                    color="primary"
                                                                    onClick={() => handleSave(product)}
                                                                    disabled={saving}
                                                                >
                                                                    <SaveIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                            <Tooltip title="Cancel">
                                                                <IconButton
                                                                    size="small"
                                                                    color="error"
                                                                    onClick={() => handleCancel(product.product_id)}
                                                                    disabled={saving}
                                                                >
                                                                    <CancelIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                        </Box>
                                                    ) : (
                                                        <Box sx={{ display: "flex", gap: 1 }}>
                                                            <Tooltip title="Edit Price">
                                                                <IconButton
                                                                    size="small"
                                                                    color="primary"
                                                                    onClick={() =>
                                                                        handleEdit(product)
                                                                    }
                                                                >
                                                                    <EditIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                            <Tooltip title="Delete">
                                                                <IconButton
                                                                    size="small"
                                                                    color="error"
                                                                    onClick={() => handleDeleteClick(product.product_id)}
                                                                >
                                                                    <DeleteIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                        </Box>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer >
                    )
                    }
                </CardContent >
            </Card >

            {/* Add Product Dialog */}
            <Dialog open={openAddDialog} onClose={handleAddClose} maxWidth="md" fullWidth>
                <DialogTitle>Add New Product</DialogTitle>
                <DialogContent>
                    <Box sx={{ pt: 2, display: "flex", flexDirection: "column", gap: 2 }}>
                        <Grid container spacing={2}>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Product Name"
                                    value={newProduct.product_name}
                                    onChange={(e) => handleAddChange("product_name", e.target.value)}
                                    required
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Category"
                                    value={newProduct.category}
                                    onChange={(e) => handleAddChange("category", e.target.value)}
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Packing Type"
                                    value={newProduct.packing_type}
                                    onChange={(e) => handleAddChange("packing_type", e.target.value)}
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Capacity (Ltr)"
                                    type="number"
                                    value={newProduct.capacity_ltr}
                                    onChange={(e) => handleAddChange("capacity_ltr", parseFloat(e.target.value))}
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Standard Rate"
                                    type="number"
                                    value={newProduct.standard_rate}
                                    onChange={(e) => {
                                        const rat = parseFloat(e.target.value);
                                        setNewProduct(prev => ({
                                            ...prev,
                                            standard_rate: rat,
                                            rate_gujarat: prev.rate_gujarat || rat,
                                            rate_maharashtra: prev.rate_maharashtra || rat,
                                            rate_mp: prev.rate_mp || rat
                                        }));
                                    }}
                                    InputProps={{
                                        startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                                    }}
                                />
                            </Grid>
                        </Grid>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleAddClose}>Cancel</Button>
                    <Button onClick={handleAddSubmit} variant="contained" disabled={saving}>
                        Add Product
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteDialogOpen} onClose={handleDeleteClose}>
                <DialogTitle>Confirm Delete</DialogTitle>
                <DialogContent>
                    <Typography>
                        Are you sure you want to delete this product? This action will mark the product as inactive.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleDeleteClose}>Cancel</Button>
                    <Button onClick={handleDeleteConfirm} color="error" variant="contained" disabled={saving}>
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>
        </Box >
    );
}
