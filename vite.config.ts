//import { visualizer } from "rollup-plugin-visualizer";

import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  /*plugins: [
    visualizer({
      open: true, 
      filename: "bundle-analise.html",
      gzipSize: true,
      brotliSize: true
    })
  ],*/
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  build: {
    chunkSizeWarningLimit: 4000,
    target: 'esnext',
    modulePreload: false, 
    rollupOptions: {
      output: {
        // @ts-ignore - Os tipos do Vite ainda estão em transição para o Rolldown
        codeSplitting: false, 
        
        entryFileNames: 'assets/js/bundle-[hash].js',
        assetFileNames: (assetInfo: { name?: string }) => {
          if (assetInfo.name?.endsWith('.wasm')) {
            return 'assets/wasm/[name][extname]'; // no hash — consistent path for HavokPhysics.wasm
          }
          return 'assets/[name]-[hash][extname]';
        }
      },
    },
  },
  optimizeDeps: {
    exclude: ['@babylonjs/havok']
  }
});