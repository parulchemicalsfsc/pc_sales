import { useState, useRef, useCallback } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import {
    Box,
    Typography,
    Paper,
    Button,
    Alert,
    CircularProgress,
    Chip,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    useTheme,
    alpha,
    Tooltip,
    IconButton,
} from '@mui/material';
import {
    CloudUpload as UploadIcon,
    PlayArrow as RunIcon,
    ExpandMore as ExpandMoreIcon,
    Science as ScienceIcon,
    Info as InfoIcon,
    Download as DownloadIcon,
} from '@mui/icons-material';
import apiClient from '../services/api';

// ── Types ────────────────────────────────────────────────
interface AlgorithmRow {
    [key: string]: string | number;
}

interface AlgorithmStats {
    urgent: number;
    high: number;
    medium: number;
    low: number;
    total_scored: number;
    total_raw: number;
    dropped: number;
    current_month: string;
}

interface AlgorithmResult {
    rows: AlgorithmRow[];
    stats: AlgorithmStats;
}

// ── Column Definitions ──────────────────────────────────
const ORIGINAL_COLUMNS = [
    { key: 'SR_NO', label: 'Sr No', width: 60 },
    { key: 'MANTRI_NAME', label: 'Mantri Name', width: 160 },
    { key: 'VILLAGE', label: 'Village', width: 130 },
    { key: 'TALUKA', label: 'Taluka', width: 110 },
    { key: 'DISTRICT', label: 'District', width: 110 },
    { key: 'STATE', label: 'State', width: 90 },
    { key: 'DAIRY_TYPE', label: 'Dairy Type', width: 100 },
    { key: 'SABHASAD_COUNT', label: 'Sabhasad Count', width: 100 },
    { key: 'NATURE_SABHASAD', label: 'Sabhasad Nature', width: 120 },
    { key: 'SUPPORT', label: 'Support', width: 90 },
    { key: 'DELIVERY_PERIOD', label: 'Delivery Period', width: 130 },
    { key: 'DEMO_DAYS', label: 'Demo Days', width: 80 },
    { key: 'DISPATCH_DAYS', label: 'Dispatch Days', width: 100 },
    { key: 'DECISION_MAKER', label: 'Decision Maker', width: 120 },
    { key: 'HIGH_LOW_HOLDER', label: 'Holder Type', width: 100 },
    { key: 'CURRENT_BUSINESS', label: 'Business', width: 90 },
    { key: 'DATE', label: 'Date', width: 100 },
    { key: 'MILK_MORNING', label: 'Milk AM', width: 80 },
    { key: 'MILK_EVENING', label: 'Milk PM', width: 80 },
];

const SCORE_COLUMNS = [
    { key: 'SCORE_SEASON', label: 'Season (/22)', width: 90 },
    { key: 'SCORE_PAYMENT', label: 'Payment (/22)', width: 95 },
    { key: 'SCORE_HOLDER', label: 'Holder (/20)', width: 90 },
    { key: 'SCORE_BUSINESS', label: 'Business (/12)', width: 95 },
    { key: 'SCORE_SABHASAD', label: 'Sabhasad (/12)', width: 100 },
    { key: 'SCORE_SUPPORT', label: 'Support (/12)', width: 95 },
];

const STICKY_COLUMNS = [
    { key: 'PRIORITY_RANK', label: 'Rank', width: 60 },
    { key: 'PRIORITY_LABEL', label: 'Priority', width: 100 },
    { key: 'TOTAL_SCORE', label: 'Score (/100)', width: 100 },
];

// ── Priority Colors ─────────────────────────────────────
const getPriorityColor = (label: string) => {
    const l = label.toUpperCase();
    if (l.includes('URGENT')) return { bg: '#FFD7D7', fg: '#C00000', emoji: '🔴' };
    if (l.includes('HIGH')) return { bg: '#FFE7CC', fg: '#E26B0A', emoji: '🟠' };
    if (l.includes('MEDIUM')) return { bg: '#FFFACC', fg: '#BF8F00', emoji: '🟡' };
    return { bg: '#E2EFDA', fg: '#375623', emoji: '🟢' };
};

