import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAccount } from '../account';
import { devToolsEnabled, isUnlocked, unlock } from './devAccess';
import { Owl } from './Owl';
import { colors } from './theme';

/** Asks for the developer PIN (see devAccess.ts). */
export function PinGate({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);
  const submit = () => {
    if (unlock(pin)) onUnlock();
    else {
      setWrong(true);
      setPin('');
    }
  };
  return (
    <View style={styles.gate}>
      <Owl size={90} mood="thinking" />
      <Text style={styles.note}>Developer PIN</Text>
      <TextInput
        value={pin}
        onChangeText={setPin}
        onSubmitEditing={submit}
        secureTextEntry
        keyboardType="number-pad"
        autoFocus
        style={styles.pin}
        testID="dev-pin"
      />
      {wrong && <Text style={styles.wrong}>{"That's not it."}</Text>}
      <Pressable onPress={submit} style={styles.button}>
        <Text style={styles.buttonText}>Unlock</Text>
      </Pressable>
    </View>
  );
}

/** Shown in place of the developer tools to everyone else. */
export function DevToolsOff() {
  return (
    <Text style={styles.note}>
      These tools are for the game’s admin account. In a development build they also open with
      EXPO_PUBLIC_DEV_PIN=your-pin in .env.local (restart with `npx expo start --clear`).
    </Text>
  );
}

/**
 * The developer tools: open to the admin account, or with the PIN in a
 * development build (EXPO_PUBLIC_DEV_PIN). The server checks admin requests
 * itself, so this only decides what's shown.
 */
export function DevGate({ children }: { children: ReactNode }) {
  const { admin } = useAccount();
  const [open, setOpen] = useState(isUnlocked);
  if (admin) return children;
  if (!devToolsEnabled) return <DevToolsOff />;
  return open ? children : <PinGate onUnlock={() => setOpen(true)} />;
}

const styles = StyleSheet.create({
  gate: { alignItems: 'center', gap: 12, marginTop: 40 },
  note: { textAlign: 'center', fontSize: 14, color: colors.inkSoft, lineHeight: 20 },
  pin: {
    width: 180,
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.tileEdge,
    backgroundColor: colors.white,
    fontSize: 22,
    textAlign: 'center',
    letterSpacing: 6,
  },
  wrong: { color: colors.tier.invalid, fontWeight: '700' },
  button: {
    alignItems: 'center',
    alignSelf: 'stretch',
    marginHorizontal: 40,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.wood,
  },
  buttonText: { fontSize: 15, fontWeight: '700', color: colors.white },
});
