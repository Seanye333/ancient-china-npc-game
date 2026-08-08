import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5178 },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      /*
       * 只看<b>規則</b>那一半。
       *
       * src/world 和 src/ui 是呈現:它們的正確與否是「看起來對不對」,
       * 那要人看畫面(tools/probes/),不是靠行覆蓋率。
       * 把它們算進來只會得到一個好看的分母,和一份沒人會讀的報告。
       */
      include: ['src/game/**/*.ts'],
      exclude: ['src/game/**/*.test.ts'],
    },
  },
});
