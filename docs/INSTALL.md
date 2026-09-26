# 安装与使用 Milo

## 下载并加载

1. 使用 Chrome 128 或更新版本。
2. 从 [最新 Release](https://github.com/libuyi543-lang/milo-browser-extension/releases/latest) 下载 `Milo-Browser-Extension-v0.3.1.zip`。
3. 解压到一个固定目录。加载后不要移动或删除该目录。
4. 在地址栏输入 `chrome://extensions`，打开右上角「开发者模式」。
5. 点击「加载已解压的扩展程序」，选择包含 `manifest.json` 的目录。
6. 点击 Chrome 右上角拼图，在 Milo 右侧点击图钉固定到工具栏。

没有 Chrome Web Store 安装入口；ZIP 本身不能直接拖入作为已签名扩展安装。

## 配置翻译

点击工具栏 Milo 图标 →「管理 API」，选择 DeepSeek、智谱 GLM、小米 MiMo 或 MiniMax，填写该服务的 API Key 并选择模型，点击「保存并使用」。项目不附赠密钥；调用费用由自己的服务账户承担。密钥仅保存在当前浏览器，不要将其放进 GitHub Issue 或截图。

「保存并测试」会用当前配置发送一次 hello 查询，产生少量 API 用量。各家密钥独立保存；已保存的密钥不回显，输入框留空会保留它。模型需在账户中可用。原有 DeepSeek 配置会自动保留。详见 [AI 服务配置](https://github.com/libuyi543-lang/milo-browser-extension/blob/main/docs/AI_PROVIDERS.md)。

## 收藏一个词

打开普通英文网页，用鼠标划选或双击单词。看到 Milo 浮窗后点击「加入 Milo」，按钮变为「已加入 Milo」。再次遇见并保存相同词，会增加遇见次数。点击工具栏图标查看最近的词。

## 双语正文

在网页正文按 `⌘ A`（Mac）或 `Ctrl+A`（Windows），中文逐段插入英文下方。再按一次恢复。也可使用工具栏的「翻译 / 恢复网页正文」。输入框和编辑器中仍是正常全选。

右下角状态提示可停止、重试或恢复。X 只翻译主内容栏正文，不翻译导航和侧栏。新滚动加载的内容可先恢复，再重新触发翻译。

## 更新

把新版 ZIP 解压覆盖到原扩展目录，或在原目录重新 build。在 `chrome://extensions` 点 Milo 的「重新加载」，再刷新已经打开的网页。旧网页出现「Milo 已更新，请刷新此页」时，刷新后继续使用。

为保留本地词条，更新时优先重新加载，避免卸载。当前没有导出与云同步。

## 常见问题

| 问题 | 处理 |
| --- | --- |
| 工具栏窗口一片空白 / 后台版本尚未更新 | 在扩展管理页重新加载 Milo，再打开图标。V0.3.1 已增加失配提示与恢复入口 |
| 没有浮窗 | 刷新页面，确认扩展启用，尝试普通 HTTP/HTTPS 页面的英文单词 |
| 浏览器内部页 / 商店无法翻译 | Chrome 限制注入，改用普通网页 |
| API 余额、鉴权或限流错误 | 检查自己的密钥、余额和服务状态，再重试 |
| 没有检测到正文 | 当前页面结构可能不受支持，可反馈公开 URL 和复现步骤 |
| PDF、截图无法提取 | 当前不支持 PDF / OCR / 图片文字 |
| 更新后 Extension context invalidated | 重新加载后旧页面上下文失效，刷新阅读页面；历史错误可清除 |
| 同一个词在不同文章意义不同 | 当前词义查询仅发送词本身；语境释义属于后续计划 |

反馈时使用 [Issue 模板](https://github.com/libuyi543-lang/milo-browser-extension/issues/new/choose)，请隐藏密钥与私人内容。
