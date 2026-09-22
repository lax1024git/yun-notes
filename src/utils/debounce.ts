export type DebouncedFn<T extends (...args: never[]) => void> = T & {
  cancel: () => void
  flush: () => void
}

export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  ms: number,
): DebouncedFn<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastArgs: Parameters<T> | undefined

  const wrapped = ((...args: Parameters<T>) => {
    lastArgs = args
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      const a = lastArgs
      lastArgs = undefined
      if (a) fn(...a)
    }, ms)
  }) as DebouncedFn<T>

  wrapped.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
    lastArgs = undefined
  }

  wrapped.flush = () => {
    if (!timer || !lastArgs) return
    clearTimeout(timer)
    timer = undefined
    const a = lastArgs
    lastArgs = undefined
    fn(...a)
  }

  return wrapped
}
