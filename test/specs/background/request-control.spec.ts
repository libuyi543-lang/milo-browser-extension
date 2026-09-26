import { cancellationError, RequestQueue, SingleFlight } from '@/background/request-control'

describe('request coalescing and cancellation', () => {
  it('does not abort a shared fetch when only one reader stops', async () => {
    const flight = new SingleFlight<string>()
    let finish: (value: string) => void = () => undefined
    let sharedSignal: AbortSignal | undefined
    const load = jest.fn((signal: AbortSignal) => { sharedSignal = signal; return new Promise<string>(resolve => { finish = resolve }) })
    const one = new AbortController()
    const two = new AbortController()
    const first = flight.run('same', load, one.signal)
    const second = flight.run('same', load, two.signal)
    const stopped = expect(first).rejects.toMatchObject({ name: 'AbortError' })
    await Promise.resolve()
    one.abort()
    await stopped
    expect(sharedSignal!.aborted).toBe(false)
    finish('结果')
    expect(await second).toBe('结果')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('aborts the underlying request after its last reader stops, and permits a new request', async () => {
    const flight = new SingleFlight<string>()
    let sharedSignal: AbortSignal | undefined
    const owner = new AbortController()
    const waiting = flight.run('same', signal => new Promise((_resolve, reject) => {
      sharedSignal = signal
      signal.addEventListener('abort', () => reject(cancellationError()))
    }), owner.signal)
    const stopped = expect(waiting).rejects.toMatchObject({ name: 'AbortError' })
    await Promise.resolve()
    owner.abort()
    await stopped
    expect(sharedSignal!.aborted).toBe(true)
    expect(await flight.run('same', async () => '新的结果')).toBe('新的结果')
  })

  it('limits active requests, cancels waiting work, and prioritizes word lookup', async () => {
    const queue = new RequestQueue(1)
    const order: string[] = []
    let release: () => void = () => undefined
    const active = queue.run(() => { order.push('active'); return new Promise<void>(resolve => { release = resolve }) })
    await Promise.resolve()
    const canceled = new AbortController()
    const never = jest.fn(async () => { order.push('canceled') })
    const waiting = queue.run(never, canceled.signal)
    const page = queue.run(async () => { order.push('page') })
    const word = queue.run(async () => { order.push('word') }, undefined, 1)
    const stopped = expect(waiting).rejects.toMatchObject({ name: 'AbortError' })
    canceled.abort()
    await stopped
    expect(order).toEqual(['active'])
    release()
    await Promise.all([active, page, word])
    expect(order).toEqual(['active', 'word', 'page'])
    expect(never).not.toHaveBeenCalled()
  })
})
