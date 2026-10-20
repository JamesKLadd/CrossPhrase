// The app's settings are in app.json. This adds the path the website is
// served under when it's built for GitHub Pages (EXPO_BASE_URL, e.g.
// /CrossPhrase); see scripts/build-web.mjs.
module.exports = ({ config }) => {
  const baseUrl = process.env.EXPO_BASE_URL;
  return baseUrl ? { ...config, experiments: { ...config.experiments, baseUrl } } : config;
};
