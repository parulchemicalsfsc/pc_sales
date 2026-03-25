import { useState, useEffect } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  Alert,
  Chip,
  IconButton,
  Grid,
} from "@mui/material";
import { TableSkeleton } from "../components/Skeletons";
import {
  Add as AddIcon,
  Science as ScienceIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import { demoAPI } from "../services/api";
import type { Demo } from "../types";
import DemoDialog from "../components/DemoDialog";
import { useTranslation } from "../hooks/useTranslation";
import PermissionGate from "../components/PermissionGate";
import { PERMISSIONS } from "../config/permissions";

export default function Demos() {
  const { t, tf } = useTranslation();
  const [demos, setDemos] = useState<Demo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    loadDemos();
  }, []);

  const loadDemos = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await demoAPI.getAll({ limit: 1000 });
      setDemos(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("demos.loadError", "Failed to load demos"),
      );
    } finally {
      setLoading(false);
    }
  };

  const columns: GridColDef[] = [
    {
      field: "demo_id",
      headerName: t("demos.demoId", "Demo ID"),
      width: 100,
      renderCell: (params) => (
        <Chip label={`#${params.value}`} size="small" color="primary" />
      ),
    },
    {
      field: "customer_name",
      headerName: t("customers.customerName"),
      flex: 1,
      minWidth: 200,
    },
    {
      field: "product_name",
      headerName: t("demos.product", "Product"),
      width: 200,
    },
    {
      field: "demo_date",
      headerName: t("demos.date"),
      width: 120,
      renderCell: (params) => new Date(params.value).toLocaleDateString(),
    },
    {
      field: "demo_time",
      headerName: tf("time"),
      width: 100,
    },
    {
      field: "village",
      headerName: tf("village"),
      width: 150,
    },
    {
      field: "conversion_status",
      headerName: "Status",
      width: 140,
      renderCell: (params) => (
        <Chip
          label={params.value}
          size="small"
          color={
            params.value === "Converted"
              ? "success"
              : params.value === "Scheduled"
                ? "info"
                : "default"
          }
        />
      ),
    },
  ];

  return (
    <PermissionGate permission={PERMISSIONS.VIEW_DEMOS} page permissionLabel="view demos">
      <Box>
        <Box sx={{ mb: { xs: 2, md: 4 } }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
            <ScienceIcon sx={{ mr: 1, verticalAlign: "middle" }} />
            {t("demos.title")}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {t("demos.subtitle", "Schedule and track product demonstrations")}
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
              <PermissionGate permission={PERMISSIONS.SCHEDULE_DEMO}>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => setDialogOpen(true)}
                >
                  {t("demos.addDemo")}
                </Button>
              </PermissionGate>
              <IconButton onClick={loadDemos} color="primary">
                <RefreshIcon />
              </IconButton>
              <Box sx={{ ml: "auto" }}>
                <Chip label={`Total Demos: ${demos.length}`} color="primary" />
              </Box>
            </Box>
          </CardContent>
        </Card>

        <DemoDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSuccess={loadDemos}
        />

        <Card>
          <CardContent>
            <Box sx={{ height: 600, width: "100%", overflowX: "auto" }}>
              {loading ? (
                <TableSkeleton rows={10} columns={5} />
              ) : (
                <DataGrid
                  rows={demos}
                  columns={columns}
                  getRowId={(row) => row.demo_id}
                  pageSizeOptions={[10, 25, 50, 100]}
                  initialState={{
                    pagination: {
                      paginationModel: { pageSize: 25 },
                    },
                  }}
                  disableRowSelectionOnClick
                />
              )}
            </Box>
          </CardContent>
        </Card>
      </Box>
    </PermissionGate>
  );
}