// ── Score Logic Data ────────────────────────────────────
const SCORE_LOGIC = [
    { feature: 'Season Delivery', weight: '22 pts', logic: 'Checks if current month falls inside the delivery season window', range: 'In season (center)=22 | Edge=16 | 1mo away=8.8 | 2mo=4.4 | 3+mo=2' },
    { feature: 'Payment (Dispatch)', weight: '22 pts', logic: 'Dispatch=2× weight, Demo=1×. Score=(2×D + 1×Demo)/3', range: '0–10d=22 | 11–20d=18 | 21–30d=13 | 31–45d=7 | >45d=2' },
    { feature: 'Village Holder', weight: '20 pts', logic: 'Higher holder = larger network = better reach', range: 'HIGH=20 | MEDIUM=10 | LOW=5' },
    { feature: 'Business Status', weight: '12 pts', logic: 'Active business = immediate revenue potential', range: 'Yes=12 | Mid=7 | No=0' },
    { feature: 'Sabhasad Awareness', weight: '12 pts', logic: 'Awareness level among members', range: 'AWARE=12 | NOT AWARE=0' },
    { feature: 'Mantri Support', weight: '12 pts', logic: 'Cooperation level from mantri', range: 'HIGH=12 | MEDIUM=7 | LOW=2' },
];


