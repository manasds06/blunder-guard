# Blunder Guard

Chess training app: Elo bots, live blunder coach, puzzles, analysis.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000/play](http://localhost:3000/play).

## Environment

Copy `.env.example` → `.env.local`.

**Fully local coach (no cloud keys):**

1. Install [Ollama](https://ollama.com)
2. `ollama pull llama3.2`
3. In `.env.local`: `LLM_PROVIDER=ollama`

Play, puzzles, analysis, and Stockfish all run in the browser with no network.
If Ollama is down, Explain falls back to built-in templates.

**Cloud (optional):** set `ANTHROPIC_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` and `LLM_PROVIDER=claude` or `gemini`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Local Next.js |
| `npm run build` | Production build |
| `npm run test:unit` | Bot-level unit tests |
| `npm run test:smoke` | Playwright play-page smoke |

## Docs

- [Architecture](./docs/ARCHITECTURE.md)
- [Learning log](./docs/LEARNING_LOG.md)
- Plans live in the parent `ChessTrainer/plans/` folder
