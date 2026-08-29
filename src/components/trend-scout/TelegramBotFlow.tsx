"use client";

import { useState } from "react";
import {
  COUNTRY_OPTIONS,
  NICHE_VALUES,
  type Niche,
} from "@/lib/trend-scout/types";
import { Send, ChevronRight, Sparkles, Bot, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Step = "command" | "niche" | "country" | "language" | "feed";

export function TelegramBotFlow() {
  const [step, setStep] = useState<Step>("command");
  const [niche, setNiche] = useState<Niche | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <header className="pr-card-grad pr-border-grad rounded-2xl p-5">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[var(--pr-text-mute)] mb-1">
          <Bot className="h-3.5 w-3.5 text-[var(--pr-electric)]" /> Telegram bot flow
        </div>
        <h2 className="text-xl font-bold mb-1">
          <code className="text-[var(--pr-electric)]">/trends</code>
          <span className="text-[var(--pr-text-dim)] font-normal"> — the bot side of Trend Scout</span>
        </h2>
        <p className="text-sm text-[var(--pr-text-dim)] max-w-2xl">
          This is a visual mock of how the existing P&R Telegram bot surfaces Trend Scout.
          Tap through to see how a user gets from typing <code className="text-[var(--pr-electric)]">/trends</code>
          {" "}to choosing an action — the actual bot is owned by the existing P&R backend and is invoked by the routing payload this app produces.
        </p>
      </header>

      <Stepper step={step} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Phone>
          <BotMessage step={step} niche={niche} country={country} language={language} />
        </Phone>

        <div className="space-y-3">
          <StepControls
            step={step}
            niche={niche}
            setNiche={setNiche}
            country={country}
            setCountry={setCountry}
            language={language}
            setLanguage={setLanguage}
            onAdvance={(s) => setStep(s)}
            onReset={() => {
              setNiche(null);
              setCountry(null);
              setLanguage(null);
              setStep("command");
            }}
          />
          <FlowNotes />
        </div>
      </div>
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "command", label: "/trends" },
    { key: "niche", label: "Niche" },
    { key: "country", label: "Country" },
    { key: "language", label: "Language" },
    { key: "feed", label: "Top 5 + Action" },
  ];
  const activeIdx = steps.findIndex((s) => s.key === step);
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {steps.map((s, i) => (
        <li key={s.key} className="inline-flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
              i < activeIdx
                ? "bg-[var(--pr-electric)]/10 text-[var(--pr-electric)] border-[var(--pr-electric)]/25"
                : i === activeIdx
                ? "bg-[var(--pr-gold)]/15 text-[var(--pr-gold)] border-[var(--pr-gold)]/30 pr-glow-gold"
                : "bg-white/[0.02] text-[var(--pr-text-mute)] border-white/[0.08]",
            )}
          >
            <span className="text-[10px] tabular-nums">{i + 1}</span>
            {s.label}
          </span>
          {i < steps.length - 1 && <ChevronRight className="h-3 w-3 text-[var(--pr-text-mute)]" />}
        </li>
      ))}
    </ol>
  );
}

function Phone({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-white/[0.08] bg-black/40 p-3 max-w-sm mx-auto md:mx-0">
      <div className="rounded-2xl bg-gradient-to-b from-[#0d1117] to-[#0a0c10] border border-white/[0.06] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.06] bg-[var(--pr-electric)]/[0.04] flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[var(--pr-electric)] to-[var(--pr-gold)] flex items-center justify-center">
            <span className="text-[10px] font-black text-black">P&amp;R</span>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight truncate">Plunder & Riffle Bot</div>
            <div className="text-[10px] text-emerald-400/80 inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> online
            </div>
          </div>
          <MessageCircle className="ml-auto h-4 w-4 text-[var(--pr-text-mute)]" />
        </div>
        <div className="p-4 space-y-3 min-h-[420px] max-h-[520px] overflow-y-auto pr-scrollbar">
          {children}
        </div>
        <div className="px-3 py-2 border-t border-white/[0.06] flex items-center gap-2">
          <div className="flex-1 rounded-full bg-white/[0.04] border border-white/[0.06] px-3 py-2 text-xs text-[var(--pr-text-mute)]">
            Type a message…
          </div>
          <Send className="h-4 w-4 text-[var(--pr-electric)]" />
        </div>
      </div>
    </div>
  );
}

