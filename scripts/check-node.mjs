// Runs before `npm start` / `npm run web` etc. Expo SDK 57 needs Node.js
// 20.19.4+, 22.13+ or 24.3+; older versions fail with confusing errors or a blank page.
const [major, minor, patch] = process.versions.node.split('.').map(Number);
const ok =
  (major === 20 && (minor > 19 || (minor === 19 && patch >= 4))) ||
  (major === 22 && minor >= 13) ||
  (major === 24 && minor >= 3) ||
  major >= 25;
if (!ok) {
  console.error(
    `\nCrossPhrase needs Node.js 20.19.4+, 22.13+ or 24.3+, but this computer has ${process.version}.\n` +
      'Install the current LTS from https://nodejs.org, close and reopen your terminal,\n' +
      'then run `npm install` again before `npm start`.\n',
  );
  process.exit(1);
}
