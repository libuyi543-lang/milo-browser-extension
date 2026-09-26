export function cancellationError(): Error {
  const error = new Error('翻译已停止')
  error.name = 'AbortError'
  return error
}

/** Share a request without letting one canceled reader interrupt other readers. */
export class SingleFlight<T> {
  private jobs = new Map<
    string,
    {
      promise: Promise<T>
      controller: AbortController
      readers: number
      settled: boolean
    }
  >()

  run(
    key: string,
    load: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal
  ): Promise<T> {
    if (signal && signal.aborted) return Promise.reject(cancellationError())
    let job = this.jobs.get(key)
    if (!job || job.controller.signal.aborted) {
      const controller = new AbortController()
      const created = {
        controller,
        readers: 0,
        settled: false,
        promise: Promise.resolve(undefined as any) as Promise<T>
      }
      created.promise = Promise.resolve()
        .then(() => {
          if (controller.signal.aborted) throw cancellationError()
          return load(controller.signal)
        })
        .finally(() => {
          created.settled = true
          if (this.jobs.get(key) === created) this.jobs.delete(key)
        })
      // Every canceled consumer may have gone away before the underlying fetch settles.
      created.promise.catch(() => undefined)
      this.jobs.set(key, created)
      job = created
    }
    const shared = job
    shared.readers += 1
    const waiting = signal
      ? new Promise<T>((resolve, reject) => {
          const abort = () => reject(cancellationError())
          signal.addEventListener('abort', abort, { once: true })
          shared.promise.then(
            value => {
              signal.removeEventListener('abort', abort)
              resolve(value)
            },
            error => {
              signal.removeEventListener('abort', abort)
              reject(error)
            }
          )
        })
      : shared.promise
    return waiting.finally(() => {
      shared.readers -= 1
      if (!shared.readers && !shared.settled) shared.controller.abort()
    })
  }

  abortAll() {
    for (const job of this.jobs.values()) job.controller.abort()
  }
}

interface QueuedRequest {
  priority: number
  start: () => void
}

/** Bound API concurrency; short word lookups go before waiting page batches. */
export class RequestQueue {
  private active = 0
  private waiting: QueuedRequest[] = []
  constructor(private limit = 2) {
    this.limit = Math.max(1, limit)
  }

  run<T>(
    task: () => Promise<T>,
    signal?: AbortSignal,
    priority = 0
  ): Promise<T> {
    if (signal && signal.aborted) return Promise.reject(cancellationError())
    return new Promise<T>((resolve, reject) => {
      const abort = () => {
        const index = this.waiting.indexOf(job)
        if (index >= 0) {
          this.waiting.splice(index, 1)
          reject(cancellationError())
        }
      }
      const job: QueuedRequest = {
        priority,
        start: () => {
          if (signal) signal.removeEventListener('abort', abort)
          this.active += 1
          Promise.resolve()
            .then(() => {
              if (signal && signal.aborted) throw cancellationError()
              return task()
            })
            .then(resolve, reject)
            .finally(() => {
              this.active -= 1
              this.drain()
            })
        }
      }
      if (signal) signal.addEventListener('abort', abort, { once: true })
      this.waiting.push(job)
      this.waiting.sort((a, b) => b.priority - a.priority)
      this.drain()
    })
  }

  private drain() {
    while (this.active < this.limit && this.waiting.length)
      this.waiting.shift()!.start()
  }
}
