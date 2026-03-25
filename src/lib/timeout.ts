const DEFAULT_TIMEOUT_MESSAGE = 'OPERATION_TIMEOUT'

export async function withTimeout<T>(
  promise: PromiseLike<T> | Promise<T>,
  timeoutMs: number,
  message = DEFAULT_TIMEOUT_MESSAGE
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs)
  })

  try {
    return await Promise.race([Promise.resolve(promise), timeoutPromise])
  } finally {
    clearTimeout(timeoutId!)
  }
}
