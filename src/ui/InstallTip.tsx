import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { isStandaloneWebApp } from '../lib/build';
import { colors } from './theme';

const DISMISSED = 'crossphrase:v1:install-tip-dismissed';

/** Which phone the website is open on, if it's one that can add it to the home screen. */
function phone(): 'ios' | 'android' | null {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined' || isStandaloneWebApp()) return null;
  const ua = navigator.userAgent;
  // iPads ask for the desktop site, so they look like Macs with a touch screen.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return null;
}

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED) === '1';
  } catch {
    return false;
  }
}

/**
 * On the website in a phone's browser: how to add the game to the home
 * screen, where it opens full screen, and (on iPhone) where Safari won't clear
 * its saved progress after a week away.
 */
export function InstallTip() {
  const [device] = useState(phone);
  const [hidden, setHidden] = useState(dismissed);
  if (!device || hidden) return null;
  return (
    <View style={styles.tip} testID="install-tip">
      <Text style={styles.text}>
        {device === 'ios'
          ? 'Tip: tap Share, then “Add to Home Screen”, to play full screen. Safari can clear a website’s progress after a week away, but not a home-screen app’s.'
          : 'Tip: open the ⋮ menu and choose “Add to Home screen” to play full screen.'}
      </Text>
      <Pressable
        onPress={() => {
          setHidden(true);
          try {
            localStorage.setItem(DISMISSED, '1');
          } catch {}
        }}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Dismiss tip"
      >
        <Text style={styles.close}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tip: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.paperDeep,
  },
  text: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.ink },
  close: { fontSize: 16, fontWeight: '700', color: colors.inkSoft },
});
