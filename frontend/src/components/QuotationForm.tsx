import React, { useState, useEffect, useRef } from "react";
import {
  Box, Card, CardContent, Typography, Grid, TextField, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, IconButton,
  Divider, FormControl, InputLabel, Select, MenuItem, CircularProgress, Chip,
} from "@mui/material";
import { Add as AddIcon, Delete as DeleteIcon, Save as SaveIcon, Download as DownloadIcon } from "@mui/icons-material";
import { Quotation } from "../services/leadsService";
import { leadsService } from "../services/leadsService";

export interface QuotationFormProps {
  lead: any;
  initialQuotation: Partial<Quotation>;
  onSaveDraft: (quotation: Partial<Quotation>) => void;
  onCommit: (quotation: Partial<Quotation>) => void;
  onDownloadLatest: () => void;
  onAttachmentChange?: () => void;
  loading: boolean;
  isClosed: boolean;
  isHistory?: boolean;
}

export default function QuotationForm({ lead, initialQuotation, onSaveDraft, onCommit, onDownloadLatest, onAttachmentChange, loading, isClosed, isHistory = false }: QuotationFormProps) {
  const isParul = lead.source_website === "Parul Chemicals" || lead.source_website === "parul_chemicals";
  const isPSI = !isParul; // Default to PSI for others for now
  const isVibgyor = lead.source_website?.trim().toLowerCase() === "vibgyor maple" || 
                    lead.source_website?.trim().toLowerCase() === "vibgyor_maple";

  const defaultQuotation = {
    name: lead.full_name || "",
    address_line_1: "",
    address_line_2: "",
    address_line_3: "",
    email: lead.email || "",
    quotation_no: "",
    quotation_date: new Date().toISOString().slice(0, 10),
    buyer_order_no: "",
    buyer_order_date: "",
    lr_despatched_through: "",
    destination: "",
    supplier_code: "",
    items: [],
    items_total: 0,
    transportation_charge: 0,
    grand_total: 0,
    cgst_percent: 9,
    cgst_amount: 0,
    sgst_percent: 9,
    sgst_amount: 0,
    total_gst_amount: 0,
    loose_count: 0,
    payment_terms: "50% Advance, 50% on Dispatch",
    gst_note: "",
    penalty_late_delivery: "",
    delivery_requirement: "",
    packing_forwarding: "",
    freight_charges: "",
    notes: "",
    customer_gst_no: ""
  };

  const [details, setDetails] = useState({ ...defaultQuotation, ...initialQuotation });


  useEffect(() => {
    // If it's a new quotation and details wasn't saved yet, use lead info
    if (Object.keys(initialQuotation).length === 0 || (!initialQuotation.name && !initialQuotation.quotation_no)) {
      setDetails((prev: any) => ({
        ...prev,
        name: lead.full_name || "",
        email: lead.email || "",
        items: isVibgyor 
          ? [{ po_sr_no: "1", description: "Grasshawk KLAW™ Professional Mole Trap", hsn_code: "", packages: "", quantity: 1, rate_per_unit: 0, amount: 0 }]
          : prev.items
      }));
    } else {
      const merged = { ...defaultQuotation, ...initialQuotation } as any;
      if (isVibgyor && (!merged.items || merged.items.length === 0)) {
        merged.items = [{ po_sr_no: "1", description: "Grasshawk KLAW™ Professional Mole Trap", hsn_code: "", packages: "", quantity: 1, rate_per_unit: 0, amount: 0 }];
      }
      // Replace nulls from DB with default values
      Object.keys(defaultQuotation).forEach(key => {
        if (merged[key] === null || merged[key] === undefined) {
          merged[key] = (defaultQuotation as any)[key];
        }
      });
      // Force recalculation so old quotes update to new GST rules immediately
      setDetails(calculateTotals(merged, isParul));
    }
  }, [initialQuotation, lead]);

  const handleDetailChange = (field: string, value: any) => {
    setDetails((prev: any) => {
      const next = { ...prev, [field]: value };
      return calculateTotals(next, isParul);
    });
  };

  const calculateTotals = (data: any, forParul: boolean) => {
    let itemsTotal = 0;

    const newItems = data.items.map((item: any) => {
      const amount = (Number(item.quantity) || 0) * (Number(item.rate_per_unit) || 0);
      itemsTotal += amount;
      return { ...item, amount };
    });

    data.items = newItems;
    data.items_total = itemsTotal;

    const base = forParul ? itemsTotal : itemsTotal + (Number(data.transportation_charge) || 0);
    data.cgst_amount = (base * (Number(data.cgst_percent) || 0)) / 100;
    data.sgst_amount = (base * (Number(data.sgst_percent) || 0)) / 100;
    data.total_gst_amount = data.cgst_amount + data.sgst_amount;
    data.grand_total = base + data.total_gst_amount;

    return data;
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    setDetails((prev: any) => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      return calculateTotals({ ...prev, items }, isParul);
    });
  };

  const addItem = () => {
    setDetails((prev: any) => {
      const items = [...prev.items, { po_sr_no: "", description: "", hsn_code: "", packages: "", quantity: 0, rate_per_unit: 0, amount: 0 }];
      return { ...prev, items };
    });
  };

  const removeItem = (index: number) => {
    setDetails((prev: any) => {
      const items = [...prev.items];
      items.splice(index, 1);
      return calculateTotals({ ...prev, items }, isParul);
    });
  };

  const handleSaveDraftClick = () => {
    onSaveDraft(details);
  };

  const handleCommitClick = () => {
    onCommit(details);
  };



  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="subtitle2" fontWeight={700} mb={2}>Quotation Details</Typography>
        <Grid container spacing={3}>
          {/* Customer Info Section */}
          <Grid item xs={12}>
            <Typography variant="subtitle2" color="primary" sx={{ mt: 1, mb: 0.5 }}>Customer Information</Typography>
            <Divider sx={{ mb: 1 }} />
          </Grid>
          <Grid item xs={12} md={6}><TextField label="Name" fullWidth size="small" InputLabelProps={{ shrink: true }} value={details.name || ''} onChange={(e) => handleDetailChange("name", e.target.value)} disabled={isClosed} /></Grid>
          <Grid item xs={12} md={6}><TextField label="Email" fullWidth size="small" InputLabelProps={{ shrink: true }} value={details.email || ''} onChange={(e) => handleDetailChange("email", e.target.value)} disabled={isClosed} /></Grid>
          <Grid item xs={12} md={4}><TextField label="Address Line 1" fullWidth size="small" InputLabelProps={{ shrink: true }} value={details.address_line_1 || ''} onChange={(e) => handleDetailChange("address_line_1", e.target.value)} disabled={isClosed} /></Grid>
          <Grid item xs={12} md={4}><TextField label="Address Line 2" fullWidth size="small" InputLabelProps={{ shrink: true }} value={details.address_line_2 || ''} onChange={(e) => handleDetailChange("address_line_2", e.target.value)} disabled={isClosed} /></Grid>
          <Grid item xs={12} md={4}><TextField label="Address Line 3" fullWidth size="small" InputLabelProps={{ shrink: true }} value={details.address_line_3 || ''} onChange={(e) => handleDetailChange("address_line_3", e.target.value)} disabled={isClosed} /></Grid>

          {/* Quotation Info Section */}
          <Grid item xs={12}>
            <Typography variant="subtitle2" color="primary" sx={{ mt: 2, mb: 0.5 }}>Quotation Information</Typography>
            <Divider sx={{ mb: 1 }} />
          </Grid>
          <Grid item xs={12} md={3}><TextField label="Quotation No" fullWidth size="small" InputLabelProps={{ shrink: true }} value={details.quotation_no || ''} onChange={(e) => handleDetailChange("quotation_no", e.target.value)} disabled={isClosed} /></Grid>
          <Grid item xs={12} md={3}><TextField label="Quotation Date" type="date" InputLabelProps={{ shrink: true }} fullWidth size="small" value={details.quotation_date || ''} onChange={(e) => handleDetailChange("quotation_date", e.target.value)} disabled={isClosed} /></Grid>
          <Grid item xs={12} md={3}><TextField label="Buyer Order No" fullWidth size="small" InputLabelProps={{ shrink: true }} value={details.buyer_order_no || ''} onChange={(e) => handleDetailChange("buyer_order_no", e.target.value)} disabled={isClosed} /></Grid>
          <Grid item xs={12} md={3}><TextField label="Buyer Order Date" type="date" InputLabelProps={{ shrink: true }} fullWidth size="small" value={details.buyer_order_date || ''} onChange={(e) => handleDetailChange("buyer_order_date", e.target.value)} disabled={isClosed} /></Grid>
          
          <Grid item xs={12} md={4}><TextField label="LR / Despatched Through" fullWidth size="small" InputLabelProps={{ shrink: true }} value={details.lr_despatched_through || ''} onChange={(e) => handleDetailChange("lr_despatched_through", e.target.value)} disabled={isClosed} /></Grid>
          <Grid item xs={12} md={4}><TextField label="Destination" fullWidth size="small" InputLabelProps={{ shrink: true }} value={details.destination || ''} onChange={(e) => handleDetailChange("destination", e.target.value)} disabled={isClosed} /></Grid>
          <Grid item xs={12} md={4}><TextField label="Supplier Code" fullWidth size="small" InputLabelProps={{ shrink: true }} value={details.supplier_code || ''} onChange={(e) => handleDetailChange("supplier_code", e.target.value)} disabled={isClosed} /></Grid>

          {/* Items Table */}
          <Grid item xs={12}>
            <Typography variant="subtitle2" color="primary" sx={{ mt: 2, mb: 0.5 }}>Line Items</Typography>
            <Divider sx={{ mb: 1 }} />
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>PO Sr. No.</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell>HSN Code</TableCell>
                    <TableCell>Packages</TableCell>
                    <TableCell>Quantity</TableCell>
                    <TableCell>Rate</TableCell>
                    <TableCell>Amount</TableCell>
                    {!isClosed && <TableCell align="right">Actions</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {details.items.map((item: any, index: number) => (
                    <TableRow key={index}>
                      <TableCell><TextField size="small" value={item.po_sr_no} onChange={(e) => handleItemChange(index, "po_sr_no", e.target.value)} disabled={isClosed} /></TableCell>
                      <TableCell><TextField size="small" fullWidth value={item.description} onChange={(e) => handleItemChange(index, "description", e.target.value)} disabled={isClosed} /></TableCell>
                      <TableCell><TextField size="small" value={item.hsn_code} onChange={(e) => handleItemChange(index, "hsn_code", e.target.value)} disabled={isClosed} /></TableCell>
                      <TableCell><TextField size="small" value={item.packages} onChange={(e) => handleItemChange(index, "packages", e.target.value)} disabled={isClosed} /></TableCell>
                      <TableCell><TextField size="small" type="number" inputProps={{ min: 0 }} value={item.quantity} onChange={(e) => handleItemChange(index, "quantity", Number(e.target.value))} disabled={isClosed} /></TableCell>
                      <TableCell><TextField size="small" type="number" inputProps={{ min: 0 }} value={item.rate_per_unit} onChange={(e) => handleItemChange(index, "rate_per_unit", Number(e.target.value))} disabled={isClosed} /></TableCell>
                      <TableCell>{(item.amount || 0).toFixed(2)}</TableCell>
                      {!isClosed && (
                        <TableCell align="right">
                          <IconButton size="small" color="error" onClick={() => removeItem(index)}><DeleteIcon /></IconButton>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {!isClosed && <Button variant="outlined" startIcon={<AddIcon />} size="small" onClick={addItem} sx={{ mt: 1 }}>Add Item</Button>}
          </Grid>

          {/* Totals Row */}
          <Grid item xs={12}>
            <Divider sx={{ my: 1 }} />
          </Grid>
          
          <Grid item xs={12} md={2}>
            <TextField label="Items Total" fullWidth size="small" value={details.items_total.toFixed(2)} disabled />
          </Grid>
          
          <Grid item xs={12} md={2}>
            <TextField label="Loose Count" type="number" inputProps={{ min: 0 }} fullWidth size="small" value={details.loose_count} onChange={(e) => handleDetailChange("loose_count", Number(e.target.value))} disabled={isClosed} />
          </Grid>
          
          <Grid item xs={12} md={2}>
            <TextField label="CGST %" type="number" inputProps={{ min: 0 }} fullWidth size="small" value={details.cgst_percent} onChange={(e) => handleDetailChange("cgst_percent", Number(e.target.value))} disabled={isClosed} />
          </Grid>
          <Grid item xs={12} md={2}>
            <TextField label="CGST Amount" fullWidth size="small" value={details.cgst_amount.toFixed(2)} disabled />
          </Grid>
          
          <Grid item xs={12} md={2}>
            <TextField label="SGST %" type="number" inputProps={{ min: 0 }} fullWidth size="small" value={details.sgst_percent} onChange={(e) => handleDetailChange("sgst_percent", Number(e.target.value))} disabled={isClosed} />
          </Grid>
          <Grid item xs={12} md={2}>
            <TextField label="SGST Amount" fullWidth size="small" value={details.sgst_amount.toFixed(2)} disabled />
          </Grid>

          {!isParul && (
            <Grid item xs={12} md={2}>
              <TextField label="Transport Charge" type="number" inputProps={{ min: 0 }} fullWidth size="small" value={details.transportation_charge} onChange={(e) => handleDetailChange("transportation_charge", Number(e.target.value))} disabled={isClosed} />
            </Grid>
          )}
          
          <Grid item xs={12} md={2}>
            <TextField label="Grand Total" fullWidth size="small" value={details.grand_total.toFixed(2)} disabled InputProps={{ sx: { fontWeight: 'bold' } }} />
          </Grid>

          {/* Terms Section */}
          <Grid item xs={12}>
            <Typography variant="subtitle2" color="primary" sx={{ mt: 2, mb: 0.5 }}>Terms & Conditions</Typography>
            <Divider sx={{ mb: 1 }} />
          </Grid>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth size="small">
              <InputLabel shrink>Payment Terms</InputLabel>
              <Select value={details.payment_terms || "50% Advance, 50% on Dispatch"} label="Payment Terms" disabled={isClosed} displayEmpty
                onChange={(e) => handleDetailChange("payment_terms", e.target.value)} notched={true}>
                <MenuItem value="50% Advance, 50% on Dispatch">50% Advance, 50% on Dispatch</MenuItem>
                <MenuItem value="100% Advance">100% Advance</MenuItem>
                <MenuItem value="30 Days Credit">30 Days Credit</MenuItem>
                <MenuItem value="60 Days Credit">60 Days Credit</MenuItem>
                <MenuItem value="LC at Sight">LC at Sight</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={6}><TextField label="Customer GST No" fullWidth size="small" InputLabelProps={{ shrink: true }} value={details.customer_gst_no || ''} onChange={(e) => handleDetailChange("customer_gst_no", e.target.value)} disabled={isClosed} /></Grid>
          {isParul && <Grid item xs={12} md={6}><TextField label="Penalty for late delivery" fullWidth size="small" InputLabelProps={{ shrink: true }} value={details.penalty_late_delivery || ''} onChange={(e) => handleDetailChange("penalty_late_delivery", e.target.value)} disabled={isClosed} /></Grid>}
          {isParul && <Grid item xs={12} md={6}><TextField label="Delivery Requirement" fullWidth size="small" InputLabelProps={{ shrink: true }} value={details.delivery_requirement || ''} onChange={(e) => handleDetailChange("delivery_requirement", e.target.value)} disabled={isClosed} /></Grid>}
          {isParul && <Grid item xs={12} md={6}><TextField label="Packing & Forwarding" fullWidth size="small" InputLabelProps={{ shrink: true }} value={details.packing_forwarding || ''} onChange={(e) => handleDetailChange("packing_forwarding", e.target.value)} disabled={isClosed} /></Grid>}
          {isParul && <Grid item xs={12} md={6}><TextField label="Freight Charges" fullWidth size="small" InputLabelProps={{ shrink: true }} value={details.freight_charges || ''} onChange={(e) => handleDetailChange("freight_charges", e.target.value)} disabled={isClosed} /></Grid>}
          {!isParul && <Grid item xs={12}><TextField label="Notes / Instructions" multiline rows={3} fullWidth size="small" InputLabelProps={{ shrink: true }} value={details.notes || ''} onChange={(e) => handleDetailChange("notes", e.target.value)} disabled={isClosed} /></Grid>}


        </Grid>

        <Box mt={3} display="flex" justifyContent="flex-end" gap={1}>
          {!isClosed && (
            <Button variant="outlined" startIcon={<SaveIcon />} disabled={loading} onClick={handleSaveDraftClick}>
              Save Draft
            </Button>
          )}
          <Button variant="contained" color="secondary" startIcon={<DownloadIcon />} disabled={loading} onClick={onDownloadLatest}>
            Download Latest Quote
          </Button>
          {!isClosed && (
            <Button variant="contained" color="primary" startIcon={<SaveIcon />} disabled={loading} onClick={handleCommitClick}>
              Save Final Quote
            </Button>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
