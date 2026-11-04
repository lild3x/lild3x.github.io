import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripHtml, isGameJob, extractSkills, extractTraits, extractLevel, extractEngines } from "../scripts/lib/extract.mjs";
import { buildJob, summarizeLocations } from "../scripts/fetch-jobs.mjs";
import { parseLocations, jobAllows } from "../js/data/countries.js";
import { scoreJob, rankJobs, needLabel, timeAgo } from "../js/jobs/match.js";
import { SKILLS_BY_ID } from "../js/data/skills.js";
import { TRAITS_BY_ID } from "../js/data/workstyle.js";

const LISTING = `
<h2>Senior Gameplay Programmer (Unity)</h2>
<p>We're a small indie studio making a co-op roguelike. You'll own gameplay systems end to end.</p>
<ul><li>5+ years of Unity and C# experience shipping games</li>
<li>Strong gameplay programming: combat, AI, game mechanics</li>
<li>Collaborate closely with designers and artists; strong communication</li>
<li>Self-starter comfortable working independently in a fast-paced environment</li></ul>
<h3>Nice to have</h3><ul><li>Multiplayer / netcode experience</li><li>Shaders</li></ul>`;

test("stripHtml handles tags and double-encoded entities", () => {
  assert.equal(stripHtml("<p>Tom &amp; Jerry</p>"), "Tom & Jerry");
  assert.equal(stripHtml("&lt;p&gt;Hi &amp;amp; bye&lt;/p&gt;"), "Hi & bye");
});

test("game-industry filter", () => {
  assert.equal(isGameJob("Senior Gameplay Programmer", ""), true);
  assert.equal(isGameJob("Backend Engineer", "Work on our games, game servers and console games for players of our mobile games"), true);
  assert.equal(isGameJob("Product Manager", "A game-changer for fintech"), false);
  assert.equal(isGameJob("Slots Game Designer", "Online casino and gambling games"), false);
});

test("skills: title and body signals, optional section halves importance", () => {
  const text = stripHtml(LISTING);
  const skills = extractSkills("Senior Gameplay Programmer (Unity)", text);
  assert.equal(skills.gameplay, 1);
  assert.equal(skills.unity, 1);
  assert.ok(!("graphics" in skills), "one bonus mention isn't a requirement");
  for (const id of Object.keys(skills)) assert.ok(SKILLS_BY_ID[id], `unknown skill ${id}`);
});

test("traits: employer characteristics from listing language", () => {
  const traits = extractTraits(stripHtml(LISTING));
  assert.ok(traits.collab > 0);
  assert.ok(traits.autonomy > 0);
  assert.ok(traits.composure > 0);
  for (const id of Object.keys(traits)) assert.ok(TRAITS_BY_ID[id], `unknown trait ${id}`);
  assert.equal(Math.max(...Object.values(traits)), 1);
});

test("seniority from title and hints", () => {
  assert.equal(extractLevel("Junior Unity Developer"), 2);
  assert.equal(extractLevel("Lead Character Artist"), 4);
  assert.equal(extractLevel("Gameplay Intern"), 1);
  assert.equal(extractLevel("Level Designer", ["Mid-level"]), 3);
  assert.equal(extractLevel("Level Designer"), 3);
  assert.equal(extractLevel("Intermediate XR Engineer", ["Senior"]), 3, "the title beats feed hints");
  assert.equal(extractLevel("Game Developer", ["Mid-level", "Senior"]), 3, "lowest hint when the title is silent");
});

test("engines the quiz doesn't cover are detected", () => {
  assert.deepEqual(extractEngines("Godot Game Developer", ""), ["Godot"]);
  assert.deepEqual(extractEngines("Game Developer", "We use GameMaker. GameMaker Studio. Our GameMaker games…"), ["GameMaker"]);
  assert.deepEqual(extractEngines("Unity Developer", "We once tried Godot."), []);
});

test("locations parse into countries, regions or worldwide", () => {
  assert.deepEqual(parseLocations("USA, Canada").countries.sort(), ["Canada", "United States"]);
  assert.deepEqual(parseLocations("Europe only").regions, ["EU"]);
  assert.equal(parseLocations("Worldwide").worldwide, true);
  assert.equal(parseLocations([]).worldwide, true);
  assert.deepEqual(parseLocations(["United Kingdom"]).countries, ["United Kingdom"]);

  const eu = { worldwide: false, countries: [], regions: ["EU"] };
  assert.equal(jobAllows(eu, "Germany"), true);
  assert.equal(jobAllows(eu, "United States"), false);
  assert.equal(jobAllows(eu, ""), true, "unknown country isn't filtered out");
  assert.equal(summarizeLocations({ worldwide: false, countries: ["France", "Germany", "Spain", "Italy", "Poland"], regions: [] }), "Europe (5 countries)");
});

