/**
 * Import Lichess puzzles into Postgres via Prisma.
 *
 * Download: https://database.lichess.org/lichess_db_puzzle.csv.zst (CC0)
 * Decompress to lichess_db_puzzle.csv, then:
 *   npx tsx scripts/import-puzzles.ts path/to/lichess_db_puzzle.csv
 *
 * Why stream: the CSV is millions of rows — loading it all would OOM.
 * Stratified sampling: equal counts per 200-Elo bucket so every level has coverage.
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { PrismaClient } from "@prisma/client";

const CURATED = new Set([
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
]);

const PER_BUCKET = 5000; // ~50k total across ~10 buckets (400–2200)
const buckets = new Map<number, number>();

function bucket(rating: number): number {
  return Math.floor(rating / 200) * 200;
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: npx tsx scripts/import-puzzles.ts <csv-path>");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const rl = createInterface({
    input: createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let headerSkipped = false;
  let batch: Array<{
    id: string;
    fen: string;
    moves: string;
    rating: number;
    themes: string[];
    popularity: number;
  }> = [];
  let imported = 0;

  async function flush() {
    if (batch.length === 0) return;
    await prisma.puzzle.createMany({ data: batch, skipDuplicates: true });
    imported += batch.length;
    console.log(`Imported ~${imported}`);
    batch = [];
  }

  for await (const line of rl) {
    if (!headerSkipped) {
      headerSkipped = true;
      continue;
    }
    // PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags
    const cols = line.split(",");
    if (cols.length < 8) continue;
    const id = cols[0]!;
    const fen = cols[1]!;
    const moves = cols[2]!;
    const rating = Number(cols[3]);
    const popularity = Number(cols[5]);
    const themes = (cols[7] ?? "").split(" ").filter(Boolean);

    if (rating < 400 || rating > 2200) continue;
    if (popularity < 70) continue;
    if (!themes.some((t) => CURATED.has(t))) continue;

    const b = bucket(rating);
    const count = buckets.get(b) ?? 0;
    if (count >= PER_BUCKET) continue;
    buckets.set(b, count + 1);

    batch.push({
      id,
      fen,
      moves,
      rating,
      themes,
      popularity,
    });
    if (batch.length >= 1000) await flush();
  }
  await flush();
  await prisma.$disconnect();
  console.log("Done. Bucket counts:", Object.fromEntries(buckets));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
