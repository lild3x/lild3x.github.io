// UI: a one-thing-per-screen wizard. All state lives in memory; nothing is
// sent anywhere. Job boards are only opened when the user clicks a link.
import { SKILLS, SKILL_GROUPS, SKILLS_BY_ID } from "./data/skills.js";
import { TRAITS, TRAITS_BY_ID, WORKSTYLE_ITEMS } from "./data/workstyle.js";
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

const stage = document.getElementById("stage");
const progressWrap = document.getElementById("progress");
const progressBar = document.getElementById("progress-bar");
const stepLabel = document.getElementById("step-label");

const fresh = () => ({
  screen: "intro",
  location: "",
  workMode: null,
  skills: [],
  quiz: null,
  wsIndex: 0,
  wsOrder: null,
  wsShownAt: 0,
  wsResponses: [],
  results: null,
  tab: "matches",
  busy: false,
});
let state = fresh();

/* ---------- tiny DOM helper (text only, never innerHTML) ---------- */
function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") el.className = value;
    else if (key.startsWith("on")) el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "style") Object.assign(el.style, value);
    else el.setAttribute(key, value === true ? "" : value);
  }
  el.append(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
  return el;
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
  results: { label: "Results", progress: 1 },
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
  const screen = SCREENS[state.screen]();
  screen.classList.add("screen");
  if (animate) screen.classList.add("enter");
  stage.replaceChildren(screen);

  const phase = PHASES[state.screen];
  progressWrap.hidden = state.screen === "intro";
  progressBar.style.width = `${Math.round(progressFor(state.screen) * 100)}%`;
  progressWrap.setAttribute("aria-valuenow", String(Math.round(progressFor(state.screen) * 100)));
  stepLabel.textContent = phase.label;

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
    return h("section", {},
      h("p", { class: "kicker" }, "Game development · career match"),
      h("h1", { class: "display" }, "Find where you fit in game dev."),
      h("p", { class: "lead" },
        "Pick your skills, prove them in a quick adaptive quiz, tell us how you work, and get matched to roles with live job searches."),
      h("ol", { class: "steps" },
        ["Your skills", "Skill check", "Work style", "Matches"].map((s, i) =>
          h("li", {}, h("span", { class: "step-num" }, String(i + 1)), s))),
      h("button", { class: "btn primary", type: "button", onclick: () => go("location") }, "Start"),
      h("p", { class: "fineprint" }, "About 5 minutes. Your answers never leave your browser."),
    );
  },

  location() {
    const input = h("input", {
      id: "location",
      type: "text",
      autocomplete: "address-level2",
      placeholder: "City, Country",
      maxlength: "80",
      value: state.location,
    });
    const submit = (event) => {
      event.preventDefault();
      state.location = input.value.trim();
      go("workmode");
    };
    setTimeout(() => input.focus(), 50);
    return h("section", {},
      backButton("intro"),
      h("p", { class: "kicker" }, "Step 1 of 3"),
      h("h2", {}, "Where are you based?"),
      h("p", { class: "lead" }, "We use this to search for jobs near you or in your region."),
      h("form", { onsubmit: submit, class: "stack" },
        h("label", { for: "location", class: "sr-only" }, "City and country"),
        input,
        h("button", { class: "btn primary", type: "submit" }, "Continue"),
      ),
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
        h("button", {
          class: "btn primary",
          type: "button",
          disabled: count === 0,
          onclick: () => go("quizIntro"),
        }, "Continue"),
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
          `${view.skillName}`,
          view.skillCount > 1 ? h("span", { class: "muted" }, ` · skill ${view.skillNumber}/${view.skillCount}`) : null),
        h("div", { class: "pips", "aria-label": `Level ${view.level} of ${view.maxLevel}` },
          Array.from({ length: view.maxLevel }, (_, i) =>
            h("span", { class: `pip${i + 1 < view.level ? " done" : ""}${i + 1 === view.level ? " now" : ""}` }))),
      ),
      view.retry ? h("p", { class: "tag" }, "Second try at this level") : null,
      h("h2", { class: "question" }, view.prompt),
      h("div", { class: "options" },
        view.options.map((text, i) =>
          h("button", {
            type: "button",
            class: "option",
            "data-key": String(i + 1),
            onclick: (e) => choose(i, e.currentTarget),
          },
          h("span", { class: "key" }, "ABCD"[i]),
          h("span", { class: "option-text" }, text)))),
      h("button", {
        type: "button",
        class: "link idk",
        "data-key": "0",
        onclick: (e) => choose(-1, e.currentTarget),
      }, "I don't know"),
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
      h("p", { class: "muted" }, `${WORKSTYLE_ITEMS.length} quick questions. Studios hire for how you work with people, not just what you know.`),
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
      state.wsOrder = shuffle(item.options); // randomize side/position each time
      state.wsShownAt = performance.now();
    }
    const choose = (option, button) => {
      if (state.busy) return;
      state.busy = true;
      button.classList.add("selected");
      stage.querySelectorAll(".option").forEach((b) => (b.disabled = true));
      state.wsResponses.push({
        itemId: item.id,
        trait: option.trait,
        ms: performance.now() - state.wsShownAt,
      });
      setTimeout(() => {
        state.busy = false;
        state.wsIndex += 1;
        state.wsOrder = null;
        if (state.wsIndex >= WORKSTYLE_ITEMS.length) {
          computeResults();
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
    const r = state.results;
    const tabs = h("div", { class: "tabs", role: "tablist" },
      [["matches", "Matches"], ["profile", "Your profile"]].map(([id, label]) =>
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

    return h("section", {},
      h("p", { class: "kicker" }, "Results"),
      h("h2", {}, state.tab === "matches" ? "Your best-fit roles" : "Your profile"),
      tabs,
      state.tab === "matches" ? matchesPanel(r) : profilePanel(r),
    );
  },
};

/* ---------- results ---------- */
function computeResults() {
  const depths = state.quiz.depths();
  const workstyle = scoreWorkstyle(state.wsResponses);
  const matches = matchRoles(state.skills, depths, workstyle.traits);
  const environment = teamEnvironment(workstyle.traits);
  state.results = { depths, workstyle, matches, environment };
  state.tab = "matches";
}

function matchesPanel(r) {
  return h("div", { class: "panel", role: "tabpanel" },
    r.matches.map((m, i) => {
      const search = jobLinks(m.role, m.level, { location: state.location, workMode: state.workMode });
      const coreSkills = Object.entries(m.role.skills)
        .filter(([id]) => r.depths[id] !== undefined)
        .map(([id]) => `${SKILLS_BY_ID[id].name}: ${DEPTH_LABELS[r.depths[id]]}`);
      const strengths = m.role.traits
        .filter((t) => r.workstyle.ranked.slice(0, 3).includes(t))
        .map((t) => TRAITS_BY_ID[t].name);
      return h("details", { class: `match${i === 0 ? " top" : ""}`, open: i === 0 },
        h("summary", {},
          h("span", { class: "match-head" },
            i === 0 ? h("span", { class: "badge accent" }, "Best match") : null,
            h("strong", { class: "match-title" }, m.role.title),
            h("span", { class: "badge" }, m.level.label)),
          h("span", { class: "fit", "aria-label": `${Math.round(m.score * 100)} percent fit` },
            `${Math.round(m.score * 100)}%`)),
        h("div", { class: "match-body" },
          h("p", {}, m.role.blurb),
          h("p", { class: "why" },
            [...coreSkills, ...strengths.map((s) => `Strength: ${s}`)].map((t) => h("span", { class: "pill" }, t))),
          h("p", { class: "muted small" }, `Searching “${search.query}”${search.where ? ` · ${search.where}` : ""}`),
          h("div", { class: "links" },
            search.links.map((link) =>
              h("a", { class: "btn small", href: link.url, target: "_blank", rel: "noopener noreferrer" }, link.name, " ↗"))),
        ),
      );
    }),
    h("div", { class: "row-between" },
      h("button", { class: "link", type: "button", onclick: restart }, "Start over"),
      h("button", { class: "link", type: "button", onclick: () => { state.tab = "profile"; render(false); } }, "See your profile →"),
    ),
  );
}

function profilePanel(r) {
  const ws = r.workstyle;
  const top = ws.ranked.slice(0, 2).map((id) => TRAITS_BY_ID[id]);
  const reliabilityText = {
    High: "Your answers were consistent across repeated questions.",
    Medium: "Mostly consistent. A couple of answers didn't line up or were very quick.",
    Low: "Several answers contradicted each other or were rushed. Retake it slowly for a truer match.",
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
      h("p", {}, `Strongest: `, h("strong", {}, top.map((t) => t.name).join(" & ")), `. ${top[0].desc}`),
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
    h("div", { class: "row-between" },
      h("button", { class: "link", type: "button", onclick: restart }, "Start over"),
      h("button", { class: "btn small", type: "button", onclick: (e) => copySummary(e.currentTarget) }, "Copy summary"),
    ),
  );
}

async function copySummary(button) {
  const r = state.results;
  const text = summaryText({
    location: state.location,
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

function restart() {
  state = fresh();
  go("intro");
}

/* ---------- keyboard: 1-4 / A-D pick options, 0 = I don't know ---------- */
document.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.target.closest("input, textarea")) return;
  const letter = "abcd".indexOf(event.key.toLowerCase());
  const key = letter >= 0 && state.screen === "quiz" ? String(letter + 1) : event.key;
  const button = stage.querySelector(`[data-key="${CSS.escape(key)}"]:not(:disabled)`);
  if (button) {
    event.preventDefault();
    button.click();
  }
});

render(true);
