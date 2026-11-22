# What to add, and where (22 Nov 2026)

Everything below is optional except step 1. Each step is 3 to 4 lines.

## 1. Deploy and test on live Gemini (one command)
Run `bash scripts/deploy-and-verify.sh` from the repo. It creates the admin token (once), deploys a **no-traffic** candidate revision, checks it says `"runtime":"live"`, plays every role end to end on live Gemini, and prints the promote and rollback commands. The live site does not change until you promote.

## 2. Turn on Gemini billing (so the paid terms apply and quota stops causing scripted fallbacks)
1. Open https://aistudio.google.com/apikey and find the key used by the live site (the project that owns Secret Manager `gemini-api-key`).
2. Click **Set up billing** on that key's project (docs: https://ai.google.dev/gemini-api/docs/billing) and set a spend cap, for example about $15.
3. Run step 1 again. It must still say `"runtime":"live"`.

## 3. Backup Gemini key (automatic failover if the main key hits a limit)
1. Create a key in a **different** project at https://aistudio.google.com/apikey with billing on or credits available. The one on this laptop is out of credits (error 402).
2. `printf '%s' 'PASTE_KEY' | gcloud secrets create gemini-api-key-backup --project ayden-buildathon --data-file=-`
3. `gcloud secrets add-iam-policy-binding gemini-api-key-backup --project ayden-buildathon --member=serviceAccount:ayden-run@ayden-buildathon.iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor`
4. `gcloud run services update ayden-app --region asia-south1 --project ayden-buildathon --update-secrets GEMINI_API_KEY_BACKUP=gemini-api-key-backup:latest`

## 4. Admin page for feedback (delete only)
Open `/admin` on the site. The token is in `~/Documents/Ayden/ADMIN_TOKEN.txt` after step 1. Keep that file private.

## 5. Free Looker Studio dashboard on BigQuery (optional, about 5 minutes)
1. Open https://lookerstudio.google.com and choose **Create > Report**.
2. Pick the **BigQuery** connector, then project `ayden-buildathon`, dataset `ayden_analytics`, table `mission_skill_results`.
3. Add a table or bar chart: skill by role, count of "gap". Only claim it in the pitch once you have built it.
