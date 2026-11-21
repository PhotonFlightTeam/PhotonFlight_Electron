import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    sourcemap: true,
  },

  build: {
    rollupOptions: {
      external: ['@grpc/grpc-js', '@grpc/proto-loader'],
    },
  },
});
