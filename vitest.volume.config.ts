import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// Medição M12 em processo dedicado: mantém a carga estável exigida pelo orçamento D11,
// sem competir com os demais arquivos da suíte paralela. Os limites do teste não mudam.
export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    include: ['tests/main/reminder-volume.test.ts'],
    fileParallelism: false,
  },
})
