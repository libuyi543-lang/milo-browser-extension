# Milo 翻译服务配置 · V0.5

工具栏 → 管理 API，或工作台 → AI 服务。每种服务独立保存密钥、模型；空密钥输入框保留原值，移除按钮清除对应配置。保存并测试会发送一次 hello 请求，绕过缓存，可能计费。

## 文本服务

| 服务 | 初始模型 / API | 官方接口依据 |
| --- | --- | --- |
| DeepSeek | `deepseek-v4-flash`，api.deepseek.com | [Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/) |
| 智谱 | `glm-4.7-flash`，open.bigmodel.cn | [对话补全](https://docs.bigmodel.cn/api-reference/模型-api/对话补全) |
| 小米 MiMo | `mimo-v2.6-flash`，api.xiaomimimo.com | [API](https://mimo.mi.com/docs/en-US/api/chat) |
| MiniMax 中国站 | `MiniMax-M2.7`，api.minimax.cn | [兼容接口](https://platform.minimax.cn/docs/api-reference/text-openai-api) |
| 自定义兼容 API | 自填模型和 Base URL | 必须兼容 Chat Completions 与文本 JSON 回复 |
| DeepL | `prefer_quality_optimized` | [Translate](https://developers.deepl.com/api-reference/translate/request-translation) |
| Google Cloud 翻译 | v2 | [Translate v2](https://cloud.google.com/translate/docs/reference/rest/v2/translate) |
| Microsoft 翻译 | v3，可填 Azure 资源区域 | [Translate v3](https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/reference/v3/translate) |

接口核对日期：2026-09-27。模型与语言支持依服务账号、地区和权限而定，不替用户购买额度。传统翻译 API 返回译文，不提供 AI 词性 / 音标或自定义术语提示。Google 需启用 Cloud Translation API，不能填普通网页翻译地址；Microsoft 区域应与资源匹配。

DeepL 以 `:fx` 结尾的免费 API Key 自动路由到 api-free.deepl.com，其余到 api.deepl.com。Google 使用 X-goog-api-key 头；Microsoft 使用订阅密钥与可选区域头。

## 自定义端点

填写兼容服务的 Base URL（例如 `https://your-host.example/v1`）和自己的模型名。末尾自动规范为 `/chat/completions`。允许 HTTPS；仅 localhost / 127.0.0.1 / ::1 可使用 HTTP。拒绝 URL 中的账号密码、查询串和 fragment。只把这个配置的密钥发送到用户选择的端点。

支持普通按量或兼容订阅端点的前提是协议匹配且密钥授权可用；不保证所有服务商兼容，不自动绕过套餐限制。未验证端点前不要填写无关服务的密钥。

## 图片与音频

视觉工具显式选择 DeepSeek Flash (`deepseek-flash`)、MiMo (`mimo-v2.6-flash`) 或 MiniMax M3 (`MiniMax-M3`)，使用对应已保存密钥。扫描 PDF 的识别入口目前固定 DeepSeek Flash。这些多模态模型独立于文本面板所选模型。

音频识别目前仅使用小米 MiMo，再由当前文本服务翻译识别结果；需配置小米密钥。未配置会提示，不会把其他服务密钥交给小米。

官方依据：[DeepSeek vision](https://api-docs.deepseek.com/guides/vision/)、[MiMo 图片](https://mimo.mi.com/docs/en-US/quick-start/usage-guide/multimodal-understanding/image-understanding)、[MiMo 音频](https://mimo.mi.com/docs/en-US/quick-start/usage-guide/multimodal-understanding/audio-understanding)。不同模型的图片识别、坐标和转录结果可能不同，请先用短样本验证。

## 调度与验证

AI 协议由后台适配：小米 api-key、各家 token / thinking / JSON 参数分开配置；自定义服务使用最小兼容请求。MiniMax M2.x 的思考不能关闭，输出上限和超时较高；M3 使用可关闭的 thinking。具体速度、费用由服务返回决定。

密钥保存在 trusted extension storage，摘要不含密钥。更改服务 / 密钥 / 模型 / 端点会取消旧任务，缓存按服务与配置隔离。每个服务最多 500 条 / 约 1 MB 文字缓存，单词 30 天，正文 / 文本 / 输入 7 天；清缓存不删词库。

自动测试验证请求字段、认证、端点规范、缓存、取消与解析。浏览器验证使用模拟回复；没有声称所有服务的真实账户都已实测。请在自己的配置中使用“保存并测试”确认授权。

功能限制见 [桌面功能](DESKTOP_FEATURES.md)，发送数据见 [隐私说明](../PRIVACY.md)。
