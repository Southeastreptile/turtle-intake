import React, { useState, useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Paper from '@mui/material/Paper';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import InsertPhotoOutlinedIcon from '@mui/icons-material/InsertPhotoOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import CloseIcon from '@mui/icons-material/Close';
import IconButton from '@mui/material/IconButton';
import { extractIntakeData } from '../../services/api';

// Vision API hard limit is 20 MB inline; 15 MB gives comfortable headroom
// and keeps upload times reasonable on mobile connections.
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;  // 15 MB — hard block
const WARN_IMAGE_BYTES = 8 * 1024 * 1024;  // 8 MB — soft warning

export default function UploadForm({ onExtracted }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sizeWarning, setSizeWarning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  // Create / revoke object URL for preview
  useEffect(() => {
    if (!selectedFile) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  const handleFileChange = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (JPG, PNG, HEIC, etc.).');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(
        `This image is too large (${formatBytes(file.size)}). Maximum size is 15 MB. ` +
        'Please compress it or take a new photo at a lower resolution.'
      );
      setSizeWarning(false);
      return;
    }
    setError(null);
    setSizeWarning(file.size > WARN_IMAGE_BYTES);
    setSelectedFile(file);
  };

  const formatBytes = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileChange(e.dataTransfer.files[0]);
  };

  const handleExtract = async () => {
    if (!selectedFile) return;
    setLoading(true);
    setError(null);
    try {
      const { extracted, warnings, taxa_candidates } = await extractIntakeData(selectedFile);
      onExtracted(extracted, warnings, taxa_candidates || []);
    } catch (err) {
      const message =
        err.response?.data?.detail ||
        err.message ||
        'Could not connect to the server. Please check that the back-end is running and try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ px: { xs: 2, sm: 0 } }}>
      {/* Instruction text */}
      <Typography variant="h6" gutterBottom sx={{ color: 'primary.dark', mb: 0.5 }}>
        Upload Intake Sheet
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3, lineHeight: 1.7 }}>
        Take a photo of the paper intake form or choose an image from your device.
        Patient and rescuer information will be extracted automatically.
      </Typography>

      {/* ── Drop zone ─────────────────────────────────────────────────── */}
      {!selectedFile && (
        <Paper
          variant="outlined"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          sx={{
            border: '2px dashed',
            borderColor: isDragging ? 'primary.main' : '#C8BFA8',
            borderRadius: 3,
            bgcolor: isDragging ? 'rgba(74, 94, 53, 0.05)' : '#FDFAF4',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1.5,
            minHeight: 220,
            p: 4,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            '&:hover': {
              borderColor: 'primary.light',
              bgcolor: 'rgba(74, 94, 53, 0.03)',
            },
          }}
        >
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              bgcolor: '#EEF3E8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mb: 0.5,
            }}
          >
            <UploadFileOutlinedIcon sx={{ fontSize: 30, color: 'primary.main' }} />
          </Box>
          <Typography variant="body1" fontWeight={600} color="text.primary">
            Drag &amp; drop photo here
          </Typography>
          <Typography variant="body2" color="text.secondary">
            or
          </Typography>

          {/* Two action buttons */}
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Button
              component="label"
              variant="contained"
              color="primary"
              size="small"
              startIcon={<CameraAltIcon />}
              onClick={(e) => e.stopPropagation()}
              sx={{ borderRadius: 8 }}
            >
              Take Photo
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => handleFileChange(e.target.files[0])}
              />
            </Button>
            <Button
              component="label"
              variant="outlined"
              color="primary"
              size="small"
              startIcon={<InsertPhotoOutlinedIcon />}
              onClick={(e) => e.stopPropagation()}
              sx={{ borderRadius: 8 }}
            >
              Choose File
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => handleFileChange(e.target.files[0])}
              />
            </Button>
          </Box>

          <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5 }}>
            JPG, PNG, HEIC, PDF supported
          </Typography>
        </Paper>
      )}

      {/* ── Image preview card ─────────────────────────────────────────── */}
      {selectedFile && previewUrl && (
        <Paper
          variant="outlined"
          sx={{
            borderColor: '#C8D9B8',
            borderRadius: 3,
            bgcolor: '#FDFAF4',
            overflow: 'hidden',
          }}
        >
          {/* Preview image */}
          <Box
            sx={{
              position: 'relative',
              width: '100%',
              maxHeight: 320,
              overflow: 'hidden',
              bgcolor: '#F0EBE0',
            }}
          >
            <Box
              component="img"
              src={previewUrl}
              alt="Intake form preview"
              sx={{
                width: '100%',
                maxHeight: 320,
                objectFit: 'contain',
                display: 'block',
              }}
            />
            {/* Remove button */}
            <IconButton
              size="small"
              onClick={() => {
                setSelectedFile(null);
                setError(null);
                setSizeWarning(false);
                if (inputRef.current) inputRef.current.value = '';
              }}
              sx={{
                position: 'absolute',
                top: 8,
                right: 8,
                bgcolor: 'rgba(255,255,255,0.85)',
                backdropFilter: 'blur(4px)',
                border: '1px solid #DDD5C0',
                '&:hover': { bgcolor: '#fff' },
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          {/* File meta */}
          <Box
            sx={{
              px: 2,
              py: 1.5,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              borderTop: '1px solid #EDE7D5',
            }}
          >
            <InsertPhotoOutlinedIcon sx={{ fontSize: 18, color: 'primary.light' }} />
            <Typography
              variant="body2"
              fontWeight={600}
              noWrap
              sx={{ flex: 1, minWidth: 0, color: 'text.primary' }}
            >
              {selectedFile.name}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
              {formatBytes(selectedFile.size)}
            </Typography>
          </Box>
        </Paper>
      )}

      {/* ── Size warning (soft — file selected but large) ─────────────── */}
      {sizeWarning && !error && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          This image is large and may take a little longer to process. If extraction
          times out, try retaking the photo at a lower resolution.
        </Alert>
      )}

      {/* ── Error ─────────────────────────────────────────────────────── */}
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      {/* ── Extract button ────────────────────────────────────────────── */}
      <Button
        variant="contained"
        color="primary"
        fullWidth
        size="large"
        disabled={!selectedFile || loading}
        onClick={handleExtract}
        sx={{ mt: 3, mb: 1, py: 1.5, position: 'relative', fontSize: '1rem' }}
      >
        {loading ? (
          <>
            <CircularProgress
              size={20}
              color="inherit"
              sx={{ position: 'absolute', left: '50%', ml: '-10px' }}
            />
            <span style={{ opacity: 0 }}>Extracting…</span>
          </>
        ) : (
          'Extract Data'
        )}
      </Button>

      {selectedFile && !loading && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', textAlign: 'center' }}
        >
          You'll be able to review and edit before saving.
        </Typography>
      )}
    </Box>
  );
}
