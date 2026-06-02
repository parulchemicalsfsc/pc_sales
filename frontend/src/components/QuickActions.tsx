import { useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import {
  SpeedDial,
  SpeedDialAction,
  SpeedDialIcon,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Tooltip,
} from '@mui/material';
import {
  PersonAdd as PersonAddIcon,
  ShoppingCart as ShoppingCartIcon,
  Science as ScienceIcon,
  Payment as PaymentIcon,
  Close as CloseIcon,
  Phone as PhoneIcon,

  Search as SearchIcon,
  AdminPanelSettings as AdminIcon,
  GetApp as DownloadIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PERMISSIONS } from '../config/permissions';
import { Alert, Snackbar } from '@mui/material';

interface QuickActionsProps {
  onQuickSearch?: (searchTerm: string) => void;
}

export default function QuickActions({ onQuickSearch }: QuickActionsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [open, setOpen] = useState(false);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [permissionAlertOpen, setPermissionAlertOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const allActions = [
    {
      icon: <SearchIcon />,
      name: t('quickActions.quickSearch', 'Quick Search'),
      onClick: () => {
        setSearchDialogOpen(true);
        setOpen(false);
      },
      color: '#3b82f6',
      show: true, // Always show
    },
    {
      icon: <PersonAddIcon />,
      name: t('quickActions.addCustomer', 'Add Customer'),
      onClick: () => {
        navigate('/customers');
        setOpen(false);
      },
      color: '#10b981',
      show: hasPermission(PERMISSIONS.CREATE_CUSTOMER),
    },
    {
      icon: <ShoppingCartIcon />,
      name: t('quickActions.newSale', 'New Sale'),
      onClick: () => {
        navigate('/sales');
        setOpen(false);
      },
      color: '#f59e0b',
      show: hasPermission(PERMISSIONS.CREATE_SALE),
    },
    {
      icon: <ScienceIcon />,
      name: t('quickActions.scheduleDemo', 'Schedule Demo'),
      onClick: () => {
        navigate('/demos');
        setOpen(false);
      },
      color: '#7c3aed',
      show: hasPermission(PERMISSIONS.SCHEDULE_DEMO),
    },
    {
      icon: <DownloadIcon />,
      name: t('quickActions.exportReports', 'Export Reports'),
      onClick: () => {
        // Example of "Block an action and show popup"
        if (!hasPermission(PERMISSIONS.VIEW_REPORTS)) {
          setPermissionAlertOpen(true);
          // Keep speed dial open or close it? Let's keep it open so they see the context, 
          // or close it and show the snackbar.
          setOpen(false);
          return;
        }
        navigate('/reports');
        setOpen(false);
      },
      color: '#607d8b',
      show: true, // Always show to demonstrate blocking
    },
  ];

  const actions = allActions.filter(action => action.show);

  const handleSearch = () => {
    if (searchTerm.trim()) {
      if (onQuickSearch) {
        onQuickSearch(searchTerm);
      }
      // You can also navigate to a search results page
      // navigate(`/search?q=${encodeURIComponent(searchTerm)}`);
    }
    setSearchDialogOpen(false);
    setSearchTerm('');
  };

  return (
    <>
      <SpeedDial
        ariaLabel={t('quickActions.quickActions', 'Quick actions')}
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          '& .MuiSpeedDial-fab': {
            width: 64,
            height: 64,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            '&:hover': {
              background: 'linear-gradient(135deg, #764ba2 0%, #667eea 100%)',
            },
          },
        }}
        icon={<SpeedDialIcon openIcon={<CloseIcon />} />}
        onClose={() => setOpen(false)}
        onOpen={() => setOpen(true)}
        open={open}
      >
        {actions.map((action) => (
          <SpeedDialAction
            key={action.name}
            icon={action.icon}
            tooltipTitle={action.name}
            onClick={action.onClick}
            sx={{
              '& .MuiSpeedDialAction-fab': {
                bgcolor: action.color,
                color: 'white',
                '&:hover': {
                  bgcolor: action.color,
                  opacity: 0.9,
                },
              },
            }}
          />
        ))}
      </SpeedDial>

      {/* Quick Search Dialog */}
      <Dialog
        open={searchDialogOpen}
        onClose={() => setSearchDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SearchIcon color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {t('quickActions.quickSearch', 'Quick Search')}
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <TextField
              fullWidth
              autoFocus
              label={t('quickActions.searchLabel', 'Search by name, mobile, or invoice')}
              placeholder={t('quickActions.searchPlaceholder', 'Enter customer name, mobile number, or invoice number...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSearch();
                }
              }}
              sx={{ mb: 2 }}
            />
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Tooltip title={t('quickActions.searchMobileTooltip', 'Search by mobile number')}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<PhoneIcon />}
                  onClick={() => {
                    // Pre-fill with mobile number format
                    setSearchTerm('+91 ');
                  }}
                >
                  {t('quickActions.mobileSearch', 'Mobile Search')}
                </Button>
              </Tooltip>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSearchDialogOpen(false)}>{t('quickActions.cancel', 'Cancel')}</Button>
          <Button variant="contained" onClick={handleSearch}>
            {t('quickActions.search', 'Search')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Permission Denied Snackbar */}
      <Snackbar
        open={permissionAlertOpen}
        autoHideDuration={6000}
        onClose={() => setPermissionAlertOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setPermissionAlertOpen(false)}
          severity="error"
          sx={{ width: '100%' }}
          variant="filled"
        >
          {t('quickActions.permissionDenied', 'Action not allowed: You do not have permission to perform this action.')}
        </Alert>
      </Snackbar>
    </>
  );
}
