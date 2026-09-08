/** A stalled service must report its stage; late-created resources are released. */
export async function loadStage<T>(
  label: string,
  operation: () => Promise<T>,
  progress: (label: string) => void = () => {},
  dispose?: (value: T) => void,
  timeoutMs = 30000,
): Promise<T> {
  progress(label);
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = operation().then((value) => {
    if (expired) dispose?.(value);
    return value;
  });
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          expired = true;
          reject(
            new Error(
              `Timed out while ${label.toLowerCase()}. Reload to retry; check the browser Console if this repeats.`,
            ),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
