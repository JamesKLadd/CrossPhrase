import { useEffect, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

const CHARS_PER_TICK = 2;
const TICK_MS = 24;

/** Text that types itself out, as if the owl were speaking. Screen readers get it all at once. */
export function Typewriter({
  text,
  still,
  style,
}: {
  text: string;
  /** Show the whole text straight away (reduced motion). */
  still: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const [typed, setTyped] = useState({ text: '', count: 0 });
  useEffect(() => {
    if (still) return;
    let count = 0;
    const timer = setInterval(() => {
      count += CHARS_PER_TICK;
      setTyped({ text, count });
      if (count >= text.length) clearInterval(timer);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [text, still]);

  const shown = still ? text : typed.text === text ? text.slice(0, typed.count) : '';
  return (
    <Text style={style} accessibilityLabel={text} accessibilityLiveRegion="polite">
      {shown}
      {/* Reserve the full text's space so the bubble doesn't grow as it types. */}
      <Text style={{ opacity: 0 }}>{text.slice(shown.length)}</Text>
    </Text>
  );
}
