/*
 * Everything /creator says about Dylan, kept out of the JSX so a bullet can change without touching
 * the page. Newest first in every list. Never add a phone number, GPA or the school email.
 */

export const NAME = "Dylan Chua";

/** /creator is the one page that links to GitHub; the rest of the app does not. */
export const GITHUB_URL = "https://github.com/DylanChua2001";
export const LINKEDIN_URL = "https://www.linkedin.com/in/dylan-chua-heok-kang-a2955a152";

export interface Role {
  title: string;
  company: string;
  dates: string;
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
  // Draft bullets for the full-time role: Dylan still to confirm the wording.
  {
    title: "Associate Software Engineer",
    company: "Ensign InfoSecurity",
    dates: "Jun 2026 – present",
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
    dates: "Jan 2026 – May 2026",
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
    dates: "May 2025 – Aug 2025",
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
    dates: "May 2024 – Aug 2024",
    bullets: [
      "Provided operational support for the Electronic Queue Management System (EQMS) and self-service kiosks at NUHS clinics, helping increase patient throughput by 10% and reduce average waiting times",
      "Engaged in all phases of the SDLC: gathering requirements, coordinating with 3+ stakeholders, and executing testing",
      "Led a technology refresh project upgrading outdated components, with 0 unplanned service disruptions during transition",
      "Managed timelines and coordinated deployment of system upgrades across 8 NUHS clinics",
    ],
  },
];

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

export const EDUCATION = {
  school: "Singapore Management University",
  degree: "BSc (Information Systems)",
  dates: "Jan 2022 – Jan 2026",
  majors: ["Smart City Management and Technology", "Digital Cloud Solutions"],
};

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
