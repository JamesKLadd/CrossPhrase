// Runs before `npm start` / `npm run web` etc. Expo SDK 54 needs Node.js
// 20.19.4 or newer; older versions fail with confusing errors or a blank page.
const [major, minor, patch] = process.versions.node.split('.').map(Number);
const ok = major > 20 || (major === 20 && (minor > 19 || (minor === 19 && patch >= 4)));
if (!ok) {
  console.error(
    `\nCrossPhrase needs Node.js 20.19.4 or newer, but this computer has ${process.version}.\n` +
      'Install the current LTS from https://nodejs.org, close and reopen your terminal,\n' +
      'then run `npm install` again before `npm start`.\n',
  );
  process.exit(1);
}
