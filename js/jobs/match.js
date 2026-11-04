// Scores real job listings against a candidate profile: like a dating app,
// but the "chemistry" is what the employer's listing asks for (skills,
// seniority, characteristics) vs. what the candidate proved in the quiz.
import { jobAllows } from "../data/countries.js";

const MAX_LEVEL = 4;

export const JOB_LEVEL_LABELS = { 1: "Entry level", 2: "Junior", 3: "Mid-level", 4: "Senior / lead" };

export function needLabel(weight) {
  if (weight >= 0.75) return "Core";
  if (weight >= 0.5) return "Important";
  return "Bonus";
}

/**
 * profile: { depths: {skillId: 0..4}, traits: {traitId: 0..1}, country }
 * Returns null if the job isn't a fit at all (wrong country or no shared skills).
 */
export function scoreJob(job, profile) {
  if (!jobAllows(job, profile.country)) return null;

  const needs = Object.entries(job.skills).sort((a, b) => b[1] - a[1]);
  const totalNeed = needs.reduce((sum, [, w]) => sum + w, 0);
  if (!totalNeed) return null;

  const skills = needs.map(([id, weight]) => {
    const depth = profile.depths[id];
    return { id, weight, depth: depth === undefined ? null : depth };
  });
  // An engine the quiz doesn't test (Godot, GameMaker…) is a core requirement
  // the candidate hasn't proven, so it counts against the fit.
  for (const engine of job.engines || []) skills.splice(1, 0, { id: null, name: engine, weight: 1, depth: null });
  const proven = skills.filter((s) => s.depth > 0);
  if (!proven.length) return null; // nothing in common

  // Skill fit: how much of what they need you've shown, weighted by importance.
  const allNeed = skills.reduce((sum, s) => sum + s.weight, 0);
  const skillFit = skills.reduce((sum, s) => sum + s.weight * ((s.depth || 0) / MAX_LEVEL), 0) / allNeed;

  // Characteristic fit: the traits their listing emphasises vs. your work-style scores.
  const wanted = Object.entries(job.traits || {}).sort((a, b) => b[1] - a[1]);
  const traitTotal = wanted.reduce((sum, [, w]) => sum + w, 0);
  const traitFit = traitTotal
    ? wanted.reduce((sum, [id, w]) => sum + w * (profile.traits[id] || 0), 0) / traitTotal
    : 0.5;

  // Level fit: your depth on their most important skill you were tested on vs. the job's seniority.
  const yourLevel = proven[0].depth;
  const gap = yourLevel - job.level;
  const levelFit = gap >= 2 ? 0.85 : gap >= 0 ? 1 : gap === -1 ? 0.55 : 0.2;

  const score = 0.55 * skillFit + 0.25 * traitFit + 0.2 * levelFit;
  return {
    job,
    score,
    skillFit,
    traitFit,
    levelFit,
    yourLevel,
    skills,
    traits: wanted.slice(0, 3).map(([id, weight]) => ({ id, weight, yours: profile.traits[id] || 0 })),
  };
}

export function rankJobs(jobs, profile, { exclude = new Set() } = {}) {
  return jobs
    .filter((job) => !exclude.has(job.id))
    .map((job) => scoreJob(job, profile))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || (b.job.postedAt || "").localeCompare(a.job.postedAt || ""));
}

export function timeAgo(iso, now = Date.now()) {
  if (!iso) return "";
  const days = Math.floor((now - Date.parse(iso)) / 86400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
