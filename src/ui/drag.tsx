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
//
// Every position here comes from measureInWindow: where the picked-up tile
// is, plus how far the finger has moved since. (Mixing in the gesture's own
// absolute coordinates put the dragged word off to one side on phones,
// because the two don't share an origin there.)

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
  /**
   * `tile` is the view being dragged; `local` is where the finger is on it and
   * `moved` how far the finger had already travelled when the drag began.
   */
  start(state: DragState, tile: ViewRef | null, local: Point, moved: Point): void;
  /** `moved`: how far the finger has travelled since it touched down. */
  move(moved: Point): void;
  end(moved: Point): void;
}

interface Point {
  x: number;
  y: number;
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
  /** Where the finger touched down, in window coordinates, once the tile is measured. */
  const origin = useRef<Point | null>(null);
  const lastMoved = useRef<Point>({ x: 0, y: 0 });
  const onDropRef = useRef(onDrop);
  useLayoutEffect(() => {
    onDropRef.current = onDrop;
  });

  const [view, setView] = useState<DragView>({ dragging: null, hoverZone: null });
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const rootWidth = useSharedValue(0);
  const rootHeight = useSharedValue(0);
  const shown = useSharedValue(0);

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
      start(state, tile, local, moved) {
        // Re-measure everything; layout can shift as the hand changes size.
        root.current?.measureInWindow((rx, ry, width, height) => {
          originX.set(rx);
          originY.set(ry);
          rootWidth.set(width);
          rootHeight.set(height);
        });
        for (const [id, zoneView] of zones.current) {
          zoneView.measureInWindow((zx, zy, width, height) =>
            rects.current.set(id, { x: zx, y: zy, width, height }),
          );
        }
        origin.current = null;
        lastMoved.current = moved;
        shown.set(0);
        tile?.measureInWindow((tx, ty) => {
          if (current.current !== state) return;
          origin.current = { x: tx + local.x - moved.x, y: ty + local.y - moved.y };
          x.set(origin.current.x + lastMoved.current.x);
          y.set(origin.current.y + lastMoved.current.y);
          shown.set(1);
        });
        current.current = state;
        setView({ dragging: state, hoverZone: null });
      },
      move(moved) {
        lastMoved.current = moved;
        if (!origin.current) return;
        const px = origin.current.x + moved.x;
        const py = origin.current.y + moved.y;
        x.set(px);
        y.set(py);
        const hoverZone = hitTest(px, py);
        setView((v) => (v.hoverZone === hoverZone ? v : { ...v, hoverZone }));
      },
      end(moved) {
        const state = current.current;
        const start = origin.current;
        current.current = null;
        origin.current = null;
        setView({ dragging: null, hoverZone: null });
        if (state) {
          onDropRef.current(state.source, start ? hitTest(start.x + moved.x, start.y + moved.y) : null);
        }
      },
    };
  }, [originX, originY, rootWidth, rootHeight, shown, x, y]);

  /** Half the ghost, plus a little room, so it stops just inside the screen edge. */
  const half = (view.dragging?.size ?? 0) / 2 + 6;
  const ghostStyle = useAnimatedStyle(() => {
    // Keep the whole ghost on screen, however far the finger goes.
    const clamp = (v: number, max: number) => (max > 2 * half ? Math.min(Math.max(v, half), max - half) : v);
    return {
      opacity: shown.get(),
      transform: [
        { translateX: clamp(x.get() - originX.get(), rootWidth.get()) },
        { translateY: clamp(y.get() - originY.get(), rootHeight.get()) },
      ],
    };
  });

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
  /** Attach to the tile's view, so a drag can find where the tile is. */
  const ref = useRef<ViewRef>(null);
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });

  // Event handlers read the latest props, so the gesture itself only changes
  // when `enabled` does (rebuilding it mid-drag would cancel the drag).
  const handleStart = useCallback(
    (local: Point, moved: Point) => {
      const { source, word, size } = latest.current;
      start({ source, word, size }, ref.current, local, moved);
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
      .onStart((e) => handleStart({ x: e.x, y: e.y }, { x: e.translationX, y: e.translationY }))
      .onUpdate((e) => move({ x: e.translationX, y: e.translationY }))
      .onEnd((e) => end({ x: e.translationX, y: e.translationY }));
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

  return { ref, gesture, isDragged: dragging !== null && sameSource(dragging.source, props.source) };
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
