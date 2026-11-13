"use client";

/**
 * BYOK (Bring Your Own Key) store for the Viral Trend Bridge.
 *
 * Lets the user paste their P&R MCP key + Agent 37 key directly in the UI.
 * Keys are stored in localStorage on the client (NEVER in NEXT_PUBLIC_*
 * env vars, never in cookies). On every /api/bridge call, the keys are
 * sent in the POST body so the server route uses them for the actual MCP
 * call. Server-side env vars (PNR_MCP_KEY, AGENT37_API_KEY) are the
 * fallback when the user hasn't pasted keys.
 *
 * Security model:
 *   - Keys live in localStorage (client-side only). Anyone with browser
 *     access can read them — that's the user's own machine, their
 *     responsibility.
 *   - Keys are sent in the POST body to /api/bridge. The route uses them
 *     for the MCP call and never logs/persists them server-side.
 *   - Keys never appear in URLs, never go into NEXT_PUBLIC_*, never get
 *     baked into the client bundle.
 */

import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY_PNR = "pr_bridge_pnr_key";
const STORAGE_KEY_AGENT37 = "pr_bridge_agent37_key";

export interface BridgeKeys {
  pnrKey: string;
  agent37Key: string;
}

function readKeys(): BridgeKeys {
  try {
    const p = localStorage.getItem(STORAGE_KEY_PNR) ?? "";
    const a = localStorage.getItem(STORAGE_KEY_AGENT37) ?? "";
    return { pnrKey: p, agent37Key: a };
  } catch {
    return { pnrKey: "", agent37Key: "" };
  }
}

export function useBridgeKeys() {
  // Lazy-initialize from localStorage so we don't call setState in an effect
  // (avoids the cascading-render lint warning).
  const [keys, setKeys] = useState<BridgeKeys>(readKeys);
  const [loaded, setLoaded] = useState(true);

  // Sync across tabs / windows when localStorage changes elsewhere.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY_PNR || e.key === STORAGE_KEY_AGENT37) {
        setKeys(readKeys());
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const save = useCallback((next: Partial<BridgeKeys>) => {
    setKeys((cur) => {
      const updated = { ...cur, ...next };
      try {
        if (next.pnrKey !== undefined) {
          if (next.pnrKey) localStorage.setItem(STORAGE_KEY_PNR, next.pnrKey);
          else localStorage.removeItem(STORAGE_KEY_PNR);
        }
        if (next.agent37Key !== undefined) {
          if (next.agent37Key) localStorage.setItem(STORAGE_KEY_AGENT37, next.agent37Key);
          else localStorage.removeItem(STORAGE_KEY_AGENT37);
        }
      } catch {
        // ignore — best-effort persistence
      }
      return updated;
    });
  }, []);

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY_PNR);
      localStorage.removeItem(STORAGE_KEY_AGENT37);
    } catch {
      // ignore
    }
    setKeys({ pnrKey: "", agent37Key: "" });
  }, []);

  return { keys, save, clear, loaded };
}

/**
 * Returns true if either key is set (i.e. the bridge engine is "unlocked").
 * The user only needs one — P&R key for verify/create, Agent 37 key for
 * scheduling. They can use either alone.
 */
export function isBridgeUnlocked(keys: BridgeKeys): boolean {
  return !!keys.pnrKey || !!keys.agent37Key;
}

