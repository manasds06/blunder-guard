"use client";

type Props = {
  open: boolean;
  onPlayAnyway: () => void;
  onCancel: () => void;
};

/**
 * Pre-move Blunder Check modal — never reveals the better move.
 * Mirrors the owner's training habit: pause and ask the three questions.
 */
export function BlunderCheckModal({ open, onPlayAnyway, onCancel }: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      data-testid="blunder-check-modal"
    >
      <div className="max-w-md rounded-lg border border-[var(--danger)]/40 bg-[var(--panel)] p-6 shadow-xl">
        <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--danger)]">
          Hold on — Blunder Check
        </h2>
        <p className="mt-3 text-[var(--fg)]">
          Run your Blunder Check before you commit:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--muted)]">
          <li>Is this piece safe?</li>
          <li>Are their pieces hanging?</li>
          <li>Is my king safe?</li>
        </ul>
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--bg)]"
            onClick={onCancel}
            data-testid="blunder-check-cancel"
          >
            Take another look
          </button>
          <button
            type="button"
            className="rounded border border-[var(--border)] px-4 py-2 text-sm"
            onClick={onPlayAnyway}
            data-testid="blunder-check-anyway"
          >
            Play it anyway
          </button>
        </div>
      </div>
    </div>
  );
}
