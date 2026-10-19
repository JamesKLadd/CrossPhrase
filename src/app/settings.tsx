import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Tier } from '../core/types';
import { settings, useSettings, type Settings } from '../settings';
import { colors, TIER_ICON, TIER_LABEL, TIER_PALETTES } from '../ui/theme';

const TIERS: Tier[] = ['invalid', 'ok', 'great', 'poetic'];

const OPTIONS: { key: keyof Settings; label: string; help: string }[] = [
  { key: 'sound', label: 'Sound effects', help: 'Tiles, verdicts and fanfares.' },
  { key: 'music', label: 'Music', help: 'A quiet loop for thinking to.' },
  { key: 'haptics', label: 'Vibration', help: 'Little taps when words land and lines are graded.' },
  {
    key: 'reduceMotion',
    label: 'Reduce motion',
    help: 'No confetti, bouncing or typing text. Also on when your phone asks for less motion.',
  },
  {
    key: 'colorBlind',
    label: 'Colour-blind-friendly verdicts',
    help: 'Verdict colours that stay distinct with common colour blindness. Verdicts always show an icon too.',
  },
];

export default function SettingsScreen() {
  const current = useSettings();
  const palette = TIER_PALETTES[current.colorBlind ? 'colorBlind' : 'standard'];
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.column}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
          <Text style={styles.title} accessibilityRole="header">
            Settings
          </Text>
          <View style={styles.spacer} />
        </View>

        {OPTIONS.map(({ key, label, help }) => (
          <View key={key} style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.help}>{help}</Text>
            </View>
            <Switch
              value={current[key]}
              onValueChange={(value) => settings.set({ [key]: value })}
              trackColor={{ true: colors.wood, false: colors.tileEdge }}
              thumbColor={colors.white}
              // react-native-web colours the "on" thumb separately.
              {...{ activeThumbColor: colors.white }}
              accessibilityLabel={label}
              testID={`setting-${key}`}
            />
          </View>
        ))}

        <View style={styles.preview} accessible accessibilityLabel="Verdict colours preview">
          {TIERS.map((tier) => (
            <Text key={tier} style={[styles.badge, { backgroundColor: palette[tier] }]}>
              {TIER_ICON[tier]} {TIER_LABEL[tier]}
            </Text>
          ))}
        </View>

        <Text style={styles.note}>
          Text size follows your phone’s setting. Word tiles stay a fixed size so they fit the board.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  column: { width: '100%', maxWidth: 520, alignSelf: 'center', padding: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  back: { width: 70, fontSize: 15, fontWeight: '700', color: colors.wood },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.ink },
  spacer: { width: 70 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.tile,
    borderWidth: 1.5,
    borderColor: colors.tileEdge,
  },
  rowText: { flex: 1, gap: 2 },
  label: { fontSize: 16, fontWeight: '700', color: colors.ink },
  help: { fontSize: 13, color: colors.inkSoft },
  preview: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  badge: {
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    fontSize: 13,
    fontWeight: '800',
    color: colors.white,
  },
  note: { textAlign: 'center', fontSize: 13, color: colors.inkSoft, lineHeight: 19 },
});
