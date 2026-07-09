"use client";

import { useEffect, useState } from "react";
import {
  loadSettings,
  saveSettings,
  type AppSettings,
} from "@/lib/storage/local";
import type { LlmProviderId } from "@/lib/llm/provider";

type Props = {
  available?: LlmProviderId[];
  onChange?: (settings: AppSettings) => void;
};

export function CoachSettings({
  available = ["claude", "gemini"],
  onChange,
}: Props) {
  const [settings, setSettings] = useState<AppSettings>({
    blunderCheckMode: true,
    llmProvider: "claude",
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
          {available.map((id) => (
            <option key={id} value={id}>
              {id === "claude" ? "Claude (Anthropic)" : "Gemini (Google)"}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-2 text-xs text-[var(--muted)]">
        Set API keys in <code>.env.local</code>. Missing keys fall back to
        templates.
      </p>
    </div>
  );
}
