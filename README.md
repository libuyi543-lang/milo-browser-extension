<p align="center"><img src="assets/icon-128.png" width="88" alt="Milo mascot with a blue pencil"></p>
<h1 align="center">Milo Browser Extension</h1>
<p align="center"><strong>别人翻译完就结束，Milo 翻译完才刚开始。</strong></p>
<p align="center">划词看释义 · 保存原句与来源 · 在原网页双语阅读</p>
<p align="center">
  <a href="https://github.com/libuyi543-lang/milo-browser-extension/releases/latest">下载安装包</a> ·
  <a href="docs/INSTALL.md">安装教程</a> ·
  <a href="README.en.md">English</a> ·
  <a href="https://github.com/libuyi543-lang/milo-browser-extension/issues">反馈建议</a>
</p>
<p align="center">
  <a href="https://github.com/libuyi543-lang/milo-browser-extension/actions/workflows/build.yml"><img src="https://github.com/libuyi543-lang/milo-browser-extension/actions/workflows/build.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/github/v/release/libuyi543-lang/milo-browser-extension" alt="Latest release">
  <img src="https://img.shields.io/badge/Chrome-128%2B-5c7f6e" alt="Chrome 128+">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-5c7f6e" alt="MIT License"></a>
</p>

![Milo：让每一个遇见的词，都有来处](docs/images/cover.png)

读英文文章、看 X 推文时，遇见一个陌生词：**选中 → 看释义 → 加入 Milo**。原句、网页标题、URL 和遇见时间一起留下。下一次再保存同一个词，Milo 会记录新的语境，并增加遇见次数。

Milo 是 Milo 单词本的桌面入口。**当前版本保存于浏览器本地，尚未接入手机同步或复习功能。**

## 看看它怎么用

### 01 · 划词，然后把语境一起留下

![在阅读页面划选 inevitable，Milo 展示释义、原句和加入按钮](docs/images/selection.png)

轻量浮窗包含中文释义、词性与原句。点击「加入 Milo」后显示「已加入 Milo」。保存的不只是词义，还有你第一次遇见它的地方。

### 02 · 中文就在英文下面

![Milo 逐段插入中文，原英文和页面结构保留](docs/images/bilingual.png)

Mac 按 **⌘ A**，Windows 按 **Ctrl+A**：英文段落下直接出现中文。再按一次恢复原文。输入框和编辑器内仍执行原生全选。

在 **X / Twitter**，只提取主内容栏的推文、回复正文与文章富文本；导航、账号、时间、互动计数和推荐侧栏不会进入翻译请求。普通网页优先提取文章正文。

### 03 · 每一次遇见，都算数

![Milo 本地单词本显示单词、原句和遇见次数](docs/images/notebook.png)

工具栏里的单词本展示最近收藏的词及遇见次数。相同词不会新建重复条目，每次重新保存都会追加一个 encounter。

> 上述图片由实际构建的 Milo UI 在固定演示页面中渲染；示例词义与译文使用本地 fixtures，不展示私人网页或密钥。复现方式见 [展示素材说明](docs/showcase/README.md)。

## 三分钟开始

