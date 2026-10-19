import { StyleSheet, Text, View } from 'react-native';

import { TIER_MULTIPLIER } from '../core/config';
import { entryTiles, objectiveProgress, phraseKey, type GameState } from '../core/game';
import { describeObjective } from '../core/objectives';
import { failedSubmitPenalty, starThresholds, tileValue } from '../core/scoring';
import type { ObjectiveResult } from '../core/types';
import { colors } from './theme';

/**
 * What the board would score if submitted now: judged lines at their tier,
 * unjudged ones as OK, plus bonus objectives met, minus penalties.
 */
export function estimateScore(state: GameState, objectives: ObjectiveResult[]): number {
  let total = 0;
  for (const entry of state.entries) {
    const tiles = entryTiles(state, entry);
    const filled = entry.cells.map((c) => state.board[c]).filter((t) => t !== null);
    const base = filled.reduce((sum, tile) => sum + tileValue(tile), 0);
    const tier = tiles ? (state.verdictCache[phraseKey(tiles.map((t) => t.word))]?.tier ?? 'ok') : 'ok';
    total += Math.round(base * TIER_MULTIPLIER[tier]);
  }
  const bonus = objectives.reduce((sum, o) => sum + (o.met ? o.objective.points : 0), 0);
  return Math.max(0, total + bonus - state.failedSubmits * failedSubmitPenalty(state.level));
}

/** The star targets as a progress bar, and the level's bonus objectives. */
export function LevelGoals({ state }: { state: GameState }) {
  const stars = starThresholds(state.level);
  const objectives = objectiveProgress(state);
  const score = estimateScore(state, objectives);
  const max = Math.round(stars[2] * 1.15);
  const at = (points: number) => `${Math.min(100, (points / max) * 100)}%` as const;
  const earned = stars.filter((t) => score >= t).length;

  return (
    <View style={styles.goals}>
      <View style={styles.barRow}>
        <Text style={styles.score} testID="score-estimate">
          {score}
        </Text>
        <View style={styles.bar}>
          <View style={[styles.fill, { width: at(score) }]} />
          {stars.map((threshold, i) => (
            <View key={i} style={[styles.tick, { left: at(threshold) }]}>
              <Text style={[styles.tickStar, i < earned && styles.tickStarEarned]}>★</Text>
              <Text style={styles.tickLabel}>{threshold}</Text>
            </View>
          ))}
        </View>
      </View>
      {objectives.length > 0 && (
        <View style={styles.objectives}>
          {objectives.map((o, i) => (
            <Text key={i} style={[styles.objective, o.met && styles.objectiveMet]}>
              {o.met ? '✓' : '○'} {describeObjective(o.objective)}
              {!o.met && o.objective.kind !== 'longWord' && o.objective.kind !== 'rareCrossing'
                ? ` (${o.have}/${o.need})`
                : ''}{' '}
              <Text style={styles.points}>+{o.objective.points}</Text>
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  goals: { gap: 6 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 12 },
  score: { minWidth: 34, fontSize: 18, fontWeight: '900', color: colors.ink, textAlign: 'right' },
  bar: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.paperDeep,
  },
  fill: { height: '100%', borderRadius: 5, backgroundColor: colors.selected },
  tick: { position: 'absolute', top: -5, alignItems: 'center', width: 30, marginLeft: -15 },
  tickStar: { fontSize: 16, lineHeight: 18, color: colors.starEmpty },
  tickStarEarned: { color: colors.star },
  tickLabel: { fontSize: 9, fontWeight: '700', color: colors.inkSoft },
  objectives: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  objective: {
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    fontSize: 12,
    color: colors.inkSoft,
    backgroundColor: colors.paperDeep,
  },
  objectiveMet: { color: colors.tier.great, fontWeight: '700' },
  points: { fontWeight: '800', color: colors.wood },
});
