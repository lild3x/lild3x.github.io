// Work-style questions, built to be hard to fake:
//  * "pair" items force a choice between two equally positive statements, so
//    there's no obviously "good" answer to pick (forced-choice format).
//  * "scenario" items ask what you'd actually do; every option is reasonable.
//  * Items with `repeatOf` re-ask an earlier pair in different words and swapped
//    order. Matching answers = consistent; mismatches lower the reliability score.
//  * Response time is recorded; answers faster than you could read get flagged.

export const TRAITS = [
  { id: "collab", name: "Collaboration", desc: "You get energy from working closely with others and lifting the team." },
  { id: "autonomy", name: "Independence", desc: "You do your best work with deep focus and room to own your piece." },
  { id: "structure", name: "Structure", desc: "You bring plans, process and follow-through that keep work on track." },
  { id: "curiosity", name: "Curiosity", desc: "You experiment, prototype and learn fast when things are uncertain." },
  { id: "ownership", name: "Initiative", desc: "You step up, take responsibility and push the direction forward." },
  { id: "composure", name: "Composure", desc: "You stay steady under pressure, sudden change and tough feedback." },
];

export const TRAITS_BY_ID = Object.fromEntries(TRAITS.map((t) => [t.id, t]));

const pair = (id, a, aTrait, b, bTrait, repeatOf) => ({
  id,
  type: "pair",
  prompt: "Which is more like you?",
  options: [
    { text: a, trait: aTrait },
    { text: b, trait: bTrait },
  ],
  ...(repeatOf ? { repeatOf } : {}),
});

const scenario = (id, prompt, options) => ({
  id,
  type: "scenario",
  prompt,
  options: options.map(([text, trait]) => ({ text, trait })),
});

export const WORKSTYLE_ITEMS = [
  pair("p1", "I do my best work bouncing ideas off teammates.", "collab",
    "I do my best work with long, uninterrupted focus time.", "autonomy"),
  pair("p2", "I like having a clear plan before I start.", "structure",
    "I like figuring it out as I go.", "curiosity"),
  pair("p3", "When something has no owner, I tend to pick it up.", "ownership",
    "When things get tense, I'm usually the calm one.", "composure"),
  scenario("s1", "Two days before a milestone, a teammate's feature is broken and they're out sick. You…", [
    ["Rally people in chat to figure out a fix together", "collab"],
    ["Quietly dig in and fix it yourself", "autonomy"],
    ["Flag it to the lead with options: cut it, delay, or patch it", "structure"],
    ["Take charge: split up the work and own the outcome", "ownership"],
  ]),
  pair("p4", "I'd rather polish one feature until it's rock solid.", "structure",
    "I'd rather prototype five rough ideas.", "curiosity"),
  pair("p5", "I enjoy getting other people unblocked.", "collab",
    "I enjoy pushing a project's direction forward.", "ownership"),
  pair("p6", "Harsh feedback rarely throws me off.", "composure",
    "I'm happiest when I'm learning a new tool or technique.", "curiosity"),
  scenario("s2", "A playtester says the part you built \"just isn't fun.\" Your first move is to…", [
    ["Ask what they felt and write it down without arguing", "composure"],
    ["Try three quick variations to see what clicks", "curiosity"],
    ["Grab a teammate to look at it with fresh eyes", "collab"],
    ["Check it against the design goals to see what's off", "structure"],
  ]),
  pair("p7", "I prefer owning a piece end to end, on my own.", "autonomy",
    "I prefer keeping the schedule and process running smoothly.", "structure"),
  pair("p8", "I'd rather be trusted to work without check-ins.", "autonomy",
    "I'd rather stay steady when plans change at the last minute.", "composure"),
  pair("r1", "Give me a quiet stretch to get deep into a problem.", "autonomy",
    "Give me a group brainstorm to get things moving.", "collab", "p1"),
  scenario("s3", "You have a free afternoon with nothing assigned. You'd most likely…", [
    ["Explore a new tool or technique", "curiosity"],
    ["Tidy up docs, tasks or tech debt", "structure"],
    ["Check in on teammates to see who needs help", "collab"],
    ["Start building something you think the project needs", "ownership"],
  ]),
  pair("p9", "I'd rather lead the meeting.", "ownership",
    "I'd rather take apart how something works.", "curiosity"),
  pair("p10", "I'd rather the team wins together than I stand out.", "collab",
    "I'd rather have a clear checklist and definition of done.", "structure"),
  pair("r2", "Trying things and seeing what happens.", "curiosity",
    "Mapping out the steps first.", "structure", "p2"),
  scenario("s4", "Scope just changed and half of your work got cut. You…", [
    ["Take a breath, accept it, and re-plan", "composure"],
    ["Push back with a clear case if you think it's wrong", "ownership"],
    ["Salvage whatever's reusable on your own", "autonomy"],
    ["Look for a new, better angle on the change", "curiosity"],
  ]),
  pair("r3", "Staying level-headed when the plan flips.", "composure",
    "Being left alone to do things my way.", "autonomy", "p8"),
];

export const WORKSTYLE_BY_ID = Object.fromEntries(WORKSTYLE_ITEMS.map((i) => [i.id, i]));