1. 从 [Releases](https://github.com/libuyi543-lang/milo-browser-extension/releases/latest) 下载 ZIP 并解压。
2. 打开 `chrome://extensions`，开启「开发者模式」，点击「加载已解压的扩展程序」，选择解压后的目录。
3. 点击工具栏 Milo 图标，填写自己的 DeepSeek API Key 并保存。
4. 打开英文网页，划选一个单词，点击「加入 Milo」。

完整步骤与常见问题见 [安装教程](docs/INSTALL.md)。目前通过开发者模式加载，尚未发布到 Chrome Web Store。

## 已实现与后续计划

| 当前可用 | 后续计划，尚未实现 |
| --- | --- |
| 英文单词划词、中文释义、原句提取 | Milo 手机端同步 |
| 本地保存、来源记录、重复遇见计数 | 登录与账号体系 |
| 网页正文逐段中英对照、停止 / 重试 / 恢复 | 滚动加载新正文的增量翻译 |
| X 正文识别、翻译缓存、重复请求合并 | 更大规模单词本与数据导出 |
| DeepSeek Flash provider 与统一翻译接口 | 在语境中解释单词、多 provider 选择 |

本版面向英文 → 中文阅读；PDF、OCR、图片 / canvas 文字、跨域 iframe 正文不在当前范围内。

## 流畅度与 API 成本

- **本地缓存**：单词 30 天、正文 7 天，最多 500 条、约 1 MB。命中缓存不发送 API 请求。
- **去重与排队**：相同未完成请求共享结果，正文重复文本只发送一次；最多两个并发网络请求，等待中的划词任务优先。
- **少一些误触**：划词稳定 150 ms 后才查询；关闭浮窗、切换词或停止正文翻译会取消对应未完成任务。
- **优先当前阅读位置**：正文优先翻译视口内段落，长文章分批处理。

API 按 DeepSeek 的实际用量计费；已发出的请求即使取消，也可能产生费用。Milo 本身不收取翻译订阅费。

## 隐私与数据

API Key 仅保存在当前浏览器扩展本地存储，网页 content script 无权直接读取。单词查询发送选中的词；正文翻译发送提取的英文段落，直连 `api.deepseek.com`。Milo 不主动上传网页标题、URL 或收藏记录；所选网页文本会交由 DeepSeek 处理。

单词保存在 `chrome.storage.local` 的 `milo_words_v1` 中。**卸载扩展会清除本地数据**，手机同步和数据导出尚未实现。详见 [隐私说明](PRIVACY.md)。源码和安装包不包含可用 API Key。

## 本地开发

保留了 Saladict 的 React / TypeScript、RxJS 划词链路与 Neutrino / Webpack 扩展基础设施。构建输出为 Chrome Manifest V3。

使用 **Node.js 16.20.2 + Yarn 1.22.22**（沿用上游构建链，暂未升级）：

```sh
git clone https://github.com/libuyi543-lang/milo-browser-extension.git
cd milo-browser-extension
corepack enable
corepack prepare yarn@1.22.22 --activate
yarn install --frozen-lockfile
yarn lint
yarn type-check
yarn test
yarn build
yarn package
```

开发时加载 `build/chrome`；ZIP 输出到 `dist/`。重新 build 后重新加载扩展，并刷新已打开的阅读页面。

当前入口为 `src/content`、`src/selection`、`src/background` 和 `src/popup`。原项目的其他源码逐步停用，未作为 Milo 功能发布。运行链路与验收记录见 [V0.2 工程说明](docs/MILO_V02.md) 和 [初始架构分析](docs/MILO_V01.md)。默认 `yarn test` 运行 Milo 测试；`yarn test:legacy` 保留上游测试入口，部分需要额外 fixtures。

## 一起改进 Milo

如果它帮你留下了一个原本会忘掉的词，可以 **Star** 或分享给也在读英文的朋友。欢迎通过 [Issue](https://github.com/libuyi543-lang/milo-browser-extension/issues) 反馈正文识别、语境提取与阅读体验的问题，或查看 [贡献指南](CONTRIBUTING.md)。可直接使用的分享文案见 [传播素材](docs/SHARING.md)。

## 开源许可与致谢

部分代码基于 [Saladict](https://github.com/crimx/ext-saladict)，感谢 CRIMX 与原项目贡献者。Milo 是独立衍生产品，与原项目不存在官方隶属或背书关系。

原始 MIT 许可与版权信息完整保留于 [LICENSE](LICENSE)。来源说明见 [NOTICE.md](NOTICE.md)，原项目品牌条款见 [TRADEMARKS.md](TRADEMARKS.md)。历史提交和停用源码中的 Saladict 名称用于保留来源；当前产品界面使用 Milo 品牌。