function BotMessage({
  step,
  niche,
  country,
  language,
}: {
  step: Step;
  niche: Niche | null;
  country: string | null;
  language: string | null;
}) {
  return (
    <div className="space-y-3">
      {step === "command" && (
        <>
          <UserBubble>/trends</UserBubble>
          <BotBubble>
            <strong>Trend Scout</strong> — pick a niche:
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {NICHE_VALUES.slice(0, 6).map((n) => (
                <button
                  key={n}
                  onClick={() => {}}
                  className="text-[11px] px-2 py-1.5 rounded bg-[var(--pr-electric)]/10 text-[var(--pr-electric)] border border-[var(--pr-electric)]/25 hover:bg-[var(--pr-electric)]/20 text-left"
                >
                  {n}
                </button>
              ))}
            </div>
          </BotBubble>
        </>
      )}
      {step === "niche" && (
        <>
          <UserBubble>AI</UserBubble>
          <BotBubble>
            Pick a country:
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {COUNTRY_OPTIONS.slice(0, 6).map((c) => (
                <button
                  key={c.code}
                  onClick={() => {}}
                  className="text-[11px] px-2 py-1.5 rounded bg-white/[0.04] text-foreground/80 border border-white/[0.08] hover:bg-white/[0.08] text-left"
                >
                  {c.label}
                </button>
              ))}
            </div>
          </BotBubble>
        </>
      )}
      {step === "country" && (
        <>
          <UserBubble>{COUNTRY_OPTIONS.find((c) => c.code === country)?.label ?? "US"}</UserBubble>
          <BotBubble>
            Pick an output language:
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {(COUNTRY_OPTIONS.find((c) => c.code === country)?.languages ?? [{ code: "en", label: "English" }]).map((l) => (
                <button
                  key={l.code}
                  onClick={() => {}}
                  className="text-[11px] px-2 py-1.5 rounded bg-white/[0.04] text-foreground/80 border border-white/[0.08] hover:bg-white/[0.08] text-left"
                >
                  {l.label}
                </button>
              ))}
            </div>
          </BotBubble>
        </>
      )}
      {step === "language" && (
        <>
          <UserBubble>{COUNTRY_OPTIONS.find((c) => c.code === country)?.languages.find((l) => l.code === language)?.label ?? "English"}</UserBubble>
          <BotBubble>
            <strong>Top 5 opportunities</strong> for <em>{niche}</em> in{" "}
            <em>{COUNTRY_OPTIONS.find((c) => c.code === country)?.label}</em> /{" "}
            <em>{COUNTRY_OPTIONS.find((c) => c.code === country)?.languages.find((l) => l.code === language)?.label}</em>:
            <ol className="mt-2 space-y-1.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-2"
                >
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <div className="text-[11px] font-semibold truncate">#{i + 1} Sample trend {i + 1}</div>
                    <div className="text-[10px] text-[var(--pr-gold)] shrink-0">score 78</div>
                  </div>
                  <div className="text-[10px] text-[var(--pr-text-mute)] line-clamp-2">
                    Hook: “You’re going to see this everywhere today — here’s what they’re not telling you.”
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-2 text-[10px] text-[var(--pr-text-mute)]">Tap a trend to choose an action.</div>
          </BotBubble>
        </>
      )}
      {step === "feed" && (
        <>
          <UserBubble>Sample trend 1</UserBubble>
          <BotBubble>
            <strong>Sample trend 1</strong> — score 78 · Breakout · outrage
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <ActionButton glyph="✨" label="Make Original" tone="electric" />
              <ActionButton glyph="🔍" label="Find Videos" tone="gold" />
              <ActionButton glyph="🖼" label="Create Slideshow" tone="violet" />
              <ActionButton glyph="😎" label="Make Meme Clip" tone="pink" />
              <ActionButton glyph="🌍" label="Rebuild for World" tone="emerald" full />
            </div>
          </BotBubble>
          <BotBubble tone="muted">
            <Sparkles className="h-3.5 w-3.5 text-[var(--pr-gold)] inline-block mr-1" />
            Choose an action — each one is handed off to the existing P&R Telegram bot command (<code>/create</code>, <code>/clip</code>, <code>/rebuild</code>).
          </BotBubble>
        </>
      )}
    </div>
  );
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-[var(--pr-electric)] text-[#03121a] px-3 py-2 text-sm">
        {children}
      </div>
    </div>
  );
}

