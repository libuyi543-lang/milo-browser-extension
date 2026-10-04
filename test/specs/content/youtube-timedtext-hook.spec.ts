import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(
  path.join(__dirname, '../../../assets/youtube-timedtext.js'),
  'utf8'
)

describe('YouTube timed-text page hook', () => {
  const originalFetch = window.fetch
  const originalOpen = XMLHttpRequest.prototype.open
  let received: any[]
  const listen = (event: MessageEvent) => {
    if (event.data && event.data.milo === 'timedtext') received.push(event.data)
  }
  const wait = () => new Promise(resolve => setTimeout(resolve, 10))

  beforeEach(() => {
    received = []
    delete (window as any).__MILO_TIMEDTEXT__
    window.addEventListener('message', listen)
  })
  afterEach(() => {
    window.removeEventListener('message', listen)
    window.fetch = originalFetch
    XMLHttpRequest.prototype.open = originalOpen
  })

  it('forwards caption responses from fetch and replays them on request', async () => {
    const fetchMock = jest.fn(async (url: string) => ({
      ok: true,
      url: `https://www.youtube.com${url}`,
      clone: () => ({ text: async () => '{"events":[]}' })
    }))
    window.fetch = fetchMock as any
    // eslint-disable-next-line no-new-func
    new Function(source)()
    await window.fetch('/youtubei/v1/player')
    await window.fetch('/api/timedtext?v=abc&lang=en&fmt=json3')
    await wait()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(received).toEqual([
      {
        milo: 'timedtext',
        url: 'https://www.youtube.com/api/timedtext?v=abc&lang=en&fmt=json3',
        text: '{"events":[]}'
      }
    ])
    // jsdom leaves event.source empty for postMessage; Chrome sets it to window.
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { milo: 'timedtext-replay' },
        source: window
      })
    )
    window.dispatchEvent(
      new MessageEvent('message', { data: { milo: 'timedtext-replay' } })
    )
    await wait()
    expect(received).toHaveLength(2)
    // Installing twice does not wrap twice.
    // eslint-disable-next-line no-new-func
    new Function(source)()
    await window.fetch('/api/timedtext?v=abc&lang=en')
    await wait()
    expect(received).toHaveLength(3)
  })

  it('forwards successful XHR caption responses only', async () => {
    // eslint-disable-next-line no-new-func
    new Function(source)()
    const respond = (status: number) => {
      const xhr = new XMLHttpRequest()
      xhr.open('GET', '/api/timedtext?v=xyz&lang=en&fmt=json3')
      Object.defineProperty(xhr, 'status', { value: status })
      Object.defineProperty(xhr, 'responseText', { value: '{"events":[1]}' })
      Object.defineProperty(xhr, 'responseURL', {
        value: 'https://www.youtube.com/api/timedtext?v=xyz&lang=en&fmt=json3'
      })
      xhr.dispatchEvent(new Event('load'))
    }
    respond(403)
    respond(200)
    await wait()
    expect(received).toEqual([
      {
        milo: 'timedtext',
        url: 'https://www.youtube.com/api/timedtext?v=xyz&lang=en&fmt=json3',
        text: '{"events":[1]}'
      }
    ])
  })
})
