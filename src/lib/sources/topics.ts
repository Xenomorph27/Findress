import type { SubfieldId } from "@/lib/taxonomy";

/**
 * Keyword topic tagging (SPEC §5.6): fast, free, deterministic. Subfields come from
 * (1) a curated map of well-known series, (2) source-provided tags, (3) keyword rules over the
 * name / description / CFP text, weighted so one passing mention in a long CFP is not enough.
 */

const SERIES_SUBFIELDS: Record<string, SubfieldId[]> = {
  neurips: ["ml"],
  icml: ["ml"],
  iclr: ["ml"],
  aistats: ["ml"],
  uai: ["ml"],
  colt: ["ml"],
  alt: ["ml"],
  acml: ["ml"],
  ecml: ["ml"],
  "ecml-pkdd": ["ml", "data-mining"],
  cpal: ["ml"],
  acl: ["nlp"],
  emnlp: ["nlp"],
  naacl: ["nlp"],
  eacl: ["nlp"],
  coling: ["nlp"],
  conll: ["nlp"],
  ijcnlp: ["nlp"],
  nlpcc: ["nlp"],
  lrec: ["nlp"],
  inlg: ["nlp"],
  colm: ["nlp", "genai"],
  cvpr: ["cv"],
  iccv: ["cv"],
  eccv: ["cv"],
  wacv: ["cv"],
  bmvc: ["cv"],
  accv: ["cv"],
  "3dv": ["cv"],
  icpr: ["cv"],
  icdar: ["cv"],
  fg: ["cv"],
  ijcb: ["cv"],
  icip: ["cv"],
  euvip: ["cv"],
  sibgrapi: ["cv"],
  icra: ["rl-robotics"],
  iros: ["rl-robotics"],
  rss: ["rl-robotics"],
  corl: ["rl-robotics"],
  rlc: ["rl-robotics"],
  aamas: ["rl-robotics", "kr"],
  kdd: ["data-mining"],
  icdm: ["data-mining"],
  wsdm: ["data-mining"],
  sigir: ["data-mining"],
  cikm: ["data-mining"],
  recsys: ["data-mining"],
  www: ["data-mining"],
  sdm: ["data-mining"],
  pakdd: ["data-mining"],
  ecir: ["data-mining"],
  icwsm: ["data-mining", "hci-ai"],
  interspeech: ["speech"],
  icassp: ["speech"],
  slt: ["speech"],
  "acm-mm": ["multimodal"],
  icmr: ["multimodal"],
  icme: ["multimodal"],
  icmi: ["multimodal", "hci-ai"],
  aaai: ["ai-general"],
  ijcai: ["ai-general"],
  ecai: ["ai-general"],
  pricai: ["ai-general"],
  ictai: ["ai-general"],
  kr: ["kr"],
  icaps: ["kr"],
  iccbr: ["kr"],
  "ruleml-rr": ["kr"],
  miccai: ["health-ai", "cv"],
  chil: ["health-ai"],
  ismb: ["health-ai"],
  chi: ["hci-ai"],
  iui: ["hci-ai"],
  facct: ["ai-safety"],
  mlsys: ["ml-systems"],
  gecco: ["ml"],
  cec: ["ml"],
  ppsn: ["ml"],
  ijcnn: ["ml"],
  icann: ["ml"],
  iconip: ["ml"],
};

/** Source tags (HF tags, ccfddl `sub`, WikiCFP categories) → subfields. */
const TAG_SUBFIELDS: [RegExp, SubfieldId[]][] = [
  [
    /^(machine[- ]learning|deep[- ]learning|representation-learning|optimization-methods|lifelong-learning|neural networks?)$/,
    ["ml"],
  ],
  [
    /^(computer[- ]vision|image[- ]processing|pattern[- ]recognition|visual information processing|computer-graphics)$/,
    ["cv"],
  ],
  [/^(natural[- ]language[- ]processing|nlp|computational linguistics)$/, ["nlp"]],
  [/^(large[- ]language[- ]models|llms?|generative ai|foundation models|genai)$/, ["genai", "nlp"]],
  [/^(robotics|reinforcement[- ]learning)$/, ["rl-robotics"]],
  [
    /^(data[- ]mining|web[- ]search|web mining|information[- ]retrieval|retrieval|recommendation|information-systems|big data|data science)$/,
    ["data-mining"],
  ],
  [/^(speech|signal[- ]processing|audio)$/, ["speech"]],
  [/^(human-computer-interaction|hci)$/, ["hci-ai"]],
  [/^(fairness|ai safety|trustworthy ai|ethics)$/, ["ai-safety"]],
  [/^(knowledge representation|reasoning|knowledge-graphs|semantics and knowledge)$/, ["kr"]],
  [/^ccf:DB$/i, ["data-mining"]],
  [/^ccf:HI$/i, ["hci-ai"]],
];

