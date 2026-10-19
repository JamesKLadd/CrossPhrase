import { useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { nextRandom } from '../core/rng';
import { colors } from './theme';

const PALETTE = [colors.selected, colors.tier.ok, colors.tier.great, colors.tier.poetic, colors.wood, '#F2A7A0'];

interface Piece {
  x: number;
  drift: number;
  size: number;
  color: string;
  delay: number;
  duration: number;
  spin: number;
  round: boolean;
}

function pieces(seed: number, count: number): Piece[] {
  let rng = seed * 7919 + 1;
  const next = () => {
    let r: number;
    [r, rng] = nextRandom(rng);
    return r;
  };
  return Array.from({ length: count }, () => ({
    x: next(),
    drift: (next() - 0.5) * 120,
    size: 6 + next() * 7,
    color: PALETTE[Math.floor(next() * PALETTE.length)],
    delay: next() * 350,
    duration: 1500 + next() * 1200,
    spin: (next() - 0.5) * 900,
    round: next() < 0.3,
  }));
}

function ConfettiPiece({ piece, width, height }: { piece: Piece; width: number; height: number }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(
      withDelay(piece.delay, withTiming(1, { duration: piece.duration, easing: Easing.in(Easing.quad) })),
    );
  }, [piece, progress]);
  const style = useAnimatedStyle(() => {
    const t = progress.get();
    return {
      opacity: t === 0 ? 0 : 1 - Math.max(0, t - 0.85) / 0.15,
      transform: [
        { translateX: piece.x * width + piece.drift * t },
        { translateY: -20 + t * (height + 40) },
        { rotate: `${piece.spin * t}deg` },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.piece,
        {
          width: piece.size,
          height: piece.round ? piece.size : piece.size * 0.5,
          borderRadius: piece.round ? piece.size / 2 : 1,
          backgroundColor: piece.color,
        },
        style,
      ]}
    />
  );
}

/** A shower of confetti each time `burst` goes up. Nothing while `burst` is 0. */
export function Confetti({ burst, count = 40 }: { burst: number; count?: number }) {
  const { width, height } = useWindowDimensions();
  const list = useMemo(() => (burst > 0 ? pieces(burst, count) : []), [burst, count]);
  if (list.length === 0) return null;
  return (
    <View pointerEvents="none" style={styles.layer} key={burst}>
      {list.map((piece, i) => (
        <ConfettiPiece key={i} piece={piece} width={width} height={height} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  piece: { position: 'absolute', left: 0, top: 0 },
});
