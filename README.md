# Skill Tree: swipe into a game dev job

https://lild3x.github.io. Think of it as Tinder for game-industry jobs, except the match is based on what the
**employer actually asks for** (skills, seniority and characteristics) against what the candidate **proved**.

1. **Where you are:** country (so you only see jobs you're allowed to take) and how you want to work.
2. **Pick up to 4 skills** out of 13: Gameplay Programming, Unity, Unreal, Graphics, Networking, Game Design,
   Level Design, UI/UX, Narrative, 3D Art, Audio, QA and Production.
3. **Adaptive skill quiz:** 4 levels per skill. A right answer moves you up; a miss gets one retry with a different
   question; a second miss stops that skill. "I don't know" is always there, so guessing doesn't inflate results.
4. **17 work-style questions** that are hard to fake (see below).
5. **Swipe real job listings**, ranked for you. Right saves, left passes, and ↺ undoes. Each card shows the match %,
   **what the employer needs vs. what you showed**, and the traits their listing asks for. Saved jobs link
   to the original listing to apply.

The **Profile** tab shows your skill depth, work style, best team environment, answer consistency, and
best-fit roles with pre-filled LinkedIn / Indeed / Google Jobs searches (useful for on-site roles).

## How jobs are found and matched

```
GitHub Action (twice a day)                         Browser
┌───────────────────────────────┐                   ┌──────────────────────────────┐
│ scripts/fetch-jobs.mjs        │  data/jobs.json   │ js/jobs/match.js             │
│  • Himalayas, Remotive, Jobicy│ ───────────────▶  │  • drop jobs not open in     │
│  • keep game-industry jobs    │                   │    your country              │
│  • read each listing for:     │                   │  • 55% skill fit             │
│    skills + how central       │                   │  • 25% characteristic fit    │
│    seniority, traits wanted,  │                   │  • 20% seniority fit         │
│    other engines, countries   │                   │  • sort → swipe deck         │
└───────────────────────────────┘                   └──────────────────────────────┘
```

- **Employer needs** come from the listing text (`scripts/lib/extract.mjs`). A skill in the title counts most;
  repeated mentions add up; anything under "nice to have / bonus" counts half. Engines the quiz doesn't cover
  (Godot, GameMaker, Roblox…) count as requirements you haven't proven.
- **Employer characteristics** come from listing language: "collaborate / cross-functional" → Collaboration,
  "self-starter / independently" → Independence, "detail-oriented" → Structure, "prototype / experiment" →
  Curiosity, "ownership / proactive" → Initiative, "fast-paced / under pressure" → Composure.
- It's keyword-based, so it's a well-informed guess. Always read the full listing.

All the sources are remote-job boards, so the deck holds remote roles. For on-site or hybrid, use the role
searches in the Profile tab.

### Refreshing listings

`.github/workflows/update-jobs.yml` runs at 05:17 and 17:17 UTC and commits `data/jobs.json`. Run it any time from
**Actions → Update job listings → Run workflow**. GitHub pauses scheduled workflows after 60 days with no repository
activity; re-enable it from the same page if that happens. If a source is down, the previous data is kept.

Sources' terms are respected: every card credits its source and links to the original listing, and requests stay
within each API's limits (Remotive asks for at most 4 per day).

## How the work-style questions resist faking

No questionnaire is impossible to lie on, but these make it much harder:

- **Forced choice** between two equally positive statements, so there's no "good answer".
- **Realistic scenarios** where every option is reasonable.
- **Hidden repeats:** three questions come back reworded and reordered; contradictions lower **Answer consistency**.
- **Timing:** answers faster than anyone could read are flagged as rushed.
- Option order is shuffled every time.

## Privacy

Everything runs in the browser. Your profile, saved and passed jobs stay in this browser's storage; nothing is sent
anywhere. Job sites only see you when you open a listing.

## Files

| Path | What it is |
|---|---|
| `index.html`, `css/style.css` | Page shell and styling |
| `js/app.js` | Screen-by-screen UI and the swipe deck |
| `js/engine.js` | Adaptive quiz, work-style scoring, role matching, search links |
| `js/jobs/match.js` | Scores real listings against your profile |
| `js/ui/swipe.js` | Drag/swipe gesture |
| `js/data/*.js` | Quiz questions, work-style items, roles, countries/regions |
| `scripts/fetch-jobs.mjs`, `scripts/lib/extract.mjs` | Job feed builder (run by the Action) |
| `data/jobs.json` | Current listings |
| `test/` | Tests for the logic, data and extraction |

## Run locally

Node.js 18+ (22 recommended), nothing to install.

```bash
npm start                      # http://localhost:3000
npm test
node scripts/fetch-jobs.mjs    # refresh data/jobs.json (Node 22 for fetch)
```
