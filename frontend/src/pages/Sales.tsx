import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Typography,
  Grid,
  MenuItem,
  Alert,
  CircularProgress,
  Chip,
  IconButton,
  Divider,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
  InputAdornment,
  useMediaQuery,
  useTheme,
  Menu,
  Autocomplete,
  Checkbox,
} from "@mui/material";
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ShoppingCart as ShoppingCartIcon,
  Receipt as ReceiptIcon,
  Refresh as RefreshIcon,
  PersonAdd as PersonAddIcon,
  People as PeopleIcon,
  Download as DownloadIcon,
  Search as SearchIcon,
  MoreVert as MoreVertIcon,
  Edit as EditIcon,
  Description as NoteIcon,
} from "@mui/icons-material";
import { TableSkeleton } from "../components/Skeletons";
import NotesDialog from "../components/NotesDialog";
import AddNoteDialog from "../components/AddNoteDialog";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import { salesAPI, customerAPI, productAPI, distributorAPI, doctorAPI, shopkeeperAPI, apiClient, notesAPI, telecallerOrderAPI } from "../services/api";
import type { Sale, Customer, Product, SaleItem, TelecallerOrder, TelecallerOrderItem } from "../types";

import { useTranslation } from "../hooks/useTranslation";
import PermissionGate from "../components/PermissionGate";
import { PERMISSIONS } from "../config/permissions";
import { useAuth } from "../contexts/AuthContext";

