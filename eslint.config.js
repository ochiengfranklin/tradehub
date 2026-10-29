import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        rules: {
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            // Use the structured logger instead of console (console.error allowed for fatal startup failures).
            'no-console': ['error', { allow: ['error'] }],
        },
    },
);