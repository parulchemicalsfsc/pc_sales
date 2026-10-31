import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stepper,
  Step,
  StepLabel,
  Box,
  Button,
  Typography,
  TextField,
  Grid,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Alert,
  CircularProgress,
  IconButton,
  Divider,
  Paper,
  Chip,
  Checkbox,
  FormControlLabel,
  FormGroup,
  FormHelperText,
  Tooltip,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import {
  Close as CloseIcon,
  ArrowForward as NextIcon,
  ArrowBack as BackIcon,
  Check as SaveIcon,
  Warning as WarningIcon,
  OpenInNew as OpenInNewIcon,
  Person as PersonIcon,
  Work as WorkIcon,
  Description as DocIcon,
  FactCheck as ReviewIcon,
  Edit as EditStepIcon,
} from "@mui/icons-material";
import {
  recruitmentService,
  RecruitmentLead,
  RecruitmentCategory,
  RecruitmentStatus,
  ALLOWED_RECRUITMENT_STATUSES,
  CreateCandidatePayload,
  UpdateCandidatePayload,
  validateGoogleDriveUrl,
} from "../services/recruitmentService";

const STEPS = [
  "Personal Details",
  "Professional Details",
  "Resume & Questionnaire",
  "Review & Submit",
];

const QUALIFICATION_OPTIONS = [
  "B.Sc Chemistry",
  "M.Sc Chemistry",
  "B.Tech / B.E. Chemical",
  "Diploma in Chemical Engineering",
  "B.Sc Agriculture",
  "M.Sc Agriculture",
  "B.Com",
  "BBA",
  "MBA / PGDM Marketing",
  "Higher Secondary (12th)",
  "Graduate - Other",
  "Postgraduate - Other",
];

const SOURCE_OPTIONS = [
  "Manual",
  "Referral",
  "LinkedIn",
  "Naukri / Job Portal",
  "Walk-in",
  "Direct Application",
  "Campus Placement",
  "Other",
];

const INDIAN_STATES = [
  "Gujarat",
  "Maharashtra",
  "Rajasthan",
  "Madhya Pradesh",
  "Delhi",
  "Karnataka",
  "Tamil Nadu",
  "Uttar Pradesh",
  "Haryana",
  "Punjab",
  "West Bengal",
  "Other",
];

const AVAILABLE_LANGUAGES = ["Gujarati", "Hindi", "English", "Marathi"];

interface CandidateFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (candidate: RecruitmentLead, isEdit: boolean) => void;
  categories: RecruitmentCategory[];
  categoriesLoading?: boolean;
  categoriesError?: string | null;
  initialData?: RecruitmentLead | null;
}

