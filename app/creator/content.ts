/*
 * Everything /creator and its CV PDF say about Dylan, kept out of the JSX so a bullet can change without
 * touching the page. Newest first in every list. Never add a phone number, GPA or the school email.
 */

export const NAME = "Dylan Chua";

/**
 * When this file was last checked against reality: the page's "Last verified" date. Bump it whenever
 * the copy changes. A date only (YYYY-MM-DD), formatted by lib/format.ts formatDate.
 */
export const UPDATED_AT = "2026-10-22";

/** /creator is the one page that links to GitHub; the rest of the app does not. */
export const GITHUB_URL = "https://github.com/DylanChua2001";
export const LINKEDIN_URL = "https://www.linkedin.com/in/dylan-chua-heok-kang-a2955a152";

/** Prefilled on the page's Email button. */
export const EMAIL_SUBJECT = "Hi Dylan, from your Shit Go Where page";

/** The one-liner under the current role. */
export const SUMMARY = "I build full-stack apps, data pipelines and the cloud they run on, and I made this toilet finder on the side.";

/** Under the name on the CV. */
export const HEADLINE = "Software engineer in Singapore";

export interface Role {
  title: string;
  company: string;
  /** YYYY-MM. */
  start: string;
  /** YYYY-MM, or null while it's the current role. */
  end: string | null;
  location?: string;
  bullets: string[];
}

export interface ProjectLink {
  label: string;
  href: string;
}

export interface Project {
  name: string;
  /** What it was for: a capstone, a hackathon, a team project. */
  context?: string;
  dates: string;
  links: ProjectLink[];
  bullets: string[];
  tags: string[];
}

export interface SkillGroup {
  group: string;
  items: string[];
}

