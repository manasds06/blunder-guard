/**
 * Curated local puzzle bank so /puzzles works without Supabase.
 * When DATABASE_URL is set, the API prefers Prisma; otherwise these ship.
 *
 * Format matches Lichess: FEN is BEFORE the opponent's setup move when using
 * multi-move Lichess imports. Local entries use legal side-to-move solutions.
 */
export type PuzzleRecord = {
  id: string;
  fen: string;
  moves: string; // UCI space-separated
  rating: number;
  themes: string[];
  popularity: number;
};

export const LOCAL_PUZZLES: PuzzleRecord[] = [
  {
    id: "local-mate1-backrank",
    fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
    moves: "e1e8",
    rating: 500,
    themes: ["mateIn1", "backRankMate"],
    popularity: 100,
  },
  {
    id: "local-mate1-queen",
    fen: "6k1/5ppp/8/8/8/8/5PPP/3Q2K1 w - - 0 1",
    moves: "d1d8",
    rating: 400,
    themes: ["mateIn1"],
    popularity: 99,
  },
  {
    id: "local-hanging-queen",
    fen: "rnb1kbnr/pppp1ppp/8/4p3/3qP3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
    moves: "f3d4",
    rating: 450,
    themes: ["hangingPiece"],
    popularity: 95,
  },
  {
    id: "local-endgame-king",
    fen: "8/8/8/4k3/8/3K4/4P3/8 w - - 0 1",
    moves: "e2e4",
    rating: 550,
    themes: ["endgame"],
    popularity: 70,
  },
  {
    id: "local-mate2-scholar",
    fen: "rnbqkbnr/pppp1ppp/8/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 2 3",
    moves: "d1h5 e8e7 h5f7",
    rating: 600,
    themes: ["mateIn2"],
    popularity: 88,
  },
  {
    id: "local-fork-knight",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
    moves: "f3e5",
    rating: 700,
    themes: ["fork", "hangingPiece"],
    popularity: 90,
  },
  {
    id: "local-discovered",
    fen: "r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq - 0 3",
    moves: "e5d4 f3d4",
    rating: 750,
    themes: ["discoveredAttack"],
    popularity: 82,
  },
  {
    id: "local-pin-bishop",
    fen: "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
    moves: "a7a6 b5c6",
    rating: 800,
    themes: ["pin"],
    popularity: 85,
  },
  {
    id: "local-skewer",
    // Rook check on the 8th rank — classic back-rank style skewer/mate pattern
    fen: "4k3/8/8/8/8/8/4R3/4K3 w - - 0 1",
    moves: "e2e8",
    rating: 900,
    themes: ["skewer", "mateIn1"],
    popularity: 80,
  },
  {
    id: "local-trapped-piece",
    fen: "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 5",
    moves: "c4f7",
    rating: 1000,
    themes: ["trappedPiece"],
    popularity: 75,
  },
];

export const CURATED_THEMES = [
  "fork",
  "pin",
  "skewer",
  "hangingPiece",
  "backRankMate",
  "mateIn1",
  "mateIn2",
  "discoveredAttack",
  "trappedPiece",
  "endgame",
] as const;
