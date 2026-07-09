"use client";

import { useCallback, useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard, type PieceDropHandlerArgs } from "react-chessboard";
import { REPERTOIRE, type OpeningLine } from "@/lib/openings/repertoire";
import { scheduleReview } from "@/lib/puzzles/srs";

export function OpeningsScreen() {
  const [line, setLine] = useState<OpeningLine>(REPERTOIRE[0]!);
  const [ply, setPly] = useState(0);
  const [fen, setFen] = useState(() => new Chess().fen());
  const [message, setMessage] = useState("Play the repertoire move");
  const [idea, setIdea] = useState<string>();

  const chess = useMemo(() => new Chess(), []);

  const resetLine = useCallback((l: OpeningLine) => {
    setLine(l);
    chess.reset();
    setFen(chess.fen());
    setPly(0);
    setIdea(undefined);
    setMessage(
      l.side === "white"
        ? "You are White — play the book move"
        : "Waiting for White…",
    );
    // If black repertoire, auto-play white's first move
    if (l.side === "black" && l.ucis[0]) {
      const u = l.ucis[0];
      chess.move({
        from: u.slice(0, 2) as Square,
        to: u.slice(2, 4) as Square,
        promotion: u[4] as "q" | undefined,
      });
      setFen(chess.fen());
      setPly(1);
      setMessage("You are Black — play the book move");
    }
  }, [chess]);

  const onDrop = useCallback(
    ({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean => {
      if (!targetSquare) return false;
      const expected = line.ucis[ply];
      if (!expected) return false;

      const played = sourceSquare + targetSquare;
      const expectedBase = expected.slice(0, 4);
      if (played !== expectedBase && sourceSquare + targetSquare + "q" !== expected) {
        setMessage(`Off-book. Expected idea continues with ${expected}.`);
        void scheduleReview(line.id, "opening", false);
        return false;
      }

      try {
        chess.move({
          from: sourceSquare as Square,
          to: targetSquare as Square,
          promotion: (expected[4] as "q") ?? undefined,
        });
      } catch {
        return false;
      }
      setFen(chess.fen());
      const ideaText =
        Object.values(line.ideas)[Math.floor(ply / 2)] ??
        "Develop before attacking.";
      setIdea(ideaText);

      let next = ply + 1;
      // Auto-play opponent's repertoire move
      if (next < line.ucis.length) {
        const opp = line.ucis[next]!;
        try {
          chess.move({
            from: opp.slice(0, 2) as Square,
            to: opp.slice(2, 4) as Square,
            promotion: opp[4] as "q" | undefined,
          });
          setFen(chess.fen());
          next += 1;
        } catch {
          // end if illegal
        }
      }
      setPly(next);
      if (next >= line.ucis.length) {
        setMessage("Line complete!");
        void scheduleReview(line.id, "opening", true);
      } else {
        setMessage("Good — keep going");
      }
      return true;
    },
    [chess, line, ply],
  );

  const options = useMemo(
    () => ({
      id: "opening-board",
      position: fen,
      boardOrientation: line.side,
      allowDragging: ply < line.ucis.length,
      boardStyle: { width: "100%", maxWidth: "480px", borderRadius: "4px" },
      onPieceDrop: onDrop,
    }),
    [fen, line, ply, onDrop],
  );

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_280px]">
      <div className="flex flex-col items-center gap-4">
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-[var(--accent)]">
          Opening trainer
        </h1>
        <div className="w-full max-w-[480px] aspect-square">
          <Chessboard options={options} />
        </div>
        <p className="text-sm" data-testid="opening-status">
          {message}
        </p>
        {idea && (
          <p className="max-w-md text-sm text-[var(--muted)]">
            Why this move? {idea}
          </p>
        )}
      </div>
      <aside className="flex flex-col gap-2">
        {REPERTOIRE.map((l) => (
          <button
            key={l.id}
            type="button"
            className={`rounded border px-3 py-2 text-left text-sm ${
              line.id === l.id
                ? "border-[var(--accent)] bg-[var(--accent)]/15"
                : "border-[var(--border)] bg-[var(--panel)]"
            }`}
            onClick={() => resetLine(l)}
          >
            <span className="font-semibold">{l.name}</span>
            <span className="mt-0.5 block text-xs text-[var(--muted)]">
              {l.side}
            </span>
          </button>
        ))}
      </aside>
    </div>
  );
}
