# 05 · Demo, Deck, GTM and Traction (for the founders and Tanish's Claude)

Mentors asked for: ideation, USP, target group, punchlines, a detailed solution, product visuals, architecture, **and a go-to-market that is as strong as the product**. Judges are business **and** technical. This file is the pitch kit. Every number below must be filled with something **measured or sourced**; placeholders are marked `[ ]`.

## 1. The story in 60 seconds (memorise)

"A new graduate joins a company. For the next 60 to 90 days they are slow, not because they cannot code or reason, but because nobody taught them how work actually works: write a commit a teammate can follow, escalate before it is late, say no with a reason, never approve your own work. They learn it on real customers and real code. Pilots rehearse in simulators for hundreds of hours before flying. Graduates rehearse nothing. **Ayden is the flight simulator for your first job.** You work a real day with an AI team that reviews your pull request, tests your code in Google's sandbox, pressures you to merge, and you leave with a Skill X-ray: exactly where you are lacking, with your own words as evidence, and drills that fix it. It is private to you. Colleges and employers see only anonymous group patterns. Our target: turn 60 to 90 days of ramp-up into 15 to 30."

## 2. Demo script (3:00, rehearse until boring)

| Time | Show | Say | Proves |
|---|---|---|---|
| 0:00-0:20 | Slide or landing hero + one failure story ("a new hire pushed a commit called 'fixed stuff' and approved their own payment") | The 60-second story, compressed | Problem fit |
| 0:20-0:35 | Tap **Try the demo** on a phone (QR on slide) → consent → sliders | "One click, no sign-up. I rate myself 4 out of 5 on git hygiene." | Functional, UX, confidence gap setup |
| 0:35-1:20 | Workspace: ask Priya a clarifying question; open the guide; edit the code; **Run checks** (sandbox) | "The manager is a Gemini agent. The checks run in Google's sandbox, not on our server." | Multi-agent, Google AI depth |
| 1:20-1:50 | Submit commit "fixed discount" and a thin PR; Arjun's review arrives; Neha's QA; Priya says "just merge" | "Colleagues have private goals. The reviewer gives one valid blocker and one over-engineering suggestion." | Real artifacts, pressure |
| 1:50-2:10 | Open **Engine Trace** | "The model proposes, the engine decides. Here the engine rejected a reply that revealed a fact Priya doesn't know." | Not an LLM wrapper, architecture |
| 2:10-2:40 | Report: Skill X-ray, confidence gap, quote with ✓ verified, missed fact, consequence | "Scores come from code signals, then a judge whose quotes the server verifies word for word." | Innovation, integrity |
| 2:40-2:55 | Progress: Ramp Map "3 of 6 milestones rehearsed"; tap **New variant** | "Different names, numbers, trap emphasis every time. Same engine, five roles." | Dynamic, scalable |
| 2:55-3:00 | Architecture slide / `/how-it-works` | "Cloud Run, Firestore, Gemini, Secret Manager. Colleges see only groups of five or more." | Security, Google stack |

**Backup video:** record the same path once, 2:50 long, with captions. Upload to Drive (public link) and/or YouTube unlisted. Always have the phone on mobile data and the laptop on hotspot.

## 3. Deck outline (PDF < 10 MB, use the Hack2skill template if it is easy; else clean Google-style slides)

1. **Ayden: rehearse your first 90 days.** Logo, one line, team, "MVP in progress".
2. **The problem.** A concrete mistake story; sourced evidence (new-grad studies, onboarding timelines; only numbers you have opened); the **target** 60-90 → 15-30 days labelled as a target.
3. **Who it hurts / target group.** Fresh graduates and career switchers (India first); colleges and placement cells; employers hiring freshers at scale (IT services, BPO, banks, hospitals).
4. **The solution.** The loop: Diagnose → Train → Prove, with three screenshots.
5. **The AI team.** Cast per role, tools, private goals; **Engine Trace** screenshot: "model proposes, engine disposes".
6. **Skill X-ray and Ramp Map.** Confidence gap, evidence quotes, drills, milestones, target vs achieved.
7. **Five roles, one engine.** SWE, Banking, Nurse, Consulting, Data (mark which are live vs planned).
8. **Architecture.** One diagram with Google components highlighted.
9. **Google AI depth.** Table: model/service → purpose → **Live / Planned**.
10. **Security and privacy.** Table from `03_BACKEND_PLAN.md` §8, k ≥ 5, no leaderboards, sandboxed execution.
11. **Traction.** Real counters from `/system/status` (sessions completed, skills flagged, drills done), two tester quotes; "n = small; we say so".
12. **Go-to-market and business model.** Beachhead, channels, pilot, pricing hypothesis (see §5).
13. **Competition and USP.** Table in `00_MASTER_PLAN.md` §2; punchline: "Forage lets you try the job. Ayden shows you how you really work, trains that gap, and proves you improved."
14. **Roadmap and honest status.** Built vs planned; Gym API for AI agents and company-SOP compiler as future; calibration pilot with a college.
15. **Team and ask.** Tanish, Mohit, credentials from the form; what we want from the programme (pilot college/employer introductions, Google experts on Vertex AI regionalisation).

## 4. Target group and positioning

* **Learner (user):** final-year students and fresh graduates, India first. Pain: "I can code but I have never worked in a team." Promise: practise safely, privately, in 25 minutes.
* **College placement cell / bootcamp (first buyer):** wants graduates who survive their first 90 days; today uses mock interviews. Value: cohort-level patterns ("62% missed the escalation trap") to improve training; completion proof.
* **Employer (second buyer):** hires freshers at scale; ramp-up is expensive. Value: pre-boarding practice, participation visibility, cohort skill gaps to fix their own curriculum. They **do not** get individual scores.
* **Positioning line:** "A simulator for the unwritten rules of work."

