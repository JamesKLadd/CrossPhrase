import { Platform } from 'react-native';

/** Which build this is: the commit the website was built from (set by the deploy workflow), or "dev". */
export const BUILD = (process.env.EXPO_PUBLIC_BUILD || 'dev').slice(0, 7);

/** Running as a web app added to the home screen (no browser bars). */
export function isStandaloneWebApp(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}
