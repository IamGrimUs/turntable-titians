import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    // `pnpm build` writes compiled copies of the tests to dist/; don't run those too.
    exclude: [...configDefaults.exclude, 'dist/**'],
  },
})
