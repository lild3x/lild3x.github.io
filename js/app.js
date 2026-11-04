// UI: a one-thing-per-screen wizard that ends in a swipeable deck of real
// job listings. Profile and saved jobs are kept in this browser only.
import { SKILLS, SKILL_GROUPS, SKILLS_BY_ID } from "./data/skills.js";
import { TRAITS, TRAITS_BY_ID, WORKSTYLE_ITEMS } from "./data/workstyle.js";
import { COUNTRIES } from "./data/countries.js";
import {
  DEPTH_LABELS,
  MAX_LEVEL,
  MAX_SKILLS,
  WORK_MODES,
  SkillQuiz,
  jobLinks,
  matchRoles,
  scoreWorkstyle,
  shuffle,
  summaryText,
  teamEnvironment,
} from "./engine.js";
import { JOB_LEVEL_LABELS, needLabel, rankJobs, timeAgo } from "./jobs/match.js";
import { attachSwipe } from "./ui/swipe.js";

const stage = document.getElementById("stage");
const progressWrap = document.getElementById("progress");
const progressBar = document.getElementById("progress-bar");
const stepLabel = document.getElementById("step-label");

/* ---------- saved data (this browser only) ---------- */
const STORE_KEY = "skilltree.v1";
function loadStore() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    return { profile: data.profile || null, saved: data.saved || {}, passed: data.passed || [] };
  } catch {
    return { profile: null, saved: {}, passed: [] };
  }
}
function saveStore() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* storage blocked: keep working in memory */
  }
}
let store = loadStore();

/* ---------- live job listings (refreshed twice a day by a GitHub Action) ---------- */
let jobsData = null;
let jobsError = null;

async function loadJobs() {
  const urls = [];
  // Read the newest file straight from the repo so fresh listings show up
  // without waiting for a Pages rebuild; fall back to the copy on this site.
  const owner = window.location.hostname.match(/^([\w-]+)\.github\.io$/)?.[1];
  if (owner) urls.push(`https://raw.githubusercontent.com/${owner}/${owner}.github.io/main/data/jobs.json`);
  urls.push("data/jobs.json");
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data.jobs)) return data;
    } catch {
      /* try the next source */
    }
  }
  throw new Error("Couldn't load job listings");
}

loadJobs()
  .then((data) => (jobsData = data))
  .catch((err) => (jobsError = err))
  .finally(() => {
    if (state.screen === "results" && state.tab === "jobs") render(false);
  });

/* ---------- state ---------- */
const fresh = () => ({
  screen: "intro",
  country: "",
  city: "",
  workMode: null,
  skills: [],
  quiz: null,
  wsIndex: 0,
  wsOrder: null,
  wsShownAt: 0,
  wsResponses: [],
  results: null,
  deck: null,
  swipe: null,
  tab: "jobs",
  busy: false,
});
let state = fresh();

const countryName = () => (state.country === "__other" ? "" : state.country);
const locationText = () => [state.city, countryName()].filter(Boolean).join(", ");

/* ---------- tiny DOM helper (text only, never innerHTML) ---------- */
function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") el.className = value;
    else if (key.startsWith("on")) el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "style") {
      for (const [prop, v] of Object.entries(value)) {
        if (prop.startsWith("--")) el.style.setProperty(prop, v);
        else el.style[prop] = v;
      }
    } else el.setAttribute(key, value === true ? "" : value);
  }
  el.append(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
  return el;
}

function toast(message) {
  const el = h("div", { class: "toast", role: "status" }, message);
  document.body.append(el);
  setTimeout(() => el.classList.add("out"), 1800);
  setTimeout(() => el.remove(), 2300);
}

/* ---------- navigation ---------- */
const PHASES = {
  intro: { label: "", progress: 0 },
  location: { label: "Setup", progress: 0.03 },
  workmode: { label: "Setup", progress: 0.06 },
  skills: { label: "Setup", progress: 0.09 },
  quizIntro: { label: "Skill check", progress: 0.1 },
  quiz: { label: "Skill check" },
  wsIntro: { label: "Work style", progress: 0.55 },
  ws: { label: "Work style" },
  results: { label: "Matches", progress: 1 },
};

function progressFor(screen) {
  if (screen === "quiz") return 0.1 + 0.45 * state.quiz.progress();
  if (screen === "ws") return 0.55 + 0.45 * (state.wsIndex / WORKSTYLE_ITEMS.length);
  return PHASES[screen].progress;
}