export default function Sales() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { t, tf } = useTranslation();
  const { hasPermission, role } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [distributors, setDistributors] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [shopkeepers, setShopkeepers] = useState<any[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [buyerTypeFilter, setBuyerTypeFilter] = useState<string>("all");
  const [openDialog, setOpenDialog] = useState(false);
  const [customerMode, setCustomerMode] = useState<"existing" | "new">(
    "existing",
  );
  const [customerCategory, setCustomerCategory] = useState("Sabhasad");
  const [formData, setFormData] = useState({
    customer_id: 0,
    invoice_no: "",
    sale_date: new Date().toISOString().split("T")[0],
    notes: "",
    paid_amount: 0,
  });
  const [newCustomerData, setNewCustomerData] = useState({
    name: "",
    mobile: "",
    village: "",
    taluka: "",
    district: "",
    state: "Gujarat",
    adhar_no: "",
    status: "Active",
  });
  const [items, setItems] = useState<Partial<SaleItem>[]>([
    { product_id: 0, quantity: 1, rate: 0, amount: 0 },
  ]);
  const [paymentTerms, setPaymentTerms] = useState({
    type: 'after_delivery' as 'advance' | 'after_delivery' | 'after_days' | 'emi' | 'on_delivery',
    days: 0,
    emiParts: [
      { part: 1, days: 0, percentage: 25 },
      { part: 2, days: 0, percentage: 25 },
      { part: 3, days: 0, percentage: 25 },
      { part: 4, days: 0, percentage: 25 },
    ],
  });

  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedActionSale, setSelectedActionSale] = useState<Sale | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [editingSaleId, setEditingSaleId] = useState<number | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<{ name: string; village: string; mobile: string } | null>(null);
  // sale_id → 'credit' | 'debit' (only the latest active note per sale stored)
  const [saleNoteTypeMap, setSaleNoteTypeMap] = useState<Record<number, "credit" | "debit" | "both">>({});
  const [noteFilter, setNoteFilter] = useState<"all" | "credit" | "debit" | "none">("all");
  const [refundDueOnly, setRefundDueOnly] = useState(false);
  const [addNoteOpen, setAddNoteOpen] = useState(false);

  // Telecaller Orders Dialog
  const [telecallerOrdersDialogOpen, setTelecallerOrdersDialogOpen] = useState(false);
  const [telecallerOrders, setTelecallerOrders] = useState<TelecallerOrder[]>([]);
  const [telecallerOrdersLoading, setTelecallerOrdersLoading] = useState(false);
  const [tcOrderDateFilter, setTcOrderDateFilter] = useState<string>("");
  const [tcOrderTelecallerFilter, setTcOrderTelecallerFilter] = useState<string>("");

  const [selectedTelecallerOrders, setSelectedTelecallerOrders] = useState<Set<number>>(new Set());

  // Telecaller Order Filters - Cascading dropdowns
  const [tcOrderStateFilter, setTcOrderStateFilter] = useState<string>("");
  const [tcOrderDistrictFilter, setTcOrderDistrictFilter] = useState<string>("");
  const [tcOrderTalukaFilter, setTcOrderTalukaFilter] = useState<string>("");
  const [tcOrderVillageFilter, setTcOrderVillageFilter] = useState<string>("");
  const [locationsHierarchy, setLocationsHierarchy] = useState<any>({});

  const tcOrderLocations = useMemo(() => {
    const states = Object.keys(locationsHierarchy || {}).sort();
    const districts = new Set<string>();
    const talukas = new Set<string>();
    const villages = new Set<string>();
    
    const stateToDistrictsArr: Record<string, string[]> = {};
    const districtToTalukasArr: Record<string, string[]> = {};
    const talukaToVillagesArr: Record<string, string[]> = {};

    for (const st of states) {
      const distMap = locationsHierarchy[st] || {};
      const distsForState = Object.keys(distMap).sort();
      stateToDistrictsArr[st] = distsForState;
      
      for (const d of distsForState) {
        districts.add(d);
        const talukaMap = distMap[d] || {};
        const talukasForDist = Object.keys(talukaMap).sort();
        districtToTalukasArr[d] = talukasForDist;
        
        for (const t of talukasForDist) {
          talukas.add(t);
          const villsForTaluka = talukaMap[t] || [];
          talukaToVillagesArr[t] = villsForTaluka;
          
          for (const v of villsForTaluka) {
            villages.add(v);
          }
        }
      }
    }

    return {
      states,
      districts: Array.from(districts).sort(),
      talukas: Array.from(talukas).sort(),
      villages: Array.from(villages).sort(),
      stateToDistricts: stateToDistrictsArr,
      districtToTalukas: districtToTalukasArr,
      talukaToVillages: talukaToVillagesArr,
    };
  }, [locationsHierarchy]);
    


  // Toast
  const [toast, setToast] = useState<{ msg: string; sev: "success" | "error" | "info" | "warning" } | null>(null);


  // Pre-Sale Workflow
  const [saleTab, setSaleTab] = useState<"pre_sales" | "confirmed">("confirmed");
  const [selectedRowIds, setSelectedRowIds] = useState<number[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [mergedTelecallerOrderIds, setMergedTelecallerOrderIds] = useState<number[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  // Check router state from CallingList "Take Order" navigation
  const takeOrderHandled = useRef(false);
  useEffect(() => {
    const state = location.state as any;
    const dataLoaded = distributors.length > 0 || customers.length > 0;
    if (state?.openNewSale && dataLoaded && !openDialog && !takeOrderHandled.current) {
      takeOrderHandled.current = true;
      handleOpenDialog();

      const buyerType = state.buyerType || "Sabhasad";

      if (buyerType === "Mantri" && state.distributorId) {
        // Set category to Mantri and find the distributor
        setCustomerCategory("Mantri");
        setFormData(prev => ({ ...prev, customer_id: state.distributorId }));

        // Find in distributors array, or fall back to passed entity data
        const dist = distributors.find(d => d.distributor_id === state.distributorId);
        setSelectedEntity({
          name: dist?.mantri_name || dist?.name || state.entityName || "",
          village: dist?.village || state.entityVillage || "",
          mobile: dist?.mantri_mobile || dist?.mobile || state.entityMobile || "",
        });
      } else if (state.customerId) {
        setCustomerCategory("Sabhasad");
        setFormData(prev => ({ ...prev, customer_id: state.customerId }));
        const cust = customers.find(c => c.customer_id === state.customerId);
        if (cust) {
          setSelectedEntity({ name: cust.name || '', village: cust.village || '', mobile: cust.mobile || '' });
        }
      }
      // clear the state so it doesn't reopen on refresh
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, customers, distributors, openDialog, navigate]);


  const loadData = async (background = false) => {
    try {
      if (!background) setLoading(true);
      setError(null);

      // Load each independently — a 403 on products shouldn't block the sales list
      const [salesResult, customersResult, productsResult, distributorsResult, doctorsResult, shopkeepersResult, regionsResult, locationsResult] = await Promise.allSettled([
        salesAPI.getAll({ limit: 1000 }),
        customerAPI.getAll({ limit: 1000 }),
        productAPI.getAll(),
        distributorAPI.getAll({ limit: 1000 }),
        doctorAPI.getAll({ limit: 1000 }),
        shopkeeperAPI.getAll({ limit: 1000 }),
        apiClient.get("/api/products/config/regions"),
        apiClient.get("/api/automation/locations"),
      ]);

      if (salesResult.status === "fulfilled") {
        setSales(salesResult.value);
      } else {
        console.error("Error loading sales:", salesResult.reason);
        setError(salesResult.reason?.response?.data?.detail || salesResult.reason?.message || t("messages.error"));
      }

      // Load notes to build the noteTypeMap for filtering
      try {
        const allNotes = await notesAPI.getAll({ status: "active", limit: 500 });
        const map: Record<number, "credit" | "debit" | "both"> = {};
        for (const n of allNotes) {
          const sid: number = n.sale_id;
          if (!map[sid]) {
            map[sid] = n.note_type as "credit" | "debit";
          } else if (map[sid] !== n.note_type) {
            map[sid] = "both";
          }
        }
        setSaleNoteTypeMap(map);
      } catch (e) {
        console.warn("Could not load notes map:", e);
      }

      if (customersResult.status === "fulfilled") {
        const cd = customersResult.value;
        setCustomers(Array.isArray(cd) ? cd : (cd?.data || []));
      } else {
        console.warn("Could not load customers:", customersResult.reason?.message);
      }

      if (productsResult.status === "fulfilled") {
        setProducts(productsResult.value);
      } else {
        console.warn("Could not load products (user may lack view_products permission):", productsResult.reason?.message);
      }
      if (distributorsResult.status === "fulfilled") {
        const distData = distributorsResult.value;
        setDistributors(Array.isArray(distData) ? distData : (distData?.data || []));
      } else {
        console.warn("Could not load distributors:", distributorsResult.reason?.message);
      }
      if (doctorsResult.status === "fulfilled") {
        const docData = doctorsResult.value;
        setDoctors(Array.isArray(docData) ? docData : (docData?.data || []));
      } else {
        console.warn("Could not load doctors:", doctorsResult.reason?.message);
      }
      if (shopkeepersResult.status === "fulfilled") {
        const skData = shopkeepersResult.value;
        setShopkeepers(Array.isArray(skData) ? skData : (skData?.data || []));
      } else {
        console.warn("Could not load shopkeepers:", shopkeepersResult.reason?.message);
      }
      if (regionsResult.status === "fulfilled") {
        const rNames = (regionsResult.value.data || []).map((r: any) => r.name);
        setRegions(rNames);
      } else {
        console.warn("Could not load regions:", regionsResult.reason?.message);
      }
      if (locationsResult.status === "fulfilled") {
        setLocationsHierarchy(locationsResult.value.data || {});
      } else {
        console.warn("Could not load global locations:", locationsResult.reason?.message);
      }
    } catch (err: any) {
      console.error("Error loading sales data:", err);
      const errorMessage =
        err?.response?.data?.detail || err?.message || t("messages.error");
      setError(errorMessage);
    } finally {
      if (!background) setLoading(false);
    }
  };

  // Telecaller Orders functions
  const loadTelecallerOrders = async () => {
    try {
      setTelecallerOrdersLoading(true);
      const data = await telecallerOrderAPI.getPending();
      setTelecallerOrders(data || []);
      
      // Locations are globally pre-computed using useMemo to always provide all options
    } catch (err: any) {
      console.error("Error loading telecaller orders:", err);
      const errorMessage = err?.response?.data?.detail || err?.message || "Failed to load telecaller orders";
      setError(errorMessage);
    } finally {
      setTelecallerOrdersLoading(false);
    }
  };

  const toggleTelecallerOrderSelection = (orderId: number) => {
    setSelectedTelecallerOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const toggleSelectAllTelecallerOrders = () => {
    if (selectedTelecallerOrders.size === telecallerOrders.length) {
      setSelectedTelecallerOrders(new Set());
    } else {
      const ids = telecallerOrders.map(o => o.order_id).filter((id): id is number => id !== undefined);
      setSelectedTelecallerOrders(new Set(ids));
    }
  };

  const handleBulkTelecallerApprove = async () => {
    if (selectedTelecallerOrders.size === 0) return;
    
    // 1. Gather selected orders
    const orders = telecallerOrders.filter(o => o.order_id && selectedTelecallerOrders.has(o.order_id));
    
    // 2. Aggregate products
    const productMap = new Map<number, any>();
    orders.forEach(order => {
      let prods: any[] = [];
      try {
        prods = order.products_json ? JSON.parse(order.products_json as string) : (order.products || []);
      } catch (e) {
        prods = order.products || [];
      }
      prods.forEach(p => {
        if (!p.product_id) return;
        if (productMap.has(p.product_id)) {
          const existing = productMap.get(p.product_id)!;
          existing.quantity += Number(p.quantity) || 0;
          existing.amount += Number(p.amount) || 0;
        } else {
          productMap.set(p.product_id, {
            product_id: p.product_id,
            quantity: Number(p.quantity) || 0,
            rate: Number(p.rate) || 0,
            amount: Number(p.amount) || 0,
          });
        }
      });
    });
    
    const aggregatedItems = Array.from(productMap.values());
    if (aggregatedItems.length === 0) {
      aggregatedItems.push({ product_id: 0, quantity: 1, rate: 0, amount: 0 });
    }
    
    // 3. Find if all share the same village
    let commonVillage: string | null = null;
    let allSameVillage = true;
    for (const order of orders) {
      const v = order.customer_village || "";
      if (commonVillage === null) {
        commonVillage = v;
      } else if (commonVillage.toLowerCase() !== v.toLowerCase()) {
        allSameVillage = false;
        break;
      }
    }
    
    // 4. Try to find exactly one Mantri for that village
    let prefilledMantriId: number = 0;
    let prefilledEntity: any = null;
    
    if (allSameVillage && commonVillage) {
      const matchingMantris = distributors.filter(d => (d.village || "").toLowerCase() === commonVillage!.toLowerCase());
      if (matchingMantris.length === 1) {
        const mantri = matchingMantris[0];
        prefilledMantriId = mantri.distributor_id;
        prefilledEntity = {
          name: mantri.mantri_name || mantri.name || "",
          village: mantri.village || "",
          mobile: mantri.mantri_mobile || mantri.mobile || "",
        };
      }
    }
    
    // 5. Open dialog and pre-fill
    setTelecallerOrdersDialogOpen(false);
    setSaleTab("pre_sales");
    setCustomerCategory("Mantri");
    setCustomerMode("existing");
    setFormData({
      customer_id: prefilledMantriId,
      invoice_no: "",
      sale_date: new Date().toISOString().split("T")[0],
      notes: "Merged from Telecaller Orders",
      paid_amount: 0,
    });
    setSelectedEntity(prefilledEntity);
    setItems(aggregatedItems);
    setMergedTelecallerOrderIds(Array.from(selectedTelecallerOrders));
    setOpenDialog(true);
    setSelectedTelecallerOrders(new Set());
  };

  const handleBulkTelecallerReject = async () => {
    if (selectedTelecallerOrders.size === 0) return;
    const reason = window.prompt("Enter rejection reason for all selected orders:");
    if (!reason || !reason.trim()) return;
    try {
      setTelecallerOrdersLoading(true);
      for (const orderId of selectedTelecallerOrders) {
        await telecallerOrderAPI.reject(orderId, reason.trim());
      }
      setToast({ msg: `${selectedTelecallerOrders.size} order(s) rejected`, sev: "success" });
      setSelectedTelecallerOrders(new Set());
      loadTelecallerOrders();
    } catch (err: any) {
      const errorMessage = err?.response?.data?.detail || err?.message || "Failed to reject orders";
      setToast({ msg: errorMessage, sev: "error" });
    } finally {
      setTelecallerOrdersLoading(false);
    }
  };

  const handleTelecallerApprove = async (orderId: number) => {
    try {
      setTelecallerOrdersLoading(true);
      await telecallerOrderAPI.approve(orderId);
      setToast({ msg: "Order approved successfully", sev: "success" });
      loadTelecallerOrders();
      loadData(true); // Refresh sales list in background
    } catch (err: any) {
      const errorMessage = err?.response?.data?.detail || err?.message || "Failed to approve order";
      setToast({ msg: errorMessage, sev: "error" });
    } finally {
      setTelecallerOrdersLoading(false);
    }
  };

  const handleTelecallerReject = async (orderId: number) => {
    const reason = window.prompt("Enter rejection reason:");
    if (!reason || !reason.trim()) return;
    try {
      setTelecallerOrdersLoading(true);
      await telecallerOrderAPI.reject(orderId, reason.trim());
      setToast({ msg: "Order rejected", sev: "success" });
      loadTelecallerOrders();
    } catch (err: any) {
      const errorMessage = err?.response?.data?.detail || err?.message || "Failed to reject order";
      setToast({ msg: errorMessage, sev: "error" });
    } finally {
      setTelecallerOrdersLoading(false);
    }
  };

  const openTelecallerOrdersDialog = () => {
    setTelecallerOrdersDialogOpen(true);
    loadTelecallerOrders();
  };

  const fetchDropdownData = async () => {
    try {
      const [customersResult, distributorsResult, doctorsResult, shopkeepersResult, regionsResult] = await Promise.allSettled([
        customerAPI.getAll({ limit: 1000 }),
        distributorAPI.getAll({ limit: 1000 }),
        doctorAPI.getAll({ limit: 1000 }),
        shopkeeperAPI.getAll({ limit: 1000 }),
        apiClient.get("/api/products/config/regions"),
      ]);
      if (customersResult.status === "fulfilled") {
        const cd = customersResult.value;
        setCustomers(Array.isArray(cd) ? cd : (cd?.data || []));
      }
      if (distributorsResult.status === "fulfilled") {
        const distData = distributorsResult.value;
        setDistributors(Array.isArray(distData) ? distData : (distData?.data || []));
      }
      if (doctorsResult.status === "fulfilled") {
        const docData = doctorsResult.value;
        setDoctors(Array.isArray(docData) ? docData : (docData?.data || []));
      }
      if (shopkeepersResult.status === "fulfilled") {
        const skData = shopkeepersResult.value;
        setShopkeepers(Array.isArray(skData) ? skData : (skData?.data || []));
      }
      if (regionsResult.status === "fulfilled") {
        const rNames = (regionsResult.value.data || []).map((r: any) => r.name);
        setRegions(rNames);
      }
    } catch (e) {
      console.warn("Background fetch failed", e);
    }
  };

  const handleOpenDialog = () => {
    fetchDropdownData(); // Fire and forget
    setEditingSaleId(null);
    setFormData({
      customer_id: 0,
      invoice_no: "",
      sale_date: new Date().toISOString().split("T")[0],
      notes: "",
      paid_amount: 0,
    });
    setNewCustomerData({
      name: "",
      mobile: "",
      village: "",
      taluka: "",
      district: "",
      state: regions.includes("Gujarat") ? "Gujarat" : (regions[0] || "Gujarat"),
      adhar_no: "",
      status: "Active",
    });
    setCustomerMode("existing");
    setCustomerCategory("Sabhasad");
    setSelectedEntity(null);
    setItems([{ product_id: 0, quantity: 1, rate: 0, amount: 0 }]);
    setPaymentTerms({
      type: 'after_delivery',
      days: 0,
      emiParts: [
        { part: 1, days: 0, percentage: 25 },
        { part: 2, days: 0, percentage: 25 },
        { part: 3, days: 0, percentage: 25 },
        { part: 4, days: 0, percentage: 25 },
      ],
    });
    setOpenDialog(true);
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, sale: Sale) => {
    setMenuAnchor(event.currentTarget);
    setSelectedActionSale(sale);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    // Do not clear selectedActionSale here, keep it for dialogs
  };

  const handleDeleteClick = () => {
    handleMenuClose();
    // Use timeout to prevent MUI Dialog and Menu focus trap race conditions (aria-hidden error)
    setTimeout(() => {
      setDeleteConfirmOpen(true);
    }, 10);
  };

  const confirmDeleteSale = async () => {
    if (!selectedActionSale) return;
    try {
      await salesAPI.delete(selectedActionSale.sale_id || 0);
      setDeleteConfirmOpen(false);
      setSelectedActionSale(null);
      loadData(true);
    } catch (err: any) {
      console.error("Error deleting sale:", err);
      setError(err?.response?.data?.detail || "Failed to delete sale");
    }
  };

  const handleEditClick = () => {
    if (!selectedActionSale) return;
    const saleId = selectedActionSale.sale_id || 0;
    handleMenuClose();

    // Use timeout to prevent MUI Dialog and Menu focus trap race conditions
    setTimeout(async () => {
      fetchDropdownData(); // refresh dropdown items in background
      try {
        setLoading(true);
        // Fetch full sale details to get items
        const responseData = await salesAPI.getById(saleId);
        const sale = responseData.sale;
        const fetchedItems = responseData.items;

        setEditingSaleId(saleId);
        setCustomerMode("existing");

        // ── Map buyer_type → customerCategory ──────────────────────────
        const buyerType: string = sale?.buyer_type || "customer";
        const categoryMap: Record<string, string> = {
          mantri:       "Mantri",
          distributor:  "Mantri",   // distributors share the Mantri dropdown
          doctor:       "Doctor",
          shopkeeper:   "Shopkeeper",
          field_officer: "Field Officer",
          customer:     "Sabhasad",
        };
        const resolvedCategory = categoryMap[buyerType] ?? "Sabhasad";
        setCustomerCategory(resolvedCategory);

        // ── Resolve the entity ID for the Autocomplete ─────────────────
        // formData.customer_id stores the lookup ID regardless of entity type
        let entityId = 0;
        if (buyerType === "mantri" || buyerType === "distributor") {
          entityId = sale?.distributor_id || 0;
        } else if (buyerType === "doctor") {
          entityId = sale?.doctor_id || 0;
        } else if (buyerType === "shopkeeper") {
          entityId = sale?.shopkeeper_id || 0;
        } else {
          entityId = sale?.customer_id || 0;
        }

        // Safe Date Parsing
        let safeDateString = new Date().toISOString().split("T")[0];
        if (sale && sale.sale_date) {
          const d = new Date(sale.sale_date);
          if (!isNaN(d.getTime())) {
            safeDateString = d.toISOString().split("T")[0];
          } else if (typeof sale.sale_date === 'string' && sale.sale_date.length >= 10) {
            safeDateString = sale.sale_date.substring(0, 10);
          }
        }

        setFormData({
          customer_id: entityId,
          invoice_no: (sale && sale.invoice_no) ? sale.invoice_no : "",
          sale_date: safeDateString,
          notes: (sale && sale.notes) ? sale.notes : "",
          paid_amount: 0,
        });

        if (sale && sale.payment_terms) {
          try {
            const terms = JSON.parse(sale.payment_terms);
            setPaymentTerms(prev => ({ ...prev, ...terms }));
          } catch (e) { }
        }

        if (fetchedItems && fetchedItems.length > 0) {
          setItems(fetchedItems.map((item: any) => ({
            product_id: item.product_id,
            quantity: item.quantity,
            rate: item.rate,
            amount: item.amount,
          })));
        } else {
          setItems([{ product_id: 0, quantity: 1, rate: 0, amount: 0 }]);
        }

        // ── Pre-resolve selectedEntity from the loaded lists ────────────
        // Gives the Autocomplete something to display immediately
        let resolvedEntity: { name: string; village: string; mobile: string } | null = null;

        if ((buyerType === "mantri" || buyerType === "distributor") && entityId) {
          const dist = distributors.find((d: any) => d.distributor_id === entityId);
          if (dist) {
            resolvedEntity = {
              name: dist.mantri_name || dist.name || "",
              village: dist.village || "",
              mobile: dist.mantri_mobile || dist.mobile || "",
            };
          }
        } else if (buyerType === "doctor" && entityId) {
          const doc = doctors.find((d: any) => d.doctor_id === entityId);
          if (doc) {
            resolvedEntity = { name: doc.name || "", village: doc.village || "", mobile: doc.mobile || doc.mantri_mobile || "" };
          }
        } else if (buyerType === "shopkeeper" && entityId) {
          const sk = shopkeepers.find((s: any) => s.shopkeeper_id === entityId);
          if (sk) {
            resolvedEntity = { name: sk.name || "", village: sk.village || "", mobile: sk.mobile || sk.mantri_mobile || "" };
          }
        } else if (entityId) {
          const cust = customers.find((c: any) => c.customer_id === entityId);
          if (cust) {
            resolvedEntity = { name: cust.name || "", village: cust.village || "", mobile: cust.mobile || "" };
          }
        }
        setSelectedEntity(resolvedEntity);

        setOpenDialog(true);
      } catch (err: any) {
        console.error("Error fetching sale details:", err);
        setError(err?.response?.data?.detail || "Failed to load sale details");
      } finally {
        setLoading(false);
      }
    }, 10);
  };


  const handleCloseDialog = () => {
    setOpenDialog(false);
    setMergedTelecallerOrderIds([]);
  };

  const handleAddItem = () => {
    setItems([...items, { product_id: 0, quantity: 1, rate: 0, amount: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };

    // Auto-fill rate from product with region and category logic
    if (field === "product_id" || field === "quantity" || field === "rate") {
      const product = products.find((p) => p.product_id === newItems[index].product_id);
      if (product && field === "product_id") {
        // Determine rate based on customer state
        let rate = product.standard_rate || 0;
        let customerState = "Gujarat";

        if (customerMode === "existing") {
          const selectedCustomer = customers.find(c => c.customer_id === formData.customer_id);
          if (selectedCustomer?.state) {
            customerState = selectedCustomer.state;
          }
        } else {
          customerState = newCustomerData.state || "Gujarat";
        }

        // Apply region and category rate
        const customRate = product.custom_rates?.[customerState]?.[customerCategory];
        
        const rKey = customerState === "Madhya Pradesh" ? "mp" : customerState.toLowerCase();
        const catKey = customerCategory.toLowerCase().replace(" ", "_");
        const priceField = `rate_${rKey}_${catKey}` as keyof Product;
        const baseField = `rate_${rKey}` as keyof Product;

        rate = customRate !== undefined ? customRate : ((product[priceField] as number) || (product[baseField] as number) || product.standard_rate || 0);

        newItems[index].rate = rate;
      }

      newItems[index].amount = (newItems[index].quantity || 0) * (newItems[index].rate || 0);
    }

    setItems(newItems);
  };

  const recalculateRates = (newCategory: string, newCustomerMode: string, customerId: number, newState: string) => {
    let customerState = "Gujarat";
    if (newCustomerMode === "existing") {
      const selectedCustomer = customers.find(c => c.customer_id === customerId);
      if (selectedCustomer?.state) {
        customerState = selectedCustomer.state;
      }
    } else {
      customerState = newState || "Gujarat";
    }

    const rKey = customerState === "Madhya Pradesh" ? "mp" : customerState.toLowerCase();
    const catKey = newCategory.toLowerCase().replace(" ", "_");
    const priceField = `rate_${rKey}_${catKey}` as keyof Product;
    const baseField = `rate_${rKey}` as keyof Product;

    const updatedItems = items.map(item => {
      if (!item.product_id) return item;
      const product = products.find(p => p.product_id === item.product_id);
      if (!product) return item;

      const itemCustomRate = product.custom_rates?.[customerState]?.[newCategory];
      const rate = itemCustomRate !== undefined ? itemCustomRate : ((product[priceField] as number) || (product[baseField] as number) || product.standard_rate || 0);
      return {
        ...item,
        rate,
        amount: (item.quantity || 0) * rate
      };
    });
    setItems(updatedItems);
  };


  // Build the entity options list based on selected category
  const getEntityOptions = () => {
    if (customerCategory === "Mantri") {
      return distributors
        .filter((d: any) => d.mantri_name || d.name)
        .map((d: any) => {
          const mName = d.mantri_name || d.name || 'Unknown';
          const mMobile = d.mantri_mobile || d.mobile || '';
          return {
            id: d.distributor_id,
            label: `${mName}${mMobile ? ` (${mMobile})` : ''}${d.village ? ` - ${d.village}` : ''}`,
            name: mName,
            village: d.village || '',
            mobile: mMobile,
          };
        });
    } else if (customerCategory === "Doctor") {
      return doctors.map((d: any) => ({
        id: d.doctor_id,
        label: `${d.name || 'Unknown'}${d.village ? ` - ${d.village}` : ''}${d.mobile ? ` (${d.mobile})` : ''}`,
        name: d.name || '',
        village: d.village || '',
        mobile: d.mobile || '',
        entity_type: 'doctor',
      }));
    } else if (customerCategory === "Shopkeeper") {
      return shopkeepers.map((s: any) => ({
        id: s.shopkeeper_id,
        label: `${s.name || 'Unknown'}${s.village ? ` - ${s.village}` : ''}${s.mobile ? ` (${s.mobile})` : ''}`,
        name: s.name || '',
        village: s.village || '',
        mobile: s.mobile || '',
        entity_type: 'shopkeeper',
      }));
    } else {
      // Sabhasad, Field Officer
      return customers.map((c) => ({
        id: c.customer_id,
        label: `${c.name}${c.village ? ` - ${c.village}` : ''}${c.mobile ? ` (${c.mobile})` : ''}`,
        name: c.name,
        village: c.village || '',
        mobile: c.mobile || '',
      }));
    }
  };

  // Get human-readable label for each category
  const getCategoryLabel = () => {
    switch (customerCategory) {
      case "Mantri": return "Mantri";
      case "Doctor": return "Doctor";
      case "Shopkeeper": return "Shopkeeper";
      case "Field Officer": return "Field Officer";
      default: return "Sabhasad";
    }
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      let customerId = formData.customer_id;

      // If new customer mode, create customer first
      if (customerMode === "new") {
        // Validate new customer data
        if (
          !newCustomerData.name ||
          !newCustomerData.mobile ||
          !newCustomerData.village ||
          !newCustomerData.taluka ||
          !newCustomerData.district
        ) {
          setError(
            t(
              "sales.allFieldsRequired",
              "Customer Name, Mobile, Village, Taluka, and District are mandatory.",
            ),
          );
          return;
        }

        // Create new customer or distributor
        try {
          // CHECK FOR DUPLICATE FIRST
          let isDuplicate = false;
          let duplicateEntityName = "";
          let duplicateEntityId = 0;
          let duplicateEntityVillage = "";

          const isDistributorCategory = customerCategory === "Mantri";
          const isDoctorCategory = customerCategory === "Doctor";
          const isShopkeeperCategory = customerCategory === "Shopkeeper";

          if (isDistributorCategory) {
            const existingDistributor = distributors.find(d => {
                const nameMatch = (d.mantri_name || "").toLowerCase().trim() === newCustomerData.name.toLowerCase().trim();
                const mobileMatch = d.mantri_mobile === newCustomerData.mobile || d.mobile === newCustomerData.mobile;
                const villageMatch = (d.village || "").toLowerCase().trim() === (newCustomerData.village || "").toLowerCase().trim();
                return nameMatch && mobileMatch && villageMatch;
            });
            if (existingDistributor) {
                isDuplicate = true;
                duplicateEntityName = existingDistributor.mantri_name || "";
                duplicateEntityVillage = existingDistributor.village || "";
                duplicateEntityId = existingDistributor.distributor_id || 0;
            }
          } else if (isDoctorCategory) {
            const existingDoctor = doctors.find(d =>
              (d.name || "").toLowerCase().trim() === newCustomerData.name.toLowerCase().trim() &&
              d.mobile === newCustomerData.mobile
            );
            if (existingDoctor) {
                isDuplicate = true;
                duplicateEntityName = existingDoctor.name || "";
                duplicateEntityVillage = existingDoctor.village || "";
                duplicateEntityId = existingDoctor.doctor_id || 0;
            }
          } else if (isShopkeeperCategory) {
            const existingShopkeeper = shopkeepers.find(s =>
              (s.name || "").toLowerCase().trim() === newCustomerData.name.toLowerCase().trim() &&
              s.mobile === newCustomerData.mobile
            );
            if (existingShopkeeper) {
                isDuplicate = true;
                duplicateEntityName = existingShopkeeper.name || "";
                duplicateEntityVillage = existingShopkeeper.village || "";
                duplicateEntityId = existingShopkeeper.shopkeeper_id || 0;
            }
          } else {
            const existingCustomer = customers.find(
              c =>
                c.mobile === newCustomerData.mobile &&
                c.name.toLowerCase().trim() === newCustomerData.name.toLowerCase().trim() &&
                (c.village || "").toLowerCase().trim() === (newCustomerData.village || "").toLowerCase().trim()
            );
            if (existingCustomer) {
                isDuplicate = true;
                duplicateEntityName = existingCustomer.name || "";
                duplicateEntityVillage = existingCustomer.village || "";
                duplicateEntityId = existingCustomer.customer_id || 0;
            }
          }

          if (isDuplicate) {
            customerId = duplicateEntityId;
            console.log(`Duplicate ${getCategoryLabel()} found, using existing: ` + duplicateEntityName);
            if (!window.confirm(
              `${getCategoryLabel()} "${duplicateEntityName || 'Unknown'}" from ${duplicateEntityVillage || 'N/A'} with mobile ${newCustomerData.mobile} already exists. Use existing ${getCategoryLabel()}?`
            )) {
              return;
            }
          } else {
            if (isDistributorCategory) {
              const newDistributorData = {
                mantri_name: newCustomerData.name,
                mantri_mobile: newCustomerData.mobile,
                village: newCustomerData.village,
                taluka: newCustomerData.taluka,
                district: newCustomerData.district,
                state: newCustomerData.state,
                status: newCustomerData.status
              };
              const newDist = await distributorAPI.create(newDistributorData);
              customerId = newDist.distributor?.distributor_id || newDist.data?.distributor_id || newDist.distributor_id || 0;
              const distData = await distributorAPI.getAll({ limit: 1000 });
              setDistributors(Array.isArray(distData) ? distData : (distData?.data || []));
            } else if (isDoctorCategory) {
              const newDoctorData = {
                name: newCustomerData.name,
                mobile: newCustomerData.mobile,
                village: newCustomerData.village,
                taluka: newCustomerData.taluka,
                district: newCustomerData.district,
                state: newCustomerData.state,
                status: newCustomerData.status
              };
              const newDoc = await doctorAPI.create(newDoctorData);
              customerId = newDoc.doctor?.doctor_id || newDoc.data?.doctor_id || newDoc.doctor_id || 0;
              const docData = await doctorAPI.getAll({ limit: 1000 });
              setDoctors(Array.isArray(docData) ? docData : (docData?.data || []));
            } else if (isShopkeeperCategory) {
              const newShopkeeperData = {
                name: newCustomerData.name,
                mobile: newCustomerData.mobile,
                village: newCustomerData.village,
                taluka: newCustomerData.taluka,
                district: newCustomerData.district,
                state: newCustomerData.state,
                status: newCustomerData.status
              };
              const newSk = await shopkeeperAPI.create(newShopkeeperData);
              customerId = newSk.shopkeeper?.shopkeeper_id || newSk.data?.shopkeeper_id || newSk.shopkeeper_id || 0;
              const skData = await shopkeeperAPI.getAll({ limit: 1000 });
              setShopkeepers(Array.isArray(skData) ? skData : (skData?.data || []));
            } else {
              const newCustomer = await customerAPI.create(newCustomerData as Customer);
              customerId = newCustomer.data?.customer_id || newCustomer.customer_id || 0;
              const customersData = await customerAPI.getAll({ limit: 1000 });
              setCustomers(Array.isArray(customersData) ? customersData : (customersData?.data || []));
            }
          }
        } catch (err: any) {
          console.error("Error creating entity:", err);
          const errorMessage =
            err?.response?.data?.detail ||
            err?.message ||
            `Failed to create ${getCategoryLabel()}`;
          setError(errorMessage);
          return;
        }
      } else {
        // Validate existing customer/distributor selection
        if (!customerId || customerId === 0) {
          setError(`Please select a ${getCategoryLabel()}`);
          return;
        }
        // No extra FK validation needed — the backend now handles both
        // customer_id (Sabhasad) and distributor_id (Distributor/Mantri) correctly.
      }

      // Validate items
      if (items.length === 0) {
        setError(t("sales.addAtLeastOneItem", "Please add at least one item"));
        return;
      }

      // Validate each item
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.product_id || item.product_id === 0) {
          setError(`Item ${i + 1}: Please select a product`);
          return;
        }
        if (!item.quantity || item.quantity <= 0) {
          setError(`Item ${i + 1}: Quantity must be greater than 0`);
          return;
        }
        if (!item.rate || item.rate <= 0) {
          setError(`Item ${i + 1}: Rate must be greater than 0`);
          return;
        }
      }

      const isDistributorSale = customerCategory === "Mantri";
      const isDoctorSale = customerCategory === "Doctor";
      const isShopkeeperSale = customerCategory === "Shopkeeper";

      // Map category to backend buyer_type
      const buyerType =
        customerCategory === "Mantri" ? "mantri"
        : customerCategory === "Doctor" ? "doctor"
        : customerCategory === "Shopkeeper" ? "shopkeeper"
        : customerCategory === "Field Officer" ? "field_officer"
        : "customer";

      const saleData = {
        // Route to correct FK based on category
        customer_id: (!isDistributorSale && !isDoctorSale && !isShopkeeperSale) ? customerId : undefined,
        distributor_id: isDistributorSale ? customerId : undefined,
        doctor_id: isDoctorSale ? customerId : undefined,
        shopkeeper_id: isShopkeeperSale ? customerId : undefined,
        buyer_type: buyerType,
        invoice_no: formData.invoice_no || undefined,
        sale_date: formData.sale_date,
        items: items.map((item) => ({
          product_id: item.product_id!,
          quantity: item.quantity!,
          rate: item.rate!,
          amount: item.amount!,
        })),
        notes: formData.notes || undefined,
        payment_terms: JSON.stringify(paymentTerms),
        paid_amount: formData.paid_amount || 0,
        payment_method: "Cash",
      };

      console.log(`${editingSaleId ? "Updating" : "Creating"} sale:`, saleData);

      let response;
      if (role === "telecaller") {
        const orderData = {
          customer_type: buyerType,
          customer_id: (!isDistributorSale && !isDoctorSale && !isShopkeeperSale) ? customerId : (customerId || undefined),
          customer_name: customerMode === "new" ? newCustomerData.name : (selectedEntity?.name || ""),
          customer_mobile: customerMode === "new" ? newCustomerData.mobile : (selectedEntity?.mobile || ""),
          customer_village: customerMode === "new" ? newCustomerData.village : (selectedEntity?.village || ""),
          products: items.map((item) => ({
            product_id: item.product_id!,
            quantity: item.quantity!,
            rate: item.rate!,
            amount: item.amount!,
          })),
          notes: formData.notes || undefined,
        };
        response = await telecallerOrderAPI.create(orderData);
        setToast({ msg: "Order submitted to Sales Manager for approval", sev: "success" });
        console.log("Telecaller order created:", response);
      } else {
        if (editingSaleId) {
          response = await salesAPI.update(editingSaleId, saleData);
          console.log("Sale updated:", response);
        } else {
          response = await salesAPI.create(saleData);
          console.log("Sale created:", response);
        }
      }

      if (mergedTelecallerOrderIds.length > 0 && response?.sale?.sale_id) {
        try {
          await telecallerOrderAPI.bulkMarkApproved(mergedTelecallerOrderIds, response.sale.sale_id);
          loadTelecallerOrders();
        } catch (e) {
          console.error("Error marking telecaller orders as approved:", e);
        }
      }

      handleCloseDialog();
      // Fast optimistic update
      setSubmitting(false);

      // OPTIMISTIC UPDATE: Add/Update sale in list immediately if possible
      if (response.sale && role !== "telecaller") {
        try {
          const newSale = response.sale;
          let enrichedName = "";
          let enrichedVillage = "";
          let enrichedMobile = "";

          // Use the selectedEntity captured at selection time (most reliable source)
          if (selectedEntity) {
            enrichedName = selectedEntity.name;
            enrichedVillage = selectedEntity.village;
            enrichedMobile = selectedEntity.mobile;
          } else if (customerMode === "new") {
            enrichedName = newCustomerData.name;
            enrichedVillage = newCustomerData.village;
            enrichedMobile = newCustomerData.mobile;
          }

          const enrichedSale = {
            ...newSale,
            buyer_type: buyerType,
            customer_name: enrichedName,
            village: enrichedVillage,
            mobile: enrichedMobile,
          };

          if (editingSaleId) {
            setSales(prev => prev.map(s => s.sale_id === editingSaleId ? enrichedSale : s));
          } else {
            setSales(prev => [enrichedSale, ...prev]);
          }
        } catch (e) {
          console.log("Optimistic update failed, waiting for refresh");
        }
      }

      // Background refresh (no spinner)
      loadData(true);
      setError(null);
    } catch (err: any) {
      console.error("Error creating sale:", err);
      let errorMessage = t("sales.createError", "Failed to create sale");

      if (err?.response?.data?.detail) {
        if (typeof err.response.data.detail === "string") {
          errorMessage = err.response.data.detail;
        } else if (Array.isArray(err.response.data.detail)) {
          // Handle Pydantic validation errors (array of objects)
          errorMessage = err.response.data.detail
            .map((e: any) => e.msg || JSON.stringify(e))
            .join(", ");
        } else {
          errorMessage = JSON.stringify(err.response.data.detail);
        }
      } else if (err?.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmSelected = async () => {
    if (selectedRowIds.length === 0 || confirming) return;
    if (!window.confirm(`Confirm ${selectedRowIds.length} pre-sale(s)? Invoice numbers will be generated.`)) return;

    setConfirming(true);
    try {
      const response = await salesAPI.confirmSales(selectedRowIds);
      
      const successCount = response.succeeded?.length || 0;
      const failedCount = response.failed?.length || 0;
      
      if (failedCount > 0) {
        setToast({ msg: `${successCount} confirmed, ${failedCount} failed to confirm.`, sev: "warning" });
      } else {
        setToast({ msg: `Successfully confirmed ${successCount} sale(s)`, sev: "success" });
      }
      
      setSelectedRowIds([]);
      loadData(true); // reload table data
    } catch (err: any) {
      console.error("Error confirming sales:", err);
      setToast({ msg: err?.response?.data?.detail || "Failed to confirm sales", sev: "error" });
    } finally {
      setConfirming(false);
    }
  };

  const getTotalAmount = () => {
    return items.reduce((sum, item) => sum + (item.amount || 0), 0);
  };

  const filteredSales = sales.filter((sale) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = (
      (sale.invoice_no && sale.invoice_no.toLowerCase().includes(query)) ||
      (sale.customer_name && sale.customer_name.toLowerCase().includes(query)) ||
      (sale.village && sale.village.toLowerCase().includes(query)) ||
      (sale.notes && sale.notes.toLowerCase().includes(query))
    );
    const matchesBuyerType = buyerTypeFilter === "all" || (sale as any).buyer_type === buyerTypeFilter || (!( sale as any).buyer_type && buyerTypeFilter === "customer");
    
    const matchesNoteType = saleNoteTypeMap[sale.sale_id ?? 0];
    const matchesNote =
      noteFilter === "all" ||
      (noteFilter === "none" && !matchesNoteType) ||
      (noteFilter === "credit" && (matchesNoteType === "credit" || matchesNoteType === "both")) ||
      (noteFilter === "debit" && (matchesNoteType === "debit" || matchesNoteType === "both"));

    const matchesRefundDue = !refundDueOnly || sale.payment_status === "Refund Due";

    const matchesTab = saleTab === "pre_sales"
      ? sale.sale_stage === "pre_sale"
      : sale.sale_stage !== "pre_sale";

    return matchesSearch && matchesBuyerType && matchesNote && matchesRefundDue && matchesTab;
  });

  const columns: GridColDef[] = [
    {
      field: "invoice_no",
      headerName: tf("invoice_no"),
      width: 140,
      renderCell: (params) => {
        if (!params.value && params.row.sale_stage === "pre_sale") {
          return <Chip label="Pre-Sale" size="small" color="warning" />;
        }
        return <Chip label={params.value || "N/A"} size="small" color="primary" />;
      },
    },
    {
      field: "customer_name",
      headerName: "Name",
      flex: 1,
      minWidth: 220,
      renderCell: (params) => {
        const buyerType = params.row.buyer_type;
        const badgeColor: Record<string, "default" | "warning" | "info" | "secondary" | "success" | "error"> = {
          mantri: "warning",
          distributor: "info",
          field_officer: "secondary",
          doctor: "success",
          shopkeeper: "error",
        };
        const badgeLabel: Record<string, string> = {
          mantri: "Mantri",
          distributor: "Distributor",
          field_officer: "Field Officer",
          doctor: "Doctor",
          shopkeeper: "Shopkeeper",
        };
        const showBadge = buyerType && buyerType !== "customer";
        return (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Typography variant="body2" noWrap>{params.value || "—"}</Typography>
            {showBadge && (
              <Chip
                label={badgeLabel[buyerType] || buyerType}
                size="small"
                color={badgeColor[buyerType] || "default"}
                sx={{ fontSize: "0.65rem", height: 18 }}
              />
            )}
          </Box>
        );
      },
    },
    {
      field: "village",
      headerName: tf("village"),
      width: 150,
    },
    {
      field: "sale_date",
      headerName: tf("date"),
      width: 120,
      renderCell: (params) => new Date(params.value).toLocaleDateString(),
    },
    {
      field: "total_amount",
      headerName: tf("amount"),
      width: 130,
      renderCell: (params) => (
        <Typography variant="body2" fontWeight={600}>
          ₹{params.value?.toLocaleString()}
        </Typography>
      ),
    },
    {
      field: "payment_status",
      headerName: t("dashboard.paymentStatus"),
      width: 140,
      renderCell: (params) => {
        const isPending =
          params.value === "Pending" || params.value === "Partial";
        return (
          <Tooltip
            title={
              isPending
                ? t("sales.clickToAddPayment", "Click to add payment")
                : ""
            }
          >
            <Chip
              label={params.value}
              size="small"
              color={
                params.value === "Paid"
                  ? "success"
                  : params.value === "Refund Due"
                    ? "secondary"
                    : params.value === "Partial"
                      ? "warning"
                    : (() => {
                      // Logic for "Pending" status color
                      // Default is error (Red) for overdue/advance
                      let statusColor: "error" | "warning" = "error";

                      try {
                        if (params.row.payment_terms) {
                          const terms = JSON.parse(params.row.payment_terms);
                          const type = terms.type;

                          if (type === 'after_delivery') {
                            // If not delivered yet, it's not overdue -> Orange
                            if (params.row.shipment_status !== 'delivered') {
                              statusColor = "warning";
                            }
                          } else if (type === 'after_days' && terms.days) {
                            // Check if due date has passed
                            const saleDate = new Date(params.row.sale_date);
                            const dueDate = new Date(saleDate);
                            dueDate.setDate(dueDate.getDate() + Number(terms.days));
                            // Normalize to YYYY-MM-DD comparisons to avoid time issues
                            const todayStr = new Date().toISOString().split('T')[0];
                            const dueDateStr = dueDate.toISOString().split('T')[0];

                            if (todayStr <= dueDateStr) {
                              statusColor = "warning"; // Still within credit period
                            }
                          } else if (type === 'emi') {
                            // Simple logic: if any part is pending but future -> Orange
                            // For now, let's treat EMI simplisticly: Orange implies active payment plan
                            statusColor = "warning";
                          }
                        }
                      } catch (e) {
                        // Fallback to error
                      }

                      return statusColor;
                    })()
              }
              onClick={
                isPending
                  ? () => {
                    navigate("/payments", {
                      state: { saleId: params.row.sale_id },
                    });
                  }
                  : undefined
              }
              sx={{
                cursor: isPending ? "pointer" : "default",
                "&:hover": isPending
                  ? {
                    opacity: 0.8,
                    transform: "scale(1.05)",
                  }
                  : {},
                transition: "all 0.2s",
              }}
            />
          </Tooltip>
        );
      },
    },
    {
      field: "payment_terms",
      headerName: "Payment Terms",
      width: 160,
      renderCell: (params) => {
        if (!params.value) return <Chip label="Standard" size="small" variant="outlined" />;
        try {
          const terms = JSON.parse(params.value);
          let label = "Standard";
          let color: "default" | "primary" | "secondary" | "info" = "default";
          let details = "";

          switch (terms.type) {
            case "advance":
              label = "Advance";
              color = "success" as any;
              details = "Full payment in advance";
              break;
            case "after_delivery":
              label = "On Delivery";
              color = "info";
              details = "Payment due on delivery";
              break;
            case "after_days":
              label = `${terms.days} Days Credit`;
              color = "warning" as any;
              details = `Payment due after ${terms.days} days`;
              break;
            case "emi":
              label = "EMI";
              color = "secondary";
              details = terms.emiParts?.map((p: any) =>
                `Part ${p.part}: ${p.percentage}% after ${p.days} days`
              ).join('\n');
              break;
          }

          return (
            <Tooltip title={<div style={{ whiteSpace: 'pre-line' }}>{details}</div>}>
              <Chip label={label} size="small" color={color} variant="outlined" />
            </Tooltip>
          );
        } catch (e) {
          return <Chip label="Standard" size="small" variant="outlined" />;
        }
      },
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 80,
      renderCell: (params) => (
        <IconButton size="small" onClick={(e) => handleMenuOpen(e, params.row)}>
          <MoreVertIcon fontSize="small" />
        </IconButton>
      ),
    },
  ];

  return (
    <PermissionGate permission={PERMISSIONS.VIEW_SALES} page permissionLabel="view sales">
      <Box>
        {/* Header */}
        <Box sx={{ mb: { xs: 2, md: 4 } }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
            <ShoppingCartIcon sx={{ mr: 1, verticalAlign: "middle" }} />
            {t("sales.title")}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {t("sales.subtitle", "Create and manage sales transactions")}
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Actions */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
              <PermissionGate permission={PERMISSIONS.CREATE_SALE}>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={handleOpenDialog}
                  size="large"
                >
                  {t("sales.addSale")}
                </Button>
              </PermissionGate>
              <PermissionGate permission={PERMISSIONS.CREATE_SALE}>
                <Button
                  variant="outlined"
                  color="primary"
                  startIcon={<PeopleIcon />}
                  onClick={openTelecallerOrdersDialog}
                  size="large"
                >
                  Add Telecaller's Sales
                </Button>
              </PermissionGate>
              <PermissionGate permission={PERMISSIONS.CREATE_SALE}>
                <Button
                  variant="outlined"
                  color="warning"
                  startIcon={<NoteIcon />}
                  onClick={() => setAddNoteOpen(true)}
                  size="large"
                >
                  Add Note
                </Button>
              </PermissionGate>
              <IconButton onClick={() => loadData()} color="primary">
                <RefreshIcon />
              </IconButton>

              <TextField
                placeholder={t("sales.searchPlaceholder", "Search sales...")}
                size="small"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon color="action" />
                    </InputAdornment>
                  ),
                }}
                sx={{ width: 260, ml: 2 }}
              />

              {/* Buyer Type Filter */}
              <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", ml: 1 }}>
                {[
                  { value: "all", label: "All" },
                  { value: "customer", label: "Sabhasad" },
                  { value: "mantri", label: "Mantri" },
                  { value: "doctor", label: "Doctor" },
                  { value: "shopkeeper", label: "Shopkeeper" },
                  { value: "field_officer", label: "Field Officer" },
                ].map(({ value, label }) => (
                  <Chip
                    key={value}
                    label={label}
                    size="small"
                    onClick={() => setBuyerTypeFilter(value)}
                    color={buyerTypeFilter === value ? "primary" : "default"}
                    variant={buyerTypeFilter === value ? "filled" : "outlined"}
                    sx={{ cursor: "pointer" }}
                  />
                ))}

                <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

                {/* Credit / Debit Note Filters */}
                <Chip
                  label="Credit Note"
                  size="small"
                  icon={<NoteIcon sx={{ fontSize: "0.9rem" }} />}
                  onClick={() => setNoteFilter(noteFilter === "credit" ? "all" : "credit")}
                  color={noteFilter === "credit" ? "warning" : "default"}
                  variant={noteFilter === "credit" ? "filled" : "outlined"}
                  sx={{ cursor: "pointer" }}
                />
                <Chip
                  label="Debit Note"
                  size="small"
                  icon={<NoteIcon sx={{ fontSize: "0.9rem" }} />}
                  onClick={() => setNoteFilter(noteFilter === "debit" ? "all" : "debit")}
                  color={noteFilter === "debit" ? "error" : "default"}
                  variant={noteFilter === "debit" ? "filled" : "outlined"}
                  sx={{ cursor: "pointer" }}
                />

                <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

                {/* Refund Due filter */}
                <Chip
                  label="Refund Due"
                  size="small"
                  onClick={() => setRefundDueOnly(!refundDueOnly)}
                  color={refundDueOnly ? "secondary" : "default"}
                  variant={refundDueOnly ? "filled" : "outlined"}
                  sx={{ cursor: "pointer", fontWeight: refundDueOnly ? 700 : 400 }}
                />
              </Box>

              <Box sx={{ ml: "auto", display: "flex", gap: 2 }}>
                <Chip
                  label={`Pre-Sales: ${sales.filter(s => s.sale_stage === "pre_sale").length}`}
                  color="warning"
                />
                <Chip
                  label={`Confirmed: ${sales.filter(s => s.sale_stage !== "pre_sale").length}`}
                  color="primary"
                />
                <Chip
                  label={`Amount: ₹${filteredSales.reduce((sum, s) => sum + s.total_amount, 0).toLocaleString()}`}
                  color="success"
                />
              </Box>
            </Box>
          </CardContent>
        </Card>

        {/* Tab Selection */}
        <Box sx={{ mb: 2, display: "flex", alignItems: "center", gap: 2 }}>
          <ToggleButtonGroup
            value={saleTab}
            exclusive
            onChange={(e, newVal) => {
              if (newVal) {
                setSaleTab(newVal);
                setSelectedRowIds([]);
              }
            }}
            color="primary"
          >
            <ToggleButton value="pre_sales">
              Pre-Sales
            </ToggleButton>
            <ToggleButton value="confirmed">
              Confirmed Sales
            </ToggleButton>
          </ToggleButtonGroup>

          {saleTab === "pre_sales" && selectedRowIds.length > 0 && (
            <Button
              variant="contained"
              color="primary"
              onClick={handleConfirmSelected}
              disabled={confirming}
            >
              {confirming ? <CircularProgress size={24} color="inherit" /> : `Confirm Selected (${selectedRowIds.length})`}
            </Button>
          )}
        </Box>

        {/* Sales Table */}
        <Card>
          <CardContent>
            <Box sx={{ height: 600, width: "100%", overflowX: "auto" }}>
              {loading ? (
                <TableSkeleton rows={10} columns={6} />
              ) : (
                <DataGrid
                  rows={filteredSales}
                  columns={columns}
                  getRowId={(row) => row.sale_id}
                  pageSizeOptions={[10, 25, 50, 100]}
                  initialState={{
                    pagination: {
                      paginationModel: { pageSize: 25 },
                    },
                  }}
                  checkboxSelection={saleTab === "pre_sales"}
                  onRowSelectionModelChange={(newSelection) => setSelectedRowIds(newSelection as number[])}
                  rowSelectionModel={selectedRowIds}
                  disableRowSelectionOnClick
                />
              )}
            </Box>
          </CardContent>
        </Card>

        {/* Create/Edit Sale Dialog */}
        <Dialog
          open={openDialog}
          onClose={handleCloseDialog}
          maxWidth="md"
          fullWidth
          fullScreen={isMobile}
        >
          <DialogTitle>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <ReceiptIcon />
              {editingSaleId ? "Edit Sale" : t("sales.addSale")}
            </Box>
          </DialogTitle>
          <DialogContent>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              {/* Customer Mode Toggle */}
              <Grid item xs={12}>
                <Box
                  sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}
                >
                  <Typography variant="subtitle2" color="text.secondary">
                    {`${getCategoryLabel()}:`}
                  </Typography>
                  <ToggleButtonGroup
                    value={customerMode}
                    exclusive
                    onChange={(e, newMode) => {
                      if (newMode !== null) {
                        setCustomerMode(newMode);
                      }
                    }}
                    size="small"
                    color="primary"
                  >
                    <ToggleButton value="existing">
                      <PeopleIcon sx={{ mr: 1, fontSize: 18 }} />
                      {`Existing ${getCategoryLabel()}`}
                    </ToggleButton>
                    <ToggleButton value="new">
                      <PersonAddIcon sx={{ mr: 1, fontSize: 18 }} />
                      {`New ${getCategoryLabel()}`}
                    </ToggleButton>
                  </ToggleButtonGroup>
                </Box>
                <Divider />
              </Grid>

              {/* Customer Category Selection */}
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  select
                  label="Customer Category (Pricing Tier)"
                  value={customerCategory}
                  onChange={(e) => {
                    setCustomerCategory(e.target.value);
                    recalculateRates(e.target.value, customerMode, formData.customer_id, newCustomerData.state);
                  }}
                >
                  {["Sabhasad", "Mantri", "Doctor", "Shopkeeper", "Field Officer"].map((cat) => (
                    <MenuItem key={cat} value={cat}>
                      {cat}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              {/* Existing Customer/Entity Selection - Searchable */}
              {customerMode === "existing" && (
                <>
                  <Grid item xs={12} sm={6}>
                    <Autocomplete
                      options={getEntityOptions()}
                      getOptionLabel={(option: any) => option.label || option.name || ''}
                      value={
                        getEntityOptions().find((o: any) => o.id === formData.customer_id) ||
                        (selectedEntity ? { ...selectedEntity, id: formData.customer_id, label: `${selectedEntity.name}${selectedEntity.mobile ? ` (${selectedEntity.mobile})` : ''}${selectedEntity.village ? ` - ${selectedEntity.village}` : ''}` } : null)
                      }
                      onChange={(_e: any, newValue: any) => {
                        const newId = newValue ? newValue.id : 0;
                        setFormData({
                          ...formData,
                          customer_id: newId,
                        });
                        setSelectedEntity(newValue ? { name: newValue.name || '', village: newValue.village || '', mobile: newValue.mobile || '' } : null);
                        recalculateRates(customerCategory, "existing", newId, newCustomerData.state);
                      }}
                      renderInput={(params: any) => (
                        <TextField
                          {...params}
                          fullWidth
                          label={`${getCategoryLabel()} Name *`}
                          placeholder={`Search ${getCategoryLabel()}...`}
                        />
                      )}
                      isOptionEqualToValue={(option: any, value: any) => option.id === value?.id}
                      noOptionsText={`No ${getCategoryLabel()} found`}
                    />
                  </Grid>

                  {/* Customer Data Preview (Read-only) for Existing Customer */}
                  {formData.customer_id > 0 && (() => {
                    let entityDetails = null;
                    if (customerCategory === "Sabhasad") {
                      entityDetails = customers.find(c => c.customer_id === formData.customer_id);
                    } else if (customerCategory === "Mantri" || customerCategory === "Distributor") {
                      entityDetails = distributors.find(d => d.distributor_id === formData.customer_id);
                    } else if (customerCategory === "Doctor") {
                      entityDetails = doctors.find(d => d.doctor_id === formData.customer_id);
                    } else if (customerCategory === "Shopkeeper") {
                      entityDetails = shopkeepers.find(s => s.shopkeeper_id === formData.customer_id);
                    }
                    
                    if (!entityDetails) return null;
                    return (
                      <>
                        <Grid item xs={12} sm={6}>
                          <TextField fullWidth disabled label="Mobile" value={entityDetails.mobile || entityDetails.mantri_mobile || ""} />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                          <TextField fullWidth disabled label="Village" value={entityDetails.village || ""} />
                        </Grid>
                      </>
                    );
                  })()}
                </>
              )}

              {/* New Customer Form */}
              {customerMode === "new" && (
                <>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label={`${getCategoryLabel()} Name *`}
                      value={newCustomerData.name}
                      onChange={(e) =>
                        setNewCustomerData({
                          ...newCustomerData,
                          name: e.target.value,
                        })
                      }
                      placeholder={`Enter ${getCategoryLabel()} name`}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label={`${tf("mobile")} *`}
                      value={newCustomerData.mobile}
                      onChange={(e) =>
                        setNewCustomerData({
                          ...newCustomerData,
                          mobile: e.target.value,
                        })
                      }
                      placeholder="9876543210"
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">+91</InputAdornment>
                        ),
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      required
                      label={tf("village")}
                      value={newCustomerData.village}
                      onChange={(e) =>
                        setNewCustomerData({
                          ...newCustomerData,
                          village: e.target.value,
                        })
                      }
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      required
                      label={tf("taluka")}
                      value={newCustomerData.taluka}
                      onChange={(e) =>
                        setNewCustomerData({
                          ...newCustomerData,
                          taluka: e.target.value,
                        })
                      }
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      required
                      label={tf("district")}
                      value={newCustomerData.district}
                      onChange={(e) =>
                        setNewCustomerData({
                          ...newCustomerData,
                          district: e.target.value,
                        })
                      }
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      select
                      required
                      label="State"
                      value={newCustomerData.state || "Gujarat"}
                      onChange={(e) => {
                        setNewCustomerData({
                          ...newCustomerData,
                          state: e.target.value,
                        });
                        recalculateRates(customerCategory, "new", formData.customer_id, e.target.value);
                      }}
                    >
                      {regions.map((reg) => (
                        <MenuItem key={reg} value={reg}>{reg}</MenuItem>
                      ))}
                      {regions.length === 0 && (
                        <MenuItem value="Gujarat">Gujarat</MenuItem>
                      )}
                    </TextField>
                  </Grid>
                </>
              )}

              {/* Sale Date */}
              <Grid item xs={12} sm={customerMode === "new" ? 12 : 6}>
                <TextField
                  fullWidth
                  type="date"
                  label={t("sales.date", "Sale Date")}
                  value={formData.sale_date}
                  onChange={(e) =>
                    setFormData({ ...formData, sale_date: e.target.value })
                  }
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              {/* Aadhar No for New Customer */}
              {customerMode === "new" && (
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Adhar No"
                    value={newCustomerData.adhar_no || ""}
                    onChange={(e) =>
                      setNewCustomerData({
                        ...newCustomerData,
                        adhar_no: e.target.value,
                      })
                    }
                    placeholder="12-digit Aadhar"
                  />
                </Grid>
              )}

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label={tf("invoice_no")}
                  value={formData.invoice_no}
                  onChange={(e) =>
                    setFormData({ ...formData, invoice_no: e.target.value })
                  }
                  placeholder={t("sales.invoiceNoPlaceholder", "Leave empty for auto-generation")}
                />
              </Grid>

              {/* Payment Terms */}
              <Grid item xs={12}>
                <Divider sx={{ my: 1 }} />
                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                  Payment Terms
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  select
                  label="Payment Type"
                  value={paymentTerms.type}
                  onChange={(e) => setPaymentTerms({ ...paymentTerms, type: e.target.value as any })}
                >
                  <MenuItem value="on_delivery">On Delivery</MenuItem>
                  <MenuItem value="after_delivery">After Delivery</MenuItem>
                  <MenuItem value="advance">Advance Payment</MenuItem>
                  <MenuItem value="after_days">After X Days</MenuItem>
                  <MenuItem value="emi">EMI (4 Parts)</MenuItem>
                </TextField>
              </Grid>

              {/* Paid Amount - Visible for 'On Delivery' and 'Advance Payment' */}
              {(paymentTerms.type === 'on_delivery' || paymentTerms.type === 'advance') && (
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Paid Amount"
                    type="number"
                    value={formData.paid_amount}
                    onChange={(e) =>
                      setFormData({ ...formData, paid_amount: Number(e.target.value) })
                    }
                    InputProps={{
                      startAdornment: <Typography sx={{ mr: 1 }}>₹</Typography>,
                    }}
                    helperText={paymentTerms.type === 'advance' ? "Enter advance payment amount" : "Enter amount received on delivery"}
                  />
                </Grid>
              )}

              {/* After X Days */}
              {paymentTerms.type === 'after_days' && (
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Payment Due After (Days)"
                    value={paymentTerms.days}
                    onChange={(e) => setPaymentTerms({ ...paymentTerms, days: Number(e.target.value) })}
                    inputProps={{ min: 0 }}
                  />
                </Grid>
              )}

              {/* EMI Configuration */}
              {paymentTerms.type === 'emi' && (
                <>
                  {paymentTerms.emiParts.map((part, idx) => (
                    <Grid item xs={12} sm={6} key={idx}>
                      <TextField
                        fullWidth
                        type="number"
                        label={`Part ${part.part} - Due After (Days)`}
                        value={part.days}
                        onChange={(e) => {
                          const newParts = [...paymentTerms.emiParts];
                          newParts[idx] = { ...newParts[idx], days: Number(e.target.value) };
                          setPaymentTerms({ ...paymentTerms, emiParts: newParts });
                        }}
                        inputProps={{ min: 0 }}
                        helperText={`${part.percentage}% of total amount`}
                      />
                    </Grid>
                  ))}
                </>
              )}
              <Grid item xs={12}>
                <Divider sx={{ my: 2 }} />
                <Box
                  sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}
                >
                  <Typography variant="h6">
                    {t("sales.itemsTitle", "Sale Items")}
                  </Typography>
                  <Button
                    startIcon={<AddIcon />}
                    onClick={handleAddItem}
                    size="small"
                  >
                    {t("sales.addItem", "Add Item")}
                  </Button>
                </Box>
              </Grid>
              {items.map((item, index) => (
                <Grid item xs={12} key={index}>
                  <Card variant="outlined">
                    <CardContent>
                      <Grid container spacing={2}>
                        <Grid item xs={12} sm={5}>
                          <TextField
                            fullWidth
                            select
                            size="small"
                            label={t("sales.product", "Product")}
                            value={item.product_id || 0}
                            onChange={(e) =>
                              handleItemChange(
                                index,
                                "product_id",
                                Number(e.target.value),
                              )
                            }
                          >
                            <MenuItem value={0}>
                              {t("sales.selectProduct", "Select Product")}
                            </MenuItem>
                            {products.map((product) => (
                              <MenuItem
                                key={product.product_id}
                                value={product.product_id}
                              >
                                {product.product_name}
                              </MenuItem>
                            ))}
                          </TextField>
                        </Grid>
                        <Grid item xs={12} sm={2}>
                          <TextField
                            fullWidth
                            size="small"
                            type="number"
                            label={tf("quantity")}
                            value={item.quantity}
                            onChange={(e) => {
                              const val = e.target.value;
                              // Just use Number() which handles "01" -> 1. 
                              // If the issue persists, the browser might be masking the update.
                              // But let's act on the user's string directly to be sure.
                              handleItemChange(
                                index,
                                "quantity",
                                Number(val),
                              )
                            }}
                          />
                        </Grid>
                        <Grid item xs={12} sm={2}>
                          <TextField
                            fullWidth
                            size="small"
                            type="number"
                            label={t("sales.rate", "Rate")}
                            value={item.rate}
                            onChange={(e) =>
                              handleItemChange(
                                index,
                                "rate",
                                Number(e.target.value),
                              )
                            }
                          />
                        </Grid>
                        <Grid item xs={12} sm={2}>
                          <TextField
                            fullWidth
                            size="small"
                            label={tf("amount")}
                            value={item.amount || 0}
                            InputProps={{
                              readOnly: true,
                            }}
                          />
                        </Grid>
                        <Grid item xs={12} sm={1}>
                          <IconButton
                            color="error"
                            onClick={() => handleRemoveItem(index)}
                            disabled={items.length === 1}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Grid>
                      </Grid>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
              <Grid item xs={12}>
                <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
                  <Typography variant="h6">
                    {t("dashboard.amount")}: ₹{getTotalAmount().toLocaleString()}
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label={tf("notes")}
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDialog} disabled={submitting}>{t("common.cancel")}</Button>
            <Button
              onClick={handleSubmit}
              variant="contained"
              disabled={submitting}
              startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : undefined}
            >
              {submitting ? "Saving..." : (editingSaleId ? "Save Changes" : t("sales.addSale"))}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Action Menu */}
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={handleMenuClose}
        >
          {hasPermission(PERMISSIONS.EDIT_SALE) && (
            <MenuItem onClick={handleEditClick}>
              <EditIcon sx={{ mr: 1 }} fontSize="small" color="secondary" />
              Edit Sale
            </MenuItem>
          )}
          <MenuItem onClick={() => {
            handleMenuClose();
            setNotesDialogOpen(true);
          }}>
            <NoteIcon sx={{ mr: 1 }} fontSize="small" color="info" />
            Manage Notes
          </MenuItem>
          {hasPermission(PERMISSIONS.DELETE_SALE) && (
            <MenuItem onClick={handleDeleteClick} sx={{ color: 'error.main' }}>
              <DeleteIcon sx={{ mr: 1 }} fontSize="small" color="error" />
              Delete Sale
            </MenuItem>
          )}
        </Menu>

        {/* Delete Confirmation */}
        <Dialog
          open={deleteConfirmOpen}
          onClose={() => setDeleteConfirmOpen(false)}
        >
          <DialogTitle>Delete Sale</DialogTitle>
          <DialogContent>
            <Typography>
              Are you sure you want to delete invoice <strong>{selectedActionSale?.invoice_no}</strong>?
              This will permanently remove the sale and all its items.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
            <Button onClick={confirmDeleteSale} color="error" variant="contained">
              Delete
            </Button>
          </DialogActions>
        </Dialog>

        {/* Notes Dialog */}
        {selectedActionSale && (
          <NotesDialog
            open={notesDialogOpen}
            onClose={() => setNotesDialogOpen(false)}
            saleId={selectedActionSale.sale_id!}
            invoiceNo={selectedActionSale.invoice_no}
            totalAmount={selectedActionSale.total_amount}
            paymentStatus={selectedActionSale.payment_status}
            onNoteChange={() => loadData(true)}
          />
        )}

        {/* Add Note Dialog — pick customer/invoice then opens NotesDialog */}
        <AddNoteDialog
          open={addNoteOpen}
          onClose={() => setAddNoteOpen(false)}
          onNoteChange={() => { setAddNoteOpen(false); loadData(true); }}
          sales={sales}
        />

        {/* Telecaller Orders Dialog */}
        <Dialog
          open={telecallerOrdersDialogOpen}
          onClose={() => setTelecallerOrdersDialogOpen(false)}
          maxWidth="md"
          fullWidth
          fullScreen={isMobile}
        >
          <DialogTitle>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
              <span>Pending Telecaller Orders</span>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                <Checkbox
                  checked={telecallerOrders.length > 0 && selectedTelecallerOrders.size === telecallerOrders.length}
                  indeterminate={selectedTelecallerOrders.size > 0 && selectedTelecallerOrders.size < telecallerOrders.length}
                  onChange={toggleSelectAllTelecallerOrders}
                  size="small"
                />
                <Typography variant="body2" sx={{ mr: 1 }}>Select All</Typography>
                <Button variant="contained" color="success" size="small" disabled={selectedTelecallerOrders.size === 0} onClick={handleBulkTelecallerApprove}>Approve Selected</Button>
                <Button variant="contained" color="error" size="small" disabled={selectedTelecallerOrders.size === 0} onClick={handleBulkTelecallerReject}>Reject Selected</Button>
              </Box>
            </Box>
          </DialogTitle>
          <DialogContent>
            {/* Filters */}
            <Box sx={{ display: "flex", gap: 2, mt: 1, mb: 2, flexWrap: "wrap" }}>
              <TextField
                label="Filter by Date"
                type="date"
                size="small"
                value={tcOrderDateFilter}
                onChange={(e) => setTcOrderDateFilter(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 180 }}
              />
              <TextField
                label="Filter by Telecaller"
                size="small"
                placeholder="Name or email…"
                value={tcOrderTelecallerFilter}
                onChange={(e) => setTcOrderTelecallerFilter(e.target.value)}
                sx={{ minWidth: 200 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />
              <Autocomplete
                options={tcOrderLocations.states}
                value={tcOrderStateFilter}
                onChange={(_, v) => { setTcOrderStateFilter(v || ""); setTcOrderDistrictFilter(""); setTcOrderTalukaFilter(""); setTcOrderVillageFilter(""); }}
                renderInput={(params) => <TextField {...params} label="Filter by State" size="small" sx={{ minWidth: 160 }} placeholder="State" />}
              />
              <Autocomplete
                options={tcOrderStateFilter ? tcOrderLocations.stateToDistricts[tcOrderStateFilter] || [] : tcOrderLocations.districts}
                value={tcOrderDistrictFilter}
                onChange={(_, v) => { setTcOrderDistrictFilter(v || ""); setTcOrderTalukaFilter(""); setTcOrderVillageFilter(""); }}
                renderInput={(params) => <TextField {...params} label="Filter by District" size="small" sx={{ minWidth: 160 }} placeholder="District" />}
                disabled={!tcOrderStateFilter && tcOrderLocations.districts.length === 0}
              />
              <Autocomplete
                options={tcOrderDistrictFilter ? tcOrderLocations.districtToTalukas[tcOrderDistrictFilter] || [] : tcOrderLocations.talukas}
                value={tcOrderTalukaFilter}
                onChange={(_, v) => { setTcOrderTalukaFilter(v || ""); setTcOrderVillageFilter(""); }}
                renderInput={(params) => <TextField {...params} label="Filter by Taluka" size="small" sx={{ minWidth: 160 }} placeholder="Taluka" />}
                disabled={!tcOrderDistrictFilter && tcOrderLocations.talukas.length === 0}
              />
              <Autocomplete
                options={tcOrderTalukaFilter ? tcOrderLocations.talukaToVillages[tcOrderTalukaFilter] || [] : tcOrderLocations.villages}
                value={tcOrderVillageFilter}
                onChange={(_, v) => setTcOrderVillageFilter(v || "")}
                renderInput={(params) => <TextField {...params} label="Filter by Village" size="small" sx={{ minWidth: 160 }} placeholder="Village" />}
                disabled={!tcOrderTalukaFilter && tcOrderLocations.villages.length === 0}
              />
              {(tcOrderDateFilter || tcOrderTelecallerFilter || tcOrderStateFilter || tcOrderDistrictFilter || tcOrderTalukaFilter || tcOrderVillageFilter) && (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => { setTcOrderDateFilter(""); setTcOrderTelecallerFilter(""); setTcOrderStateFilter(""); setTcOrderDistrictFilter(""); setTcOrderTalukaFilter(""); setTcOrderVillageFilter(""); }}
                >
                  Clear Filters
                </Button>
              )}
            </Box>

            {telecallerOrdersLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
                <CircularProgress />
              </Box>
            ) : (() => {
              // Apply filters
              const filtered = telecallerOrders.filter((order) => {
                let orderDateStr = "";
                if (order.created_at) {
                  const d = new Date(order.created_at.endsWith('Z') || order.created_at.includes('+') ? order.created_at : `${order.created_at}Z`);
                  const yyyy = d.getFullYear();
                  const mm = String(d.getMonth() + 1).padStart(2, "0");
                  const dd = String(d.getDate()).padStart(2, "0");
                  orderDateStr = `${yyyy}-${mm}-${dd}`;
                }
                const telecallerLabel = (order.telecaller_name || order.telecaller_email || "").toLowerCase();
                const dateMatch = !tcOrderDateFilter || orderDateStr === tcOrderDateFilter;
                const telecallerMatch = !tcOrderTelecallerFilter || telecallerLabel.includes(tcOrderTelecallerFilter.toLowerCase());

                const orderState = order.customer_state || "Gujarat";
                const orderDistrict = order.customer_district || "";
                const orderTaluka = order.customer_taluka || "";
                const orderVillage = order.customer_village || "";

                const stateMatch = !tcOrderStateFilter || orderState === tcOrderStateFilter;
                const districtMatch = !tcOrderDistrictFilter || orderDistrict === tcOrderDistrictFilter;
                const talukaMatch = !tcOrderTalukaFilter || orderTaluka === tcOrderTalukaFilter;
                const villageMatch = !tcOrderVillageFilter || orderVillage === tcOrderVillageFilter;

                return dateMatch && telecallerMatch && stateMatch && districtMatch && talukaMatch && villageMatch;
              });

              if (filtered.length === 0) {
                return (
                  <Alert severity="info" sx={{ mt: 1 }}>
                    {telecallerOrders.length === 0
                      ? "No pending orders from telecallers."
                      : "No orders match the selected filters."}
                  </Alert>
                );
              }

              return (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {filtered.map((order) => {
                    let orderProducts: any[] = [];
                    try {
                      orderProducts = typeof order.products_json === "string" ? JSON.parse(order.products_json) : (order.products_json || []);
                    } catch (e) {}

                    const orderDate = order.created_at ? new Date(order.created_at.endsWith('Z') || order.created_at.includes('+') ? order.created_at : `${order.created_at}Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

                    return (
                      <Card key={order.order_id} variant="outlined" sx={{ borderLeft: selectedTelecallerOrders.has(order.order_id as number) ? "4px solid #1976d2" : undefined }}>
                        <CardContent>
                          <Grid container spacing={2}>
                            <Grid item xs={12} sm={8}>
                              <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, mb: 0.5 }}>
                                <Checkbox 
                                  checked={selectedTelecallerOrders.has(order.order_id as number)}
                                  onChange={() => toggleTelecallerOrderSelection(order.order_id as number)}
                                  size="small"
                                  sx={{ mt: -0.5, ml: -1 }}
                                />
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                  <Typography variant="h6" color="primary">
                                    {order.customer_name}
                                  </Typography>
                                  <Chip size="small" label={order.customer_type} />
                                </Box>
                              </Box>
                              <Typography variant="body2" color="text.secondary">
                                <strong>Telecaller:</strong> {order.telecaller_name || order.telecaller_email}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                <strong>Date:</strong> {orderDate}
                              </Typography>
                              <Typography variant="body2">
                                <strong>Mobile:</strong> {order.customer_mobile || "N/A"} | <strong>Village:</strong> {order.customer_village || "N/A"}
                              </Typography>
                              <Box sx={{ mt: 1 }}>
                                <Typography variant="subtitle2">Products Requested:</Typography>
                                <ul style={{ margin: "4px 0", paddingLeft: 20 }}>
                                  {orderProducts.map((p: any, idx: number) => {
                                    const prodName = products.find(prod => prod.product_id === p.product_id)?.product_name || `Product ID ${p.product_id}`;
                                    return (
                                      <li key={idx}>
                                        <Typography variant="body2">
                                          {prodName} — Qty: {p.quantity} | Rate: ₹{p.rate} | Total: ₹{p.amount}
                                        </Typography>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </Box>
                              {order.notes && (
                                <Typography variant="body2" sx={{ mt: 1, fontStyle: "italic" }}>
                                  <strong>Notes:</strong> {order.notes}
                                </Typography>
                              )}
                            </Grid>
                          </Grid>
                        </CardContent>
                      </Card>
                    );
                  })}
                </Box>
              );
            })()}
          </DialogContent>
          <DialogActions>
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1, pl: 1 }}>
              {(() => {
                const filtered = telecallerOrders.filter((o) => {
                  let d = "";
                  if (o.created_at) {
                    const dt = new Date(o.created_at.endsWith('Z') || o.created_at.includes('+') ? o.created_at : `${o.created_at}Z`);
                    d = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
                  }
                  const tl = (o.telecaller_name || o.telecaller_email || "").toLowerCase();
                  const id = Number(o.customer_id);
                  const cust = customers.find(c => Number(c.customer_id) === id && o.customer_type === "Sabhasad");
                  const dist = distributors.find(d => Number(d.distributor_id) === id && (o.customer_type === "Mantri" || o.customer_type === "distributor"));
                  const doc = doctors.find(d => Number(d.doctor_id) === id && o.customer_type === "Doctor");
                  const shop = shopkeepers.find(s => Number(s.shopkeeper_id) === id && o.customer_type === "Shopkeeper");
                  const entity = cust || dist || doc || shop;

                  const state = entity?.state || "Gujarat";
                  const district = entity?.district || "";
                  const taluka = entity?.taluka || "";
                  const village = entity?.village || o.customer_village || "";

                  return (!tcOrderDateFilter || d === tcOrderDateFilter) &&
                         (!tcOrderTelecallerFilter || tl.includes(tcOrderTelecallerFilter.toLowerCase())) &&
                         (!tcOrderStateFilter || state === tcOrderStateFilter) &&
                         (!tcOrderDistrictFilter || district === tcOrderDistrictFilter) &&
                         (!tcOrderTalukaFilter || taluka === tcOrderTalukaFilter) &&
                         (!tcOrderVillageFilter || village === tcOrderVillageFilter);
                });
                const activeFilters = [];
                if (tcOrderDateFilter) activeFilters.push(`Date: ${tcOrderDateFilter}`);
                if (tcOrderTelecallerFilter) activeFilters.push(`Telecaller: ${tcOrderTelecallerFilter}`);
                if (tcOrderStateFilter) activeFilters.push(`State: ${tcOrderStateFilter}`);
                if (tcOrderDistrictFilter) activeFilters.push(`District: ${tcOrderDistrictFilter}`);
                if (tcOrderTalukaFilter) activeFilters.push(`Taluka: ${tcOrderTalukaFilter}`);
                if (tcOrderVillageFilter) activeFilters.push(`Village: ${tcOrderVillageFilter}`);
                const filterText = activeFilters.length > 0 ? ` (${activeFilters.join(", ")})` : "";
                return `Showing ${filtered.length} of ${telecallerOrders.length} orders${filterText}`;
              })()}
            </Typography>
            <Button onClick={() => setTelecallerOrdersDialogOpen(false)}>Close</Button>
          </DialogActions>
        </Dialog>

      </Box>
    </PermissionGate>
  );
}
