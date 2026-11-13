"use client";

import { useScoutStore } from "@/lib/trend-scout/store";
import { cn } from "@/lib/utils";
import { Radar, Send, Sparkles } from "lucide-react";

export function Header() {
  const view = useScoutStore((s) => s.view);
  const setView = useScoutStore((s) => s.setView);

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/80 border-b border-white/5">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative h-9 w-9 rounded-lg pr-border-grad overflow-hidden shrink-0">
            <div className="absolute inset-0 bg-gradient-to-br from-[#2ad4ff] via-[#1aa9d4] to-[#ffb547]" />
            <div className="absolute inset-[1px] rounded-[7px] bg-background flex items-center justify-center">
              <span className="text-[15px] font-black pr-text-gradient leading-none">P&amp;R</span>
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--pr-text-mute)]">
              <span className="hidden sm:inline">Thought Engine</span>
              <span className="text-[var(--pr-electric)]">·</span>
              <span>Trend Scout</span>
            </div>
            <h1 className="text-sm sm:text-base font-semibold truncate">
              <span className="pr-text-gradient">Find the signal.</span>{" "}
              <span className="text-foreground/90">Build the version worth sharing.</span>
            </h1>
          </div>
        </div>

        <nav className="flex items-center gap-1 sm:gap-2 shrink-0">
          <NavButton
            active={view === "scout"}
            onClick={() => setView("scout")}
            icon={<Sparkles className="h-4 w-4" />}
            label="Scout"
          />
          <NavButton
            active={view === "radar"}
            onClick={() => setView("radar")}
            icon={<Radar className="h-4 w-4" />}
            label="Radar"
          />
          <NavButton
            active={view === "telegram"}
            onClick={() => setView("telegram")}
            icon={<Send className="h-4 w-4" />}
            label="Bot"
          />
        </nav>
      </div>
    </header>
  );
}

function NavButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all",
        active
          ? "bg-white/5 text-foreground pr-glow"
          : "text-[var(--pr-text-dim)] hover:text-foreground hover:bg-white/[0.03]",
      )}
      aria-current={active ? "page" : undefined}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
