# 输入框三连空格中译英

在普通输入 / 搜索框或 textarea 中输入中文，快速连续敲三下空格，即可把当前输入框的完整内容翻译成英文并原位替换。使用「管理 API」当前选择的 DeepSeek、智谱、小米 MiMo 或 MiniMax。

前两下空格保持普通输入；第三下检测成功时清理本次快捷键产生的空格，然后开始请求。敲击间隔需在 1.2 秒以内，不能使用按住空格的自动重复。若原先选中了输入框文本，触发时会先恢复它，再翻译完整原内容。

输入框中的中文输入法候选确认、修饰键 + 空格、纯英文、密码 / 验证码 / 只读字段不触发。当前最多 2000 字符，支持顶层页面普通输入、textarea 和基础 contenteditable；复杂编辑器及 iframe 中的字段尚未接入。

## 编辑保护与费用

- 只有三次敲击被识别后才发送当前输入框内容，不会因为普通输入或选择文字自动调用 AI。
- 其他表单字段、URL 与网页标题不随输入翻译发送。
- 继续输入、焦点切换或 Escape 会取消请求。写回前再次校验字段内容和节点，防止迟到的回答覆盖新输入。
- 翻译失败保留原中文，并显示重试入口。不会自动搜索、提交表单或发送消息。
- 结果使用纯文本写入。优先通过浏览器原生编辑命令保留撤销与 React 状态更新；不支持原生命令时使用标准字段 setter 与 input 通知，后备路径不保证撤销历史。
- 中译英缓存为独立 `input` 类型、有效期 7 天，与词义 / 正文译文隔离，沿用每家服务 500 条 / 约 1 MB 上限。
- AI 费用以当前服务账户的实际调用为准。取消已发出的请求可能仍收费。

## 工程入口

`src/content/input-translation/shortcut.ts` 处理手势和编辑状态，`selection.ts` 捕获快照与安全替换。`MiloInputPopup` 展示进度、失败和重试，通过服务与消息调用后台 `translateInputWithAI`，复用现有排队、取消、缓存与多 provider 适配。

HTML 编辑行为参考 [文本范围替换](https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/setRangeText)、[InputEvent](https://developer.mozilla.org/en-US/docs/Web/API/InputEvent) 和 [原生编辑命令](https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand)。`execCommand` 已弃用，当前仅作为保留浏览器编辑历史的优先路径，并提供后备方案。

## 验证

140 项单元测试通过，覆盖手势间隔、长按、IME、选中范围恢复、中途编辑、数据校验、缓存和取消。`scripts/test-input-translation.js` 加载真实 MV3 扩展，在本地固定搜索 / React / 基础编辑器示例中检查三连空格、全文替换、撤销、受控状态、编辑保护及原有划词链路。模拟 AI 回答，不声称 Google 线上或所有编辑器均已实测。
