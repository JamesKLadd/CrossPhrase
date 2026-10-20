import grammarData from '../data/grammar.json';
import type { Pos } from './types';
import { isWord, wordInfo } from './words';

// A small grammar of real English lines, for checking that a board can be
// solved with phrases people would actually write (the level generator and
// its bot), for the owl's hints, and so the built-in judge never rejects a
// line that's plainly good English.
//
// A line is accepted when it parses as one of:
//   a sentence     the quiet owl reads   ·   she eats the warm toast slowly
//                  I will dance with you  ·  the tea is very hot  ·  I sing and she laughs
//   a command      eat the golden toast  ·  never wake the sleepy owl
//   a noun phrase  the quiet old owl  ·  a cup of sweet tea  ·  tea and toast  ·  the kitchen table
//   a place        under the quiet moon  ·  softly through the garden
// optionally starting with "oh". Subjects and verbs must agree ("she eats",
// "they eat", not "she eat" or "I eats"), "a" and "an" must suit the next
// word, and verbs that never take an object ("sleep", "glow") don't get one.
// Nouns may be read as singular or plural, as the game's rules allow, so
// "the owl sing" reads as "the owls sing". The strict mode the level bot uses
// only takes plain, natural English (see GrammarOptions). It checks grammar
// only, not whether a line is any good: that's the judge's job.

type Agr = '1sg' | '3sg' | 'pl' | 'any';

interface VerbForm {
  base: string;
  form: 'base' | 's' | 'past';
}

const MODALS = new Set(['will', 'can', 'might', 'must']);
/** Ordinary verbs by word. "will", "can" and co. are listed as verbs too, but they only ever help another verb. */
const VERBS: Record<string, VerbForm> = Object.fromEntries(
  Object.entries((grammarData as { verbs: Record<string, VerbForm> }).verbs).filter(([word]) => !MODALS.has(word)),
);
const SUBJECT_PRONOUNS: Record<string, Agr> = {
  i: '1sg',
  you: 'pl',
  we: 'pl',
  they: 'pl',
  he: '3sg',
  she: '3sg',
  it: '3sg',
  everyone: '3sg',
  nobody: '3sg',
};
const OBJECT_PRONOUNS = new Set(['me', 'you', 'us', 'them', 'it', 'her', 'everyone', 'nobody']);
/** Determiners that also stand alone ("this is warm"), with their number. */
const DEMONSTRATIVES: Record<string, Agr> = { this: '3sg', that: '3sg', these: 'pl', those: 'pl' };
const SINGULAR_DETS = new Set(['a', 'an', 'every', 'this', 'that']);
const PLURAL_DETS = new Set(['these', 'those']);
/** Adverbs that go before an adjective or another adverb ("very warm", "too slowly"). */
const DEGREE = new Set(['very', 'too']);
/** Adverbs that go before what they describe, never after a verb ("just eat", not "eat just"). */
const BEFORE_ONLY = new Set(['very', 'just', 'only', 'never', 'always']);
/** Degree adverbs that can also stand alone, but only last ("me too", not "too she eats"). */
const AFTER_ONLY = new Set(['too']);
/** Verbs that don't take an object ("sleep the toast" isn't English); they can still take a place. */
const VERBS_NEVER_WITH_OBJECT = new Set([
  'sleep', 'fall', 'laugh', 'wait', 'shine', 'glow', 'twinkle', 'drift', 'wander', 'gaze', 'blink',
  'soar', 'float', 'bloom', 'crawl', 'hop', 'wilt', 'yawn', 'sizzle', 'drip', 'dive', 'sparkle',
  'bob', 'buzz', 'wonder', 'howl', 'dream',
]);
/** Verbs that can take an object, but whose objects among the game's words almost never make sense ("dance the beach"). Strict mode only. */
const VERBS_RARELY_WITH_OBJECT = new Set(['dance', 'run', 'walk', 'fly', 'swim', 'sing']);
/** Verbs that need an object ("some sun will have" is unfinished). Strict mode only. */
const VERBS_NEED_OBJECT = new Set(['have', 'find', 'make', 'take', 'love', 'borrow']);
/** Words that can join two adjectives: "warm and sweet", "small but brave" (not "fluffy so golden"). */
const ADJ_JOINERS = new Set(['and', 'or', 'but']);

