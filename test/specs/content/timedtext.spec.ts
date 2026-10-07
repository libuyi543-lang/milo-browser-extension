import {
  cueAt,
  isEnglishTrack,
  parseTimedText,
  timedTextInfo,
  tokenize
} from '@/content/timedtext'

describe('YouTube timed text', () => {
  it('reads the track identity from the player request', () => {
    const info = timedTextInfo(
      'https://www.youtube.com/api/timedtext?v=abc123&lang=en&fmt=json3&pot=token'
    )
    expect(info).toEqual({
      videoId: 'abc123',
      language: 'en',
      translated: false,
      asr: false
    })
    expect(isEnglishTrack(info)).toBe(true)
    expect(
      isEnglishTrack(timedTextInfo('/api/timedtext?v=a&lang=en-GB&kind=asr'))
    ).toBe(true)
    // YouTube's own auto-translation is not an English source.
    expect(
      isEnglishTrack(timedTextInfo('/api/timedtext?v=a&lang=en&tlang=zh-Hans'))
    ).toBe(false)
    expect(isEnglishTrack(timedTextInfo('/api/timedtext?v=a&lang=es'))).toBe(
      false
    )
    expect(timedTextInfo('/api/timedtext?lang=en')).toBeNull()
    expect(timedTextInfo('/watch?v=a')).toBeNull()
  })

  it('parses manual json3 lines and skips window/append events', () => {
    const body = JSON.stringify({
      events: [
        { tStartMs: 0, dDurationMs: 99999, id: 1, wpWinPosId: 1 },
        {
          tStartMs: 1200,
          dDurationMs: 2000,
          segs: [{ utf8: 'Resilience is\n' }, { utf8: 'a skill.' }]
        },
        { tStartMs: 3200, dDurationMs: 10, aAppend: 1, segs: [{ utf8: '\n' }] },
        { tStartMs: 3500, dDurationMs: 1500, segs: [{ utf8: '[Music]' }] },
        { tStartMs: 5000, dDurationMs: 1500, segs: [{ utf8: ' \n ' }] }
      ]
    })
    // The 300ms gap before the next line is short: the line is held across it
    // rather than flickering off and back on.
    expect(parseTimedText(body)).toEqual([
      { start: 1200, end: 3500, text: 'Resilience is a skill.' },
      { start: 3500, end: 5000, text: '[Music]' }
    ])
  })

  it('rejoins word-by-word speech recognition into readable lines', () => {
    const body = JSON.stringify({
      events: [
        { tStartMs: 0, dDurationMs: 60000, id: 1 },
        {
          tStartMs: 1000,
          dDurationMs: 4000,
          wWinId: 1,
          segs: [
            { utf8: 'so' },
            { utf8: ' today', tOffsetMs: 300 },
            { utf8: ' we', tOffsetMs: 600 }
          ]
        },
        {
          tStartMs: 1900,
          dDurationMs: 3000,
          wWinId: 1,
          aAppend: 1,
          segs: [{ utf8: '\n' }]
        },
        {
          tStartMs: 1900,
          dDurationMs: 3000,
          wWinId: 1,
          segs: [{ utf8: 'talk' }, { utf8: ' about', tOffsetMs: 200 }]
        },
        // A long pause starts a new line.
        {
          tStartMs: 6000,
          dDurationMs: 2000,
          wWinId: 1,
          segs: [{ utf8: 'resilience' }]
        }
      ]
    })
    // The last word lands at 3300ms, but the line stays up until the next one
    // starts, so the viewer can finish reading it.
    expect(parseTimedText(body, true)).toEqual([
      { start: 1000, end: 6000, text: 'so today we talk about' },
      { start: 6000, end: 7200, text: 'resilience' }
    ])
  })

  it('keeps the opening line on screen long enough to read', () => {
    // One word at the very start: its own span is a fraction of a second, and
    // the next line is far away. A short line still gets reading time.
    const body = JSON.stringify({
      events: [
        { tStartMs: 0, dDurationMs: 60000, id: 1 },
        {
          tStartMs: 200,
          dDurationMs: 400,
          wWinId: 1,
          segs: [{ utf8: 'Hello' }]
        },
        { tStartMs: 30000, dDurationMs: 2000, segs: [{ utf8: 'everyone' }] }
      ]
    })
    const cues = parseTimedText(body, true)
    expect(cues[0].start).toBe(200)
    // 700ms plus 45ms per character, so a one-word line lasts about a second.
    expect(cues[0].end).toBeGreaterThanOrEqual(200 + 900)
    // A gap this long is a real silence, so the screen does clear before the next line.
    expect(cues[0].end).toBeLessThan(30000)
  })

  it('moves a sound tag to the front of the line', () => {
    const body = JSON.stringify({
      events: [
        { tStartMs: 0, dDurationMs: 60000, id: 1 },
        {
          tStartMs: 1000,
          dDurationMs: 4000,
          segs: [
            {
              utf8:
                "I think that's going [music] to be a huge challenge people are underestimating."
            }
          ]
        },
        {
          tStartMs: 6000,
          dDurationMs: 2000,
          segs: [{ utf8: 'And (applause) the crowd agreed, [Music] loudly.' }]
        }
      ]
    })
    expect(parseTimedText(body).map(cue => cue.text)).toEqual([
      "[music] I think that's going to be a huge challenge people are underestimating.",
      '[applause] [Music] And the crowd agreed, loudly.'
    ])
  })

  it('leaves lyrics and ordinary brackets alone', () => {
    const body = JSON.stringify({
      events: [
        { tStartMs: 0, dDurationMs: 60000, id: 1 },
        { tStartMs: 0, dDurationMs: 3000, segs: [{ utf8: '♪ Ooh baby ♪' }] },
        {
          tStartMs: 4000,
          dDurationMs: 3000,
          segs: [{ utf8: 'The ratio [1] is defined above.' }]
        }
      ]
    })
    expect(parseTimedText(body).map(cue => cue.text)).toEqual([
      'Ooh baby',
      'The ratio [1] is defined above.'
    ])
  })

  it('parses srv3 and legacy XML, decoding entities', () => {
    expect(
      parseTimedText(
        '<timedtext format="3"><body><p t="500" d="1500">It&#39;s <s>fine</s></p><p t="2000" d="1000"></p></body></timedtext>'
      )
    ).toEqual([{ start: 500, end: 2000, text: "It's fine" }])
    expect(
      parseTimedText(
        '<transcript><text start="1.5" dur="2">Tom &amp;amp; Jerry</text></transcript>'
      )
    ).toEqual([{ start: 1500, end: 3500, text: 'Tom & Jerry' }])
    expect(parseTimedText('')).toEqual([])
    expect(parseTimedText('{not json')).toEqual([])
  })

  it('finds the line on screen, including overlaps and gaps', () => {
    const cues = [
      { start: 0, end: 1000, text: 'a' },
      { start: 900, end: 3000, text: 'b' },
      { start: 5000, end: 6000, text: 'c' }
    ]
    expect(cueAt(cues, 500)).toBe(0)
    expect(cueAt(cues, 950)).toBe(1)
    expect(cueAt(cues, 2000)).toBe(1)
    expect(cueAt(cues, 4000)).toBe(-1)
    expect(cueAt(cues, 5999)).toBe(2)
    expect(cueAt(cues, 6000)).toBe(-1)
    expect(cueAt([], 10)).toBe(-1)
  })

  it('splits lines into look-up words and the text between them', () => {
    expect(tokenize("It's well-known, 2 o’clock.")).toEqual([
      { text: "It's", word: true },
      { text: ' ', word: false },
      { text: 'well-known', word: true },
      { text: ', 2 ', word: false },
      { text: 'o’clock', word: true },
      { text: '.', word: false }
    ])
  })
})
