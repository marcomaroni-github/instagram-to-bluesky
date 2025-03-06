import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import eslintConfigImport from 'eslint-plugin-import';
import eslintPluginJest from 'eslint-plugin-jest';
import globals from 'globals';

export default [
  {
    ignores: ['dist/**', 'node_modules/**']
  },
  {
    files: ['**/*.ts'],
    ignores: ['**/*.test.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: ['./tsconfig.json', './tsconfig.root.json']
      },
      globals: {
        ...globals.node,
        ...globals.es2021
      }
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'import': eslintConfigImport
    },
    rules: {
      ...eslint.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn'],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-interface': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      'import/order': [
        'error',
        {
          'groups': [
            'builtin',
            'external',
            'internal',
            ['parent', 'sibling'],
            'index',
            'object',
            'type'
          ],
          'newlines-between': 'always',
          'alphabetize': {
            'order': 'asc',
            'caseInsensitive': true
          }
        }
      ]
    },
    settings: {
      'import/resolver': {
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx']
        }
      }
    }
  },
  {
    files: ['**/*.test.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.jest.json'
      },
      globals: {
        ...globals.node,
        ...globals.es2021,
        ...eslintPluginJest.environments.globals.globals
      }
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'import': eslintConfigImport,
      'jest': eslintPluginJest
    },
    rules: {
      ...eslint.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      ...eslintPluginJest.configs['flat/recommended'].rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn'],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-interface': 'warn',
      'import/order': [
        'error',
        {
          'groups': [
            'builtin',
            'external',
            'internal',
            ['parent', 'sibling'],
            'index',
            'object',
            'type'
          ],
          'newlines-between': 'always',
          'alphabetize': {
            'order': 'asc',
            'caseInsensitive': true
          }
        }
      ]
    },
    settings: {
      'import/resolver': {
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx']
        }
      }
    }
  }
]; 