"use client";

import { useEffect, useState } from "react";
import {
  loadSettings,
  saveSettings,
  type AppSettings,
} from "@/lib/storage/local";
import type { LlmProviderId } from "@/lib/llm/provider";

const LABELS: Record<LlmProviderId, string> = {
  claude: "Claude (Anthropic)",
  gemini: "Gemini (Google)",
  ollama: "Ollama (local)",
};

const ALL_PROVIDERS: LlmProviderId[] = ["ollama", "claude", "gemini"];

type Props = {
  available?: LlmProviderId[];
  onChange?: (settings: AppSettings) => void;
};

export function CoachSettings({
  available = ALL_PROVIDERS,
  onChange,
}: Props) {
  const [settings, setSettings] = useState<AppSettings>({
    blunderCheckMode: true,
    llmProvider: "ollama",
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void loadSettings().then((s) => {
      setSettings(s);
      onChange?.(s);
      setLoaded(true);
    });
    // intentionally run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function update(partial: Partial<AppSettings>) {
    const next = { ...settings, ...partial };
    setSettings(next);
    await saveSettings(next);
    onChange?.(next);
  }

  if (!loaded) return null;

  // Always offer every provider; mark which ones the server currently sees
  const options = ALL_PROVIDERS;

  return (
    <div className="card p-4 text-sm">
      <p className="label mb-3">settings</p>
      <label className="mb-3 flex cursor-pointer items-center justify-between gap-2">
        <span className="text-[0.8125rem]">Blunder Check mode</span>
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-[var(--accent)]"
          checked={settings.blunderCheckMode}
          onChange={(e) => void update({ blunderCheckMode: e.target.checked })}
          data-testid="blunder-check-toggle"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="label">coach llm</span>
        <select
          className="field"
          value={settings.llmProvider}
          onChange={(e) =>
            void update({ llmProvider: e.target.value as LlmProviderId })
          }
          data-testid="llm-provider"
        >
          {options.map((id) => (
            <option key={id} value={id}>
              {LABELS[id]}
              {available.includes(id) ? "" : " — offline"}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
        Fully local: install{" "}
        <a
          className="text-[var(--fg)]/80 underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--accent)]"
          href="https://ollama.com"
          target="_blank"
          rel="noreferrer"
        >
          Ollama
        </a>
        , run{" "}
        <code className="font-[family-name:var(--font-mono)] text-[var(--fg)]/70">
          ollama pull llama3.2
        </code>
        . No keys needed — templates cover any LLM downtime.
      </p>
    </div>
  );
}
