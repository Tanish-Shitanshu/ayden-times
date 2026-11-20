#!/usr/bin/env bash
# Turns on live Gemini mode. Run this yourself in a terminal: you type the key, nothing else sees it.
#   bash scripts/enable-live.sh
# 1) stores the key in Secret Manager, 2) saves it to apps/api/.env.local (git-ignored),
# 3) verifies every Gemini call Ayden uses, 4) switches the Cloud Run service to live mode, 5) runs the smoke test.
set -euo pipefail
P=ayden-buildathon; R=asia-south1; S=ayden-app
cd "$(dirname "$0")/.."
printf "Paste your AI Studio API key (input is hidden), then press Enter: "
read -rs KEY < /dev/tty; echo
[ -n "${KEY:-}" ] || { echo "No key entered."; exit 1; }

if gcloud secrets describe gemini-api-key --project "$P" >/dev/null 2>&1; then
  printf %s "$KEY" | gcloud secrets versions add gemini-api-key --data-file=- --project "$P" >/dev/null
else
  printf %s "$KEY" | gcloud secrets create gemini-api-key --data-file=- --replication-policy=automatic --project "$P" >/dev/null
fi
echo "✓ key stored in Secret Manager"

umask 077
{ grep -v '^GEMINI_API_KEY=\|^LLM_MODE=' apps/api/.env.local 2>/dev/null || true; echo "GEMINI_API_KEY=$KEY"; echo "LLM_MODE=live"; } > apps/api/.env.local.tmp
mv apps/api/.env.local.tmp apps/api/.env.local
unset KEY
echo "✓ saved to apps/api/.env.local (git-ignored)"

echo "Checking the live Gemini calls..."
if ! node --env-file=apps/api/.env.local scripts/smoke-gemini.mjs; then
  echo "Some Gemini checks failed. Cloud Run was NOT switched to live. Send the output above to Claude."
  exit 1
fi

gcloud run services update "$S" --region "$R" --project "$P" \
  --update-secrets GEMINI_API_KEY=gemini-api-key:latest --update-env-vars LLM_MODE=live --quiet
URL=$(gcloud run services describe "$S" --region "$R" --project "$P" --format='value(status.url)')
echo "✓ Cloud Run is live at $URL"
BASE_URL="$URL" node scripts/smoke.mjs
