import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  accountsAvailable,
  changePassword,
  createAccount,
  deleteAccount,
  logIn,
  logOut,
  syncAccount,
  useAccount,
  usernameProblem,
  type AccountState,
} from '../account';
import { colors } from '../ui/theme';

export default function AccountScreen() {
  const account = useAccount();
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.column} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
          <Text style={styles.title} accessibilityRole="header">
            Account
          </Text>
          <View style={styles.spacer} />
        </View>
        {!accountsAvailable ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Accounts are switched off</Text>
            <Text style={styles.note}>They need the online backend (Supabase), as the README describes.</Text>
          </View>
        ) : account.userId ? (
          <SignedIn account={account} />
        ) : (
          <SignedOut account={account} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function syncLine({ status, syncedAt }: AccountState): string {
  if (status === 'syncing') return 'Saving…';
  if (status === 'offline') return "Couldn't reach the server just now. It'll try again.";
  if (!syncedAt) return 'Not saved yet.';
  const at = new Date(syncedAt);
  return `Saved ${at.toLocaleDateString([], { day: 'numeric', month: 'short' })} at ${at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
}

function SignedIn({ account }: { account: AccountState }) {
  const [changing, setChanging] = useState(false);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [unsaved, setUnsaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const run = async (task: () => Promise<string | null>) => {
    setBusy(true);
    setMessage(await task());
    setBusy(false);
  };

  return (
    <View style={styles.stack}>
      <View style={styles.card}>
        <Text style={styles.cardTitle} testID="account-username">
          👤 {account.username}
        </Text>
        <Text style={styles.note}>
          Your stars, daily puzzles, hearts and feathers are saved to your account. Log in on any device to carry on
          where you left off. Your username is your name on the leaderboards.
        </Text>
        <Text style={styles.status} testID="account-sync">
          {syncLine(account)}
        </Text>
        <Button label="Save now" onPress={() => void syncAccount()} disabled={account.status === 'syncing'} />
      </View>

      <View style={styles.card}>
        {changing ? (
          <>
            <Text style={styles.label}>New password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              style={styles.input}
              testID="new-password"
            />
            <Button
              label="Change password"
              primary
              disabled={busy || !password}
              onPress={() =>
                run(async () => {
                  const error = await changePassword(password);
                  if (!error) {
                    setChanging(false);
                    setPassword('');
                    return 'Password changed.';
                  }
                  return error;
                })
              }
            />
          </>
        ) : (
          <Button label="Change password" onPress={() => setChanging(true)} />
        )}
        {unsaved ? (
          <>
            <Text style={styles.warning}>
              {"Your latest progress isn't saved yet (no connection). Logging out now loses it on this device."}
            </Text>
            <Button label="Log out anyway" danger onPress={() => void logOut(true)} />
          </>
        ) : (
          <Button
            label="Log out"
            disabled={busy}
            testID="log-out"
            onPress={async () => {
              setBusy(true);
              const result = await logOut();
              setBusy(false);
              if (result === 'unsaved') setUnsaved(true);
            }}
          />
        )}
        <Text style={styles.note}>Logging out starts this device over as a guest. Your progress stays in your account.</Text>
      </View>

      <View style={styles.card}>
        {confirmDelete && (
          <Text style={styles.warning}>
            {"This deletes your account, its saved progress and its leaderboard scores, on every device. It can't be undone."}
          </Text>
        )}
        <Button
          label={confirmDelete ? 'Delete my account for good' : 'Delete account'}
          danger={confirmDelete}
          disabled={busy}
          onPress={() => (confirmDelete ? run(deleteAccount) : setConfirmDelete(true))}
          testID="delete-account"
        />
      </View>
      {busy && <ActivityIndicator color={colors.wood} />}
      {message && (
        <Text style={styles.message} testID="account-message">
          {message}
        </Text>
      )}
    </View>
  );
}

function SignedOut({ account }: { account: AccountState }) {
  const ended = account.status === 'signed-out';
  const [mode, setMode] = useState<'create' | 'login'>(ended ? 'login' : 'create');
  const [username, setUsername] = useState(account.username ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const creating = mode === 'create';
  const nameHint = creating && username.trim().length >= 3 ? usernameProblem(username) : null;

  const submit = async () => {
    if (creating && password !== confirm) {
      setError("The passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    const problem = creating ? await createAccount(username, password) : await logIn(username, password);
    setBusy(false);
    setError(problem);
  };

  return (
    <View style={styles.stack}>
      {ended && (
        <Text style={styles.warning}>
          {'Your login on this device ended. Log in again to keep saving; your progress here is kept and added back.'}
        </Text>
      )}
      <View style={styles.tabs} accessibilityRole="tablist">
        {(['create', 'login'] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => {
              setMode(m);
              setError(null);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === m }}
            style={[styles.tab, mode === m && styles.tabOn]}
            testID={`tab-${m}`}
          >
            <Text style={[styles.tabText, mode === m && styles.tabTextOn]}>{m === 'create' ? 'Create account' : 'Log in'}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.note}>
          {creating
            ? 'Keep your progress, hearts and feathers on any device, and put your name on the leaderboards. Everything you’ve played on this device comes with you.'
            : 'Progress you’ve made on this device as a guest is added to your account.'}
        </Text>
        <Text style={styles.label}>Username</Text>
        <TextInput
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          maxLength={16}
          style={styles.input}
          testID="account-name"
        />
        {nameHint && <Text style={styles.hint}>{nameHint}</Text>}
        <Text style={styles.label}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={creating ? 'new-password' : 'current-password'}
          textContentType={creating ? 'newPassword' : 'password'}
          onSubmitEditing={creating ? undefined : submit}
          style={styles.input}
          testID="account-password"
        />
        {creating && (
          <>
            <Text style={styles.label}>Password again</Text>
            <TextInput
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              onSubmitEditing={submit}
              style={styles.input}
              testID="account-confirm"
            />
            <Text style={styles.hint}>
              At least 8 characters. There’s no email, so a forgotten password can’t be reset: keep it somewhere safe.
            </Text>
          </>
        )}
        {error && (
          <Text style={styles.error} testID="account-error">
            {error}
          </Text>
        )}
        <Button
          label={busy ? '…' : creating ? 'Create account' : 'Log in'}
          primary
          disabled={busy || !username.trim() || !password}
          onPress={submit}
          testID="account-submit"
        />
      </View>
    </View>
  );
}

function Button({
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
      accessibilityState={{ disabled }}
      testID={testID}
      style={[styles.button, primary && styles.buttonPrimary, danger && styles.buttonDanger, disabled && styles.buttonOff]}
    >
      <Text style={[styles.buttonText, (primary || danger) && styles.buttonTextLight]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  column: { width: '100%', maxWidth: 520, alignSelf: 'center', padding: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center' },
  back: { width: 70, fontSize: 15, fontWeight: '700', color: colors.wood },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.ink },
  spacer: { width: 70 },
  stack: { gap: 12 },
  card: {
    gap: 8,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.tile,
    borderWidth: 1.5,
    borderColor: colors.tileEdge,
  },
  cardTitle: { fontSize: 18, fontWeight: '800', color: colors.ink },
  note: { fontSize: 14, lineHeight: 20, color: colors.inkSoft },
  status: { fontSize: 13, fontWeight: '700', color: colors.wood },
  label: { marginTop: 4, fontSize: 14, fontWeight: '700', color: colors.ink },
  hint: { fontSize: 13, lineHeight: 18, color: colors.inkSoft },
  error: { fontSize: 14, fontWeight: '700', color: colors.tier.invalid },
  warning: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.tier.invalid },
  message: { fontSize: 14, textAlign: 'center', color: colors.ink },
  input: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.tileEdge,
    backgroundColor: colors.white,
    fontSize: 16,
    color: colors.ink,
  },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 2, borderColor: colors.wood },
  tabOn: { backgroundColor: colors.wood },
  tabText: { fontSize: 14, fontWeight: '700', color: colors.wood },
  tabTextOn: { color: colors.white },
  button: { alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderColor: colors.wood },
  buttonPrimary: { backgroundColor: colors.wood },
  buttonDanger: { backgroundColor: colors.tier.invalid, borderColor: colors.tier.invalid },
  buttonOff: { opacity: 0.45 },
  buttonText: { fontSize: 15, fontWeight: '700', color: colors.wood },
  buttonTextLight: { color: colors.white },
});
