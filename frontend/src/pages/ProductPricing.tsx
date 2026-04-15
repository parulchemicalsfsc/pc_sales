import { useState, useEffect } from "react";
import {
    Box,
    Card,
    CardContent,
    Typography,
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
import { useTranslation } from "../hooks/useTranslation";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

interface Product {
    product_id: number;
    product_name: string;
    packing_type?: string;
    capacity_ltr?: number;
    category?: string;
    standard_rate?: number;
    
    // Dynamic Pricing JSON mapping Region -> Category -> Rate
    custom_rates?: Record<string, Record<string, number>>;
    
    is_active: number;
}

interface PriceState {
    standard_rate?: number;
    custom_rates?: Record<string, Record<string, number>>;
}

export default function ProductPricing() {
    const { user, hasPermission } = useAuth();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [editingPrices, setEditingPrices] = useState<Record<number, PriceState>>({});
    const [editMode, setEditMode] = useState<Record<number, boolean>>({});

    // Dynamic config state for dropdowns
    const [regions, setRegions] = useState<string[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [selectedRegion, setSelectedRegion] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("");

    // Add Dynamic Region/Category state
    const [openAddRegionDialog, setOpenAddRegionDialog] = useState(false);
    const [newRegionName, setNewRegionName] = useState("");
    const [openAddCategoryDialog, setOpenAddCategoryDialog] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState("");

    // Add Product State
    const [openAddDialog, setOpenAddDialog] = useState(false);
    const [newProduct, setNewProduct] = useState<Partial<Product>>({
        product_name: "",
        packing_type: "",
        capacity_ltr: 0,
        category: "",
        standard_rate: 0,
        custom_rates: {},
        is_active: 1
    });

    // Delete Product State
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [productToDelete, setProductToDelete] = useState<number | null>(null);

    useEffect(() => {
        if (user && !hasPermission(PERMISSIONS.MANAGE_PRICING)) {
            setError("Access denied. You need pricing management privileges.");
            setTimeout(() => {
                navigate("/dashboard");
            }, 2000);
        }
    }, [user, navigate, hasPermission]);

    const fetchConfig = async () => {
        try {
            const [regRes, catRes] = await Promise.all([
                axios.get(`${API_BASE_URL}/api/products/config/regions`, { headers: { "x-user-email": user?.email } }),
                axios.get(`${API_BASE_URL}/api/products/config/categories`, { headers: { "x-user-email": user?.email } })
            ]);
            const rData = regRes.data.map((r: any) => r.name);
            const cData = catRes.data.map((c: any) => c.name);
            setRegions(rData);
            setCategories(cData);
            
            if (rData.length > 0 && !selectedRegion) setSelectedRegion(rData[0]);
            if (cData.length > 0 && !selectedCategory) setSelectedCategory(cData[0]);
        } catch (err) {
            console.error("Error fetching config:", err);
        }
    };

    const loadProducts = async () => {
        if (!user || !hasPermission(PERMISSIONS.MANAGE_PRICING)) return;

        try {
            setLoading(true);
            setError(null);

            const response = await axios.get(`${API_BASE_URL}/api/products/all`, {
                headers: { "x-user-email": user.email },
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
            fetchConfig();
            loadProducts();
        }
    }, [user]);

    const handleEdit = (product: Product) => {
        setEditMode({ ...editMode, [product.product_id]: true });

        // Deep copy custom_rates to allow editing
        const customRatesCopy = product.custom_rates ? JSON.parse(JSON.stringify(product.custom_rates)) : {};

        setEditingPrices({
            ...editingPrices,
            [product.product_id]: {
                standard_rate: product.standard_rate || 0,
                custom_rates: customRatesCopy,
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

    const handlePriceChange = (productId: number, val: string) => {
        const numValue = parseFloat(val) || 0;
        
        const currentPrices = editingPrices[productId] || { custom_rates: {} };
        const rates = currentPrices.custom_rates || {};
        
        if (!rates[selectedRegion]) rates[selectedRegion] = {};
        rates[selectedRegion][selectedCategory] = numValue;

        setEditingPrices({
            ...editingPrices,
            [productId]: {
                ...currentPrices,
                custom_rates: rates
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
                { headers: { "x-user-email": user?.email } },
            );

            // Update local state
            setProducts(
                products.map((p) =>
                    p.product_id === product.product_id ? { ...p, ...priceData } : p
                ),
            );

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
        if (saving) return;
        try {
            setSaving(true);
            setError(null);
            setSuccess(null);

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
                { headers: { "x-user-email": user?.email } },
            );

            await loadProducts();
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
            custom_rates: {},
            is_active: 1
        });
        setOpenAddDialog(true);
    };

    const handleAddChange = (field: keyof Product, value: any) => {
        setNewProduct({ ...newProduct, [field]: value });
    };

    const handleAddSubmit = async () => {
        if (saving) return;
        try {
            setSaving(true);
            setError(null);

            if (!newProduct.product_name) {
                setError("Product name is required");
                setSaving(false);
                return;
            }

            await axios.post(`${API_BASE_URL}/api/products/`, newProduct, {
                headers: { "x-user-email": user?.email },
            });

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

    const handleDeleteConfirm = async () => {
        if (!productToDelete || saving) return;
        try {
            setSaving(true);
            setError(null);
            await axios.delete(`${API_BASE_URL}/api/products/${productToDelete}`, {
                headers: { "x-user-email": user?.email },
            });
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

    // Submitting dynamic region/category
    const handleAddRegionSubmit = async () => {
        if (!newRegionName.trim()) return;
        try {
            await axios.post(`${API_BASE_URL}/api/products/config/regions`, { name: newRegionName.trim() }, {
                headers: { "x-user-email": user?.email },
            });
            await fetchConfig();
            setSelectedRegion(newRegionName.trim());
            setOpenAddRegionDialog(false);
            setNewRegionName("");
            setSuccess("Region added successfully");
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            setError(err.response?.data?.detail || "Failed to add region");
        }
    };

    const handleAddCategorySubmit = async () => {
        if (!newCategoryName.trim()) return;
        try {
            await axios.post(`${API_BASE_URL}/api/products/config/categories`, { name: newCategoryName.trim() }, {
                headers: { "x-user-email": user?.email },
            });
            await fetchConfig();
            setSelectedCategory(newCategoryName.trim());
            setOpenAddCategoryDialog(false);
            setNewCategoryName("");
            setSuccess("Category added successfully");
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            setError(err.response?.data?.detail || "Failed to add category");
        }
    };

    if (!user || !hasPermission(PERMISSIONS.MANAGE_PRICING)) {
        return (
            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
                <Alert severity="error">Access denied. You need pricing management privileges.</Alert>
            </Box>
        );
    }

    const hasChanges = Object.keys(editMode).some((key) => editMode[parseInt(key)]);

    return (
        <Box>
            {/* Header */}
            <Box sx={{ mb: 4, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
                        {t("pricing.title", "Product Pricing Management")}
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        {t("pricing.subtitle", "Update default prices for all products in the system")}
                    </Typography>
                </Box>
                <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                    <FormControl size="small" sx={{ minWidth: 160 }}>
                        <InputLabel>{t("pricing.region", "Region")}</InputLabel>
                        <Select
                            value={selectedRegion}
                            label="Region"
                            onChange={(e) => {
                                if (e.target.value === "__add_region__") {
                                    setOpenAddRegionDialog(true);
                                } else {
                                    setSelectedRegion(e.target.value);
                                }
                            }}
                        >
                            {regions.map((region) => (
                                <MenuItem key={region} value={region}>{region}</MenuItem>
                            ))}
                            <MenuItem value="__add_region__" sx={{ fontStyle: "italic", color: "primary.main", borderTop: "1px solid #eee" }}>+ Add Region</MenuItem>
                        </Select>
                    </FormControl>

                    <FormControl size="small" sx={{ minWidth: 160, mr: 2 }}>
                        <InputLabel>{t("pricing.category", "Category")}</InputLabel>
                        <Select
                            value={selectedCategory}
                            label="Category"
                            onChange={(e) => {
                                if (e.target.value === "__add_category__") {
                                    setOpenAddCategoryDialog(true);
                                } else {
                                    setSelectedCategory(e.target.value);
                                }
                            }}
                        >
                            {categories.map((category) => (
                                <MenuItem key={category} value={category}>{category}</MenuItem>
                            ))}
                            <MenuItem value="__add_category__" sx={{ fontStyle: "italic", color: "primary.main", borderTop: "1px solid #eee" }}>+ Add Category</MenuItem>
                        </Select>
                    </FormControl>

                    <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddClick} disabled={saving}>
                        {t("pricing.addProduct", "Add Product")}
                    </Button>
                    <Tooltip title="Refresh">
                        <IconButton onClick={loadProducts} color="primary" disabled={loading}>
                            <RefreshIcon />
                        </IconButton>
                    </Tooltip>
                    {hasChanges && (
                        <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSaveAll} disabled={saving} color="success">
                            {t("pricing.saveAllChanges", "Save All Changes")}
                        </Button>
                    )}
                </Box>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{error}</Alert>}
            {success && <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess(null)}>{success}</Alert>}

            {/* Products Table */}
            <Card>
                <CardContent>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                        {t("pricing.allProducts", "All Products")} ({products.length})
                    </Typography>

                    {loading ? (
                        <TableSkeleton rows={10} columns={7} />
                    ) : (
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 600 }}>{t("pricing.productName", "Product Name")}</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>{t("pricing.packingType", "Packing Type")}</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>{t("pricing.capacityLtr", "Capacity (Ltr)")}</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>{t("pricing.category", "Category")}</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>
                                            Rate ({selectedRegion} - {selectedCategory})
                                        </TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>{t("userMgmt.status", "Status")}</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {products.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                                                <Typography color="text.secondary">No products found</Typography>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        products.map((product) => {
                                            // Determine current displayed price
                                            // Fallback logic: custom rate -> standard rate -> 0
                                            const customRateValue = product.custom_rates?.[selectedRegion]?.[selectedCategory];
                                            const displayPrice = customRateValue !== undefined ? customRateValue : (product.standard_rate || 0);

                                            return (
                                                <TableRow key={product.product_id} hover sx={{ "&:hover": { bgcolor: "action.hover" } }}>
                                                    <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{product.product_name}</Typography></TableCell>
                                                    <TableCell><Typography variant="body2">{product.packing_type || "-"}</Typography></TableCell>
                                                    <TableCell><Typography variant="body2">{product.capacity_ltr || "-"}</Typography></TableCell>
                                                    <TableCell><Typography variant="body2">{product.category || "-"}</Typography></TableCell>

                                                    <TableCell>
                                                        {editMode[product.product_id] ? (
                                                            <TextField
                                                                size="small"
                                                                type="number"
                                                                value={editingPrices[product.product_id]?.custom_rates?.[selectedRegion]?.[selectedCategory] ?? displayPrice}
                                                                onChange={(e) => handlePriceChange(product.product_id, e.target.value)}
                                                                InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                                                                sx={{ width: 100 }}
                                                            />
                                                        ) : (
                                                            <Typography variant="body2">
                                                                ₹{displayPrice.toFixed(2)}
                                                            </Typography>
                                                        )}
                                                    </TableCell>

                                                    <TableCell>
                                                        <Typography variant="caption" sx={{
                                                            px: 1, py: 0.5, borderRadius: 1,
                                                            bgcolor: product.is_active === 1 ? "success.light" : "error.light",
                                                            color: product.is_active === 1 ? "success.dark" : "error.dark",
                                                        }}>
                                                            {product.is_active === 1 ? "Active" : "Inactive"}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell>
                                                        {editMode[product.product_id] ? (
                                                            <Box sx={{ display: "flex", gap: 1 }}>
                                                                <Tooltip title="Save"><IconButton size="small" color="primary" onClick={() => handleSave(product)} disabled={saving}><SaveIcon fontSize="small" /></IconButton></Tooltip>
                                                                <Tooltip title="Cancel"><IconButton size="small" color="error" onClick={() => handleCancel(product.product_id)} disabled={saving}><CancelIcon fontSize="small" /></IconButton></Tooltip>
                                                            </Box>
                                                        ) : (
                                                            <Box sx={{ display: "flex", gap: 1 }}>
                                                                <Tooltip title="Edit Price"><IconButton size="small" color="primary" onClick={() => handleEdit(product)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                                                                <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => handleDeleteClick(product.product_id)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                                                            </Box>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </CardContent>
            </Card>

            {/* Add Region Dialog */}
            <Dialog open={openAddRegionDialog} onClose={() => setOpenAddRegionDialog(false)}>
                <DialogTitle>Add New Region</DialogTitle>
                <DialogContent>
                    <Box sx={{ pt: 1 }}>
                        <TextField fullWidth label="Region Name" value={newRegionName} onChange={(e) => setNewRegionName(e.target.value)} placeholder="e.g., Rajasthan" autoFocus />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenAddRegionDialog(false)}>Cancel</Button>
                    <Button onClick={handleAddRegionSubmit} variant="contained" disabled={!newRegionName.trim()}>Add</Button>
                </DialogActions>
            </Dialog>

            {/* Add Category Dialog */}
            <Dialog open={openAddCategoryDialog} onClose={() => setOpenAddCategoryDialog(false)}>
                <DialogTitle>Add New Category</DialogTitle>
                <DialogContent>
                    <Box sx={{ pt: 1 }}>
                        <TextField fullWidth label="Category Name" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="e.g., Wholesaler" autoFocus />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenAddCategoryDialog(false)}>Cancel</Button>
                    <Button onClick={handleAddCategorySubmit} variant="contained" disabled={!newCategoryName.trim()}>Add</Button>
                </DialogActions>
            </Dialog>

            {/* Add Product Dialog */}
            <Dialog open={openAddDialog} onClose={() => setOpenAddDialog(false)} maxWidth="md" fullWidth>
                <DialogTitle>Add New Product</DialogTitle>
                <DialogContent>
                    <Box sx={{ pt: 2, display: "flex", flexDirection: "column", gap: 2 }}>
                        <Grid container spacing={2}>
                            <Grid item xs={12} md={6}><TextField fullWidth label="Product Name" value={newProduct.product_name} onChange={(e) => handleAddChange("product_name", e.target.value)} required /></Grid>
                            <Grid item xs={12} md={6}><TextField fullWidth label="Category" value={newProduct.category} onChange={(e) => handleAddChange("category", e.target.value)} /></Grid>
                            <Grid item xs={12} md={6}><TextField fullWidth label="Packing Type" value={newProduct.packing_type} onChange={(e) => handleAddChange("packing_type", e.target.value)} /></Grid>
                            <Grid item xs={12} md={6}><TextField fullWidth label="Capacity (Ltr)" type="number" value={newProduct.capacity_ltr} onChange={(e) => handleAddChange("capacity_ltr", parseFloat(e.target.value))} /></Grid>
                            <Grid item xs={12} md={6}><TextField fullWidth label="Standard Rate" type="number" value={newProduct.standard_rate} onChange={(e) => { const rat = parseFloat(e.target.value); setNewProduct(prev => ({ ...prev, standard_rate: rat })); }} InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} /></Grid>
                        </Grid>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenAddDialog(false)}>Cancel</Button>
                    <Button onClick={handleAddSubmit} variant="contained" disabled={saving}>Add Product</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
                <DialogTitle>Confirm Delete</DialogTitle>
                <DialogContent><Typography>Are you sure you want to delete this product? This action will mark it as inactive.</Typography></DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleDeleteConfirm} color="error" variant="contained" disabled={saving}>Delete</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
