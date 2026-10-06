import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    restoreMocks: true,
    clearMocks: true,
    include: ['tests/**/*.test.ts'],
    // A medição M12 tem orçamento de carga estável e roda em configuração dedicada
    // (`npm run test:volume`), fora da paralelização da suíte funcional.
    exclude: ['**/node_modules/**', 'tests/main/reminder-volume.test.ts'],
  },
})
