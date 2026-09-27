import { manageYouTubeCaptions } from '@/background/youtube-captions'
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
