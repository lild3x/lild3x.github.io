# Skill Tree: game dev career match

A GitHub Pages site (https://lild3x.github.io) that:

1. Asks **where you're based** and **how you want to work** (remote, hybrid, on-site, any).
2. Lets you **pick up to 4 game-dev skills** out of 13: Gameplay Programming, Unity, Unreal, Graphics, Networking,
   Game Design, Level Design, UI/UX, Narrative, 3D Art, Audio, QA and Production.
3. Runs an **adaptive skill quiz**. Each skill has 4 levels. A right answer moves you up a level; a miss gets one
   retry with a different question; a second miss stops that skill. "I don't know" is always an option,
   so guessing doesn't inflate results.
4. Asks **17 work-style questions** to see how you work with people, not just what you know (see below).
5. **Matches you to roles** (70% skill depth, 30% work-style fit) with a suggested level
   (entry, junior, mid or senior), the team environment that suits you, and **pre-filled job searches** on LinkedIn, Indeed
   and Google Jobs for your location and work preference, plus game-industry boards.

One question per screen, with a progress bar. Works on phones, supports light/dark mode, and you can answer with the
keyboard (1–4 / A–D, 0 = "I don't know").

## How the work-style questions resist faking

No questionnaire is impossible to lie on, but these techniques make it much harder:

- **Forced choice:** each question pairs two equally positive statements, so there's no "good answer" to pick.
- **Realistic scenarios:** "a playtester says your part isn't fun, you…", where every option is reasonable.
- **Hidden repeats:** three questions come back later, reworded and in a different order. If the answers
  contradict each other, the **Answer consistency** score drops.
- **Timing:** answers faster than someone could read both options are flagged as rushed.
- Option order is shuffled every time.

## Privacy

Everything runs in the browser. No answers are stored or sent anywhere; job boards only open when you click a link.

## Files

| Path | What it is |
|---|---|
| `index.html`, `css/style.css` | Page shell and styling |
| `js/app.js` | The screen-by-screen UI |
| `js/engine.js` | Logic: adaptive quiz, scoring, role matching, job links (no DOM, unit-tested) |
| `js/data/skills.js` | Skills and quiz questions (4 levels × 2 questions each) |
| `js/data/workstyle.js` | Work-style traits and questions |
| `js/data/roles.js` | Roles, what skills/traits they need, and search keywords |
| `test/engine.test.js` | Tests for the logic and the data files |

To **add a skill**, add an entry to `js/data/skills.js` (and a role that uses it in `roles.js`).
`npm test` checks that the new data is well formed.

## Run locally

Requires Node.js 18+, nothing to install.

```bash
npm start   # http://localhost:3000
npm test
```

## Going further

Job matching links out to real job boards with your search filled in. To show actual listings inside the
page and rank them, you'd add a jobs API (most need an API key, which can't safely live in a public
GitHub Pages site) behind a small backend.
