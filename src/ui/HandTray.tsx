import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import type { Tile } from '../core/types';
import { useReduceMotion } from '../settings';
import { useDropZone } from './drag';
import { colors } from './theme';
import { WordTile } from './WordTile';

export const HAND_TILE_SIZE = 64;

/** The player's words. Also a drop zone, so a board word dragged here goes back to the hand. */
export function HandTray({
  hand,
  enabled,
  selectedTile,
  onTilePress,
}: {
  hand: Tile[];
  enabled: boolean;
  selectedTile: number | null;
  onTilePress: (tile: Tile) => void;
}) {
  const { ref, hovered } = useDropZone('hand');
  const still = useReduceMotion();

  return (
    <View
      ref={ref}
      testID="hand-tray"
      collapsable={false}
      style={[styles.tray, hovered && styles.trayHovered]}
    >
      {hand.map((tile) => (
        <Dealt key={tile.id} still={still}>
          <WordTile
            word={tile.word}
            size={HAND_TILE_SIZE}
            source={{ kind: 'hand', tileId: tile.id }}
            selected={selectedTile === tile.id}
            wildcard={tile.wildcard}
            enabled={enabled}
            onTap={() => onTilePress(tile)}
          />
        </Dealt>
      ))}
    </View>
  );
}

/** A tile that springs into the hand as it's dealt. */
function Dealt({ still, children }: { still: boolean; children: React.ReactNode }) {
  const scale = useSharedValue(still ? 1 : 0.4);
  useEffect(() => {
    if (!still) scale.set(withSpring(1, { damping: 11, stiffness: 180 }));
  }, [still, scale]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, scale.get() * 1.4),
    transform: [{ scale: scale.get() }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  tray: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 16,
    backgroundColor: colors.paperDeep,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  trayHovered: { borderColor: colors.selected },
});
