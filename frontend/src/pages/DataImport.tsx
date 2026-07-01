import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  Alert,
  LinearProgress,
  Grid,
  IconButton,
  Chip,
  InputAdornment,
  Paper,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  Select,
  MenuItem,
  Tooltip,
  Snackbar,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import {
  CloudUpload as CloudUploadIcon,
  People as PeopleIcon,
  Payment as PaymentIcon,
  SupportAgent as DemoIcon,
  ShoppingCart as SalesIcon,
  Close as CloseIcon,
  AttachFile as AttachFileIcon,
  CheckCircle as CheckCircleIcon,
  Group as GroupIcon,
  ExpandMore as ExpandMoreIcon,
} from "@mui/icons-material";
import { fileAPI } from "../services/api";
import { useTranslation } from "../hooks/useTranslation";
// @ts-ignore
import * as XLSX from "xlsx";

type ImportType = "customer" | "payment" | "demos" | "sales" | "sabhasad";

interface ImportDialog {
  type: ImportType;
  title: string;
  icon: React.ReactNode;
  description?: string;
  fields: {
    name: string;
    label: string;
    required: boolean;
    type?: string;
    multiline?: boolean;
  }[];
}

// Returns the suggested default resolution action for a given conflict type.
// PHONE_CONFLICT is intentionally left unresolved to require human review.
const getDefaultResolution = (conflictType: string): string => {
  if (conflictType === "EXACT_DUPLICATE") return "SKIP";
  if (conflictType === "PHONE_EXISTS_IN_FILE") return "SKIP";
  return "UNRESOLVED";
};

// ---------------------------------------------------------------------------
// PhoneReviewRow — memoized row component for the Sabhasad Phone Review table.
//
// Performance design:
//  - React.memo: only the row whose props changed re-renders; unchanged rows
//    are skipped entirely when a sibling dropdown changes.
//  - useCallback: stabilizes handleChange so memo comparison succeeds.
//  - Module-level sx constants: allocated once at load time, never recreated.
// ---------------------------------------------------------------------------

interface PhoneReviewRowProps {
  rowData: { uploaded_row: any; existing_db_row: any | null; conflict_type: string; };
  index: number;
  resolution: string;
  isSuggested: boolean;
  onResolutionChange: (index: number, value: string) => void;
}



const PhoneReviewRow = memo(function PhoneReviewRow({
  rowData,
  index,
  resolution,
  isSuggested,
  onResolutionChange,
}: PhoneReviewRowProps) {
  const { uploaded_row, existing_db_row, conflict_type } = rowData;

  const handleChange = useCallback(
    (e: { target: { value: unknown } }) => { onResolutionChange(index, e.target.value as string); },
    [index, onResolutionChange]
  );

  const isNameMismatch = conflict_type === "PHONE_CONFLICT" && existing_db_row != null && uploaded_row.name !== existing_db_row.name;
  const isVillageMismatch = conflict_type === "PHONE_CONFLICT" && existing_db_row != null && uploaded_row.village !== existing_db_row.village;
  const hasError = !resolution || resolution === "UNRESOLVED";
  const chipColor = conflict_type === "EXACT_DUPLICATE" ? ("default" as const) : conflict_type === "PHONE_CONFLICT" ? ("warning" as const) : ("error" as const);
  const tooltipTitle = conflict_type === "EXACT_DUPLICATE" ? "Exact Match on Phone, Name, and Village" : conflict_type === "PHONE_EXISTS_IN_FILE" ? "Duplicate phone number found within the uploaded Excel file" : "Phone number exists but customer details differ";

  return (
    <TableRow hover>
      <TableCell padding="checkbox" />
      <TableCell>
        <Tooltip title={tooltipTitle} placement="top" arrow>
          <Chip size="small" label={conflict_type.replace(/_/g, " ")} color={chipColor} sx={prSx.chip} />
        </Tooltip>
        <Typography variant="caption" display="block" color="text.secondary" sx={prSx.caption}>{tooltipTitle}</Typography>
      </TableCell>
      <TableCell>
        <Box sx={prSx.recordBox}>
          <Typography variant="body1" fontWeight={700} sx={prSx.uploadedName}>{uploaded_row.name || "-"}</Typography>
          <Box sx={prSx.chipRow}>
            <Chip size="small" variant="outlined" label={`📞 ${uploaded_row.mobile || "-"}`} sx={prSx.phoneChip} />
            <Chip size="small" variant="outlined" label={`📍 ${uploaded_row.village || "-"}`} sx={prSx.villageChip} />
            {uploaded_row.customer_code && <Chip size="small" variant="outlined" label={`🆔 ${uploaded_row.customer_code}`} sx={prSx.idChip} />}
          </Box>
        </Box>
      </TableCell>
      <TableCell>
        {existing_db_row ? (
          <Box sx={prSx.recordBox}>
            <Typography variant="body1" fontWeight={700} sx={{ mb: 0.5, color: isNameMismatch ? "warning.dark" : "text.primary", bgcolor: isNameMismatch ? "warning.light" : "transparent", px: isNameMismatch ? 0.5 : 0, borderRadius: 0.5, display: "inline-block", fontSize: "1.05rem" }}>
              {existing_db_row.name}
            </Typography>
            <Box sx={prSx.chipRow}>
              <Chip size="small" variant="outlined" label={`📞 ${existing_db_row.mobile}`} sx={prSx.phoneChip} />
              <Chip size="small" variant={isVillageMismatch ? "filled" : "outlined"} color={isVillageMismatch ? "warning" : "default"} label={`📍 ${existing_db_row.village}`} sx={{ fontSize: "0.8rem", borderColor: "divider", fontWeight: isVillageMismatch ? 700 : 500 }} />
              <Chip size="small" variant="outlined" label={`🆔 ${existing_db_row.customer_code || "-"}`} sx={prSx.idChip} />
            </Box>
          </Box>
        ) : (
          <Box sx={prSx.noRecord}><Typography variant="caption" color="text.secondary" fontStyle="italic">No existing record</Typography></Box>
        )}
      </TableCell>
      <TableCell>
        <Box sx={prSx.resolutionBox}>
          <Select size="small" value={resolution} onChange={handleChange as any} sx={prSx.select} error={hasError}>
            <MenuItem value="UNRESOLVED" disabled>-- Select Action --</MenuItem>
            <MenuItem value="SKIP">Skip Row</MenuItem>
            {conflict_type !== "EXACT_DUPLICATE" && <MenuItem value="UPDATE_EXISTING" disabled={!existing_db_row}>Update DB Customer</MenuItem>}
            {conflict_type === "PHONE_EXISTS_IN_FILE" && <MenuItem value="IMPORT_NEW">Import as New</MenuItem>}
          </Select>
          {isSuggested && <Chip label="Suggested" size="small" color="info" variant="outlined" sx={prSx.badge} />}
        </Box>
      </TableCell>
    </TableRow>
  );
});

// Module-level sx constants — allocated once at load time, never recreated during renders.
const prSx = {
  chip:         { fontWeight: "bold", fontSize: "0.75rem", borderRadius: 1, cursor: "help" },
  caption:      { mt: 1, maxWidth: 150, lineHeight: 1.2, fontSize: "0.7rem", opacity: 0.8 },
  recordBox:    { p: 1.5, bgcolor: "background.default", borderRadius: 1, border: "1px solid", borderColor: "divider" },
  uploadedName: { mb: 0.5, color: "primary.main", fontSize: "1.05rem" },
  chipRow:      { display: "flex", gap: 1, flexWrap: "wrap", mt: 0.5 },
  phoneChip:    { fontWeight: 600, fontSize: "0.85rem", color: "text.primary", borderColor: "divider" },
  villageChip:  { fontSize: "0.8rem", color: "text.primary", borderColor: "divider" },
  idChip:       { fontSize: "0.8rem", color: "text.secondary", borderColor: "divider" },
  noRecord:     { p: 1.5, display: "flex", alignItems: "center", justifyContent: "center", height: "100%", bgcolor: "action.hover", borderRadius: 1, border: "1px dashed", borderColor: "divider" },
  resolutionBox:{ p: 1, bgcolor: "background.default", borderRadius: 1, border: "1px solid", borderColor: "divider" },
  select:       { minWidth: 200, bgcolor: "background.paper", borderRadius: 1, boxShadow: "0 1px 2px rgba(0,0,0,0.05)" },
  badge:        { mt: 0.75, height: 18, fontSize: "0.62rem", fontWeight: 700, display: "flex", width: "fit-content" },
} as const;