function go(screen) {
  state.screen = screen;
  render(true);
}

function render(animate = false) {
  state.swipe = null;
  const screen = SCREENS[state.screen]();
  screen.classList.add("screen");
  if (animate) screen.classList.add("enter");
  stage.replaceChildren(screen);

  const pct = Math.round(progressFor(state.screen) * 100);
  progressWrap.hidden = state.screen === "intro";
  progressBar.style.width = `${pct}%`;
  progressWrap.setAttribute("aria-valuenow", String(pct));
  stepLabel.textContent = PHASES[state.screen].label;

  if (animate) {
    const heading = screen.querySelector("h1, h2");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
    window.scrollTo({ top: 0 });
  }
}

function backButton(to) {
  return h("button", { class: "link back", type: "button", onclick: () => go(to) }, "← Back");
}

/* ---------- screens ---------- */
const SCREENS = {
  intro() {
    const returning = store.profile;
    return h("section", {},
      h("p", { class: "kicker" }, "Game development · job match"),
      h("h1", { class: "display" }, "Swipe into your next game dev job."),
      h("p", { class: "lead" },
        "Prove your skills in a quick adaptive quiz and tell us how you work. Then swipe through real job listings, ranked by what each employer actually asks for."),
      h("ol", { class: "steps" },
        ["Your skills", "Skill check", "Work style", "Swipe jobs"].map((s, i) =>
          h("li", {}, h("span", { class: "step-num" }, String(i + 1)), s))),
      returning
        ? h("div", { class: "row-start" },
          h("button", { class: "btn primary", type: "button", onclick: resume }, "See my job matches"),
          h("button", { class: "btn", type: "button", onclick: () => go("location") }, "Retake quiz"))
        : h("button", { class: "btn primary", type: "button", onclick: () => go("location") }, "Start"),
      h("p", { class: "fineprint" },
        returning
          ? `Welcome back. Your profile and ${Object.keys(store.saved).length} saved jobs are stored in this browser.`
          : "About 5 minutes. Your answers stay in your browser."),
    );
  },

  location() {
    const submit = h("button", { class: "btn primary", type: "submit", disabled: !state.country }, "Continue");
    const select = h("select", { id: "country", onchange: (e) => (submit.disabled = !e.currentTarget.value) },
      h("option", { value: "" }, "Choose your country"),
      COUNTRIES.map((c) => h("option", { value: c.name, selected: state.country === c.name }, c.name)),
      h("option", { value: "__other", selected: state.country === "__other" }, "Somewhere else / prefer not to say"),
    );
    const city = h("input", {
      id: "city",
      type: "text",
      placeholder: "City (optional)",
      maxlength: "60",
      autocomplete: "address-level2",
      value: state.city,
    });
    setTimeout(() => select.focus(), 50);
    return h("section", {},
      backButton("intro"),
      h("p", { class: "kicker" }, "Step 1 of 3"),
      h("h2", {}, "Where are you based?"),
      h("p", { class: "lead" }, "Many remote jobs only hire in certain countries, so we only show ones you can take."),
      h("form", {
        class: "stack",
        onsubmit: (e) => {
          e.preventDefault();
          state.country = select.value;
          state.city = city.value.trim();
          go("workmode");
        },
      },
      h("label", { for: "country", class: "sr-only" }, "Country"),
      select,
      h("label", { for: "city", class: "sr-only" }, "City"),
      city,
      submit),
    );
  },

  workmode() {
    return h("section", {},
      backButton("location"),
      h("p", { class: "kicker" }, "Step 2 of 3"),
      h("h2", {}, "How do you want to work?"),
      h("div", { class: "options" },
        Object.entries(WORK_MODES).map(([id, mode], i) =>
          h("button", {
            type: "button",
            class: `option${state.workMode === id ? " selected" : ""}`,
            "data-key": String(i + 1),
            onclick: () => {
              state.workMode = id;
              go("skills");
            },
          },
          h("span", { class: "key" }, String(i + 1)),
          h("span", { class: "option-text" }, h("strong", {}, mode.label), h("small", {}, mode.desc)),
          )),
      ),
    );
  },

  skills() {
    const count = state.skills.length;
    const toggle = (id) => {
      state.skills = state.skills.includes(id)
        ? state.skills.filter((s) => s !== id)
        : count < MAX_SKILLS
          ? [...state.skills, id]
          : state.skills;
      render(false);
    };
    return h("section", {},
      backButton("workmode"),
      h("p", { class: "kicker" }, "Step 3 of 3"),
      h("h2", {}, "What are your skills?"),
      h("p", { class: "lead" }, `Pick up to ${MAX_SKILLS}. You'll be quizzed on each one, so choose what you really know.`),
      SKILL_GROUPS.map((group) =>
        h("div", { class: "chip-group" },
          h("p", { class: "group-label" }, group),
          h("div", { class: "chips" },
            SKILLS.filter((s) => s.group === group).map((s) => {
              const on = state.skills.includes(s.id);
              return h("button", {
                type: "button",
                class: `chip${on ? " on" : ""}`,
                "aria-pressed": on ? "true" : "false",
                disabled: !on && count >= MAX_SKILLS,
                onclick: () => toggle(s.id),
              }, h("span", { "aria-hidden": "true" }, s.icon), s.name);
            }),
          ),
        )),
      h("div", { class: "row-between sticky-actions" },
        h("span", { class: "muted" }, `${count} of ${MAX_SKILLS} selected`),
        h("button", { class: "btn primary", type: "button", disabled: count === 0, onclick: () => go("quizIntro") }, "Continue"),
      ),
    );
  },

  quizIntro() {
    const names = state.skills.map((id) => SKILLS_BY_ID[id].name);
    return h("section", {},
      backButton("skills"),
      h("p", { class: "kicker" }, "Part 1 · Skill check"),
      h("h2", {}, "How deep does your knowledge go?"),
      h("ul", { class: "bullets" },
        h("li", {}, `Questions get harder as you go: ${MAX_LEVEL} levels per skill.`),
        h("li", {}, "Miss one and you get one more try at that level before we move on."),
        h("li", {}, "Not sure? Pick “I don't know”. Lucky guesses make your matches worse."),
      ),
      h("p", { class: "muted" }, `Skills: ${names.join(", ")}`),
      h("button", {
        class: "btn primary",
        type: "button",
        onclick: () => {
          state.quiz = new SkillQuiz(state.skills);
          go("quiz");
        },
      }, "Begin skill check"),
    );
  },

  quiz() {
    const view = state.quiz.current();
    const choose = (index, button) => {
      if (state.busy) return;
      state.busy = true;
      button.classList.add("selected");
      stage.querySelectorAll(".option, .idk").forEach((b) => (b.disabled = true));
      setTimeout(() => {
        state.busy = false;
        state.quiz.answer(index);
        go(state.quiz.done ? "wsIntro" : "quiz");
      }, 220);
    };
    return h("section", {},
      h("div", { class: "row-between" },
        h("p", { class: "kicker" },
          h("span", { "aria-hidden": "true" }, `${view.icon} `),
          view.skillName,
          view.skillCount > 1 ? h("span", { class: "muted" }, ` · skill ${view.skillNumber}/${view.skillCount}`) : null),
        h("div", { class: "pips", "aria-label": `Level ${view.level} of ${view.maxLevel}` },
          Array.from({ length: view.maxLevel }, (_, i) =>
            h("span", { class: `pip${i + 1 < view.level ? " done" : ""}${i + 1 === view.level ? " now" : ""}` }))),
      ),
      view.retry ? h("p", { class: "tag" }, "Second try at this level") : null,
      h("h2", { class: "question" }, view.prompt),
      h("div", { class: "options" },
        view.options.map((text, i) =>
          h("button", { type: "button", class: "option", "data-key": String(i + 1), onclick: (e) => choose(i, e.currentTarget) },
            h("span", { class: "key" }, "ABCD"[i]),
            h("span", { class: "option-text" }, text)))),
      h("button", { type: "button", class: "link idk", "data-key": "0", onclick: (e) => choose(-1, e.currentTarget) }, "I don't know"),
    );
  },

  wsIntro() {
    return h("section", {},
      h("p", { class: "kicker" }, "Part 2 · Work style"),
      h("h2", {}, "How do you actually work?"),
      h("ul", { class: "bullets" },
        h("li", {}, "No right or wrong answers. Both options are good things."),
        h("li", {}, "Pick the one that's more true for you, even if it's close."),
        h("li", {}, "Go with your first instinct, not what sounds impressive."),
      ),
      h("p", { class: "muted" },
        `${WORKSTYLE_ITEMS.length} quick questions. Employers hire for how you work with people, so these are matched against what each listing asks for.`),
      h("button", {
        class: "btn primary",
        type: "button",
        onclick: () => {
          state.wsIndex = 0;
          state.wsResponses = [];
          state.wsOrder = null;
          go("ws");
        },
      }, "Start"),
    );
  },

  ws() {
    const item = WORKSTYLE_ITEMS[state.wsIndex];
    if (!state.wsOrder) {
      state.wsOrder = shuffle(item.options); // randomize position every time
      state.wsShownAt = performance.now();
    }
    const choose = (option, button) => {
      if (state.busy) return;
      state.busy = true;
      button.classList.add("selected");
      stage.querySelectorAll(".option").forEach((b) => (b.disabled = true));
      state.wsResponses.push({ itemId: item.id, trait: option.trait, ms: performance.now() - state.wsShownAt });
      setTimeout(() => {
        state.busy = false;
        state.wsIndex += 1;
        state.wsOrder = null;
        if (state.wsIndex >= WORKSTYLE_ITEMS.length) {
          finishQuiz();
          go("results");
        } else {
          go("ws");
        }
      }, 200);
    };
    const isPair = item.type === "pair";
    return h("section", {},
      h("p", { class: "kicker" }, `Work style · ${state.wsIndex + 1} of ${WORKSTYLE_ITEMS.length}`),
      h("h2", { class: "question" }, item.prompt),
      h("div", { class: isPair ? "options pair" : "options" },
        state.wsOrder.map((option, i) =>
          h("button", {
            type: "button",
            class: `option${isPair ? " tall" : ""}`,
            "data-key": String(i + 1),
            onclick: (e) => choose(option, e.currentTarget),
          },
          isPair ? null : h("span", { class: "key" }, String(i + 1)),
          h("span", { class: "option-text" }, option.text)))),
    );
  },

  results() {
    const savedCount = Object.keys(store.saved).length;
    const titles = { jobs: "Jobs that fit you", saved: "Saved jobs", profile: "Your profile" };
    const tabs = h("div", { class: "tabs", role: "tablist" },
      [["jobs", "Jobs"], ["saved", savedCount ? `Saved (${savedCount})` : "Saved"], ["profile", "Profile"]].map(([id, label]) =>
        h("button", {
          type: "button",
          role: "tab",
          class: "tab",
          "aria-selected": state.tab === id ? "true" : "false",
          onclick: () => {
            state.tab = id;
            render(false);
          },
        }, label)));
    const panel = { jobs: jobsPanel, saved: savedPanel, profile: profilePanel }[state.tab]();
    return h("section", {}, h("h2", {}, titles[state.tab]), tabs, panel);
  },
};

