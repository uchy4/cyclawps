#!/usr/bin/env bash
# claude-auth-health.sh — Monitors Claude CLI OAuth token health
#
# Usage:
#   ./scripts/claude-auth-health.sh          # Check + refresh if needed
#   ./scripts/claude-auth-health.sh --cron   # Silent mode for cron (only outputs on failure)
#
# Cron setup (every 45 min):
#   */45 * * * * /path/to/cyclawps/scripts/claude-auth-health.sh --cron >> /var/log/claude-auth.log 2>&1
#
# What it does:
#   1. Attempts a minimal API call via the CLI
#   2. If it works → token is valid, refresh it preemptively
#   3. If auth error → attempt refresh
#   4. If refresh fails → alert (log + optional webhook)
#
# Optional env vars:
#   CLAUDE_AUTH_WEBHOOK_URL  — POST to this URL on auth failure (Slack, Discord, ntfy, etc.)
#   CLAUDE_AUTH_LOG_FILE     — Override log file path (default: /var/log/claude-auth.log)

set -euo pipefail

SILENT=false
[[ "${1:-}" == "--cron" ]] && SILENT=true

LOG_FILE="${CLAUDE_AUTH_LOG_FILE:-/var/log/claude-auth.log}"
WEBHOOK_URL="${CLAUDE_AUTH_WEBHOOK_URL:-}"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

log() {
  local msg="[$TIMESTAMP] $1"
  if [[ "$SILENT" == false ]]; then
    echo "$msg"
  fi
  echo "$msg" >> "$LOG_FILE" 2>/dev/null || true
}

alert() {
  local msg="$1"
  log "ALERT: $msg"

  # Always print alerts even in silent mode
  echo "[$TIMESTAMP] ALERT: $msg" >&2

  # Send webhook if configured
  if [[ -n "$WEBHOOK_URL" ]]; then
    curl -s -X POST "$WEBHOOK_URL" \
      -H "Content-Type: application/json" \
      -d "{\"text\":\"🔑 Cyclawps Auth Alert: $msg\"}" \
      > /dev/null 2>&1 || true
  fi
}

# Step 1: Test if token is valid with a minimal API call
test_auth() {
  local output
  output=$(claude --print --max-turns 1 --model haiku "respond with just the word OK" 2>&1) || true

  if echo "$output" | grep -qi "OK"; then
    return 0
  elif echo "$output" | grep -qi "OAuth token has expired\|authentication_error\|401"; then
    return 1
  elif echo "$output" | grep -qi "error"; then
    # Some other error (network, etc.)
    log "WARNING: Unexpected error during auth test: ${output:0:200}"
    return 2
  else
    # Got a response, probably valid
    return 0
  fi
}

# Step 2: Attempt token refresh
try_refresh() {
  local output
  output=$(claude auth refresh 2>&1) || true

  if echo "$output" | grep -qi "success\|refreshed\|ok"; then
    return 0
  else
    return 1
  fi
}

# Main flow
main() {
  # Quick check — is claude CLI available?
  if ! command -v claude &> /dev/null; then
    alert "claude CLI not found in PATH"
    exit 1
  fi

  # Test current auth
  if test_auth; then
    log "OK: Token is valid"

    # Preemptive refresh to extend lifetime
    if try_refresh; then
      log "OK: Token refreshed preemptively"
    else
      log "WARNING: Preemptive refresh failed (token still valid)"
    fi
    exit 0
  fi

  # Token expired — try refresh
  log "Token expired, attempting refresh..."

  if try_refresh; then
    log "OK: Token refreshed successfully"

    # Verify it actually works now
    if test_auth; then
      log "OK: Verified — token is working after refresh"
      exit 0
    else
      alert "Token refresh appeared to succeed but auth still fails. Manual re-login needed: ssh into server and run 'claude /login'"
      exit 1
    fi
  else
    alert "Token refresh failed. Manual re-login needed: ssh into server and run 'claude /login'"
    exit 1
  fi
}

main