export default function Algorithm() {
    const { t } = useTranslation();
    const theme = useTheme();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<AlgorithmResult | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setError(null);
        }
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile && (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.xls'))) {
            setFile(droppedFile);
            setError(null);
        } else {
            setError(t('algorithm.onlyExcelSupported', 'Only .xlsx and .xls files are supported'));
        }
    }, []);

    const runAlgorithm = async (useSample: boolean = false) => {
        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const formData = new FormData();
            if (useSample) {
                // Send POST with query param
            } else if (file) {
                formData.append('file', file);
            } else {
                setError(t('algorithm.selectExcelOrSample', 'Please select an Excel file or use sample data'));
                setLoading(false);
                return;
            }

            const url = useSample
                ? '/api/algorithm/run?use_sample=true'
                : '/api/algorithm/run';

            const response = await apiClient.post(url, useSample ? undefined : formData, {
                headers: useSample ? {} : { 'Content-Type': 'multipart/form-data' },
                timeout: 60000,
            });

            setResult(response.data);
        } catch (err: any) {
            const msg = err?.response?.data?.detail || err?.message || t('algorithm.failed', 'Algorithm failed');
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    // ── Sticky column total width ──
    const stickyTotalWidth = STICKY_COLUMNS.reduce((s, c) => s + c.width, 0);

    return (
        <Box>
            {/* ── Header ── */}
            <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                    <ScienceIcon sx={{ fontSize: 32, color: 'primary.main' }} />
                    <Typography variant="h4" sx={{ fontWeight: 700 }}>
                        {t('algorithm.title', 'Mantri Priority Algorithm')}
                    </Typography>
                    <Chip label="v3" size="small" color="primary" />
                </Box>
            </Box>

            {/* ── Upload & Run ── */}
            <Paper
                sx={{
                    p: 3,
                    mb: 3,
                    borderRadius: 3,
                    border: `2px dashed ${alpha(theme.palette.primary.main, 0.3)}`,
                    bgcolor: alpha(theme.palette.primary.main, 0.02),
                }}
            >
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, alignItems: 'center' }}>
                    {/* Drop Zone */}
                    <Box
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        sx={{
                            flex: 1,
                            p: 3,
                            borderRadius: 2,
                            border: `2px dashed ${file ? theme.palette.success.main : alpha(theme.palette.text.secondary, 0.3)}`,
                            bgcolor: file ? alpha(theme.palette.success.main, 0.05) : 'transparent',
                            textAlign: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            '&:hover': {
                                borderColor: theme.palette.primary.main,
                                bgcolor: alpha(theme.palette.primary.main, 0.05),
                            },
                        }}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={handleFileChange}
                            style={{ display: 'none' }}
                        />
                        <UploadIcon sx={{ fontSize: 40, color: file ? 'success.main' : 'text.secondary', mb: 1 }} />
                        <Typography variant="body1" sx={{ fontWeight: 600 }}>
                            {file ? file.name : t('algorithm.dropExcelHere', 'Drop Excel file here or click to browse')}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {t('algorithm.supportsExcel', 'Supports .xlsx and .xls files')}
                        </Typography>
                    </Box>

                    {/* Action Buttons */}
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 200 }}>
                        <Button
                            variant="contained"
                            size="large"
                            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <RunIcon />}
                            onClick={() => runAlgorithm(false)}
                            disabled={loading || !file}
                            sx={{
                                py: 1.5,
                                borderRadius: 2,
                                fontWeight: 600,
                                textTransform: 'none',
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                '&:hover': { background: 'linear-gradient(135deg, #5568d3 0%, #6941a0 100%)' },
                            }}
                        >
                            {loading ? t('algorithm.processing', 'Processing...') : t('algorithm.runAlgorithm', 'Run Algorithm')}
                        </Button>
                        <Button
                            variant="outlined"
                            startIcon={<ScienceIcon />}
                            onClick={() => runAlgorithm(true)}
                            disabled={loading}
                            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
                        >
                            {t('algorithm.trySampleData', 'Try with Sample Data')}
                        </Button>
                    </Box>
                </Box>
            </Paper>

            {/* ── Error ── */}
            {error && (
                <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}

            {/* ── Stats Cards ── */}
            {result && (
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
                    {[
                        { label: 'urgent', count: result.stats.urgent, color: '#C00000', bg: '#FFD7D7', emoji: '🔴' },
                        { label: 'high', count: result.stats.high, color: '#E26B0A', bg: '#FFE7CC', emoji: '🟠' },
                        { label: 'medium', count: result.stats.medium, color: '#BF8F00', bg: '#FFFACC', emoji: '🟡' },
                        { label: 'low', count: result.stats.low, color: '#375623', bg: '#E2EFDA', emoji: '🟢' },
                    ].map((s) => (
                        <Paper
                            key={s.label}
                            sx={{
                                p: 2.5,
                                borderRadius: 3,
                                textAlign: 'center',
                                border: `2px solid ${alpha(s.color, 0.3)}`,
                                bgcolor: alpha(s.color, 0.04),
                            }}
                        >
                            <Typography variant="h3" sx={{ fontWeight: 800, color: s.color }}>
                                {s.emoji} {s.count}
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: s.color, mt: 0.5 }}>
                                {t(`algorithm.${s.label}`)}
                            </Typography>
                        </Paper>
                    ))}
                </Box>
            )}

            {/* ── Summary Bar ── */}
            {result && (
                <Paper sx={{ p: 2, mb: 3, borderRadius: 2, display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Chip label={t('algorithm.monthLabel', 'Month: {month}').replace('{month}', result.stats.current_month)} color="primary" variant="outlined" />
                    <Chip label={t('algorithm.totalRowsLabel', 'Total Rows: {count}').replace('{count}', String(result.stats.total_raw))} variant="outlined" />
                    <Chip label={t('algorithm.scoredLabel', 'Scored: {count}').replace('{count}', String(result.stats.total_scored))} color="success" variant="outlined" />
                    <Chip label={t('algorithm.droppedLabel', 'Dropped: {count}').replace('{count}', String(result.stats.dropped))} color="warning" variant="outlined" />
                    <Tooltip title={t('algorithm.rowsDroppedTooltip', 'Rows with missing scoring fields are automatically dropped')}>
                        <IconButton size="small"><InfoIcon fontSize="small" /></IconButton>
                    </Tooltip>
                </Paper>
            )}

            {/* ── Results Table ── */}
            {result && result.rows.length > 0 && (
                <Paper sx={{ borderRadius: 3, overflow: 'hidden', mb: 3 }}>
                    <TableContainer sx={{ maxHeight: 600, overflow: 'auto' }}>
                        <Table stickyHeader size="small" sx={{ minWidth: 2200 }}>
                            <TableHead>
                                <TableRow>
                                    {ORIGINAL_COLUMNS.map((col) => {
                                        const keyMap: { [key: string]: string } = {
                                            SR_NO: 'colSrNo',
                                            MANTRI_NAME: 'colMantriName',
                                            VILLAGE: 'colVillage',
                                            TALUKA: 'colTaluka',
                                            DISTRICT: 'colDistrict',
                                            STATE: 'colState',
                                            DAIRY_TYPE: 'colDairyType',
                                            SABHASAD_COUNT: 'colSabhasadCount',
                                            NATURE_SABHASAD: 'colSabhasadNature',
                                            SUPPORT: 'colSupport',
                                            DELIVERY_PERIOD: 'colDeliveryPeriod',
                                            DEMO_DAYS: 'colDemoDays',
                                            DISPATCH_DAYS: 'colDispatchDays',
                                            DECISION_MAKER: 'colDecisionMaker',
                                            HIGH_LOW_HOLDER: 'colHolderType',
                                            CURRENT_BUSINESS: 'colBusiness',
                                            DATE: 'colDate',
                                            MILK_MORNING: 'colMilkAm',
                                            MILK_EVENING: 'colMilkPm'
                                        };
                                        const translationKey = keyMap[col.key];
                                        const localizedLabel = translationKey ? t(`algorithm.${translationKey}`) : col.label;
                                        return (
                                            <TableCell
                                                key={col.key}
                                                sx={{
                                                    fontWeight: 700,
                                                    fontSize: '0.75rem',
                                                    minWidth: col.width,
                                                    bgcolor: theme.palette.mode === 'dark' ? '#1a237e' : '#2C4770',
                                                    color: '#fff',
                                                    whiteSpace: 'nowrap',
                                                    borderRight: `1px solid ${alpha('#fff', 0.1)}`,
                                                }}
                                            >
                                                {localizedLabel}
                                            </TableCell>
                                        );
                                    })}
                                    {SCORE_COLUMNS.map((col) => {
                                        const keyMap: { [key: string]: string } = {
                                            SCORE_SEASON: 'seasonWeight',
                                            SCORE_PAYMENT: 'paymentWeight',
                                            SCORE_HOLDER: 'holderWeight',
                                            SCORE_BUSINESS: 'businessWeight',
                                            SCORE_SABHASAD: 'sabhasadWeight',
                                            SCORE_SUPPORT: 'supportWeight'
                                        };
                                        const translationKey = keyMap[col.key];
                                        const localizedLabel = translationKey ? t(`algorithm.${translationKey}`) : col.label;
                                        return (
                                            <TableCell
                                                key={col.key}
                                                sx={{
                                                    fontWeight: 700,
                                                    fontSize: '0.75rem',
                                                    minWidth: col.width,
                                                    bgcolor: theme.palette.mode === 'dark' ? '#283593' : '#D6E4FF',
                                                    color: theme.palette.mode === 'dark' ? '#fff' : '#1F3864',
                                                    whiteSpace: 'nowrap',
                                                    borderRight: `1px solid ${alpha('#000', 0.1)}`,
                                                    textAlign: 'center',
                                                }}
                                            >
                                                {localizedLabel}
                                            </TableCell>
                                        );
                                    })}
                                    {/* Sticky score header cells */}
                                    {STICKY_COLUMNS.map((col, idx) => {
                                        const rightOffset = STICKY_COLUMNS.slice(idx + 1).reduce((s, c) => s + c.width, 0);
                                        const keyMap: { [key: string]: string } = {
                                            PRIORITY_RANK: 'stickyRank',
                                            PRIORITY_LABEL: 'stickyPriority',
                                            TOTAL_SCORE: 'stickyScore'
                                        };
                                        const translationKey = keyMap[col.key];
                                        const localizedLabel = translationKey ? t(`algorithm.${translationKey}`) : col.label;
                                        return (
                                            <TableCell
                                                key={col.key}
                                                sx={{
                                                    fontWeight: 800,
                                                    fontSize: '0.75rem',
                                                    minWidth: col.width,
                                                    width: col.width,
                                                    bgcolor: theme.palette.mode === 'dark' ? '#b71c1c' : '#764ba2',
                                                    color: '#fff',
                                                    whiteSpace: 'nowrap',
                                                    textAlign: 'center',
                                                    position: 'sticky',
                                                    right: rightOffset,
                                                    zIndex: 12,
                                                    borderLeft: idx === 0 ? `3px solid ${theme.palette.primary.main}` : 'none',
                                                    boxShadow: idx === 0 ? '-4px 0 12px rgba(0,0,0,0.08)' : 'none',
                                                }}
                                            >
                                                {localizedLabel}
                                            </TableCell>
                                        );
                                    })}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {result.rows.map((row, i) => {
                                    const priority = getPriorityColor(String(row.PRIORITY_LABEL || ''));
                                    const isAlt = i % 2 === 0;
                                    const rowBg = isAlt
                                        ? (theme.palette.mode === 'dark' ? '#1e1e2e' : '#F8FAFF')
                                        : (theme.palette.mode === 'dark' ? '#121212' : '#ffffff');
                                    return (
                                        <TableRow key={i} hover sx={{ bgcolor: rowBg }}>
                                            {ORIGINAL_COLUMNS.map((col) => (
                                                <TableCell
                                                    key={col.key}
                                                    sx={{
                                                        fontSize: '0.8rem',
                                                        whiteSpace: 'nowrap',
                                                        borderRight: `1px solid ${alpha('#000', 0.05)}`,
                                                    }}
                                                >
                                                    {row[col.key] ?? ''}
                                                </TableCell>
                                            ))}
                                            {SCORE_COLUMNS.map((col) => (
                                                <TableCell
                                                    key={col.key}
                                                    sx={{
                                                        fontSize: '0.8rem',
                                                        textAlign: 'center',
                                                        fontWeight: 500,
                                                        borderRight: `1px solid ${alpha('#000', 0.05)}`,
                                                    }}
                                                >
                                                    {row[col.key] ?? ''}
                                                </TableCell>
                                            ))}
                                            {/* Sticky score data cells */}
                                            {STICKY_COLUMNS.map((col, idx) => {
                                                const rightOffset = STICKY_COLUMNS.slice(idx + 1).reduce((s, c) => s + c.width, 0);
                                                const isRank = col.key === 'PRIORITY_RANK';
                                                const isLabel = col.key === 'PRIORITY_LABEL';
                                                const isScore = col.key === 'TOTAL_SCORE';
                                                return (
                                                    <TableCell
                                                        key={col.key}
                                                        sx={{
                                                            position: 'sticky',
                                                            right: rightOffset,
                                                            zIndex: 5,
                                                            backgroundColor: rowBg + ' !important',
                                                            textAlign: 'center',
                                                            fontWeight: isRank || isScore ? 800 : 400,
                                                            fontSize: isScore ? '1rem' : '0.85rem',
                                                            color: isScore ? priority.fg : 'inherit',
                                                            borderLeft: idx === 0 ? `3px solid ${theme.palette.primary.main}` : 'none',
                                                            boxShadow: idx === 0 ? '-4px 0 12px rgba(0,0,0,0.08)' : 'none',
                                                            p: isLabel ? 0.5 : undefined,
                                                        }}
                                                    >
                                                        {isLabel ? (
                                                            <Chip
                                                                label={`${priority.emoji} ${t(`algorithm.${String(row.PRIORITY_LABEL || '').toLowerCase()}`, String(row.PRIORITY_LABEL || ''))}`}
                                                                size="small"
                                                                sx={{
                                                                    bgcolor: priority.bg,
                                                                    color: priority.fg,
                                                                    fontWeight: 700,
                                                                    fontSize: '0.7rem',
                                                                    height: 24,
                                                                }}
                                                            />
                                                        ) : (
                                                            row[col.key] ?? ''
                                                        )}
                                                    </TableCell>
                                                );
                                            })}
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            )}

            {/* ── Score Logic Accordion ── */}
            <Accordion sx={{ borderRadius: '12px !important', mb: 3, '&:before': { display: 'none' } }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <InfoIcon color="primary" />
                        <Typography sx={{ fontWeight: 600 }}>{t('algorithm.scoringLogicTitle', 'Scoring Logic & Weights (Total: 100 pts)')}</Typography>
                    </Box>
                </AccordionSummary>
                <AccordionDetails>
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 700 }}>{t('algorithm.feature', 'Feature')}</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>{t('algorithm.weight', 'Weight')}</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>{t('algorithm.logic', 'Logic')}</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>{t('algorithm.rangeValues', 'Range / Values')}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {SCORE_LOGIC.map((s, i) => {
                                    const logicMap: {
                                        [key: string]: {
                                            feature: string;
                                            logic: string;
                                            range: string;
                                        };
                                    } = {
                                        'Season Delivery': {
                                            feature: 'logicSeasonDeliveryFeature',
                                            logic: 'logicSeasonDeliveryDesc',
                                            range: 'logicSeasonDeliveryRange',
                                        },
                                        'Payment (Dispatch)': {
                                            feature: 'logicPaymentFeature',
                                            logic: 'logicPaymentDesc',
                                            range: 'logicPaymentRange',
                                        },
                                        'Village Holder': {
                                            feature: 'logicHolderFeature',
                                            logic: 'logicHolderDesc',
                                            range: 'logicHolderRange',
                                        },
                                        'Business Status': {
                                            feature: 'logicBusinessFeature',
                                            logic: 'logicBusinessDesc',
                                            range: 'logicBusinessRange',
                                        },
                                        'Sabhasad Awareness': {
                                            feature: 'logicSabhasadFeature',
                                            logic: 'logicSabhasadDesc',
                                            range: 'logicSabhasadRange',
                                        },
                                        'Mantri Support': {
                                            feature: 'logicSupportFeature',
                                            logic: 'logicSupportDesc',
                                            range: 'logicSupportRange',
                                        },
                                    };

                                    const trans = logicMap[s.feature];
                                    const featureText = trans ? t(`algorithm.${trans.feature}`) : s.feature;
                                    const logicText = trans ? t(`algorithm.${trans.logic}`) : s.logic;
                                    const rangeText = trans ? t(`algorithm.${trans.range}`) : s.range;
                                    
                                    const ptsCount = s.weight.split(' ')[0];
                                    const weightText = t('algorithm.pts', '{count} pts').replace('{count}', ptsCount);

                                    return (
                                        <TableRow key={i} sx={{ bgcolor: i % 2 === 0 ? alpha(theme.palette.primary.main, 0.03) : 'transparent' }}>
                                            <TableCell sx={{ fontWeight: 600 }}>{featureText}</TableCell>
                                            <TableCell><Chip label={weightText} size="small" color="primary" variant="outlined" /></TableCell>
                                            <TableCell sx={{ fontSize: '0.85rem' }}>{logicText}</TableCell>
                                            <TableCell sx={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>{rangeText}</TableCell>
                                        </TableRow>
                                    );
                                })}
                                <TableRow sx={{ bgcolor: alpha(theme.palette.warning.main, 0.08) }}>
                                    <TableCell sx={{ fontWeight: 700 }}>{t('algorithm.rowRemoval', 'Row Removal')}</TableCell>
                                    <TableCell>—</TableCell>
                                    <TableCell colSpan={2} sx={{ fontSize: '0.85rem' }}>
                                        {t('algorithm.rowRemovalDesc', 'Any row with even ONE missing/null/blank scoring field is dropped before scoring. Fields checked: DELIVERY_PERIOD, DISPATCH_DAYS, HIGH_LOW_HOLDER, CURRENT_BUSINESS, NATURE_SABHASAD, SUPPORT')}
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </TableContainer>
                </AccordionDetails>
            </Accordion>
        </Box>
    );
}
