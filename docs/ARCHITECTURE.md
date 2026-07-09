# Architecture — Blunder Guard

Living document. Updated every phase.

## Phase 1 — Board + Elo bots

### High-level

```
[PlayScreen] → useChessGame → EngineProvider (interface)
                                  ↑
                          StockfishProvider
                                  ↑
                     Web Worker (/engine/stockfish.js)
```

### Key patterns

| Pattern | Where | Why |
|---|---|---|
| **Strategy** | `lib/engine/provider.ts` | Bots are interchangeable; Phase 6 neural bot plugs in with zero UI changes |
| **Adapter** | `lib/engine/stockfish.ts` | Only module that speaks UCI / owns the Worker |
| **Command queue** | `StockfishProvider.enqueue` | One search at a time per worker |
| **Repository** | `lib/storage/local.ts` | IndexedDB behind typed helpers |
| **Custom hook** | `hooks/useChessGame.ts` | Chess rules + bot turn loop live outside the board UI |

### Bot strength

- **1320–2000:** `UCI_LimitStrength` + `UCI_Elo`, movetime 800ms
- **400–1200:** Skill Level + MultiPV top-N weighted pick + short movetime (human-like misses)

### Persistence

Current game saved to IndexedDB (`games` store, id=`current`) so refresh resumes.

### Engine assets

- `/public/engine/stockfish.js` + `stockfish.wasm` — Stockfish.js 18 **lite single-threaded**
- No COOP/COEP headers required for v1

## Phase 2 — Live coach + pluggable LLM

### Calculate / explain split

```
User move → StockfishProvider.evaluate (local)
         → detector.ts → MistakeReport
         → [Explain] → /api/coach → LlmProvider (Claude | Gemini)
                                  ↘ template fallback
```

The API **rejects** requests missing engine fields. The LLM never sees a bare FEN without best move / eval / classification.

### LLM Strategy (`lib/llm/`)

| File | Role |
|---|---|
| `provider.ts` | `LlmProvider` interface |
| `claude.ts` | Anthropic adapter |
| `gemini.ts` | Google Gemini adapter |
| `index.ts` | Factory — `LLM_PROVIDER=claude\|gemini`, with cross-fallback if one key is missing |

Switch in UI via Settings → Coach LLM, or env `LLM_PROVIDER`. Model overrides: `ANTHROPIC_MODEL`, `GEMINI_MODEL`.

### Hybrid cost control

1. Instant classifications: local eval swing thresholds (free)
2. Pre-move Blunder Check: depth-8 search, modal never reveals the better move
3. Rich Explain: LLM, cached (client IndexedDB + server LRU), max 20 LLM calls/session then templates
