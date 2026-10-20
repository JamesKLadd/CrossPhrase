// Fills in the points of unsolved daily puzzles saved before they kept their
// points (they were stored as 0). Replays each run's stored moves with the
// game's own scoring, like the leaderboard server, and saves the points. Only
// unsolved runs still at 0 are touched; solves never are.
//
//   npm run rescore:dailies      (logs in as James, asks for the password)

import { dailyLevel } from '../src/data/dailies';
import { scoreRun } from '../src/server/scores';
import { adminSession } from './adminSession.mts';

const { supabase, username } = await adminSession();

const { data, error } = await supabase.rpc('admin_unscored_dailies');
if (error) {
  console.error(/Admins only/.test(error.message) ? `${username} isn't an admin account.` : `Couldn't read the runs: ${error.message}`);
  process.exit(1);
}

const rows = data as { user_id: string; day: string; actions: unknown }[];
let fixed = 0;
for (const row of rows) {
  const level = dailyLevel(row.day);
  const scored = level ? scoreRun(level, row.actions) : 'there is no daily puzzle that day';
  if (typeof scored === 'string') {
    console.warn(`${row.day}: skipped a run that doesn't replay (${scored}).`);
    continue;
  }
  if (scored.won) {
    // The built-in judge has changed since it was played; a saved result stands.
    console.warn(`${row.day}: skipped a run today's judge would pass; its result stands.`);
    continue;
  }
  if (scored.score === 0) continue;
  const { error: saveError } = await supabase.rpc('admin_set_unsolved_score', {
    p_user: row.user_id,
    p_day: row.day,
    p_score: scored.score,
  });
  if (saveError) console.warn(`${row.day}: couldn't save (${saveError.message}).`);
  else fixed++;
}
console.log(`${rows.length} unsolved daily runs at 0 points; filled in ${fixed}.`);
await supabase.auth.signOut({ scope: 'local' });
process.exit(0);
