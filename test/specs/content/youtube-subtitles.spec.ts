jest.mock('@/services/translation/paragraphs', () => ({
  translateParagraphs: jest.fn(),
  cancelPageTranslation: jest.fn(async () => true)
}))

import {
  createInteractiveSubtitles,
  READY_STATUS
} from '@/content/youtube-subtitles'
import { MAX_PARAGRAPHS } from '@/services/translation/limits'

const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

const cues = [
  { start: 1000, end: 3000, text: 'Resilience is a skill.' },
  { start: 3000, end: 5000, text: "Don't give up." }
]

describe('interactive YouTube subtitles', () => {
  let video: HTMLVideoElement
  let paused: boolean
  let layer: ReturnType<typeof createInteractiveSubtitles> | undefined
  const shadow = () =>
    document.querySelector<HTMLElement>('[data-milo-interactive]')!.shadowRoot!
  const words = () =>
    Array.from(shadow().querySelectorAll<HTMLElement>('.w')).map(
      node => node.textContent
    )

  beforeEach(() => {
    jest.useFakeTimers()
    document.title = 'Grit talk - YouTube'
    video = document.createElement('video')
    paused = false
    Object.defineProperty(video, 'paused', { get: () => paused })
    video.pause = jest.fn(() => {
      paused = true
    })
    video.play = jest.fn(async () => {
      paused = false
    })
    video.currentTime = 1.5
    video.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 760,
        bottom: 400,
        width: 760,
        height: 400
      } as any)
    document.body.appendChild(video)
  })
  afterEach(() => {
    if (layer) layer.destroy()
    layer = undefined
    document.body.innerHTML = ''
    jest.useRealTimers()
  })

  const create = (overrides: any = {}) => {
    const onWord = jest.fn()
    const onStatus = jest.fn()
    const translate = jest.fn(async (items: any[]) =>
      items.map(item => ({ id: item.id, text: `译:${item.text}` }))
    )
    const cancel = jest.fn()
    layer = createInteractiveSubtitles({
      video,
      cues,
      videoId: 'grit',
      onWord,
      onStatus,
      translate,
      cancel,
      ...overrides
    })
    return { onWord, onStatus, translate, cancel }
  }

  it('shows the current English line as words with its translation below', async () => {
    const { onStatus, translate } = create()
    expect(onStatus).toHaveBeenCalledWith(READY_STATUS)
    expect(words()).toEqual(['Resilience', 'is', 'a', 'skill'])
    expect(shadow().querySelector('.target')!.textContent).toBe('…')
    await settle()
    // Lines near playback are translated together in one request.
    expect(translate).toHaveBeenCalledTimes(1)
    expect(translate.mock.calls[0][0]).toEqual([
      { id: '0', text: 'Resilience is a skill.' },
      { id: '1', text: "Don't give up." }
    ])
    layer!.tick()
    expect(shadow().querySelector('.target')!.textContent).toBe(
      '译:Resilience is a skill.'
    )
    video.currentTime = 3.2
    layer!.tick()
    expect(words()).toEqual(["Don't", 'give', 'up'])
    expect(shadow().querySelector('.target')!.textContent).toBe(
      "译:Don't give up."
    )
    video.currentTime = 9
    layer!.tick()
    expect(shadow().querySelector<HTMLElement>('.box')!.hidden).toBe(true)
    expect(translate).toHaveBeenCalledTimes(1)
  })

  it('pauses while the pointer is on the subtitle and resumes when it leaves', () => {
    create()
    const box = shadow().querySelector('.box')!
    box.dispatchEvent(new Event('pointerenter'))
    expect(video.pause).toHaveBeenCalled()
    box.dispatchEvent(new Event('pointerleave'))
    expect(video.play).toHaveBeenCalledTimes(1)
    // A video the user had paused stays paused.
    paused = true
    box.dispatchEvent(new Event('pointerenter'))
    box.dispatchEvent(new Event('pointerleave'))
    expect(video.play).toHaveBeenCalledTimes(1)
  })

  it('opens the word card after a short hover and keeps the video paused until it closes', () => {
    const { onWord } = create()
    const box = shadow().querySelector('.box')!
    box.dispatchEvent(new Event('pointerenter'))
    const word = shadow().querySelectorAll<HTMLElement>('.w')[0]
    word.dispatchEvent(new Event('pointerover', { bubbles: true }))
    jest.advanceTimersByTime(200)
    expect(onWord).not.toHaveBeenCalled()
    jest.advanceTimersByTime(300)
    expect(onWord).toHaveBeenCalledWith(
      expect.objectContaining({
        word: 'Resilience',
        sentence: 'Resilience is a skill.',
        title: 'Grit talk',
        url: 'https://www.youtube.com/watch?v=grit&t=1s'
      })
    )
    expect(word.dataset.active).toBe('true')
    // Moving into the card does not restart the video.
    box.dispatchEvent(new Event('pointerleave'))
    expect(video.play).not.toHaveBeenCalled()
    layer!.cardClosed()
    expect(video.play).toHaveBeenCalledTimes(1)
    expect(word.dataset.active).toBeUndefined()
  })

  it('ignores a hover that moves on before the delay and synthetic clicks', () => {
    const { onWord } = create()
    const word = shadow().querySelectorAll<HTMLElement>('.w')[1]
    word.dispatchEvent(new Event('pointerover', { bubbles: true }))
    jest.advanceTimersByTime(200)
    word.dispatchEvent(new Event('pointerout', { bubbles: true }))
    jest.advanceTimersByTime(1000)
    word.click()
    expect(onWord).not.toHaveBeenCalled()
  })

  it('keeps the English line when translation fails and retries later', async () => {
    let now = 0
    jest.spyOn(Date, 'now').mockImplementation(() => now)
    const translate = jest
      .fn()
      .mockRejectedValueOnce(new Error('免费翻译暂时繁忙'))
      .mockImplementation(async (items: any[]) =>
        items.map(item => ({ id: item.id, text: '好' }))
      )
    const { onStatus } = create({ translate })
    await settle()
    expect(onStatus).toHaveBeenLastCalledWith(
      '字幕翻译失败：免费翻译暂时繁忙 · 将自动重试'
    )
    expect(words()).toEqual(['Resilience', 'is', 'a', 'skill'])
    expect(shadow().querySelector('.target')!.textContent).toBe('')
    layer!.tick()
    await settle()
    expect(translate).toHaveBeenCalledTimes(1)
    now = 11000
    layer!.tick()
    await settle()
    expect(translate).toHaveBeenCalledTimes(2)
    expect(onStatus).toHaveBeenLastCalledWith(READY_STATUS)
    expect(shadow().querySelector('.target')!.textContent).toBe('好')
  })

  it('cancels a pending translation and removes itself on destroy', async () => {
    const { cancel } = create({
      translate: jest.fn(() => new Promise(() => undefined))
    })
    await settle()
    layer!.destroy()
    layer = undefined
    expect(cancel).toHaveBeenCalledWith(expect.stringMatching(/^subtitle_/))
    expect(document.querySelector('[data-milo-interactive]')).toBeNull()
  })

  it('never asks for more paragraphs than the background accepts', async () => {
    const many = Array.from({ length: 30 }, (_, index) => ({
      start: index * 1000,
      end: index * 1000 + 1000,
      text: `Line number ${index}.`
    }))
    const { translate } = create({ cues: many })
    for (let i = 0; i < 6; i++) await settle()
    const sizes = translate.mock.calls.map(([items]: any[]) => items.length)
    // The lookahead is longer than one request, so it must arrive in pieces.
    expect(sizes.length).toBeGreaterThan(1)
    expect(Math.max(...sizes)).toBeLessThanOrEqual(MAX_PARAGRAPHS)
  })

  it('translates a repeated line once and reuses it everywhere', async () => {
    // "[music]" recurs all through a video, sometimes many lines in a row.
    const repeated = Array.from({ length: 12 }, (_, index) => ({
      start: index * 1000,
      end: index * 1000 + 1000,
      text: '[music]'
    }))
    const { translate } = create({
      cues: [
        ...repeated,
        { start: 12000, end: 14000, text: 'Then the talk begins.' }
      ]
    })
    for (let i = 0; i < 8; i++) await settle()
    const asked = translate.mock.calls.flatMap(([items]: any[]) =>
      items.map((item: any) => item.text)
    )
    expect(asked.filter((text: string) => text === '[music]')).toHaveLength(1)
    expect(new Set(asked).size).toBe(asked.length)
    // Every recurring line is filled in from that single answer.
    video.currentTime = 0.5
    layer!.tick()
    expect(shadow().querySelector('.target')!.textContent).toBe('译:[music]')
    video.currentTime = 11.5
    layer!.tick()
    expect(shadow().querySelector('.target')!.textContent).toBe('译:[music]')
  })
})