/* ---------- results ---------- */
function computeResults(depths, workstyle) {
  return {
    depths,
    workstyle,
    matches: matchRoles(state.skills, depths, workstyle.traits),
    environment: teamEnvironment(workstyle.traits),
  };
}

function finishQuiz() {
  const depths = state.quiz.depths();
  const workstyle = scoreWorkstyle(state.wsResponses);
  state.results = computeResults(depths, workstyle);
  state.tab = "jobs";
  state.deck = null;
  store.passed = []; // a new profile deserves a fresh look at every job
  store.profile = {
    country: state.country,
    city: state.city,
    workMode: state.workMode,
    skills: state.skills,
    depths,
    workstyle,
    savedAt: new Date().toISOString(),
  };
  saveStore();
}

function resume() {
  const p = store.profile;
  Object.assign(state, { country: p.country, city: p.city, workMode: p.workMode, skills: p.skills });
  state.results = computeResults(p.depths, p.workstyle);
  state.tab = "jobs";
  state.deck = null;
  go("results");
}

function buildDeck() {
  const profile = { depths: state.results.depths, traits: state.results.workstyle.traits, country: countryName() };
  const exclude = new Set([...Object.keys(store.saved), ...store.passed]);
  state.deck = {
    items: rankJobs(jobsData.jobs, profile, { exclude }),
    totalFits: rankJobs(jobsData.jobs, profile).length,
    index: 0,
    history: [],
  };
}

