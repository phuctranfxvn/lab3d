import { defineConfig } from 'vite';
import fontsPlugin from './scripts/fonts-plugin.js';

export default defineConfig({
  plugins: [fontsPlugin()],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['./src/vendor/openscad.js'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  assetsInclude: ['**/*.ttf', '**/*.otf'],
});
