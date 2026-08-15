import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'main',
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.main.js'],
    include: ['tests/unit/**/*.test.js'],
  },
});
