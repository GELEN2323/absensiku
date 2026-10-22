import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import {
  AlertCircle,
  CheckCircle2,
  Info,
  Inbox,
  MapPin,
} from 'lucide-react-native';
import { cardShadow, colors, font, layout, radius, spacing } from '@/theme';
import { initials } from '@/lib/format';

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

type ScreenProps = {
  children: React.ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
};

export function Screen({ children, scroll = true, contentStyle }: ScreenProps) {
  if (!scroll) {
    return (
      <View style={styles.screen}>
        <View style={[styles.inner, contentStyle]}>{children}</View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.inner, contentStyle]}>{children}</View>
    </ScrollView>
  );
}

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
};

export function PageHeader({ eyebrow, title, subtitle, right }: PageHeaderProps) {
  return (
    <View style={styles.pageHeader}>
      <View style={styles.pageHeaderText}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.pageTitle}>{title}</Text>
        {subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}
      </View>
      {right ? <View style={styles.pageHeaderRight}>{right}</View> : null}
    </View>
  );
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({
  title,
  hint,
  right,
}: {
  title: string;
  hint?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionTitle}>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitleText}>{title}</Text>
        {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'sm';
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  fullWidth = false,
  style,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        size === 'sm' && styles.buttonSm,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'ghost' && styles.buttonGhost,
        variant === 'danger' && styles.buttonDanger,
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' || variant === 'danger' ? colors.white : colors.brand}
        />
      ) : (
        <>
          {icon}
          <Text
            style={[
              styles.buttonText,
              variant === 'secondary' && styles.buttonTextSecondary,
              variant === 'ghost' && styles.buttonTextGhost,
              variant === 'danger' && styles.buttonTextDanger,
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

type TextFieldProps = TextInputProps & {
  label?: string;
  error?: string | null;
  hint?: string;
  right?: React.ReactNode;
};

export function TextField({ label, error, hint, right, style, ...props }: TextFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.field}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <View
        style={[
          styles.fieldBox,
          focused && styles.fieldBoxFocused,
          Boolean(error) && styles.fieldBoxError,
        ]}
      >
        <TextInput
          {...props}
          onFocus={(event) => {
            setFocused(true);
            props.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            props.onBlur?.(event);
          }}
          placeholderTextColor={colors.faint}
          style={[styles.fieldInput, style]}
        />
        {right}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
      {!error && hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Display                                                             */
/* ------------------------------------------------------------------ */

type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'muted' | 'brand';

export function Badge({ label, tone = 'muted' }: { label: string; tone?: BadgeTone }) {
  return (
    <View
      style={[
        styles.badge,
        tone === 'success' && { backgroundColor: colors.successSoft },
        tone === 'warning' && { backgroundColor: colors.accentSoft },
        tone === 'danger' && { backgroundColor: colors.dangerSoft },
        tone === 'info' && { backgroundColor: colors.infoSoft },
        tone === 'brand' && { backgroundColor: colors.brandSoft },
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          tone === 'success' && { color: colors.success },
          tone === 'warning' && { color: colors.accent },
          tone === 'danger' && { color: colors.danger },
          tone === 'info' && { color: colors.info },
          tone === 'brand' && { color: colors.brand },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function Avatar({
  uri,
  name,
  size = 44,
}: {
  uri?: string | null;
  name?: string | null;
  size?: number;
}) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceAlt }}
      />
    );
  }

  return (
    <View
      style={[
        styles.avatarFallback,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.34 }]}>{initials(name)}</Text>
    </View>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'brand',
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: BadgeTone;
  icon?: React.ReactNode;
}) {
  const soft =
    tone === 'success'
      ? colors.successSoft
      : tone === 'warning'
        ? colors.accentSoft
        : tone === 'danger'
          ? colors.dangerSoft
          : tone === 'info'
            ? colors.infoSoft
            : colors.brandSoft;

  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: soft }]}>{icon}</View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

export function InfoRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: React.ReactNode;
  last?: boolean;
}) {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.infoValueWrap}>
        {typeof value === 'string' || typeof value === 'number' ? (
          <Text style={styles.infoValue}>{value}</Text>
        ) : (
          value
        )}
      </View>
    </View>
  );
}

