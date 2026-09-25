# muse-bridge

HTTP + SSE bridge in front of the [Meta Muse CLI](https://ai.meta.com/) (`muse exec`).
Orchestrators, queues and consoles can inject work, stream JSONL events, and rely on
**headless** runs: no approval prompts, no sandbox cage, no blocking user-input tools.

Implements the SHAPER OS V1.15 realization intent
[REALIZATION-BRIDGE-META-MUSE](https://github.com/xavdp-pro/SHAPER-OS-V1.15/blob/main/docs/intents/cognition-bridge-meta-muse.md).
SHAPER OS itself stays code-free; **this repository** owns the executable bridge.

Same family as [cursor-bridge](https://github.com/xavdp-pro/cursor-bridge) and
[opencode-bridge](https://github.com/xavdp-pro/opencode-bridge): shared inject/events
shape for agent adapters.

```
caller ──HTTP──> muse-bridge :4320 ──spawn──> muse exec --yolo --user-input-auto-resolve --json …
       <──SSE───                  <──stdout── one JSON object per line
```

No npm dependencies. Node.js 20 or later.

## Quick start

```bash
# Measure a model on this host, then:
cp .env.example .env && chmod 600 .env
# set MUSE_MODEL and META_API_KEY
npm start
```

Bearer token path (created on first start, mode 600):
`~/.config/muse-bridge/token`

```bash
T=$(cat ~/.config/muse-bridge/token)
curl -s localhost:4320/api/health
curl -sN -H "Authorization: Bearer $T" "localhost:4320/api/events?conversation=demo" &
curl -s -H "Authorization: Bearer $T" -H 'content-type: application/json' \
  -d '{"conversation":"demo","message":"Reply with exactly MUSE_OK"}' \
  localhost:4320/api/inject
```

## Headless contract

Every real run uses:

- `--yolo` (approval + sandbox off for the run)
- `--user-input-auto-resolve`
- `--json`
- non-interactive child environment (git/npm/pip/debconf)

Verify on the target host before trusting unattended deployment. Exit codes alone
are not sufficient proof of success—witness SSE events.

## API

| Route | Auth | Effect |
|-------|------|--------|
| `GET /api/health` | no | Liveness + config summary |
| `GET /api/vitals` | Bearer | Evidence envelope (counts, CLI probe, workspace check) |
| `GET /api/metrics` | Bearer | Run counters |
| `GET /api/events` | Bearer | SSE (`?conversation=` optional filter) |
| `POST /api/inject` | Bearer | `{ conversation, message, context?, context_file?, perimeter?, model?, provider?, reasoning_effort? }` |

## Configuration

| Variable | Meaning |
|----------|---------|
| `MUSE_MODEL` / `META_MUSE_MODEL` | Measured engine id (required unless `BRIDGE_MUSE_STUB=1`) |
| `META_API_KEY` / `META_MUSE_API_KEY` | Provider key |
| `MUSE_BRIDGE_PORT` | Default `4320` |
| `MUSE_BIN` | Default `muse` on `PATH` |

See `.env.example`.

## Tests

```bash
BRIDGE_MUSE_STUB=1 MUSE_MODEL=stub/engine npm test
```

## License

CC-BY-SA-4.0 — see [LICENSE](LICENSE) and [AUTHORS](AUTHORS.md).
