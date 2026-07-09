"use client";

import { useMemo } from "react";
import { Chessboard, type PieceDropHandlerArgs } from "react-chessboard";

type Props = {
  fen: string;
  orientation: "white" | "black";
  allowMoves: boolean;
  lastMove: { from: string; to: string } | null;
  hintArrow: { from: string; to: string } | null;
  onMove: (from: string, to: string) => boolean;
};

/**
 * Thin board wrapper around react-chessboard v5 options API.
 * Pattern: Presentational component — no chess rules here; parent validates.
 */
export function GameBoard({
  fen,
  orientation,
  allowMoves,
  lastMove,
  hintArrow,
  onMove,
}: Props) {
  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (lastMove) {
      styles[lastMove.from] = { backgroundColor: "rgba(223, 169, 63, 0.28)" };
      styles[lastMove.to] = { backgroundColor: "rgba(223, 169, 63, 0.45)" };
    }
    return styles;
  }, [lastMove]);

  const arrows = useMemo(() => {
    if (!hintArrow) return [];
    return [
      {
        startSquare: hintArrow.from,
        endSquare: hintArrow.to,
        color: "rgba(76, 183, 130, 0.9)",
      },
    ];
  }, [hintArrow]);

  const options = useMemo(
    () => ({
      id: "blunder-guard-board",
      position: fen,
      boardOrientation: orientation,
      allowDragging: allowMoves,
      squareStyles,
      arrows,
      allowDrawingArrows: false,
      // Graphite board — matches the app's near-black surfaces
      darkSquareStyle: { backgroundColor: "#3d3d47" },
      lightSquareStyle: { backgroundColor: "#8a8a96" },
      darkSquareNotationStyle: { color: "#8a8a96", fontSize: "11px" },
      lightSquareNotationStyle: { color: "#3d3d47", fontSize: "11px" },
      dropSquareStyle: { boxShadow: "inset 0 0 0 2px rgba(223,169,63,0.8)" },
      boardStyle: {
        borderRadius: "8px",
        overflow: "hidden",
        border: "1px solid var(--border-strong)",
        width: "100%",
        maxWidth: "560px",
      },
      onPieceDrop: ({
        sourceSquare,
        targetSquare,
      }: PieceDropHandlerArgs): boolean => {
        if (!targetSquare || !allowMoves) return false;
        return onMove(sourceSquare, targetSquare);
      },
    }),
    [fen, orientation, allowMoves, squareStyles, arrows, onMove],
  );

  return (
    <div
      className="w-full max-w-[560px] mx-auto aspect-square"
      data-testid="game-board"
    >
      <Chessboard options={options} />
    </div>
  );
}
