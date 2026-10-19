import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentRef,
} from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import type { CellKey } from '../core/types';
import { displayWord } from '../core/words';
import { colors, wordFontSize } from './theme';

// Drag-and-drop for word tiles. Drop zones (board cells and the hand tray)
// register their views. On drop we hit-test the pointer against their
// on-screen rectangles. Taps still work, so tap-to-place is a fallback.

export type DragSource = { kind: 'hand'; tileId: number } | { kind: 'cell'; cell: CellKey };

export type ZoneId = 'hand' | `cell:${CellKey}`;

type ViewRef = ComponentRef<typeof View>;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DragState {
  source: DragSource;
  word: string;
  size: number;
}

interface DragActions {
  registerZone(id: ZoneId, view: ViewRef | null): void;
  start(state: DragState, x: number, y: number): void;
  move(x: number, y: number): void;
  end(x: number, y: number): void;
}

interface DragView {
  dragging: DragState | null;
  hoverZone: ZoneId | null;
}

// Actions are stable for the provider's lifetime, so gesture callbacks never
// hold a stale copy. The view state changes during a drag and re-renders tiles.
const ActionsContext = createContext<DragActions | null>(null);
const ViewContext = createContext<DragView>({ dragging: null, hoverZone: null });

function useActions(): DragActions {
  const actions = useContext(ActionsContext);
  if (!actions) throw new Error('Drag hooks must be used inside <DragProvider>');
  return actions;
}

function sameSource(a: DragSource, b: DragSource): boolean {
  return a.kind === 'hand'
    ? b.kind === 'hand' && a.tileId === b.tileId
    : b.kind === 'cell' && a.cell === b.cell;
}

export function DragProvider({
  onDrop,
  children,
}: {
  onDrop: (source: DragSource, zone: ZoneId | null) => void;
  children: React.ReactNode;
}) {
  const zones = useRef(new Map<ZoneId, ViewRef>());
  const rects = useRef(new Map<ZoneId, Rect>());
  const root = useRef<ViewRef>(null);
  const current = useRef<DragState | null>(null);
  const onDropRef = useRef(onDrop);
  useLayoutEffect(() => {
    onDropRef.current = onDrop;
  });

  const [view, setView] = useState<DragView>({ dragging: null, hoverZone: null });
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);

  const actions = useMemo<DragActions>(() => {
    const hitTest = (px: number, py: number): ZoneId | null => {
      // The smallest matching zone wins, so a cell beats the tray behind it.
      let best: ZoneId | null = null;
      let bestArea = Infinity;
      for (const [id, r] of rects.current) {
        if (px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height) {
          if (r.width * r.height < bestArea) {
            best = id;
            bestArea = r.width * r.height;
          }
        }
      }
      return best;
    };

    return {
      registerZone(id, zoneView) {
        if (zoneView) {
          zones.current.set(id, zoneView);
        } else {
          zones.current.delete(id);
          rects.current.delete(id);
        }
      },
      start(state, px, py) {
        // Re-measure everything; layout can shift as the hand changes size.
        root.current?.measureInWindow((rx, ry) => {
          originX.set(rx);
          originY.set(ry);
        });
        for (const [id, zoneView] of zones.current) {
          zoneView.measureInWindow((zx, zy, width, height) =>
            rects.current.set(id, { x: zx, y: zy, width, height }),
          );
        }
        x.set(px);
        y.set(py);
        current.current = state;
        setView({ dragging: state, hoverZone: null });
      },
      move(px, py) {
        x.set(px);
        y.set(py);
        const hoverZone = hitTest(px, py);
        setView((v) => (v.hoverZone === hoverZone ? v : { ...v, hoverZone }));
      },
      end(px, py) {
        const state = current.current;
        current.current = null;
        setView({ dragging: null, hoverZone: null });
        if (state) onDropRef.current(state.source, hitTest(px, py));
      },
    };
  }, [originX, originY, x, y]);

  const ghostStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.get() - originX.get() },
      { translateY: y.get() - originY.get() },
    ],
  }));

  const { dragging } = view;
  return (
    <ActionsContext.Provider value={actions}>
      <ViewContext.Provider value={view}>
        <View ref={root} style={styles.fill} collapsable={false}>
          {children}
          {dragging && (
            <Animated.View pointerEvents="none" style={[styles.ghostAnchor, ghostStyle]}>
              <View
                style={[
                  styles.ghost,
                  {
                    width: dragging.size,
                    height: dragging.size,
                    left: -dragging.size / 2,
                    top: -dragging.size / 2,
                  },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.ghostText, { fontSize: wordFontSize(dragging.word, dragging.size) }]}
                >
                  {displayWord(dragging.word)}
                </Text>
              </View>
            </Animated.View>
          )}
        </View>
      </ViewContext.Provider>
    </ActionsContext.Provider>
  );
}

/** Registers a view as a drop zone. Returns the ref to attach and whether a drag hovers it. */
export function useDropZone(id: ZoneId) {
  const { registerZone } = useActions();
  const { hoverZone } = useContext(ViewContext);
  const ref = useCallback((view: ViewRef | null) => registerZone(id, view), [id, registerZone]);
  useEffect(() => () => registerZone(id, null), [id, registerZone]);
  return { ref, hovered: hoverZone === id };
}

/** Pan to drag, tap to select. Wrap the tile in <GestureDetector gesture={gesture}>. */
export function useDraggable(props: {
  source: DragSource;
  word: string;
  size: number;
  enabled: boolean;
  onTap: () => void;
}) {
  const { start, move, end } = useActions();
  const { dragging } = useContext(ViewContext);
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });

  // Event handlers read the latest props, so the gesture itself only changes
  // when `enabled` does (rebuilding it mid-drag would cancel the drag).
  const handleStart = useCallback(
    (x: number, y: number) => {
      const { source, word, size } = latest.current;
      start({ source, word, size }, x, y);
    },
    [start],
  );
  const handleTap = useCallback(() => latest.current.onTap(), []);

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .enabled(props.enabled)
      .runOnJS(true)
      .minDistance(6)
      // These callbacks run when a finger moves, never during render, so
      // reading the latest props from a ref here is safe.
      // eslint-disable-next-line react-hooks/refs
      .onStart((e) => handleStart(e.absoluteX, e.absoluteY))
      .onUpdate((e) => move(e.absoluteX, e.absoluteY))
      .onEnd((e) => end(e.absoluteX, e.absoluteY));
    const tap = Gesture.Tap()
      .enabled(props.enabled)
      .runOnJS(true)
      // eslint-disable-next-line react-hooks/refs
      .onEnd((_e, success) => {
        if (success) handleTap();
      });
    // Whichever is recognised first wins: a tap never starts a drag.
    return Gesture.Race(pan, tap);
  }, [props.enabled, handleStart, handleTap, move, end]);

  return { gesture, isDragged: dragging !== null && sameSource(dragging.source, props.source) };
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  ghostAnchor: { position: 'absolute', left: 0, top: 0 },
  ghost: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: colors.tile,
    borderWidth: 2,
    borderColor: colors.selected,
    boxShadow: '0 4px 10px rgba(0, 0, 0, 0.25)',
    transform: [{ scale: 1.08 }],
  },
  ghostText: { color: colors.ink, fontWeight: '700' },
});
