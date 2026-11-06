import { load, save } from "./storage";

// In Electron secrets go to the Keychain-backed store in the main process.
// In a plain browser (npm run dev:web) they fall back to localStorage.

export async function getSecret(id: string): Promise<string | null> {
  if (window.sportsview) return window.sportsview.getSecret(id);
  return load<Record<string, string>>("secrets", {})[id] ?? null;
}

export async function setSecret(id: string, value: string | null) {
  if (window.sportsview) return window.sportsview.setSecret(id, value);
  const all = load<Record<string, string>>("secrets", {});
  if (value == null) delete all[id];
  else all[id] = value;
  save("secrets", all);
}
