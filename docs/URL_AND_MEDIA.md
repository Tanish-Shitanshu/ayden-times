# The URL, and Google's media tools (Veo, Lyria)

Checked against Google's published pages on 22 Nov 2026. Plans, credits and prices change, so confirm in your own account before relying on a number.

## 1. Can the Cloud Run URL change?

**The address itself cannot be renamed.** A `run.app` URL is fixed by the service name, the project and the region. Creating a new service would give a new address and break the one you already submitted. Do not do that. The submitted URL must keep working through evaluation.

**You can put a friendlier address in front of it. The old one keeps working.** Options, from safest to most work:

| Option | Needs a domain? | Cost | Notes |
|---|---|---|---|
| **A. Short link and QR code** (a redirect to the run.app address) | No | Free | Zero risk, works today. **Recommended for tomorrow.** |
| **B. Free `*.web.app` address** through Firebase Hosting in front of Cloud Run | No | Free to low | Gives a name like `yourname.web.app`. Caveat below. |
| **C. Your own domain** (for example `ayden.app`) through Firebase Hosting | Yes, about ₹700 to ₹2,000 a year | Domain plus low hosting cost | Looks the most professional. Same caveat. |
| **D. Your own domain through a global external load balancer** | Yes | Roughly $18 a month or more for the load balancer | Most control (own certificate, CDN, paths). Google lists this as the recommended route. |
| Cloud Run "domain mappings" | Yes | Free | Still Preview or limited availability. Not recommended. |

**Caveat for B and C:** Firebase Hosting forwards requests to Cloud Run with a time limit of about 60 seconds. Our slowest actions (running the sandbox, and finishing a mission so the judge can score it) can come close to that. Test a full mission through any new address before using it, and keep the `run.app` address as the fallback.

**Do you need a domain?** Only for a custom name. For tomorrow, a short link and a QR code give you a memorable address with no risk. Buy a domain after the event if you want one.

## 2. The Google media tools, by name

| Tool | What it makes | Where you can use it |
|---|---|---|
| **Lyria** (Lyria 3 Clip, Lyria 3 Pro, Lyria 3.5) | **Music** | Gemini app and Flow (paid plan); Gemini API (paid) |
| **Veo** (Veo 3.1 Lite, Fast, standard) | **Video** | Flow and the Gemini app (paid plan); Gemini API and Vertex AI (paid) |
| Gemini image models (nicknamed "Nano Banana") | Images | Already used for our badge art via Vertex AI |
| Gemini speech (text to speech) | Voice | Already used for the "Listen" button |
| **Flow** | Google's app for making video and music | Included credits with Google AI plans |

**Free or cheap?**
- **In the apps, with your Google AI Pro plan**, you get monthly credits. Google's plans page lists Flow credits (1,000 a month) and Flow music credits (10,000 a month) for AI Pro. That is the free-for-you route.
- **Through the API there is no free tier.** Lyria 3 Clip is about $0.04 per clip; Lyria 3 Pro and 3.5 about $0.08 per song. Veo is billed per second, from about $0.05 (Lite) to $0.40 (full quality).
- **Recommendation:** use your AI Pro credits to make assets for the pitch and the product. Do not wire Veo or Lyria into the live app through the API, because that adds a cost for every use and has no free tier.

## 3. The completion sound (like Duolingo's level-complete chime)

**Already built:** when a learner finishes a mission and the "Shift complete" card appears, a bright chime plays. It is synthesised in the browser, so it works with no files. Moving to the next beat plays a softer two-note sound. A "Sound on/off" switch is in the footer.

**To use a Lyria sound instead:** generate it, then save it as `apps/web/public/sounds/complete.mp3` (and optionally `beat.mp3`, `pass.mp3`). The app tries the file first and falls back to the built-in chime if the file is missing. Keep each file under 2.5 seconds and under 100 KB.

How to make it: open the Gemini app (or Flow), choose music, paste a prompt, download the result, and trim it to the first 2 to 3 seconds (music models make longer clips). Give me the file and I will trim, convert and add it.

**Prompt for the finish sound (`complete.mp3`):**
> A very short, joyful achievement jingle, about 2 seconds long. A bright rising four-note arpeggio on glockenspiel and soft marimba in C major, ending on a sparkling high chime with a gentle shimmer. Clean and dry, no vocals, no drums, no long reverb tail. It should feel like completing a level in a friendly learning app.

**Prompt for moving to the next beat (`beat.mp3`):**
> A tiny 1 second interface sound: two quick ascending soft bell notes, warm and friendly, completely dry, no vocals, no background music.

**Prompt for checks passing (`pass.mp3`):**
> A single bright success "ping", about 1 second: a glass-like chime with one short sparkle. No melody, no vocals.

**Optional spoken line:** Gemini text to speech can read "Shift complete. Nice work." We already have the speech service, so a spoken congratulation is a small addition if you want it.

## 4. Veo ideas (for the deck and the landing page only)

Use Flow with Veo 3.1 Lite or Fast to keep credit use low. Label anything generated as an AI illustration. **Never** use generated video to show testimonials or real users.

**Landing page loop (6 to 8 seconds):**
> Cinematic close-up of a new graduate at a bright modern desk, looking at a laptop where a chat with colleagues is open. Soft daylight, shallow depth of field, a slow push-in, calm and confident mood. No readable text, no logos.

**Pitch deck opener (about 6 seconds):**
> A nervous young professional pauses at an office door on their first day, then walks in confidently as the team looks up and smiles. Warm natural light, handheld camera, realistic, no text.

## 5. Short link and QR for tomorrow

Use any link shortener to point a short, readable address at `https://ayden-app-388558128884.asia-south1.run.app`, and print a QR code of it for the slide and the table. Point a second QR at `/feedback` on the same address for the traction campaign.
