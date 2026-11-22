#!/usr/bin/env bash
# Deploys the current code as a NO-TRAFFIC "candidate" revision, tests it on live Gemini, and prints the promote command.
# The live site keeps serving the old revision until you promote. Run from anywhere:  bash scripts/deploy-and-verify.sh
set -uo pipefail

PROJECT=ayden-buildathon
REGION=asia-south1
SERVICE=ayden-app
SA="ayden-run@${PROJECT}.iam.gserviceaccount.com"
TOKEN_FILE="$HOME/Documents/Ayden/ADMIN_TOKEN.txt"
cd "$(dirname "$0")/.."

say() { printf '\n== %s\n' "$*"; }
die() { printf '\nSTOP: %s\n' "$*" >&2; exit 1; }

say "1/6 Admin token secret (created once; a private copy goes to $TOKEN_FILE, never into the repo)"
if gcloud secrets describe admin-token --project "$PROJECT" >/dev/null 2>&1; then
  echo "admin-token already exists."
else
  mkdir -p "$(dirname "$TOKEN_FILE")"
  ( umask 077; openssl rand -hex 24 | tr -d '\n' > "$TOKEN_FILE" )
  gcloud secrets create admin-token --project "$PROJECT" --replication-policy=automatic --data-file="$TOKEN_FILE" >/dev/null || die "could not create the secret"
  gcloud secrets add-iam-policy-binding admin-token --project "$PROJECT" --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor" >/dev/null || die "could not grant access"
  echo "created."
fi

say "2/6 Local tests and build"
npm test || die "tests failed"
npm run build >/dev/null || die "build failed"

say "3/6 Deploy a no-traffic candidate revision (takes a few minutes)"
gcloud run deploy "$SERVICE" --source . --region "$REGION" --project "$PROJECT" --no-traffic --tag candidate \
  --update-secrets ADMIN_TOKEN=admin-token:latest \
  --update-env-vars "LLM_MODE=live,COMMIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo dev)" --quiet || die "deploy failed"

URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT" --format=json | python3 -c "import sys,json; print(next((t['url'] for t in json.load(sys.stdin)['status']['traffic'] if t.get('tag')=='candidate'),''))")
[ -n "$URL" ] || die "could not find the candidate URL"
echo "Candidate: $URL"

say "4/6 Is the candidate on live Gemini?"
STATUS=$(curl -s "$URL/api/v1/system/status")
echo "$STATUS" | python3 -c "import sys,json; d=json.load(sys.stdin); print('runtime:', d['runtime'])"
echo "$STATUS" | grep -q '"runtime":"live"' || die "the candidate is NOT live (scripted). Check the Gemini key and billing, then run this again."

say "5/6 Admin page check (token is read from the file, never printed)"
if [ -f "$TOKEN_FILE" ]; then
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "x-admin-token: $(cat "$TOKEN_FILE")" "$URL/api/v1/admin/feedback")
  echo "admin endpoint with your token: HTTP $CODE (200 is good)"
fi

say "6/6 Every role played end to end against live Gemini (about 5 to 10 minutes)"
AYDEN_BASE_URL="$URL" npm -w @ayden/api run test:live
RESULT=$?

echo
if [ $RESULT -eq 0 ]; then
  echo "ALL LIVE TESTS PASSED."
else
  echo "Some live tests FAILED. Send the output above to Claude. Do not promote yet."
fi
echo
echo "To make the candidate the live site (only if you are happy):"
echo "  gcloud run services update-traffic $SERVICE --region $REGION --project $PROJECT --to-latest"
echo "To roll back at any time:"
echo "  gcloud run services update-traffic $SERVICE --region $REGION --project $PROJECT --to-revisions ayden-app-00025-rg2=100"
exit $RESULT