test("buildJob turns a raw listing into a matchable job", () => {
  const job = buildJob({
    id: "t:1",
    title: "Senior Gameplay Programmer (Unity)",
    company: "Tiny Studio",
    url: "https://example.com/job/1",
    html: LISTING,
    locations: ["United States", "Canada"],
    levelHints: [],
    source: "Test",
  });
  assert.equal(job.level, 4);
  assert.equal(job.worldwide, false);
  assert.equal(job.locationText, "United States, Canada");
  assert.ok(job.skills.unity && job.traits.collab);
  assert.equal(buildJob({ id: "t:2", title: "Accountant", url: "https://x", html: "<p>Spreadsheets</p>" }), null);
});

const profile = {
  depths: { unity: 4, gameplay: 3 },
  traits: { collab: 0.8, autonomy: 0.7, structure: 0.3, curiosity: 0.5, ownership: 0.4, composure: 0.6 },
  country: "Canada",
};
const job = (over = {}) => ({
  id: "j",
  worldwide: false,
  countries: ["United States", "Canada"],
  regions: [],
  level: 3,
  skills: { gameplay: 1, unity: 1 },
  traits: { collab: 1, autonomy: 0.5 },
  ...over,
});

test("scoring rewards proven skills, wanted traits and right level", () => {
  const strong = scoreJob(job(), profile);
  assert.ok(strong.score > 0.8, `expected strong fit, got ${strong.score}`);
  assert.equal(strong.skills[0].depth !== null, true);

  const tooSenior = scoreJob(job({ level: 4, skills: { gameplay: 1 } }), { ...profile, depths: { gameplay: 1 } });
  assert.ok(tooSenior.levelFit < 0.5);

  const otherEngine = scoreJob(job({ skills: { gameplay: 1 }, engines: ["Godot"] }), profile);
  const sameEngineless = scoreJob(job({ skills: { gameplay: 1 } }), profile);
  assert.ok(otherEngine.skillFit < sameEngineless.skillFit, "an untested engine lowers the fit");
  assert.equal(otherEngine.skills[1].name, "Godot");

  const partial = scoreJob(job({ skills: { unity: 1, networking: 1 } }), profile);
  assert.ok(partial.skillFit === 0.5, "untested networking counts against the fit");
});

test("jobs outside the country or with nothing in common are excluded", () => {
  assert.equal(scoreJob(job({ countries: ["Germany"] }), profile), null);
  assert.equal(scoreJob(job({ skills: { audio: 1 } }), profile), null);
  const ranked = rankJobs(
    [job({ id: "a", skills: { unity: 0.5, audio: 1 } }), job({ id: "b" }), job({ id: "c" })],
    profile,
    { exclude: new Set(["c"]) },
  );
  assert.deepEqual(ranked.map((r) => r.job.id), ["b", "a"]);
});

test("labels", () => {
  assert.equal(needLabel(1), "Core");
  assert.equal(needLabel(0.5), "Important");
  assert.equal(needLabel(0.25), "Bonus");
  const now = Date.parse("2026-11-10T00:00:00Z");
  assert.equal(timeAgo("2026-11-09T12:00:00Z", now), "today");
  assert.equal(timeAgo("2026-11-01T00:00:00Z", now), "1w ago");
});

test("published jobs.json is well-formed", async () => {
  const data = JSON.parse(await readFile(new URL("../data/jobs.json", import.meta.url), "utf8"));
  assert.ok(Array.isArray(data.jobs) && data.jobs.length >= 10);
  assert.ok(!Number.isNaN(Date.parse(data.generatedAt)));
  for (const j of data.jobs) {
    assert.ok(j.id && j.title && j.company && /^https:\/\//.test(j.url), `bad job ${j.id}`);
    assert.ok(Object.keys(j.skills).length > 0);
    for (const id of Object.keys(j.skills)) assert.ok(SKILLS_BY_ID[id], `${j.id}: unknown skill ${id}`);
    for (const id of Object.keys(j.traits)) assert.ok(TRAITS_BY_ID[id], `${j.id}: unknown trait ${id}`);
    assert.ok(j.level >= 1 && j.level <= 4);
  }
});