interface Rule {
  subfield: SubfieldId;
  re: RegExp;
}
const SUBFIELD_RULES: Rule[] = [
  {
    subfield: "genai",
    re: /\b(generative (ai|models?)|diffusion models?|large language models?|llms?|foundation models?|text-to-(image|video)|aigc|ai-generated content|gen ?ai)\b/gi,
  },
  {
    subfield: "nlp",
    re: /\b(natural language|computational linguistics|nlp|language technolog\w*|machine translation|question answering|text mining|language models?)\b/gi,
  },
  {
    subfield: "cv",
    re: /\b(computer vision|image (processing|analysis|understanding|recognition)|video (understanding|analysis)|object detection|segmentation|3d (vision|reconstruction)|pattern recognition)\b/gi,
  },
  {
    subfield: "ml",
    re: /\b(machine learning|deep learning|representation learning|learning theory|statistical learning|neural networks?|bayesian (inference|methods)|kernel methods)\b/gi,
  },
  {
    subfield: "rl-robotics",
    re: /\b(robot\w*|reinforcement learning|autonomous (systems|vehicles|driving)|embodied (ai|agents?)|motion planning)\b/gi,
  },
  {
    subfield: "data-mining",
    re: /\b(data mining|knowledge discovery|information retrieval|recommender systems?|recommendation|web (mining|search)|big data|search engines?|graph mining)\b/gi,
  },
  {
    subfield: "ai-safety",
    re: /\b(ai safety|alignment|fairness|trustworthy|responsible ai|ai ethics|ethical ai|accountability|interpretab\w*|explainab\w*|adversarial robustness|privacy[- ]preserving)\b/gi,
  },
  {
    subfield: "speech",
    re: /\b(speech|spoken language|audio|acoustic|music information|signal processing)\b/gi,
  },
  {
    subfield: "multimodal",
    re: /\b(multimodal|multi-modal|vision[- ]language|cross-modal|multimedia|audio-visual)\b/gi,
  },
  {
    subfield: "hci-ai",
    re: /\b(human[- ]computer interaction|hci|human-ai|human-centered ai|human-centred|user interfaces?|interactive systems)\b/gi,
  },
  {
    subfield: "health-ai",
    re: /\b(health\w*|medical|clinical|biomedic\w*|bioinformatic\w*|drug discovery|genomic\w*|patients?)\b/gi,
  },
  {
    subfield: "kr",
    re: /\b(knowledge representation|automated reasoning|planning and scheduling|constraint (programming|satisfaction)|knowledge graphs?|symbolic ai|neuro-?symbolic|logic programming)\b/gi,
  },
  {
    subfield: "ml-systems",
    re: /\b(ml systems|systems for (ml|machine learning)|mlsys|efficient (inference|training)|distributed training|hardware accelerat\w*|tinyml|edge ai|ml compilers?)\b/gi,
  },
];

/** Canonical topic chips. */
const TOPIC_RULES: [string, RegExp][] = [
  ["LLMs", /\b(large language models?|llms?)\b/i],
  ["Diffusion models", /\bdiffusion models?\b/i],
  ["Agents", /\b(ai agents?|llm agents?|agentic|multi-agent)\b/i],
  ["Reinforcement learning", /\breinforcement learning\b/i],
  ["Graph learning", /\b(graph neural networks?|gnns?|graph learning|graph representation)\b/i],
  ["Federated learning", /\bfederated learning\b/i],
  ["Interpretability", /\b(interpretab\w*|explainab\w*|xai)\b/i],
  ["Fairness", /\bfairness\b/i],
  ["Safety & alignment", /\b(ai safety|alignment|red[- ]teaming)\b/i],
  ["Privacy", /\b(privacy|differential privacy)\b/i],
  ["Robustness", /\b(robustness|adversarial)\b/i],
  ["Causality", /\bcausal\w*\b/i],
  ["Optimization", /\boptimi[sz]ation\b/i],
  ["Learning theory", /\blearning theory\b/i],
  ["Bayesian methods", /\b(bayesian|probabilistic (models?|inference))\b/i],
  ["Time series", /\btime[- ]series\b/i],
  ["Recommender systems", /\brecommend\w*\b/i],
  ["Information retrieval", /\b(information retrieval|retrieval-augmented|rag)\b/i],
  ["Knowledge graphs", /\bknowledge graphs?\b/i],
  ["Vision-language", /\b(vision[- ]language|vlms?|multimodal llms?)\b/i],
  ["3D vision", /\b(3d (vision|reconstruction)|nerf|gaussian splatting|point clouds?)\b/i],
  ["Video", /\bvideo\b/i],
  ["Medical imaging", /\bmedical imag\w*\b/i],
  ["Healthcare", /\b(healthcare|clinical)\b/i],
  ["Drug discovery", /\b(drug discovery|molecul\w*|protein)\b/i],
  ["Robotics", /\brobot\w*\b/i],
  ["Autonomous driving", /\bautonomous driving\b/i],
  ["Speech", /\bspeech\b/i],
  ["Machine translation", /\bmachine translation\b/i],
  ["Evaluation & benchmarks", /\b(benchmarks?|evaluation)\b/i],
  ["Efficient ML", /\b(efficien\w* (inference|training|ml)|quantization|pruning|distillation)\b/i],
  ["AI for science", /\b(ai for science|scientific discovery|ai4science)\b/i],
  ["Education", /\b(education\w*|learning analytics)\b/i],
  ["Evolutionary computation", /\b(evolutionary|genetic (algorithms?|programming))\b/i],
  ["Continual learning", /\b(continual|lifelong) learning\b/i],
  ["Self-supervised learning", /\bself-supervised\b/i],
];

