# Milo AI 服务配置 · V0.3

工具栏点 Milo →「管理 API」→ 选服务 → 填入此服务的密钥与模型 →「保存并使用」。已配置服务可留空密钥输入框，保留原密钥。各服务配置独立保存；切换后划词和正文翻译都使用当前服务。

![Milo AI 设置](images/ai-settings.png)

## 固定工具栏图标

Chrome 右上角拼图 → 找到 Milo → 点击图钉。之后可直接点击 Milo 图标进入设置。图钉是 Chrome 的用户设置，扩展不会强制固定。更新本地构建后重新加载扩展并刷新阅读页面。

## 预设与官方接口

| 服务 | 初始模型 | 请求端点 | 官方依据 |
| --- | --- | --- | --- |
| DeepSeek | `deepseek-v4-flash` | `https://api.deepseek.com/chat/completions` | [Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/) |
| 智谱 GLM | `glm-4.7-flash` | `https://open.bigmodel.cn/api/paas/v4/chat/completions` | [对话补全](https://docs.bigmodel.cn/api-reference/模型-api/对话补全) |
| 小米 MiMo | `mimo-v2.6-flash` | `https://api.xiaomimimo.com/v1/chat/completions` | [OpenAI 兼容接口](https://mimo.mi.com/docs/en-US/api/chat)、[结构化输出](https://mimo.mi.com/docs/en-US/quick-start/usage-guide/text-generation/structured-output) |
| MiniMax 中国站 | `MiniMax-M2.7` | `https://api.minimax.cn/v1/chat/completions` | [OpenAI SDK 与模型参数](https://platform.minimax.cn/docs/api-reference/text-openai-api) |

预设来源核对日期：2026-09-26。模型由服务商维护，需使用自己账户有权限的模型；模型输入框可修改，不会替用户购买或开通服务。

本版使用普通按量 API 端点；其他区域、专用 Coding / Token Plan 端点、自定义 Base URL 不在配置范围内。不要混用不同地区或订阅专用密钥。

## 适配

后台根据服务创建请求。小米使用 `api-key` 认证头和 `max_completion_tokens`，其他服务使用 Bearer 认证。DeepSeek、智谱与小米使用 JSON mode，并关闭可关闭的 thinking。MiniMax 使用 `reasoning_split`，不会发送未在兼容文档中明确支持的 `response_format`；模型仍由提示词要求返回 JSON，解析层兼容完整 Markdown JSON 代码块与 `<think>` 标签。

MiniMax M2.x 的思考不能关闭，单词请求至少给出 4096 输出 token 的上限，段落请求最多 8192，超时 60 秒；这是上限，不是每次固定消耗。M3 可关闭 thinking，使用普通输出预算。速度、费用和授权以服务方实际返回为准。

## 配置与缓存

`src/models/AIProvider.ts` 定义固定官方端点与可选模型，`src/background/ai-settings.ts` 保存配置，`ai-provider.ts` 适配协议，`ai-translation.ts` 负责请求队列、去重、取消与结果解析。UI 经服务与消息接口调用，不直接读写密钥存储。

各服务密钥保存在 `milo_ai_settings_v1`，只允许扩展自有页面修改和测试。后台返回 UI 的摘要只含模型 / configured，不含密钥值。首次保存配置时迁移旧 DeepSeek 密钥，不会丢失既有单词本。

每家服务缓存上限 500 条 / 约 1 MB，四家合计至多约 4 MB；旧 DeepSeek 缓存继续使用。模型更换不复用旧模型结果。移除单家密钥不会移除其他服务配置；清除当前服务缓存不影响其他服务和单词本。

「保存并测试」绕过缓存，实际发送 hello 请求，所以可能产生少量费用。更换服务 / 模型 / 密钥时取消旧任务，防止结果串用。

## 验证边界

104 项单元测试验证四家请求路由、认证字段、输出参数、JSON 解析、旧密钥迁移、缓存隔离、配置写入并发、请求取消与连接测试。演示截图使用真实构建 UI 与固定背景响应，验证服务切换、字段更新、保存、测试提示和密钥输入框清空。

本次没有智谱、小米和 MiniMax 的用户凭据，因此未声称三家真实账户网络实测成功。请在自己的配置中使用「保存并测试」验证账户与模型可用性。