export default function DataImport() {
  const { t } = useTranslation();
  const [openDialog, setOpenDialog] = useState<ImportType | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  
  // Phase 6 Preprocessing State
  const [reviewData, setReviewData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState(0);

  // Phase 7 Preprocessing State
  const queryClient = useQueryClient();
  const [selectedReadyIndices, setSelectedReadyIndices] = useState<number[]>([]);
  const [selectedConflictIndices, setSelectedConflictIndices] = useState<number[]>([]);
  
  // Sabhasad Conflict Resolutions: mapping from index to action (e.g. "UPDATE_EXISTING", "IMPORT_NEW", "SKIP")
  const [sabhasadResolutions, setSabhasadResolutions] = useState<Record<number, string>>({});
  // Tracks which Phone Review row indices the admin has manually overridden (clears the "Suggested" badge)
  const [sabhasadUserOverrides, setSabhasadUserOverrides] = useState<Set<number>>(new Set());

  // Bulk actions selected default values
  const [bulkActionsState, setBulkActionsState] = useState({
    EXACT_DUPLICATE: "SKIP",
    PHONE_EXISTS_IN_FILE: "SKIP",
    PHONE_CONFLICT: "UPDATE_EXISTING"
  });
  const [bulkActionSnackbar, setBulkActionSnackbar] = useState({ open: false, message: "" });

  // Show Unresolved Only Filter State
  const [showUnresolvedOnly, setShowUnresolvedOnly] = useState(false);

  // Final Confirmation Step
  const [showFinalConfirm, setShowFinalConfirm] = useState(false);
  const [importPayload, setImportPayload] = useState<any>(null);

  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";

  const [importHistory, setImportHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ─── Memoized Derived Values ─────────────────────────────────────────────────
  // Conflict-type counts — recomputed only when reviewData changes (on upload).
  const phoneReviewStats = useMemo(() => {
    const phoneReview = reviewData?.phone_review || [];
    let exactDupCount = 0;
    let phoneInFileCount = 0;
    let phoneConflictCount = 0;
    for (const r of phoneReview) {
      if (r.conflict_type === "EXACT_DUPLICATE") exactDupCount++;
      else if (r.conflict_type === "PHONE_EXISTS_IN_FILE") phoneInFileCount++;
      else if (r.conflict_type === "PHONE_CONFLICT") phoneConflictCount++;
    }
    return { exactDupCount, phoneInFileCount, phoneConflictCount, suggestableCount: exactDupCount + phoneInFileCount };
  }, [reviewData]);

  // Resolved/unresolved counts — recomputed only when sabhasadResolutions changes.
  // Single pass replaces the four separate Object.values().filter() calls that
  // were previously scattered across the render (stats panel + footer + button x2).
  const { resolvedCount, unresolvedCount } = useMemo(() => {
    const values = Object.values(sabhasadResolutions);
    let unresolved = 0;
    for (const v of values) {
      if (v === "UNRESOLVED") unresolved++;
    }
    return { resolvedCount: values.length - unresolved, unresolvedCount: unresolved };
  }, [sabhasadResolutions]);

  // Phone review mapped array with original indices + filter
  const visiblePhoneReviewRows = useMemo(() => {
    const rows = reviewData?.phone_review || [];
    const mapped = rows.map((r: any, idx: number) => ({ rowData: r, originalIndex: idx }));
    if (!showUnresolvedOnly) return mapped;
    
    return mapped.filter((item: any) => {
      const res = sabhasadResolutions[item.originalIndex] ?? getDefaultResolution(item.rowData.conflict_type);
      return !res || res === "UNRESOLVED";
    });
  }, [reviewData?.phone_review, showUnresolvedOnly, sabhasadResolutions]);

  // Grouped visible phone review rows
  const groupedPhoneReviewRows = useMemo(() => {
    const exactDups: any[] = [];
    const phoneExists: any[] = [];
    const phoneConflicts: any[] = [];
    
    for (const item of visiblePhoneReviewRows) {
      if (item.rowData.conflict_type === "EXACT_DUPLICATE") exactDups.push(item);
      else if (item.rowData.conflict_type === "PHONE_EXISTS_IN_FILE") phoneExists.push(item);
      else if (item.rowData.conflict_type === "PHONE_CONFLICT") phoneConflicts.push(item);
    }
    return { exactDups, phoneExists, phoneConflicts };
  }, [visiblePhoneReviewRows]);

  const fetchHistory = async () => {
    try {
      setHistoryLoading(true);
      const data = await fileAPI.getImportHistory();
      setImportHistory(data || []);
    } catch (err) {
      console.error("Failed to fetch import history:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleDownloadDistributorTemplate = () => {
    const headers = [
      "MANTRI_NAME",
      "MANTRI_MOBILE",
      "VILLAGE",
      "TALUKA",
      "DISTRICT",
      "STATE",
      "DAIRY_TYPE",
      "RECORD_DATE",
      "DAIRY_TIME_MORNING",
      "DAIRY_TIME_EVENING",
      "SABHASAD_COUNT",
      "CONTACT_IN_GROUP",
      "SABHASAD_MORNING",
      "SABHASAD_EVENING",
      "MILK_COLLECTION_MORNING",
      "MILK_COLLECTION_EVENING",
      "NATURE_OF_SABHASAD",
      "SUPPORT",
      "ANIMAL_DELIVERY_PERIOD",
      "PAYMENT_RECOVERY_DEMO",
      "PAYMENT_RECOVERY_DISPATCH",
      "DECISION_MAKER_AVAILABILITY_MORNING",
      "DECISION_MAKER_AVAILABILITY_EVENING",
      "HIGH_HOLDER_TO_LOW_HOLDER_VILLAGES",
      "CURRENT_STATUS_OF_BUSINESS",
      "STATUS",
    ];

    const sampleRow = {
      MANTRI_NAME: "RAJESHBHAI PATEL",
      MANTRI_MOBILE: "9876543210",
      VILLAGE: "RAMPUR",
      TALUKA: "ANAND",
      DISTRICT: "ANAND",
      STATE: "GUJARAT",
      DAIRY_TYPE: "AMUL",
      RECORD_DATE: "2024-05-01",
      DAIRY_TIME_MORNING: "07:00",
      DAIRY_TIME_EVENING: "18:00",
      SABHASAD_COUNT: 150,
      CONTACT_IN_GROUP: 120,
      SABHASAD_MORNING: 80,
      SABHASAD_EVENING: 70,
      MILK_COLLECTION_MORNING: 500,
      MILK_COLLECTION_EVENING: 450,
      NATURE_OF_SABHASAD: "AWARE",
      SUPPORT: "HIGH",
      ANIMAL_DELIVERY_PERIOD: "15 DAYS",
      PAYMENT_RECOVERY_DEMO: 7,
      PAYMENT_RECOVERY_DISPATCH: 10,
      DECISION_MAKER_AVAILABILITY_MORNING: "YES",
      DECISION_MAKER_AVAILABILITY_EVENING: "YES",
      HIGH_HOLDER_TO_LOW_HOLDER_VILLAGES: "HIGH",
      CURRENT_STATUS_OF_BUSINESS: "ACTIVE",
      STATUS: "ACTIVE",
    };

    const ws = XLSX.utils.json_to_sheet([sampleRow], { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Distributors");
    XLSX.writeFile(wb, "distributor_import_template.xlsx");
  };

  const handleDownloadSabhasadTemplate = () => {
    const headers = [
      "CODE",
      "SABHASAD NAME",
      "NUMBER",
      "VILLAGE",
      "TALUKA",
      "DISTRICT",
      "STATE"
    ];

    const sampleRow = {
      "CODE": "CUST001",
      "SABHASAD NAME": "RAHUL PATEL",
      "NUMBER": "9876543210",
      "VILLAGE": "ANAND",
      "TALUKA": "ANAND",
      "DISTRICT": "ANAND",
      "STATE": "GUJARAT"
    };

    const ws = XLSX.utils.json_to_sheet([sampleRow], { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sabhasads");
    XLSX.writeFile(wb, "sabhasad_import_template.xlsx");
  };


  const importDialogs: ImportDialog[] = [
    {
      type: "customer",
      title: t("import.distributorImport", "Distributor Import"),
      icon: <GroupIcon sx={{ fontSize: 48, color: "primary.main" }} />,
      description: "Import the files containing Mantri data",
      fields: [],
    },
    {
      type: "payment",
      title: t("import.paymentImport", "Payment Import"),
      icon: <PaymentIcon sx={{ fontSize: 48, color: "success.main" }} />,
      fields: [
        { name: "sale_id", label: "Sale ID", required: false },
        {
          name: "amount",
          label: "Payment Amount",
          required: false,
          type: "number",
        },
        { name: "payment_method", label: "Payment Method", required: false },
        {
          name: "payment_date",
          label: "Payment Date",
          required: false,
          type: "date",
        },
        { name: "reference", label: "Reference Number", required: false },
        { name: "notes", label: "Notes", required: false, multiline: true },
      ],
    },
    {
      type: "demos",
      title: t("import.demosImport", "Demos Import"),
      icon: <DemoIcon sx={{ fontSize: 48, color: "warning.main" }} />,
      fields: [
        { name: "customer_name", label: "Customer Name", required: false },
        { name: "mobile", label: "Mobile Number", required: false },
        { name: "village", label: "Village", required: false },
        { name: "demo_date", label: "Demo Date", required: false, type: "date" },
        { name: "product", label: "Product Name", required: false },
        { name: "notes", label: "Notes", required: false, multiline: true },
      ],
    },
    {
      type: "sales",
      title: t("import.salesImport", "Sales Import"),
      icon: <SalesIcon sx={{ fontSize: 48, color: "error.main" }} />,
      fields: [
        { name: "customer_name", label: "Customer Name", required: false },
        { name: "mobile", label: "Customer Mobile", required: false },
        { name: "village", label: "Village", required: false },
        { name: "sale_date", label: "Sale Date", required: false, type: "date" },
        { name: "product_name", label: "Product Name", required: false },
        { name: "quantity", label: "Quantity", required: false, type: "number" },
        { name: "rate", label: "Rate", required: false, type: "number" },
        { name: "notes", label: "Notes", required: false, multiline: true },
      ],
    },
    {
      type: "sabhasad",
      title: "Sabhasad Import",
      description: "Import the files containing Sabhasad data",
      icon: <GroupIcon sx={{ fontSize: 48, color: "info.main" }} />,
      fields: [],
    },
  ];

  const handleOpenDialog = (type: ImportType) => {
    setOpenDialog(type);
    setFormData({});
    setSelectedFile(null);
    setError(null);
    setSuccess(null);
  };

  const handleCloseDialog = () => {
    setOpenDialog(null);
    setFormData({});
    setSelectedFile(null);
    setError(null);
    setSuccess(null);
    setUploadProgress(0);
    setReviewData(null);
    setActiveTab(0);
    setSelectedReadyIndices([]);
    setSelectedConflictIndices([]);
    setSabhasadResolutions({});
    setSabhasadUserOverrides(new Set());
    setShowFinalConfirm(false);
    setImportPayload(null);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
        setSelectedFile(file);
        setError(null);
      } else {
        setError("Please select a valid Excel file (.xlsx or .xls)");
        setSelectedFile(null);
      }
    }
  };

  const handleFieldChange = (fieldName: string, value: string) => {
    setFormData((prev) => ({ ...prev, [fieldName]: value }));
  };

  const handleSubmit = async () => {
    const currentDialog = importDialogs.find((d) => d.type === openDialog);
    if (!currentDialog) return;

    // Validate required fields
    const missingFields = currentDialog.fields
      .filter((field) => field.required && !formData[field.name])
      .map((field) => field.label);

    if (missingFields.length > 0) {
      setError(`Please fill required fields: ${missingFields.join(", ")}`);
      return;
    }

    if (!selectedFile) {
      setError("Please select an Excel file to upload");
      return;
    }

    try {
      setUploading(true);
      setError(null);
      setUploadProgress(0);

      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      // Create FormData and append ONLY the file
      if (!selectedFile) {
        setError("No file selected");
        return;
      }

      const formDataToSend = new FormData();
      formDataToSend.append("file", selectedFile);
      
      if (openDialog === "customer" || openDialog === "sabhasad") {
        let response;
        if (openDialog === "customer") {
          response = await fileAPI.preprocessDistributors(formDataToSend);
        } else {
          response = await fileAPI.preprocessSabhasads(formDataToSend);
        }
        
        console.log(`🚀 [REVIEW] Preprocess Response:`, response);
        
        setReviewData(response);
        if (response && response.ready_to_import) {
          setSelectedReadyIndices(response.ready_to_import.map((_: any, idx: number) => idx));
        }
        setSelectedConflictIndices([]);
        
        if (openDialog === "sabhasad" && response && response.phone_review) {
          const defaultResolutions: Record<number, string> = {};
          response.phone_review.forEach((c: any, idx: number) => {
            defaultResolutions[idx] = getDefaultResolution(c.conflict_type);
          });
          setSabhasadResolutions(defaultResolutions);
          setSabhasadUserOverrides(new Set()); // Clear any stale overrides from a previous upload
        }
        
        setUploading(false);
        // Let the dialog stay open to show review UI
        return;
      }

      // Original direct upload for others
      const response = await fileAPI.upload(formDataToSend);

      clearInterval(progressInterval);
      setUploadProgress(100);

      // Show success message
      const successMsg =
        response.message || `${currentDialog.title} completed successfully!`;
      setSuccess(successMsg);
      fetchHistory();

      // Reset after 2 seconds and close dialog
      setTimeout(() => {
        handleCloseDialog();
      }, 2000);
    } catch (err: any) {
      let errorMessage = "Upload failed. Please try again.";

      if (err?.response?.data?.detail) {
        errorMessage = err.response.data.detail;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }

      setError(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!reviewData) return;
    
    if (openDialog === "sabhasad") {
      // Build the payload but don't submit yet — show final confirm step
      const readyRows = (selectedReadyIndices || []).map(
        (idx) => ({
          row: reviewData.ready_to_import[idx].uploaded_row,
          action: "IMPORT"
        })
      );
      const conflictRows = Object.entries(sabhasadResolutions)
        .filter(([_, action]) => action !== "SKIP")
        .map(([idxStr, action]) => {
           const idx = parseInt(idxStr, 10);
           return {
             row: reviewData.phone_review[idx].uploaded_row,
             action: action,
             existing_id: reviewData.phone_review[idx].existing_db_row?.customer_id
           };
        });
      const skippedRows = Object.entries(sabhasadResolutions)
        .filter(([_, action]) => action === "SKIP");

      setImportPayload({
        rowsToImport: [...readyRows, ...conflictRows],
        readyCount: readyRows.length,
        resolvedConflictCount: conflictRows.length,
        skippedCount: skippedRows.length,
        invalidCount: reviewData.summary.invalid_rows || 0,
      });
      setShowFinalConfirm(true);
    } else {
      // Non-sabhasad: proceed directly as before
      handleDirectImport();
    }
  };

  const handleDirectImport = async () => {
    if (!reviewData) return;
    try {
      setUploading(true);
      setError(null);
      
      let importResponse;
      
      const readyRows = (selectedReadyIndices || []).map(
        (idx) => {
          const item = reviewData.ready_to_import[idx];
          return item?.uploaded_row || item?.row || item;
        }
      );
      const conflictRows = (selectedConflictIndices || []).map(
        (idx) => {
          const item = reviewData.possible_conflicts[idx];
          return item?.uploaded_row || item?.row || item;
        }
      );
      const rowsToImport = [...readyRows, ...conflictRows].filter(Boolean);
      
      console.log("🚀 [P7 CONFIRM IMPORT] Selected Rows Count:", rowsToImport.length);
      
      importResponse = await fileAPI.confirmImportDistributors(rowsToImport, selectedFile?.name);
      
      // Refresh distributor table in query cache
      queryClient.invalidateQueries({ queryKey: ["distributors"] });
      queryClient.invalidateQueries({ queryKey: ["resolved_distributors"] });
      
      console.log("✅ [P7 CONFIRM IMPORT] Response:", importResponse);
      
      setSuccess(`Import completed! Successfully imported ${importResponse.imported_count} rows.`);
      
      fetchHistory();
      
      // Reset state and close dialog after a brief delay
      setTimeout(() => {
        handleCloseDialog();
      }, 2000);
    } catch (err: any) {
      let errorMessage = "Import failed. Please try again.";
      if (err?.response?.data?.detail) {
        errorMessage = err.response.data.detail;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const handleFinalSubmit = async () => {
    if (!importPayload) return;
    try {
      setUploading(true);
      setError(null);
      const importResponse = await fileAPI.confirmImportSabhasads(importPayload.rowsToImport, selectedFile?.name);
      queryClient.invalidateQueries({ queryKey: ["sabhasad"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      console.log("✅ [FINAL SUBMIT] Response:", importResponse);
      setSuccess(`Import completed! Successfully imported ${importResponse.imported_count} rows.`);
      fetchHistory();
      setTimeout(() => { handleCloseDialog(); }, 2000);
    } catch (err: any) {
      let errorMessage = "Import failed. Please try again.";
      if (err?.response?.data?.detail) errorMessage = err.response.data.detail;
      else if (err instanceof Error) errorMessage = err.message;
      setError(errorMessage);
      setShowFinalConfirm(false); // Let user go back and try again
    } finally {
      setUploading(false);
    }
  };

  // Bulk-applies the suggested action (SKIP) to all rows that have an automatic suggestion.
  // PHONE_CONFLICT rows are intentionally left unresolved.
  // Phase 1 fix: builds the new Set once outside the loop; calls setState only twice total.
  const handleApplyAllSuggestions = () => {
    if (!reviewData?.phone_review) return;
    const newResolutions: Record<number, string> = { ...sabhasadResolutions };
    const newOverrides = new Set(sabhasadUserOverrides); // single copy, not N copies
    reviewData.phone_review.forEach((r: any, idx: number) => {
      const suggestion = getDefaultResolution(r.conflict_type);
      if (suggestion !== "UNRESOLVED") {
        newResolutions[idx] = suggestion;
        newOverrides.delete(idx); // remove so "Suggested" badge reappears
      }
    });
    setSabhasadResolutions(newResolutions); // one setState call
    setSabhasadUserOverrides(newOverrides); // one setState call
  };

  // Bulk-applies a specific action to all rows matching a specific conflict type.
  const handleBulkAction = (conflictType: string, action: string, count: number) => {
    if (!reviewData?.phone_review) return;
    const newResolutions: Record<number, string> = { ...sabhasadResolutions };
    const newOverrides = new Set(sabhasadUserOverrides);
    
    reviewData.phone_review.forEach((r: any, idx: number) => {
      if (r.conflict_type === conflictType) {
        newResolutions[idx] = action;
        newOverrides.add(idx); // mark as manually resolved to remove Suggested badge
      }
    });
    
    setSabhasadResolutions(newResolutions);
    setSabhasadUserOverrides(newOverrides);
    
    // Show snackbar feedback
    const conflictLabel = conflictType.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    const actionLabel = action.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    setBulkActionSnackbar({ open: true, message: `✓ Applied "${actionLabel}" to ${count} ${conflictLabel} rows.` });
  };

  // Stable callback passed to every PhoneReviewRow.
  // Empty deps: only uses setState updater functions (which are always stable).
  const handleResolutionChange = useCallback((index: number, value: string) => {
    setSabhasadResolutions(prev => ({ ...prev, [index]: value }));
    setSabhasadUserOverrides(prev => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  }, []);

  const getCardColor = (type: ImportType) => {
    switch (type) {
      case "customer":
        return "primary.main";
      case "payment":
        return "success.main";
      case "demos":
        return "warning.main";
      case "sales":
        return "error.main";
      case "sabhasad":
        return "info.main";
      default:
        return "primary.main";
    }
  };

  const historyColumns: GridColDef[] = [
    {
      field: "import_batch_id",
      headerName: "Session ID",
      flex: 1.5,
      minWidth: 150,
      renderCell: (params) => (
        <Chip
          label={params.value}
          size="small"
          variant="outlined"
          sx={{
            fontFamily: "monospace",
            fontWeight: 600,
            borderColor: "divider",
          }}
        />
      ),
    },
    {
      field: "module_name",
      headerName: "Module",
      flex: 1,
      minWidth: 120,
      renderCell: (params) => {
        const value = params.value || "UNKNOWN";
        let color: "primary" | "secondary" | "success" | "error" | "info" | "warning" = "primary";
        if (value === "DISTRIBUTORS") color = "primary";
        else if (value === "SABHASAD" || value === "CUSTOMERS") color = "info";
        else if (value === "SALES") color = "error";
        else if (value === "DEMOS") color = "warning";
        else if (value === "PAYMENTS") color = "success";
        
        return (
          <Chip
            label={value}
            size="small"
            color={color}
            sx={{ fontWeight: 600 }}
          />
        );
      },
    },
    {
      field: "file_name",
      headerName: "File Name",
      flex: 2,
      minWidth: 180,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {params.value || "-"}
        </Typography>
      ),
    },
    {
      field: "imported_by_email",
      headerName: "Imported By",
      flex: 1.8,
      minWidth: 160,
      renderCell: (params) => (
        <Box sx={{ display: "flex", flexDirection: "column" }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {params.value || "-"}
          </Typography>
          {params.row.imported_by_role && (
            <Typography variant="caption" color="text.secondary">
              {params.row.imported_by_role.toUpperCase()}
            </Typography>
          )}
        </Box>
      ),
    },
    {
      field: "created_at",
      headerName: "Imported At",
      flex: 1.5,
      minWidth: 150,
      renderCell: (params) => {
        if (!params.value) return "-";
        try {
          const date = new Date(params.value);
          return date.toLocaleString();
        } catch {
          return params.value;
        }
      },
    },
    {
      field: "import_status",
      headerName: "Status",
      flex: 1,
      minWidth: 100,
      renderCell: (params) => {
        const isSuccess = params.value === "SUCCESS";
        return (
          <Chip
            label={params.value || "SUCCESS"}
            size="small"
            color={isSuccess ? "success" : "error"}
            variant="filled"
            sx={{ fontWeight: 600 }}
          />
        );
      },
    },
    {
      field: "total_records",
      headerName: "Total Records",
      flex: 1,
      minWidth: 110,
      type: "number",
      align: "center",
      headerAlign: "center",
    },
    {
      field: "imported_records",
      headerName: "Imported Records",
      flex: 1,
      minWidth: 130,
      type: "number",
      align: "center",
      headerAlign: "center",
      renderCell: (params) => (
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            color: params.value > 0 ? "success.main" : "text.primary",
          }}
        >
          {params.value}
        </Typography>
      ),
    },
  ];

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
          <CloudUploadIcon sx={{ mr: 1, verticalAlign: "middle" }} />
          {t("import.title", "Data Import")}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {t("import.selectTypeSubtitle", "Select an import type and upload your Excel file")}
        </Typography>
      </Box>

      {/* Import Cards Grid */}
      <Grid container spacing={3}>
        {importDialogs.map((dialog) => (
          <Grid item xs={12} sm={6} md={3} key={dialog.type}>
            <Card
              sx={{
                cursor: "pointer",
                transition: "all 0.3s",
                height: "100%",
                "&:hover": {
                  transform: "translateY(-8px)",
                  boxShadow: 6,
                },
                border: 2,
                borderColor: "transparent",
                "&:hover .icon-container": {
                  backgroundColor: getCardColor(dialog.type),
                  "& svg": {
                    color: "white",
                  },
                },
              }}
              onClick={() => handleOpenDialog(dialog.type)}
            >
              <CardContent
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  py: 4,
                  height: "100%",
                }}
              >
                <Box
                  className="icon-container"
                  sx={{
                    mb: 2,
                    p: 2,
                    borderRadius: "50%",
                    backgroundColor: "action.hover",
                    transition: "all 0.3s",
                  }}
                >
                  {dialog.icon}
                </Box>
                <Typography
                  variant="h6"
                  sx={{ fontWeight: 600, textAlign: "center" }}
                >
                  {dialog.title}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 1, textAlign: "center" }}
                >
                  {t("import.clickToImport", "Click to import")}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Instructions Card */}
      <Card sx={{ mt: 4 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            📋 {t("import.instructions", "Instructions")}
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
                <CheckCircleIcon color="success" />
                <Box>
                  <Typography variant="subtitle2" fontWeight={600}>
                    {t("import.excelFormat", "Excel Format")}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t("import.excelFormatDesc", "Upload .xlsx or .xls files only")}
                  </Typography>
                </Box>
              </Box>
            </Grid>
            <Grid item xs={12} md={6}>
              <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
                <CheckCircleIcon color="success" />
                <Box>
                  <Typography variant="subtitle2" fontWeight={600}>
                    {t("import.fillDetails", "Fill Details")}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t("import.fillDetailsDesc", "Complete all required fields before upload")}
                  </Typography>
                </Box>
              </Box>
            </Grid>
            <Grid item xs={12} md={6}>
              <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
                <CheckCircleIcon color="success" />
                <Box>
                  <Typography variant="subtitle2" fontWeight={600}>
                    {t("import.dataValidation", "Data Validation")}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t("import.dataValidationDesc", "Ensure Excel data matches the required format")}
                  </Typography>
                </Box>
              </Box>
            </Grid>
            <Grid item xs={12} md={6}>
              <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
                <CheckCircleIcon color="success" />
                <Box>
                  <Typography variant="subtitle2" fontWeight={600}>
                    {t("import.processingTime", "Processing Time")}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t("import.processingTimeDesc", "Large files may take a few moments to process")}
                  </Typography>
                </Box>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Import History / Audit Trail Card */}
      <Card sx={{ mt: 4, mb: 4, overflow: "hidden" }}>
        <CardContent sx={{ pb: 0 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 1 }}>
              🕒 Import History & Audit Trail
            </Typography>
            <Button
              size="small"
              onClick={fetchHistory}
              disabled={historyLoading}
              variant="outlined"
              sx={{ borderRadius: 2, textTransform: "none" }}
            >
              {historyLoading ? "Refreshing..." : "Refresh Logs"}
            </Button>
          </Box>
        </CardContent>
        <Box sx={{ height: 400, width: "100%", px: 2, pb: 2 }}>
          <DataGrid
            rows={importHistory}
            columns={historyColumns}
            getRowId={(row) => row.import_id || row.import_batch_id || Math.random()}
            loading={historyLoading}
            pageSizeOptions={[5, 10, 25]}
            initialState={{
              pagination: {
                paginationModel: { pageSize: 5 },
              },
            }}
            rowHeight={64}
            disableRowSelectionOnClick
            sx={{
              border: "none",
              "& .MuiDataGrid-row": {
                borderRadius: "6px",
                transition: "all 0.2s ease",
                backgroundColor: isDarkMode ? "transparent" : "#fff",
                color: isDarkMode ? "#E5E7EB" : "inherit",
                "&:hover": {
                  backgroundColor: isDarkMode ? "rgba(255,255,255,0.05) !important" : "action.hover",
                },
              },
              "& .MuiDataGrid-cell": {
                borderBottom: "1px solid",
                borderColor: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
                display: "flex",
                alignItems: "center",
              },
              "& .MuiDataGrid-columnHeaders": {
                backgroundColor: isDarkMode ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                borderBottom: "2px solid",
                borderColor: "divider",
              },
            }}
          />
        </Box>
      </Card>

      {/* Import Dialog */}
      {openDialog && (
        <Dialog
          open={Boolean(openDialog)}
          onClose={handleCloseDialog}
          fullScreen={openDialog === "sabhasad" && !!reviewData}
          maxWidth={openDialog === "sabhasad" && reviewData ? false : "md"}
          fullWidth
          sx={{ '& .MuiDialog-paper': openDialog === "sabhasad" && reviewData ? { height: '100%', maxHeight: 'none' } : {} }}
        >
          <DialogTitle sx={{ pb: 1 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                {importDialogs.find((d) => d.type === openDialog)?.icon}
                <Box>
                  <Typography variant="h5" fontWeight={600}>
                    {importDialogs.find((d) => d.type === openDialog)?.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {importDialogs.find((d) => d.type === openDialog)?.description || t("import.fillDetailsSubtitle", "Fill in the details below to import your data")}
                  </Typography>
                </Box>
              </Box>
              <IconButton onClick={handleCloseDialog} size="large">
                <CloseIcon />
              </IconButton>
            </Box>
          </DialogTitle>
          <DialogContent
            sx={{ maxHeight: "70vh", overflowY: "auto", pt: 4, px: 5 }}
            dividers
          >
            {error && (
              <Alert
                severity="error"
                sx={{ mb: 3 }}
                onClose={() => setError(null)}
              >
                {typeof error === "string"
                  ? error
                  : (error as any)?.response?.data?.detail || JSON.stringify(error)}
              </Alert>
            )}

            {success && (
              <Alert severity="success" sx={{ mb: 3 }}>
                {success}
              </Alert>
            )}

            {reviewData ? (
              // Phase 6 Preprocessing Review UI
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6">Import Review Dashboard</Typography>
                    {openDialog === "sabhasad" && reviewData?.phone_review?.length > 0 && (
                        <Button 
                            variant="outlined" 
                            color="warning" 
                            size="small" 
                            onClick={() => {
                                // Simple CSV export for conflicts
                                const header = "Customer ID,Uploaded Name,Uploaded Village,Uploaded Mobile,Existing Name,Existing Village,Existing Mobile,Conflict Type,Confidence,Reason\n";
                                const rows = reviewData.phone_review.map((r: any) => {
                                    return `"${r.uploaded_row?.customer_code || ''}","${r.uploaded_row?.name || ''}","${r.uploaded_row?.village || ''}","${r.uploaded_row?.mobile || ''}","${r.existing_db_row?.name || ''}","${r.existing_db_row?.village || ''}","${r.existing_db_row?.mobile || ''}","${r.conflict_type || ''}","${r.confidence || ''}","${r.reason || ''}"`;
                                }).join("\n");
                                const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
                                const url = URL.createObjectURL(blob);
                                const link = document.createElement("a");
                                link.setAttribute("href", url);
                                link.setAttribute("download", "Phone_Review.csv");
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                            }}
                        >
                            Download Phone_Review.csv
                        </Button>
                    )}
                </Box>
                <Grid container spacing={2} sx={{ mb: 3 }}>
                  <Grid item xs={3}>
                    <Card sx={{ bgcolor: "success.50", textAlign: "center", py: 2 }}>
                      <Typography variant="h5" color="success.main" fontWeight="bold">{reviewData.summary.ready_to_import || 0}</Typography>
                      <Typography variant="body2" color="text.secondary">Ready</Typography>
                    </Card>
                  </Grid>
                  {openDialog === "sabhasad" ? (
                      <Grid item xs={6}>
                        <Card sx={{ bgcolor: "info.50", textAlign: "center", py: 2 }}>
                          <Typography variant="h5" color="info.main" fontWeight="bold">{reviewData.summary.phone_review || 0}</Typography>
                          <Typography variant="body2" color="text.secondary">Phone Review</Typography>
                        </Card>
                      </Grid>
                  ) : (
                    <>
                      <Grid item xs={3}>
                        <Card sx={{ bgcolor: "warning.50", textAlign: "center", py: 2 }}>
                          <Typography variant="h5" color="warning.main" fontWeight="bold">{reviewData.summary.exact_duplicates || 0}</Typography>
                          <Typography variant="body2" color="text.secondary">Exact Duplicates</Typography>
                        </Card>
                      </Grid>
                      <Grid item xs={3}>
                        <Card sx={{ bgcolor: "info.50", textAlign: "center", py: 2 }}>
                          <Typography variant="h5" color="info.main" fontWeight="bold">{reviewData.summary.possible_conflicts || 0}</Typography>
                          <Typography variant="body2" color="text.secondary">Conflicts</Typography>
                        </Card>
                      </Grid>
                    </>
                  )}
                  <Grid item xs={3}>
                    <Card sx={{ bgcolor: "error.50", textAlign: "center", py: 2 }}>
                      <Typography variant="h5" color="error.main" fontWeight="bold">{reviewData.summary.invalid_rows || 0}</Typography>
                      <Typography variant="body2" color="text.secondary">Invalid</Typography>
                    </Card>
                  </Grid>
                </Grid>

                <Tabs value={activeTab} onChange={(e, nv) => setActiveTab(nv)} sx={{ mb: 2 }}>
                  <Tab value={0} label="Ready To Import" />
                  {openDialog === "sabhasad" ? (
                    <Tab value={1} label="Phone Review" />
                  ) : [
                    <Tab key="exact" value={1} label="Exact Duplicates" />,
                    <Tab key="conflicts" value={2} label="Possible Conflicts" />
                  ]}
                  <Tab value={3} label="Invalid Rows" />
                </Tabs>

                {activeTab === 1 && openDialog !== "sabhasad" && (
                  <Alert severity="warning" sx={{ mb: 2 }}>
                    Exact duplicates already exist in the database and cannot be imported directly to avoid data corruption.
                  </Alert>
                )}

                {activeTab === 3 && (
                  <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Alert severity="error" sx={{ flex: 1, mr: openDialog === "sabhasad" ? 2 : 0 }}>
                      Invalid rows contain validation failures and are blocked from import. Fix these rows in your spreadsheet to re-upload.
                    </Alert>
                    {openDialog === "sabhasad" && reviewData?.invalid_rows?.length > 0 && (
                      <Button
                        variant="outlined"
                        color="error"
                        size="small"
                        onClick={() => {
                           const header = "Row Number,Customer ID,Name,Village,Mobile,Validation Errors\n";
                           const rows = reviewData.invalid_rows.map((r: any, idx: number) => {
                              const row = r.uploaded_row || {};
                              let errors = [];
                              if (!row.name) errors.push("Missing name");
                              if (!row.village) errors.push("Missing village");
                              const mobile = row.mobile;
                              if (mobile === undefined || mobile === null || mobile === "") {
                                  errors.push("Missing phone number");
                              } else {
                                  const str = String(mobile).trim();
                                  if (str.length === 0 || str.toLowerCase() === "na" || str.toLowerCase() === "null" || str === "-") {
                                      errors.push("Phone number is empty");
                                  } else if (/[a-zA-Z]/.test(str)) {
                                      errors.push("Phone number contains non-numeric characters");
                                  } else {
                                      const digits = str.replace(/\D/g, '');
                                      if (digits.length !== 10) {
                                          errors.push("Phone number must be exactly 10 digits");
                                      } else if (str !== digits) {
                                          errors.push("Invalid mobile format");
                                      }
                                  }
                              }
                              if (errors.length === 0) errors = [r.reason];
                              return `"${idx + 1}","${row.customer_code || ''}","${row.name || ''}","${row.village || ''}","${row.mobile || ''}","${errors.join(', ')}"`;
                           }).join("\n");
                           const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
                           const url = URL.createObjectURL(blob);
                           const link = document.createElement("a");
                           link.setAttribute("href", url);
                           link.setAttribute("download", "Invalid_Rows.csv");
                           document.body.appendChild(link);
                           link.click();
                           document.body.removeChild(link);
                        }}
                      >
                        Export Invalid Rows
                      </Button>
                    )}
                  </Box>
                )}

                {openDialog === "sabhasad" && activeTab === 1 && (
                  <>
                    {/* Phone Review Summary Statistics — uses memoized phoneReviewStats and unresolvedCount */}
                    <Box sx={{ mb: 2, p: 2, bgcolor: 'background.default', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                        <Typography variant="subtitle2" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>
                          Phone Review Summary
                        </Typography>
                        {phoneReviewStats.suggestableCount > 0 && (
                          <Button
                            variant="contained"
                            color="info"
                            size="small"
                            onClick={handleApplyAllSuggestions}
                            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 1.5, fontSize: '0.8rem' }}
                          >
                            ✓ Apply All Suggested Actions
                          </Button>
                        )}
                      </Box>
                      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5 }}>
                        <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Chip size="small" label="EXACT DUPLICATE" sx={{ height: 20, fontSize: '0.62rem', fontWeight: 'bold' }} />
                            <Typography variant="h6" fontWeight={800} color="text.primary">{phoneReviewStats.exactDupCount}</Typography>
                          </Box>
                          <Typography variant="caption" color="success.main" fontWeight={600}>Auto-suggested: Skip</Typography>
                        </Box>
                        <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Chip size="small" color="error" label="DUPLICATE IN FILE" sx={{ height: 20, fontSize: '0.62rem', fontWeight: 'bold' }} />
                            <Typography variant="h6" fontWeight={800} color="text.primary">{phoneReviewStats.phoneInFileCount}</Typography>
                          </Box>
                          <Typography variant="caption" color="success.main" fontWeight={600}>Auto-suggested: Skip</Typography>
                        </Box>
                        <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: unresolvedCount > 0 ? 'warning.50' : 'background.paper', border: '1px solid', borderColor: unresolvedCount > 0 ? 'warning.300' : 'divider', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Chip size="small" color="warning" label="PHONE CONFLICT" sx={{ height: 20, fontSize: '0.62rem', fontWeight: 'bold' }} />
                            <Typography variant="h6" fontWeight={800} color={unresolvedCount > 0 ? 'warning.dark' : 'text.primary'}>{phoneReviewStats.phoneConflictCount}</Typography>
                          </Box>
                          <Typography variant="caption" color={unresolvedCount > 0 ? 'warning.dark' : 'text.secondary'} fontWeight={600}>
                            {unresolvedCount > 0 ? `${unresolvedCount} require manual review` : 'All resolved ✓'}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>

                    {/* Bulk Actions */}
                    {(phoneReviewStats.exactDupCount > 0 || phoneReviewStats.phoneInFileCount > 0 || phoneReviewStats.phoneConflictCount > 0) && (
                      <Box sx={{ mb: 2, p: 1.5, bgcolor: 'background.default', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                        <Typography variant="caption" fontWeight="bold" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>BULK ACTIONS:</Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          {phoneReviewStats.exactDupCount > 0 && (
                            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, p: 1, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                              <Typography variant="body2" fontWeight={700} sx={{ width: { xs: '100%', sm: 220 } }}>EXACT DUPLICATE ({phoneReviewStats.exactDupCount})</Typography>
                              <Typography variant="caption" color="text.secondary">Default Action:</Typography>
                              <Select size="small" value={bulkActionsState.EXACT_DUPLICATE} onChange={(e) => setBulkActionsState(p => ({ ...p, EXACT_DUPLICATE: e.target.value as string }))} sx={{ minWidth: 150, height: 32 }}>
                                <MenuItem value="SKIP">Skip</MenuItem>
                              </Select>
                              <Button variant="contained" size="small" onClick={() => handleBulkAction("EXACT_DUPLICATE", bulkActionsState.EXACT_DUPLICATE, phoneReviewStats.exactDupCount)} sx={{ textTransform: 'none', height: 32, px: 2 }}>Apply to All</Button>
                            </Box>
                          )}
                          {phoneReviewStats.phoneInFileCount > 0 && (
                            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, p: 1, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                              <Typography variant="body2" fontWeight={700} sx={{ width: { xs: '100%', sm: 220 } }}>PHONE EXISTS IN FILE ({phoneReviewStats.phoneInFileCount})</Typography>
                              <Typography variant="caption" color="text.secondary">Default Action:</Typography>
                              <Select size="small" value={bulkActionsState.PHONE_EXISTS_IN_FILE} onChange={(e) => setBulkActionsState(p => ({ ...p, PHONE_EXISTS_IN_FILE: e.target.value as string }))} sx={{ minWidth: 150, height: 32 }}>
                                <MenuItem value="SKIP">Skip</MenuItem>
                                <MenuItem value="UPDATE_EXISTING">Update Existing</MenuItem>
                                <MenuItem value="IMPORT_NEW">Import as New</MenuItem>
                              </Select>
                              <Button variant="contained" size="small" onClick={() => handleBulkAction("PHONE_EXISTS_IN_FILE", bulkActionsState.PHONE_EXISTS_IN_FILE, phoneReviewStats.phoneInFileCount)} sx={{ textTransform: 'none', height: 32, px: 2 }}>Apply to All</Button>
                            </Box>
                          )}
                          {phoneReviewStats.phoneConflictCount > 0 && (
                            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, p: 1, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                              <Typography variant="body2" fontWeight={700} sx={{ width: { xs: '100%', sm: 220 } }}>PHONE CONFLICT ({phoneReviewStats.phoneConflictCount})</Typography>
                              <Typography variant="caption" color="text.secondary">Default Action:</Typography>
                              <Select size="small" value={bulkActionsState.PHONE_CONFLICT} onChange={(e) => setBulkActionsState(p => ({ ...p, PHONE_CONFLICT: e.target.value as string }))} sx={{ minWidth: 150, height: 32 }}>
                                <MenuItem value="SKIP">Skip</MenuItem>
                                <MenuItem value="UPDATE_EXISTING">Update Existing</MenuItem>
                                <MenuItem value="IMPORT_NEW">Import as New</MenuItem>
                              </Select>
                              <Button variant="contained" size="small" onClick={() => handleBulkAction("PHONE_CONFLICT", bulkActionsState.PHONE_CONFLICT, phoneReviewStats.phoneConflictCount)} sx={{ textTransform: 'none', height: 32, px: 2 }}>Apply to All</Button>
                            </Box>
                          )}
                        </Box>
                      </Box>
                    )}

                    {/* Show Unresolved Only Filter */}
                    <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1, bgcolor: 'background.default', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Checkbox 
                          checked={showUnresolvedOnly} 
                          onChange={(e) => setShowUnresolvedOnly(e.target.checked)} 
                          size="small"
                        />
                        <Typography variant="body2" fontWeight={600}>Show Unresolved Only</Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mr: 1 }}>
                        Showing: {visiblePhoneReviewRows.length} of {(reviewData?.phone_review || []).length} rows
                      </Typography>
                    </Box>

                    {/* Legend */}
                    <Box sx={{ mb: 2, p: 1.5, bgcolor: 'background.default', borderRadius: 1, border: '1px solid', borderColor: 'divider', display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      <Typography variant="caption" fontWeight="bold" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center' }}>LEGEND:</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip size="small" label="EXACT DUPLICATE" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 'bold' }} />
                        <Typography variant="caption" color="text.secondary">Exact Match on Phone, Name, and Village</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip size="small" color="error" label="PHONE EXISTS IN FILE" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 'bold' }} />
                        <Typography variant="caption" color="text.secondary">Duplicate phone number found within the uploaded Excel file</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip size="small" color="warning" label="PHONE CONFLICT" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 'bold' }} />
                        <Typography variant="caption" color="text.secondary">Phone number exists but customer details differ</Typography>
                      </Box>
                    </Box>
                  </>
                )}

                {openDialog === "sabhasad" && activeTab === 1 ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pb: 4 }}>
                    {groupedPhoneReviewRows.phoneConflicts.length > 0 && (
                      <Accordion defaultExpanded TransitionProps={{ unmountOnExit: true }} sx={{ border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: 'warning.50' }}>
                          <Typography fontWeight={700} color="warning.dark">✓ Phone Conflicts ({groupedPhoneReviewRows.phoneConflicts.length})</Typography>
                          <Typography variant="caption" sx={{ ml: 2, mt: 0.5, color: 'text.secondary' }}>Require manual review.</Typography>
                        </AccordionSummary>
                        <AccordionDetails sx={{ p: 0 }}>
                          <TableContainer>
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell padding="checkbox"><Checkbox disabled /></TableCell>
                                  <TableCell sx={{ fontWeight: 'bold', width: '20%' }}>Type</TableCell>
                                  <TableCell sx={{ fontWeight: 'bold', width: '30%' }}>Uploaded Record</TableCell>
                                  <TableCell sx={{ fontWeight: 'bold', width: '30%' }}>Existing Record</TableCell>
                                  <TableCell sx={{ fontWeight: 'bold', width: '20%' }}>Resolution</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {groupedPhoneReviewRows.phoneConflicts.map((item: any) => (
                                  <PhoneReviewRow
                                    key={item.originalIndex}
                                    rowData={item.rowData}
                                    index={item.originalIndex}
                                    resolution={sabhasadResolutions[item.originalIndex] ?? getDefaultResolution(item.rowData.conflict_type)}
                                    isSuggested={!sabhasadUserOverrides.has(item.originalIndex) && !!sabhasadResolutions[item.originalIndex] && sabhasadResolutions[item.originalIndex] !== "UNRESOLVED"}
                                    onResolutionChange={handleResolutionChange}
                                  />
                                ))}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        </AccordionDetails>
                      </Accordion>
                    )}
                    
                    {groupedPhoneReviewRows.phoneExists.length > 0 && (
                      <Accordion defaultExpanded TransitionProps={{ unmountOnExit: true }} sx={{ border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: 'error.50' }}>
                          <Typography fontWeight={700} color="error.dark">✓ Phone Exists In File ({groupedPhoneReviewRows.phoneExists.length})</Typography>
                          <Typography variant="caption" sx={{ ml: 2, mt: 0.5, color: 'text.secondary' }}>Duplicate phone number found within the uploaded Excel file.</Typography>
                        </AccordionSummary>
                        <AccordionDetails sx={{ p: 0 }}>
                          <TableContainer>
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell padding="checkbox"><Checkbox disabled /></TableCell>
                                  <TableCell sx={{ fontWeight: 'bold', width: '20%' }}>Type</TableCell>
                                  <TableCell sx={{ fontWeight: 'bold', width: '30%' }}>Uploaded Record</TableCell>
                                  <TableCell sx={{ fontWeight: 'bold', width: '30%' }}>Existing Record</TableCell>
                                  <TableCell sx={{ fontWeight: 'bold', width: '20%' }}>Resolution</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {groupedPhoneReviewRows.phoneExists.map((item: any) => (
                                  <PhoneReviewRow
                                    key={item.originalIndex}
                                    rowData={item.rowData}
                                    index={item.originalIndex}
                                    resolution={sabhasadResolutions[item.originalIndex] ?? getDefaultResolution(item.rowData.conflict_type)}
                                    isSuggested={!sabhasadUserOverrides.has(item.originalIndex) && !!sabhasadResolutions[item.originalIndex] && sabhasadResolutions[item.originalIndex] !== "UNRESOLVED"}
                                    onResolutionChange={handleResolutionChange}
                                  />
                                ))}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        </AccordionDetails>
                      </Accordion>
                    )}

                    {groupedPhoneReviewRows.exactDups.length > 0 && (
                      <Accordion defaultExpanded={false} TransitionProps={{ unmountOnExit: true }} sx={{ border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: 'background.default' }}>
                          <Typography fontWeight={700} color="text.secondary">✓ Exact Duplicates ({groupedPhoneReviewRows.exactDups.length})</Typography>
                          <Typography variant="caption" sx={{ ml: 2, mt: 0.5, color: 'text.secondary' }}>Automatically marked as Skip.</Typography>
                        </AccordionSummary>
                        <AccordionDetails sx={{ p: 0 }}>
                          <TableContainer>
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell padding="checkbox"><Checkbox disabled /></TableCell>
                                  <TableCell sx={{ fontWeight: 'bold', width: '20%' }}>Type</TableCell>
                                  <TableCell sx={{ fontWeight: 'bold', width: '30%' }}>Uploaded Record</TableCell>
                                  <TableCell sx={{ fontWeight: 'bold', width: '30%' }}>Existing Record</TableCell>
                                  <TableCell sx={{ fontWeight: 'bold', width: '20%' }}>Resolution</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {groupedPhoneReviewRows.exactDups.map((item: any) => (
                                  <PhoneReviewRow
                                    key={item.originalIndex}
                                    rowData={item.rowData}
                                    index={item.originalIndex}
                                    resolution={sabhasadResolutions[item.originalIndex] ?? getDefaultResolution(item.rowData.conflict_type)}
                                    isSuggested={!sabhasadUserOverrides.has(item.originalIndex) && !!sabhasadResolutions[item.originalIndex] && sabhasadResolutions[item.originalIndex] !== "UNRESOLVED"}
                                    onResolutionChange={handleResolutionChange}
                                  />
                                ))}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        </AccordionDetails>
                      </Accordion>
                    )}
                    
                    {(reviewData?.phone_review || []).length > 0 && visiblePhoneReviewRows.length === 0 && (
                      <Box sx={{ py: 6, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <CheckCircleIcon color="success" sx={{ fontSize: 40, mb: 1 }} />
                        <Typography variant="h6" color="success.main" fontWeight={700}>✅ All Phone Review items have been resolved.</Typography>
                        <Typography variant="body2" color="text.secondary">No unresolved rows remaining.</Typography>
                      </Box>
                    )}
                    
                    {(reviewData?.phone_review || []).length === 0 && (
                      <Box sx={{ py: 4, textAlign: 'center' }}>
                        <Typography variant="body1" color="text.secondary">No phone review items found.</Typography>
                      </Box>
                    )}
                  </Box>
                ) : (
                  <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell padding="checkbox">
                          {activeTab === 0 ? (
                            <Checkbox 
                              indeterminate={selectedReadyIndices.length > 0 && selectedReadyIndices.length < (reviewData?.ready_to_import || []).length}
                              checked={(reviewData?.ready_to_import || []).length > 0 && selectedReadyIndices.length === (reviewData?.ready_to_import || []).length}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedReadyIndices((reviewData?.ready_to_import || []).map((_: any, idx: number) => idx));
                                } else {
                                  setSelectedReadyIndices([]);
                                }
                              }}
                            />
                          ) : activeTab === 2 && openDialog !== "sabhasad" ? (
                            <Checkbox 
                              indeterminate={selectedConflictIndices.length > 0 && selectedConflictIndices.length < (reviewData?.possible_conflicts || []).length}
                              checked={(reviewData?.possible_conflicts || []).length > 0 && selectedConflictIndices.length === (reviewData?.possible_conflicts || []).length}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedConflictIndices((reviewData?.possible_conflicts || []).map((_: any, idx: number) => idx));
                                } else {
                                  setSelectedConflictIndices([]);
                                }
                              }}
                            />
                          ) : (
                            openDialog !== "sabhasad" || activeTab !== 2 ? <Checkbox disabled /> : null
                          )}
                        </TableCell>
                        {openDialog === "sabhasad" && activeTab === 3 && <TableCell sx={{ fontWeight: 'bold' }}>Row #</TableCell>}
                        {openDialog === "sabhasad" && <TableCell sx={{ fontWeight: 'bold' }}>Customer ID</TableCell>}
                        <TableCell sx={{ fontWeight: 'bold' }}>Uploaded Name</TableCell>
                        <TableCell sx={{ fontWeight: 'bold' }}>Village</TableCell>
                        <TableCell sx={{ fontWeight: 'bold' }}>Mobile</TableCell>
                        {activeTab === 1 || activeTab === 2 ? (
                          <>
                            <TableCell sx={{ fontWeight: 'bold' }}>Existing Match</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Reason</TableCell>
                          </>
                        ) : activeTab === 3 ? (
                          <TableCell sx={{ fontWeight: 'bold' }}>Error</TableCell>
                        ) : null}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {activeTab === 0 && (reviewData?.ready_to_import || []).map((r: any, i: number) => {
                        const isRedemo = r.is_redemo || r.uploaded_row?.is_redemo;
                        return (
                          <TableRow 
                            key={i}
                            hover
                            onClick={() => {
                              setSelectedReadyIndices((prev) => {
                                const next = prev.includes(i) ? prev.filter((idx) => idx !== i) : [...prev, i];
                                console.log("[P7 SELECTED ROWS] Ready Rows Updated:", next);
                                return next;
                              });
                            }}
                            sx={{ 
                              cursor: 'pointer',
                              background: isRedemo 
                                ? 'linear-gradient(90deg, rgba(245, 158, 11, 0.08) 0%, rgba(251, 191, 36, 0.02) 100%)'
                                : 'inherit'
                            }}
                          >
                            <TableCell padding="checkbox">
                              <Checkbox 
                                checked={selectedReadyIndices.includes(i)}
                                onClick={(e) => e.stopPropagation()}
                                onChange={() => {
                                  console.log("[P7 CHECKBOX CLICK] Ready Row Index:", i);
                                  setSelectedReadyIndices((prev) => {
                                    const next = prev.includes(i) ? prev.filter((idx) => idx !== i) : [...prev, i];
                                    console.log("[P7 SELECTED ROWS] Ready Rows Updated:", next);
                                    return next;
                                  });
                                }}
                              />
                            </TableCell>
                            {openDialog === "sabhasad" && <TableCell>{r.uploaded_row.customer_code}</TableCell>}
                            <TableCell>{openDialog === "sabhasad" ? r.uploaded_row.name : r.uploaded_row.mantri_name}</TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="body2">{r.uploaded_row.village}</Typography>
                                {isRedemo && (
                                  <Chip label="REDEMO" size="small" color="warning" sx={{ fontWeight: 'bold', height: 20, fontSize: '0.65rem' }} />
                                )}
                              </Box>
                              {isRedemo && (
                                <Typography variant="caption" color="warning.dark" sx={{ display: 'block', fontWeight: 500 }}>
                                  Canonical Update (will update existing distributor's record_date to {r.uploaded_row.record_date})
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell>{openDialog === "sabhasad" ? r.uploaded_row.mobile : r.uploaded_row.mantri_mobile}</TableCell>
                          </TableRow>
                        );
                      })}
                      {activeTab === 1 && openDialog !== "sabhasad" && (reviewData?.exact_duplicates || []).map((r: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell padding="checkbox">
                            <Checkbox disabled />
                          </TableCell>
                          <TableCell>{r.uploaded_row.mantri_name}</TableCell>
                          <TableCell>{r.uploaded_row.village}</TableCell>
                          <TableCell>{r.uploaded_row.mantri_mobile}</TableCell>
                          <TableCell>
                            {r.existing_db_row?.mantri_name} ({r.existing_db_row?.village})
                          </TableCell>
                          <TableCell><Chip size="small" color="warning" label={r.reason || "Exact Match"} /></TableCell>
                        </TableRow>
                      ))}
                      {activeTab === 2 && openDialog !== "sabhasad" && (reviewData?.possible_conflicts || []).map((r: any, i: number) => {
                        const isRedemo = r.is_redemo || r.uploaded_row?.is_redemo;
                        return (
                          <TableRow 
                            key={i}
                            hover
                            onClick={() => {
                              setSelectedConflictIndices((prev) => {
                                const next = prev.includes(i) ? prev.filter((idx) => idx !== i) : [...prev, i];
                                console.log("[P7 SELECTED ROWS] Conflict Rows Updated:", next);
                                return next;
                              });
                            }}
                            sx={{ 
                              cursor: 'pointer',
                              background: isRedemo 
                                ? 'linear-gradient(90deg, rgba(245, 158, 11, 0.08) 0%, rgba(251, 191, 36, 0.02) 100%)'
                                : 'inherit'
                            }}
                          >
                            <TableCell padding="checkbox">
                              <Checkbox 
                                checked={selectedConflictIndices.includes(i)}
                                onClick={(e) => e.stopPropagation()}
                                onChange={() => {
                                  console.log("[P7 CHECKBOX CLICK] Conflict Row Index:", i);
                                  setSelectedConflictIndices((prev) => {
                                    const next = prev.includes(i) ? prev.filter((idx) => idx !== i) : [...prev, i];
                                    console.log("[P7 SELECTED ROWS] Conflict Rows Updated:", next);
                                    return next;
                                  });
                                }}
                              />
                            </TableCell>
                            <TableCell>{r.uploaded_row.mantri_name}</TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="body2">{r.uploaded_row.village}</Typography>
                                {isRedemo && (
                                  <Chip label="REDEMO" size="small" color="warning" sx={{ fontWeight: 'bold', height: 20, fontSize: '0.65rem' }} />
                                )}
                              </Box>
                            </TableCell>
                            <TableCell>{r.uploaded_row.mantri_mobile}</TableCell>
                            <TableCell>
                              {r.existing_db_row.mantri_name} ({r.existing_db_row.village})
                            </TableCell>
                            <TableCell>
                              <Chip size="small" color="info" label={`Score: ${r.similarity_score}`} />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {activeTab === 3 && (reviewData?.invalid_rows || []).map((r: any, i: number) => {
                        let errors: string[] = [];
                        if (openDialog === "sabhasad") {
                           const row = r.uploaded_row || {};
                           if (!row.name) errors.push("Missing name");
                           if (!row.village) errors.push("Missing village");
                           
                           const mobile = row.mobile;
                           if (mobile === undefined || mobile === null || mobile === "") {
                               errors.push("Missing phone number");
                           } else {
                               const str = String(mobile).trim();
                               if (str.length === 0 || str.toLowerCase() === "na" || str.toLowerCase() === "null" || str === "-") {
                                   errors.push("Phone number is empty");
                               } else if (/[a-zA-Z]/.test(str)) {
                                   errors.push("Phone number contains non-numeric characters");
                               } else {
                                   const digits = str.replace(/\D/g, '');
                                   if (digits.length !== 10) {
                                       errors.push("Phone number must be exactly 10 digits");
                                   } else if (str !== digits) {
                                       errors.push("Invalid mobile format");
                                   }
                               }
                           }
                           if (errors.length === 0) errors = [r.reason];
                        } else {
                           errors = [r.reason];
                        }
                        
                        return (
                          <TableRow key={i}>
                            <TableCell padding="checkbox">
                              <Checkbox disabled />
                            </TableCell>
                            {openDialog === "sabhasad" && <TableCell>{i + 1}</TableCell>}
                            {openDialog === "sabhasad" && <TableCell>{r.uploaded_row?.customer_code || "-"}</TableCell>}
                            <TableCell>{openDialog === "sabhasad" ? r.uploaded_row?.name : r.uploaded_row?.mantri_name}</TableCell>
                            <TableCell>{r.uploaded_row?.village}</TableCell>
                            <TableCell>{openDialog === "sabhasad" ? r.uploaded_row?.mobile : r.uploaded_row?.mantri_mobile}</TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                {errors.map((err, errIdx) => (
                                   <Chip key={errIdx} label={err} color="error" size="small" variant="outlined" sx={{ fontWeight: 500, alignSelf: 'flex-start' }} />
                                ))}
                              </Box>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
                )}
              </Box>
            ) : (
              <>
            {importDialogs.find((d) => d.type === openDialog)?.fields && 
              importDialogs.find((d) => d.type === openDialog)!.fields.length > 0 && (
              <Grid container spacing={3} sx={{ mb: 4 }}>
                {importDialogs
                  .find((d) => d.type === openDialog)
                  ?.fields.map((field) => (
                    <Grid
                      item
                      xs={12}
                      sm={field.multiline ? 12 : 6}
                      key={field.name}
                    >
                      <TextField
                        fullWidth
                        variant="outlined"
                        label={field.required ? `${field.label} *` : field.label}
                        type={field.type || "text"}
                        multiline={field.multiline}
                        rows={field.multiline ? 4 : 1}
                        value={formData[field.name] || ""}
                        onChange={(e) =>
                          handleFieldChange(field.name, e.target.value)
                        }
                        placeholder={
                          field.name === "mobile" || field.name.includes("mobile")
                            ? "+91 9876543210"
                            : undefined
                        }
                        InputLabelProps={
                          field.type === "date" ||
                            field.name === "mobile" ||
                            field.name.includes("mobile")
                            ? { shrink: true }
                            : undefined
                        }
                        InputProps={
                          field.name === "mobile" || field.name.includes("mobile")
                            ? {
                              startAdornment: (
                                <InputAdornment
                                  position="start"
                                  sx={{ ml: 0.5 }}
                                >
                                  <Box
                                    component="span"
                                    sx={{
                                      color: "text.primary",
                                      fontWeight: 600,
                                      fontSize: "1rem",
                                      minWidth: "32px",
                                      bgcolor: "action.hover",
                                      py: 0.5,
                                      px: 1,
                                      borderRadius: 1,
                                      mr: 1,
                                    }}
                                  >
                                    +91
                                  </Box>
                                </InputAdornment>
                              ),
                            }
                            : undefined
                        }
                      />
                    </Grid>
                  ))}
              </Grid>
            )}

            {(openDialog === "customer" || openDialog === "sabhasad") && (
              <Box sx={{ mb: 3, display: "flex", justifyContent: "flex-end" }}>
                <Button
                  variant="outlined"
                  onClick={openDialog === "customer" ? handleDownloadDistributorTemplate : handleDownloadSabhasadTemplate}
                  startIcon={<AttachFileIcon sx={{ transform: "rotate(45deg)" }} />}
                  sx={{ borderRadius: 2, textTransform: "none" }}
                >
                  Download {openDialog === "customer" ? "Distributor" : "Sabhasad"} Sample Format
                </Button>
              </Box>
            )}

            {/* File Upload Section */}
            <Paper
              elevation={0}
              sx={{
                border: "2px dashed",
                borderColor: selectedFile ? "success.main" : "primary.main",
                borderRadius: 3,
                p: 5,
                textAlign: "center",
                bgcolor: selectedFile ? "success.50" : "background.paper",
                cursor: "pointer",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 220,
                "&:hover": {
                  bgcolor: "action.hover",
                  transform: 'scale(1.01)',
                  borderColor: 'primary.dark',
                  boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
                },
              }}
              onClick={() =>
                document.getElementById(`file-input-${openDialog}`)?.click()
              }
            >
              {selectedFile ? (
                <Box>
                  <CheckCircleIcon
                    sx={{ fontSize: 48, color: "success.main", mb: 1 }}
                  />
                  <Typography variant="h6" sx={{ mb: 1 }}>
                    {selectedFile.name}
                  </Typography>
                  <Chip
                    label={`${(selectedFile.size / 1024).toFixed(1)} KB`}
                    size="small"
                    color="success"
                  />
                </Box>
              ) : (
                <Box>
                  <AttachFileIcon
                    sx={{ fontSize: 56, color: "primary.main", mb: 2 }}
                  />
                  <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
                    {t("import.clickToSelect", "Click to select Excel file")}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t("import.supportedFormats", "Supported formats: .xlsx, .xls")}
                  </Typography>
                </Box>
              )}
              <input
                id={`file-input-${openDialog}`}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: "none" }}
                onChange={handleFileSelect}
              />
            </Paper>

            {uploading && (
              <Box sx={{ mt: 3 }}>
                <LinearProgress variant="determinate" value={uploadProgress} />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 1, display: "block", textAlign: "center" }}
                >
                  Uploading... {uploadProgress}%
                </Typography>
              </Box>
            )}
            </>
            )}
            {/* ===== FINAL CONFIRMATION STEP (Sabhasad Only) ===== */}
            {showFinalConfirm && openDialog === "sabhasad" && importPayload && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>Confirm Import</Typography>

                <Box sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 2,
                  mb: 3,
                }}>
                  <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'success.50', border: '1px solid', borderColor: 'success.200' }}>
                    <Typography variant="caption" color="text.secondary" display="block">Ready Rows</Typography>
                    <Typography variant="h4" fontWeight={800} color="success.main">{importPayload.readyCount}</Typography>
                  </Box>
                  <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'info.50', border: '1px solid', borderColor: 'info.200' }}>
                    <Typography variant="caption" color="text.secondary" display="block">Resolved Conflicts</Typography>
                    <Typography variant="h4" fontWeight={800} color="info.main">{importPayload.resolvedConflictCount}</Typography>
                  </Box>
                  <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'warning.50', border: '1px solid', borderColor: 'warning.200' }}>
                    <Typography variant="caption" color="text.secondary" display="block">Skipped Rows</Typography>
                    <Typography variant="h4" fontWeight={800} color="warning.main">{importPayload.skippedCount}</Typography>
                  </Box>
                  <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'error.50', border: '1px solid', borderColor: 'error.200' }}>
                    <Typography variant="caption" color="text.secondary" display="block">Invalid Rows</Typography>
                    <Typography variant="h4" fontWeight={800} color="error.main">{importPayload.invalidCount}</Typography>
                  </Box>
                </Box>

                <Alert severity="warning" sx={{ mb: 2 }}>
                  <strong>Warning:</strong> This action will import data into the database and cannot be undone.
                </Alert>
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 4, pb: 3, display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
            {reviewData && openDialog === "sabhasad" && !showFinalConfirm && (
              <Box sx={{ mb: 2, p: 2.5, bgcolor: 'background.default', borderRadius: 2, border: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
                <Typography variant="subtitle2" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>Validation Summary</Typography>
                <Box sx={{ display: 'flex', gap: 4 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Typography variant="body2" color="success.main" fontWeight={600}>READY</Typography><Chip size="medium" color="success" label={reviewData.summary.ready_to_import} sx={{ fontWeight: 'bold', fontSize: '1rem' }} /></Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Typography variant="body2" color="info.main" fontWeight={600}>RESOLVED</Typography><Chip size="medium" color="info" label={(reviewData.phone_review || []).length > 0 ? resolvedCount : 0} sx={{ fontWeight: 'bold', fontSize: '1rem' }} /></Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Typography variant="body2" color="warning.main" fontWeight={600}>UNRESOLVED</Typography><Chip size="medium" color="warning" label={(reviewData.phone_review || []).length > 0 ? unresolvedCount : 0} sx={{ fontWeight: 'bold', fontSize: '1rem' }} /></Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Typography variant="body2" color="error.main" fontWeight={600}>INVALID</Typography><Chip size="medium" color="error" label={reviewData.summary.invalid_rows} sx={{ fontWeight: 'bold', fontSize: '1rem' }} /></Box>
                </Box>
              </Box>
            )}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
              {showFinalConfirm && openDialog === "sabhasad" ? (
                <>
                  <Button
                    onClick={() => setShowFinalConfirm(false)}
                    disabled={uploading}
                    variant="outlined"
                  >
                    ← Back to Review
                  </Button>
                  <Button onClick={handleCloseDialog} disabled={uploading}>
                    {t("common.cancel", "Cancel")}
                  </Button>
                  <Button
                    variant="contained"
                    color="success"
                    onClick={handleFinalSubmit}
                    disabled={uploading}
                    startIcon={uploading ? null : <CheckCircleIcon />}
                  >
                    {uploading ? "Submitting..." : "Submit Import"}
                  </Button>
                </>
              ) : (
                <>
                  <Button onClick={handleCloseDialog} disabled={uploading}>
                    {t("common.cancel", "Cancel")}
                  </Button>
                  {reviewData ? (
                    <Button
                      variant="contained"
                      disabled={
                        uploading || 
                        (openDialog !== "sabhasad" && (selectedReadyIndices.length + selectedConflictIndices.length) === 0) ||
                        (openDialog === "sabhasad" && (reviewData.phone_review || []).length > 0 && unresolvedCount > 0)
                      }
                      onClick={handleConfirmImport}
                      startIcon={<CheckCircleIcon />}
                      color="success"
                    >
                      {openDialog === "sabhasad" && (reviewData.phone_review || []).length > 0 && unresolvedCount > 0
                        ? "Resolve Conflicts First" 
                        : t("import.confirmSelection", "Confirm Selection")}
                    </Button>
                  ) : (
                    <Button
                      variant="contained"
                      onClick={handleSubmit}
                      disabled={uploading || !selectedFile}
                      startIcon={<CloudUploadIcon />}
                    >
                      {uploading ? t("import.uploading", "Uploading...") : (openDialog === "customer" || openDialog === "sabhasad") ? "Upload & Review" : t("import.uploadAndImport", "Upload & Import")}
                    </Button>
                  )}
                </>
              )}
            </Box>
          </DialogActions>
        </Dialog>
      )}

      <Snackbar
        open={bulkActionSnackbar.open}
        autoHideDuration={4000}
        onClose={() => setBulkActionSnackbar(p => ({ ...p, open: false }))}
        message={bulkActionSnackbar.message}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
