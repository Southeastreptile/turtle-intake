import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import NatureIcon from '@mui/icons-material/Nature';
import logo from './assets/logo.png';
import UploadForm from './components/UploadForm';
import ReviewForm from './components/ReviewForm';
import ConfirmDialog from './components/ConfirmDialog';

// ── Step indicator ────────────────────────────────────────────────────────────
const STEPS = ['Upload Photo', 'Review Data', 'Confirm'];

function StepIndicator({ currentStep }) {
  const stepIndex = { upload: 0, review: 1, success: 2 }[currentStep] ?? 0;
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 0,
        mb: 4,
      }}
    >
      {STEPS.map((label, i) => {
        const done = i < stepIndex;
        const active = i === stepIndex;
        return (
          <React.Fragment key={label}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: done ? 'primary.light' : active ? 'primary.main' : '#EDE7D5',
                  color: done || active ? '#fff' : 'text.disabled',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  border: active ? '2px solid' : '2px solid transparent',
                  borderColor: active ? 'primary.dark' : 'transparent',
                  transition: 'all 0.25s ease',
                }}
              >
                {done ? '✓' : i + 1}
              </Box>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: active ? 700 : 500,
                  color: active ? 'primary.main' : done ? 'primary.light' : 'text.disabled',
                  fontSize: '0.65rem',
                  letterSpacing: '0.03em',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </Typography>
            </Box>
            {i < STEPS.length - 1 && (
              <Box
                sx={{
                  width: 40,
                  height: 2,
                  bgcolor: i < stepIndex ? 'primary.light' : '#DDD5C0',
                  mx: 0.5,
                  mb: 1.8,
                  borderRadius: 1,
                  transition: 'background-color 0.25s ease',
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </Box>
  );
}

// ── Success view ──────────────────────────────────────────────────────────────
function SuccessView({ onReset }) {
  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          py: 6,
          px: 2,
          gap: 2.5,
        }}
      >
        <Box
          sx={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            bgcolor: '#EEF3E8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CheckCircleOutlineIcon sx={{ fontSize: 44, color: 'primary.main' }} />
        </Box>
        <Typography variant="h5">
          Record Saved
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 360, lineHeight: 1.7 }}>
          Thank you for your contribution to protecting native wildlife. This intake has
          been recorded and will be entered into WRMD by staff.
        </Typography>
        <Box
          sx={{
            mt: 1,
            p: 2,
            bgcolor: '#EEF3E8',
            borderRadius: 3,
            border: '1px solid #C8D9B8',
            width: '100%',
            maxWidth: 360,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <NatureIcon sx={{ fontSize: 18, color: 'primary.main' }} />
            <Typography variant="subtitle2" color="primary.dark" fontWeight={700} fontSize="0.8rem">
              Every record matters
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" fontSize="0.8rem" lineHeight={1.6}>
            Your help directly supports the rehabilitation of native reptiles and
            amphibians across Virginia.
          </Typography>
        </Box>
        <Button
          variant="contained"
          color="primary"
          size="large"
          onClick={onReset}
          sx={{ mt: 1.5, minWidth: 220, py: 1.5 }}
        >
          Submit Another Record
        </Button>
      </Box>
    </Container>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [step, setStep] = useState('upload'); // 'upload' | 'review' | 'success'
  const [extractedData, setExtractedData] = useState(null);
  const [extractionWarnings, setExtractionWarnings] = useState([]);
  const [taxaCandidates, setTaxaCandidates] = useState([]);
  const [reviewedData, setReviewedData] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleExtracted = (data, warnings = [], candidates = []) => {
    setExtractedData(data);
    setExtractionWarnings(warnings);
    setTaxaCandidates(candidates);
    setStep('review');
  };

  const handleSaveRequest = (data) => {
    setReviewedData(data);
    setConfirmOpen(true);
  };

  const handleSaved = () => {
    setConfirmOpen(false);
    setStep('success');
  };

  const handleReset = () => {
    setExtractedData(null);
    setExtractionWarnings([]);
    setTaxaCandidates([]);
    setReviewedData(null);
    setConfirmOpen(false);
    setStep('upload');
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>

      {/* ── Hero Header ────────────────────────────────────────────────── */}
      <Box
        sx={{
          bgcolor: '#FDFAF4',
          borderBottom: '1px solid #DDD5C0',
          boxShadow: '0 1px 6px rgba(60,50,20,0.07)',
          py: { xs: 2.5, sm: 3 },
          px: 2,
        }}
      >
        <Container maxWidth="md">
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: { xs: 2, sm: 2.5 },
            }}
          >
            {/* Logo */}
            <Box
              component="img"
              src={logo}
              alt="SERC — Southeastern Reptile Conservation"
              sx={{
                height: { xs: 64, sm: 80 },
                width: { xs: 64, sm: 80 },
                borderRadius: '50%',
                objectFit: 'cover',
                flexShrink: 0,
                boxShadow: '0 2px 12px rgba(60,50,20,0.18)',
                border: '2px solid #DDD5C0',
              }}
            />
            {/* Title block */}
            <Box>
              <Typography
                variant="h5"
                fontWeight={800}
                sx={{
                  color: 'primary.dark',
                  fontSize: { xs: '1.15rem', sm: '1.35rem' },
                  lineHeight: 1.2,
                  letterSpacing: '-0.01em',
                }}
              >
                Wildlife Intake
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: 'text.secondary',
                  fontSize: { xs: '0.78rem', sm: '0.85rem' },
                  fontWeight: 500,
                  letterSpacing: '0.03em',
                  mt: 0.3,
                }}
              >
                SERC
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: 'secondary.main',
                  fontWeight: 600,
                  fontSize: '0.7rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                Protecting Native Species
              </Typography>
            </Box>
          </Box>
        </Container>
      </Box>

      {/* ── Main content ───────────────────────────────────────────────── */}
      <Container maxWidth="md">
        <Box sx={{ pt: 4, pb: 8, px: { xs: 0, sm: 0 } }}>

          {/* Step indicator — hide on success */}
          {step !== 'success' && <StepIndicator currentStep={step} />}

          {step === 'upload' && <UploadForm onExtracted={handleExtracted} />}
          {step === 'review' && (
            <ReviewForm
              initialData={extractedData}
              warnings={extractionWarnings}
              taxaCandidates={taxaCandidates}
              onSaveRequest={handleSaveRequest}
              onBack={handleReset}
            />
          )}
          {step === 'success' && <SuccessView onReset={handleReset} />}
        </Box>
      </Container>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <Box
        component="footer"
        sx={{
          borderTop: '1px solid #DDD5C0',
          py: 2,
          px: 2,
          textAlign: 'center',
          bgcolor: '#FDFAF4',
        }}
      >
        <Typography variant="caption" color="text.disabled">
          © SERC · Southeastern Reptile Conservation · Licensed Wildlife Rehabilitators · Virginia
        </Typography>
      </Box>

      {/* ── Confirm Dialog ─────────────────────────────────────────────── */}
      <ConfirmDialog
        open={confirmOpen}
        data={reviewedData}
        onConfirm={handleSaved}
        onCancel={() => setConfirmOpen(false)}
      />
    </Box>
  );
}
