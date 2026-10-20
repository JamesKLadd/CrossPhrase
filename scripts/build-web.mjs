// Builds the website: the whole game as a static site in dist/, for GitHub
// Pages (see .github/workflows/website.yml) or any static host.
//
//   npm run build:web
//
// EXPO_BASE_URL is the path the site is served under, e.g. /CrossPhrase for
// https://<user>.github.io/CrossPhrase/. Leave it unset to serve from the root.
// EXPO_PUBLIC_* settings (the Supabase URL and publishable key) are built in,
// as in the app; never put a secret key there.

import { spawnSync } from 'node:child_process';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';

const OUT = 'dist';
const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/+$/, '');

const exported = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', OUT], {
  stdio: 'inherit',
  // npx is a .cmd script on Windows, which needs a shell to start.
  shell: true,
});
if (exported.status !== 0) process.exit(exported.status ?? 1);

// The home-screen icon and web app manifest, linked with the base path so they
// still resolve from deep links like /CrossPhrase/play/level-12.
const index = `${OUT}/index.html`;
const head = [
  `<link rel="manifest" href="${base}/manifest.webmanifest">`,
  `<link rel="apple-touch-icon" href="${base}/icons/apple-touch-icon.png">`,
].join('');
writeFileSync(index, readFileSync(index, 'utf8').replace('</head>', `${head}</head>`));

// GitHub Pages serves 404.html for any path it doesn't have, so a link
// straight to a level still loads the game, which then shows that level.
copyFileSync(index, `${OUT}/404.html`);
// Keep folders starting with "_" (the game's _expo/ folder) if Jekyll ever runs.
writeFileSync(`${OUT}/.nojekyll`, '');

console.log(`\nWebsite ready in ${OUT}/${base ? ` (served under ${base}/)` : ''}.`);