export const EXPERIENCE: Role[] = [
  {
    title: "Associate Software Engineer",
    company: "Ensign InfoSecurity",
    start: "2026-06",
    end: null,
    location: "Singapore",
    bullets: [
      "Build and ship products into client environments as a forward-deployed engineer, from data pipelines to full-stack features",
      "Own AWS infrastructure and Kubernetes deployments for client-facing products",
      "Verify and troubleshoot data pipelines end to end, from vendor sources to client delivery",
      "Present solutions to prospective clients alongside sales and engineering teams",
    ],
  },
  {
    title: "Software Engineer Intern",
    company: "Ensign InfoSecurity",
    start: "2026-01",
    end: "2026-05",
    bullets: [
      "Implemented an AI-powered cybersecurity website to automate threat detection, making detection of fake news easier",
      "Developed and optimised a data pipeline for seamless integration and processing of security data",
      "Devised multitenancy features for a Cyber Threat Intelligence platform, creating a secure and isolated environment for multiple organisations",
      "Collaborated with cross-functional teams to integrate with existing systems and deliver a scalable cybersecurity solution",
    ],
  },
  {
    title: "Software Engineer Intern",
    company: "Nested AI",
    start: "2025-05",
    end: "2025-08",
    bullets: [
      "Engineered a production feature enabling users to mass-craft personalised emails using context-aware templates and GPT-powered automation, resulting in a 40% reduction in manual effort for client outreach",
      "Designed and implemented an interactive chatbot UI that lets users ask about company products and auto-generates detailed price quotations",
      "Resolved 25+ frontend bugs (form validation, UI consistency, error handling) and 10+ backend bugs (business workflows, Stripe integration), supporting the launch of 3 new product lines",
      "Optimised Docker Compose and deployment pipelines for AWS EC2, reducing downtime and improving deployment speed by 10%",
    ],
  },
  {
    title: "Project Management Intern",
    company: "Synapxe",
    start: "2024-05",
    end: "2024-08",
    bullets: [
      "Provided operational support for the Electronic Queue Management System (EQMS) and self-service kiosks at NUHS clinics, helping increase patient throughput by 10% and reduce average waiting times",
      "Engaged in all phases of the SDLC: gathering requirements, coordinating with 3+ stakeholders, and executing testing",
      "Led a technology refresh project upgrading outdated components, with 0 unplanned service disruptions during transition",
      "Managed timelines and coordinated deployment of system upgrades across 8 NUHS clinics",
    ],
  },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthYear(ym: string): { month: string; year: string } {
  const [year, month] = ym.split("-");
  return { month: MONTHS[Number(month) - 1] ?? "", year };
}

/** "Jun 2026 – present", "Jan – May 2026", "Dec 2025 – Feb 2026". */
export function roleDates(r: Pick<Role, "start" | "end">): string {
  const s = monthYear(r.start);
  if (!r.end) return `${s.month} ${s.year} – present`;
  const e = monthYear(r.end);
  return s.year === e.year ? `${s.month} – ${e.month} ${e.year}` : `${s.month} ${s.year} – ${e.month} ${e.year}`;
}

/** "since Jun 2026": the current role's start. */
export function roleSince(r: Pick<Role, "start">): string {
  const s = monthYear(r.start);
  return `since ${s.month} ${s.year}`;
}

/** The mint block's numbers, counted from EXPERIENCE rather than typed in. */
export const ROLE_COUNT = EXPERIENCE.length;
export const FIRST_YEAR = Math.min(...EXPERIENCE.map((r) => Number(r.start.slice(0, 4))));
export const CURRENT_ROLE = EXPERIENCE.find((r) => r.end === null) ?? EXPERIENCE[0];

export const EDUCATION = {
  school: "Singapore Management University",
  short: "SMU",
  degree: "BSc (Information Systems)",
  dates: "Jan 2022 – Jan 2026",
  majors: ["Smart City Management and Technology", "Digital Cloud Solutions"],
};

/** The Facts grid under the header. */
export const FACTS: { label: string; value: string; detail?: string }[] = [
  { label: "Based in", value: "Singapore" },
  {
    label: "Degree",
    value: `BSc Information Systems, ${EDUCATION.short}`,
    detail: `Majors in ${EDUCATION.majors[0]}, and ${EDUCATION.majors[1]}`,
  },
  { label: "Works on", value: "Data, full-stack, cloud" },
];

/**
 * The case study for the app itself, in first person. Live numbers are added by the page from the
 * public API and left out when it can't be reached; never type a count in here.
 */
export const SHIT_GO_WHERE = {
  name: "Shit Go Where",
  /** The page's paragraphs on what it does. */
  what: [
    "I built Shit Go Where on my own, on free tiers. It finds the nearest clean toilet, how far a walk it is and whether it has what you need. Tap I need to go and it picks the closest good one and walks you there.",
    "People check in, review and report what they find, so the map stays honest.",
  ],
  bot: {
    before: "Rather stay in Telegram? Send",
    handle: "@ShitGoWhereBot",
    href: "https://t.me/ShitGoWhereBot",
    after: "your location for the top three nearby.",
  },
  tiersIntro: "Every toilet wears a trust tier, so open data never passes for a toilet somebody actually visited.",
  stack: [
    { label: "App", value: "Next.js progressive web app" },
    { label: "API", value: "NestJS" },
    { label: "Data", value: "Prisma and Postgres on Neon" },
    { label: "Map", value: "MapLibre with OneMap tiles" },
    { label: "Photos", value: "Cloudflare R2" },
    { label: "Hosting", value: "Vercel" },
  ],
  runs: [
    "The shitgowhere.com domain",
    "GitHub Actions for CI and scheduled jobs",
    "Sentry error reporting",
    "PostHog product analytics",
    "The Telegram bot",
  ],
  /** On the CV, where it leads the projects. */
  cv: {
    context: "Solo project",
    dates: "Live since Oct 2026",
    bullets: [
      "Built and run a public toilet finder for Singapore alone, on free tiers: nearest clean toilet, an urgent one-tap route, and check-ins and reviews that keep the map current",
      "Next.js progressive web app and NestJS API with Prisma and Postgres on Neon, MapLibre with OneMap tiles, photos on Cloudflare R2, hosted on Vercel",
      "Trust tiers separate toilets surveyed in person from community and open-data entries; a Telegram bot (@ShitGoWhereBot) answers with the nearest three",
      "Operate the domain, GitHub Actions CI and scheduled jobs, Sentry error reporting and PostHog analytics",
    ],
    tags: ["Next.js", "NestJS", "Prisma", "PostgreSQL", "MapLibre", "Vercel"],
  },
};

/** Live counts from the public API, as a sentence with its figures marked for emphasis. */
export function liveNumbersLine(n: { toilets: number; verified: number; areas: number; stations: number }): {
  text: string;
  figure?: boolean;
}[] {
  const f = (x: number) => x.toLocaleString("en-SG");
  return [
    { text: "Right now the map holds " },
    { text: `${f(n.toilets)} toilets`, figure: true },
    { text: " across " },
    { text: `${f(n.areas)} planning areas`, figure: true },
    { text: ", " },
    { text: `${f(n.verified)} of them surveyed in person`, figure: true },
    { text: ", and answers for " },
    { text: `${f(n.stations)} MRT and LRT stations`, figure: true },
    { text: "." },
  ];
}

/** Shit Go Where itself is the page's story, not a card here. */
export const PROJECTS: Project[] = [
  {
    name: "The Circular Classroom",
    context: "SMU capstone",
    dates: "Feb – Apr 2026",
    links: [{ label: "circularclassroom.org", href: "https://www.circularclassroom.org" }],
    bullets: [
      "Built the analytics backend of a school-uniform donation and inventory platform, including a linear-programming endpoint for upcycling assembly planning and recipe presets",
      "Implemented secure CSV ingestion: validated S3 uploads, a preprocessing Lambda that normalises columns and quarantines failed files, and template downloads",
      "Shipped the inventory app's analytics configuration and product summary screens, and the public site's projects and research pages backed by DynamoDB",
    ],
    tags: ["Next.js", "AWS Lambda", "S3", "DynamoDB", "Node.js"],
  },
  {
    name: "LingoLah",
    context: "SEA-LION AI hackathon",
    dates: "Jul – Aug 2025",
    links: [{ label: "Code on GitHub", href: "https://github.com/DylanChua2001/SEA-lion-AI-hackathon" }],
    bullets: [
      "Built a voice-driven Chrome extension overlay that lets seniors use websites in native dialects (Hokkien, Cantonese) without provider-side changes",
      "Created speech-recognition pipelines (OpenAI Whisper, Google STT) and integrated SEA-LION + LangChain to understand intent and perform tasks like booking appointments",
      "Engineered a Python microservices backend with MongoDB, containerised with Docker and deployed on AWS",
      "Text-to-speech responses via the Web Speech API, in audio and simplified text",
    ],
    tags: ["Python", "LangChain", "SEA-LION", "Chrome extension", "Docker", "AWS"],
  },
  {
    name: "D&D multi-agent backend",
    context: "Team project",
    dates: "Nov 2025",
    links: [],
    bullets: [
      "Built an orchestrator that routes play between combat, exploration, NPC-behaviour and places agents, with a dice system and RAG over the D&D Basic Rules",
    ],
    tags: ["Python", "Multi-agent LLM", "RAG"],
  },
  {
    name: "Pawfect Match",
    dates: "Apr – Aug 2024",
    links: [
      { label: "Live site", href: "https://pawfect-match-dun.vercel.app" },
      { label: "Code on GitHub", href: "https://github.com/DylanChua2001/pawfectMatch" },
    ],
    bullets: [
      "Full-stack PERN app (PostgreSQL, Express, React, Node) that matches pets to owners by traits and preferences",
      "AI chatbot with GPT-4, LangChain and RAG for conversational matching, improving match relevance by 30%",
      "Persistent chat history; frontend and backend deployed on Vercel",
    ],
    tags: ["PERN", "GPT-4", "LangChain", "RAG", "Vercel"],
  },
];

export const SKILLS: SkillGroup[] = [
  { group: "Languages", items: ["TypeScript", "JavaScript", "Python", "Go", "SQL"] },
  { group: "Backend", items: ["NestJS", "Node.js", "REST APIs", "Microservices", "Prisma", "PostgreSQL", "MongoDB"] },
  { group: "Frontend", items: ["React", "Next.js", "Tailwind"] },
  {
    group: "Cloud and DevOps",
    items: [
      "AWS (S3, SQS, DynamoDB, ECS, Lambda)",
      "GCP (Cloud Run, Vertex AI)",
      "Docker",
      "Kubernetes",
      "Terraform",
      "Vercel",
      "CI/CD",
    ],
  },
  {
    group: "Data and AI",
    items: ["Data pipelines", "Web scraping (Selenium)", "RAG", "Multi-agent LLM systems", "LangChain"],
  },
];

export const CERTIFICATIONS = {
  issuer: "Google Data Analytics",
  courses: [
    "Foundations: Data, Data, Everywhere",
    "Ask Questions to Make Data-Driven Decisions",
    "Data Analysis with R Programming",
    "Share Data Through the Art of Visualization",
  ],
};
