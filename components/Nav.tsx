"use client";

import Link from "next/link";
import { AuthMenu } from "@/components/AuthMenu";

const links = [
  { href: "/play", label: "Play" },
  { href: "/puzzles", label: "Puzzles" },
  { href: "/analyze", label: "Analyze" },
  { href: "/openings", label: "Openings" },
  { href: "/dashboard", label: "Dashboard" },
];

export function Nav() {
  return (
    <header className="border-b border-[var(--border)] bg-[var(--panel)]/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="font-[family-name:var(--font-display)] text-xl tracking-tight text-[var(--accent)]">
          Blunder Guard
        </Link>
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded px-2.5 py-1.5 text-[var(--fg)]/80 hover:bg-white/5 hover:text-[var(--fg)]"
            >
              {l.label}
            </Link>
          ))}
          <AuthMenu />
        </nav>
      </div>
    </header>
  );
}
