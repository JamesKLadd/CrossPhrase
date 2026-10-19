import { StyleSheet, View } from 'react-native';

import type { Tile } from '../core/types';
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

  return (
    <View
      ref={ref}
      testID="hand-tray"
      collapsable={false}
      style={[styles.tray, hovered && styles.trayHovered]}
    >
      {hand.map((tile) => (
        <WordTile
          key={tile.id}
          word={tile.word}
          size={HAND_TILE_SIZE}
          source={{ kind: 'hand', tileId: tile.id }}
          selected={selectedTile === tile.id}
          enabled={enabled}
          onTap={() => onTilePress(tile)}
        />
      ))}
    </View>
  );
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
