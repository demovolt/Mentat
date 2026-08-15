import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'renderer',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.renderer.js'],
    include: ['tests/components/**/*.test.{js,jsx}'],
    css: false,
  },
  resolve: {
    alias: {
      '@xterm/xterm': resolve('./tests/mocks/xterm.js'),
      '@xterm/addon-fit': resolve('./tests/mocks/xterm-addons.js'),
      '@xterm/addon-webgl': resolve('./tests/mocks/xterm-addons.js'),
      '@xterm/addon-web-links': resolve('./tests/mocks/xterm-addons.js'),
      '@xterm/addon-clipboard': resolve('./tests/mocks/xterm-addons.js'),
    },
  },
});