const has = (word: string, pos: Pos) => isWord(word) && wordInfo(word).pos.includes(pos);
const isAdj = (w: string) => has(w, 'adj');
const isNoun = (w: string) => has(w, 'noun');
const isDet = (w: string) => has(w, 'det');
const isPrep = (w: string) => has(w, 'prep');
const isConj = (w: string) => has(w, 'conj');
const isAdv = (w: string) => has(w, 'adv');
const startsWithVowel = (w: string) => /^[aeiou]/.test(w);

/** Does a finite verb agree with its subject? */
function agrees(word: string, agr: Agr): boolean {
  switch (word) {
    case 'is':
      return agr === '3sg' || agr === 'any';
    case 'are':
    case 'were':
      return agr === 'pl' || agr === 'any';
    case 'was':
      return agr !== 'pl';
    case 'be':
      return false;
  }
  if (MODALS.has(word)) return true;
  const verb = VERBS[word];
  if (!verb) return false;
  if (verb.form === 'past') return true;
  if (verb.form === 's') return agr === '3sg' || agr === 'any';
  return agr !== '3sg';
}

type Ends = number[];
const uniq = (ends: Ends) => [...new Set(ends)];

export interface GrammarOptions {
  /**
   * Only plain, natural English: the level bot plays these lines to show a
   * board has an answer people would write. Every noun has a determiner ("the
   * toast", not "toast") except a headline-style first word ("moon drifts
   * slowly", "book with a secret"), nouns are singular as in the word lists ("the owl
   * sings", not "the owl sing"), no noun describes another (most pairs of
   * game nouns, like "tea butter", are nonsense), verbs like "dance" take
   * no object and verbs like "have" need one, no word comes twice in a row ("my old old book") and no line
   * starts with "of". Off for the judge, which reads lines more generously.
   */
  strict?: boolean;
}

/** Parses one line of words. */
class Parser {
  constructor(
    private readonly w: readonly string[],
    private readonly strict: boolean,
  ) {}

  private at(i: number): string | undefined {
    return this.w[i];
  }

  /** An adjective, optionally "very" first: "very warm". */
  private adj(i: number): Ends {
    const word = this.at(i);
    if (word && DEGREE.has(word)) return this.at(i + 1) && isAdj(this.at(i + 1)!) ? [i + 2] : [];
    return word && isAdj(word) ? [i + 1] : [];
  }

  /** One adjective, or two joined by "and"/"or": "warm and sweet". */
  private adjPhrase(i: number): Ends {
    const ends = this.adj(i);
    const more: Ends = [];
    for (const end of ends) {
      if (this.at(end) && ADJ_JOINERS.has(this.at(end)!)) more.push(...this.adj(end + 1));
    }
    return uniq([...ends, ...more]);
  }

  /** An adverb, optionally "very" first: "very slowly". */
  private adv(i: number): Ends {
    const word = this.at(i);
    if (!word || !isAdv(word)) return [];
    if (DEGREE.has(word)) {
      const next = this.at(i + 1);
      return next && isAdv(next) && !DEGREE.has(next) ? [i + 2] : [];
    }
    return [i + 1];
  }

  /** A noun with what comes before and after it: "the warm sweet tea", "a cup of tea". Returns its number. */
  private nounGroup(i: number, bare = !this.strict): { end: number; agr: Agr }[] {
    const out: { end: number; agr: Agr }[] = [];
    const det = this.at(i);
    const starts: { at: number; agr: Agr }[] = bare ? [{ at: i, agr: this.strict ? '3sg' : 'any' }] : [];
    if (det && isDet(det)) {
      const agr: Agr = SINGULAR_DETS.has(det) ? '3sg' : PLURAL_DETS.has(det) ? 'pl' : 'any';
      // Strict: the game's nouns are all singular, so "these toast" is out and "my toast" is singular.
      if (!this.strict) starts.push({ at: i + 1, agr });
      else if (agr !== 'pl') starts.push({ at: i + 1, agr: '3sg' });
    }
    for (const { at, agr } of starts) {
      // Up to two adjectives before the noun.
      let positions = [at];
      const before = [at];
      for (let n = 0; n < 2; n++) {
        positions = uniq(positions.flatMap((p) => this.adjPhrase(p)));
        before.push(...positions);
      }
      // A noun can describe the noun after it: "the kitchen table", "a garden gnome".
      const heads = !this.strict
        ? uniq([...before, ...before.filter((p) => this.at(p) && isNoun(this.at(p)!)).map((p) => p + 1)])
        : before;
      for (const p of heads) {
        const noun = this.at(p);
        if (!noun || !isNoun(noun)) continue;
        if (at === i + 1) {
          // "a"/"an" must suit the word straight after it.
          const next = this.at(i + 1)!;
          if (det === 'a' && startsWithVowel(next)) continue;
          if (det === 'an' && !startsWithVowel(next)) continue;
        }
        out.push({ end: p + 1, agr });
        // "a cup of tea", "the owl in the tree"
        for (const end of this.pp(p + 1)) out.push({ end, agr });
      }
    }
    return out;
  }

