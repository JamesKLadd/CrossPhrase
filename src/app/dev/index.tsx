import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LEVELS } from '../../data/levels';
import { progress, totalStars, useProgress } from '../../progress';
import { devToolsEnabled, isUnlocked } from '../../ui/devAccess';
import { DevToolsOff, PinGate } from '../../ui/PinGate';
import { colors } from '../../ui/theme';
import { useJudgeStatus } from '../../ui/useJudgeStatus';

/** Developer tools behind the PIN: labelling, and shortcuts for testing levels. */
export default function DevMenu() {
  const [open, setOpen] = useState(isUnlocked());
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.column}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
          <Text style={styles.title}>Developer</Text>
          <View style={styles.headerSpacer} />
        </View>
        {!devToolsEnabled ? <DevToolsOff /> : open ? <Tools /> : <PinGate onUnlock={() => setOpen(true)} />}
      </View>
    </SafeAreaView>
  );
}

function Tools() {
  const saved = useProgress();
  const judgeStatus = useJudgeStatus();
  const [confirmReset, setConfirmReset] = useState(false);
  const cleared = Object.values(saved.levels).filter((l) => l.stars > 0).length;

  return (
    <View style={styles.tools}>
      <Text style={styles.note}>{judgeStatus}</Text>
      <Text style={styles.note}>
        {cleared} of {LEVELS.length} levels cleared · {totalStars(saved)} of {LEVELS.length * 3} stars
      </Text>

      <Button label="Label phrases" primary onPress={() => router.push('/dev/label')} />
      <Button
        label={saved.unlockAll ? 'Unlock all levels: on' : 'Unlock all levels: off'}
        onPress={() => progress.setUnlockAll(!saved.unlockAll)}
        testID="dev-unlock-all"
      />
      <Button
        label={confirmReset ? 'Tap again to erase every star' : 'Reset progress'}
        danger={confirmReset}
        onPress={() => {
          if (confirmReset) progress.reset();
          setConfirmReset(!confirmReset);
        }}
      />
    </View>
  );
}

function Button({
  label,
  primary,
  danger,
  onPress,
  testID,
}: {
  label: string;
  primary?: boolean;
  danger?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={[styles.button, primary && styles.buttonPrimary, danger && styles.buttonDanger]}
    >
      <Text style={[styles.buttonText, (primary || danger) && styles.buttonTextLight]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  column: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', padding: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center' },
  back: { fontSize: 15, fontWeight: '700', color: colors.wood, width: 70 },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.ink },
  headerSpacer: { width: 70 },
  tools: { gap: 12 },
  note: { textAlign: 'center', fontSize: 14, color: colors.inkSoft, lineHeight: 20 },
  button: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.wood,
  },
  buttonPrimary: { backgroundColor: colors.wood },
  buttonDanger: { backgroundColor: colors.tier.invalid, borderColor: colors.tier.invalid },
  buttonText: { fontSize: 15, fontWeight: '700', color: colors.wood },
  buttonTextLight: { color: colors.white },
});
