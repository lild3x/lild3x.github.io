import { test } from "node:test";
import assert from "node:assert/strict";
import { SKILLS, SKILLS_BY_ID, SKILL_GROUPS } from "../js/data/skills.js";
import { TRAITS_BY_ID, WORKSTYLE_ITEMS, WORKSTYLE_BY_ID } from "../js/data/workstyle.js";
import { ROLES } from "../js/data/roles.js";
import {
  MAX_LEVEL,
  SkillQuiz,
  jobLinks,
  matchRoles,
  scoreWorkstyle,
  seniority,
  teamEnvironment,
} from "../js/engine.js";

// Answer helper: find which displayed option is the correct one.
function correctIndex(quiz) {
  const view = quiz.current();
  const levels = SKILLS_BY_ID[view.skillId].levels[view.level - 1];
  const question = levels.find((q) => q.prompt === view.prompt);
  return view.options.indexOf(question.answer);
}

test("skill data is well-formed", () => {
  for (const skill of SKILLS) {
    assert.ok(SKILL_GROUPS.includes(skill.group), `${skill.id} group`);
    assert.equal(skill.levels.length, MAX_LEVEL, `${skill.id} levels`);
    for (const level of skill.levels) {
      assert.equal(level.length, 2, `${skill.id} needs 2 questions per level`);
      for (const q of level) {
        assert.equal(q.wrong.length, 3, `"${q.prompt}" needs 3 wrong answers`);
        const all = [q.answer, ...q.wrong];
        assert.equal(new Set(all).size, 4, `"${q.prompt}" has duplicate options`);
      }
    }
  }
});

test("every skill leads to at least one role", () => {
  for (const skill of SKILLS) {
    const matches = matchRoles([skill.id], { [skill.id]: 2 }, {});
    assert.ok(matches.length > 0, `${skill.id} has no role`);
  }
});

test("roles and work-style items reference real skills and traits", () => {
  for (const role of ROLES) {
    for (const id of Object.keys(role.skills)) {
      assert.ok(id === "engine" || SKILLS_BY_ID[id], `${role.id} -> ${id}`);
    }
    for (const t of role.traits) assert.ok(TRAITS_BY_ID[t], `${role.id} -> ${t}`);
  }
  for (const item of WORKSTYLE_ITEMS) {
    for (const o of item.options) assert.ok(TRAITS_BY_ID[o.trait], `${item.id} -> ${o.trait}`);
    if (item.repeatOf) {
      const original = WORKSTYLE_BY_ID[item.repeatOf];
      assert.ok(original, `${item.id} repeats missing ${item.repeatOf}`);
      const traits = (i) => i.options.map((o) => o.trait).sort().join();
      assert.equal(traits(item), traits(original), `${item.id} must offer the same traits`);
    }
  }
});

test("all-correct answers reach the top level in 4 questions", () => {
  const quiz = new SkillQuiz(["unity"]);
  let asked = 0;
  while (!quiz.done) {
    assert.equal(quiz.answer(correctIndex(quiz)), true);
    asked += 1;
  }
  assert.equal(asked, 4);
  assert.deepEqual(quiz.depths(), { unity: 4 });
});

test("two misses at level 1 ends the skill at depth 0", () => {
  const quiz = new SkillQuiz(["audio", "qa"]);
  quiz.answer(-1);
  assert.equal(quiz.current().retry, true);
  assert.equal(quiz.current().skillId, "audio");
  quiz.answer(-1);
  assert.equal(quiz.current().skillId, "qa", "moves on to the next skill");
  assert.equal(quiz.depths().audio, 0);
});

test("a miss followed by a correct retry keeps climbing", () => {
  const quiz = new SkillQuiz(["design"]);
  quiz.answer(correctIndex(quiz)); // pass L1
  const firstPrompt = quiz.current().prompt;
  quiz.answer(-1); // miss L2
  assert.notEqual(quiz.current().prompt, firstPrompt, "retry uses a different question");
  quiz.answer(correctIndex(quiz)); // pass L2 on retry
  assert.equal(quiz.current().level, 3);
  quiz.answer(-1);
  quiz.answer(-1); // fail L3 twice
  assert.equal(quiz.done, true);
  assert.equal(quiz.depths().design, 2);
});

