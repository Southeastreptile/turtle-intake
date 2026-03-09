import React, { useState, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import CircularProgress from '@mui/material/CircularProgress';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Paper from '@mui/material/Paper';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import { searchTaxa } from '../../services/api';

const REASONS = ['Injured', 'Orphaned', 'Displaced', 'Sick', 'Other'];
const DISPOSITIONS = ['Pending', 'Released', 'Transferred', 'Euthanized', 'Died in Care', 'DOA'];

// Normalize null/undefined to empty strings for controlled inputs
function normalize(data) {
  const d = data || {};
  return {
    common_name: d.common_name ?? '',
    admitted_at: d.admitted_at ?? '',
    name: d.name ?? '',
    reference_number: d.reference_number ?? '',
    rescuer_first_name: d.rescuer_first_name ?? '',
    rescuer_last_name: d.rescuer_last_name ?? '',
    rescuer_phone: d.rescuer_phone ?? '',
    rescuer_address: d.rescuer_address ?? '',
    rescuer_city: d.rescuer_city ?? '',
    rescuer_postal_code: d.rescuer_postal_code ?? '',
    found_at: d.found_at ?? '',
    address_found: d.address_found ?? '',
    city_found: d.city_found ?? '',
    reasons_for_admission: d.reasons_for_admission ?? '',
    notes_about_rescue: d.notes_about_rescue ?? '',
    care_by_rescuer: d.care_by_rescuer ?? '',
    disposition: d.disposition ?? 'Pending',
  };
}

function SectionLabel({ children }) {
  return (
    <Box sx={{ mt: 4, mb: 2 }}>
      <Typography
        variant="overline"
        sx={{
          color: 'secondary.dark',
          fontWeight: 700,
          letterSpacing: '0.12em',
          fontSize: '0.7rem',
        }}
      >
        {children}
      </Typography>
      <Divider sx={{ mt: 0.75, borderColor: '#DDD5C0' }} />
    </Box>
  );
}

export default function ReviewForm({ initialData, warnings = [], taxaCandidates = [], onSaveRequest, onBack }) {
  const [formData, setFormData] = useState(() => normalize(initialData));
  const [snackOpen, setSnackOpen] = useState(false);
  const [snackMsg, setSnackMsg] = useState('');

  // WRMD taxa Autocomplete state
  const [taxaOptions, setTaxaOptions] = useState(() => (taxaCandidates || []).map((c) => c.label));
  const [taxaLoading, setTaxaLoading] = useState(false);
  const debounceRef = useRef(null);

  const handleChange = (field) => (e) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleDateChange = (field) => (value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value && value.isValid() ? value.format('YYYY-MM-DD') : '',
    }));
  };

  const handleSave = () => {
    if (!formData.common_name.trim()) {
      setSnackMsg('Species / Common Name is required.');
      setSnackOpen(true);
      return;
    }
    if (!formData.admitted_at.trim()) {
      setSnackMsg('Intake Date is required.');
      setSnackOpen(true);
      return;
    }
    onSaveRequest(formData);
  };

  return (
    <Box sx={{ px: { xs: 2, sm: 0 }, pb: 6 }}>
      {/* Header */}
      <Typography variant="h6" gutterBottom sx={{ color: 'primary.dark', mb: 0.5 }}>
        Review Extracted Data
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3, lineHeight: 1.7 }}>
        Please review the information below and correct any errors before saving.
        Fields marked{' '}
        <Box component="span" sx={{ color: 'error.main', fontWeight: 700 }}>
          *
        </Box>{' '}
        are required.
      </Typography>

      {warnings.length > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <AlertTitle sx={{ fontWeight: 700 }}>Some fields need your attention</AlertTitle>
          <Box component="ul" sx={{ m: 0, pl: 2 }}>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </Box>
        </Alert>
      )}

      <Paper
        variant="outlined"
        sx={{
          borderColor: '#DDD5C0',
          borderRadius: 3,
          bgcolor: '#FDFAF4',
          p: { xs: 2, sm: 3 },
        }}
      >
        {/* ── Patient ─────────────────────────────────────────────────── */}
        <SectionLabel>Patient</SectionLabel>
        <Grid container spacing={2}>
          <Grid size={12}>
            <Autocomplete
              freeSolo
              fullWidth
              options={taxaOptions}
              value={formData.common_name}
              inputValue={formData.common_name}
              filterOptions={(x) => x}
              loading={taxaLoading}
              onChange={(_, newValue) => {
                const v = typeof newValue === 'string' ? newValue : '';
                setFormData((prev) => ({ ...prev, common_name: v }));
              }}
              onInputChange={(_, newInputValue, reason) => {
                // Always keep formData in sync with what the user types / selects
                setFormData((prev) => ({ ...prev, common_name: newInputValue }));

                if (reason === 'input') {
                  clearTimeout(debounceRef.current);
                  if (newInputValue.trim().length >= 2) {
                    debounceRef.current = setTimeout(async () => {
                      setTaxaLoading(true);
                      try {
                        const results = await searchTaxa(newInputValue.trim());
                        setTaxaOptions(results.map((r) => r.label));
                      } catch {
                        // ignore — WRMD outage should not block the volunteer
                      } finally {
                        setTaxaLoading(false);
                      }
                    }, 350);
                  }
                }
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  fullWidth
                  label="Species / Common Name *"
                  required
                  placeholder="e.g. Eastern Box Turtle"
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {taxaLoading && <CircularProgress size={16} color="inherit" sx={{ mr: 1 }} />}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />
          </Grid>
          <Grid size={12}>
            <DatePicker
              label="Intake Date *"
              value={formData.admitted_at ? dayjs(formData.admitted_at) : null}
              onChange={handleDateChange('admitted_at')}
              slotProps={{ textField: { fullWidth: true, required: true } }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 8 }}>
            <TextField
              label="Patient Name"
              value={formData.name}
              onChange={handleChange('name')}
              fullWidth
              placeholder="e.g. Shelly"
              helperText="Optional name or identifier for this patient"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              label="Reference #"
              value={formData.reference_number}
              onChange={handleChange('reference_number')}
              fullWidth
              placeholder="e.g. 2025-001"
            />
          </Grid>
          <Grid item xs={12}>
            <FormControl fullWidth>
              <InputLabel>Disposition</InputLabel>
              <Select
                value={formData.disposition}
                onChange={handleChange('disposition')}
                label="Disposition"
              >
                {DISPOSITIONS.map((d) => (
                  <MenuItem key={d} value={d}>{d}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>

        {/* ── Rescuer ──────────────────────────────────────────────────── */}
        <SectionLabel>Rescuer</SectionLabel>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="First Name"
              value={formData.rescuer_first_name}
              onChange={handleChange('rescuer_first_name')}
              fullWidth
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Last Name"
              value={formData.rescuer_last_name}
              onChange={handleChange('rescuer_last_name')}
              fullWidth
            />
          </Grid>
          <Grid size={12}>
            <TextField
              label="Phone"
              value={formData.rescuer_phone}
              onChange={handleChange('rescuer_phone')}
              fullWidth
              inputProps={{ inputMode: 'tel' }}
            />
          </Grid>
          <Grid size={12}>
            <TextField
              label="Street Address"
              value={formData.rescuer_address}
              onChange={handleChange('rescuer_address')}
              fullWidth
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 8 }}>
            <TextField
              label="City"
              value={formData.rescuer_city}
              onChange={handleChange('rescuer_city')}
              fullWidth
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              label="ZIP Code"
              value={formData.rescuer_postal_code}
              onChange={handleChange('rescuer_postal_code')}
              fullWidth
              inputProps={{ inputMode: 'numeric' }}
            />
          </Grid>
        </Grid>

        {/* ── Location Found ────────────────────────────────────────────── */}
        <SectionLabel>Location Found (if different)</SectionLabel>
        <Grid container spacing={2}>
          <Grid size={12}>
            <DatePicker
              label="Date Found"
              value={formData.found_at ? dayjs(formData.found_at) : null}
              onChange={handleDateChange('found_at')}
              slotProps={{ textField: { fullWidth: true } }}
            />
          </Grid>
          <Grid size={12}>
            <TextField
              label="Street Address Found"
              value={formData.address_found}
              onChange={handleChange('address_found')}
              fullWidth
            />
          </Grid>
          <Grid size={12}>
            <TextField
              label="City Found"
              value={formData.city_found}
              onChange={handleChange('city_found')}
              fullWidth
            />
          </Grid>
        </Grid>

        {/* ── Intake Details ────────────────────────────────────────────── */}
        <SectionLabel>Intake Details</SectionLabel>
        <Grid container spacing={2}>
          <Grid size={12}>
            <FormControl fullWidth>
              <InputLabel>Reason for Admission</InputLabel>
              <Select
                value={formData.reasons_for_admission}
                onChange={handleChange('reasons_for_admission')}
                label="Reason for Admission"
              >
                <MenuItem value="">
                  <em>Select a reason</em>
                </MenuItem>
                {REASONS.map((r) => (
                  <MenuItem key={r} value={r}>
                    {r}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={12}>
            <TextField
              label="Details about Rescue"
              value={formData.notes_about_rescue}
              onChange={handleChange('notes_about_rescue')}
              fullWidth
              multiline
              rows={3}
              placeholder="Describe how and where the animal was found…"
            />
          </Grid>
          <Grid size={12}>
            <TextField
              label="Care Given by Rescuer"
              value={formData.care_by_rescuer}
              onChange={handleChange('care_by_rescuer')}
              fullWidth
              multiline
              rows={3}
              placeholder="Food, water, medications, treatments provided…"
            />
          </Grid>
        </Grid>
      </Paper>

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
        <Button
          variant="outlined"
          color="primary"
          size="large"
          onClick={onBack}
          sx={{ py: 1.5, minWidth: 160 }}
        >
          Upload New Photo
        </Button>
        <Button
          variant="contained"
          color="primary"
          fullWidth
          size="large"
          onClick={handleSave}
          sx={{ py: 1.5, fontSize: '1rem' }}
        >
          Save Record
        </Button>
      </Box>

      {/* ── Validation snackbar ──────────────────────────────────────────── */}
      <Snackbar
        open={snackOpen}
        autoHideDuration={4000}
        onClose={() => setSnackOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setSnackOpen(false)}>
          {snackMsg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
