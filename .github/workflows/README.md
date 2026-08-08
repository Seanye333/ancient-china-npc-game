# CI

`ci.yml` 只做兩件事:`npm run build`(= `tsc -b` + vite build)和 `npx vitest run`。

**不跑 Playwright 探針。** 那些腳本必須 `headless: false` 才畫得出東西
(SwiftShader 在 CI 上什麼都畫不出來),而且它們驗的是「畫面對不對」——
那是要人看的。探針留給本地。