function decide(direction) {
  const deck = state.deck;
  const item = deck.items[deck.index];
  if (!item) return;
  if (direction === "right") {
    const { job } = item;
    store.saved[job.id] = {
      id: job.id,
      title: job.title,
      company: job.company,
      url: job.url,
      source: job.source,
      locationText: job.locationText,
      score: item.score,
      savedAt: Date.now(),
    };
    if (item.score >= 0.7) toast("Strong fit, saved ♥");
  } else {
    store.passed.push(item.job.id);
  }
  deck.history.push({ id: item.job.id, direction });
  deck.index += 1;
  saveStore();
  render(false);
}

function undo() {
  const deck = state.deck;
  const last = deck.history.pop();
  if (!last) return;
  if (last.direction === "right") delete store.saved[last.id];
  else store.passed = store.passed.filter((id) => id !== last.id);
  deck.index -= 1;
  saveStore();
  render(false);
}

function companyLogo(job) {
  const initials = (job.company || "?").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const fallback = () => h("span", { class: "logo initials", "aria-hidden": "true" }, initials);
  if (!job.logo) return fallback();
  return h("img", {
    class: "logo",
    src: job.logo,
    alt: "",
    loading: "lazy",
    referrerpolicy: "no-referrer",
    onerror: (e) => e.currentTarget.replaceWith(fallback()),
  });
}