  /** A noun phrase as a subject, with the number its verb must agree with. */
  private subject(i: number, bare = !this.strict): { end: number; agr: Agr }[] {
    const word = this.at(i);
    const one: { end: number; agr: Agr }[] = [...this.nounGroup(i, bare)];
    if (word && SUBJECT_PRONOUNS[word]) one.push({ end: i + 1, agr: SUBJECT_PRONOUNS[word] });
    if (word && DEMONSTRATIVES[word]) one.push({ end: i + 1, agr: DEMONSTRATIVES[word] });
    // "the owl and the cat", "you and I": always plural.
    const joined: { end: number; agr: Agr }[] = [];
    for (const first of one) {
      const conj = this.at(first.end);
      if (conj === 'and' || conj === 'or') {
        for (const second of this.subject(first.end + 1)) joined.push({ end: second.end, agr: conj === 'and' ? 'pl' : second.agr });
      }
    }
    return [...one, ...joined];
  }

  /** A noun phrase after a verb or preposition: "the toast", "me", "tea and toast". */
  private object(i: number, bare = !this.strict): Ends {
    const word = this.at(i);
    const one: Ends = this.nounGroup(i, bare).map((n) => n.end);
    if (word && (OBJECT_PRONOUNS.has(word) || DEMONSTRATIVES[word])) one.push(i + 1);
    const joined: Ends = [];
    for (const end of one) {
      const conj = this.at(end);
      if (conj === 'and' || conj === 'or') joined.push(...this.object(end + 1, bare));
    }
    return uniq([...one, ...joined]);
  }

  /** "under the quiet moon", "with me", "of tea" (a bare noun is fine after "of", even when strict). */
  private pp(i: number): Ends {
    const word = this.at(i);
    return word && isPrep(word) ? this.object(i + 1, word === 'of' || !this.strict) : [];
  }

  /** What follows "is"/"was"/"be": an adjective, a noun phrase or a place. */
  private predicate(i: number): Ends {
    const ends = [...this.adjPhrase(i), ...this.object(i), ...this.pp(i)];
    // "warm in the sun", "home too": a place or an adverb after it.
    const more = ends.flatMap((e) => [...this.pp(e), ...this.advAfter(e)]);
    return uniq([...ends, ...more]);
  }

  /** An adverb that can follow a verb or close a line: "slowly", "too", "very softly". */
  private advAfter(i: number): Ends {
    const word = this.at(i);
    if (!word || (BEFORE_ONLY.has(word) && !DEGREE.has(word))) return [];
    return AFTER_ONLY.has(word) ? [i + 1, ...this.adv(i)] : this.adv(i);
  }

  /** What follows a verb: an object, places, an adverb, "to" + verb, in that order. */
  private complements(verb: string, i: number): Ends {
    const base = VERBS[verb]?.base ?? verb;
    let ends: Ends = this.strict && VERBS_NEED_OBJECT.has(base) ? [] : [i];
    if (!VERBS_NEVER_WITH_OBJECT.has(base) && !(this.strict && VERBS_RARELY_WITH_OBJECT.has(base))) ends = uniq([...ends, ...this.object(i)]);
    // Up to two places or adverbs after it.
    for (let n = 0; n < 2; n++) {
      ends = uniq([...ends, ...ends.flatMap((e) => [...this.pp(e), ...this.advAfter(e)])]);
    }
    // "want to dance", "wait to see the moon"
    const infinitives = uniq([i, ...ends]).flatMap((e) => (this.at(e) === 'to' ? this.baseVerbPhrase(e + 1) : []));
    return uniq([...ends, ...infinitives]);
  }

