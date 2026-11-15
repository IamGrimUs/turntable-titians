import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Avatars can be hosted on any https host, so next/image (which needs an allowlist of
      // hosts) isn't a fit; plain <img> is intentional here.
      '@next/next/no-img-element': 'off',
    },
  },
  {
    // Config files are CommonJS and legitimately use require().
    files: ['next.config.js', 'tailwind.config.ts', 'security-headers.js', '**/*.test.ts'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  globalIgnores(['.next/**', 'node_modules/**', 'next-env.d.ts', 'coverage/**']),
])
