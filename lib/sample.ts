/**
 * Sample wiki used ONLY when the GitHub env vars are missing (local dev / previews
 * without credentials). Production always reads the real wiki from GitHub.
 * Content is generated deterministically so every render is identical.
 */

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Topic {
  slug: string;
  title: string;
  type: "concept" | "person" | "source-summary" | "synthesis";
}

const DOMAINS: Record<string, Topic[]> = {
  research: [
    { slug: "concept-double-threshold", title: "Double threshold", type: "concept" },
    { slug: "concept-signal-to-noise", title: "Signal to noise", type: "concept" },
    { slug: "concept-active-inference", title: "Active inference", type: "concept" },
    { slug: "concept-predictive-coding", title: "Predictive coding", type: "concept" },
    { slug: "concept-sparse-coding", title: "Sparse coding", type: "concept" },
    { slug: "concept-hebbian-learning", title: "Hebbian learning", type: "concept" },
    { slug: "concept-neural-manifold", title: "Neural manifolds", type: "concept" },
    { slug: "concept-retrieval-augmentation", title: "Retrieval augmentation", type: "concept" },
    { slug: "concept-spaced-repetition", title: "Spaced repetition", type: "concept" },
    { slug: "concept-embodied-cognition", title: "Embodied cognition", type: "concept" },
    { slug: "concept-memory-consolidation", title: "Memory consolidation", type: "concept" },
    { slug: "concept-attention-schema", title: "Attention schema", type: "concept" },
    { slug: "person-karl-friston", title: "Karl Friston", type: "person" },
    { slug: "person-andy-clark", title: "Andy Clark", type: "person" },
    { slug: "person-anil-seth", title: "Anil Seth", type: "person" },
    { slug: "synthesis-brains-as-predictors", title: "Brains as prediction machines", type: "synthesis" },
    { slug: "synthesis-memory-systems", title: "How memory systems fit together", type: "synthesis" },
    { slug: "source-free-energy-paper", title: "The free-energy principle (paper)", type: "source-summary" },
    { slug: "source-surfing-uncertainty", title: "Surfing Uncertainty", type: "source-summary" },
    { slug: "concept-thesis-outline", title: "Thesis outline", type: "concept" },
    { slug: "concept-lab-protocol", title: "Lab protocol v3", type: "concept" },
    { slug: "concept-eeg-pipeline", title: "EEG pipeline", type: "concept" },
  ],
  reading: [
    { slug: "source-thinking-fast-and-slow", title: "Thinking, Fast and Slow", type: "source-summary" },
    { slug: "source-the-extended-mind", title: "The Extended Mind", type: "source-summary" },
    { slug: "source-how-to-take-smart-notes", title: "How to Take Smart Notes", type: "source-summary" },
    { slug: "source-building-a-second-brain", title: "Building a Second Brain", type: "source-summary" },
    { slug: "source-the-beginning-of-infinity", title: "The Beginning of Infinity", type: "source-summary" },
    { slug: "source-godel-escher-bach", title: "Gödel, Escher, Bach", type: "source-summary" },
    { slug: "source-the-mind-is-flat", title: "The Mind Is Flat", type: "source-summary" },
    { slug: "source-seeing-like-a-state", title: "Seeing Like a State", type: "source-summary" },
    { slug: "person-daniel-kahneman", title: "Daniel Kahneman", type: "person" },
    { slug: "person-david-deutsch", title: "David Deutsch", type: "person" },
    { slug: "person-douglas-hofstadter", title: "Douglas Hofstadter", type: "person" },
    { slug: "person-niklas-luhmann", title: "Niklas Luhmann", type: "person" },
    { slug: "concept-zettelkasten", title: "Zettelkasten", type: "concept" },
    { slug: "concept-progressive-summarisation", title: "Progressive summarisation", type: "concept" },
    { slug: "concept-strange-loops", title: "Strange loops", type: "concept" },
    { slug: "concept-good-explanations", title: "Good explanations", type: "concept" },
    { slug: "synthesis-notes-that-compound", title: "Notes that compound", type: "synthesis" },
    { slug: "synthesis-reading-list-2026", title: "Reading list 2026", type: "synthesis" },
  ],
  business: [
    { slug: "concept-product-market-fit", title: "Product–market fit", type: "concept" },
    { slug: "concept-jobs-to-be-done", title: "Jobs to be done", type: "concept" },
    { slug: "concept-flywheel", title: "Flywheel", type: "concept" },
    { slug: "concept-moats", title: "Moats", type: "concept" },
    { slug: "concept-pricing-tiers", title: "Pricing tiers", type: "concept" },
    { slug: "concept-unit-economics", title: "Unit economics", type: "concept" },
    { slug: "concept-go-to-market", title: "Go-to-market plan", type: "concept" },
    { slug: "concept-investor-update", title: "Investor update template", type: "concept" },
    { slug: "person-paul-graham", title: "Paul Graham", type: "person" },
    { slug: "person-clayton-christensen", title: "Clayton Christensen", type: "person" },
    { slug: "source-the-mom-test", title: "The Mom Test", type: "source-summary" },
    { slug: "source-zero-to-one", title: "Zero to One", type: "source-summary" },
    { slug: "source-the-innovators-dilemma", title: "The Innovator’s Dilemma", type: "source-summary" },
    { slug: "synthesis-2brain-strategy", title: "2Brain strategy", type: "synthesis" },
    { slug: "synthesis-customer-interviews", title: "What customers keep telling us", type: "synthesis" },
    { slug: "concept-roadmap-q1", title: "Roadmap Q1", type: "concept" },
  ],
  personal: [
    { slug: "concept-weekly-review", title: "Weekly review", type: "concept" },
    { slug: "concept-training-plan", title: "Training plan", type: "concept" },
    { slug: "concept-sleep-log", title: "Sleep log", type: "concept" },
    { slug: "concept-sourdough", title: "Sourdough", type: "concept" },
    { slug: "concept-violin-practice", title: "Violin practice", type: "concept" },
    { slug: "concept-travel-lisbon", title: "Lisbon trip", type: "concept" },
    { slug: "concept-yearly-goals", title: "Yearly goals", type: "concept" },
    { slug: "concept-journal-prompts", title: "Journal prompts", type: "concept" },
    { slug: "person-mentor-notes", title: "Mentor conversations", type: "person" },
    { slug: "synthesis-what-energises-me", title: "What energises me", type: "synthesis" },
    { slug: "synthesis-lessons-2025", title: "Lessons from 2025", type: "synthesis" },
    { slug: "source-atomic-habits", title: "Atomic Habits", type: "source-summary" },
  ],
};

