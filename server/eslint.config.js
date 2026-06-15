import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
// Add this import at the top
import tsParser from '@typescript-eslint/parser';

/**
 * ESLint configuration for the Node.js backend.
 * - Sets execution environment to Node.js (ECMA 2022).
 * - Includes Vitest/Jest globals for server-side testing.
 * - Configures rules for server-side logging and variable patterns.
 * @returns {Array} Flat configuration array for ESLint.
 */
export default defineConfig([
  {
    // Define directories to be ignored by the linter
    ignores: ['node_modules', 'dist', 'coverage'],
  },
  {
    // Target all server source files, including TypeScript and JSX/TSX
    files: ['**/*.{ts,tsx,js}'],

    // Configure the language and environment settings
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',

      // Tell ESLint to use the TypeScript parser so it doesn't crash on TS syntax
      parser: tsParser,

      // Merge Node.js and Jest/Vitest globals for context awareness
      globals: {
        ...globals.node,
        ...globals.jest,
        // vitest.setup.js registers mockExpressContext as a global
        // available in all server test files
        mockExpressContext: 'readonly',
      },
    },

    // Define server-side code quality rules
    rules: {
      // Inherit standard recommended JavaScript rules
      ...js.configs.recommended.rules,

      // Permit unused variables if they are uppercase (Env vars or Constants)
      // or intentionally underscore-prefixed.
      'no-unused-vars': [
        'error',
        { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' },
      ],

      // Warn on console usage to encourage proper logging in production
      'no-console': 'warn',
    },
  },
]);
