/**
 * Trend Scout UI state.
 *
 * Single-page-app routing is handled here via a `view` field because the
 * project's preview environment only exposes the `/` route to the user.
 * The store also owns the filters and the selected-trend id.
 */

import { create } from "zustand";
import type {
  ContentType,
  Niche,
  TimeWindow,
  TrendOpportunity,
} from "./types";

export type View = "scout" | "radar" | "telegram";

interface ScoutState {
  view: View;
  setView: (v: View) => void;

  filters: {
    country: string;
    language: string;
    niche: Niche | "All";
    timeWindow: TimeWindow;
    contentType: ContentType;
  };
  setFilter: <K extends keyof ScoutState["filters"]>(key: K, value: ScoutState["filters"][K]) => void;

  selectedTrendId: string | null;
  selectTrend: (id: string | null) => void;

  /** cached trends loaded from the API */
  trends: TrendOpportunity[];
  setTrends: (trends: TrendOpportunity[]) => void;
  loading: boolean;
  setLoading: (b: boolean) => void;
  error: string | null;
  setError: (s: string | null) => void;

  /** the active tab on the trend detail view */
  detailTab: "brief" | "sources" | "international" | "actions" | "bridge";
  setDetailTab: (t: ScoutState["detailTab"]) => void;

  /** confirm modal for rights-unverified sources */
  rightsConfirm: {
    open: boolean;
    videoId: string | null;
    onConfirm: (() => void) | null;
  };
  openRightsConfirm: (videoId: string, onConfirm: () => void) => void;
  closeRightsConfirm: () => void;

  /** toast feedback for routing actions */
  lastRoutingMessage: string | null;
  setLastRoutingMessage: (s: string | null) => void;
}

export const useScoutStore = create<ScoutState>((set) => ({
  view: "scout",
  setView: (v) => set({ view: v }),

  filters: {
    country: "US",
    language: "en",
    // Default to "All" so the feed always populates. Today's Google Trends
    // items often don't fall into a single niche (sports, celebs, breaking
    // news) — defaulting to a specific niche shows an empty feed and feels
    // broken. Users who want a specific niche can filter via the dropdown.
    niche: "All",
    timeWindow: "24h",
    contentType: "Clip",
  },
  setFilter: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: value } })),

  selectedTrendId: null,
  selectTrend: (id) => set({ selectedTrendId: id }),

  trends: [],
  setTrends: (trends) => set({ trends }),
  loading: false,
  setLoading: (b) => set({ loading: b }),
  error: null,
  setError: (s) => set({ error: s }),

  detailTab: "brief",
  setDetailTab: (t) => set({ detailTab: t }),

  rightsConfirm: { open: false, videoId: null, onConfirm: null },
  openRightsConfirm: (videoId, onConfirm) =>
    set({ rightsConfirm: { open: true, videoId, onConfirm } }),
  closeRightsConfirm: () =>
    set({ rightsConfirm: { open: false, videoId: null, onConfirm: null } }),

  lastRoutingMessage: null,
  setLastRoutingMessage: (s) => set({ lastRoutingMessage: s }),
}));