  /** A verb in its base form with what follows: after "will", "to", "do", or as a command. */
  private baseVerbPhrase(i: number): Ends {
    const word = this.at(i);
    if (!word) return [];
    if (word === 'be') return this.predicate(i + 1);
    const verb = VERBS[word];
    if (!verb || verb.form !== 'base') return [];
    return this.complements(word, i + 1);
  }

  /** The verb part of a sentence, agreeing with the subject: "eats the toast", "will sing", "is warm". */
  private verbPhrase(i: number, agr: Agr): Ends {
    const out: Ends = [];
    // An adverb first: "slowly eats", "never sleeps".
    const starts = [i, ...this.adv(i).filter(() => !DEGREE.has(this.at(i)!))];
    for (const s of starts) {
      const word = this.at(s);
      if (!word) continue;
      if (MODALS.has(word)) {
        const after = [s + 1, ...this.adv(s + 1)];
        out.push(...after.flatMap((a) => this.baseVerbPhrase(a)));
      } else if (['is', 'are', 'was', 'were'].includes(word)) {
        if (agrees(word, agr)) out.push(...this.predicate(s + 1), ...this.adv(s + 1).flatMap((a) => this.predicate(a)));
      } else if (VERBS[word] && agrees(word, agr)) {
        out.push(...this.complements(word, s + 1));
        // "does dance", "do eat"
        if (VERBS[word].base === 'do') out.push(...this.baseVerbPhrase(s + 1));
      }
    }
    // "sings and dances"
    const joined = out.flatMap((e) => (this.at(e) === 'and' || this.at(e) === 'or' ? this.verbPhrase(e + 1, agr) : []));
    return uniq([...out, ...joined]);
  }

  /** `first`: the line starts here, so even strictly a bare noun can lead ("moon drifts slowly"). */
  private sentence(i: number, first = false): Ends {
    const starts = [i, ...this.adv(i)];
    const ends = starts.flatMap((s) =>
      this.subject(s, !this.strict || (first && s === i)).flatMap((subj) => this.verbPhrase(subj.end, subj.agr)),
    );
    // "I sing and she laughs", "the moon glows but the owl sleeps"
    const joined = ends.flatMap((e) => (this.at(e) && isConj(this.at(e)!) ? this.sentence(e + 1) : []));
    return uniq([...ends, ...joined]);
  }

  private command(i: number): Ends {
    const starts = [i, ...this.adv(i)];
    const ends = starts.flatMap((s) => this.baseVerbPhrase(s));
    const joined = ends.flatMap((e) => (this.at(e) === 'and' || this.at(e) === 'or' ? this.command(e + 1) : []));
    return uniq([...ends, ...joined]);
  }

  private place(i: number): Ends {
    const starts = [i, ...this.adv(i)].filter((s) => !(this.strict && this.at(s) === 'of'));
    const ends = starts.flatMap((s) => this.pp(s));
    return uniq([...ends, ...ends.flatMap((e) => this.pp(e))]);
  }

  /** True if the whole line parses. */
  line(): boolean {
    const start = this.at(0) === 'oh' ? 1 : 0;
    if (start >= this.w.length) return false;
    const ends = [
      ...this.sentence(start, true),
      ...this.command(start),
      // A noun phrase line must hold a noun ("the quiet owl"), not just pronouns; strictly, so must what's joined to it ("tea and toast", not "tea and it").
      ...this.nounGroup(start, true)
        .map((n) => n.end)
        .flatMap((e) => [
          e,
          ...(this.at(e) === 'and' || this.at(e) === 'or'
            ? this.strict
              ? this.nounGroup(e + 1).map((n) => n.end)
              : this.object(e + 1)
            : []),
        ]),
      ...this.place(start),
    ];
    return ends.includes(this.w.length);
  }
}

const memo = new Map<string, boolean>();

/** True if a line of game words reads as grammatical English (see the top of this file). */
export function isGrammatical(words: readonly string[], { strict = false }: GrammarOptions = {}): boolean {
  const key = `${strict ? 's' : 'l'}:${words.join(' ')}`;
  let result = memo.get(key);
  if (result === undefined) {
    result =
      words.every(isWord) &&
      !(strict && words.some((word, i) => word === words[i - 1])) &&
      new Parser(words, strict).line();
    if (memo.size > 200_000) memo.clear();
    memo.set(key, result);
  }
  return result;
}
