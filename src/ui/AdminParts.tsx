import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from './theme';

// Small pieces the admin screens are built from. Data marks use one hue (the
// wood brown) for magnitude; text stays in the ink colours; a problem is
// flagged with an icon and a word, never colour alone.

/** A headline number. */
export function StatTile({ label, value, onPress }: { label: string; value: number | string; onPress?: () => void }) {
  const body = (
    <>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </>
  );
  return onPress ? (
    <Pressable onPress={onPress} style={[styles.tile, styles.tilePressable]} accessibilityRole="button">
      {body}
    </Pressable>
  ) : (
    <View style={styles.tile} accessible accessibilityLabel={`${label}: ${value}`}>
      {body}
    </View>
  );
}

/** A thin horizontal bar for a share of a whole (0..1), on a light track of the same hue. */
export function Meter({ value }: { value: number }) {
  const share = Math.max(0, Math.min(1, value));
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${share * 100}%` }]} />
    </View>
  );
}

/** A labelled bar: the label, a bar scaled to `max`, and the value. */
export function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <View style={styles.barRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.barLabel}>{label}</Text>
      <View style={styles.barArea}>
        <View style={[styles.bar, { width: `${max > 0 ? (value / max) * 100 : 0}%` }]} />
      </View>
      <Text style={styles.barValue}>{value}</Text>
    </View>
  );
}

/** − value + for a number with limits. */
export function Stepper({
  label,
  value,
  format = String,
  step,
  min,
  max,
  onChange,
  testID,
}: {
  label: string;
  value: number;
  format?: (value: number) => string;
  step: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  testID?: string;
}) {
  const round = (v: number) => Math.round(v * 100) / 100;
  return (
    <View style={styles.stepper} testID={testID}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <Pressable
        onPress={() => onChange(round(Math.max(min, value - step)))}
        disabled={value <= min}
        style={[styles.stepButton, value <= min && styles.off]}
        accessibilityRole="button"
        accessibilityLabel={`Less ${label}`}
        testID={testID && `${testID}-less`}
      >
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <Text style={styles.stepValue} testID={testID && `${testID}-value`}>
        {format(value)}
      </Text>
      <Pressable
        onPress={() => onChange(round(Math.min(max, value + step)))}
        disabled={value >= max}
        style={[styles.stepButton, value >= max && styles.off]}
        accessibilityRole="button"
        accessibilityLabel={`More ${label}`}
        testID={testID && `${testID}-more`}
      >
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      {title && <Text style={styles.cardTitle}>{title}</Text>}
      {children}
    </View>
  );
}

export function AdminButton({
  label,
  primary,
  danger,
  disabled,
  onPress,
  testID,
}: {
  label: string;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      testID={testID}
      style={[styles.button, primary && styles.buttonPrimary, danger && styles.buttonDanger, disabled && styles.off]}
    >
      <Text style={[styles.buttonText, (primary || danger) && styles.buttonTextLight]}>{label}</Text>
    </Pressable>
  );
}

export const adminStyles = StyleSheet.create({
  note: { fontSize: 13, lineHeight: 18, color: colors.inkSoft },
  empty: { fontSize: 14, color: colors.inkSoft, textAlign: 'center', paddingVertical: 12 },
  error: { fontSize: 14, fontWeight: '700', color: colors.tier.invalid },
  th: { fontSize: 12, fontWeight: '800', color: colors.inkSoft },
  td: { fontSize: 13, color: colors.ink },
  strong: { fontWeight: '800', color: colors.ink },
});

const styles = StyleSheet.create({
  tile: {
    flexBasis: '30%',
    flexGrow: 1,
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.tile,
    borderWidth: 1.5,
    borderColor: colors.tileEdge,
  },
  tilePressable: { borderColor: colors.wood },
  tileValue: { fontSize: 24, fontWeight: '900', color: colors.ink },
  tileLabel: { fontSize: 12, color: colors.inkSoft },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.paperDeep, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.wood },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { width: 32, fontSize: 12, color: colors.inkSoft, textAlign: 'right' },
  barArea: { flex: 1 },
  bar: { height: 8, minWidth: 2, borderTopRightRadius: 4, borderBottomRightRadius: 4, backgroundColor: colors.wood },
  barValue: { width: 34, fontSize: 12, color: colors.ink },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperLabel: { flex: 1, fontSize: 14, color: colors.ink },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.wood,
  },
  stepText: { fontSize: 20, fontWeight: '800', color: colors.wood, lineHeight: 22 },
  stepValue: { minWidth: 56, textAlign: 'center', fontSize: 15, fontWeight: '800', color: colors.ink },
  off: { opacity: 0.35 },
  card: {
    gap: 8,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.tile,
    borderWidth: 1.5,
    borderColor: colors.tileEdge,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  button: { alignItems: 'center', paddingVertical: 11, borderRadius: 12, borderWidth: 2, borderColor: colors.wood },
  buttonPrimary: { backgroundColor: colors.wood },
  buttonDanger: { backgroundColor: colors.tier.invalid, borderColor: colors.tier.invalid },
  buttonText: { fontSize: 15, fontWeight: '700', color: colors.wood },
  buttonTextLight: { color: colors.white },
});