const SENTENCES = [
  "The idea keeps returning whenever the evidence is thin and the stakes are high.",
  "Compare this with the earlier draft before deciding which framing survives.",
  "A small change in the threshold flips the whole interpretation of the result.",
  "Write the argument as if explaining it to someone who disagrees on purpose.",
  "The strongest version of the claim is narrower than it first appears.",
  "Two separate notes point at the same mechanism from different directions.",
  "Keep the original wording; the summary drifts every time it is retold.",
  "The open question is whether the effect holds outside the lab setting.",
  "This connects the practical routine to the theory it was meant to test.",
  "Decision: keep the simpler model until a case appears that it cannot explain.",
  "Plan: revisit after the next round of interviews and update the numbers.",
  "The counter-example matters more than the ten cases that agree.",
  "Most of the value comes from linking it to what was already known.",
  "A useful test is whether the note still makes sense a year from now.",
  "Rejected: the elegant version, because it hid the costly assumption.",
  "The pattern shows up in reading, in research and in the day-to-day work.",
  "Start from the concrete example, then name the general principle.",
  "The surprising part is how little extra effort the habit actually needs.",
];

const MONTHS = [
  "2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06", "2025-07", "2025-08",
  "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04",
  "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11",
];

export function sampleWikiFiles(): { path: string; content: string }[] {
  const r = rng(20261117);
  const all: { domain: string; t: Topic }[] = [];
  for (const [domain, topics] of Object.entries(DOMAINS)) for (const t of topics) all.push({ domain, t });

  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)];
  const files: { path: string; content: string }[] = [];

  // Root index
  const idx: string[] = ["# 2Brain index", "", "The map of everything in this wiki.", ""];
  for (const d of Object.keys(DOMAINS)) {
    idx.push(`## ${d[0].toUpperCase()}${d.slice(1)}`, "", `- [[${d}/index]]`, "");
  }
  idx.push("## Log", "", "- Wiki restructured into four domains.", "- Added reading summaries and people pages.");
  files.push({ path: "wiki/index.md", content: idx.join("\n") });

  for (const [domain, topics] of Object.entries(DOMAINS)) {
    const lines = [
      `# ${domain[0].toUpperCase()}${domain.slice(1)}`,
      "",
      "**Type:** meta",
      `**Domain:** ${domain}`,
      `**Last updated:** 2026-11-0${1 + Math.floor(r() * 8)}`,
      "",
      `## Pages in ${domain}`,
      "",
      ...topics.map((t) => `- [[${t.slug}]] — ${t.title}`),
    ];
    files.push({ path: `wiki/${domain}/index.md`, content: lines.join("\n") });
  }

  for (const { domain, t } of all) {
    const month = pick(MONTHS);
    const day = String(1 + Math.floor(r() * 27)).padStart(2, "0");
    const same = DOMAINS[domain].filter((x) => x.slug !== t.slug);
    const nLinks = 2 + Math.floor(r() * 4);
    const links = new Set<string>();
    for (let i = 0; i < nLinks; i++) links.add(pick(same).slug);
    if (r() < 0.55) links.add(pick(all).t.slug); // cross-domain bridge
    if (r() < 0.12) links.add(`draft-${t.slug.split("-").slice(1).join("-")}-notes`); // ghost link
    const linkArr = [...links];
    const sources = linkArr.filter((s) => s.startsWith("source-")).slice(0, 2);
    const domains = r() < 0.2 ? `${domain} / ${pick(Object.keys(DOMAINS))}` : domain;

    const paras: string[] = [];
    const nParas = 3 + Math.floor(r() * 6);
    for (let p = 0; p < nParas; p++) {
      const s: string[] = [];
      const nS = 2 + Math.floor(r() * 4);
      for (let k = 0; k < nS; k++) s.push(pick(SENTENCES));
      if (linkArr[p]) s.splice(1, 0, `See [[${linkArr[p]}]] for the related thread.`);
      paras.push(s.join(" "));
    }

    const body = [
      `# ${t.title}`,
      "",
      `**Type:** ${t.type}`,
      `**Domain:** ${domains}`,
      sources.length ? `**Sources:** ${sources.map((s) => `[[${s}]]`).join(", ")}` : "",
      `**Last updated:** ${month}-${day}`,
      "",
      "## Summary",
      "",
      paras[0],
      "",
      "## Notes",
      "",
      ...paras.slice(1).flatMap((p) => [p, ""]),
      "## Connections",
      "",
      ...linkArr.map((l) => `- [[${l}]]`),
    ].filter((l, i, a) => !(l === "" && a[i - 1] === ""));

    files.push({ path: `wiki/${domain}/${t.slug}.md`, content: body.join("\n") });
  }

  return files;
}
