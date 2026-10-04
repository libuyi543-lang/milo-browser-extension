/* Convert per-URL browser observations into a reviewable Markdown report. */
const fs = require('fs')
const path = require('path')
const root = path.resolve(__dirname, '..')
const inventory = require('../docs/p0-samples.json')
const web = require('../output/p0/web-audit.json')
const video = require('../output/p0/video-audit.json')
const mark = value => value === null || value === undefined ? '—' : value ? '✓' : '×'
const state = value => ({ pass: '通过', fail: '未通过', blocked: '待验' })[value] || value
const brief = text => String(text || '').replace(/\x1b\[[0-9;]*m/g, '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').slice(0, 110)
const summary = rows => rows.reduce((count, row) => {
  count[row.status] = (count[row.status] || 0) + 1
  return count
}, {})
const webRows = inventory.web.map(sample => {
  const result = web.results.find(item => item.id === sample.id)
  if (!result) throw new Error('Missing web result: ' + sample.id)
  return `| ${sample.id} | ${sample.category} | ${mark(result.originalIntact)} | ${mark(result.translationVisible)} | ${mark(result.restored)} | ${mark(result.noDuplicate)} | ${mark(result.noCrash)} | ${state(result.status)} | ${brief(result.detail)} |`
})
const videoRows = inventory.video.map(sample => {
  const result = video.results.find(item => item.id === sample.id)
  if (!result) throw new Error('Missing video result: ' + sample.id)
  const tracks = result.trackKinds || []
  const kind = tracks.length ?
    `${tracks.filter(item => item.languageCode === 'en' && item.kind !== 'asr').length ? '人工英文 ' : ''}${tracks.filter(item => item.languageCode === 'en' && item.kind === 'asr').length ? '自动英文 ' : ''}${tracks.filter(item => /^zh/.test(item.languageCode)).length ? '已有中文' : ''}`.trim() || `${tracks.length} 条轨道`
    : '无字幕轨'
  return `| ${sample.id} | ${kind} | ${mark(result.buttonVisible)} | ${tracks.length ? mark(result.chineseSubtitleVisible) : '—（无轨）'} | ${mark(result.restored)} | ${sample.id === 'V05' ? mark(result.fullscreenButtonVisible) : '—'} | ${state(result.status)} | ${brief(result.detail)} |`
})
const w = summary(web.results)
const v = summary(video.results)
const tick = String.fromCharCode(96)
const document = `# Milo P0 阅读链路逐例验收（${web.at.slice(0, 10)}）

## 方法与边界

- 在全新隔离 Chromium 配置中加载当前 Chrome 扩展，逐个访问下表的 **真实公开 URL**。正文翻译的 AI 回复由测试环境模拟，以便检查页面提取、插入、恢复与去重；这不证明真实服务商的质量或可用性。
- YouTube 使用真实公开页面、播放器和原生字幕轨，没有模拟字幕或翻译回复。**仅切换到中文轨道不算字幕可见**，必须在播放器字幕节点找到实际可见的中文字符。无轨视频以明确提示和恢复播放器状态为验收项。
- 表中的“待验”表示访问受限、页面未暴露可识别英文正文等，不能视为 Milo 通过。浏览器脚本的逐例结果还需要人工复核页面布局；真人首次使用测试仍未完成。
- 网页运行于 ${web.at}；视频运行于 ${video.at}。原始逐例机器记录在本地 ${tick}output/p0/web-audit.json${tick} 和 ${tick}output/p0/video-audit.json${tick}（构建输出目录，不随仓库提交）。固定 URL 清单是 [p0-samples.json](p0-samples.json)。

## 网页：${w.pass || 0} 通过、${w.fail || 0} 未通过、${w.blocked || 0} 待验（共 ${web.results.length}）

| ID | 类型 | 原文完整 | 译文可见 | 恢复正确 | 无重复 | 无扩展崩溃 | 结论 | 现场记录 |
| --- | --- | :---: | :---: | :---: | :---: | :---: | --- | --- |
${webRows.join('\n')}

W20 是输入框保护样本，“译文可见”不适用；验证的是原生全选与输入内容保持不变。W02 自动跳到中文版，没有英文正文；W17 返回 403；W18/W19 在当前隔离网络环境中请求失败。W14/W16 页面在本轮没有暴露可被 Milo 识别的英文段落，需分别判定是站点内容结构还是提取规则问题。

## 视频：${v.pass || 0} 通过、${v.fail || 0} 未通过、${v.blocked || 0} 待验（共 ${video.results.length}）

| ID | 实际轨道类型 | 按钮可见 | 中文字幕入画 | 关闭恢复 | 容器全屏按钮 | 结论 | 现场记录 |
| --- | --- | :---: | :---: | :---: | :---: | --- | --- |
${videoRows.join('\n')}

V09 没有字幕轨，插件给出明确提示并恢复原状态，因此按无轨样本通过。其余有字幕轨的视频本轮均未出现实际中文字符，**不通过**。补充诊断 V02：视频播放到约 9 秒、${tick}readyState=4${tick}，播放器选中 ${tick}zh-CN${tick}，但 YouTube 的 ${tick}/api/timedtext?lang=zh-CN${tick} 响应为 HTTP 200、**0 字节**；同页直接请求英文及中文字幕轨也都返回 0 字节。这提示当前匿名测试环境拿不到字幕正文，尚不能证明真实用户浏览器必然失败，也不能把轨道切换当成成功。

## 首次使用与界面状态

内部隔离浏览器走查已通过：无密钥时划词浮窗提示配置并能打开 AI 设置；配置测试密钥后可查词、保存原句、在单词本回看；正文翻译错误时可重试并恢复原文。模拟请求不使用真实密钥。内部走查需 **7 个主要交互动作**，设置后重新划词是额外动作。真人在不看说明时的步数、停顿点和是否能独立完成仍是**待验**；执行表见 [P0_FIRST_RUN_STUDY.md](P0_FIRST_RUN_STUDY.md)。

当前正文状态条展示翻译进度、停止、重试和恢复，并告知只发送正文段落；划词浮窗说明发送单词与原句。AI 设置页在保存密钥前说明各场景发送内容的范围；X 视频按钮旁也提示字幕文字会发往所选服务。YouTube 原生字幕切换不调用 AI。

## 未达到 P0 放行的事项

1. 在字幕服务可返回内容的普通 Chrome 环境复核 V01–V08、V10 的**实际中文入画**，并解决真实失败；当前 9 个有字幕轨样本未通过。
2. 在可访问 X 的网络环境逐例重测 W18、W19；补充 W14、W16 的站点结构诊断，并换成英文版或可访问页面完成 W02、W17。
3. 按测试单观察真实首次用户，记录每个人的步数、停顿和是否独立完成。脚本结果不能替代这项观察。
4. 对 20 个网页逐例人工检查译文的位置与原文视觉完整性，然后才可宣布 P0 验收完成。

## 可重复执行

${tick}${tick}${tick}sh
npm run lint && npm run type-check && npm test && npm run build
MILO_PLAYWRIGHT_MODULE=/path/to/playwright MILO_CHROMIUM_PATH=/path/to/chromium node scripts/test-p0-first-run.js
MILO_PLAYWRIGHT_MODULE=/path/to/playwright MILO_CHROMIUM_PATH=/path/to/chromium node scripts/audit-p0-web.js
MILO_PLAYWRIGHT_MODULE=/path/to/playwright MILO_CHROMIUM_PATH=/path/to/chromium node scripts/audit-p0-video.js
node scripts/write-p0-report.js
${tick}${tick}${tick}
`
fs.writeFileSync(path.join(root, 'docs/P0_AUDIT_2026-09-28.md'), document)
console.log(`P0 report: web ${JSON.stringify(w)}, video ${JSON.stringify(v)}`)
