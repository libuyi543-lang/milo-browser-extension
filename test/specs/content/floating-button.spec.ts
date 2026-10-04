import { DEFAULT_PREFERENCES } from '@/models/TranslationPreferences'

const mockSend = jest.fn(async (_msg: any) => ({}))
let mockPreferences: any = { ...DEFAULT_PREFERENCES }
jest.mock('@/_helpers/browser-api', () => ({ message: { send: (msg: any) => mockSend(msg) } }))
jest.mock('@/_helpers/extension-lifecycle', () => ({ isExtensionContextValid: () => true }))
jest.mock('@/services/translation/general', () => ({ getPreferences: async () => mockPreferences }))

import { setupFloatingButton } from '@/content/floating-button'
import { PageTranslation } from '@/content/page-translation'

const flush = () => new Promise(resolve => setTimeout(resolve))
const shadow = () => {
  const host = document.querySelector<HTMLElement>('[data-milo-floating-button]')
  return host && host.shadowRoot!
}

describe('page-edge floating button', () => {
  afterEach(() => {
    mockPreferences = { ...DEFAULT_PREFERENCES }
    mockSend.mockClear()
    document.querySelectorAll('.milo-external').forEach(node => node.remove())
  })

  it('toggles page translation and reflects its state', async () => {
    const onClick = jest.fn()
    const button = setupFloatingButton(onClick)
    await flush()
    const root = shadow()!
    const main = root.querySelector<HTMLButtonElement>('.main')!
    expect(main.getAttribute('aria-label')).toContain('翻译此页')
    main.click()
    // Synthetic clicks are ignored, like other Milo controls.
    expect(onClick).not.toHaveBeenCalled()
    button.update({ active: true, running: true, failed: false })
    expect(root.querySelector<HTMLElement>('.dock')!.dataset.state).toBe('running')
    expect(main.getAttribute('aria-label')).toBe('正在翻译，点击停止')
    button.update({ active: true, running: false, failed: false })
    expect(main.getAttribute('aria-pressed')).toBe('true')
    expect(main.getAttribute('aria-label')).toBe('恢复原文')
    button.cleanup()
    expect(shadow()).toBeNull()
  })

  it.each([
    ['turned off', { floatingButton: false }],
    ['hidden on this site', { floatingHiddenSites: ['localhost'] }],
    ['excluded from translation', { excludedSites: ['localhost'] }]
  ])('stays away when %s', async (_name, patch) => {
    mockPreferences = { ...DEFAULT_PREFERENCES, ...patch }
    const button = setupFloatingButton(jest.fn())
    await flush()
    expect(shadow()).toBeNull()
    button.cleanup()
  })

  it('hides for the current site through the background, then disappears', async () => {
    jest.useFakeTimers()
    const button = setupFloatingButton(jest.fn())
    await Promise.resolve()
    await Promise.resolve()
    const root = shadow()!
    root.querySelector<HTMLButtonElement>('.close')!.click()
    const items = root.querySelectorAll<HTMLButtonElement>('.menu button')
    expect(Array.from(items).map(item => item.textContent)).toEqual(['在此网站隐藏', '在所有网站隐藏'])
    items[0].click()
    expect(mockSend).toHaveBeenCalledWith({ type: 'MILO_FLOATING_BUTTON', payload: { action: 'hide-site' } })
    expect(root.querySelector('.toast')!.textContent).toContain('已隐藏')
    jest.advanceTimersByTime(3000)
    expect(shadow()).toBeNull()
    button.cleanup()
    jest.useRealTimers()
  })

  it('reports page translation progress to listeners', async () => {
    document.body.innerHTML = '<p>English paragraph to translate.</p>'
    const states: any[] = []
    const controller = new PageTranslation(async items => items.map(item => ({ id: item.id, text: '中文' })))
    controller.onChange(state => states.push(state))
    controller.toggle()
    await flush()
    expect(states[0]).toEqual({ active: true, running: true, failed: false })
    expect(states[states.length - 1]).toEqual({ active: true, running: false, failed: false })
    controller.clear()
    expect(states[states.length - 1]).toEqual({ active: false, running: false, failed: false })
    document.body.innerHTML = ''
  })
})
