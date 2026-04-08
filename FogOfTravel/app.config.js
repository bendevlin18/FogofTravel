const { withAppBuildGradle } = require('expo/config-plugins');

/** @type {import('expo/config').ExpoConfig} */
const config = require('./app.json').expo;

/**
 * Config plugin to inject the Mapbox access token as an Android resource.
 * The native Mapbox SDK reads `mapbox_access_token` from string resources
 * on startup — before the JS bridge runs Mapbox.setAccessToken().
 */
function withMapboxAccessToken(config) {
  return withAppBuildGradle(config, (config) => {
    const gradle = config.modResults.contents;
    if (!gradle.includes('mapbox_access_token')) {
      // Insert resValue after the REACT_NATIVE_RELEASE_LEVEL buildConfigField
      config.modResults.contents = gradle.replace(
        /buildConfigField "String", "REACT_NATIVE_RELEASE_LEVEL".*\n/,
        (match) =>
          match +
          `\n        // Mapbox access token (read from .env at build time)\n` +
          `        def envFile = new File(projectRoot, '.env')\n` +
          `        def mapboxToken = ''\n` +
          `        if (envFile.exists()) {\n` +
          `            envFile.eachLine { line ->\n` +
          `                if (line.startsWith('EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=')) {\n` +
          `                    mapboxToken = line.split('=', 2)[1].trim()\n` +
          `                }\n` +
          `            }\n` +
          `        }\n` +
          `        resValue "string", "mapbox_access_token", mapboxToken\n`
      );
    }
    return config;
  });
}

module.exports = {
  expo: {
    ...config,
    plugins: [
      [
        '@rnmapbox/maps',
        {
          RNMapboxMapsDownloadToken: process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN ?? '',
        },
      ],
      withMapboxAccessToken,
    ],
  },
};
