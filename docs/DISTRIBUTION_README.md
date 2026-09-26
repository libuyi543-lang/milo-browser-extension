# Milo Browser Extension 0.3.1

划词看释义，保存原句与来源，在原网页双语阅读。

## 安装

Chrome 128+：打开 `chrome://extensions`，启用「开发者模式」，点击「加载已解压的扩展程序」，选择本目录（含 `manifest.json`）。

打开工具栏 Milo 图标，在「管理 API」选择 DeepSeek、智谱、小米 MiMo 或 MiniMax，保存对应密钥与模型。打开英文网页，划选一个词，点击「加入 Milo」。Mac 按 `⌘ A`，Windows 按 `Ctrl+A` 逐段翻译正文，再按一次恢复。输入框内仍是原生全选。

详情见 [安装教程](docs/INSTALL.md) 和 [隐私说明](PRIVACY.md)。更新后重新加载扩展并刷新阅读页面。

数据保存在当前浏览器本地，手机同步尚未实现。卸载扩展会删除本地数据；API 费用由所选服务账户承担。

## 源码与反馈

[GitHub 仓库、功能配图与反馈入口](https://github.com/libuyi543-lang/milo-browser-extension)。

## 开源来源

部分代码基于 Saladict，由 CRIMX 与贡献者开发。Milo 是独立衍生产品。原始许可与归属说明完整保留于 [LICENSE](LICENSE)、[NOTICE.md](NOTICE.md) 和 [TRADEMARKS.md](TRADEMARKS.md)。