function resultLabel(depth) {
  if (depth === null) return { text: "Not tested", cls: "gap" };
  if (depth === 0) return { text: "Not yet", cls: "gap" };
  return { text: `✓ ${DEPTH_LABELS[depth]}`, cls: depth >= 3 ? "good" : "ok" };
}

function jobCard(item, isTop) {
  const { job } = item;
  const pct = Math.round(item.score * 100);
  return h("article", {
    class: `job-card${isTop ? "" : " behind"}`,
    "aria-hidden": isTop ? null : "true",
    inert: isTop ? null : true,
    "aria-label": isTop ? `${job.title} at ${job.company}, ${pct}% match` : null,
  },
  h("span", { class: "stamp save", "aria-hidden": "true" }, "SAVE"),
  h("span", { class: "stamp pass", "aria-hidden": "true" }, "PASS"),
  h("header", { class: "job-head" },
    companyLogo(job),
    h("div", { class: "job-co" },
      h("strong", {}, job.company),
      h("span", { class: "muted small" }, [timeAgo(job.postedAt), `via ${job.source}`].filter(Boolean).join(" · "))),
    h("span", { class: "fit-ring", style: { "--p": String(pct) }, title: "Overall match" }, h("span", {}, `${pct}%`))),
  h("h3", { class: "job-title" }, job.title),
  h("div", { class: "chips-row" },
    ["Remote", job.locationText, JOB_LEVEL_LABELS[job.level], job.salary].filter(Boolean).map((t) => h("span", { class: "pill" }, t))),
  h("div", { class: "needs" },
    h("p", { class: "group-label" }, "What they need → what you showed"),
    item.skills.slice(0, 4).map((s) => {
      const result = resultLabel(s.depth);
      return h("div", { class: "need-row" },
        h("span", {}, s.id ? SKILLS_BY_ID[s.id].name : `${s.name} (engine)`, h("small", { class: "muted" }, ` · ${needLabel(s.weight)}`)),
        h("span", { class: `you ${result.cls}` }, result.text));
    })),
  item.traits.length
    ? h("div", { class: "needs" },
      h("p", { class: "group-label" }, "They're looking for"),
      h("div", { class: "chips-row" },
        item.traits.map((t) =>
          h("span", { class: `pill${t.yours >= 0.5 ? " match" : ""}` }, `${t.yours >= 0.5 ? "✓ " : ""}${TRAITS_BY_ID[t.id].name}`))))
    : null,
  h("p", { class: "job-snippet" }, job.snippet),
  );
}

