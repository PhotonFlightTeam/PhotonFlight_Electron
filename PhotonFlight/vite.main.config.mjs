import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: ['@grpc/grpc-js', '@grpc/proto-loader'],
    },
  },
});