## 5. Go-to-market (be concrete; this is a scored conversation)

| Step | Action | Evidence we can show |
|---|---|---|
| Now (today) | Share the live link with classmates and venue students; measure sessions completed and skills flagged | Real counters, two quotes |
| Weeks 1-4 | **College pilot**: one placement cell, one batch of final-year CS students, 3 sessions each; cohort console shows patterns | Pilot plan with metrics: completion rate; skills at target before vs after drills on fresh variants; student-rated confidence gap |
| Month 2-3 | Bootcamp and training-partner channel (they need job-readiness proof) | LOIs, if any (do not claim) |
| Month 3-6 | **Employer pre-boarding pilot**: fixed-fee, one cohort, one role; measured against the employer's own data (manager-rated readiness at day 30, review comments per PR, escalation errors) | Pilot protocol with control group |
| Later | Role Compiler: employers' own roles and SOPs become packs; Gym API for AI labs | Roadmap only |

**Business model (hypotheses to validate, not facts):** free for learners; college licence per cohort; employer fixed-fee pilot, then per-cohort pricing. Do not state prices or market size unless sourced; show the sizing *method* instead: `graduates per year × share entering roles we cover × price per learner`, with the first factor sourced.
**Why not build in-house?** Packs, tested checks and cross-cohort anonymous patterns are the product; a single firm cannot build the library or the benchmark.
**Why would a mentor from Google/Angel One care?** The wedge is role libraries and verified artifact checks, not company data.

## 6. Hard questions and answers

| Question | Answer |
|---|---|
| Isn't this a Gemini prompt with a UI? | No: the model never owns state. Show the Engine Trace: proposals, validation, rejections; the SWE checks run in Google's sandbox; scores begin as code signals; the judge's quotes are verified by the server. |
| Is the score valid? | It is formative. We do not claim predictive validity. We show quoted evidence, binary anchors, two judge runs, "uncertain" when they disagree, and propose a calibration pilot. |
| Why would a company pay? | Pre-boarding rehearsal and group-level skill gaps; pilot measured on their own data; we do not sell individual scores. |
| What stops cheating? | Private by default (nothing to gain), fresh variants, attempt caps, evidence-linked badges, no leaderboards. |
| Where does the data go? | Fictional companies; learner text redacted before model calls; consent; export/delete; cohort sees groups of 5+ only. |
| Can an intern's code run on your servers? | No. Only in Google's sandbox. |
| Why Google? | Gemini function calling, structured output, code execution, embeddings; Cloud Run/Firestore; plus Antigravity and Agent Skills for how we built it. |
| Is it just five scripts? | Five role packs on one engine; surface and trap emphasis are woven per learner, agents answer free text, and **New variant** proves it live. Adding a role is a pack, not a rebuild. |
| What did you build here vs before? | The earlier Ayden prototype began before; the multi-agent engine, Gemini integration, Cloud Run deployment, sandbox checks, Skill X-ray and this UI were built at the event (git history shows it). |
| Your form promised a Gym API and calibrated scores | Long-term vision. We prioritised the learner platform and the verification engine; Gym and calibration are roadmap. |
| Is the nurse scenario clinically valid? | No. It is a simplified fictional scenario (holding, escalating, documenting), labelled as such; clinical review is a pilot prerequisite. |
| What is your traction? | The counters on screen, with sample size stated. |

## 7. Getting real users tonight

* Message to send (WhatsApp, classmates, venue students): "5-minute check: try Ayden, a simulator for your first job. Pick a role, work a short shift with AI colleagues, see where you are lacking. No sign-up. [link]" Add "Please tell me one thing that confused you."
* Rules: ask consent in-app (already built); no names on slides; never run a leaderboard among testers; collect **two quotes** with permission.
* Instrument only what the app records: sessions started, completed, skills flagged, drills started, fresh-variant improvement. Report them as "N people completed a mission by 07:00".
* Feedback: a 3-question Google Form linked from the footer (`content.ts` → `feedbackUrl`) or collected by message.
* Live cohort view: create a cohort "Delhi City Buildathon testers" and ask them to join by code; once 5+ consenting people complete, the cohort console shows **live** anonymous patterns (use this on stage; never seeded numbers presented as real).

## 8. Submission checklist (Tanish submits; nothing automatic)

- [ ] Dashboard checked: window, format, whether video is required; plan to submit by **07:30**.
- [ ] **Prototype link**: Cloud Run URL works on mobile data; `/demo` path works; no test accounts left; keep it live through evaluation and the regional showcases.
- [ ] **PDF deck** < 10 MB, opens on a phone.
- [ ] **Demo video** ≤ 3 min, Drive link set to public or YouTube link.
- [ ] Repo: README (what/how/architecture/built vs planned), ARCHITECTURE.md, SECURITY.md, tests, `.agents/skills`, Conventional Commits history from the event.
- [ ] Secrets scan clean; keys only in Secret Manager; old Neon password rotated after evaluation.
- [ ] Claims guard re-read against the deck and the landing page.
- [ ] Rehearsed pitch twice; who speaks when; phone on mobile data; backup video and screenshots ready.

## 9. Roles in the pitch

Tanish: problem, architecture, Google depth, live demo driving. Mohit: product story, roles, GTM, privacy, Q&A on business. Both: practise the "model proposes, engine disposes" moment because it is the main answer to "is this a wrapper?".
