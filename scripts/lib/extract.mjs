// Reads a raw job listing and works out what the employer is asking for:
// which game-dev skills (and how central each one is), which personality /
// work-style traits, and what seniority. Used by scripts/fetch-jobs.mjs.
//
// It's keyword-based, so it's a best guess from the listing text, not a
// guarantee. Skill and trait ids match js/data/skills.js and js/data/workstyle.js.

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', mdash: "—", ndash: "–", hellip: "…" };

export function stripHtml(html = "") {
  let text = String(html);
  // Some feeds double-encode their HTML.
  for (let i = 0; i < 2 && /&lt;|&gt;|&amp;/.test(text); i++) text = decodeEntities(text);
  return decodeEntities(
    text
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|div|li|h\d|br|tr)>|<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, code) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

/* ---------------- is this a game-industry job? ---------------- */

const GAME_TITLE = /\b(game|games|gaming|gameplay|unity|unreal|level design(er)?|technical artist|tech artist|environment artist|character artist|concept artist|vfx artist|3d artist|animator|sound designer|narrative designer|game designer|esports)\b/i;
const GAME_BODY = /\b(video games?|games?|gaming|gameplay|unity3?d?|unreal( engine)?|ue5|ue4|console|playstation|xbox|nintendo|steam|multiplayer|mobile games?)\b/gi;
const NOT_GAME = /\bgame[- ]?chang(er|ing)\b|\bgamif(y|ied|ication)\b|\bgambling\b|\bcasino\b|\bbetting\b|\bigaming\b|\bsportsbook\b/gi;

export function isGameJob(title, text) {
  const cleanTitle = title.replace(NOT_GAME, " ");
  // Gambling ("iGaming") is a separate industry from game development.
  const GAMBLING = /\b(gambling|casinos?|betting|igaming|sportsbooks?|slots)\b/gi;
  if (GAMBLING.test(title) || (text.match(GAMBLING) || []).length >= 2) return false;
  if (GAME_TITLE.test(cleanTitle)) return true;
  const body = text.replace(NOT_GAME, " ");
  return (body.match(GAME_BODY) || []).length >= 4;
}

/* ---------------- skills ---------------- */