export default function CandidateFormDialog({
  open,
  onClose,
  onSuccess,
  categories,
  categoriesLoading = false,
  categoriesError = null,
  initialData,
}: CandidateFormDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isEdit = Boolean(initialData);

  const [activeStep, setActiveStep] = useState<number>(0);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState<boolean>(false);
  const [duplicateMatches, setDuplicateMatches] = useState<RecruitmentLead[]>([]);
  const [duplicateConfirmed, setDuplicateConfirmed] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Field validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Form State ─────────────────────────────────────────────────────────────
  const [formData, setFormData] = useState({
    // Step 1: Personal
    candidate_name: "",
    phone: "",
    alternate_phone: "",
    email: "",
    city: "",
    state: "Gujarat",
    source: "Manual",

    // Step 2: Professional
    category_id: "" as number | "",
    current_company: "",
    current_designation: "",
    total_experience_years: 0 as number | string,
    highest_qualification: "",
    current_ctc: "" as number | string,
    expected_ctc: "" as number | string,
    notice_period_days: "" as number | string,
    key_skills: "",

    // Step 3: Resume & Questionnaire
    resume_url: "",
    willing_to_relocate: "Yes - Anywhere",
    has_driving_license: "Yes - 2-Wheeler & 4-Wheeler",
    own_two_wheeler: "Yes",
    primary_territory_knowledge: "",
    languages_known: ["Gujarati", "Hindi", "English"] as string[],
    relevant_industry_experience: "",
    interviewer_notes: "",

    // Status & Follow-up
    status: "Lead Generated" as RecruitmentStatus,
    status_notes: "",
    follow_up_date: "",
  });

  // ── Initialize or reset form ───────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setActiveStep(0);
      setErrors({});
      setErrorMsg(null);
      setDuplicateMatches([]);
      setDuplicateConfirmed(false);

      if (initialData) {
        // Populate for Edit Mode
        const q = initialData.questionnaire_responses || {};
        const langs = Array.isArray(q.languages_known)
          ? q.languages_known
          : typeof q.languages_known === "string"
          ? q.languages_known.split(",").map((s: string) => s.trim())
          : ["Gujarati", "Hindi"];

        setFormData({
          candidate_name: initialData.candidate_name || "",
          phone: initialData.phone || "",
          alternate_phone: initialData.alternate_phone || "",
          email: initialData.email || "",
          city: initialData.city || initialData.current_city || "",
          state: initialData.state || "Gujarat",
          source: initialData.source || "Manual",

          category_id: initialData.category_id || (categories[0]?.category_id ?? ""),
          current_company: initialData.current_company || "",
          current_designation: initialData.current_designation || "",
          total_experience_years: initialData.total_experience_years ?? 0,
          highest_qualification: initialData.highest_qualification || "",
          current_ctc: initialData.current_ctc ?? "",
          expected_ctc: initialData.expected_ctc ?? "",
          notice_period_days: initialData.notice_period_days ?? "",
          key_skills: initialData.key_skills || "",

          resume_url: initialData.resume_url || "",
          willing_to_relocate: q.willing_to_relocate || "Yes - Anywhere",
          has_driving_license: q.has_driving_license || "Yes - 2-Wheeler & 4-Wheeler",
          own_two_wheeler: q.own_two_wheeler || "Yes",
          primary_territory_knowledge: q.primary_territory_knowledge || "",
          languages_known: langs,
          relevant_industry_experience: q.relevant_industry_experience || "",
          interviewer_notes: q.interviewer_notes || "",

          status: initialData.status || "Lead Generated",
          status_notes: initialData.status_notes || "",
          follow_up_date: initialData.follow_up_date || "",
        });
      } else {
        // Reset for Create Mode
        setFormData({
          candidate_name: "",
          phone: "",
          alternate_phone: "",
          email: "",
          city: "",
          state: "Gujarat",
          source: "Manual",

          category_id: categories.length > 0 ? categories[0].category_id : "",
          current_company: "",
          current_designation: "",
          total_experience_years: 0,
          highest_qualification: "",
          current_ctc: "",
          expected_ctc: "",
          notice_period_days: "",
          key_skills: "",

          resume_url: "",
          willing_to_relocate: "Yes - Anywhere",
          has_driving_license: "Yes - 2-Wheeler & 4-Wheeler",
          own_two_wheeler: "Yes",
          primary_territory_knowledge: "",
          languages_known: ["Gujarati", "Hindi"],
          relevant_industry_experience: "",
          interviewer_notes: "",

          status: "Lead Generated",
          status_notes: "",
          follow_up_date: "",
        });
      }
    }
  }, [open, initialData, categories]);

  // ── Step Validations ───────────────────────────────────────────────────────
  const validateStep = (stepIndex: number): boolean => {
    const newErrors: Record<string, string> = {};

    if (stepIndex === 0) {
      // Step 1: Personal Details
      if (!formData.candidate_name.trim()) {
        newErrors.candidate_name = "Candidate name is required";
      }

      const cleanPhone = formData.phone.replace(/[\s\-\(\)\.]/g, "");
      if (!cleanPhone) {
        newErrors.phone = "Mobile number is required";
      } else if (!/^[0-9]{10}$/.test(cleanPhone) && !/^(?:\+?91)?[0-9]{10}$/.test(cleanPhone)) {
        newErrors.phone = "Please enter a valid 10-digit Indian mobile number";
      }

      if (formData.alternate_phone.trim()) {
        const cleanAlt = formData.alternate_phone.replace(/[\s\-\(\)\.]/g, "");
        if (!/^[0-9]{10}$/.test(cleanAlt) && !/^(?:\+?91)?[0-9]{10}$/.test(cleanAlt)) {
          newErrors.alternate_phone = "Alternate phone must be a valid 10-digit number";
        }
      }

      if (formData.email.trim()) {
        const emailRegex = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
        if (!emailRegex.test(formData.email.trim())) {
          newErrors.email = "Please enter a valid email address";
        }
      }
    } else if (stepIndex === 1) {
      // Step 2: Professional Details
      if (!formData.category_id) {
        if (categories.length === 0) {
          newErrors.category_id = "No categories available. Please configure recruitment categories first.";
        } else {
          newErrors.category_id = "Recruitment category is required";
        }
      }

      if (formData.total_experience_years !== "") {
        const exp = Number(formData.total_experience_years);
        if (isNaN(exp) || exp < 0) {
          newErrors.total_experience_years = "Experience must be 0 or greater";
        }
      }

      if (formData.current_ctc !== "") {
        const ctc = Number(formData.current_ctc);
        if (isNaN(ctc) || ctc < 0) {
          newErrors.current_ctc = "Current CTC must be 0 or greater";
        }
      }

      if (formData.expected_ctc !== "") {
        const expCtc = Number(formData.expected_ctc);
        if (isNaN(expCtc) || expCtc < 0) {
          newErrors.expected_ctc = "Expected CTC must be 0 or greater";
        }
      }

      if (formData.notice_period_days !== "") {
        const np = Number(formData.notice_period_days);
        if (isNaN(np) || np < 0) {
          newErrors.notice_period_days = "Notice period must be 0 or greater";
        }
      }
    } else if (stepIndex === 2) {
      // Step 3: Resume and Questionnaire
      if (formData.resume_url.trim()) {
        const resCheck = validateGoogleDriveUrl(formData.resume_url);
        if (!resCheck.valid) {
          newErrors.resume_url = resCheck.error || "Invalid Google Drive link";
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ── Duplicate check on proceeding to Review ───────────────────────────────
  const checkDuplicatesIfApplicable = async () => {
    // Only check duplicates on create, or if phone/email changed in edit
    const phoneChanged = !initialData || initialData.phone !== formData.phone;
    const emailChanged = !initialData || initialData.email !== formData.email;

    if (phoneChanged || (formData.email && emailChanged)) {
      try {
        setCheckingDuplicate(true);
        const res = await recruitmentService.checkDuplicate({
          phone: formData.phone,
          email: formData.email || undefined,
          exclude_id: initialData?.lead_id,
        });

        if (res.duplicate_found && res.matches?.length > 0) {
          setDuplicateMatches(res.matches);
        } else {
          setDuplicateMatches([]);
        }
      } catch (err) {
        console.warn("Duplicate pre-check failed:", err);
      } finally {
        setCheckingDuplicate(false);
      }
    }
  };

  // ── Stepper Navigation ─────────────────────────────────────────────────────
  const handleNext = async () => {
    if (!validateStep(activeStep)) return;

    if (activeStep === 2) {
      // Before entering Review step, perform duplicate check
      await checkDuplicatesIfApplicable();
    }

    setActiveStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setActiveStep((prev) => Math.max(0, prev - 1));
  };

  const handleJumpToStep = (stepIndex: number) => {
    // Allow jumping to previous steps or next step if valid
    if (stepIndex < activeStep) {
      setActiveStep(stepIndex);
    } else if (validateStep(activeStep)) {
      setActiveStep(stepIndex);
    }
  };

  // ── Language checkbox toggle ───────────────────────────────────────────────
  const handleToggleLanguage = (lang: string) => {
    setFormData((prev) => {
      const exists = prev.languages_known.includes(lang);
      const updated = exists
        ? prev.languages_known.filter((l) => l !== lang)
        : [...prev.languages_known, lang];
      return { ...prev, languages_known: updated };
    });
  };

  // ── Submit Handler ─────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    // Final validation of all steps
    if (!validateStep(0) || !validateStep(1) || !validateStep(2)) {
      setErrorMsg("Please correct the errors in the previous steps before submitting.");
      return;
    }

    // If duplicate found and user hasn't confirmed, require confirmation
    if (duplicateMatches.length > 0 && !duplicateConfirmed && !isEdit) {
      setErrorMsg("Please acknowledge the duplicate candidate warning before proceeding.");
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg(null);

      const cleanPhone = formData.phone.replace(/[\s\-\(\)\.]/g, "");
      const cleanAlt = formData.alternate_phone.replace(/[\s\-\(\)\.]/g, "");

      const questionnairePayload = {
        willing_to_relocate: formData.willing_to_relocate,
        has_driving_license: formData.has_driving_license,
        own_two_wheeler: formData.own_two_wheeler,
        primary_territory_knowledge: formData.primary_territory_knowledge.trim() || undefined,
        languages_known: formData.languages_known,
        relevant_industry_experience: formData.relevant_industry_experience.trim() || undefined,
        interviewer_notes: formData.interviewer_notes.trim() || undefined,
      };

      if (isEdit && initialData) {
        // ── EDIT (PATCH) PATH ────────────────────────────────────────────────
        const updatePayload: UpdateCandidatePayload = {
          candidate_name: formData.candidate_name.trim(),
          phone: cleanPhone,
          alternate_phone: cleanAlt || undefined,
          email: formData.email.trim() || undefined,
          city: formData.city.trim() || undefined,
          state: formData.state.trim() || "Gujarat",
          source: formData.source || "Manual",
          category_id: Number(formData.category_id) || undefined,
          current_company: formData.current_company.trim() || undefined,
          current_designation: formData.current_designation.trim() || undefined,
          total_experience_years:
            formData.total_experience_years !== ""
              ? Number(formData.total_experience_years)
              : 0,
          highest_qualification: formData.highest_qualification.trim() || undefined,
          current_ctc:
            formData.current_ctc !== "" ? Number(formData.current_ctc) : undefined,
          expected_ctc:
            formData.expected_ctc !== "" ? Number(formData.expected_ctc) : undefined,
          notice_period_days:
            formData.notice_period_days !== ""
              ? Number(formData.notice_period_days)
              : undefined,
          key_skills: formData.key_skills.trim() || undefined,
          resume_url: formData.resume_url.trim() || undefined,
          questionnaire_responses: questionnairePayload,
          status: formData.status,
          status_notes: formData.status_notes.trim() || undefined,
          follow_up_date: formData.follow_up_date || undefined,
        };

        const updated = await recruitmentService.updateLead(
          initialData.lead_id,
          updatePayload
        );
        onSuccess(updated, true);
        onClose();
      } else {
        // ── CREATE PATH ──────────────────────────────────────────────────────
        const selectedCat = categories.find(
          (c) => c.category_id === Number(formData.category_id)
        );

        const createPayload: CreateCandidatePayload = {
          candidate_name: formData.candidate_name.trim(),
          phone: cleanPhone,
          alternate_phone: cleanAlt || undefined,
          email: formData.email.trim() || undefined,
          city: formData.city.trim() || undefined,
          state: formData.state.trim() || "Gujarat",
          source: formData.source || "Manual",
          category_id: Number(formData.category_id) || undefined,
          category_name: selectedCat ? (selectedCat.category_name || selectedCat.name) : undefined,
          current_company: formData.current_company.trim() || undefined,
          current_designation: formData.current_designation.trim() || undefined,
          total_experience_years:
            formData.total_experience_years !== ""
              ? Number(formData.total_experience_years)
              : 0,
          highest_qualification: formData.highest_qualification.trim() || undefined,
          current_ctc:
            formData.current_ctc !== "" ? Number(formData.current_ctc) : undefined,
          expected_ctc:
            formData.expected_ctc !== "" ? Number(formData.expected_ctc) : undefined,
          notice_period_days:
            formData.notice_period_days !== ""
              ? Number(formData.notice_period_days)
              : undefined,
          key_skills: formData.key_skills.trim() || undefined,
          resume_url: formData.resume_url.trim() || undefined,
          questionnaire_responses: questionnairePayload,
          status: formData.status,
          status_notes: formData.status_notes.trim() || undefined,
          follow_up_date: formData.follow_up_date || undefined,
          allow_duplicate: duplicateConfirmed,
        };

        const created = await recruitmentService.createLead(createPayload);
        onSuccess(created, false);
        onClose();
      }
    } catch (err: any) {
      console.error("Submission failed:", err);
      const detail = err?.response?.data?.detail;
      if (typeof detail === "object" && detail?.message) {
        setErrorMsg(detail.message);
      } else if (typeof detail === "string") {
        setErrorMsg(detail);
      } else {
        setErrorMsg("Failed to save candidate. Please verify your connection and permissions.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCategoryName =
    categories.find((c) => c.category_id === Number(formData.category_id))?.category_name ||
    categories.find((c) => c.category_id === Number(formData.category_id))?.name ||
    "—";

  return (
    <Dialog
      open={open}
      onClose={() => !submitting && onClose()}
      maxWidth="md"
      fullWidth
      fullScreen={isMobile}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 1.5,
                bgcolor: isEdit ? "secondary.main" : "primary.main",
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {isEdit ? <EditStepIcon fontSize="small" /> : <PersonIcon fontSize="small" />}
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                {isEdit
                  ? `Edit Candidate: ${initialData?.candidate_name} (${initialData?.lead_code})`
                  : "Add New Candidate"}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {isEdit
                  ? "Update candidate information, resume link, or questionnaire evaluation"
                  : "Step-by-step registration for new candidate talent pool records"}
              </Typography>
            </Box>
          </Box>
          <IconButton onClick={onClose} size="small" disabled={submitting}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <Box sx={{ px: { xs: 1.5, sm: 3 }, pt: 1, pb: 1.5 }}>
        <Stepper activeStep={activeStep} alternativeLabel={!isMobile}>
          {STEPS.map((label, idx) => (
            <Step key={label} completed={activeStep > idx}>
              <StepLabel
                onClick={() => handleJumpToStep(idx)}
                sx={{
                  cursor: "pointer",
                  "& .MuiStepLabel-label": {
                    fontSize: { xs: "0.75rem", sm: "0.85rem" },
                    fontWeight: activeStep === idx ? 700 : 500,
                  },
                }}
              >
                {label}
              </StepLabel>
            </Step>
          ))}
        </Stepper>
      </Box>

      <DialogContent dividers sx={{ p: { xs: 2, sm: 3 } }}>
        {errorMsg && (
          <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2 }} onClose={() => setErrorMsg(null)}>
            {errorMsg}
          </Alert>
        )}

        {/* ── STEP 1: PERSONAL DETAILS ────────────────────────────────────────── */}
        {activeStep === 0 && (
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "primary.main", mb: 2 }}>
              Step 1: Personal & Contact Information
            </Typography>

            <Grid container spacing={2}>
              {/* Candidate Full Name */}
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  required
                  size="small"
                  label="Candidate Full Name"
                  placeholder="e.g. Ramesh Patel"
                  value={formData.candidate_name}
                  onChange={(e) => {
                    setFormData({ ...formData, candidate_name: e.target.value });
                    if (errors.candidate_name) setErrors({ ...errors, candidate_name: "" });
                  }}
                  error={Boolean(errors.candidate_name)}
                  helperText={errors.candidate_name || "Full legal or professional name"}
                />
              </Grid>

              {/* Primary Phone */}
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  required
                  size="small"
                  label="Primary Mobile Number"
                  placeholder="e.g. 9876543210"
                  value={formData.phone}
                  onChange={(e) => {
                    setFormData({ ...formData, phone: e.target.value });
                    if (errors.phone) setErrors({ ...errors, phone: "" });
                  }}
                  error={Boolean(errors.phone)}
                  helperText={errors.phone || "10-digit Indian phone number (used for duplicate matching)"}
                />
              </Grid>

              {/* Alternate Phone */}
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  label="Alternate Phone (Optional)"
                  placeholder="e.g. 9822012345"
                  value={formData.alternate_phone}
                  onChange={(e) => {
                    setFormData({ ...formData, alternate_phone: e.target.value });
                    if (errors.alternate_phone) setErrors({ ...errors, alternate_phone: "" });
                  }}
                  error={Boolean(errors.alternate_phone)}
                  helperText={errors.alternate_phone}
                />
              </Grid>

              {/* Email */}
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  type="email"
                  label="Email Address (Optional)"
                  placeholder="candidate@example.com"
                  value={formData.email}
                  onChange={(e) => {
                    setFormData({ ...formData, email: e.target.value });
                    if (errors.email) setErrors({ ...errors, email: "" });
                  }}
                  error={Boolean(errors.email)}
                  helperText={errors.email || "Used for duplicate matching and email notifications"}
                />
              </Grid>

              {/* City */}
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  size="small"
                  label="Current City"
                  placeholder="e.g. Vadodara, Ahmedabad"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
              </Grid>

              {/* State */}
              <Grid item xs={12} sm={4}>
                <FormControl fullWidth size="small">
                  <InputLabel>State</InputLabel>
                  <Select
                    value={formData.state}
                    label="State"
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  >
                    {INDIAN_STATES.map((st) => (
                      <MenuItem key={st} value={st}>
                        {st}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              {/* Candidate Source */}
              <Grid item xs={12} sm={4}>
                <FormControl fullWidth size="small">
                  <InputLabel>Candidate Source</InputLabel>
                  <Select
                    value={formData.source}
                    label="Candidate Source"
                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                  >
                    {SOURCE_OPTIONS.map((src) => (
                      <MenuItem key={src} value={src}>
                        {src}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Box>
        )}

        {/* ── STEP 2: PROFESSIONAL DETAILS ────────────────────────────────────── */}
        {activeStep === 1 && (
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "primary.main", mb: 2 }}>
              Step 2: Professional Background & Compensation
            </Typography>

            {categoriesError && (
              <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                {categoriesError}
              </Alert>
            )}

            {!categoriesLoading && !categoriesError && categories.length === 0 && (
              <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>
                No recruitment categories are currently configured in the database. Please request an administrator to add active recruitment categories.
              </Alert>
            )}

            <Grid container spacing={2}>
              {/* Category */}
              <Grid item xs={12} sm={6}>
                <FormControl
                  fullWidth
                  size="small"
                  required
                  error={Boolean(errors.category_id)}
                  disabled={categoriesLoading || categories.length === 0}
                >
                  <InputLabel>Recruitment Category</InputLabel>
                  <Select
                    value={formData.category_id}
                    label="Recruitment Category"
                    onChange={(e) => {
                      setFormData({ ...formData, category_id: e.target.value as number });
                      if (errors.category_id) setErrors({ ...errors, category_id: "" });
                    }}
                  >
                    {categoriesLoading ? (
                      <MenuItem disabled value="">
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <CircularProgress size={16} />
                          <em>Loading categories...</em>
                        </Box>
                      </MenuItem>
                    ) : categories.length === 0 ? (
                      <MenuItem disabled value="">
                        <em>No categories available</em>
                      </MenuItem>
                    ) : (
                      categories.map((c) => (
                        <MenuItem key={c.category_id} value={c.category_id}>
                          {c.category_name || c.name}
                        </MenuItem>
                      ))
                    )}
                  </Select>
                  {errors.category_id ? (
                    <FormHelperText>{errors.category_id}</FormHelperText>
                  ) : !categoriesLoading && categories.length === 0 ? (
                    <FormHelperText error>No categories configured in database.</FormHelperText>
                  ) : null}
                </FormControl>
              </Grid>

              {/* Highest Qualification */}
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Highest Qualification</InputLabel>
                  <Select
                    value={formData.highest_qualification}
                    label="Highest Qualification"
                    onChange={(e) =>
                      setFormData({ ...formData, highest_qualification: e.target.value })
                    }
                  >
                    <MenuItem value="">— None Selected —</MenuItem>
                    {QUALIFICATION_OPTIONS.map((q) => (
                      <MenuItem key={q} value={q}>
                        {q}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              {/* Current Company */}
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  label="Current Employer / Company"
                  placeholder="e.g. ABC Chemicals Pvt Ltd"
                  value={formData.current_company}
                  onChange={(e) => setFormData({ ...formData, current_company: e.target.value })}
                />
              </Grid>

              {/* Current Designation */}
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  label="Current Designation"
                  placeholder="e.g. Area Sales Manager"
                  value={formData.current_designation}
                  onChange={(e) => setFormData({ ...formData, current_designation: e.target.value })}
                />
              </Grid>

              {/* Experience in Years */}
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  inputProps={{ min: 0, step: 0.5 }}
                  label="Total Experience (Years)"
                  value={formData.total_experience_years}
                  onChange={(e) => {
                    setFormData({ ...formData, total_experience_years: e.target.value });
                    if (errors.total_experience_years) {
                      setErrors({ ...errors, total_experience_years: "" });
                    }
                  }}
                  error={Boolean(errors.total_experience_years)}
                  helperText={errors.total_experience_years}
                />
              </Grid>

              {/* Notice Period */}
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  inputProps={{ min: 0, step: 1 }}
                  label="Notice Period (Days)"
                  placeholder="e.g. 30"
                  value={formData.notice_period_days}
                  onChange={(e) => {
                    setFormData({ ...formData, notice_period_days: e.target.value });
                    if (errors.notice_period_days) {
                      setErrors({ ...errors, notice_period_days: "" });
                    }
                  }}
                  error={Boolean(errors.notice_period_days)}
                  helperText={errors.notice_period_days}
                />
              </Grid>

              {/* Current CTC */}
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  inputProps={{ min: 0, step: 10000 }}
                  label="Current Annual CTC (₹)"
                  placeholder="e.g. 450000"
                  value={formData.current_ctc}
                  onChange={(e) => {
                    setFormData({ ...formData, current_ctc: e.target.value });
                    if (errors.current_ctc) setErrors({ ...errors, current_ctc: "" });
                  }}
                  error={Boolean(errors.current_ctc)}
                  helperText={errors.current_ctc}
                />
              </Grid>

              {/* Expected CTC */}
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  inputProps={{ min: 0, step: 10000 }}
                  label="Expected Annual CTC (₹)"
                  placeholder="e.g. 600000"
                  value={formData.expected_ctc}
                  onChange={(e) => {
                    setFormData({ ...formData, expected_ctc: e.target.value });
                    if (errors.expected_ctc) setErrors({ ...errors, expected_ctc: "" });
                  }}
                  error={Boolean(errors.expected_ctc)}
                  helperText={errors.expected_ctc}
                />
              </Grid>

              {/* Key Skills */}
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  rows={2}
                  size="small"
                  label="Key Skills & Domain Expertise"
                  placeholder="e.g. Industrial Chemical Sales, B2B, Channel Distribution, Agro-Chemicals, Payment Collection"
                  value={formData.key_skills}
                  onChange={(e) => setFormData({ ...formData, key_skills: e.target.value })}
                />
              </Grid>
            </Grid>
          </Box>
        )}

        {/* ── STEP 3: RESUME & QUESTIONNAIRE ──────────────────────────────────── */}
        {activeStep === 2 && (
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "primary.main", mb: 2 }}>
              Step 3: Resume URL & Screening Questionnaire
            </Typography>

            {/* Google Drive Resume Section */}
            <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 2 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                <DocIcon color="primary" />
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Google Drive Resume Link
                </Typography>
              </Box>

              <TextField
                fullWidth
                size="small"
                label="Google Drive Resume URL"
                placeholder="https://drive.google.com/file/d/1.../view?usp=sharing"
                value={formData.resume_url}
                onChange={(e) => {
                  setFormData({ ...formData, resume_url: e.target.value });
                  if (errors.resume_url) setErrors({ ...errors, resume_url: "" });
                }}
                error={Boolean(errors.resume_url)}
                helperText={errors.resume_url}
                InputProps={{
                  endAdornment: formData.resume_url.trim() && validateGoogleDriveUrl(formData.resume_url).valid && (
                    <Tooltip title="Test Google Drive Link">
                      <IconButton
                        size="small"
                        component="a"
                        href={formData.resume_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <OpenInNewIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  ),
                }}
              />

              {/* Mandatory instruction below resume field */}
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: "italic" }}>
                Upload the candidate's resume to Google Drive, set General access to Anyone with the
                link with Viewer permission, then paste the link here.
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                Note: URL validation verifies the link structure, but cannot guarantee that the
                file's Google Drive sharing permissions are set to Viewer for anyone with the link.
              </Typography>
            </Paper>

            {/* Baseline Screening Questionnaire */}
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
              Candidate Screening Questionnaire
            </Typography>

            <Grid container spacing={2}>
              {/* Willingness to Relocate / Travel */}
              <Grid item xs={12} sm={4}>
                <FormControl fullWidth size="small">
                  <InputLabel>Willing to Travel / Relocate</InputLabel>
                  <Select
                    value={formData.willing_to_relocate}
                    label="Willing to Travel / Relocate"
                    onChange={(e) =>
                      setFormData({ ...formData, willing_to_relocate: e.target.value })
                    }
                  >
                    <MenuItem value="Yes - Anywhere">Yes - Anywhere</MenuItem>
                    <MenuItem value="Within State Only">Within State Only</MenuItem>
                    <MenuItem value="No - Local Only">No - Local Only</MenuItem>
                    <MenuItem value="Open for Discussion">Open for Discussion</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              {/* Driving License */}
              <Grid item xs={12} sm={4}>
                <FormControl fullWidth size="small">
                  <InputLabel>Driving License</InputLabel>
                  <Select
                    value={formData.has_driving_license}
                    label="Driving License"
                    onChange={(e) =>
                      setFormData({ ...formData, has_driving_license: e.target.value })
                    }
                  >
                    <MenuItem value="Yes - 2-Wheeler & 4-Wheeler">
                      Yes - 2-Wheeler & 4-Wheeler
                    </MenuItem>
                    <MenuItem value="Yes - 2-Wheeler Only">Yes - 2-Wheeler Only</MenuItem>
                    <MenuItem value="No">No</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              {/* Owns Two-Wheeler */}
              <Grid item xs={12} sm={4}>
                <FormControl fullWidth size="small">
                  <InputLabel>Owns Two-Wheeler / Vehicle</InputLabel>
                  <Select
                    value={formData.own_two_wheeler}
                    label="Owns Two-Wheeler / Vehicle"
                    onChange={(e) =>
                      setFormData({ ...formData, own_two_wheeler: e.target.value })
                    }
                  >
                    <MenuItem value="Yes">Yes</MenuItem>
                    <MenuItem value="No">No</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              {/* Territory Knowledge */}
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  label="Primary Territory Knowledge"
                  placeholder="e.g. South Gujarat (Bharuch, Ankleshwar, Vapi)"
                  value={formData.primary_territory_knowledge}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      primary_territory_knowledge: e.target.value,
                    })
                  }
                />
              </Grid>

              {/* Languages Known Checkboxes */}
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary" display="block">
                  Languages Known
                </Typography>
                <FormGroup row sx={{ mt: 0.5 }}>
                  {AVAILABLE_LANGUAGES.map((lang) => (
                    <FormControlLabel
                      key={lang}
                      control={
                        <Checkbox
                          size="small"
                          checked={formData.languages_known.includes(lang)}
                          onChange={() => handleToggleLanguage(lang)}
                        />
                      }
                      label={<Typography variant="body2">{lang}</Typography>}
                    />
                  ))}
                </FormGroup>
              </Grid>

              {/* Chemical / Agro Experience */}
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  size="small"
                  label="Relevant Chemical / Agriculture Industry Experience"
                  placeholder="e.g. 2 years distributing agro-chemicals to distributors in Anand & Kheda"
                  value={formData.relevant_industry_experience}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      relevant_industry_experience: e.target.value,
                    })
                  }
                />
              </Grid>

              {/* Interviewer Notes */}
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  rows={2}
                  size="small"
                  label="Interviewer Initial Screening Assessment / Notes"
                  placeholder="Communication skills, professionalism, suitability for sales role, interview remarks"
                  value={formData.interviewer_notes}
                  onChange={(e) =>
                    setFormData({ ...formData, interviewer_notes: e.target.value })
                  }
                />
              </Grid>
            </Grid>

            <Divider sx={{ my: 2.5 }} />

            {/* Lifecycle: Status & Follow-up */}
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
              Status & Reminders
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Candidate Status</InputLabel>
                  <Select
                    value={formData.status}
                    label="Candidate Status"
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        status: e.target.value as RecruitmentStatus,
                      })
                    }
                  >
                    {ALLOWED_RECRUITMENT_STATUSES.map((st) => (
                      <MenuItem key={st} value={st}>
                        {st}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label="Next Follow-up / Interview Date"
                  InputLabelProps={{ shrink: true }}
                  value={formData.follow_up_date}
                  onChange={(e) =>
                    setFormData({ ...formData, follow_up_date: e.target.value })
                  }
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  rows={2}
                  size="small"
                  label="Status Notes / Context"
                  placeholder="e.g. Candidate invited for technical round on Friday"
                  value={formData.status_notes}
                  onChange={(e) =>
                    setFormData({ ...formData, status_notes: e.target.value })
                  }
                />
              </Grid>
            </Grid>
          </Box>
        )}

        {/* ── STEP 4: REVIEW & SUBMIT ─────────────────────────────────────────── */}
        {activeStep === 3 && (
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "primary.main", mb: 2 }}>
              Step 4: Review Information & Submit
            </Typography>

            {/* Duplicate Match Warning */}
            {checkingDuplicate && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                <CircularProgress size={16} />
                <Typography variant="body2" color="text.secondary">
                  Checking talent pool for duplicate phone or email...
                </Typography>
              </Box>
            )}

            {duplicateMatches.length > 0 && !isEdit && (
              <Alert
                severity="warning"
                icon={<WarningIcon />}
                sx={{ mb: 2.5, borderRadius: 2 }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Potential Duplicate Candidate Detected
                </Typography>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  A candidate record already exists in the talent pool with matching phone or email:
                </Typography>
                {duplicateMatches.map((m) => (
                  <Box
                    key={m.lead_id}
                    sx={{
                      p: 1.5,
                      borderRadius: 1.5,
                      bgcolor: "background.paper",
                      border: "1px solid",
                      borderColor: "divider",
                      mb: 1,
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {m.candidate_name} ({m.lead_code}) — Status: {m.status}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Phone: {m.phone} | Email: {m.email || "N/A"} | Category: {m.category_name}
                    </Typography>
                  </Box>
                ))}

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={duplicateConfirmed}
                      onChange={(e) => setDuplicateConfirmed(e.target.checked)}
                      color="warning"
                    />
                  }
                  label={
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      I have reviewed the existing record above and explicitly confirm I want to
                      register this duplicate candidate.
                    </Typography>
                  }
                />
              </Alert>
            )}

            {/* Review Sections */}
            <Grid container spacing={2}>
              {/* Personal Summary Card */}
              <Grid item xs={12} md={6}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: "100%" }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "primary.main" }}>
                      1. Personal Details
                    </Typography>
                    <Button
                      size="small"
                      startIcon={<EditStepIcon sx={{ fontSize: 14 }} />}
                      onClick={() => handleJumpToStep(0)}
                      sx={{ textTransform: "none", fontSize: "0.75rem" }}
                    >
                      Edit
                    </Button>
                  </Box>
                  <Grid container spacing={1}>
                    <Grid item xs={5}><Typography variant="caption" color="text.secondary">Name:</Typography></Grid>
                    <Grid item xs={7}><Typography variant="body2" sx={{ fontWeight: 600 }}>{formData.candidate_name}</Typography></Grid>

                    <Grid item xs={5}><Typography variant="caption" color="text.secondary">Phone:</Typography></Grid>
                    <Grid item xs={7}><Typography variant="body2">{formData.phone}</Typography></Grid>

                    <Grid item xs={5}><Typography variant="caption" color="text.secondary">Alt Phone:</Typography></Grid>
                    <Grid item xs={7}><Typography variant="body2">{formData.alternate_phone || "—"}</Typography></Grid>

                    <Grid item xs={5}><Typography variant="caption" color="text.secondary">Email:</Typography></Grid>
                    <Grid item xs={7}><Typography variant="body2">{formData.email || "—"}</Typography></Grid>

                    <Grid item xs={5}><Typography variant="caption" color="text.secondary">Location:</Typography></Grid>
                    <Grid item xs={7}><Typography variant="body2">{[formData.city, formData.state].filter(Boolean).join(", ")}</Typography></Grid>

                    <Grid item xs={5}><Typography variant="caption" color="text.secondary">Source:</Typography></Grid>
                    <Grid item xs={7}><Typography variant="body2">{formData.source}</Typography></Grid>
                  </Grid>
                </Paper>
              </Grid>

              {/* Professional Summary Card */}
              <Grid item xs={12} md={6}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: "100%" }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "primary.main" }}>
                      2. Professional Details
                    </Typography>
                    <Button
                      size="small"
                      startIcon={<EditStepIcon sx={{ fontSize: 14 }} />}
                      onClick={() => handleJumpToStep(1)}
                      sx={{ textTransform: "none", fontSize: "0.75rem" }}
                    >
                      Edit
                    </Button>
                  </Box>
                  <Grid container spacing={1}>
                    <Grid item xs={5}><Typography variant="caption" color="text.secondary">Category:</Typography></Grid>
                    <Grid item xs={7}><Typography variant="body2" sx={{ fontWeight: 600 }}>{selectedCategoryName}</Typography></Grid>

                    <Grid item xs={5}><Typography variant="caption" color="text.secondary">Experience:</Typography></Grid>
                    <Grid item xs={7}><Typography variant="body2">{formData.total_experience_years} years</Typography></Grid>

                    <Grid item xs={5}><Typography variant="caption" color="text.secondary">Company:</Typography></Grid>
                    <Grid item xs={7}><Typography variant="body2">{formData.current_company || "—"}</Typography></Grid>

                    <Grid item xs={5}><Typography variant="caption" color="text.secondary">Designation:</Typography></Grid>
                    <Grid item xs={7}><Typography variant="body2">{formData.current_designation || "—"}</Typography></Grid>

                    <Grid item xs={5}><Typography variant="caption" color="text.secondary">Qualification:</Typography></Grid>
                    <Grid item xs={7}><Typography variant="body2">{formData.highest_qualification || "—"}</Typography></Grid>

                    <Grid item xs={5}><Typography variant="caption" color="text.secondary">CTC (Cur / Exp):</Typography></Grid>
                    <Grid item xs={7}>
                      <Typography variant="body2">
                        {formData.current_ctc ? `₹${formData.current_ctc}` : "—"} /{" "}
                        {formData.expected_ctc ? `₹${formData.expected_ctc}` : "—"}
                      </Typography>
                    </Grid>

                    <Grid item xs={5}><Typography variant="caption" color="text.secondary">Notice Period:</Typography></Grid>
                    <Grid item xs={7}><Typography variant="body2">{formData.notice_period_days ? `${formData.notice_period_days} days` : "—"}</Typography></Grid>
                  </Grid>
                </Paper>
              </Grid>

              {/* Resume & Questionnaire Summary */}
              <Grid item xs={12}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "primary.main" }}>
                      3. Resume Link & Screening Q&A
                    </Typography>
                    <Button
                      size="small"
                      startIcon={<EditStepIcon sx={{ fontSize: 14 }} />}
                      onClick={() => handleJumpToStep(2)}
                      sx={{ textTransform: "none", fontSize: "0.75rem" }}
                    >
                      Edit
                    </Button>
                  </Box>
                  <Grid container spacing={1}>
                    <Grid item xs={12} sm={3}><Typography variant="caption" color="text.secondary">Resume Link:</Typography></Grid>
                    <Grid item xs={12} sm={9}>
                      {formData.resume_url ? (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Typography variant="body2" sx={{ wordBreak: "break-all" }}>
                            {formData.resume_url}
                          </Typography>
                          <IconButton
                            size="small"
                            component="a"
                            href={formData.resume_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <OpenInNewIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.secondary">None provided</Typography>
                      )}
                    </Grid>

                    <Grid item xs={12} sm={3}><Typography variant="caption" color="text.secondary">Relocation & Vehicle:</Typography></Grid>
                    <Grid item xs={12} sm={9}>
                      <Typography variant="body2">
                        Relocate: {formData.willing_to_relocate} | License: {formData.has_driving_license} | Owns 2W: {formData.own_two_wheeler}
                      </Typography>
                    </Grid>

                    <Grid item xs={12} sm={3}><Typography variant="caption" color="text.secondary">Territory & Languages:</Typography></Grid>
                    <Grid item xs={12} sm={9}>
                      <Typography variant="body2">
                        Territory: {formData.primary_territory_knowledge || "—"} | Languages: {formData.languages_known.join(", ") || "—"}
                      </Typography>
                    </Grid>

                    <Grid item xs={12} sm={3}><Typography variant="caption" color="text.secondary">Initial Status:</Typography></Grid>
                    <Grid item xs={12} sm={9}>
                      <Chip label={formData.status} size="small" color="primary" sx={{ fontWeight: 600 }} />
                      {formData.follow_up_date && (
                        <Typography variant="caption" sx={{ ml: 1.5 }}>
                          Follow-up: {formData.follow_up_date}
                        </Typography>
                      )}
                    </Grid>
                  </Grid>
                </Paper>
              </Grid>
            </Grid>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, justifyContent: "space-between" }}>
        <Button
          onClick={onClose}
          color="inherit"
          disabled={submitting}
          sx={{ textTransform: "none" }}
        >
          Cancel
        </Button>

        <Box sx={{ display: "flex", gap: 1.5 }}>
          {activeStep > 0 && (
            <Button
              onClick={handleBack}
              startIcon={<BackIcon />}
              disabled={submitting}
              sx={{ textTransform: "none" }}
            >
              Back
            </Button>
          )}

          {activeStep < STEPS.length - 1 ? (
            <Button
              variant="contained"
              onClick={handleNext}
              endIcon={<NextIcon />}
              sx={{ textTransform: "none", fontWeight: 600, px: 2.5 }}
            >
              Next
            </Button>
          ) : (
            <Button
              variant="contained"
              color={isEdit ? "secondary" : "primary"}
              onClick={handleSubmit}
              startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
              disabled={submitting || (duplicateMatches.length > 0 && !duplicateConfirmed && !isEdit)}
              sx={{ textTransform: "none", fontWeight: 700, px: 3, borderRadius: 2 }}
            >
              {submitting
                ? "Saving..."
                : isEdit
                ? "Update Candidate"
                : "Submit Candidate"}
            </Button>
          )}
        </Box>
      </DialogActions>
    </Dialog>
  );
}