export interface TaggingInput {
  seriesKey: string;
  name: string | null;
  description?: string | null;
  tags?: string[];
  cfpText?: string | null;
}

function countMatches(re: RegExp, text: string): number {
  re.lastIndex = 0;
  return text.match(re)?.length ?? 0;
}

export function tagEvent(input: TaggingInput): { subfields: SubfieldId[]; topics: string[] } {
  const scores = new Map<SubfieldId, number>();
  const add = (s: SubfieldId, n: number) => scores.set(s, (scores.get(s) ?? 0) + n);

  for (const s of SERIES_SUBFIELDS[input.seriesKey] ?? []) add(s, 10);
  for (const tag of input.tags ?? []) {
    for (const [re, subs] of TAG_SUBFIELDS) if (re.test(tag.trim())) subs.forEach((s) => add(s, 4));
  }
  const name = input.name ?? "";
  const body = `${input.description ?? ""}\n${(input.cfpText ?? "").slice(0, 12_000)}`;
  for (const rule of SUBFIELD_RULES) {
    const inName = countMatches(rule.re, name);
    const inBody = Math.min(countMatches(rule.re, body), 6);
    if (inName) add(rule.subfield, 4 * inName);
    if (inBody) add(rule.subfield, inBody);
  }

  let subfields = [...scores.entries()]
    .filter(([, score]) => score >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s)
    .slice(0, 4);
  if (
    subfields.length === 0 &&
    /\b(artificial intelligence|\bai\b|intelligent)/i.test(`${name} ${body.slice(0, 2000)}`)
  ) {
    subfields = ["ai-general"];
  }

  const topicText = `${name}\n${body}`;
  const topics = TOPIC_RULES.map(([label, re]) => {
    const g = new RegExp(re.source, "gi");
    return [label, (topicText.match(g)?.length ?? 0) + (re.test(name) ? 3 : 0)] as const;
  })
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([label]) => label)
    .slice(0, 8);

  return { subfields, topics };
}

/**
 * Pull "topics of interest" items out of CFP text: the list that follows a heading such as
 * "Topics of interest include…". Handles bulleted lists (blank lines between bullets allowed)
 * and plain one-topic-per-line lists. Returns [] when no such list is found.
 */
const TOPIC_HEADINGS = [
  /topics of interest|topics include|areas of interest|topics:|research topics|list of topics|topics (?:for|covered)/i,
  /we (invite|welcome|solicit|encourage)[^.]{0,120}(on|in|including|related to|such as|addressing)/i,
  /\bscope\b/i,
];
const BULLET = /^(?:[-–•*▪◦●·]|\d+[.)]|\([a-z0-9]+\))\s*(.+)$/i;

export function extractCfpTopics(cfpText: string | null | undefined): string[] {
  if (!cfpText) return [];
  const lines = cfpText.split("\n").map((l) => l.trim());
  let start = -1;
  for (const re of TOPIC_HEADINGS) {
    start = lines.findIndex((l) => re.test(l));
    if (start >= 0) break;
  }
  if (start < 0) return [];

  const clean = (t: string) =>
    t
      .replace(/[;,.]$/, "")
      .replace(/\s+/g, " ")
      .trim();
  const isShort = (l: string) =>
    l.length >= 3 && l.length <= 120 && !/[.:]$/.test(l) && !l.startsWith("## ");
  const out: string[] = [];
  let mode: "bullet" | "plain" | null = null;
  let skipped = 0;
  for (let i = start + 1; i < Math.min(lines.length, start + 120) && out.length < 40; i++) {
    const l = lines[i];
    if (!l) {
      if (mode === "plain") break;
      continue;
    }
    const bullet = BULLET.exec(l);
    if (bullet) {
      if (mode === "plain") break;
      mode = "bullet";
      const t = clean(bullet[1]);
      if (t.length >= 3 && t.length <= 160) out.push(t);
      continue;
    }
    if (mode === "bullet") break;
    if (mode === "plain") {
      if (isShort(l)) out.push(clean(l));
      else break;
      continue;
    }
    // Not in a list yet: a plain list needs two consecutive short lines.
    const next = lines[i + 1] ?? "";
    if (isShort(l) && isShort(next) && !BULLET.test(next)) {
      mode = "plain";
      out.push(clean(l));
      continue;
    }
    if (++skipped > 12) break;
  }
  return out.length >= 3 ? [...new Set(out)] : [];
}
