import { memo, useEffect, useState } from 'react';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

// The judge: a bookish owl in reading glasses, drawn in vector shapes so it
// scales to any size. Placeholder art until a commissioned mascot replaces it.

export type OwlMood =
  /** Waiting, blinking now and then. */
  | 'idle'
  /** Judging: eyes up, one brow raised, head tilted. */
  | 'thinking'
  /** An OK line. */
  | 'pleased'
  /** A great line, or a cleared level. */
  | 'delighted'
  /** A poetic line: sparkles. */
  | 'dazzled'
  /** A rejected line or a failed level. */
  | 'disappointed';

const C = {
  body: '#9C7652',
  bodyDark: '#7A5A3C',
  belly: '#F3E3C7',
  bellyMark: '#D8BC92',
  face: '#EAD4AF',
  eye: '#FFFDF7',
  ink: '#2F2A24',
  beak: '#E9A23B',
  cheek: '#F2A7A0',
  sparkle: '#E9A23B',
};

const PUPIL_OFFSET: Record<OwlMood, [number, number]> = {
  idle: [0, 0],
  thinking: [2.5, -2.5],
  pleased: [0, 0.5],
  delighted: [0, 0],
  dazzled: [0, 0],
  disappointed: [0, 2.5],
};

function sparkle(cx: number, cy: number, s: number): string {
  return `M${cx} ${cy - s} Q${cx} ${cy} ${cx + s} ${cy} Q${cx} ${cy} ${cx} ${cy + s} Q${cx} ${cy} ${cx - s} ${cy} Q${cx} ${cy} ${cx} ${cy - s} Z`;
}

function Eye({ x, mood, blinking }: { x: number; mood: OwlMood; blinking: boolean }) {
  const happy = mood === 'delighted' || mood === 'dazzled';
  if (happy) {
    return <Path d={`M${x - 8} 47 Q${x} 37 ${x + 8} 47`} stroke={C.ink} strokeWidth={2.6} fill="none" strokeLinecap="round" />;
  }
  if (blinking) {
    return <Path d={`M${x - 9} 44 Q${x} 49 ${x + 9} 44`} stroke={C.ink} strokeWidth={2.4} fill="none" strokeLinecap="round" />;
  }
  const [dx, dy] = PUPIL_OFFSET[mood];
  return (
    <G>
      <Circle cx={x} cy={44} r={10.5} fill={C.eye} />
      <Circle cx={x + dx} cy={44 + dy} r={5} fill={C.ink} />
      <Circle cx={x + dx - 1.6} cy={42.4 + dy} r={1.6} fill={C.eye} />
      {mood === 'disappointed' && (
        // A heavy upper lid: unimpressed.
        <Path d={`M${x - 10.5} 44 A10.5 10.5 0 0 1 ${x + 10.5} 44 Z`} fill={C.face} stroke={C.ink} strokeWidth={1.2} />
      )}
    </G>
  );
}

