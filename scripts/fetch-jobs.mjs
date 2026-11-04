// Pulls game-industry jobs from free public job APIs, works out what each
// employer needs (skills, traits, seniority) and writes data/jobs.json.
//
// Run by .github/workflows/update-jobs.yml twice a day; run locally with:
//   node scripts/fetch-jobs.mjs
//
// Sources & terms (all link back to the original listing and credit the source):
//   Himalayas  https://himalayas.app/api      (public API, rate limited)
//   Remotive   https://remotive.com/api-documentation  (max ~4 requests/day)
//   Jobicy     https://jobi.cy/apidocs
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripHtml, isGameJob, extractSkills, extractTraits, extractLevel, extractEngines } from "./lib/extract.mjs";
import { parseLocations, COUNTRY_REGION } from "../js/data/countries.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "jobs.json");
const MAX_AGE_DAYS = 45;
const MIN_JOBS = 10; // if we get fewer than this, keep the previous file
const UA = "SkillTree-JobMatcher/1.0 (+https://lild3x.github.io)";

const HIMALAYAS_QUERIES = [
  "game developer", "game designer", "gameplay programmer", "unity developer", "unreal engine",
  "level designer", "technical artist", "game artist", "3d artist", "animator", "sound designer",
  "narrative designer", "game producer", "game qa", "graphics programmer", "multiplayer", "game ui",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

const toList = (v) => (Array.isArray(v) ? v : v ? [v] : []);

function formatSalary(min, max, currency = "USD", period = "") {
  const n = (x) => Number(x);
  if (!n(min) && !n(max)) return "";
  const fmt = (x) => (x >= 1000 ? `${Math.round(x / 1000)}k` : String(x));
  const range = n(min) && n(max) && n(min) !== n(max) ? `${fmt(n(min))}–${fmt(n(max))}` : fmt(n(min) || n(max));
  const per = { annual: "/yr", yearly: "/yr", monthly: "/mo", hourly: "/hr" }[String(period).toLowerCase()] || "";
  return `${currency === "USD" ? "$" : `${currency} `}${range}${per}`;
}

/* ---------------- sources ---------------- */

async function fromHimalayas() {
  const out = [];
  for (const q of HIMALAYAS_QUERIES) {
    for (const page of [1, 2]) {
      const url = `https://himalayas.app/jobs/api/search?q=${encodeURIComponent(q)}&sort=recent&page=${page}`;
      try {
        const data = await getJson(url);
        const jobs = data.jobs || [];
        for (const j of jobs) {
          out.push({
            source: "Himalayas",
            sourceUrl: "https://himalayas.app",
            id: `himalayas:${j.guid || j.applicationLink}`,
            title: j.title,
            company: j.companyName,
            logo: j.companyLogo || "",
            url: j.applicationLink || j.guid,
            html: j.description || j.excerpt || "",
            locations: toList(j.locationRestrictions),
            levelHints: toList(j.seniority),
            type: j.employmentType || "",
            salary: formatSalary(j.minSalary, j.maxSalary, j.currency, j.salaryPeriod),
            postedAt: j.pubDate ? new Date(Number(j.pubDate) * 1000).toISOString() : null,
          });
        }
        if (jobs.length < 20) break;
      } catch (err) {
        console.warn(`Himalayas "${q}" p${page}: ${err.message}`);
      }
      await sleep(1200); // be polite to the shared public rate limit
    }
  }
  return out;
}

async function fromRemotive() {
  const data = await getJson("https://remotive.com/api/remote-jobs");
  return (data.jobs || []).map((j) => ({
    source: "Remotive",
    sourceUrl: "https://remotive.com",
    id: `remotive:${j.id}`,
    title: j.title,
    company: j.company_name,
    logo: j.company_logo || "",
    url: j.url,
    html: j.description || "",
    locations: j.candidate_required_location || "",
    levelHints: [],
    type: j.job_type || "",
    salary: j.salary || "",
    postedAt: j.publication_date ? new Date(`${j.publication_date}Z`).toISOString() : null,
  }));
}

async function fromJobicy() {
  const data = await getJson("https://jobicy.com/api/v2/remote-jobs?count=100");
  return (data.jobs || []).map((j) => ({
    source: "Jobicy",
    sourceUrl: "https://jobicy.com",
    id: `jobicy:${j.id}`,
    title: j.jobTitle,
    company: j.companyName,
    logo: j.companyLogo || "",
    url: j.url,
    html: j.jobDescription || j.jobExcerpt || "",
    locations: j.jobGeo || "",
    levelHints: toList(j.jobLevel).filter((l) => l !== "Any"),
    type: toList(j.jobType).join(", "),
    salary: formatSalary(j.salaryMin, j.salaryMax, j.salaryCurrency, j.salaryPeriod),
    postedAt: j.pubDate ? new Date(j.pubDate).toISOString() : null,
  }));
}

/* ---------------- build ---------------- */

const REGION_NAMES = { NA: "North America", LATAM: "Latin America", EU: "Europe", MEA: "Middle East & Africa", APAC: "Asia-Pacific" };

/** Short label for a card, e.g. "Canada, United States" or "Europe (45 countries)". */
export function summarizeLocations({ worldwide, countries, regions }) {
  if (worldwide) return "Worldwide";
  const regionLabels = regions.map((r) => REGION_NAMES[r]);
  if (countries.length <= 3) return [...countries, ...regionLabels].join(", ");
  const byRegion = {};
  for (const c of countries) byRegion[COUNTRY_REGION[c]] = (byRegion[COUNTRY_REGION[c]] || 0) + 1;
  const [mainRegion] = Object.entries(byRegion).sort((a, b) => b[1] - a[1])[0];
  return `${REGION_NAMES[mainRegion] || "Several countries"} (${countries.length} countries)`;
}

export function buildJob(raw) {
  const title = stripHtml(raw.title).replace(/\s+/g, " ");
  const text = stripHtml(raw.html);
  if (!title || !raw.url || !isGameJob(title, text)) return null;
  const skills = extractSkills(title, text);
  if (!Object.keys(skills).length) return null; // nothing we can match on
  const where = parseLocations(raw.locations);
  const snippet = text.replace(/\s+/g, " ").slice(0, 320).replace(/\s+\S*$/, "") + (text.length > 320 ? "…" : "");
  return {
    id: raw.id,
    title,
    company: stripHtml(raw.company || "Unknown company"),
    logo: /^https:\/\//.test(raw.logo) ? raw.logo : "",
    url: raw.url,
    source: raw.source,
    sourceUrl: raw.sourceUrl,
    remote: true, // every source here is a remote-jobs board
    worldwide: where.worldwide,
    countries: where.countries,
    regions: where.regions,
    locationText: summarizeLocations(where),
    type: raw.type,
    salary: raw.salary,
    level: extractLevel(title, raw.levelHints),
    skills,
    engines: extractEngines(title, text),
    traits: extractTraits(text),
    postedAt: raw.postedAt,
    snippet,
  };
}

async function main() {
  const sources = [
    ["Himalayas", fromHimalayas],
    ["Remotive", fromRemotive],
    ["Jobicy", fromJobicy],
  ];
  const raw = [];
  const counts = {};
  for (const [name, fn] of sources) {
    try {
      const jobs = await fn();
      raw.push(...jobs);
      counts[name] = { fetched: jobs.length, kept: 0 };
      console.log(`${name}: fetched ${jobs.length}`);
    } catch (err) {
      counts[name] = { fetched: 0, kept: 0, error: err.message };
      console.warn(`${name} failed: ${err.message}`);
    }
  }

  const cutoff = Date.now() - MAX_AGE_DAYS * 86400_000;
  const seen = new Set();
  const jobs = [];
  for (const r of raw) {
    const job = buildJob(r);
    if (!job) continue;
    if (job.postedAt && Date.parse(job.postedAt) < cutoff) continue;
    const key = `${job.title}|${job.company}`.toLowerCase().replace(/[^a-z0-9|]/g, "");
    if (seen.has(job.id) || seen.has(key)) continue;
    seen.add(job.id);
    seen.add(key);
    jobs.push(job);
    counts[job.source].kept += 1;
  }
  jobs.sort((a, b) => (b.postedAt || "").localeCompare(a.postedAt || ""));

  console.log(`Kept ${jobs.length} game-industry jobs`, counts);
  if (jobs.length < MIN_JOBS) {
    // Usually means a source is down; don't replace good data with an empty list.
    console.error(`Only ${jobs.length} jobs found; not writing ${path.relative(ROOT, OUT)}.`);
    process.exitCode = 1;
    return;
  }

  await mkdir(path.dirname(OUT), { recursive: true });
  const homepages = { Himalayas: "https://himalayas.app", Remotive: "https://remotive.com", Jobicy: "https://jobicy.com" };
  const sourcesOut = Object.entries(counts).map(([name, c]) => ({ name, url: homepages[name], jobs: c.kept }));
  await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), sources: sourcesOut, jobs }, null, 1) + "\n");
  console.log(`Wrote ${path.relative(ROOT, OUT)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
