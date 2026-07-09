/**
 * useChessGame — custom hook owning chess.js state.
 * Pattern: stateful domain hook — keeps board UI dumb; all rules live here.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { getBotLevel } from "@/lib/engine/botLevels";
import { OnnxBotProvider } from "@/lib/engine/onnx-bot";
import { getPlayEngine } from "@/lib/engine/stockfish";
import {
  getPersonality,
  PersonalityWrapper,
  randomOneLiner,
  type Personality,
} from "@/lib/engine/personalities";
import type { EngineProvider } from "@/lib/engine/provider";
import {
  clearCurrentGame,
  loadCurrentGame,
  saveCurrentGame,
} from "@/lib/storage/local";
import { recordGameStat } from "@/lib/stats/aggregate";

export type PlayerColor = "w" | "b";

export type GameStatus =
  | "idle"
  | "playing"
  | "thinking"
  | "checkmate"
  | "stalemate"
  | "draw"
  | "resigned";

export type UseChessGameOptions = {
  botElo?: number;
  playerColor?: PlayerColor;
  personalityId?: string | null;
};

function detectStatus(chess: Chess, resigned = false): GameStatus {
  if (resigned) return "resigned";
  if (chess.isCheckmate()) return "checkmate";
  if (chess.isStalemate()) return "stalemate";
  if (chess.isDraw() || chess.isThreefoldRepetition() || chess.isInsufficientMaterial()) {
    return "draw";
  }
  return "playing";
}

export function useChessGame(opts: UseChessGameOptions = {}) {
  const [fen, setFen] = useState(() => new Chess().fen());
  const [history, setHistory] = useState<string[]>([]);
  const [viewIndex, setViewIndex] = useState<number | null>(null); // null = live
  const [playerColor, setPlayerColor] = useState<PlayerColor>(
    opts.playerColor ?? "w",
  );
  const [botElo, setBotElo] = useState(opts.botElo ?? 800);
  const [personalityId, setPersonalityId] = useState<string | null>(
    opts.personalityId ?? null,
  );
  const [botLine, setBotLine] = useState<string>();
  const [status, setStatus] = useState<GameStatus>("idle");
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintArrow, setHintArrow] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(
    null,
  );
  const [engineReady, setEngineReady] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const chessRef = useRef(new Chess());
  const botBusy = useRef(false);
  const onnxRef = useRef<OnnxBotProvider | null>(null);

  // Init engine once
  useEffect(() => {
    const engine = getPlayEngine();
    engine
      .init()
      .then(() => setEngineReady(true))
      .catch((e) => console.error("Engine init failed", e));
    return () => {
      // Keep singleton alive across navigations; dispose only on full unload
    };
  }, []);

  // Resume from IndexedDB
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await loadCurrentGame();
      if (cancelled) return;
      if (saved && saved.history.length > 0 && !saved.result) {
        const chess = new Chess();
        for (const san of saved.history) {
          try {
            chess.move(san);
          } catch {
            break;
          }
        }
        chessRef.current = chess;
        setFen(chess.fen());
        setHistory(saved.history);
        setPlayerColor(saved.playerColor);
        setBotElo(saved.botElo);
        setHintsUsed(saved.hintsUsed);
        setStatus(detectStatus(chess));
        const hist = chess.history({ verbose: true });
        const last = hist[hist.length - 1];
        if (last) setLastMove({ from: last.from, to: last.to });
      } else {
        setStatus("playing");
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async () => {
    const chess = chessRef.current;
    await saveCurrentGame({
      fen: chess.fen(),
      pgn: chess.pgn(),
      history: chess.history(),
      playerColor,
      botElo,
      hintsUsed,
      result:
        status === "playing" || status === "thinking" || status === "idle"
          ? undefined
          : status,
    });
  }, [playerColor, botElo, hintsUsed, status]);

  useEffect(() => {
    if (!hydrated) return;
    if (status === "idle") return;
    void persist();
  }, [fen, history, status, hydrated, persist]);

  const syncFromChess = useCallback(
    (resigned = false) => {
      const chess = chessRef.current;
      setFen(chess.fen());
      setHistory(chess.history());
      setViewIndex(null);
      setHintArrow(null);
      setStatus(detectStatus(chess, resigned));
    },
    [],
  );

  const playBotMove = useCallback(async () => {
    if (botBusy.current) return;
    const chess = chessRef.current;
    if (chess.isGameOver()) return;
    if (chess.turn() === playerColor) return;

    botBusy.current = true;
    setStatus("thinking");
    try {
      const stockfish = getPlayEngine();
      if (!engineReady) await stockfish.init();
      const persona = personalityId ? getPersonality(personalityId) : undefined;
      const elo = persona?.elo ?? botElo;
      const level = getBotLevel(elo);

      let provider: EngineProvider = stockfish;
      // Manas-Bot uses OnnxBotProvider — Strategy payoff: same getMove path.
      if (persona?.id === "manas-bot") {
        if (!onnxRef.current) {
          onnxRef.current = new OnnxBotProvider();
          await onnxRef.current.init();
        }
        provider = onnxRef.current;
      } else if (persona && persona.style !== "balanced") {
        provider = new PersonalityWrapper(stockfish, persona);
      }

      const move = await provider.getMove(chess.fen(), {
        movetime: level.movetime,
        skillLevel: level.skillLevel,
        elo: level.elo,
        limitStrength: level.limitStrength,
        multipv: level.pickFromTop > 1 ? level.pickFromTop : 1,
      });

      // Validate with chess.js — never trust raw UCI blindly
      const from = move.uci.slice(0, 2) as Square;
      const to = move.uci.slice(2, 4) as Square;
      const promotion = move.uci.length > 4 ? move.uci[4] : undefined;
      const result = chess.move({
        from,
        to,
        promotion: promotion as "q" | "r" | "b" | "n" | undefined,
      });
      if (!result) throw new Error(`Illegal bot move: ${move.uci}`);
      setLastMove({ from: result.from, to: result.to });
      syncFromChess();
    } catch (e) {
      console.error("Bot move failed", e);
      setStatus("playing");
    } finally {
      botBusy.current = false;
    }
  }, [botElo, engineReady, personalityId, playerColor, syncFromChess]);

  // Bot to move after player move / new game as black
  useEffect(() => {
    if (!hydrated || !engineReady) return;
    if (status !== "playing") return;
    const chess = chessRef.current;
    if (chess.isGameOver()) return;
    if (chess.turn() !== playerColor) {
      void playBotMove();
    }
  }, [fen, status, hydrated, engineReady, playerColor, playBotMove]);

  const makeMove = useCallback(
    (
      from: string,
      to: string,
      promotion: "q" | "r" | "b" | "n" = "q",
    ): boolean => {
      if (viewIndex !== null) return false;
      const chess = chessRef.current;
      if (status !== "playing" && status !== "thinking") return false;
      if (chess.turn() !== playerColor) return false;
      try {
        const result = chess.move({
          from: from as Square,
          to: to as Square,
          promotion,
        });
        if (!result) return false;
        setLastMove({ from: result.from, to: result.to });
        syncFromChess();
        return true;
      } catch {
        // chess.js throws on illegal moves — swallow for drag-drop UX
        return false;
      }
    },
    [playerColor, status, syncFromChess, viewIndex],
  );

  const newGame = useCallback(
    async (
      color: PlayerColor = playerColor,
      elo: number = botElo,
      personaId: string | null = personalityId,
    ) => {
      chessRef.current = new Chess();
      setPlayerColor(color);
      const persona = personaId ? getPersonality(personaId) : undefined;
      setPersonalityId(personaId);
      setBotElo(persona?.elo ?? elo);
      setHintsUsed(0);
      setHintArrow(null);
      setLastMove(null);
      setViewIndex(null);
      setHistory([]);
      setBotLine(undefined);
      setFen(chessRef.current.fen());
      setStatus("playing");
      await clearCurrentGame();
    },
    [playerColor, botElo, personalityId],
  );

  const selectPersonality = useCallback(
    (p: Personality) => {
      void newGame(playerColor, p.elo, p.id);
    },
    [newGame, playerColor],
  );

  const resign = useCallback(() => {
    syncFromChess(true);
    const persona = personalityId ? getPersonality(personalityId) : undefined;
    if (persona) setBotLine(randomOneLiner(persona));
    void recordGameStat({
      id: `game-${Date.now()}`,
      result: "resigned",
      botElo,
      blunders: 0,
      date: Date.now(),
    });
  }, [botElo, personalityId, syncFromChess]);

  /** Undo last full move pair (player + bot). Unlimited vs bots. */
  const takeback = useCallback(() => {
    const chess = chessRef.current;
    const hist = chess.history({ verbose: true });
    if (hist.length === 0) return;
    const last = hist[hist.length - 1]!;
    chess.undo();
    // If the last ply was the bot, also undo the player's move before it
    if (last.color !== playerColor) {
      chess.undo();
    }
    const after = chess.history({ verbose: true });
    const prev = after[after.length - 1];
    setLastMove(prev ? { from: prev.from, to: prev.to } : null);
    syncFromChess();
  }, [playerColor, syncFromChess]);

  const requestHint = useCallback(async () => {
    if (hintsUsed >= 3) return;
    const chess = chessRef.current;
    if (chess.turn() !== playerColor) return;
    try {
      const engine = getPlayEngine();
      const evaluation = await engine.evaluate(chess.fen(), { depth: 12 });
      const best = evaluation.bestLine[0];
      if (!best || best.length < 4) return;
      setHintArrow({ from: best.slice(0, 2), to: best.slice(2, 4) });
      setHintsUsed((h) => h + 1);
    } catch (e) {
      console.error("Hint failed", e);
    }
  }, [hintsUsed, playerColor]);

  /** View-only scrub through earlier positions */
  const scrubTo = useCallback((index: number | null) => {
    if (index === null) {
      setViewIndex(null);
      setFen(chessRef.current.fen());
      return;
    }
    const temp = new Chess();
    const moves = chessRef.current.history();
    for (let i = 0; i <= index && i < moves.length; i++) {
      temp.move(moves[i]!);
    }
    setViewIndex(index);
    setFen(temp.fen());
  }, []);

  const displayFen =
    viewIndex === null
      ? fen
      : (() => {
          const temp = new Chess();
          const moves = history;
          for (let i = 0; i <= viewIndex && i < moves.length; i++) {
            temp.move(moves[i]!);
          }
          return temp.fen();
        })();

  const isPlayersTurn =
    status === "playing" &&
    viewIndex === null &&
    chessRef.current.turn() === playerColor;

  return {
    fen: displayFen,
    liveFen: fen,
    history,
    viewIndex,
    playerColor,
    botElo,
    status,
    hintsUsed,
    hintsRemaining: Math.max(0, 3 - hintsUsed),
    hintArrow,
    lastMove,
    engineReady,
    hydrated,
    isPlayersTurn,
    makeMove,
    newGame,
    resign,
    takeback,
    requestHint,
    scrubTo,
    setBotElo,
    setPlayerColor,
    personalityId,
    selectPersonality,
    botLine,
    clearHint: () => setHintArrow(null),
    pgn: () => chessRef.current.pgn(),
  };
}
