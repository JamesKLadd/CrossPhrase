import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  adminStats,
  getConfig,
  setConfig,
  type ActivePlayersRow,
  type DailyStatsRow,
  type EconomyStatsRow,
  type FeedbackRow,
  type FunnelRow,
  type LevelStatsRow,
  type Overview,
  type StatsView,
} from '../../admin';
import { economyOverrides, tweakOf, withTweak } from '../../admin/configEdit';
import { bandFor, LEVEL_BANDS } from '../../core/config';
import { DEFAULT_ECONOMY, parseEconomy, type EconomyConfig } from '../../core/economy';
import { starThresholds } from '../../core/scoring';
import { parseTuning, tuneLevel, type LevelTweak } from '../../core/tuning';
import { LEVELS } from '../../data/levels';
import { remoteConfig } from '../../remote';
import { AdminButton, adminStyles, BarRow, Card, Meter, StatTile, Stepper } from '../../ui/AdminParts';
import { DevGate } from '../../ui/PinGate';
import { colors } from '../../ui/theme';

type Tab = 'overview' | 'levels' | 'economy' | 'feedback';
const TABS: { tab: Tab; label: string }[] = [
  { tab: 'overview', label: 'Players' },
  { tab: 'levels', label: 'Levels' },
  { tab: 'economy', label: 'Economy' },
  { tab: 'feedback', label: 'Feedback' },
];

/** The admin's dashboard: play stats from the backend, and tuning that reaches players without a new build. */
export default function StatsScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.column}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
          <Text style={styles.title} accessibilityRole="header">
            Dashboard
          </Text>
          <View style={styles.spacer} />
        </View>
        <DevGate>
          <Dashboard />
        </DevGate>
      </ScrollView>
    </SafeAreaView>
  );
}

function Dashboard() {
  const [tab, setTab] = useState<Tab>('overview');
  return (
    <View style={styles.stack}>
      <View style={styles.tabs} accessibilityRole="tablist">
        {TABS.map(({ tab: t, label }) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
            style={[styles.tab, tab === t && styles.tabOn]}
            testID={`stats-tab-${t}`}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {tab === 'overview' && <OverviewTab />}
      {tab === 'levels' && <LevelsTab />}
      {tab === 'economy' && <EconomyTab />}
      {tab === 'feedback' && <FeedbackTab />}
    </View>
  );
}

/** One of the backend's stats views, loaded when shown. */
function useStats<T>(view: StatsView): { data: T | null; error: string | null; reload: () => void } {
  const [state, setState] = useState<{ data: T | null; error: string | null }>({ data: null, error: null });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    adminStats<T>(view).then(
      (data) => !cancelled && setState({ data, error: null }),
      (e: Error) => !cancelled && setState({ data: null, error: e.message }),
    );
    return () => {
      cancelled = true;
    };
  }, [view, version]);
  return { ...state, reload: useCallback(() => setVersion((v) => v + 1), []) };
}

function Loading<T>({ data, error, children }: { data: T | null; error: string | null; children: (data: T) => React.ReactNode }) {
  if (error) return <Text style={adminStyles.error}>{`Couldn't load: ${error}`}</Text>;
  if (data === null) return <ActivityIndicator color={colors.wood} />;
  return <>{children(data)}</>;
}