export function ProgressBar({ percent, tone = colors.brand }: { percent: number; tone?: string }) {
  const safe = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${safe}%`, backgroundColor: tone }]} />
    </View>
  );
}

export function EmptyState({
  title,
  description,
  icon,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>{icon || <Inbox size={26} color={colors.brand} />}</View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {description ? <Text style={styles.emptyDescription}>{description}</Text> : null}
    </View>
  );
}

export function Notice({
  tone = 'info',
  title,
  message,
}: {
  tone?: 'info' | 'error' | 'success' | 'warning';
  title?: string;
  message: string;
}) {
  const palette =
    tone === 'error'
      ? { bg: colors.dangerSoft, fg: colors.danger, icon: <AlertCircle size={18} color={colors.danger} /> }
      : tone === 'success'
        ? { bg: colors.successSoft, fg: colors.success, icon: <CheckCircle2 size={18} color={colors.success} /> }
        : tone === 'warning'
          ? { bg: colors.accentSoft, fg: colors.accent, icon: <AlertCircle size={18} color={colors.accent} /> }
          : { bg: colors.infoSoft, fg: colors.info, icon: <Info size={18} color={colors.info} /> };

  return (
    <View style={[styles.notice, { backgroundColor: palette.bg }]}>
      {palette.icon}
      <View style={{ flex: 1 }}>
        {title ? <Text style={[styles.noticeTitle, { color: palette.fg }]}>{title}</Text> : null}
        <Text style={[styles.noticeText, { color: palette.fg }]}>{message}</Text>
      </View>
    </View>
  );
}

export function LoadingView({ label = 'Memuat data...' }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.brand} />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.brandRow}>
      <View style={styles.brandIcon}>
        <MapPin size={20} color={colors.white} strokeWidth={2.4} />
      </View>
      {!compact ? (
        <View>
          <Text style={styles.brandName}>Absensi</Text>
          <Text style={styles.brandTag}>Kehadiran karyawan</Text>
        </View>
      ) : null}
    </View>
  );
}

export function PageFooter() {
  return (
    <Text style={styles.footer}>
      Absensi Karyawan · data tersimpan di server · {new Date().getFullYear()}
    </Text>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    flexGrow: 1,
  },
  inner: {
    width: '100%',
    maxWidth: layout.maxWidth,
    alignSelf: 'center',
    padding: layout.contentPadding,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  pageHeaderText: {
    flex: 1,
    minWidth: 220,
    gap: 4,
  },
  pageHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  eyebrow: {
    color: colors.brand,
    fontSize: font.tiny,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  pageTitle: {
    color: colors.ink,
    fontSize: font.h1,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    color: colors.muted,
    fontSize: font.body,
    lineHeight: 20,
    maxWidth: 620,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...cardShadow,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionTitleText: {
    color: colors.ink,
    fontSize: font.h3,
    fontWeight: '700',
  },
  sectionHint: {
    color: colors.muted,
    fontSize: font.small,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  button: {
    minHeight: 46,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  buttonSm: {
    minHeight: 38,
    paddingHorizontal: spacing.md,
  },
  buttonPrimary: {
    backgroundColor: colors.brand,
  },
  buttonSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonGhost: {
    backgroundColor: 'transparent',
  },
  buttonDanger: {
    backgroundColor: colors.dangerSoft,
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.white,
    fontSize: font.body,
    fontWeight: '700',
  },
  buttonTextSecondary: {
    color: colors.ink,
  },
  buttonTextGhost: {
    color: colors.brand,
  },
  buttonTextDanger: {
    color: colors.danger,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    color: colors.inkSoft,
    fontSize: font.small,
    fontWeight: '600',
  },
  fieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  fieldBoxFocused: {
    borderColor: colors.brand,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 0 0 3px rgba(15,118,110,0.12)' } as object) : {}),
  },
  fieldBoxError: {
    borderColor: colors.danger,
  },
  fieldInput: {
    flex: 1,
    color: colors.ink,
    fontSize: font.body,
    paddingVertical: spacing.sm,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  fieldError: {
    color: colors.danger,
    fontSize: font.small,
  },
  fieldHint: {
    color: colors.muted,
    fontSize: font.small,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  badgeText: {
    color: colors.muted,
    fontSize: font.tiny,
    fontWeight: '700',
  },
  avatarFallback: {
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.brand,
    fontWeight: '800',
  },
  statCard: {
    flex: 1,
    minWidth: 150,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: 4,
    ...cardShadow,
  },
  statIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  statValue: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  statLabel: {
    color: colors.inkSoft,
    fontSize: font.small,
    fontWeight: '600',
  },
  statHint: {
    color: colors.muted,
    fontSize: font.tiny,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingVertical: spacing.md,
  },
  infoRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    color: colors.muted,
    fontSize: font.small,
  },
  infoValueWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  infoValue: {
    color: colors.ink,
    fontSize: font.body,
    fontWeight: '600',
    textAlign: 'right',
  },
  progressTrack: {
    height: 8,
    width: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  emptyIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: font.h3,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyDescription: {
    color: colors.muted,
    fontSize: font.body,
    textAlign: 'center',
    maxWidth: 360,
    lineHeight: 20,
  },
  notice: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'flex-start',
  },
  noticeTitle: {
    fontSize: font.small,
    fontWeight: '700',
    marginBottom: 2,
  },
  noticeText: {
    fontSize: font.small,
    lineHeight: 18,
    flexShrink: 1,
  },
  loading: {
    flex: 1,
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    color: colors.muted,
    fontSize: font.body,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  brandIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    color: colors.ink,
    fontSize: font.h3,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  brandTag: {
    color: colors.muted,
    fontSize: font.tiny,
  },
  footer: {
    color: colors.faint,
    fontSize: font.tiny,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
