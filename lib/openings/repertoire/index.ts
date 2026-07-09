/**
 * Beginner-aggressive repertoire — breadth kills beginners; depth ≤8 covers most 600-level games.
 * Match drills by position FEN after each move (handles transpositions).
 */
export type OpeningLine = {
  id: string;
  name: string;
  side: "white" | "black";
  /** UCI moves from startpos for the full line (both sides) */
  ucis: string[];
  /** Ideas keyed by FEN after the repertoire move was played */
  ideas: Record<string, string>;
};

export const REPERTOIRE: OpeningLine[] = [
  {
    id: "italian-main",
    name: "Italian Game (main)",
    side: "white",
    ucis: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5", "c2c3", "g8f6"],
    ideas: {
      after_e4: "Claim the center and free the bishop.",
      after_Nf3: "Develop with tempo — eye e5.",
      after_Bc4: "Aim at the weak f7 square early.",
      after_c3: "Prepare d4 — classic Italian plan.",
    },
  },
  {
    id: "anti-sicilian",
    name: "Anti-Sicilian (Bb5)",
    side: "white",
    ucis: ["e2e4", "c7c5", "g1f3", "d7d6", "f1b5", "c8d7", "b5d7", "d8d7"],
    ideas: {
      after_Bb5: "Avoid Open Sicilian theory — trade and keep it simple.",
    },
  },
  {
    id: "scandinavian",
    name: "Scandinavian (Black vs e4)",
    side: "black",
    ucis: ["e2e4", "d7d5", "e4d5", "d8d5", "b1c3", "d5a5", "d2d4", "c7c6"],
    ideas: {
      after_d5: "Immediate challenge — open lines for the queen.",
      after_Qa5: "Safe queen perch; develop with …c6 and …Nf6 next.",
    },
  },
  {
    id: "kid-lite",
    name: "KID structure vs d4",
    side: "black",
    ucis: ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "f8g7", "e2e4", "d7d6"],
    ideas: {
      after_g6: "Fianchetto — flexible King's Indian shell.",
      after_Bg7: "Bishop eyes the long diagonal before …d6.",
    },
  },
];
