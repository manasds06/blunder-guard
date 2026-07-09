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
