import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BUNDLED_MODEL, localVerdict } from '../../core/localJudge';
import { labellingCandidate, Rng } from '../../core/phraseGen';
import type { Tier } from '../../core/types';
import { displayWord } from '../../core/words';
import { judgeService } from '../../judge';
import { devToolsEnabled, isUnlocked } from '../../ui/devAccess';
import { DevToolsOff, PinGate } from '../../ui/PinGate';
import { colors, TIER_LABEL } from '../../ui/theme';

const TIERS: Tier[] = ['invalid', 'ok', 'great', 'poetic'];
const TIER_HELP: Record<Tier, string> = {
  invalid: 'not English',
  ok: 'fine but plain',
  great: 'vivid or clever',
  poetic: 'genuinely striking',
};

/** Quick labelling for training the judges. Developer only: see ui/devAccess.ts. */
export default function LabelScreen() {
  const [open, setOpen] = useState(isUnlocked());
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.column}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
          <Text style={styles.title}>Label phrases</Text>
          <View style={styles.headerSpacer} />
        </View>
        {!devToolsEnabled ? (
          <DevToolsOff />
        ) : open ? (
          <Labeller />
        ) : (
          <PinGate onUnlock={() => setOpen(true)} />
        )}
      </View>
    </SafeAreaView>
  );
}

function Labeller() {
  const [rng] = useState(() => new Rng(Date.now() | 0));
  /** Phrases already labelled, so none comes up twice. */
  const [seen, setSeen] = useState<ReadonlySet<string>>(
    () => new Set(judgeService.labels().map((l) => l.phrase)),
  );
  const [words, setWords] = useState<string[]>(() => labellingCandidate(rng, BUNDLED_MODEL, seen));
  const [total, setTotal] = useState(() => judgeService.labels().length);
  const [unsent, setUnsent] = useState(() => judgeService.unsentLabelCount());
  const [agreed, setAgreed] = useState({ yes: 0, of: 0 });
  const [last, setLast] = useState<string | null>(null);
  const [exportNote, setExportNote] = useState<string | null>(null);

  const label = (tier: Tier) => {
    const phrase = words.join(' ');
    const builtIn = localVerdict({ id: '1A', words }).tier;
    judgeService.label({ phrase, tier, source: 'labeler' });
    const updated = new Set(seen).add(phrase);
    setSeen(updated);
    setTotal((n) => n + 1);
    setAgreed((a) => ({ yes: a.yes + (builtIn === tier ? 1 : 0), of: a.of + 1 }));
    setLast(`“${phrase}”: you said ${TIER_LABEL[tier]}, the built-in judge said ${TIER_LABEL[builtIn]}.`);
    setWords(labellingCandidate(rng, BUNDLED_MODEL, updated));
    // Send in small batches as you go; nothing is lost if the PC judge is off.
    judgeService.syncLabels().finally(() => setUnsent(judgeService.unsentLabelCount()));
    setUnsent(judgeService.unsentLabelCount());
  };

  const exportLabels = async () => {
    const lines = judgeService.labels().map((l) => JSON.stringify(l)).join('\n');
    try {
      await Share.share({ message: lines });
      setExportNote('Paste the shared text at the end of training/labels.jsonl on your computer.');
    } catch {
      setExportNote("Sharing isn't available here. Run the PC judge and the labels sync by themselves.");
    }
  };

  return (
    <View style={styles.labeller}>
      <Text style={styles.stats}>
        {total} labelled
        {judgeService.remoteKind === 'pc'
          ? unsent > 0
            ? ` · ${unsent} waiting for the PC judge`
            : ' · all saved on your PC'
          : ' · on this phone (export below)'}
        {agreed.of > 0 ? `\nBuilt-in judge agreed with you ${agreed.yes} of ${agreed.of} times today.` : ''}
      </Text>

      <View style={styles.card}>
        <Text style={styles.phrase} testID="label-phrase">
          {words.map(displayWord).join(' ')}
        </Text>
      </View>

      <View style={styles.tiers}>
        {TIERS.map((tier) => (
          <Pressable
            key={tier}
            onPress={() => label(tier)}
            style={[styles.tier, { backgroundColor: colors.tier[tier] }]}
          >
            <Text style={styles.tierLabel}>{TIER_LABEL[tier]}</Text>
            <Text style={styles.tierHelp}>{TIER_HELP[tier]}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable onPress={() => setWords(labellingCandidate(rng, BUNDLED_MODEL, seen))} style={styles.button}>
        <Text style={styles.buttonText}>Skip</Text>
      </Pressable>

      {last && <Text style={styles.last}>{last}</Text>}

      <View style={styles.footer}>
        {judgeService.remoteKind !== 'pc' && (
          <Pressable onPress={exportLabels} style={styles.button}>
            <Text style={styles.buttonText}>Export labels</Text>
          </Pressable>
        )}
        {exportNote && <Text style={styles.note}>{exportNote}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  column: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', padding: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center' },
  back: { fontSize: 15, fontWeight: '700', color: colors.wood, width: 70 },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.ink },
  headerSpacer: { width: 70 },
  note: { textAlign: 'center', fontSize: 14, color: colors.inkSoft, lineHeight: 20 },
  labeller: { flex: 1, gap: 12 },
  stats: { textAlign: 'center', fontSize: 13, color: colors.inkSoft, lineHeight: 19 },
  card: {
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    borderRadius: 18,
    backgroundColor: colors.tile,
    borderWidth: 1.5,
    borderColor: colors.tileEdge,
    borderBottomWidth: 5,
  },
  phrase: { fontSize: 28, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  tiers: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tier: { flexBasis: '47%', flexGrow: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 14 },
  tierLabel: { color: colors.white, fontSize: 18, fontWeight: '900' },
  tierHelp: { color: colors.white, fontSize: 12, opacity: 0.9 },
  last: { textAlign: 'center', fontSize: 13, color: colors.inkSoft, fontStyle: 'italic' },
  footer: { marginTop: 'auto', gap: 8 },
  button: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.wood,
  },
  buttonText: { fontSize: 15, fontWeight: '700', color: colors.wood },
});
