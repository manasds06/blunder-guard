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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      data-testid="blunder-check-modal"
    >
      <div
        className="card w-full max-w-md p-6"
        style={{ borderLeft: "2px solid var(--danger)" }}
      >
        <p className="label text-[var(--danger)]">blunder check</p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-xl font-medium tracking-tight">
          Hold on.
        </h2>
        <p className="mt-3 text-sm text-[var(--fg)]/85">
          Run the checklist before you commit:
        </p>
        <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
          {[
            "Is this piece safe?",
            "Are their pieces hanging?",
            "Is my king safe?",
          ].map((q, i) => (
            <li key={q} className="flex items-baseline gap-2.5">
              <span className="font-[family-name:var(--font-mono)] text-[0.625rem] text-[var(--danger)]">
                0{i + 1}
              </span>
              {q}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onCancel}
            data-testid="blunder-check-cancel"
          >
            Take another look
          </button>
          <button
            type="button"
            className="btn btn-ghost"
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