const OwlArt = memo(function OwlArt({ mood, blinking }: { mood: OwlMood; blinking: boolean }) {
  const cheerful = mood === 'pleased' || mood === 'delighted' || mood === 'dazzled';
  const wingsUp = mood === 'delighted' || mood === 'dazzled';
  return (
    <Svg viewBox="0 0 100 100" width="100%" height="100%">
      {mood === 'dazzled' && (
        <G>
          <Path d={sparkle(11, 16, 6)} fill={C.sparkle} />
          <Path d={sparkle(89, 14, 4.5)} fill={C.sparkle} />
          <Path d={sparkle(93, 38, 3)} fill={C.sparkle} />
          <Path d={sparkle(6, 40, 3)} fill={C.sparkle} />
        </G>
      )}
      {/* Ear tufts */}
      <Path d="M24 32 L27 7 L41 22 Z" fill={C.bodyDark} />
      <Path d="M76 32 L73 7 L59 22 Z" fill={C.bodyDark} />
      {/* Wings, behind the body */}
      {wingsUp ? (
        <G>
          <Path d="M22 58 Q4 44 8 26 Q22 38 30 54 Z" fill={C.bodyDark} />
          <Path d="M78 58 Q96 44 92 26 Q78 38 70 54 Z" fill={C.bodyDark} />
        </G>
      ) : (
        <G>
          <Path d="M20 52 Q8 70 21 89 Q29 76 28 58 Z" fill={C.bodyDark} />
          <Path d="M80 52 Q92 70 79 89 Q71 76 72 58 Z" fill={C.bodyDark} />
        </G>
      )}
      {/* Body and belly */}
      <Ellipse cx={50} cy={58} rx={33} ry={36} fill={C.body} />
      <Ellipse cx={50} cy={72} rx={20} ry={20} fill={C.belly} />
      <Path d="M41 68 q3 3 6 0 M53 68 q3 3 6 0 M47 76 q3 3 6 0 M41 83 q3 3 6 0 M53 83 q3 3 6 0" stroke={C.bellyMark} strokeWidth={1.6} fill="none" strokeLinecap="round" />
      {/* Feet */}
      <Ellipse cx={41} cy={93} rx={6} ry={3} fill={C.beak} />
      <Ellipse cx={59} cy={93} rx={6} ry={3} fill={C.beak} />
      {/* Face */}
      <Circle cx={37} cy={44} r={15} fill={C.face} />
      <Circle cx={63} cy={44} r={15} fill={C.face} />
      {cheerful && (
        <G opacity={0.75}>
          <Circle cx={24} cy={55} r={3.6} fill={C.cheek} />
          <Circle cx={76} cy={55} r={3.6} fill={C.cheek} />
        </G>
      )}
      <Eye x={37} mood={mood} blinking={blinking} />
      <Eye x={63} mood={mood} blinking={blinking} />
      {/* Reading glasses */}
      <G stroke={C.ink} strokeWidth={2.4} fill="none">
        <Circle cx={37} cy={44} r={12.5} fill="rgba(255,255,255,0.12)" />
        <Circle cx={63} cy={44} r={12.5} fill="rgba(255,255,255,0.12)" />
        <Path d="M48.5 42 Q50 39.5 51.5 42" />
        <Path d="M24.5 42 L18 39 M75.5 42 L82 39" />
      </G>
      {(mood === 'thinking' || mood === 'dazzled') && (
        <Path d="M29 39 L33.5 34.5" stroke={C.eye} strokeWidth={2.2} strokeLinecap="round" />
      )}
      {/* Brows */}
      {mood === 'thinking' && (
        <Path d="M29 28 Q37 27 44 29 M56 26 Q63 21 70 25" stroke={C.ink} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      )}
      {mood === 'disappointed' && (
        <Path d="M27 26 L44 30 M73 26 L56 30" stroke={C.ink} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      )}
      {/* Beak: open in awe when dazzled */}
      {mood === 'dazzled' ? (
        <G>
          <Path d="M45.5 53 L54.5 53 L50 58 Z" fill={C.beak} />
          <Path d="M47 59.5 L53 59.5 L50 64 Z" fill={C.beak} />
        </G>
      ) : (
        <Path d="M45.5 53 L54.5 53 L50 61 Z" fill={C.beak} />
      )}
    </Svg>
  );
});

/**
 * The owl. `reaction` is a counter: each change plays the mood's reaction
 * (a hop when happy, a head shake when disappointed). `still` turns off the
 * idle bob and reactions, for reduced motion.
 */
export function Owl({
  size,
  mood = 'idle',
  reaction = 0,
  still = false,
}: {
  size: number;
  mood?: OwlMood;
  reaction?: number;
  still?: boolean;
}) {
  const [blinking, setBlinking] = useState(false);
  const bob = useSharedValue(0);
  const lift = useSharedValue(0);
  const tilt = useSharedValue(0);
  const scale = useSharedValue(1);

  // Blink every few seconds.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setBlinking(true);
        timer = setTimeout(() => {
          setBlinking(false);
          schedule();
        }, 140);
      }, 2500 + Math.random() * 3000);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  // A slow breathing bob while idle.
  useEffect(() => {
    if (still) {
      cancelAnimation(bob);
      bob.set(0);
      return;
    }
    const ease = Easing.inOut(Easing.sin);
    bob.set(
      withRepeat(
        withSequence(
          withTiming(-size * 0.025, { duration: 1300, easing: ease }),
          withTiming(0, { duration: 1300, easing: ease }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(bob);
  }, [still, size, bob]);

  // React to the mood.
  useEffect(() => {
    if (still) {
      tilt.set(0);
      return;
    }
    if (mood === 'disappointed') {
      tilt.set(
        withSequence(
          withTiming(-8, { duration: 70 }),
          withTiming(8, { duration: 120 }),
          withTiming(-5, { duration: 100 }),
          withTiming(0, { duration: 100 }),
        ),
      );
      return;
    }
    tilt.set(withTiming(mood === 'thinking' ? 9 : 0, { duration: 250 }));
    if (mood === 'pleased' || mood === 'delighted' || mood === 'dazzled') {
      const height = mood === 'pleased' ? 0.06 : 0.14;
      lift.set(withSequence(withTiming(-size * height, { duration: 130 }), withSpring(0, { damping: 9 })));
      scale.set(withSequence(withTiming(1.07, { duration: 130 }), withSpring(1, { damping: 9 })));
    }
  }, [mood, reaction, still, size, lift, tilt, scale]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: bob.get() + lift.get() },
      { rotate: `${tilt.get()}deg` },
      { scale: scale.get() },
    ],
  }));

  return (
    <Animated.View
      style={[{ width: size, height: size }, style]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <OwlArt mood={mood} blinking={blinking && mood !== 'delighted' && mood !== 'dazzled'} />
    </Animated.View>
  );
}
