import {
  manageYouTubeCaptions,
  registerYouTubeTimedTextHook
} from '@/background/youtube-captions'
describe('YouTube caption hook registration', () => {
  afterEach(() => {
    delete (window as any).chrome
  })
  it('registers the page hook once and refreshes it afterwards', async () => {
    let registered: any[] = []
    const scripting = {
      getRegisteredContentScripts: jest.fn(async () => registered),
      registerContentScripts: jest.fn(async (scripts: any[]) => {
        registered = scripts
      }),
      updateContentScripts: jest.fn(async () => undefined)
    }
    ;(window as any).chrome = { scripting }
    await registerYouTubeTimedTextHook()
    expect(scripting.registerContentScripts).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'milo-youtube-timedtext',
        js: ['assets/youtube-timedtext.js'],
        runAt: 'document_start',
        world: 'MAIN',
        matches: ['https://www.youtube.com/*', 'https://m.youtube.com/*']
      })
    ])
    await registerYouTubeTimedTextHook()
    expect(scripting.registerContentScripts).toHaveBeenCalledTimes(1)
    expect(scripting.updateContentScripts).toHaveBeenCalledTimes(1)
  })
})
describe('YouTube native caption switching', () => {
  let player: any
  let cc: HTMLButtonElement
  let current: any
  let tracks: any[]
  const english = {
    languageCode: 'en',
    languageName: 'English',
    kind: '',
    vss_id: '.en',
    is_translateable: true
  }
  beforeEach(() => {
    document.body.innerHTML =
      '<div id="movie_player"><button class="ytp-subtitles-button" aria-pressed="false"></button></div>'
    player = document.querySelector('#movie_player')
    cc = player.querySelector('button')
    cc.onclick = () =>
      cc.setAttribute(
        'aria-pressed',
        cc.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'
      )
    current = english
    tracks = [
      english,
      { languageCode: 'zh-CN', languageName: '中文', kind: '' }
    ]
    player.getVideoData = () => ({ video_id: 'test-video' })
    player.getOption = (_module: string, option: string) =>
      option === 'track'
        ? current
        : option === 'tracklist'
        ? tracks
        : [{ languageCode: 'zh-Hans', languageName: '中文（简体）' }]
    player.setOption = (_module: string, _option: string, track: any) => {
      current = track
      cc.setAttribute('aria-pressed', track.languageCode ? 'true' : 'false')
    }
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })
  it('uses an existing Chinese track in the original player and restores English/off on stop', () => {
    expect(manageYouTubeCaptions('start', 'zh-CN')).toMatchObject({
      ok: true,
      mode: 'native'
    })
    expect(current.languageCode).toBe('zh-CN')
    expect(cc.getAttribute('aria-pressed')).toBe('true')
    manageYouTubeCaptions('stop', 'zh-CN')
    expect(current.languageCode).toBe('en')
    expect(cc.getAttribute('aria-pressed')).toBe('false')
    expect(document.querySelector('[data-milo-subtitles]')).toBeNull()
  })
  it('uses the platform auto-translation language for English-only captions', () => {
    tracks = [english]
    expect(manageYouTubeCaptions('start', 'zh-CN')).toMatchObject({
      ok: true,
      mode: 'auto'
    })
    expect(current.languageCode).toBe('en')
    expect(current.translationLanguage).toEqual({
      languageCode: 'zh-Hans',
      languageName: '中文（简体）'
    })
  })
  it('includes automatic speech-recognition tracks when a video has no manual subtitles', () => {
    const automatic = { ...english, kind: 'asr', vss_id: 'a.en' }
    player.getOption = (_module: string, option: string, options?: any) =>
      option === 'track'
        ? current
        : option === 'tracklist'
        ? options?.includeAsr
          ? [automatic]
          : []
        : [{ languageCode: 'zh-Hans', languageName: '中文' }]
    expect(manageYouTubeCaptions('start', 'zh-CN')).toMatchObject({
      ok: true,
      mode: 'auto'
    })
    expect(current.kind).toBe('asr')
    expect(current.translationLanguage.languageCode).toBe('zh-Hans')
  })
  it('does not overwrite manual language changes or restore a previous video track', () => {
    manageYouTubeCaptions('start', 'zh-CN')
    current = { languageCode: 'ja' }
    manageYouTubeCaptions('stop', 'zh-CN')
    expect(current.languageCode).toBe('ja')
    current = english
    manageYouTubeCaptions('start', 'zh-CN')
    player.getVideoData = () => ({ video_id: 'another-video' })
    manageYouTubeCaptions('stop', 'zh-CN')
    expect(current.languageCode).toBe('zh-CN')
  })
  it('selects the English source track for Milo subtitles and restores the previous one', () => {
    current = { languageCode: 'zh-CN' }
    cc.setAttribute('aria-pressed', 'true')
    tracks = [
      { ...english, kind: 'asr', vss_id: 'a.en' },
      { ...english, languageCode: 'en-GB', vss_id: '.en-GB' },
      { languageCode: 'zh-CN', kind: '' }
    ]
    expect(manageYouTubeCaptions('start', 'en')).toMatchObject({
      ok: true,
      mode: 'native',
      videoId: 'test-video'
    })
    // A manual English track beats speech recognition.
    expect(current.languageCode).toBe('en-GB')
    expect(current.translationLanguage).toBeUndefined()
    manageYouTubeCaptions('stop', 'en')
    expect(current.languageCode).toBe('zh-CN')
  })
  it('never auto-translates into English and reports videos without English captions', () => {
    tracks = [{ languageCode: 'ja', kind: '', is_translateable: true }]
    current = {}
    expect(manageYouTubeCaptions('start', 'en')).toEqual({
      ok: false,
      error: '这个视频没有英文字幕，Milo 目前只支持英文视频'
    })
    expect(current).toEqual({})
  })
  it('does not overwrite the original snapshot across loading retries and reports missing subtitles', () => {
    manageYouTubeCaptions('start', 'zh-CN')
    manageYouTubeCaptions('start', 'zh-CN')
    manageYouTubeCaptions('stop', 'zh-CN')
    expect(current.languageCode).toBe('en')
    tracks = []
    expect(manageYouTubeCaptions('start', 'zh-CN')).toMatchObject({
      ok: false,
      retryable: true
    })
    cc.disabled = true
    expect(manageYouTubeCaptions('start', 'zh-CN')).toMatchObject({
      ok: false,
      retryable: false
    })
  })
})
