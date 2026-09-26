let invalidated = false
const cleanupCallbacks = new Set<() => void>()

export function isContextInvalidatedError(error: unknown): boolean {
  return (
    !!error &&
    /extension context invalidated/i.test(
      String((error as Error).message || error)
    )
  )
}

export function isExtensionContextValid(): boolean {
  if (invalidated) return false
  try {
    return !!browser.runtime.id
  } catch (_) {
    return false
  }
}

export function invalidateExtensionContext(): void {
  if (invalidated) return
  invalidated = true
  for (const cleanup of cleanupCallbacks) {
    try {
      cleanup()
    } catch (error) {
      if (!isContextInvalidatedError(error))
        console.warn('Milo cleanup failed', error)
    }
  }
  cleanupCallbacks.clear()
}

export function onContextInvalidated(cleanup: () => void): () => void {
  if (invalidated) cleanup()
  else cleanupCallbacks.add(cleanup)
  return () => {
    cleanupCallbacks.delete(cleanup)
  }
}

/** RxJS/event callbacks must consume their asynchronous delivery failures. */
export async function runSelectionTask(
  task: () => Promise<unknown>
): Promise<void> {
  if (!isExtensionContextValid()) {
    invalidateExtensionContext()
    return
  }
  try {
    await task()
  } catch (error) {
    if (isContextInvalidatedError(error) || !isExtensionContextValid()) {
      invalidateExtensionContext()
      return
    }
    console.warn('Milo selection delivery failed', error)
  }
}