test("work-style scoring detects consistency and rushing", () => {
  const consistent = [
    { itemId: "p1", trait: "collab", ms: 3000 },
    { itemId: "r1", trait: "collab", ms: 3000 },
    { itemId: "p2", trait: "structure", ms: 3000 },
    { itemId: "r2", trait: "structure", ms: 3000 },
  ];
  const a = scoreWorkstyle(consistent);
  assert.equal(a.consistency, 1);
  assert.equal(a.reliability, "High");
  assert.equal(a.traits.collab, 1);
  assert.equal(a.traits.autonomy, 0);

  const contradictory = [
    { itemId: "p1", trait: "collab", ms: 400 },
    { itemId: "r1", trait: "autonomy", ms: 400 },
    { itemId: "p2", trait: "structure", ms: 400 },
    { itemId: "r2", trait: "curiosity", ms: 400 },
  ];
  const b = scoreWorkstyle(contradictory);
  assert.equal(b.consistency, 0);
  assert.equal(b.rushed, 4);
  assert.equal(b.reliability, "Low");
});

test("matching ranks the role that fits the quiz results", () => {
  const traits = { collab: 0.5, autonomy: 0.5, structure: 0.5, curiosity: 0.5, ownership: 0.5, composure: 0.5 };
  const [top] = matchRoles(["unity", "gameplay"], { unity: 4, gameplay: 1 }, traits);
  assert.equal(top.role.id, "unity-developer");
  assert.equal(top.level.label, "Senior");

  const gameplay = matchRoles(["unity", "gameplay"], { unity: 4, gameplay: 2 }, traits)
    .find((m) => m.role.id === "gameplay-programmer");
  assert.equal(gameplay.level.label, "Junior", "seniority follows the role's main skill");

  const qaOnly = matchRoles(["qa"], { qa: 2 }, traits);
  assert.deepEqual(qaOnly.map((m) => m.role.id), ["qa-tester"], "only roles that need the skill are suggested");
});

test("seniority maps quiz depth to search keywords", () => {
  assert.equal(seniority(0).keyword, "entry level");
  assert.equal(seniority(2).keyword, "junior");
  assert.equal(seniority(3).keyword, "");
  assert.equal(seniority(4).keyword, "senior");
});

test("team environment leans with traits", () => {
  const indie = teamEnvironment({ autonomy: 1, curiosity: 1, ownership: 1, structure: 0, collab: 0, composure: 0 });
  assert.equal(indie.id, "indie");
  const studio = teamEnvironment({ autonomy: 0, curiosity: 0, ownership: 0, structure: 1, collab: 1, composure: 1 });
  assert.equal(studio.id, "studio");
});

test("job links encode role, level, location and work mode", () => {
  const role = ROLES.find((r) => r.id === "level-designer");
  const remote = jobLinks(role, seniority(2), { location: "Toronto, Canada", workMode: "remote" });
  assert.equal(remote.query, "junior level designer");
  const li = new URL(remote.links.find((l) => l.name === "LinkedIn").url);
  assert.equal(li.searchParams.get("keywords"), "junior level designer");
  assert.equal(li.searchParams.get("location"), "Toronto, Canada");
  assert.equal(li.searchParams.get("f_WT"), "2");
  const indeed = new URL(remote.links.find((l) => l.name === "Indeed").url);
  assert.equal(indeed.searchParams.get("l"), "Remote");
  assert.match(remote.links.find((l) => l.name === "Google Jobs").url, /ibp=htl;jobs$/);

  const onsite = jobLinks(role, seniority(3), { location: "Austin, TX", workMode: "onsite" });
  const li2 = new URL(onsite.links[0].url);
  assert.equal(li2.searchParams.get("f_WT"), "1");
  assert.equal(new URL(onsite.links[1].url).searchParams.get("l"), "Austin, TX");

  const any = jobLinks(role, seniority(3), { location: "", workMode: "any" });
  assert.equal(new URL(any.links[0].url).searchParams.get("f_WT"), null);
});
