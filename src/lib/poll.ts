import { useEffect, useState } from "react";

// Shared polling: every component asking for the same key reuses one request/timer.

interface Entry<T> {
  data?: T;
  error?: string;
  at: number;
  fetching: boolean;
  timer?: number;
  subs: Set<() => void>;
}

const cache = new Map<string, Entry<unknown>>();

export function usePolled<T>(key: string | null, fetcher: () => Promise<T>, every: (data: T | undefined) => number) {
  const [, rerender] = useState(0);

  useEffect(() => {
    if (!key) return;
    let entry = cache.get(key) as Entry<T> | undefined;
    if (!entry) cache.set(key, (entry = { at: 0, fetching: false, subs: new Set() }));
    const e = entry;
    const notify = () => rerender((n) => n + 1);
    e.subs.add(notify);

    const tick = async () => {
      e.timer = undefined;
      e.fetching = true;
      try {
        e.data = await fetcher();
        e.error = undefined;
      } catch (err) {
        e.error = (err as Error).message;
      }
      e.fetching = false;
      e.at = Date.now();
      e.subs.forEach((f) => f());
      if (e.subs.size) e.timer = window.setTimeout(tick, every(e.data));
    };

    if (!e.timer && !e.fetching) {
      const age = Date.now() - e.at;
      const wait = e.at ? every(e.data) - age : 0;
      if (wait > 0) e.timer = window.setTimeout(tick, wait);
      else tick();
    }
    notify();
    return () => {
      e.subs.delete(notify);
      if (!e.subs.size) {
        clearTimeout(e.timer);
        e.timer = undefined;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const e = key ? (cache.get(key) as Entry<T> | undefined) : undefined;
  return { data: e?.data, error: e?.error };
}

/** One-shot cached fetch with a TTL (scoreboards, searches). */
const memo = new Map<string, { at: number; p: Promise<unknown> }>();
export function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.p as Promise<T>;
  const p = fn().catch((e) => {
    memo.delete(key);
    throw e;
  });
  memo.set(key, { at: Date.now(), p });
  return p;
}
