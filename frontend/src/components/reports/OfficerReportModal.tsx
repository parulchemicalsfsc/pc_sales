/**
 * OfficerReportModal.tsx
 * ──────────────────────────────────────────────────────────────────────────
 * Dialog wrapper for FieldOfficerTimelineReport.
 * Allows quick opening from FieldManager top bar or RouteAuditTab.
 */

import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton,
} from "@mui/material";
import { Close as CloseIcon, PictureAsPdf as PdfIcon } from "@mui/icons-material";

import FieldOfficerTimelineReport from "./FieldOfficerTimelineReport";
import type { FieldOfficerItem } from "../../types/aura";

interface Props {
  open: boolean;
  onClose: () => void;
  initialFoEmail?: string;
  initialDate?: string;
  officersList?: FieldOfficerItem[];
}

export default function OfficerReportModal({
  open,
  onClose,
  initialFoEmail,
  initialDate,
  officersList,
}: Props) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ p: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Box display="flex" alignItems="center" gap={1}>
          <PdfIcon color="primary" />
          <Typography variant="h6" fontWeight={700}>
            Download Field Officer Timeline Report
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: { xs: 1.5, md: 3 } }}>
        <FieldOfficerTimelineReport
          initialFoEmail={initialFoEmail}
          initialDate={initialDate}
          officersList={officersList}
        />
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} variant="outlined">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
