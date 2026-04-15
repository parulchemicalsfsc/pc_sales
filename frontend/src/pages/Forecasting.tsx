import React, { useState, useMemo } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Tab,
  Tabs,
  TextField,
  MenuItem,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  Chip,
  Button,
  Stack,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { forecastingAPI } from "../services/api";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import jsPDF from "jspdf";
// @ts-ignore
import autoTable from "jspdf-autotable";
import DownloadIcon from "@mui/icons-material/Download";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function CustomTabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

export default function Forecasting() {
  const [tabIndex, setTabIndex] = useState(0);

  // Custom timeframe states
  const [historyMonths, setHistoryMonths] = useState<number>(12);
  const [forecastMonths, setForecastMonths] = useState<number>(6);
  const [forecastMonthTarget, setForecastMonthTarget] = useState<string>("");
  const [district, setDistrict] = useState<string>("All");

  const handleExportCSV = (data: any[], filename: string) => {
    if (!data || data.length === 0) return;
    const keys = Object.keys(data[0]);
    const csvStr = [
      keys.join(","),
      ...data.map(row => keys.map(k => `"${(row[k] !== null && row[k] !== undefined) ? String(row[k]).replace(/"/g, '""') : ''}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = (data: any[], filename: string) => {
    if (!data || data.length === 0) return;
    const doc = new jsPDF();
    const keys = Object.keys(data[0]);
    const rows = data.map(item => keys.map(k => item[k]));

    autoTable(doc, {
      head: [keys],
      body: rows,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185], textColor: 255 }
    });

    doc.save(`${filename}.pdf`);
  };

  const currentMonthFilter = forecastMonthTarget || undefined;
  const currentDistrictFilter = district === "All" ? undefined : district;

  // 1) Monthly Forecast
  const { data: monthlyData, isLoading: monthlyLoading, error: monthlyError } = useQuery({
    queryKey: ["forecasting", "monthly", historyMonths, forecastMonths],
    queryFn: () => forecastingAPI.getMonthly({ history_months: historyMonths, forecast_months: forecastMonths }),
    enabled: tabIndex === 0,
  });

  // 2) District Forecast
  const { data: districtData, isLoading: districtLoading, error: districtError } = useQuery({
    queryKey: ["forecasting", "district", currentMonthFilter],
    queryFn: () => forecastingAPI.getDistrict({ forecast_month: currentMonthFilter }),
    enabled: tabIndex === 1,
  });

  // 3) Village Forecast
  const { data: villageData, isLoading: villageLoading, error: villageError } = useQuery({
    queryKey: ["forecasting", "village", currentMonthFilter, currentDistrictFilter],
    queryFn: () => forecastingAPI.getVillage({
      forecast_month: currentMonthFilter,
      district: currentDistrictFilter,
    }),
    enabled: tabIndex === 2,
  });

  const availableDistricts = useMemo(() => {
    const list = new Set<string>();
    if (districtData?.rows) {
      districtData.rows.forEach((r: any) => list.add(r.district));
    }
    return Array.from(list).sort();
  }, [districtData]);

  return (
    <Box>
      <Box sx={{ mb: 4, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold" gutterBottom>
            Predictive Analytics
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            AI-driven forecasts based on seasonal multipliers and historic averages.
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
          {tabIndex === 0 ? (
            <>
              <TextField
                type="number"
                label="History Months"
                InputLabelProps={{ shrink: true }}
                value={historyMonths}
                onChange={(e) => setHistoryMonths(Number(e.target.value) || 1)}
                size="small"
                sx={{ width: 150 }}
              />
              <TextField
                type="number"
                label="Forecast Months"
                InputLabelProps={{ shrink: true }}
                value={forecastMonths}
                onChange={(e) => setForecastMonths(Number(e.target.value) || 1)}
                size="small"
                sx={{ width: 150 }}
              />
            </>
          ) : (
            <>
              <TextField
                type="month"
                label="Forecast Target Month"
                InputLabelProps={{ shrink: true }}
                value={forecastMonthTarget}
                onChange={(e) => setForecastMonthTarget(e.target.value)}
                size="small"
                sx={{ minWidth: 200 }}
              />
              {tabIndex === 2 && (
                <TextField
                  select
                  label="District Filter"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  size="small"
                  sx={{ minWidth: 200 }}
                >
                  <MenuItem value="All">All Districts</MenuItem>
                  {availableDistricts.map(d => (
                    <MenuItem key={d} value={d}>{d}</MenuItem>
                  ))}
                </TextField>
              )}
            </>
          )}
        </Box>
      </Box>

      <Paper sx={{ width: '100%' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabIndex} onChange={(e, v) => setTabIndex(v)} aria-label="forecasting tabs" variant="scrollable" scrollButtons="auto">
            <Tab label="Overall Monthly Trend" />
            <Tab label="District Forecast" />
            <Tab label="Village Forecast" />
          </Tabs>
        </Box>

        {/* =============== MONTHLY TREND =============== */}
        <CustomTabPanel value={tabIndex} index={0}>
          {monthlyLoading ? <CircularProgress /> : monthlyError ? <Alert severity="error">Failed to load forecast data</Alert> : (
            <Card elevation={0}>
              <CardContent>
                <Box sx={{ mb: 3, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
                  <Box>
                    <Typography variant="h6" fontWeight="bold">Rolling Data (Actuals + Forecast)</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Shows moving average projected forward, multiplied by expected seasonal pattern.
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1}>
                    <Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => handleExportCSV(monthlyData?.series || [], "monthly_trend_forecast")}>CSV</Button>
                    <Button variant="outlined" startIcon={<PictureAsPdfIcon />} onClick={() => handleExportPDF(monthlyData?.series || [], "monthly_trend_forecast")}>PDF</Button>
                  </Stack>
                </Box>

                <Box sx={{ height: 400, width: "100%", mb: 4 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={monthlyData?.series || []} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis yAxisId="left" tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`} />
                      <YAxis yAxisId="right" orientation="right" tickFormatter={(val) => `${val}L`} />
                      <RechartsTooltip
                        formatter={(value: any, name: string) => {
                          if (name === "Revenue (Actual)" || name === "Revenue (Forecast)") return [`₹${value.toLocaleString()}`, name];
                          if (name === "Liters") return [`${value.toLocaleString()} L`, name];
                          return [value, name];
                        }}
                        labelFormatter={(label) => `Month: ${label}`}
                      />
                      <Legend />
                      <Bar yAxisId="left" dataKey="revenue" name="Revenue">
                        {
                          (monthlyData?.series || []).map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={entry.type === 'forecast' ? '#8884d8' : '#82ca9d'} fillOpacity={entry.type === 'forecast' ? 0.6 : 1} />
                          ))
                        }
                      </Bar>
                      <Line yAxisId="right" type="monotone" dataKey="liters" name="Liters Volume" stroke="#ff7300" strokeWidth={2} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </Box>

                <Box sx={{ mt: 2 }}>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead sx={{ bgcolor: 'action.hover' }}>
                        <TableRow>
                          <TableCell>Month</TableCell>
                          <TableCell>Type</TableCell>
                          <TableCell align="right">Revenue</TableCell>
                          <TableCell align="right">Volume (Liters)</TableCell>
                          <TableCell align="right">Seasonal Diff</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {(monthlyData?.series || []).map((row: any) => (
                          <TableRow key={row.month} sx={{ bgcolor: row.type === 'forecast' ? 'rgba(136, 132, 216, 0.05)' : 'inherit' }}>
                            <TableCell>{row.month}</TableCell>
                            <TableCell>
                              <Chip size="small" label={row.type.toUpperCase()} color={row.type === 'forecast' ? 'primary' : 'success'} variant="outlined" />
                            </TableCell>
                            <TableCell align="right">₹{row.revenue.toLocaleString()}</TableCell>
                            <TableCell align="right">{row.liters.toLocaleString()} L</TableCell>
                            <TableCell align="right">{(row.seasonal_factor * 100 - 100).toFixed(1)}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              </CardContent>
            </Card>
          )}
        </CustomTabPanel>

        {/* =============== DISTRICT FORECAST =============== */}
        <CustomTabPanel value={tabIndex} index={1}>
          {districtLoading ? <CircularProgress /> : districtError ? <Alert severity="error">Failed to load district data</Alert> : (
            <Card elevation={0}>
              <CardContent>
                <Grid container spacing={3} sx={{ mb: 3 }}>
                  <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 2 }}>
                      <Typography variant="subtitle2" sx={{ opacity: 0.8 }}>Target Month</Typography>
                      <Typography variant="h5" fontWeight="bold">{districtData?.forecast_month}</Typography>
                    </Paper>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'info.main', color: 'info.contrastText', borderRadius: 2 }}>
                      <Typography variant="subtitle2" sx={{ opacity: 0.8 }}>Seasonal Demand Factor</Typography>
                      <Typography variant="h5" fontWeight="bold">{(districtData?.seasonal_factor || 1).toFixed(2)}x</Typography>
                    </Paper>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'success.main', color: 'success.contrastText', borderRadius: 2 }}>
                      <Typography variant="subtitle2" sx={{ opacity: 0.8 }}>Total Est. Revenue</Typography>
                      <Typography variant="h5" fontWeight="bold">
                        ₹{(districtData?.rows || []).reduce((acc: number, r: any) => acc + r.forecast_revenue, 0).toLocaleString()}
                      </Typography>
                    </Paper>
                  </Grid>
                </Grid>

                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                  <Stack direction="row" spacing={1}>
                    <Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => handleExportCSV(districtData?.rows || [], "district_forecast")}>CSV</Button>
                    <Button variant="outlined" startIcon={<PictureAsPdfIcon />} onClick={() => handleExportPDF(districtData?.rows || [], "district_forecast")}>PDF</Button>
                  </Stack>
                </Box>

                <TableContainer component={Paper} variant="outlined">
                  <Table>
                    <TableHead sx={{ bgcolor: 'action.hover' }}>
                      <TableRow>
                        <TableCell>Rank</TableCell>
                        <TableCell>District</TableCell>
                        <TableCell align="right">6-Month Avg Revenue</TableCell>
                        <TableCell align="right">Forecasted Volume</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>Forecasted Revenue</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(districtData?.rows || []).map((row: any) => (
                        <TableRow key={row.district}>
                          <TableCell>
                            <Box sx={{
                              width: 28, height: 28, borderRadius: '50%',
                              bgcolor: row.rank <= 3 ? 'secondary.main' : 'grey.200',
                              color: row.rank <= 3 ? 'white' : 'text.primary',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontWeight: 'bold', fontSize: '0.85rem'
                            }}>
                              {row.rank}
                            </Box>
                          </TableCell>
                          <TableCell sx={{ fontWeight: 'medium' }}>{row.district}</TableCell>
                          <TableCell align="right" sx={{ color: 'text.secondary' }}>₹{row.avg_monthly_revenue_6m.toLocaleString()}</TableCell>
                          <TableCell align="right">{row.forecast_liters.toLocaleString()} L</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 'bold', color: 'primary.main' }}>₹{row.forecast_revenue.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                      {(districtData?.rows?.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={5} align="center" sx={{ py: 3 }}>No data available to forecast for this period.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          )}
        </CustomTabPanel>

        {/* =============== VILLAGE FORECAST =============== */}
        <CustomTabPanel value={tabIndex} index={2}>
          {villageLoading ? <CircularProgress /> : villageError ? <Alert severity="error">Failed to load village data</Alert> : (
            <Card elevation={0}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                  <Stack direction="row" spacing={1}>
                    <Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => handleExportCSV(villageData?.rows || [], "village_forecast")}>CSV</Button>
                    <Button variant="outlined" startIcon={<PictureAsPdfIcon />} onClick={() => handleExportPDF(villageData?.rows || [], "village_forecast")}>PDF</Button>
                  </Stack>
                </Box>
                <TableContainer component={Paper} variant="outlined">
                  <Table>
                    <TableHead sx={{ bgcolor: 'action.hover' }}>
                      <TableRow>
                        <TableCell>Rank</TableCell>
                        <TableCell>Village</TableCell>
                        <TableCell>District</TableCell>
                        <TableCell align="right">6-Month Avg</TableCell>
                        <TableCell align="right">Est. Volume</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>Est. Revenue</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(villageData?.rows || []).map((row: any) => (
                        <TableRow key={`${row.village}-${row.district}`}>
                          <TableCell>{row.rank}</TableCell>
                          <TableCell>{row.village}</TableCell>
                          <TableCell>{row.district}</TableCell>
                          <TableCell align="right" sx={{ color: 'text.secondary' }}>₹{row.avg_monthly_revenue_6m.toLocaleString()}</TableCell>
                          <TableCell align="right">{row.forecast_liters.toLocaleString()} L</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 'bold' }}>₹{row.forecast_revenue.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                      {(villageData?.rows?.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={6} align="center" sx={{ py: 3 }}>No data available to forecast for this period.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          )}
        </CustomTabPanel>
      </Paper>
    </Box>
  );
}
