jest.mock('@/_helpers/browser-api', () => {
  const handlers: Record<string, any> = {}
  return {
    message: {
      handlers,
      addListener: jest.fn((type, handler) => {
        handlers[type] = handler
      }),
      removeListener: jest.fn(type => {
        delete handlers[type]
      })
    }
  }
})
jest.mock('@/services/translation/general', () => ({
  getPreferences: jest.fn(async () => ({ target: 'zh-CN', subtitles: false })),
  translateText: jest.fn(async () => '中文字幕')
}))
jest.mock('@/services/translation/cancel', () => ({
  cancelTranslation: jest.fn(async () => undefined)
}))
import { message } from '@/_helpers/browser-api'
import { translateText } from '@/services/translation/general'
import { setupVideoSubtitles } from '@/content/video-subtitles'
import { supportsVideoControls, videoContainer } from '@/content/video-controls'

const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}
describe('video subtitle lifecycle', () => {
  let cleanup: (() => void) | undefined
  let now = 0
  const advance = (ms: number) => {
    now += ms
    jest.advanceTimersByTime(ms)
  }
  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    now = 0
    jest.spyOn(Date, 'now').mockImplementation(() => now)
    ;(translateText as jest.Mock).mockReset()
    ;(translateText as jest.Mock).mockResolvedValue('中文字幕')
    document.body.innerHTML =
      '<div id="movie_player"><video></video><div class="ytp-caption-window-container" style="opacity:.7"><span class="ytp-caption-segment">An English caption.</span></div></div>'
    const video = document.querySelector('video')!
    video.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      bottom: 300,
      right: 600,
      width: 600,
      height: 300,
      toJSON: () => ''
    })
  })
  afterEach(() => {
    if (cleanup) cleanup()
    cleanup = undefined
    jest.useRealTimers()
    jest.restoreAllMocks()
    document.body.innerHTML = ''
  })
  it('supports only intended sites and scopes X captions to the outer player', () => {
    expect(supportsVideoControls('www.youtube.com')).toBe(true)
    expect(supportsVideoControls('x.com')).toBe(true)
    expect(supportsVideoControls('youtube.com.example.org')).toBe(false)
    document.body.innerHTML =
      '<div data-testid="videoPlayer"><div data-testid="videoComponent"><video></video></div></div>'
    expect(
      videoContainer(document.querySelector('video')!).dataset.testid
    ).toBe('videoPlayer')
  })
  it('does not translate until enabled; hides and restores native captions without repeated requests', async () => {
    cleanup = setupVideoSubtitles()
    await settle()
    expect(translateText).not.toHaveBeenCalled()
    await (message as any).handlers.MILO_TOGGLE_SUBTITLES()
    advance(600)
    await settle()
    expect(translateText).toHaveBeenCalledTimes(1)
    expect(
      document.querySelector('[data-milo-subtitles]')!.textContent
    ).toContain('中文字幕')
    expect(
      (document.querySelector('.ytp-caption-window-container') as HTMLElement)
        .style.opacity
    ).toBe('0')
    advance(1200)
    await settle()
    expect(translateText).toHaveBeenCalledTimes(1)
    await (message as any).handlers.MILO_TOGGLE_SUBTITLES()
    expect(document.querySelector('[data-milo-subtitles]')).toBeNull()
    expect(
      (document.querySelector('.ytp-caption-window-container') as HTMLElement)
        .style.opacity
    ).toBe('0.7')
  })
  it('debounces changing partial captions and ignores a late response after disabling', async () => {
    let complete: (text: string) => void = () => undefined
    ;(translateText as jest.Mock).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          complete = resolve
        })
    )
    cleanup = setupVideoSubtitles()
    await settle()
    await (message as any).handlers.MILO_TOGGLE_SUBTITLES()
    document.querySelector('.ytp-caption-segment')!.textContent =
      'Changed caption.'
    advance(200)
    await settle()
    expect(translateText).not.toHaveBeenCalled()
    advance(400)
    await settle()
    expect(translateText).toHaveBeenCalledTimes(1)
    await (message as any).handlers.MILO_TOGGLE_SUBTITLES()
    complete('迟到的回答')
    await settle()
    expect(document.querySelector('[data-milo-subtitles]')).toBeNull()
  })
  it('reads a native caption track and preserves user changes to its mode', async () => {
    const track = {
      kind: 'captions',
      language: 'en',
      mode: 'showing',
      activeCues: [{ text: 'X native cue.' }]
    }
    Object.defineProperty(document.querySelector('video')!, 'textTracks', {
      configurable: true,
      value: [track]
    })
    cleanup = setupVideoSubtitles()
    await settle()
    await (message as any).handlers.MILO_TOGGLE_SUBTITLES()
    advance(600)
    await settle()
    expect(translateText).toHaveBeenCalledWith(
      'X native cue.',
      'zh-CN',
      expect.any(String)
    )
    expect(track.mode).toBe('hidden')
    track.mode = 'disabled'
    await (message as any).handlers.MILO_TOGGLE_SUBTITLES()
    expect(track.mode).toBe('disabled')
  })
  it('auto-enables YouTube CC and restores it when the user disables Milo', async () => {
    const button = document.createElement('button')
    button.className = 'ytp-subtitles-button'
    button.setAttribute('aria-pressed', 'false')
    button.onclick = () =>
      button.setAttribute(
        'aria-pressed',
        button.getAttribute('aria-pressed') === 'false' ? 'true' : 'false'
      )
    document.querySelector('#movie_player')!.appendChild(button)
    cleanup = setupVideoSubtitles()
    await settle()
    await (message as any).handlers.MILO_TOGGLE_SUBTITLES()
    expect(button.getAttribute('aria-pressed')).toBe('true')
    await (message as any).handlers.MILO_TOGGLE_SUBTITLES()
    expect(button.getAttribute('aria-pressed')).toBe('false')
  })
})
