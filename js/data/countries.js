// Countries and the broad hiring region each belongs to. Job listings often
// say "Europe only" or "Americas", so jobs are matched by country or region.
// Regions: NA (North America), LATAM, EU (Europe), MEA (Middle East & Africa), APAC.
const RAW = `
NA:United States,Canada
LATAM:Mexico,Argentina,Bolivia,Brazil,Chile,Colombia,Costa Rica,Cuba,Dominican Republic,Ecuador,El Salvador,Guatemala,Honduras,Jamaica,Nicaragua,Panama,Paraguay,Peru,Puerto Rico,Trinidad and Tobago,Uruguay,Venezuela,Bahamas,Barbados,Belize,Guyana,Haiti,Suriname
EU:United Kingdom,Ireland,France,Germany,Spain,Portugal,Italy,Netherlands,Belgium,Luxembourg,Switzerland,Austria,Denmark,Sweden,Norway,Finland,Iceland,Poland,Czechia,Slovakia,Hungary,Romania,Bulgaria,Greece,Croatia,Slovenia,Serbia,Bosnia and Herzegovina,Montenegro,North Macedonia,Albania,Kosovo,Estonia,Latvia,Lithuania,Ukraine,Moldova,Belarus,Malta,Cyprus,Georgia,Armenia,Turkey
MEA:Israel,United Arab Emirates,Saudi Arabia,Qatar,Kuwait,Bahrain,Oman,Jordan,Lebanon,Egypt,Morocco,Tunisia,Algeria,Nigeria,Ghana,Kenya,South Africa,Ethiopia,Uganda,Tanzania,Rwanda,Senegal,Cameroon,Ivory Coast,Zimbabwe,Zambia,Botswana,Namibia,Mauritius,Azerbaijan,Iraq,Pakistan
APAC:Australia,New Zealand,Japan,South Korea,China,Hong Kong,Taiwan,Singapore,Malaysia,Indonesia,Philippines,Thailand,Vietnam,India,Bangladesh,Sri Lanka,Nepal,Cambodia,Mongolia,Kazakhstan,Uzbekistan
`;

export const COUNTRIES = RAW.trim()
  .split("\n")
  .flatMap((line) => {
    const [region, names] = line.split(":");
    return names.split(",").map((name) => ({ name: name.trim(), region }));
  })
  .sort((a, b) => a.name.localeCompare(b.name));

export const COUNTRY_REGION = Object.fromEntries(COUNTRIES.map((c) => [c.name, c.region]));

// Common spellings seen in job feeds -> canonical name.
export const COUNTRY_ALIASES = {
  usa: "United States",
  us: "United States",
  "u.s.": "United States",
  "united states of america": "United States",
  america: "United States",
  uk: "United Kingdom",
  "great britain": "United Kingdom",
  britain: "United Kingdom",
  england: "United Kingdom",
  scotland: "United Kingdom",
  wales: "United Kingdom",
  "czech republic": "Czechia",
  korea: "South Korea",
  "republic of korea": "South Korea",
  uae: "United Arab Emirates",
  "côte d'ivoire": "Ivory Coast",
  "cote d'ivoire": "Ivory Coast",
  turkiye: "Turkey",
  türkiye: "Turkey",
  holland: "Netherlands",
  "the netherlands": "Netherlands",
};

// Region words seen in job feeds -> region codes.
export const REGION_WORDS = {
  europe: ["EU"],
  eu: ["EU"],
  eea: ["EU"],
  emea: ["EU", "MEA"],
  "north america": ["NA"],
  americas: ["NA", "LATAM"],
  "latin america": ["LATAM"],
  latam: ["LATAM"],
  "south america": ["LATAM"],
  "central america": ["LATAM"],
  apac: ["APAC"],
  asia: ["APAC"],
  "asia pacific": ["APAC"],
  oceania: ["APAC"],
  africa: ["MEA"],
  "middle east": ["MEA"],
};

const WORLDWIDE = /\b(worldwide|anywhere|global(ly)?|remote)\b/i;

/**
 * Parses "USA, Canada", ["United States"], "Europe only", "Worldwide" etc.
 * into { worldwide, countries: [canonical names], regions: [codes] }.
 */
export function parseLocations(input) {
  const parts = (Array.isArray(input) ? input : String(input || "").split(/[,;/|]| or | and /i))
    .map((p) => p.replace(/\b(only|based|timezones?|time zones?)\b/gi, "").trim())
    .filter(Boolean);
  if (!parts.length) return { worldwide: true, countries: [], regions: [] };

  const countries = new Set();
  const regions = new Set();
  let worldwide = false;
  for (const part of parts) {
    const key = part.toLowerCase().replace(/\s+/g, " ").trim();
    const canonical = COUNTRY_ALIASES[key] || COUNTRIES.find((c) => c.name.toLowerCase() === key)?.name;
    if (canonical) countries.add(canonical);
    else if (REGION_WORDS[key]) REGION_WORDS[key].forEach((r) => regions.add(r));
    else if (WORLDWIDE.test(key)) worldwide = true;
    else {
      // Look for a country or region word inside longer text, e.g. "US-based (EST)".
      for (const c of COUNTRIES) if (new RegExp(`\\b${c.name}\\b`, "i").test(part)) countries.add(c.name);
      for (const [alias, name] of Object.entries(COUNTRY_ALIASES)) {
        if (alias.length > 2 && new RegExp(`\\b${alias.replace(".", "\\.")}\\b`, "i").test(part)) countries.add(name);
      }
      if (/\bUSA?\b|\bUK\b/.test(part)) countries.add(/\bUK\b/.test(part) ? "United Kingdom" : "United States");
      for (const [word, codes] of Object.entries(REGION_WORDS)) {
        if (new RegExp(`\\b${word}\\b`, "i").test(part)) codes.forEach((r) => regions.add(r));
      }
    }
  }
  if (!countries.size && !regions.size) worldwide = true; // couldn't tell, so don't hide it
  return { worldwide, countries: [...countries], regions: [...regions] };
}

/** Can someone in `country` take this job? Unknown country -> yes. */
export function jobAllows(job, country) {
  if (!country || job.worldwide) return true;
  if (job.countries.includes(country)) return true;
  return job.regions.includes(COUNTRY_REGION[country]);
}
