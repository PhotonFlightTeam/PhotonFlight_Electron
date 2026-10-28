import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/components/__tests__/setup.js'],
    env: {
      VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_component_tests',
    },
  },
});
