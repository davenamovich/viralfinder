"use client";

import { useScoutStore } from "@/lib/trend-scout/store";
import {
  COUNTRY_OPTIONS,
  CONTENT_TYPE_VALUES,
  NICHE_VALUES,
  type Niche,
  type TimeWindow,
  type ContentType,
} from "@/lib/trend-scout/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const TIME_WINDOWS: { value: TimeWindow; label: string }[] = [
  { value: "now", label: "Now" },
  { value: "24h", label: "Past 24 hours" },
  { value: "7d", label: "Past 7 days" },
  { value: "30d", label: "Past 30 days" },
];

export function FilterBar({ onRefresh }: { onRefresh?: () => void }) {
  const filters = useScoutStore((s) => s.filters);
  const setFilter = useScoutStore((s) => s.setFilter);

  const country = COUNTRY_OPTIONS.find((c) => c.code === filters.country) ?? COUNTRY_OPTIONS[0];
  const languageOptions = country.languages;

  return (
    <div className="pr-border-grad rounded-xl bg-card/70 backdrop-blur-sm">
      <div className="p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 text-xs text-[var(--pr-text-mute)] uppercase tracking-[0.18em]">
            <Sparkles className="h-3.5 w-3.5 text-[var(--pr-gold)]" />
            <span>Discovery filters</span>
          </div>
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md text-[var(--pr-text-dim)] hover:text-foreground hover:bg-white/[0.04] transition-colors"
            aria-label="Refresh feed"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {/* Country */}
          <Field label="Country">
            <Select
              value={filters.country}
              onValueChange={(v) => {
                const c = COUNTRY_OPTIONS.find((o) => o.code === v) ?? COUNTRY_OPTIONS[0];
                setFilter("country", c.code);
                // also set language to that country's first language if current isn't supported
                if (!c.languages.find((l) => l.code === filters.language)) {
                  setFilter("language", c.languages[0].code);
                }
              }}
            >
              <SelectTrigger className="bg-background/60 border-white/10 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-white/10 max-h-72">
                {COUNTRY_OPTIONS.map((c) => (
                  <SelectItem key={c.code} value={c.code} className="text-sm">
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* Language */}
          <Field label="Output language">
            <Select
              value={filters.language}
              onValueChange={(v) => setFilter("language", v)}
            >
              <SelectTrigger className="bg-background/60 border-white/10 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-white/10 max-h-72">
                {languageOptions.map((l) => (
                  <SelectItem key={l.code} value={l.code} className="text-sm">
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* Niche */}
          <Field label="Niche">
            <Select
              value={filters.niche}
              onValueChange={(v) => setFilter("niche", v as Niche | "All")}
            >
              <SelectTrigger className="bg-background/60 border-white/10 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-white/10 max-h-72">
                <SelectItem value="All" className="text-sm">All niches</SelectItem>
                {NICHE_VALUES.map((n) => (
                  <SelectItem key={n} value={n} className="text-sm">{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* Time window */}
          <Field label="Time window">
            <Select
              value={filters.timeWindow}
              onValueChange={(v) => setFilter("timeWindow", v as TimeWindow)}
            >
              <SelectTrigger className="bg-background/60 border-white/10 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-white/10 max-h-72">
                {TIME_WINDOWS.map((w) => (
                  <SelectItem key={w.value} value={w.value} className="text-sm">
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* Content type */}
          <Field label="Content type">
            <Select
              value={filters.contentType}
              onValueChange={(v) => setFilter("contentType", v as ContentType)}
            >
              <SelectTrigger className="bg-background/60 border-white/10 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-white/10 max-h-72">
                {CONTENT_TYPE_VALUES.map((c) => (
                  <SelectItem key={c} value={c} className="text-sm">{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <span className={cn("text-[10px] uppercase tracking-[0.18em] text-[var(--pr-text-mute)]")}>
        {label}
      </span>
      {children}
    </div>
  );
}
