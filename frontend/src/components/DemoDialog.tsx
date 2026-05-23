import { useState, useEffect } from "react";
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
  const [products, setProducts] = useState<Product[]>([]);
  const [distributors, setDistributors] = useState<Distributor[]>([]);

  const [doctors, setDoctors] = useState<any[]>([]);
  const [shopkeepers, setShopkeepers] = useState<any[]>([]);
  const [buyerType, setBuyerType] = useState<string>("mantri");
  const [entityId, setEntityId] = useState<number>(0);

  const [formData, setFormData] = useState({
    demo_date: new Date(),
    demo_time: new Date(),
    product_id: 0,
    quantity_provided: 1,
    demo_location: "",
    notes: "",
  });

  useEffect(() => {
    if (open) {
      loadFormData();
      if (initialData) {
        setBuyerType(initialData.buyerType);
        setEntityId(initialData.entityId);
      }
    }
  }, [open, initialData]);

  const loadFormData = async () => {
    try {
      setLoading(true);
      const [customersData, productsData, distributorsData, doctorsData, shopkeepersData] = await Promise.all([
        customerAPI.getAll({ limit: 1000 }),
        productAPI.getAll(),
        distributorAPI.getAll({ limit: 1000 }),
        doctorAPI.getAll({ limit: 1000 }),
        shopkeeperAPI.getAll({ limit: 1000 }),
      ]);
      setCustomers(Array.isArray(customersData) ? customersData : customersData.data || []);
      setProducts(productsData || []);
      setDistributors(Array.isArray(distributorsData) ? distributorsData : distributorsData.data || []);
      setDoctors(Array.isArray(doctorsData) ? doctorsData : doctorsData.data || []);
      setShopkeepers(Array.isArray(shopkeepersData) ? shopkeepersData : shopkeepersData.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load form data");
    } finally {
      setLoading(false);
    }
  };

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
      setError(t("sales.selectCustomer", "Please select a Customer"));
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to schedule demo");
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
                  <MenuItem value="field_officer">Field Officer</MenuItem>
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
