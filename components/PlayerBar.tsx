"use client";

type Props = {
  name: string;
  subtitle: string;
  /** Avatar hue; null renders a neutral "you" avatar */
  hue: number | null;
  initial: string;
  /** Highlights the bar when it's this player's turn */
  active: boolean;
  /** Shows an animated thinking indicator */
  thinking?: boolean;
  /** Right-aligned status text */
  statusText?: string;
  statusTestId?: string;
};

/** Player capsule above/below the board — chess.com-style, in our design language. */
export function PlayerBar({
  name,
  subtitle,
  hue,
  initial,
  active,
  thinking,
  statusText,
  statusTestId,
}: Props) {
  return (
    <div
      className={`flex w-full max-w-[560px] items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
        active
          ? "border-[var(--accent)]/40 bg-[var(--panel)]"
          : "border-[var(--border)] bg-transparent"
      }`}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md font-[family-name:var(--font-mono)] text-sm font-semibold"
        style={
          hue != null
            ? { background: `hsl(${hue} 40% 62%)`, color: "var(--bg)" }
            : {
                background: "var(--panel-2)",
                color: "var(--fg)",
                border: "1px solid var(--border-strong)",
              }
        }
        aria-hidden
      >
        {initial}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">{name}</p>
        <p className="truncate font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.1em] text-[var(--muted)]">
          {subtitle}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {thinking && (
          <span className="flex items-center gap-1" aria-label="thinking">
            <span className="h-1 w-1 animate-pulse rounded-full bg-[var(--accent)] [animation-delay:0ms]" />
            <span className="h-1 w-1 animate-pulse rounded-full bg-[var(--accent)] [animation-delay:150ms]" />
            <span className="h-1 w-1 animate-pulse rounded-full bg-[var(--accent)] [animation-delay:300ms]" />
          </span>
        )}
        {statusText && (
          <span
            className={`font-[family-name:var(--font-mono)] text-[0.6875rem] ${
              active ? "text-[var(--accent)]" : "text-[var(--muted)]"
            }`}
            data-testid={statusTestId}
          >
            {statusText}
          </span>
        )}
      </div>
    </div>
  );
}
