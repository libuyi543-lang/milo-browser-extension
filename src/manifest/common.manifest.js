module.exports = {
  name: '__MSG_extension_name__',
  short_name: '__MSG_extension_short_name__',
  description: '__MSG_extension_description__',
  default_locale: 'zh_CN',
  icons: {
    '16': 'assets/icon-16.png',
    '48': 'assets/icon-48.png',
    '128': 'assets/icon-128.png'
  },
  permissions: [
    '<all_urls>',
    'storage',
    'tabs',
    'contextMenus',
    'activeTab',
    'tabCapture',
    'unlimitedStorage'
  ],
  commands: {
    'translate-page': {
      suggested_key: { default: 'Alt+Shift+Y', mac: 'Alt+Shift+Y' },
      description: 'Milo 翻译 / 恢复正文'
    },
    'open-workspace': {
      suggested_key: { default: 'Alt+Shift+M', mac: 'Alt+Shift+M' },
      description: '打开 Milo 翻译工作台'
    },
    'translate-area': {
      suggested_key: { default: 'Alt+Shift+O', mac: 'Alt+Shift+O' },
      description: 'Milo 圈选翻译'
    }
  }
}
