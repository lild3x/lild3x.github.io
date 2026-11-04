// Pure logic (no DOM): adaptive skill quiz, work-style scoring, role matching
// and job-search links. Kept separate from the UI so it can be unit-tested.
import { SKILLS_BY_ID } from "./data/skills.js";
import { TRAITS, WORKSTYLE_ITEMS, WORKSTYLE_BY_ID } from "./data/workstyle.js";
import { ROLES } from "./data/roles.js";

export const MAX_LEVEL = 4;
export const MAX_SKILLS = 4;
export const RUSHED_MS = 1200; // faster than anyone can read and weigh two options

export const DEPTH_LABELS = ["Not yet", "Foundations", "Working knowledge", "Advanced", "Expert"];

export function shuffle(items, rand = Math.random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Adaptive quiz. For each skill it starts at level 1. A correct answer moves
 * up a level; a wrong answer gives one retry at the same level with a
 * different question; a second miss ends that skill. Depth = highest level passed.
 */
export class SkillQuiz {
  constructor(skillIds, rand = Math.random) {
    if (!skillIds.length) throw new Error("Pick at least one skill");
    this.rand = rand;
    this.skillIds = [...skillIds];
    this.index = -1;
    this.results = {};
    this.state = null;
    this._nextSkill();
  }

  get done() {
    return this.state === null;
  }

  current() {
    return this.done ? null : this.view;
  }

  /** choice: index into current().options, or -1 for "I don't know". */
  answer(choice) {
    if (this.done) throw new Error("Quiz is finished");
    const correct = choice === this._correctIndex;
    const { skillId, level, attempt } = this.state;
    const result = this.results[skillId];
    result.asked += 1;
    if (correct) result.correct += 1;

    if (correct) {
      result.depth = level;
      if (level >= MAX_LEVEL) this._nextSkill();
      else this._enterLevel(skillId, level + 1);
    } else if (attempt === 0) {
      this.state.attempt = 1;
      this._buildView();
    } else {
      this._nextSkill();
    }
    return correct;
  }

  /** 0..1 across all selected skills. */
  progress() {
    if (this.done) return 1;
    return (this.index + (this.state.level - 1) / MAX_LEVEL) / this.skillIds.length;
  }

  depths() {
    return Object.fromEntries(Object.entries(this.results).map(([id, r]) => [id, r.depth]));
  }

  _nextSkill() {
    this.index += 1;
    const id = this.skillIds[this.index];
    if (!id) {
      this.state = null;
      this.view = null;
      return;
    }
    if (!SKILLS_BY_ID[id]) throw new Error(`Unknown skill: ${id}`);
    this.results[id] = { depth: 0, asked: 0, correct: 0 };
    this._enterLevel(id, 1);
  }

  _enterLevel(skillId, level) {
    const pool = SKILLS_BY_ID[skillId].levels[level - 1];
    this.state = { skillId, level, attempt: 0, order: shuffle(pool.map((_, i) => i), this.rand) };
    this._buildView();
  }

  _buildView() {
    const { skillId, level, attempt, order } = this.state;
    const skill = SKILLS_BY_ID[skillId];
    const question = skill.levels[level - 1][order[attempt]];
    const options = shuffle(
      [{ text: question.answer, correct: true }, ...question.wrong.map((text) => ({ text, correct: false }))],
      this.rand,
    );
    this._correctIndex = options.findIndex((o) => o.correct);
    this.view = {
      skillId,
      skillName: skill.name,
      icon: skill.icon,
      skillNumber: this.index + 1,
      skillCount: this.skillIds.length,
      level,
      maxLevel: MAX_LEVEL,
      retry: attempt > 0,
      prompt: question.prompt,
      options: options.map((o) => o.text),
    };
  }
}

/**
 * responses: [{ itemId, trait, ms }]
 * Returns trait scores (0..1 = how often you chose that trait when it was on
 * offer), a consistency ratio from the repeated items, and a reliability label.
 */
export function scoreWorkstyle(responses) {
  const offered = Object.fromEntries(TRAITS.map((t) => [t.id, 0]));
  const picked = { ...offered };
  for (const r of responses) {
    const item = WORKSTYLE_BY_ID[r.itemId];
    if (!item) continue;
    for (const o of item.options) offered[o.trait] += 1;
    picked[r.trait] += 1;
  }
  const traits = Object.fromEntries(
    TRAITS.map((t) => [t.id, offered[t.id] ? picked[t.id] / offered[t.id] : 0]),
  );
  const ranked = TRAITS.map((t) => t.id).sort((a, b) => traits[b] - traits[a]);

  const chosen = Object.fromEntries(responses.map((r) => [r.itemId, r.trait]));
  const checks = WORKSTYLE_ITEMS.filter((i) => i.repeatOf && chosen[i.id] && chosen[i.repeatOf]);
  const matches = checks.filter((i) => chosen[i.id] === chosen[i.repeatOf]).length;
  const consistency = checks.length ? matches / checks.length : 1;
  const rushed = responses.filter((r) => r.ms < RUSHED_MS).length;

  let reliability = "Medium";
  if (consistency === 1 && rushed <= 2) reliability = "High";
  if (consistency < 0.5 || rushed > responses.length / 3) reliability = "Low";

  return { traits, ranked, consistency, checks: checks.length, matches, rushed, reliability };
}

function withEngine(depths) {
  return { ...depths, engine: Math.max(depths.unity || 0, depths.unreal || 0) };
}

function wasSelected(skillId, selected) {
  if (skillId === "engine") return selected.includes("unity") || selected.includes("unreal");
  return selected.includes(skillId);
}

export function seniority(depth) {
  if (depth >= 4) return { label: "Senior", keyword: "senior" };
  if (depth === 3) return { label: "Mid-level", keyword: "" };
  if (depth === 2) return { label: "Junior", keyword: "junior" };
  return { label: "Entry level", keyword: "entry level" };
}

/**
 * Ranks roles by 70% skill fit (quiz depth, weighted by how much the role
 * needs each skill) + 30% work-style fit (your scores on the role's traits).
 */
export function matchRoles(selected, depths, traitScores, limit = 3) {
  const d = withEngine(depths);
  return ROLES.filter((role) =>
    Object.entries(role.skills).some(([id, w]) => w >= 0.5 && wasSelected(id, selected)),
  )
    .map((role) => {
      const entries = Object.entries(role.skills);
      const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
      const skillFit = entries.reduce((sum, [id, w]) => sum + w * ((d[id] || 0) / MAX_LEVEL), 0) / totalWeight;
      const traitFit = role.traits.reduce((sum, t) => sum + (traitScores[t] || 0), 0) / role.traits.length;
      // Seniority comes from the role's main skill when it was quizzed (so a
      // Unity expert isn't labelled a senior gameplay programmer); otherwise
      // from the strongest supporting core skill.
      const [primary] = entries;
      const coreDepth = wasSelected(primary[0], selected)
        ? d[primary[0]] || 0
        : Math.max(...entries.filter(([id, w]) => w >= 0.5 && wasSelected(id, selected)).map(([id]) => d[id] || 0));
      return {
        role,
        score: 0.7 * skillFit + 0.3 * traitFit,
        skillFit,
        traitFit,
        level: seniority(coreDepth),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function teamEnvironment(traits) {
  const indie = (traits.autonomy + traits.curiosity + traits.ownership) / 3;
  const studio = (traits.structure + traits.collab + traits.composure) / 3;
  if (Math.abs(indie - studio) < 0.08) {
    return {
      id: "flexible",
      title: "Indie or established studio",
      text: "You balance independence and structure, so you can adapt to either a small team or a big one.",
    };
  }
  return indie > studio
    ? {
        id: "indie",
        title: "Small indie team or startup",
        text: "You'd do well where people wear many hats, move fast and own big pieces of the game.",
      }
    : {
        id: "studio",
        title: "Established studio",
        text: "You'd do well with clear roles, a defined pipeline and a team you can rely on.",
      };
}

export const WORK_MODES = {
  remote: { label: "Remote", desc: "Work from anywhere" },
  hybrid: { label: "Hybrid", desc: "Some days in the office" },
  onsite: { label: "On-site", desc: "In the studio full time" },
  any: { label: "Open to anything", desc: "Show me everything" },
};

/** Pre-filled searches on real job boards for a matched role. */
export function jobLinks(role, level, { location = "", workMode = "any" } = {}) {
  const query = [level.keyword, role.query].filter(Boolean).join(" ");
  const loc = location.trim();

  const linkedin = new URL("https://www.linkedin.com/jobs/search/");
  linkedin.searchParams.set("keywords", query);
  if (loc) linkedin.searchParams.set("location", loc);
  else if (workMode === "remote") linkedin.searchParams.set("location", "Worldwide");
  const workType = { onsite: "1", remote: "2", hybrid: "3" }[workMode];
  if (workType) linkedin.searchParams.set("f_WT", workType);

  const indeed = new URL("https://www.indeed.com/jobs");
  indeed.searchParams.set("q", workMode === "hybrid" ? `${query} hybrid` : query);
  const indeedLoc = workMode === "remote" ? "Remote" : loc;
  if (indeedLoc) indeed.searchParams.set("l", indeedLoc);

  const where =
    workMode === "remote" ? "remote" : [workMode === "hybrid" ? "hybrid" : "", loc ? `in ${loc}` : ""].filter(Boolean).join(" ");
  const google = `https://www.google.com/search?q=${encodeURIComponent(`${query} jobs ${where}`.trim())}&ibp=htl;jobs`;

  return {
    query,
    where: workMode === "remote" ? (loc ? `Remote · ${loc}` : "Remote") : [WORK_MODES[workMode]?.label, loc].filter(Boolean).join(" · "),
    links: [
      { name: "LinkedIn", url: linkedin.toString() },
      { name: "Indeed", url: indeed.toString() },
      { name: "Google Jobs", url: google },
      { name: "Hitmarker", url: "https://hitmarker.net/jobs" },
      { name: "Work With Indies", url: "https://www.workwithindies.com/" },
    ],
  };
}

/** Plain-text summary for copying into a profile, résumé or message. */
export function summaryText({ location, workMode, depths, skillNames, workstyle, matches, environment, traitNames }) {
  const lines = ["My game-dev skill profile", ""];
  lines.push(`Location: ${location || "Not given"} · Work preference: ${WORK_MODES[workMode]?.label || "Any"}`, "");
  lines.push("Skill depth (adaptive quiz):");
  for (const [id, depth] of Object.entries(depths)) {
    lines.push(`- ${skillNames[id]}: level ${depth}/${MAX_LEVEL} (${DEPTH_LABELS[depth]})`);
  }
  lines.push("", `Work style strengths: ${workstyle.ranked.slice(0, 2).map((t) => traitNames[t]).join(", ")}`);
  lines.push(`Best team environment: ${environment.title}`, "", "Top role matches:");
  matches.forEach((m, i) => lines.push(`${i + 1}. ${m.role.title} (${m.level.label}) · ${Math.round(m.score * 100)}% fit`));
  return lines.join("\n");
}