function jobsPanel() {
  if (!jobsData && !jobsError) {
    return h("div", { class: "panel", role: "tabpanel" }, h("p", { class: "empty-state" }, "Loading live job listings…"));
  }
  if (jobsError) {
    return h("div", { class: "panel", role: "tabpanel" },
      h("p", { class: "empty-state" }, "Couldn't load job listings right now. Try again in a bit, or use the job searches in the Profile tab."));
  }
  if (!state.deck) buildDeck();
  const { items, index, history, totalFits } = state.deck;
  const remaining = items.length - index;
  const mode = state.workMode;

  const note =
    mode === "onsite" || mode === "hybrid"
      ? h("p", { class: "note" },
        `These listings are remote roles you can take from ${countryName() || "where you are"}. For ${WORK_MODES[mode].label.toLowerCase()} roles near you, use the job searches in the Profile tab.`)
      : null;
  const meta = h("div", { class: "row-between deck-meta" },
    h("span", { class: "muted small" }, remaining > 0 ? `${remaining} of ${totalFits} matching jobs left` : ""),
    h("span", { class: "muted small" }, `Listings updated ${timeAgo(jobsData.generatedAt)}`));

  if (!totalFits) {
    return h("div", { class: "panel", role: "tabpanel" }, note,
      h("p", { class: "empty-state" },
        "No open listings match your tested skills in your country right now. New jobs are added twice a day. In the meantime, the Profile tab has job searches for your best-fit roles."));
  }

  if (remaining <= 0) {
    return h("div", { class: "panel", role: "tabpanel" }, note,
      h("div", { class: "empty-state" },
        h("p", {}, h("strong", {}, "You've seen every matching job."), " New listings are added twice a day."),
        h("div", { class: "row-center" },
          h("button", { class: "btn small", type: "button", disabled: !history.length, onclick: undo }, "↺ Undo last"),
          store.passed.length
            ? h("button", { class: "btn small", type: "button", onclick: () => { store.passed = []; saveStore(); state.deck = null; render(false); } }, "Show passed jobs again")
            : null,
          h("button", { class: "btn small primary", type: "button", onclick: () => { state.tab = "saved"; render(false); } }, "View saved"))));
  }

  const top = items[index];
  const next = items[index + 1];
  const deckEl = h("div", { class: "deck" }, next ? jobCard(next, false) : null, jobCard(top, true));
  const swipe = attachSwipe(deckEl.lastChild, { onSwipe: (dir) => decide(dir === "right" ? "right" : "left") });
  state.swipe = swipe;

  return h("div", { class: "panel", role: "tabpanel" },
    note,
    meta,
    deckEl,
    h("div", { class: "deck-actions" },
      h("button", { class: "round small-round", type: "button", "aria-label": "Undo", title: "Undo", disabled: !history.length, onclick: undo }, "↺"),
      h("button", { class: "round pass", type: "button", "aria-label": "Pass", title: "Pass (←)", onclick: () => swipe.fling("left") }, "✕"),
      h("button", { class: "round save", type: "button", "aria-label": "Save job", title: "Save (→)", onclick: () => swipe.fling("right") }, "♥"),
      h("a", { class: "round small-round", href: top.job.url, target: "_blank", rel: "noopener noreferrer", "aria-label": "Open the full listing", title: "Open listing" }, "↗")),
    h("p", { class: "hint" }, "Swipe right to save, left to pass. Keyboard: ← →"),
  );
}

function savedPanel() {
  const saved = Object.values(store.saved).sort((a, b) => b.savedAt - a.savedAt);
  if (!saved.length) {
    return h("div", { class: "panel", role: "tabpanel" },
      h("p", { class: "empty-state" }, "Nothing saved yet. Swipe right on jobs you like and they'll show up here."));
  }
  return h("div", { class: "panel", role: "tabpanel" },
    h("ul", { class: "saved-list" },
      saved.map((s) =>
        h("li", { class: "saved-item" },
          h("div", { class: "saved-text" },
            h("strong", {}, s.title),
            h("span", { class: "muted small" }, `${s.company} · ${Math.round(s.score * 100)}% match · via ${s.source}`)),
          h("div", { class: "saved-actions" },
            h("a", { class: "btn small primary", href: s.url, target: "_blank", rel: "noopener noreferrer" }, "Apply ↗"),
            h("button", {
              class: "link small",
              type: "button",
              "aria-label": `Remove ${s.title}`,
              onclick: () => {
                delete store.saved[s.id];
                saveStore();
                state.deck = null;
                render(false);
              },
            }, "Remove"))))),
    h("p", { class: "muted small" }, "Applications happen on the original listing. Saved jobs stay in this browser."),
  );
}