const percent = (share: number | null) => (share === null ? '–' : `${Math.round(share * 100)}%`);
const shortDay = (day: string) =>
  new Date(`${day.slice(0, 10)}T12:00:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
const ratings = (r: { rated_easy: number; rated_right: number; rated_hard: number }) =>
  `😴${r.rated_easy} 🙂${r.rated_right} 😤${r.rated_hard}`;

function OverviewTab() {
  const overview = useStats<Overview>('overview');
  const active = useStats<ActivePlayersRow[]>('active_players');
  const dailies = useStats<DailyStatsRow[]>('daily_stats');
  return (
    <View style={styles.stack}>
      <Loading {...overview}>
        {(o) => (
          <View style={styles.tiles} testID="stats-overview">
            <StatTile label="players ever" value={o.players} />
            <StatTile label="accounts" value={o.accounts} />
            <StatTile label="played today" value={o.active_today} />
            <StatTile label="played this week" value={o.active_week} />
            <StatTile label="games this week" value={o.games_week} />
            <StatTile label="feedback this week" value={o.feedback_week} />
            <StatTile label="corrections to review ›" value={o.labels_pending} onPress={() => router.push('/dev/review')} />
          </View>
        )}
      </Loading>
      <Card title="Players per day">
        <Loading {...active}>
          {(rows) =>
            rows.length === 0 ? (
              <Text style={adminStyles.empty}>No play stats yet.</Text>
            ) : (
              <Table
                head={['Day', 'Players', 'Sessions', 'Games']}
                rows={rows.slice(0, 14).map((r) => [shortDay(r.day), r.players, r.sessions, r.games])}
              />
            )
          }
        </Loading>
      </Card>
      <Card title="Daily puzzles">
        <Loading {...dailies}>
          {(rows) =>
            rows.length === 0 ? (
              <Text style={adminStyles.empty}>Nobody has played a daily puzzle yet.</Text>
            ) : (
              <Table
                head={['Day', 'Players', 'Won', 'Lost', 'Avg win', 'Shares', 'Ratings']}
                widths={[100, 60, 44, 44, 64, 56, 120]}
                rows={rows.slice(0, 14).map((r) => [
                  shortDay(r.day),
                  r.players,
                  r.wins,
                  r.losses,
                  r.avg_winning_score ?? '–',
                  r.shares,
                  ratings(r),
                ])}
              />
            )
          }
        </Loading>
      </Card>
    </View>
  );
}

/** A plain table: the header row in muted ink, then the rows. Scrolls sideways when it's wider than the screen. */
function Table({ head, rows, widths }: { head: string[]; rows: (string | number)[][]; widths?: number[] }) {
  const width = (i: number) => (widths?.[i] ? { width: widths[i] } : null);
  return (
    <ScrollView horizontal>
      <View>
        <View style={styles.tr}>
          {head.map((h, i) => (
            <Text key={i} style={[adminStyles.th, styles.cell, i === 0 && styles.firstCell, width(i)]} numberOfLines={1}>
              {h}
            </Text>
          ))}
        </View>
        {rows.map((row, r) => (
          <View key={r} style={[styles.tr, r % 2 === 0 && styles.trAlt]}>
            {row.map((value, i) => (
              <Text key={i} style={[adminStyles.td, styles.cell, i === 0 && styles.firstCell, width(i)]} numberOfLines={1}>
                {value}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

/** A level is flagged hard once enough people have finished it and most lost or called it too hard. */
function isHard(r: LevelStatsRow): boolean {
  const finished = r.wins + r.losses;
  return finished >= 5 && ((r.fail_rate ?? 0) > 0.5 || r.rated_hard > r.rated_right + r.rated_easy);
}

function LevelsTab() {
  const stats = useStats<LevelStatsRow[]>('level_stats');
  const funnel = useStats<FunnelRow[]>('level_funnel');
  const [hardestFirst, setHardestFirst] = useState(false);
  const [tuning, setTuning] = useState<{ number: number; row?: LevelStatsRow } | null>(null);
  const [pick, setPick] = useState(11);

  return (
    <View style={styles.stack}>
      <Card title="Tune a level">
        <Text style={adminStyles.note}>
          Tap a level below, or pick any level after the tutorial. Changes reach players the next time they open the game.
        </Text>
        <Stepper label="Level" value={pick} step={1} min={LEVEL_BANDS[0].from} max={LEVELS.length} onChange={setPick} testID="pick-level" />
        <AdminButton label={`Tune level ${pick}`} onPress={() => setTuning({ number: pick })} testID="tune-picked" />
      </Card>

      <Card title="How each level plays">
        <View style={styles.row}>
          <Text style={[adminStyles.note, styles.flex]}>Levels with at least one game. ⚠ = most players lose it or call it too hard.</Text>
          <Pressable onPress={() => setHardestFirst((h) => !h)} accessibilityRole="button" testID="sort-levels">
            <Text style={styles.link}>{hardestFirst ? 'By number' : 'Hardest first'}</Text>
          </Pressable>
        </View>
        <Loading {...stats}>
          {(rows) =>
            rows.length === 0 ? (
              <Text style={adminStyles.empty}>No level games yet.</Text>
            ) : (
              [...rows]
                .sort((a, b) => (hardestFirst ? (b.fail_rate ?? -1) - (a.fail_rate ?? -1) : a.number - b.number))
                .map((r) => (
                  <Pressable
                    key={r.number}
                    onPress={() => setTuning({ number: r.number, row: r })}
                    style={styles.levelRow}
                    accessibilityRole="button"
                    accessibilityLabel={`Level ${r.number}: fail rate ${percent(r.fail_rate)}. Tap to tune.`}
                    testID={`level-stats-${r.number}`}
                  >
                    <View style={styles.levelHead}>
                      <Text style={adminStyles.strong}>
                        {isHard(r) ? '⚠ ' : ''}
                        {r.number}. {LEVELS[r.number - 1]?.name ?? r.level}
                        {isHard(r) ? '  (hard)' : ''}
                      </Text>
                      <Text style={adminStyles.td}>{percent(r.fail_rate)} lost</Text>
                    </View>
                    <Meter value={r.fail_rate ?? 0} />
                    <Text style={adminStyles.note}>
                      {r.players} players · {r.wins} won · {r.losses} lost · {r.quits} quit
                      {r.submits_to_win !== null ? ` · ${r.submits_to_win} submits to win` : ''}
                      {r.avg_stars !== null ? ` · ${r.avg_stars}★` : ''}
                      {r.boosted ? ` · ${r.boosted} boosted` : ''} · {ratings(r)}
                    </Text>
                  </Pressable>
                ))
            )
          }
        </Loading>
      </Card>

      <Card title="How far players get">
        <Text style={adminStyles.note}>Players who have started each level. A sudden drop is a wall.</Text>
        <Loading {...funnel}>
          {(rows) =>
            rows.length === 0 ? (
              <Text style={adminStyles.empty}>No level games yet.</Text>
            ) : (
              rows.map((r) => (
                <BarRow key={r.number} label={String(r.number)} value={r.players} max={Math.max(...rows.map((x) => x.players))} />
              ))
            )
          }
        </Loading>
      </Card>

      {tuning && <TuneSheet number={tuning.number} row={tuning.row} onClose={() => setTuning(null)} />}
    </View>
  );
}

const starsLabel = (scale: number) => `${Math.round(scale * 100)}%`;
const swapsLabel = (swaps: number) => (swaps > 0 ? `+${swaps}` : String(swaps));

/** Easier or harder: a level's and its band's star targets and swaps, written to the remote config. */
function TuneSheet({ number, row, onClose }: { number: number; row?: LevelStatsRow; onClose: () => void }) {
  const level = LEVELS[number - 1];
  const band = bandFor(number);
  const bandIndex = LEVEL_BANDS.indexOf(band);
  const bandEnd = (LEVEL_BANDS[bandIndex + 1]?.from ?? LEVELS.length + 1) - 1;
  const [raw, setRaw] = useState<unknown>(undefined);
  const [own, setOwn] = useState<LevelTweak>({});
  const [ofBand, setOfBand] = useState<LevelTweak>({});
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getConfig().then(
      (config) => {
        if (cancelled) return;
        setRaw(config.tuning ?? {});
        setOwn(tweakOf(config.tuning, 'levels', level.id));
        setOfBand(tweakOf(config.tuning, 'bands', band.name));
      },
      (e: Error) => !cancelled && setStatus(`Couldn't load the tuning: ${e.message}`),
    );
    return () => {
      cancelled = true;
    };
  }, [level.id, band.name]);

  const edited = raw === undefined ? undefined : withTweak(withTweak(raw, 'levels', level.id, own), 'bands', band.name, ofBand);
  const before = raw === undefined ? level : tuneLevel(level, number, parseTuning(raw));
  const after = edited === undefined ? level : tuneLevel(level, number, parseTuning(edited));
  const plain = starThresholds(level);

  const save = async () => {
    if (!edited) return;
    setBusy(true);
    try {
      await setConfig('tuning', edited);
      await remoteConfig.refresh();
      setRaw(edited);
      setStatus('Saved. Players get it the next time they open the game.');
    } catch (e) {
      setStatus(`Couldn't save: ${(e as Error).message}`);
    }
    setBusy(false);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent}>
          <Text style={styles.sheetTitle}>
            {number}. {level.name}
          </Text>
          {row && (
            <Text style={adminStyles.note}>
              {row.players} players · {percent(row.fail_rate)} lost · {ratings(row)}
            </Text>
          )}
          <Text style={adminStyles.note}>
            As made: star targets {plain.join(' / ')}, {level.swaps} swaps.{'\n'}
            Now: {starThresholds(before).join(' / ')}, {before.swaps} swaps.
          </Text>
          {number < LEVEL_BANDS[0].from ? (
            <Text style={adminStyles.note}>
              The tutorial (levels 1–{LEVEL_BANDS[0].from - 1}) is never tuned remotely: edit src/data/tutorial.ts.
            </Text>
          ) : raw === undefined && !status ? (
            <ActivityIndicator color={colors.wood} />
          ) : (
            <>
              <Card title="This level">
                <Stepper
                  label="Star targets"
                  value={own.stars ?? 1}
                  format={starsLabel}
                  step={0.05}
                  min={0.5}
                  max={2}
                  onChange={(stars) => setOwn((t) => ({ ...t, stars }))}
                  testID="tune-level-stars"
                />
                <Stepper
                  label="Extra swaps"
                  value={own.swaps ?? 0}
                  format={swapsLabel}
                  step={1}
                  min={-3}
                  max={5}
                  onChange={(swaps) => setOwn((t) => ({ ...t, swaps }))}
                  testID="tune-level-swaps"
                />
              </Card>
              <Card title={`Its band: ${band.name}, levels ${band.from}–${bandEnd}`}>
                <Stepper
                  label="Star targets"
                  value={ofBand.stars ?? 1}
                  format={starsLabel}
                  step={0.05}
                  min={0.5}
                  max={2}
                  onChange={(stars) => setOfBand((t) => ({ ...t, stars }))}
                  testID="tune-band-stars"
                />
                <Stepper
                  label="Extra swaps"
                  value={ofBand.swaps ?? 0}
                  format={swapsLabel}
                  step={1}
                  min={-3}
                  max={5}
                  onChange={(swaps) => setOfBand((t) => ({ ...t, swaps }))}
                  testID="tune-band-swaps"
                />
              </Card>
              <Text style={adminStyles.td} testID="tune-preview">
                After saving: star targets {starThresholds(after).join(' / ')}, {after.swaps} swaps.
              </Text>
              <AdminButton label={busy ? 'Saving…' : 'Save'} primary disabled={busy || !edited} onPress={save} testID="tune-save" />
            </>
          )}
          {status && (
            <Text style={adminStyles.note} testID="tune-status">
              {status}
            </Text>
          )}
          <AdminButton label="Close" onPress={onClose} testID="tune-close" />
        </ScrollView>
      </View>
    </Modal>
  );
}

