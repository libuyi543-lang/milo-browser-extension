import React from 'react'

/** A malformed background response must never remove the entire toolbar UI. */
export class PopupErrorBoundary extends React.Component<
  {},
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="milo-popup">
        <h1 className="milo-logo">Milo</h1>
        <p className="milo-lead" role="alert">
          窗口暂时无法打开。请在扩展管理页点击 Milo
          的「重新加载」，再重新打开图标。
        </p>
        <button
          className="milo-action"
          onClick={() => browser.tabs.create({ url: 'chrome://extensions' })}
        >
          打开扩展管理
        </button>
        <button className="milo-link" onClick={() => window.location.reload()}>
          重试窗口
        </button>
      </main>
    )
  }
}