function profilePanel() {
  const r = state.results;
  const ws = r.workstyle;
  const top = ws.ranked.slice(0, 2).map((id) => TRAITS_BY_ID[id]);
  const reliabilityText = {
    High: "Your answers were consistent across repeated questions.",
    Medium: "Mostly consistent. A couple of answers didn't line up or were very quick.",
    Low: "Several answers contradicted each other or were rushed. Retake it slowly for truer matches.",
  }[ws.reliability];

  return h("div", { class: "panel", role: "tabpanel" },
    h("div", { class: "block" },
      h("h3", {}, "Skill depth"),
      Object.entries(r.depths).map(([id, depth]) =>
        h("div", { class: "meter-row" },
          h("span", { class: "meter-label" }, SKILLS_BY_ID[id].name),
          h("span", { class: "segments", "aria-label": `Level ${depth} of ${MAX_LEVEL}` },
            Array.from({ length: MAX_LEVEL }, (_, i) => h("span", { class: i < depth ? "on" : "" }))),
          h("span", { class: "meter-value" }, DEPTH_LABELS[depth])))),
    h("div", { class: "block" },
      h("h3", {}, "How you work"),
      h("p", {}, "Strongest: ", h("strong", {}, top.map((t) => t.name).join(" & ")), `. ${top[0].desc}`),
      ws.ranked.map((id) =>
        h("div", { class: "meter-row" },
          h("span", { class: "meter-label" }, TRAITS_BY_ID[id].name),
          h("span", { class: "bar" }, h("span", { style: { width: `${Math.round(ws.traits[id] * 100)}%` } })),
          h("span", { class: "meter-value" }, `${Math.round(ws.traits[id] * 100)}`)))),
    h("div", { class: "block two-up" },
      h("div", {},
        h("h3", {}, "Best team environment"),
        h("p", {}, h("strong", {}, r.environment.title)),
        h("p", { class: "muted small" }, r.environment.text)),
      h("div", {},
        h("h3", {}, "Answer consistency"),
        h("p", {}, h("span", { class: `badge rel-${ws.reliability.toLowerCase()}` }, ws.reliability)),
        h("p", { class: "muted small" }, reliabilityText))),
    h("div", { class: "block" },
      h("h3", {}, "Roles that fit you"),
      h("p", { class: "muted small" }, "Search more job boards, including on-site and hybrid roles near you."),
      r.matches.map((m) => {
        const search = jobLinks(m.role, m.level, { location: locationText(), workMode: state.workMode });
        return h("details", { class: "role" },
          h("summary", {},
            h("span", {}, h("strong", {}, m.role.title), h("span", { class: "muted small" }, ` · ${m.level.label}`)),
            h("span", { class: "muted small" }, `${Math.round(m.score * 100)}%`)),
          h("p", { class: "muted small" }, `${m.role.blurb} Searching “${search.query}”${search.where ? ` · ${search.where}` : ""}.`),
          h("div", { class: "links" },
            search.links.map((link) => h("a", { class: "btn small", href: link.url, target: "_blank", rel: "noopener noreferrer" }, link.name, " ↗"))));
      })),
    h("div", { class: "row-between" },
      h("button", { class: "link", type: "button", onclick: retake }, "Retake quiz"),
      h("button", { class: "btn small", type: "button", onclick: (e) => copySummary(e.currentTarget) }, "Copy summary"),
    ),
  );
}

async function copySummary(button) {
  const r = state.results;
  const text = summaryText({
    location: locationText(),
    workMode: state.workMode,
    depths: r.depths,
    skillNames: Object.fromEntries(SKILLS.map((s) => [s.id, s.name])),
    workstyle: r.workstyle,
    matches: r.matches,
    environment: r.environment,
    traitNames: Object.fromEntries(TRAITS.map((t) => [t.id, t.name])),
  });
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "Copied ✓";
  } catch {
    button.textContent = "Copy failed";
  }
  setTimeout(() => (button.textContent = "Copy summary"), 2000);
}

function retake() {
  const keep = { country: state.country, city: state.city, workMode: state.workMode };
  state = { ...fresh(), ...keep };
  go("location");
}

/* ---------- keyboard: 1-4 / A-D pick options, 0 = I don't know, ← → swipe ---------- */
document.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.target.closest("input, textarea, select")) return;
  if (state.swipe && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
    event.preventDefault();
    state.swipe.fling(event.key === "ArrowRight" ? "right" : "left");
    return;
  }
  const letter = "abcd".indexOf(event.key.toLowerCase());
  const key = letter >= 0 && state.screen === "quiz" ? String(letter + 1) : event.key;
  const button = stage.querySelector(`[data-key="${CSS.escape(key)}"]:not(:disabled)`);
  if (button) {
    event.preventDefault();
    button.click();
  }
});

render(true);
