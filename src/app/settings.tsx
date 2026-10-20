import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { analyticsAvailable, sendFeedback } from '../analytics';
import type { Tier } from '../core/types';
import { BUILD } from '../lib/build';
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
  ...(analyticsAvailable
    ? [
        {
          key: 'analytics' as const,
          label: 'Share anonymous play stats',
          help: 'Which levels are won, lost or skipped, so the hard ones can be eased. Never your name.',
        },
      ]
    : []),
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

        {analyticsAvailable && <Feedback />}

        <Text style={styles.version} testID="build-version">
          Build {BUILD}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

/** A note to the developer: what was confusing, too hard, or broken. */
function Feedback() {
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.label}>Send feedback</Text>
        <Text style={styles.help}>
          {sent ? 'Thanks! The owl will pass it on.' : 'Too hard? Confusing? Broken? Tell the developer.'}
        </Text>
        {!sent && (
          <>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="e.g. Level 14 felt impossible"
              placeholderTextColor={colors.inkSoft}
              multiline
              maxLength={500}
              style={styles.input}
              testID="feedback-text"
            />
            <Pressable
              onPress={() => {
                sendFeedback(text, 'settings');
                setSent(true);
                setText('');
              }}
              disabled={!text.trim()}
              accessibilityRole="button"
              style={[styles.send, !text.trim() && styles.sendOff]}
              testID="feedback-send"
            >
              <Text style={styles.sendText}>Send</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
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
  input: {
    minHeight: 70,
    marginTop: 6,
    padding: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.tileEdge,
    backgroundColor: colors.white,
    fontSize: 16,
    color: colors.ink,
    textAlignVertical: 'top',
  },
  send: { alignSelf: 'flex-end', marginTop: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.wood },
  sendOff: { opacity: 0.4 },
  sendText: { fontSize: 15, fontWeight: '700', color: colors.white },
  version: { textAlign: 'center', fontSize: 12, color: colors.inkSoft },
});
