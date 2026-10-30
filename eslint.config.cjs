const { defineConfig } = require('eslint/config');
const expo = require('eslint-config-expo/flat');
const tseslint = require('typescript-eslint');

module.exports = defineConfig([
  expo,
  { files: ['*.config.cjs'], languageOptions: { globals: { __dirname: 'readonly' } } },
  { ignores: ['dist/**', 'coverage/**'] },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: __dirname } },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: false }],
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['src/payments/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['react', 'react/**', 'react-native', 'react-native/**', 'zustand', 'zustand/**', 'expo*', '@react-native*/*'], message: 'The coordinator and payment contract stay framework independent.' },
        { group: ['**/mock/**', '**/storage/**', '**/bootstrap/**', '**/state/**', '**/checkout/**'], message: 'Payment orchestration depends on injected interfaces.' },
      ] }],
    },
  },
  {
    files: ['app/**/*.{ts,tsx}', 'src/checkout/**/*.{ts,tsx}', 'src/state/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['**/PaymentAPI', '**/mock/**', '**/storage/**', '@react-native-async-storage/*'], message: 'Checkout UI and presentation state use the coordinator, not payment or storage APIs.' },
      ] }],
    },
  },
  {
    files: ['src/mock/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['**/ClientRecoveryStore', '**/PaymentCoordinator', '@react-native-async-storage/*'], message: 'The mock backend only accesses its injected storage and backend namespace.' },
      ] }],
    },
  },
  {
    files: ['src/storage/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['**/mock/**', '@react-native-async-storage/*'], message: 'Client recovery does not access backend records; native storage is injected at bootstrap.' },
      ] }],
    },
  },
]);
