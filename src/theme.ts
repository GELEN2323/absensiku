import { Platform } from 'react-native';

export const colors = {
  bg: '#F4F6F8',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF2F5',
  ink: '#0B1220',
  inkSoft: '#344054',
  muted: '#667085',
  faint: '#98A2B3',
  border: '#E4E7EC',
  brand: '#0F766E',
  brandDark: '#0B5C56',
  brandSoft: '#E6F4F1',
  accent: '#D97706',
  accentSoft: '#FEF3C7',
  danger: '#DC2626',
  dangerSoft: '#FEE4E2',
  success: '#15803D',
  successSoft: '#DCFCE7',
  info: '#1D4ED8',
  infoSoft: '#DBEAFE',
  purple: '#7E22CE',
  purpleSoft: '#F3E8FF',
  white: '#FFFFFF',
  overlay: 'rgba(11, 18, 32, 0.45)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
};

export const font = {
  display: 34,
  h1: 26,
  h2: 20,
  h3: 16,
  body: 14,
  small: 12,
  tiny: 11,
};

export const cardShadow =
  Platform.OS === 'web'
    ? ({ boxShadow: '0px 8px 24px rgba(16, 24, 40, 0.06)' } as object)
    : {
        shadowColor: '#101828',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
        elevation: 3,
      };

export const layout = {
  maxWidth: 1080,
  contentPadding: 20,
};
