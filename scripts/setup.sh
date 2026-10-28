#!/usr/bin/env bash
# Cloud session setup: install exact dependencies from the lockfile. Idempotent.
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci --no-audit --no-fund
