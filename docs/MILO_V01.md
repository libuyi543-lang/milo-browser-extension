# Milo V0.1 工程记录

基于上游 commit `b93dc3c`，保留原 MIT LICENSE 和版权声明。新增 NOTICE.md 说明来源；分发包同时包含 LICENSE、NOTICE.md 和原品牌指南。

## 当前运行链路

`selection/select-text.ts` 监听鼠标选词 → `selection/context.ts` 复用 get-selection-more 提取原句 → `selection/message.ts` 处理 iframe 坐标并经原消息封装传到顶层 content → `MiloWordPopup` 渲染 Shadow DOM 浮窗 → TranslationProvider 适配原 Bing engine/offscreen → miloStorage service 发送保存请求 → background 写入 extension local storage。

## 保留与退出

保留：React/TypeScript、原划词检测、跨 iframe 传递、页面信息消息、ShadowPortal、浮窗边界处理、Bing 解析器、MV3 offscreen 与 Webpack/Neutrino manifest 生成。

退出当前构建：多词典 UI、旧设置/欢迎/帮助入口、历史管理、独立搜索、PDF、音频控制、复杂快捷键、第三方同步和统计上报。相关旧源码仍在仓库中，未被当前 Chrome 入口加载。

## 数据与未来替换

每个 normalizedWord 只有一条 MiloWord。首次保存创建记录；后续保存保持 id 和首次 createdAt，encounterCount +1，并追加新的 sentence/title/url/createdAt。background 串行写入防止并发丢记录。UI 只调用 services/miloStorage 与 services/translation，未来可在这些边界替换为 Milo API。

## 验收

2026-09-26 已在 Google Chrome 中加载 build/chrome，鼠标选中 inevitable 后显示真实中文释义与完整原句；两次保存来自不同句子的同一词后，toolbar 单词本显示一条词、遇见 2 次。DevTools 检查 local storage 确认 word、normalizedWord、meaning、partOfSpeech、source、createdAt、encounterCount 和两条完整 encounters 均已保存。

已通过 Chrome MV3 build、TypeScript 检查、源代码 ESLint，以及 4 组 Milo 定向测试。旧全量词典测试受缺失 HTML fixtures 限制；它们不属于本版默认测试。
