import { useCallback, useRef, useState } from 'react';

export function useMutation<TArgs extends unknown[], TResult = void>(
  fn: (...args: TArgs) => Promise<TResult>,
): {
  execute: (...args: TArgs) => Promise<TResult | undefined>;
  isPending: boolean;
  error: string | null;
  reset: () => void;
} {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const execute = useCallback(async (...args: TArgs): Promise<TResult | undefined> => {
    setIsPending(true);
    setError(null);
    try {
      return await fnRef.current(...args);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return undefined;
    } finally {
      setIsPending(false);
    }
  }, []);

  const reset = useCallback(() => setError(null), []);

  return { execute, isPending, error, reset };
}
