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
      styles[lastMove.from] = { backgroundColor: "rgba(250, 204, 21, 0.45)" };
      styles[lastMove.to] = { backgroundColor: "rgba(250, 204, 21, 0.65)" };
    }
    return styles;
  }, [lastMove]);

  const arrows = useMemo(() => {
    if (!hintArrow) return [];
    return [
      {
        startSquare: hintArrow.from,
        endSquare: hintArrow.to,
        color: "rgb(34, 197, 94)",
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
      boardStyle: {
        borderRadius: "4px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
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
    <div className="w-full max-w-[560px] mx-auto aspect-square">
      <Chessboard options={options} />
    </div>
  );
}