// title: matches in the job title (strong signal). body: matches in the description.
const SKILL_PATTERNS = {
  gameplay: {
    title: /\b(gameplay|game (developer|programmer|engineer)|game dev)\b/i,
    body: /\b(gameplay|game (mechanics|systems|logic|loop)|game (programmer|developer|engineer)|game development)\b/gi,
  },
  unity: { title: /\bunity\b/i, body: /\bunity(3d)?\b(?! of)|\bc#/gi },
  unreal: { title: /\b(unreal|ue[45])\b/i, body: /\b(unreal( engine)?|ue[45]|blueprints?)\b/gi },
  graphics: {
    title: /\b(graphics|rendering|shader|technical artist|tech artist|vfx)\b/i,
    body: /\b(shaders?|hlsl|glsl|rendering|render pipeline|graphics (programming|engineer)|vulkan|directx|opengl|gpu|vfx)\b/gi,
  },
  networking: {
    title: /\b(multiplayer|network|netcode|online|backend)\b/i,
    body: /\b(multiplayer|netcode|networking|network programming|replication|dedicated servers?|matchmaking|online services|client[- ]server)\b/gi,
  },
  design: {
    title: /\b(game designer|systems designer|game design|economy designer|combat designer|designer)\b/i,
    body: /\b(game design|systems design|core loop|game balance|balancing|economy design|game mechanics|design documents?|gdd)\b/gi,
  },
  level: {
    title: /\b(level designer|level design|world builder|environment designer)\b/i,
    body: /\b(level design|level layout|world ?building|blockouts?|greybox|encounter design)\b/gi,
  },
  uiux: {
    title: /\b(ui|ux|ui\/ux|user interface|user experience)\b/i,
    body: /\b(ui\/ux|ux design|ui design|user interface|user experience|hud|figma|wireframes?|usability)\b/gi,
  },
  narrative: {
    title: /\b(narrative|writer|story|quest designer)\b/i,
    body: /\b(narrative|storytelling|dialogue|screenwriting|quest design|lore|story ?arcs?)\b/gi,
  },
  art3d: {
    title: /\b(3d|artist|animator|animation|modeler|modeller|rigger)\b/i,
    body: /\b(3d (art|modell?ing|models?|assets?)|maya|blender|zbrush|substance( painter)?|3ds ?max|rigging|animation|animator|texturing|sculpting)\b/gi,
  },
  audio: {
    title: /\b(audio|sound|composer|music)\b/i,
    body: /\b(audio|sound design|sound effects|sfx|wwise|fmod|foley|composer|music composition)\b/gi,
  },
  qa: {
    title: /\b(qa|quality assurance|tester|test engineer|game tester)\b/i,
    body: /\b(quality assurance|qa|bug reports?|test (plans?|cases)|regression testing|playtesting|playtests?)\b/gi,
  },
  production: {
    title: /\b(producer|project manager|production (manager|coordinator)|scrum master|product manager)\b/i,
    body: /\b(producer|project management|scrum|agile|jira|roadmaps?|milestones?|stakeholders?)\b/gi,
  },
};

// Text after headings like "Nice to have" / "Bonus" is treated as optional.
const OPTIONAL_MARKER = /\b(nice[- ]to[- ]haves?|bonus( points)?|preferred( qualifications| skills)?|pluses|is a plus|would be a plus|desirable)\b/i;

/**
 * Returns { skillId: importance } where importance is 0.25..1.
 * Title matches count heavily; body matches add up (capped). Skills that only
 * appear in a "nice to have" section are halved.
 */
export function extractSkills(title, text) {
  const marker = text.search(OPTIONAL_MARKER);
  const result = {};
  for (const [id, { title: titleRe, body }] of Object.entries(SKILL_PATTERNS)) {
    const inTitle = titleRe.test(title);
    const hits = [...text.matchAll(body)];
    const required = hits.filter((m) => marker === -1 || m.index < marker).length;
    const optional = hits.length - required;
    let points = (inTitle ? 3 : 0) + Math.min(required, 3) + Math.min(optional, 2) * 0.5;
    if (points < 2) continue; // a single passing mention isn't a requirement
    let importance = Math.min(1, points / 4);
    if (!inTitle && required === 0) importance *= 0.5;
    result[id] = Math.round(importance * 100) / 100;
  }
  return result;
}

/* ---------------- engines the quiz doesn't cover ---------------- */

const OTHER_ENGINES = {
  Godot: /\bgodot\b/gi,
  Defold: /\bdefold\b/gi,
  GameMaker: /\bgame ?maker\b/gi,
  Cocos: /\bcocos(2d|2d-x| creator)?\b/gi,
  Phaser: /\bphaser(\.js|js)?\b/gi,
  Roblox: /\broblox\b|\bluau\b/gi,
  Solar2D: /\bsolar2d\b|\bcorona sdk\b/gi,
  Panda3D: /\bpanda3d\b/gi,
  Bevy: /\bbevy\b/gi,
  O3DE: /\bo3de\b|\blumberyard\b/gi,
  CryEngine: /\bcryengine\b/gi,
  "Three.js": /\bthree\.?js\b/gi,
  "Babylon.js": /\bbabylon\.?js\b/gi,
  PlayCanvas: /\bplaycanvas\b/gi,
  MonoGame: /\bmonogame\b|\bxna\b/gi,
  Pygame: /\bpygame\b/gi,
  "Source engine": /\bsource (engine|2)\b/gi,
};

/** Engines a listing is built around (in the title, or mentioned repeatedly). */
export function extractEngines(title, text) {
  return Object.entries(OTHER_ENGINES)
    .filter(([, re]) => (title.match(re) || []).length > 0 || (text.match(re) || []).length >= 3)
    .map(([name]) => name);
}

/* ---------------- employer characteristics ---------------- */

const TRAIT_PATTERNS = {
  collab: /\b(collaborat\w*|team ?player|teamwork|cross[- ]functional|work(ing)? closely with|partner(ing)? with|communicat\w*|interpersonal)\b/gi,
  autonomy: /\b(self[- ]?(starter|motivated|directed|managed)|independent(ly)?|autonomous(ly)?|autonomy|minimal (supervision|guidance)|async(hronous)?|on your own)\b/gi,
  structure: /\b(detail[- ]oriented|attention to detail|organi[sz]ed|organi[sz]ational|structured|methodical|documentation|processes|reliab(le|ility)|thorough|meticulous)\b/gi,
  curiosity: /\b(curious|curiosity|prototyp\w*|experiment\w*|iterat\w*|eager to learn|love (of|for) learning|learn new|innovat\w*|creative|creativity|passion(ate)? (for|about) games)\b/gi,
  ownership: /\b(ownership|take (the )?initiative|initiative|proactive(ly)?|self[- ]?driven|driven|leadership|lead (a|the) team|mentor(ing|ship)?|accountab\w*|drive (results|decisions))\b/gi,
  composure: /\b(fast[- ]paced|under pressure|pressure|adaptab\w*|flexib\w*|ambiguity|ambiguous|resilien\w*|changing priorities|tight deadlines|deadlines|constructive (feedback|criticism)|calm)\b/gi,
};

/** Returns { traitId: weight } with weights 0..1 relative to the strongest trait. */
export function extractTraits(text) {
  const counts = {};
  for (const [id, re] of Object.entries(TRAIT_PATTERNS)) {
    const distinct = new Set((text.match(re) || []).map((m) => m.toLowerCase()));
    if (distinct.size) counts[id] = distinct.size;
  }
  const max = Math.max(0, ...Object.values(counts));
  return Object.fromEntries(Object.entries(counts).map(([id, n]) => [id, Math.round((n / max) * 100) / 100]));
}

/* ---------------- seniority ---------------- */

// 1 = entry, 2 = junior, 3 = mid, 4 = senior/lead. Matches quiz depth levels.
// The title wins; feed-provided hints (e.g. Himalayas "seniority") are only
// used when the title doesn't say.
export function extractLevel(title, hints = []) {
  const fromText = (s) => {
    s = s.toLowerCase();
    if (/\b(intern|internship|trainee|apprentice|graduate)\b/.test(s)) return 1;
    if (/\b(junior|jr\.?|entry[- ]level|associate)\b/.test(s)) return 2;
    if (/\b(mid[- ]?level|intermediate)\b/.test(s)) return 3;
    if (/\b(principal|staff|lead|head of|director|senior|sr\.?|manager|expert)\b/.test(s)) return 4;
    return null;
  };
  const levels = hints.map(fromText).filter(Boolean);
  return fromText(title) ?? (levels.length ? Math.min(...levels) : 3); // unlabelled -> mid-level
}
