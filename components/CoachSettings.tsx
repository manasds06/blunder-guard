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
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4 text-sm">
      <h3 className="mb-3 font-semibold text-[var(--accent)]">Settings</h3>
      <label className="mb-3 flex items-center justify-between gap-2">
        <span>Blunder Check mode</span>
        <input
          type="checkbox"
          checked={settings.blunderCheckMode}
          onChange={(e) => void update({ blunderCheckMode: e.target.checked })}
          data-testid="blunder-check-toggle"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[var(--muted)]">Coach LLM</span>
        <select
          className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5"
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
      <p className="mt-2 text-xs text-[var(--muted)]">
        Fully local: install{" "}
        <a
          className="text-[var(--accent)] underline"
          href="https://ollama.com"
          target="_blank"
          rel="noreferrer"
        >
          Ollama
        </a>
        , run <code>ollama pull llama3.2</code>, set{" "}
        <code>LLM_PROVIDER=ollama</code>. No keys needed. If the LLM is down,
        template explanations are used instead.
      </p>
    </div>
  );
}
