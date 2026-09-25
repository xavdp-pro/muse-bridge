#!/usr/bin/env bash
# Local smoke: unit tests + optional live server (stub or real muse).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[smoke] npm test"
npm test

BIND="${MUSE_BRIDGE_BIND:-127.0.0.1}"
if [[ -n "${MUSE_BRIDGE_HOME:-}" ]]; then
  HOME_DIR="$MUSE_BRIDGE_HOME"
  CLEAN_HOME=0
else
  HOME_DIR="$(mktemp -d /tmp/muse-bridge-smoke-XXXXXX)"
  CLEAN_HOME=1
fi
if [[ -n "${MUSE_BRIDGE_PORT:-}" ]]; then
  PORT="$MUSE_BRIDGE_PORT"
else
  PORT=$((4320 + RANDOM % 800))
fi
export MUSE_BRIDGE_HOME="$HOME_DIR"
export MUSE_BRIDGE_PORT="$PORT"
export MUSE_BRIDGE_BIND="$BIND"

if [[ "${BRIDGE_MUSE_STUB:-1}" == "1" ]]; then
  export BRIDGE_MUSE_STUB=1
  unset MUSE_MODEL
else
  export BRIDGE_MUSE_STUB=0
  : "${MUSE_MODEL:?Set MUSE_MODEL for live smoke or BRIDGE_MUSE_STUB=1}"
fi

node bin/muse-bridge.mjs &
PID=$!
cleanup() { kill "$PID" 2>/dev/null || true; [[ "$CLEAN_HOME" == 1 ]] && rm -rf "$HOME_DIR"; }
trap cleanup EXIT

for _ in $(seq 1 30); do
  if curl -sf "http://${BIND}:${PORT}/api/health" >/dev/null 2>&1; then break; fi
  sleep 0.2
done

TOK="$(cat "$HOME_DIR/token")"
BASE="http://${BIND}:${PORT}"

echo "[smoke] health"
curl -sf "$BASE/api/health" | grep -q '"ok":true'

echo "[smoke] inject"
OUT="$(curl -sf -m "${SMOKE_INJECT_TIMEOUT:-120}" \
  -H "Authorization: Bearer $TOK" \
  -H "Content-Type: application/json" \
  -d '{"conversation":"smoke","message":"Reply with exactly MUSE_BRIDGE_OK."}' \
  "$BASE/api/inject")"
echo "$OUT" | grep -q '"ok":true'

if [[ "${BRIDGE_MUSE_STUB:-1}" == "1" ]]; then
  echo "$OUT" | grep -q '"stub":true'
else
  for _ in $(seq 1 120); do
    MET="$(curl -sf -H "Authorization: Bearer $TOK" "$BASE/api/metrics")"
    if echo "$MET" | grep -q '"running":0' && echo "$MET" | grep -q '"completions":'; then
      break
    fi
    sleep 1
  done
  echo "$MET" | grep -q '"errors":0'
fi

echo "[smoke] OK stub=${BRIDGE_MUSE_STUB:-1} port=$PORT"
