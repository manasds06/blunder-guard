/**
 * useCoach — classifies user moves in the background and serves explanations.
 * Pattern: side-effect hook; never blocks the bot's reply.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import { analyzeUserMove, type MistakeReport } from "@/lib/coach/detector";
import { explainMistake } from "@/lib/coach/explainer";
import { getPlayEngine } from "@/lib/engine/stockfish";
import { loadSettings } from "@/lib/storage/local";
import type { CoachFeedItem } from "@/components/CoachPanel";
import type { PlayerColor } from "@/hooks/useChessGame";

export function useCoach(opts: {
  history: string[];
  playerColor: PlayerColor;
  enabled: boolean;
  gameOver: boolean;
}) {
  const [items, setItems] = useState<CoachFeedItem[]>([]);
  const [biggestLesson, setBiggestLesson] = useState<string>();
  const analyzedLen = useRef(0);

  // Reset on new game (history cleared)
  useEffect(() => {
    if (opts.history.length === 0) {
      setItems([]);
      setBiggestLesson(undefined);
      analyzedLen.current = 0;
    }
  }, [opts.history.length]);

  useEffect(() => {
    if (!opts.enabled) return;
    if (opts.history.length <= analyzedLen.current) return;

    let cancelled = false;

    (async () => {
      const engine = getPlayEngine();
      await engine.init();

      // Replay from start to find fenBefore for each new ply
      const chess = new Chess();
      for (let i = 0; i < analyzedLen.current; i++) {
        chess.move(opts.history[i]!);
      }

      for (let i = analyzedLen.current; i < opts.history.length; i++) {
        const san = opts.history[i]!;
        const fenBefore = chess.fen();
        const move = chess.move(san);
        if (!move) continue;

        // Only classify the human's moves
        if (move.color !== opts.playerColor) {
          analyzedLen.current = i + 1;
          continue;
        }

        try {
          const report = await analyzeUserMove(engine, fenBefore, san, 12);
          if (cancelled) return;
          setItems((prev) => [...prev, { ply: i, report }]);
        } catch (e) {
          console.error("Coach analyze failed", e);
        }
        analyzedLen.current = i + 1;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [opts.history, opts.playerColor, opts.enabled]);

  const onExplain = useCallback(async (ply: number) => {
    const item = items.find((i) => i.ply === ply);
    if (!item) return;
    setItems((prev) =>
      prev.map((i) => (i.ply === ply ? { ...i, explaining: true } : i)),
    );
    const settings = await loadSettings();
    const result = await explainMistake(item.report, settings);
    setItems((prev) =>
      prev.map((i) =>
        i.ply === ply
          ? { ...i, explaining: false, explanation: result.text }
          : i,
      ),
    );
  }, [items]);

  const lessonStarted = useRef(false);
  useEffect(() => {
    if (!opts.gameOver) {
      lessonStarted.current = false;
      return;
    }
    if (lessonStarted.current || items.length === 0) return;
    lessonStarted.current = true;
    const worst = items
      .filter(
        (i) =>
          i.report.classification === "BLUNDER" ||
          i.report.classification === "MISTAKE",
      )
      .sort((a, b) => a.report.swingCp - b.report.swingCp)[0];
    if (!worst) {
      setBiggestLesson(
        "Solid game — few big mistakes. Keep running the Blunder Check.",
      );
      return;
    }
    void (async () => {
      if (worst.explanation) {
        setBiggestLesson(worst.explanation);
        return;
      }
      const settings = await loadSettings();
      const result = await explainMistake(worst.report, settings);
      setBiggestLesson(result.text);
      setItems((prev) =>
        prev.map((i) =>
          i.ply === worst.ply ? { ...i, explanation: result.text } : i,
        ),
      );
    })();
  }, [opts.gameOver, items]);

  const summary = {
    blunders: items.filter((i) => i.report.classification === "BLUNDER").length,
    mistakes: items.filter((i) => i.report.classification === "MISTAKE").length,
    inaccuracies: items.filter((i) => i.report.classification === "INACCURACY")
      .length,
    best: items.filter((i) => i.report.classification === "BEST").length,
  };

  return { items, onExplain, summary, biggestLesson };
}

export type { MistakeReport };
