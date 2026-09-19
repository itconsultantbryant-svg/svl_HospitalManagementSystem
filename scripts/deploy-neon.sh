#!/usr/bin/env bash
# Deploy U-HPCMS API to Neon Functions.
# Prefers: neon CLI. Fallback: REST multipart (NEON_API_KEY or NEON_ACCESS_TOKEN).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROJECT_ID="${NEON_PROJECT_ID:-patient-fog-47191385}"
BRANCH_ID="${NEON_BRANCH_ID:-br-restless-flower-b5vbdnky}"
SLUG="${NEON_FUNCTION_SLUG:-api}"
ENV_FILE="${NEON_ENV_FILE:-.env.neon}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Copy .env.neon.example → .env.neon and set JWT_SECRET + CORS_ORIGIN"
  exit 1
fi

# --- Path A: neon CLI ---
if command -v neon >/dev/null 2>&1; then
  if neon deploy --env "$ENV_FILE" --project-id "$PROJECT_ID" --branch "$BRANCH_ID" 2>/tmp/neon-deploy-err.txt; then
    echo ""
    echo "Deployed via neon CLI."
    neon functions get "$SLUG" -o yaml 2>/dev/null || true
    echo ""
    echo "Set Vercel VITE_API_URL to the invocation_url (no trailing slash)."
    exit 0
  fi
  echo "neon CLI deploy failed (often expired auth). Trying REST fallback…"
  cat /tmp/neon-deploy-err.txt >&2 || true
fi

# --- Path B: REST multipart ---
TOKEN="${NEON_API_KEY:-${NEON_ACCESS_TOKEN:-}}"
if [[ -z "$TOKEN" ]]; then
  echo "Set NEON_API_KEY (console API key) or run: neon auth"
  echo "Then re-run: ./scripts/deploy-neon.sh"
  exit 1
fi

OUT_DIR="${NEON_BUNDLE_DIR:-/tmp/neon-api-bundle}"
ZIP="${OUT_DIR}/api.zip"
mkdir -p "$OUT_DIR"

echo "Building function bundle…"
node --input-type=commonjs <<'NODE'
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const outDir = process.env.NEON_BUNDLE_DIR || "/tmp/neon-api-bundle";
fs.mkdirSync(outDir, { recursive: true });
esbuild.buildSync({
  entryPoints: ["backend/functions/api.js"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  outfile: path.join(outDir, "index.js"),
  minify: true,
  packages: "bundle",
  alias: { "sql.js": "./backend/functions/empty-stub.js" },
  external: ["pg-native"],
});
execSync(`cd "${outDir}" && zip -q -r api.zip index.js`, { stdio: "inherit" });
console.log("wrote", path.join(outDir, "api.zip"));
NODE

URL="https://console.neon.tech/api/v2/projects/${PROJECT_ID}/branches/${BRANCH_ID}/functions/${SLUG}/deployments"

echo "Uploading $ZIP …"
curl -sS -f -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -F "runtime=nodejs24" \
  -F "zip=@${ZIP};type=application/zip" \
  "$URL" | tee /tmp/neon-deploy-result.json
echo ""

echo "Waiting for deployment…"
FN_URL="https://console.neon.tech/api/v2/projects/${PROJECT_ID}/branches/${BRANCH_ID}/functions/${SLUG}"
for _ in $(seq 1 30); do
  STATUS=$(curl -sS -H "Authorization: Bearer $TOKEN" "$FN_URL" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['function']['current_deployment']['status'])")
  echo "  status=$STATUS"
  [[ "$STATUS" == "completed" || "$STATUS" == "failed" || "$STATUS" == "error" ]] && break
  sleep 2
done

INV=$(curl -sS -H "Authorization: Bearer $TOKEN" "$FN_URL" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['function']['invocation_url'].rstrip('/'))")
echo ""
echo "Health:"
curl -sS "$INV/api/health"; echo
echo ""
echo "Set Vercel VITE_API_URL=$INV"
