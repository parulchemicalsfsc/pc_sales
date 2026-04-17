import { useState } from "react";
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
} from "@mui/material";
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
} from "@mui/icons-material";
import { fileAPI } from "../services/api";
import { useTranslation } from "../hooks/useTranslation";

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

export default function DataImport() {
  const { t } = useTranslation();
  const [openDialog, setOpenDialog] = useState<ImportType | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});

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

      const response = await fileAPI.upload(formDataToSend);

      clearInterval(progressInterval);
      setUploadProgress(100);

      // Show success message
      const successMsg =
        response.message || `${currentDialog.title} completed successfully!`;
      setSuccess(successMsg);

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

      {/* Import Dialog */}
      {openDialog && (
        <Dialog
          open={Boolean(openDialog)}
          onClose={handleCloseDialog}
          maxWidth="md"
          fullWidth
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

            {/* Input Fields */}
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
          </DialogContent>
          <DialogActions sx={{ px: 4, pb: 3 }}>
            <Button onClick={handleCloseDialog} disabled={uploading}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              onClick={handleSubmit}
              variant="contained"
              disabled={uploading || !selectedFile}
              startIcon={<CloudUploadIcon />}
            >
              {uploading ? t("import.uploading", "Uploading...") : t("import.uploadAndImport", "Upload & Import")}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
}
