# 安装与使用 Milo · V0.5.0

## 下载并加载

1. 使用 Chrome 128+，从 [最新 Release](https://github.com/libuyi543-lang/milo-browser-extension/releases/latest) 下载 `Milo-Browser-Extension-v0.5.0.zip`。
2. 解压到固定目录；打开 `chrome://extensions`，开启“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择含 `manifest.json` 的目录。
4. 点击浏览器拼图菜单，在 Milo 右侧点击图钉固定。
5. Milo → 管理 API，选择服务、填入自己的密钥与模型，保存并使用。

暂无 Chrome Web Store 安装入口。也可尝试桌面 Edge / Brave，但未宣称已完成所有浏览器兼容测试；本版不是 Firefox / Safari 扩展。

## 功能入口

- 英文划词：释义、语境、一键加入；重复保存增加遇见次数。
- 正文 `⌘A` / `Ctrl+A`：双语翻译 / 恢复；X 仅主正文。新加载正文默认自动续译，编辑器内仍可全选。
- 鼠标悬停段落按 Control：翻译这一段。
- 输入框中文草稿，快速敲三下空格：默认译为英文；阅读设置可修改目标语言。
- 工具栏 → **工具与阅读设置**：文本、文档、图片、字幕、词库备份、Zotero 和设置。
- 页面右键 Milo：图片翻译、圈选、Google Docs 导出、主动视频标签页音频翻译。
- `Alt+Shift+Y` 正文，`Alt+Shift+M` 工作台，`Alt+Shift+O` 圈选；可在 `chrome://extensions/shortcuts` 修改。

阅读设置支持语言、双语 / 仅译文、样式、自动 / 排除域名及术语表。保存后刷新阅读网页。自动网站规则默认为空；启用后匹配页会发送正文给所选服务。

文档在本地解析，点击翻译才发送文字。图片 OCR 与扫描 PDF 使用视觉模型；音频需单独保存小米 MiMo 密钥。详细范围见 [桌面功能清单](DESKTOP_FEATURES.md)、[服务配置](AI_PROVIDERS.md) 和 [隐私说明](../PRIVACY.md)。

## 更新与备份

先到工作台单词本导出 JSON。新版 ZIP 解压覆盖原扩展目录，在扩展管理页“重新加载”，再刷新旧网页。优先重新加载，不要卸载；卸载会删除本地词条与密钥。JSON 可在单词本导入合并，CSV 可导入 Anki 并手动映射字段。

## 常见问题

| 问题 | 处理 |
| --- | --- |
| 空白工具栏 / 后台版本未更新 | 扩展管理页重新加载，再打开图标 |
| 没有浮窗 / context invalidated | 刷新页面并确认启用；历史错误可清除 |
| 内部页 / 商店 / 受保护视频不能翻译 | 浏览器限制，不尝试绕过；使用普通网页或本地文件 |
| API 鉴权 / 限流 / 余额错误 | 检查密钥、模型、地区和额度；保存并测试 |
| 正文没识别 / 复杂 Canvas 文档 | 用文本工具或文件导入；Google Docs 可导出 DOCX |
| PDF 原版面译文没有直接覆盖 | 本版导出原页与译文对照，可打印 PDF，不含原版面重排 |
| 图片覆盖不完美 | 编辑译文和坐标；本版采样底色，不含专业修复 |
| 视频没有可读字幕 | 试主动音频入口并配置 MiMo；平台 / DRM / 账户限制可能影响采集 |
| Zotero 未连接 | 本机运行 Zotero，开启本机通信，确认附件已有全文索引 |

反馈请提交公开复现 URL 或示例文件，隐藏密钥与私人内容：[Issues](https://github.com/libuyi543-lang/milo-browser-extension/issues/new/choose)。