const ECONOMY_EVENT: Record<string, string> = {
  booster: 'Booster',
  hearts_refill: 'Hearts refilled',
  out_of_hearts: 'Ran out of hearts',
};

function EconomyTab() {
  const stats = useStats<EconomyStatsRow[]>('economy_stats');
  return (
    <View style={styles.stack}>
      <Card title="What players do with feathers">
        <Loading {...stats}>
          {(rows) =>
            rows.length === 0 ? (
              <Text style={adminStyles.empty}>No boosters bought or hearts refilled yet.</Text>
            ) : (
              <Table
                head={['What', 'Times', 'Players', 'Feathers']}
                widths={[150, 54, 60, 70]}
                rows={rows.map((r) => [
                  `${ECONOMY_EVENT[r.name] ?? r.name}${r.kind ? `: ${r.kind}` : ''}`,
                  r.times,
                  r.players,
                  r.feathers,
                ])}
              />
            )
          }
        </Loading>
      </Card>
      <EconomyEditor />
    </View>
  );
}

function EconomyEditor() {
  const [draft, setDraft] = useState<EconomyConfig | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getConfig().then(
      (config) => !cancelled && setDraft(parseEconomy(config.economy)),
      (e: Error) => !cancelled && setStatus(`Couldn't load the economy: ${e.message}`),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (!draft) {
    return <Card title="Economy settings">{status ? <Text style={adminStyles.error}>{status}</Text> : <ActivityIndicator color={colors.wood} />}</Card>;
  }
  const set = (change: (c: EconomyConfig) => EconomyConfig) => {
    setDraft((d) => d && change(d));
    setStatus(null);
  };
  const lives = (changes: Partial<EconomyConfig['lives']>) => set((c) => ({ ...c, lives: { ...c.lives, ...changes } }));
  const rewards = (changes: Partial<EconomyConfig['rewards']>) => set((c) => ({ ...c, rewards: { ...c.rewards, ...changes } }));
  const cost = (kind: 'hint' | 'swaps' | 'wildcard' | 'submit', value: number) =>
    set((c) => ({ ...c, boosters: { ...c.boosters, [kind]: { ...c.boosters[kind], cost: value } } }));

  const save = async () => {
    setBusy(true);
    try {
      await setConfig('economy', economyOverrides(draft));
      await remoteConfig.refresh();
      setStatus('Saved. Players get it the next time they open the game.');
    } catch (e) {
      setStatus(`Couldn't save: ${(e as Error).message}`);
    }
    setBusy(false);
  };

  return (
    <Card title="Economy settings">
      <Text style={adminStyles.note}>Only what differs from the defaults in code is saved.</Text>
      <View style={styles.switchRow}>
        <Text style={styles.flex}>Hearts</Text>
        <Switch
          value={draft.lives.enabled}
          onValueChange={(enabled) => lives({ enabled })}
          trackColor={{ true: colors.wood, false: colors.tileEdge }}
          thumbColor={colors.white}
          {...{ activeThumbColor: colors.white }}
          testID="economy-hearts"
        />
      </View>
      <Stepper label="Most hearts" value={draft.lives.max} step={1} min={1} max={20} onChange={(max) => lives({ max })} />
      <Stepper
        label="Minutes per heart"
        value={draft.lives.refillMinutes}
        step={5}
        min={5}
        max={240}
        onChange={(refillMinutes) => lives({ refillMinutes })}
        testID="economy-refill-minutes"
      />
      <Stepper label="Refill all (🪶)" value={draft.lives.refillCost} step={5} min={0} max={500} onChange={(refillCost) => lives({ refillCost })} />
      <Stepper label="🪶 per new star" value={draft.rewards.perNewStar} step={1} min={0} max={50} onChange={(perNewStar) => rewards({ perNewStar })} />
      <Stepper label="🪶 per daily win" value={draft.rewards.dailyWin} step={1} min={0} max={100} onChange={(dailyWin) => rewards({ dailyWin })} />
      <Stepper label="🪶 per zen board" value={draft.rewards.zenBoard} step={1} min={0} max={20} onChange={(zenBoard) => rewards({ zenBoard })} />
      <View style={styles.switchRow}>
        <Text style={styles.flex}>Boosters</Text>
        <Switch
          value={draft.boosters.enabled}
          onValueChange={(enabled) => set((c) => ({ ...c, boosters: { ...c.boosters, enabled } }))}
          trackColor={{ true: colors.wood, false: colors.tileEdge }}
          thumbColor={colors.white}
          {...{ activeThumbColor: colors.white }}
        />
      </View>
      <Stepper label="Hint (🪶)" value={draft.boosters.hint.cost} step={5} min={0} max={500} onChange={(v) => cost('hint', v)} testID="economy-hint" />
      <Stepper label={`+${draft.boosters.swaps.count} swaps (🪶)`} value={draft.boosters.swaps.cost} step={5} min={0} max={500} onChange={(v) => cost('swaps', v)} />
      <Stepper label="Wildcard (🪶)" value={draft.boosters.wildcard.cost} step={5} min={0} max={500} onChange={(v) => cost('wildcard', v)} />
      <Stepper label="One more submit (🪶)" value={draft.boosters.submit.cost} step={5} min={0} max={500} onChange={(v) => cost('submit', v)} />
      <AdminButton label={busy ? 'Saving…' : 'Save'} primary disabled={busy} onPress={save} testID="economy-save" />
      <AdminButton label="Back to the defaults" onPress={() => set(() => DEFAULT_ECONOMY)} />
      {status && (
        <Text style={adminStyles.note} testID="economy-status">
          {status}
        </Text>
      )}
    </Card>
  );
}

function FeedbackTab() {
  const feedback = useStats<FeedbackRow[]>('feedback');
  return (
    <Card title="Feedback">
      <Loading {...feedback}>
        {(rows) =>
          rows.length === 0 ? (
            <Text style={adminStyles.empty}>No feedback yet.</Text>
          ) : (
            rows.map((r, i) => (
              <View key={i} style={styles.feedback} testID={i === 0 ? 'feedback-first' : undefined}>
                <Text style={adminStyles.td}>{r.text}</Text>
                <Text style={adminStyles.note}>
                  {r.username ?? 'A guest'} · {new Date(r.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  {r.version ? ` · build ${r.version}` : ''}
                  {r.platform ? ` · ${r.platform}` : ''}
                </Text>
              </View>
            ))
          )
        }
      </Loading>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  column: { width: '100%', maxWidth: 640, alignSelf: 'center', padding: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center' },
  back: { width: 70, fontSize: 15, fontWeight: '700', color: colors.wood },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.ink },
  spacer: { width: 70 },
  stack: { gap: 12 },
  tabs: { flexDirection: 'row', gap: 6 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 12, borderWidth: 2, borderColor: colors.wood },
  tabOn: { backgroundColor: colors.wood },
  tabText: { fontSize: 13, fontWeight: '700', color: colors.wood },
  tabTextOn: { color: colors.white },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tr: { flexDirection: 'row', paddingVertical: 5 },
  trAlt: { backgroundColor: colors.cell },
  cell: { width: 64, paddingHorizontal: 4, textAlign: 'right' },
  firstCell: { width: 100, textAlign: 'left' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1, fontSize: 14, color: colors.ink },
  link: { fontSize: 14, fontWeight: '700', color: colors.wood },
  levelRow: { gap: 4, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.tileEdge },
  levelHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  feedback: { gap: 2, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.tileEdge },
  backdrop: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: 'rgba(47, 42, 36, 0.55)' },
  sheet: { flexGrow: 0, maxHeight: '100%', width: '100%', maxWidth: 480, alignSelf: 'center', borderRadius: 18, backgroundColor: colors.paper },
  sheetContent: { gap: 10, padding: 18 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: colors.ink },
});
