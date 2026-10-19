import 'expo-sqlite/localStorage/install';

import type { CachedVerdict } from '../core/game';
import seedVerdicts from '../data/seedVerdicts.json';
import { supabase } from '../lib/supabase';
import { createJudgeService } from './service';
import { createSupabaseRemote } from './supabaseRemote';
import { createVerdictStore } from './verdictStore';

export type { JudgeMode } from './service';

const store = createVerdictStore(
  localStorage,
  seedVerdicts as Record<string, CachedVerdict>,
);

/** The app's judge: the AI judge when a backend is configured, else the local rules. */
export const judgeService = createJudgeService(
  supabase ? createSupabaseRemote(supabase) : null,
  store,
);
