// Usernames and passwords for CrossPhrase accounts, shared by the game (to
// check a form as it's filled in) and the `account` function (which has the
// final say). Plain TypeScript with no imports, so both can use it.
//
// Accounts are Supabase Auth users whose email is made up from the username
// (accountEmail below). Nobody ever sees it and no mail is ever sent to it:
// the .invalid top-level domain is reserved (RFC 2606) and can never receive
// mail. Supabase only checks an address's format when no email is sent, which
// is the case here: the account function sets it already confirmed.

/** 3 to 16 characters: letters, numbers, - and _, starting and ending with a letter or number. */
const USERNAME = /^[A-Za-z0-9][A-Za-z0-9_-]{1,14}[A-Za-z0-9]$/;

const RESERVED = new Set([
  'admin',
  'administrator',
  'anonymous',
  'anonymous-owl',
  'crossphrase',
  'moderator',
  'mod',
  'owl',
  'support',
  'system',
  'staff',
  'official',
]);

/**
 * Word stems no username may contain. Kept to ones that don't turn up inside
 * innocent words (so "class" and "cocktail" are fine).
 */
const BLOCKED = ['fuck', 'shit', 'cunt', 'nigg', 'fagg', 'bitch', 'whore', 'slut', 'porn', 'nazi', 'rapist', 'retard', 'penis', 'vagina', 'dildo', 'wank', 'twat'];

/** Passwords nobody should use, compared with digits and symbols removed ("P@ssw0rd!" is "password"). */
const COMMON_PASSWORDS = new Set([
  'password',
  'passwort',
  'qwerty',
  'qwertyuiop',
  'asdfghjkl',
  'abcdef',
  'abcdefg',
  'abcdefgh',
  'letmein',
  'welcome',
  'monkey',
  'dragon',
  'football',
  'baseball',
  'sunshine',
  'princess',
  'iloveyou',
  'admin',
  'login',
  'master',
  'superman',
  'whatever',
  'starwars',
  'computer',
  'shadow',
  'freedom',
  'crossphrase',
  'crossword',
  'owl',
  'owlowl',
]);

export const ACCOUNT_EMAIL_DOMAIN = 'players.crossphrase.invalid';

/** The made-up email address Supabase Auth knows an account by. */
export function accountEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${ACCOUNT_EMAIL_DOMAIN}`;
}

/** What's wrong with a username, or null if it can be used. */
export function usernameProblem(username: string): string | null {
  const name = username.trim();
  if (!name) return 'Choose a username.';
  if (!USERNAME.test(name)) {
    return 'Usernames are 3 to 16 letters or numbers (- and _ allowed in the middle).';
  }
  const folded = name.toLowerCase();
  const letters = folded.replace(/[^a-z]/g, '');
  if (RESERVED.has(folded) || BLOCKED.some((stem) => letters.includes(stem))) {
    return 'Please choose a different username.';
  }
  return null;
}

/** What's wrong with a password, or null if it can be used. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Passwords need at least 8 characters.';
  // Supabase Auth hashes passwords with bcrypt, which only reads 72 bytes.
  if (new TextEncoder().encode(password).length > 72) return 'That password is too long.';
  if (/^(.)\1*$/.test(password) || /^[0-9]+$/.test(password)) return 'Please choose a less predictable password.';
  const folded = password.toLowerCase().replace(/[^a-z]/g, '');
  if (COMMON_PASSWORDS.has(folded) || (folded.length >= 4 && COMMON_PASSWORDS.has(folded.slice(0, -1)))) {
    return 'That password is too common. Please choose another.';
  }
  return null;
}
