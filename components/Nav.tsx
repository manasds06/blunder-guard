"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthMenu } from "@/components/AuthMenu";

const links = [
  { href: "/play", label: "Play" },
  { href: "/puzzles", label: "Puzzles" },
  { href: "/analyze", label: "Analyze" },
  { href: "/openings", label: "Openings" },
  { href: "/dashboard", label: "Dashboard" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur-md">
      <div className="mx-auto flex h-12 max-w-6xl items-center justify-between gap-4 px-4">
        <Link
          href="/"
          className="flex items-baseline gap-2 font-[family-name:var(--font-display)] text-[0.9375rem] font-semibold tracking-tight"
        >
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-[2px] bg-[var(--accent)]"
          />
          blunderguard
        </Link>
        <nav className="flex items-center gap-0.5">
          {links.map((l) => {
            const active = pathname?.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-2.5 py-1 font-[family-name:var(--font-mono)] text-[0.6875rem] uppercase tracking-[0.12em] transition-colors ${
                  active
                    ? "bg-[var(--panel-2)] text-[var(--fg)]"
                    : "text-[var(--muted)] hover:text-[var(--fg)]"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
          <span className="ml-2 border-l border-[var(--border)] pl-3">
            <AuthMenu />
          </span>
        </nav>
      </div>
    </header>
  );
}
