import 'expo-sqlite/localStorage/install';

import type { CachedVerdict } from '../core/game';
import seedVerdicts from '../data/seedVerdicts.json';
import { supabase } from '../lib/supabase';
import { createLabelStore } from './labelStore';
import { createPcRemote } from './pcRemote';
import { createJudgeService } from './service';
import { createSupabaseRemote } from './supabaseRemote';
import { createVerdictStore } from './verdictStore';

export type { Label } from './labelStore';
export type { JudgeMode } from './service';

const pcJudgeUrl = process.env.EXPO_PUBLIC_JUDGE_URL;

/**
 * The bigger judge, when one is configured in .env.local: the free PC judge
 * (EXPO_PUBLIC_JUDGE_URL) or, if that isn't set, the Claude judge on
 * Supabase. Without either, the built-in judge does all the judging.
 */
const remote = pcJudgeUrl
  ? createPcRemote(pcJudgeUrl)
  : supabase
    ? createSupabaseRemote(supabase)
    : null;

export const judgeService = createJudgeService(
  remote,
  createVerdictStore(localStorage, seedVerdicts as Record<string, CachedVerdict>),
  createLabelStore(localStorage),
);
