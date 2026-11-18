import { defineConfig } from 'vite'
export default defineConfig({
  build: {
    outDir: 'lib',
    lib: {
      entry: 'src/index.js',
      name: 'Editwell',
      formats: ['es', 'iife'],
      fileName: format => format === 'es' ? 'editwell.js' : 'editwell.global.js',
      cssFileName: 'editwell',
    },
  },
})
