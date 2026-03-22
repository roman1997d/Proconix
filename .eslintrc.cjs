/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: { node: true, es2021: true },
  parserOptions: { ecmaVersion: 2021, sourceType: 'script' },
  extends: ['eslint:recommended'],
  ignorePatterns: ['node_modules/', 'frontend/', '*.html'],
  overrides: [
    {
      files: ['backend/**/*.js'],
      rules: {
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        'no-console': 'off',
      },
    },
  ],
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': 'off',
  },
};
