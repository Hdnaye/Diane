// The phone running the app may be in any time zone, while hunt days, meeting times and answer
// deadlines are in Paris time: tests run with the "phone" in New York (other offset, other
// daylight saving dates), so code using the phone's time zone instead of Paris time fails.
// Set here, before Jest starts its workers (they inherit the environment).
process.env.TZ = 'America/New_York';

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '\\.css$': '<rootDir>/jest/style-mock.js',
    // The "react-native" entry of lucide is an .mjs file Jest cannot load: use its CommonJS build.
    '^lucide-react-native$':
      '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
    // The PocketBase SDK's main entry is an .mjs file: use the same ES build as .js, transpiled
    // (its CommonJS build only exports the client, not the auth stores and helpers).
    '^pocketbase$': '<rootDir>/node_modules/pocketbase/dist/pocketbase.es.js',
  },
  // jest-expo's defaults, plus the untranspiled packages used by reusables, NativeWind, lucide
  // and PocketBase.
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|@rn-primitives|nativewind|react-native-css-interop|lucide-react-native|pocketbase))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
};
