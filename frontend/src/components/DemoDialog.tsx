import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Typography,
  useMediaQuery,
  useTheme,
  Box,
  Autocomplete,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { demoAPI, customerAPI, productAPI, distributorAPI, doctorAPI, shopkeeperAPI } from "../services/api";
import type { Customer, Product, Distributor } from "../types";
import { useTranslation } from "react-i18next";

interface DemoDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: {
    buyerType: string;
    entityId: number;
  };
}

export default function DemoDialog({ open, onClose, onSuccess, initialData }: DemoDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [buyerType, setBuyerType] = useState<string>("mantri");
  const [entityId, setEntityId] = useState<number>(0);

  // ── Entity caches via React Query (shared with Sales page — zero extra HTTP) ──
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["products-active"],
    queryFn: () => productAPI.getAll(),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
  const { data: distributors = [] } = useQuery<Distributor[]>({
    queryKey: ["distributors-all"],
    queryFn: async () => {
      const res = await distributorAPI.getAll({ limit: 1000 });
      return Array.isArray(res) ? res : (res?.data || []);
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
  const { data: doctors = [] } = useQuery<any[]>({
    queryKey: ["doctors-all"],
    queryFn: async () => {
      const res = await doctorAPI.getAll({ limit: 1000 });
      return Array.isArray(res) ? res : (res?.data || []);
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
  const { data: shopkeepers = [] } = useQuery<any[]>({
    queryKey: ["shopkeepers-all"],
    queryFn: async () => {
      const res = await shopkeeperAPI.getAll({ limit: 1000 });
      return Array.isArray(res) ? res : (res?.data || []);
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const [formData, setFormData] = useState({
    demo_date: new Date(),
    demo_time: new Date(),
    product_id: 0,
    quantity_provided: 1,
    demo_location: "",
    notes: "",
  });

  const [customerSearch, setCustomerSearch] = useState("");
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  useEffect(() => {
    if (!open || buyerType !== "customer") return;
    const timer = setTimeout(async () => {
      setLoadingCustomers(true);
      try {
        const res = await customerAPI.getAll({ limit: 25, search: customerSearch });
        setCustomers(Array.isArray(res) ? res : res.data || []);
      } catch (err) {
        console.error("Failed to fetch customers:", err);
      } finally {
        setLoadingCustomers(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [customerSearch, buyerType, open]);

  useEffect(() => {
    if (open && initialData) {
      setBuyerType(initialData.buyerType);
      setEntityId(initialData.entityId);
    }
  }, [open, initialData]);

  const getEntityOptions = () => {
    if (buyerType === "mantri") {
      return distributors.map(d => ({ id: d.distributor_id, label: `${d.mantri_name} (${d.village})`, name: d.mantri_name, village: d.village }));
    }
    if (buyerType === "distributor") {
      return distributors.map(d => ({ id: d.distributor_id, label: `${d.mantri_name || d.mantri_name || ''} (${d.village})`, name: d.mantri_name || '', village: d.village || '' }));
    }
    if (buyerType === "doctor") {
      return doctors.map(d => ({ id: d.doctor_id, label: `${d.name} (${d.village})`, name: d.name, village: d.village }));
    }
    if (buyerType === "shopkeeper") {
      return shopkeepers.map(s => ({ id: s.shopkeeper_id, label: `${s.name} (${s.village})`, name: s.name, village: s.village }));
    }
    return customers.map(c => ({ id: c.customer_id, label: `${c.name} (${c.village})`, name: c.name, village: c.village }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!entityId) {
      setError(t("sales.selectCustomer", "Please select a person"));
      return;
    }

    if (!formData.product_id) {
      setError("Please select a product");
      return;
    }

    try {
      setLoading(true);

      const demoData = {
        buyer_type: buyerType,
        customer_id: buyerType === "customer" ? entityId : undefined,
        distributor_id: ["mantri", "distributor"].includes(buyerType) ? entityId : undefined,
        doctor_id: buyerType === "doctor" ? entityId : undefined,
        shopkeeper_id: buyerType === "shopkeeper" ? entityId : undefined,
        demo_date: formData.demo_date.toISOString().split("T")[0],
        demo_time: formData.demo_time.toTimeString().split(" ")[0].slice(0, 5),
        product_id: formData.product_id,
        quantity_provided: formData.quantity_provided,
        demo_location: formData.demo_location || undefined,
        notes: formData.notes || "",
        conversion_status: "Scheduled",
      };

      await demoAPI.create(demoData as any);
      onSuccess();
      handleClose();
    } catch (err: any) {
      // Extract the server's detail message if available
      const serverMsg =
        err?.response?.data?.detail ||
        err?.message ||
        "Failed to schedule demo";
      setError(serverMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setBuyerType("mantri");
    setEntityId(0);
    setFormData({
      demo_date: new Date(),
      demo_time: new Date(),
      product_id: 0,
      quantity_provided: 1,
      demo_location: "",
      notes: "",
    });
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth fullScreen={isMobile}>
      <DialogTitle>Schedule New Demo</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {loading && !customers.length ? (
            <Box sx={{ display: "flex", justifyContent: "center", p: 3 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  select
                  label="Customer Category"
                  value={buyerType}
                  onChange={(e) => {
                    setBuyerType(e.target.value);
                    setEntityId(0);
                  }}
                >
                  <MenuItem value="customer">Sabhasad</MenuItem>
                  <MenuItem value="mantri">Mantri</MenuItem>
                  <MenuItem value="doctor">Doctor</MenuItem>
                  <MenuItem value="shopkeeper">Shopkeeper</MenuItem>
                </TextField>
              </Grid>

              <Grid item xs={12} sm={6}>
                <Autocomplete
                  options={getEntityOptions()}
                  getOptionLabel={(option: any) => option.label || ''}
                  value={getEntityOptions().find((o: any) => o.id === entityId) || null}
                  onChange={(_e: any, newValue: any) => {
                    setEntityId(newValue ? newValue.id : 0);
                  }}
                  onInputChange={(_e: any, newInputValue: string) => {
                    if (buyerType === "customer") {
                      setCustomerSearch(newInputValue);
                    }
                  }}
                  filterOptions={(options, state) => {
                    if (buyerType === "customer") return options; // Server-side filtering
                    return options.filter(o => 
                      o.label?.toLowerCase().includes(state.inputValue.toLowerCase()) || 
                      o.name?.toLowerCase().includes(state.inputValue.toLowerCase())
                    );
                  }}
                  loading={buyerType === "customer" ? loadingCustomers : false}
                  renderInput={(params: any) => (
                    <TextField
                      {...params}
                      fullWidth
                      required
                      label="Customer Name"
                      placeholder="Search..."
                    />
                  )}
                  isOptionEqualToValue={(option: any, value: any) => option.id === value?.id}
                  noOptionsText="No customer found"
                />
              </Grid>

              {/* Product selector — required by backend */}
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  select
                  required
                  label="Product *"
                  value={formData.product_id || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, product_id: Number(e.target.value) })
                  }
                >
                  {products.map((p: any) => (
                    <MenuItem key={p.product_id} value={p.product_id}>
                      {p.product_name}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid item xs={12} sm={6}>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                  <DatePicker
                    label="Demo Date *"
                    value={formData.demo_date}
                    onChange={(date) =>
                      setFormData({ ...formData, demo_date: date || new Date() })
                    }
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        required: true,
                      },
                    }}
                  />
                </LocalizationProvider>
              </Grid>

              <Grid item xs={12} sm={6}>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                  <TimePicker
                    label="Demo Time *"
                    value={formData.demo_time}
                    onChange={(time) =>
                      setFormData({ ...formData, demo_time: time || new Date() })
                    }
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        required: true,
                      },
                    }}
                  />
                </LocalizationProvider>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Demo Location"
                  value={formData.demo_location}
                  onChange={(e) =>
                    setFormData({ ...formData, demo_location: e.target.value })
                  }
                  placeholder="Enter location"
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label="Notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes about the demo"
                />
              </Grid>


            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={24} /> : "Schedule Demo"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
