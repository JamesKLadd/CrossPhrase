// Runs before `npm start` / `npm run web` etc. Expo SDK 58 needs a recent
// Node.js; older versions fail with confusing errors or a blank web page.
const [major, minor] = process.versions.node.split('.').map(Number);
const ok = (major === 22 && minor >= 13) || (major === 24 && minor >= 3) || major >= 26;
if (!ok) {
  console.error(
    `\nCrossPhrase needs Node.js 22.13+ or 24.3+, but this computer has ${process.version}.\n` +
      'Install the current LTS from https://nodejs.org, close and reopen your terminal,\n' +
      'then run `npm install` again before `npm start`.\n',
  );
  process.exit(1);
}