function BotBubble({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "muted";
}) {
  return (
    <div className="flex justify-start">
      <div
        className={cn(
          "max-w-[88%] rounded-2xl rounded-bl-sm px-3 py-2.5 text-sm",
          tone === "muted"
            ? "bg-white/[0.02] border border-white/[0.06] text-[var(--pr-text-dim)]"
            : "bg-white/[0.05] border border-white/[0.06] text-foreground/90",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function ActionButton({
  glyph,
  label,
  tone,
  full,
}: {
  glyph: string;
  label: string;
  tone: "electric" | "gold" | "violet" | "pink" | "emerald";
  full?: boolean;
}) {
  const tones = {
    electric: "bg-[var(--pr-electric)]/10 text-[var(--pr-electric)] border-[var(--pr-electric)]/25",
    gold: "bg-[var(--pr-gold)]/10 text-[var(--pr-gold)] border-[var(--pr-gold)]/25",
    violet: "bg-violet-500/10 text-violet-300 border-violet-500/25",
    pink: "bg-pink-500/10 text-pink-300 border-pink-500/25",
    emerald: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
  } as const;
  return (
    <button
      className={cn(
        "text-[11px] px-2 py-1.5 rounded border font-medium text-left",
        tones[tone],
        full && "col-span-2",
      )}
    >
      <span className="mr-1">{glyph}</span> {label}
    </button>
  );
}

function StepControls({
  step,
  niche,
  setNiche,
  country,
  setCountry,
  language,
  setLanguage,
  onAdvance,
  onReset,
}: {
  step: Step;
  niche: Niche | null;
  setNiche: (n: Niche) => void;
  country: string | null;
  setCountry: (c: string) => void;
  language: string | null;
  setLanguage: (l: string) => void;
  onAdvance: (s: Step) => void;
  onReset: () => void;
}) {
  if (step === "command") {
    return (
      <ControlCard
        title="Step 1 — User sends /trends"
        desc="The user types or taps /trends. The bot opens the Trend Scout flow."
        actionLabel="Send /trends →"
        onAction={() => onAdvance("niche")}
      />
    );
  }
  if (step === "niche") {
    return (
      <ControlCard
        title="Step 2 — Pick niche"
        desc="Bot offers the 11 P&R niches as inline buttons. User taps one."
        actionLabel="Continue →"
        onAction={() => niche && onAdvance("country")}
        actionDisabled={!niche}
      >
        <div className="grid grid-cols-2 gap-1.5">
          {NICHE_VALUES.slice(0, 6).map((n) => (
            <button
              key={n}
              onClick={() => setNiche(n)}
              className={cn(
                "text-xs px-2 py-1.5 rounded border text-left transition-all",
                niche === n
                  ? "bg-[var(--pr-electric)]/15 text-[var(--pr-electric)] border-[var(--pr-electric)]/30"
                  : "bg-white/[0.03] text-foreground/80 border-white/[0.06] hover:bg-white/[0.06]",
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </ControlCard>
    );
  }
  if (step === "country") {
    return (
      <ControlCard
        title="Step 3 — Pick country"
        desc="Bot offers supported countries. User taps one."
        actionLabel="Continue →"
        onAction={() => country && onAdvance("language")}
        actionDisabled={!country}
      >
        <div className="grid grid-cols-2 gap-1.5">
          {COUNTRY_OPTIONS.slice(0, 6).map((c) => (
            <button
              key={c.code}
              onClick={() => setCountry(c.code)}
              className={cn(
                "text-xs px-2 py-1.5 rounded border text-left transition-all",
                country === c.code
                  ? "bg-[var(--pr-electric)]/15 text-[var(--pr-electric)] border-[var(--pr-electric)]/30"
                  : "bg-white/[0.03] text-foreground/80 border-white/[0.06] hover:bg-white/[0.06]",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </ControlCard>
    );
  }
  if (step === "language") {
    const c = COUNTRY_OPTIONS.find((x) => x.code === country) ?? COUNTRY_OPTIONS[0];
    return (
      <ControlCard
        title="Step 4 — Pick language"
        desc="Bot offers the languages supported by the chosen country."
        actionLabel="Show feed →"
        onAction={() => language && onAdvance("feed")}
        actionDisabled={!language}
      >
        <div className="grid grid-cols-2 gap-1.5">
          {c.languages.map((l) => (
            <button
              key={l.code}
              onClick={() => setLanguage(l.code)}
              className={cn(
                "text-xs px-2 py-1.5 rounded border text-left transition-all",
                language === l.code
                  ? "bg-[var(--pr-electric)]/15 text-[var(--pr-electric)] border-[var(--pr-electric)]/30"
                  : "bg-white/[0.03] text-foreground/80 border-white/[0.06] hover:bg-white/[0.06]",
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      </ControlCard>
    );
  }
  // step === "feed"
  return (
    <ControlCard
      title="Step 5 — Top 5 + action"
      desc="The bot surfaces the top 5 Trend Opportunity cards (same scoring engine as the web app). Tapping a card reveals the action row."
      actionLabel="Reset flow"
      onAction={onReset}
    />
  );
}

function ControlCard({
  title,
  desc,
  children,
  actionLabel,
  onAction,
  actionDisabled,
}: {
  title: string;
  desc: string;
  children?: React.ReactNode;
  actionLabel: string;
  onAction: () => void;
  actionDisabled?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <h3 className="text-sm font-semibold mb-1">{title}</h3>
      <p className="text-xs text-[var(--pr-text-dim)] mb-3">{desc}</p>
      {children}
      <button
        onClick={onAction}
        disabled={actionDisabled}
        className="mt-3 inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-[var(--pr-electric)] text-[#03121a] pr-glow disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--pr-electric)]/90 transition-colors"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function FlowNotes() {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-xs text-[var(--pr-text-dim)] space-y-2">
      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--pr-text-mute)]">How it connects</div>
      <p>
        Each action in the bot is implemented as a deep-link to a P&R Telegram bot command. When you
        trigger the same action from the web app, the P&R integration layer constructs the same
        command and either auto-sends it (if <code className="text-[var(--pr-electric)]">P_R_TELEGRAM_BOT_TOKEN</code> is set)
        or surfaces a prefilled command you can paste manually.
      </p>
      <p>
        The bot uses the same trend-provider and scoring layer as the web UI — there is no separate
        “bot brain”.
      </p>
    </div>
  );
}
