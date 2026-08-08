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
      /*
       * 一道<b>只准往上</b>的門檻。
       *
       * 訂在剛好低於現況一點點(現在 73.7%),意思不是「70 分就夠了」,
       * 而是「別再掉回去」。從前那份「零測試模組」清單是靠猜的,
       * 而且猜錯過 —— 真正的空白是 audio/places/tavern 這三個
       * 誰都沒想到會壞的檔。有一道線,下次就不必再猜。
       */
      thresholds: { lines: 70, functions: 68, branches: 62 },
    },
  },
});
