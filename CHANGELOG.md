# Milo Changelog

历史 Saladict 发布记录已移至 [docs/UPSTREAM_CHANGELOG.md](docs/UPSTREAM_CHANGELOG.md)，不代表 Milo 版本。

## 0.3.0

- 新增 DeepSeek / 智谱 GLM / 小米 MiMo / MiniMax 服务选择与独立模型、密钥配置。
- 兼容不同认证头、token 参数、思考输出与 JSON 格式。
- 保留旧版 DeepSeek 配置；更换服务 / 模型取消旧请求，缓存按服务独立并隔离模型。
- 保存并测试连接、移除单家密钥、获取密钥链接与工具栏固定说明。
- 104 项测试与实际 UI 演示验证通过；真实第三方服务可用性需用户使用自己的密钥测试。

## 0.2.4

- 使用 Milo 鼹鼠与蓝色铅笔图标，导出各浏览器图标尺寸。
- 补充中英文 README、功能展示、安装 / 隐私 / 贡献说明。
- 增加 GitHub 自动 lint、type-check、Milo tests、build 与安装包产物。

## 0.2.3

- 单词 / 正文持久缓存、重复请求共享、并发上限与划词优先级。
- 稳定选词延迟、取消失效请求、视口内正文优先。
- 浮窗根据实际高度定位，修复扩展重新加载后的无效上下文监听。

## 0.2.0–0.2.2

- DeepSeek Flash 翻译，用户自带 API Key。
- Command+A / Ctrl+A 原页面段落双语阅读。
- X / Twitter 正文范围识别、停止 / 重试 / 恢复。

## 0.1.0

- 基于 Saladict 成熟的划词与扩展基础设施完成初始 Milo 闭环。
- 极简浮窗、原句提取、本地 MiloWord 与 encounters。
- 同词追加遇见记录、保留开源许可与来源说明。
