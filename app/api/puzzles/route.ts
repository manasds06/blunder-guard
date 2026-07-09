/**
 * GET /api/puzzles — returns puzzle pool.
 * Prefers Prisma/Supabase when DATABASE_URL is set; else local bank.
 */
import { NextResponse } from "next/server";
import { LOCAL_PUZZLES, CURATED_THEMES } from "@/lib/puzzles/bank";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const theme = searchParams.get("theme");
  const min = Number(searchParams.get("min") ?? 0);
  const max = Number(searchParams.get("max") ?? 3000);

  let puzzles = LOCAL_PUZZLES;

  if (process.env.DATABASE_URL) {
    try {
      const { PrismaClient } = await import("@prisma/client");
      const prisma = new PrismaClient();
      const rows = await prisma.puzzle.findMany({
        where: {
          rating: { gte: min, lte: max },
          ...(theme ? { themes: { has: theme } } : {}),
        },
        take: 500,
      });
      await prisma.$disconnect();
      if (rows.length > 0) {
        puzzles = rows.map((r: {
          id: string;
          fen: string;
          moves: string;
          rating: number;
          themes: string[];
          popularity: number;
        }) => ({
          id: r.id,
          fen: r.fen,
          moves: r.moves,
          rating: r.rating,
          themes: r.themes,
          popularity: r.popularity,
        }));
      }
    } catch (e) {
      console.warn("Prisma puzzle fetch failed, using local bank", e);
    }
  }

  if (theme) {
    puzzles = puzzles.filter((p) => p.themes.includes(theme));
  }
  puzzles = puzzles.filter((p) => p.rating >= min && p.rating <= max);

  return NextResponse.json({
    puzzles,
    themes: CURATED_THEMES,
    source: process.env.DATABASE_URL ? "db-or-local" : "local",
  });
}
