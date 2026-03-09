import React, { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { saveIntakeRecord } from '../../services/api';

// Human-readable labels for each field
const FIELD_LABELS = {
  common_name: 'Species',
  admitted_at: 'Intake Date',
  disposition: 'Disposition',
  rescuer_first_name: 'First Name',
  rescuer_last_name: 'Last Name',
  rescuer_phone: 'Phone',
  rescuer_address: 'Address',
  rescuer_city: 'City',
  rescuer_postal_code: 'ZIP Code',
  found_at: 'Date Found',
  address_found: 'Address Found',
  city_found: 'City Found',
  reasons_for_admission: 'Reason for Admission',
  notes_about_rescue: 'Rescue Details',
  care_by_rescuer: 'Care Given',
};

const SECTIONS = [
  { title: 'Patient', fields: ['common_name', 'admitted_at', 'disposition'] },
  {
    title: 'Rescuer',
    fields: ['rescuer_first_name', 'rescuer_last_name', 'rescuer_phone',
             'rescuer_address', 'rescuer_city', 'rescuer_postal_code'],
  },
  { title: 'Location Found', fields: ['found_at', 'address_found', 'city_found'] },
  { title: 'Intake Details', fields: ['reasons_for_admission', 'notes_about_rescue', 'care_by_rescuer'] },
];

export default function ConfirmDialog({ open, data, onConfirm, onCancel }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleConfirm = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveIntakeRecord(data);
      onConfirm();
    } catch (err) {
      const message =
        err.response?.data?.detail ||
        err.message ||
        'An unexpected error occurred. Please try again.';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (saving) return;
    setError(null);
    onCancel();
  };

  if (!data) return null;

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: '#FDFAF4',
          backgroundImage: 'none',
          border: '1px solid #DDD5C0',
        },
      }}
    >
      {/* Title */}
      <DialogTitle sx={{ pb: 0.5, pt: 2.5, px: 3 }}>
        <Typography variant="h6" fontWeight={700} color="primary.dark">
          Confirm &amp; Save
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Please review the summary below before saving to the intake sheet.
        </Typography>
      </DialogTitle>

      {/* Summary list */}
      <DialogContent dividers sx={{ p: 0, borderColor: '#DDD5C0' }}>
        {SECTIONS.map((section, si) => {
          const visibleFields = section.fields.filter(
            (f) => data[f]?.trim?.() || data[f]
          );
          if (visibleFields.length === 0) return null;
          return (
            <Box key={section.title}>
              {si > 0 && <Divider sx={{ borderColor: '#EDE7D5' }} />}
              {/* Section overline */}
              <Box sx={{ px: 3, pt: 1.5, pb: 0.5 }}>
                <Typography
                  variant="overline"
                  sx={{
                    color: 'secondary.dark',
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    fontSize: '0.65rem',
                  }}
                >
                  {section.title}
                </Typography>
              </Box>
              <List dense disablePadding>
                {visibleFields.map((field) => (
                  <ListItem key={field} sx={{ px: 3, py: 0.5 }}>
                    <ListItemText
                      primary={
                        <Typography variant="caption" color="text.secondary">
                          {FIELD_LABELS[field]}
                        </Typography>
                      }
                      secondary={
                        <Typography
                          variant="body2"
                          color="text.primary"
                          fontWeight={500}
                          sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                        >
                          {data[field]}
                        </Typography>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          );
        })}
      </DialogContent>

      {/* Actions */}
      <DialogActions sx={{ flexDirection: 'column', gap: 1, p: 2.5, pt: 2 }}>
        {error && (
          <Alert severity="error" sx={{ width: '100%' }}>
            {error}
          </Alert>
        )}
        <Box sx={{ display: 'flex', gap: 1.5, width: '100%' }}>
          <Button
            variant="outlined"
            onClick={handleCancel}
            disabled={saving}
            fullWidth
            sx={{
              color: 'text.secondary',
              borderColor: '#C8BFA8',
              '&:hover': { borderColor: '#A89E85', bgcolor: 'rgba(0,0,0,0.03)' },
            }}
          >
            Go Back
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleConfirm}
            disabled={saving}
            fullWidth
          >
            {saving ? <CircularProgress size={20} color="inherit" /> : 'Save Record'}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
