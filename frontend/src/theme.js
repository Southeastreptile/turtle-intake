import { createTheme } from '@mui/material/styles';

// SERC Wildlife Intake — Light mode, nature-inspired earth-tone palette
// Drawn from the logo (Eastern Box Turtle illustration) and southeastreptile.org aesthetic:
//   warm cream backgrounds, deep olive greens, carapace golds, soft warm whites

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#4A5E35',       // Deep olive / dark moss green
      light: '#7A8C5E',      // Sage green
      dark: '#2E3B1F',       // Forest shadow
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#B8924A',       // Warm carapace gold (slightly deepened for light mode contrast)
      light: '#D4AF6E',      // Soft gold
      dark: '#6B4F2A',       // Earthy brown
      contrastText: '#FFFFFF',
    },
    background: {
      default: '#F5F0E6',    // Warm parchment / off-white — like aged paper
      paper: '#FDFAF4',      // Very soft cream for cards
    },
    text: {
      primary: '#2C2C1E',    // Warm near-black (not pure black — softer)
      secondary: '#6B6347',  // Warm muted brown
      disabled: '#A89E85',
    },
    divider: '#DDD5C0',      // Warm tan divider
    success: {
      main: '#4A5E35',
      contrastText: '#FFFFFF',
    },
    error: {
      main: '#B0412A',
    },
    warning: {
      main: '#B8924A',
    },
    // Soft tan for drop-zone and surface accents
    action: {
      hover: 'rgba(74, 94, 53, 0.06)',
      selected: 'rgba(74, 94, 53, 0.10)',
    },
  },

  typography: {
    fontFamily: '"Inter", "Lato", "Roboto", sans-serif',
    h4: { fontWeight: 700, color: '#2C2C1E' },
    h5: { fontWeight: 700, color: '#2C2C1E' },
    h6: { fontWeight: 600, color: '#2C2C1E' },
    subtitle1: { fontWeight: 500 },
    subtitle2: { fontWeight: 600, color: '#6B6347' },
    body2: { color: '#6B6347' },
    overline: {
      fontWeight: 700,
      letterSpacing: '0.12em',
      fontSize: '0.7rem',
    },
  },

  shape: {
    borderRadius: 12,
  },

  shadows: [
    'none',
    '0 1px 4px rgba(60,50,20,0.08)',
    '0 2px 8px rgba(60,50,20,0.10)',
    '0 4px 16px rgba(60,50,20,0.10)',
    '0 6px 24px rgba(60,50,20,0.12)',
    '0 8px 32px rgba(60,50,20,0.14)',
    ...Array(19).fill('none'),
  ],

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#F5F0E6',
        },
      },
    },

    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#F5F0E6',
          backgroundImage: 'none',
          borderBottom: '1px solid #DDD5C0',
          boxShadow: '0 1px 6px rgba(60,50,20,0.08)',
          color: '#2C2C1E',
        },
      },
    },

    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          paddingTop: 11,
          paddingBottom: 11,
          fontSize: '0.95rem',
          borderRadius: 10,
        },
        containedPrimary: {
          background: 'linear-gradient(135deg, #4A5E35 0%, #5C7340 100%)',
          boxShadow: '0 2px 8px rgba(74, 94, 53, 0.30)',
          '&:hover': {
            background: 'linear-gradient(135deg, #3A4E28 0%, #4A5E35 100%)',
            boxShadow: '0 4px 14px rgba(74, 94, 53, 0.38)',
          },
        },
        outlinedPrimary: {
          borderColor: '#7A8C5E',
          '&:hover': {
            borderColor: '#4A5E35',
            backgroundColor: 'rgba(74, 94, 53, 0.06)',
          },
        },
        outlinedSecondary: {
          borderColor: '#D4AF6E',
          '&:hover': {
            borderColor: '#B8924A',
            backgroundColor: 'rgba(184, 146, 74, 0.06)',
          },
        },
      },
    },

    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: '#FDFAF4',
          backgroundImage: 'none',
          boxShadow: '0 2px 12px rgba(60,50,20,0.09)',
          border: '1px solid #EDE7D5',
        },
      },
    },

    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
        elevation1: {
          boxShadow: '0 2px 10px rgba(60,50,20,0.08)',
        },
      },
    },

    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
      },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: '#FFFFFF',
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: '#7A8C5E',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#4A5E35',
          },
        },
        notchedOutline: {
          borderColor: '#DDD5C0',
        },
      },
    },

    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: '#6B6347',
          '&.Mui-focused': {
            color: '#4A5E35',
          },
        },
      },
    },

    MuiSelect: {
      styleOverrides: {
        root: {
          backgroundColor: '#FFFFFF',
        },
      },
    },

    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: '#DDD5C0',
        },
      },
    },

    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
        standardError: {
          backgroundColor: '#FBF0ED',
          color: '#7A2518',
        },
        standardSuccess: {
          backgroundColor: '#EEF3E8',
          color: '#2E3B1F',
        },
      },
    },

    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: '#FDFAF4',
          backgroundImage: 'none',
          boxShadow: '0 8px 40px rgba(60,50,20,0.18)',
          border: '1px solid #EDE7D5',
        },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: {
          backgroundColor: '#EDE7D5',
          color: '#4A5E35',
          fontWeight: 600,
        },
      },
    },

    MuiLinearProgress: {
      styleOverrides: {
        root: {
          backgroundColor: '#EDE7D5',
          borderRadius: 4,
        },
        bar: {
          backgroundColor: '#4A5E35',
        },
      },
    },
  },
});

export default theme;
