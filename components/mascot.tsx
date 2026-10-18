import { cx } from "./styles";

export type MascotMood = "happy" | "worried" | "celebrating" | "lost";

/*
 * The glossy swirl-poo mascot (64 × 64). Drawn back to front: base tier, middle,
 * top, then the curl, each outlined in ink so the tiers read as a swirl.
 * Colours come from tokens so it sits in both themes.
 */
const TIERS = [
  "M6 50c0-6.6 5.4-10 12-10h28c6.6 0 12 3.4 12 10s-5.4 10-12 10H18C11.4 60 6 56.6 6 50Z",
  "M12 37.5C12 32 16.5 28 22 28h20c5.5 0 10 4 10 9.5S47.5 46 42 46H22c-5.5 0-10-3.6-10-8.5Z",
  "M19 25.5C19 21 22.6 17 27 17h10c4.4 0 8 4 8 8.5S41.4 33 37 33H27c-4.4 0-8-3-8-7.5Z",
];
const CURL = "M28 18.5c-1.8-4.8 1.6-9.6 6.8-10.6 2.6-.5 4.6-2 5.4-4.4 2 3.6 1.2 8.4-2 11.2-2.2 1.9-4.4 2.4-5 5.4Z";
/** Vinyl shading: a darker band hugging the underside of each tier and the curl. */
const SHADE = ["M9 54.5q23 8 46 0", "M15 42.5q17 6.5 34 0", "M22 30q10 4.8 20 0", "M30.5 16.5q2.5-3.5 6.5-4"];
const GLOSS = ["M12 47.5c1.4-2.8 4.2-4 8-4", "M17.5 34.5c1.2-2.4 3.4-3.4 6.4-3.4", "M23.5 22.6c.9-1.9 2.5-2.7 4.6-2.7", "M33.4 9.6c1-.9 2.2-1.4 3.4-1.5"];

function Eyes({ mood }: { mood: MascotMood }) {
  if (mood === "celebrating") {
    // Squeezed-shut happy eyes.
    return (
      <g fill="none" stroke="var(--poo-ink)" strokeWidth="2.6" strokeLinecap="round">
        <path d="M20.5 40.5q3.5-4 7 0" />
        <path d="M36.5 40.5q3.5-4 7 0" />
      </g>
    );
  }
  const look = mood === "lost" ? { x: 1.6, y: 0.6 } : mood === "worried" ? { x: 0, y: 1 } : { x: 0.6, y: -0.6 };
  return (
    <g>
      <circle cx="24" cy="40" r="5.2" fill="#fff8ef" stroke="var(--poo-ink)" strokeWidth="1.6" />
      <circle cx="40" cy="40" r={mood === "lost" ? 6.2 : 5.2} fill="#fff8ef" stroke="var(--poo-ink)" strokeWidth="1.6" />
      <circle cx={24 + look.x} cy={40 + look.y} r="2.5" fill="var(--poo-ink)" />
      <circle cx={40 + look.x} cy={40 + look.y} r="2.5" fill="var(--poo-ink)" />
      <circle cx={23 + look.x} cy={39 + look.y} r=".8" fill="#fff8ef" />
      <circle cx={39 + look.x} cy={39 + look.y} r=".8" fill="#fff8ef" />
    </g>
  );
}

function Mouth({ mood }: { mood: MascotMood }) {
  const ink = { fill: "none", stroke: "var(--poo-ink)", strokeWidth: 2.6, strokeLinecap: "round" as const };
  switch (mood) {
    case "happy":
      return <path d="M26 50.5q6 5 12 0" {...ink} />;
    case "celebrating":
      return <path d="M25 49h14q-1 7-7 7t-7-7Z" fill="var(--poo-ink)" />;
    case "worried":
      return <path d="M26.5 52.5q2.75-2.5 5.5 0t5.5 0" {...ink} />;
    case "lost":
      return <path d="M28 52h8" {...ink} />;
  }
}

function Extras({ mood }: { mood: MascotMood }) {
  if (mood === "worried") {
    return (
      <g>
        <path d="M19.5 33.5l7 2.2M44.5 33.5l-7 2.2" stroke="var(--poo-ink)" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M51 22c2 3 3.2 5 3.2 6.6a3.2 3.2 0 0 1-6.4 0c0-1.6 1.2-3.6 3.2-6.6Z" fill="#8fd3ff" stroke="var(--poo-ink)" strokeWidth="1.2" />
      </g>
    );
  }
  if (mood === "celebrating") {
    return (
      <g fill="var(--accent)" stroke="var(--poo-ink)" strokeWidth="1" strokeLinejoin="round">
        <path d="M8 14l1.6 3.6L13 19l-3.4 1.6L8 24l-1.6-3.4L3 19l3.4-1.4Z" />
        <path d="M55 8l1.2 2.6 2.8 1.2-2.8 1.2L55 16l-1.2-2.8-2.8-1.2 2.8-1.2Z" />
        <circle cx="52" cy="25" r="2" fill="var(--primary)" />
      </g>
    );
  }
  if (mood === "lost") {
    return (
      <path
        d="M49 10.5a4.5 4.5 0 1 1 6 4.2c-1.4.6-1.9 1.4-1.9 2.8M53.1 21.4v.2"
        fill="none"
        stroke="var(--fg)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    );
  }
  return null;
}

/** The app's character. Decorative unless given a `title`. Never on data surfaces. */
export function Mascot({ mood = "happy", className, title }: { mood?: MascotMood; className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cx("shrink-0 overflow-visible", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {/* Die-cut sticker rim, so the silhouette separates from any ground. */}
      <g fill="#fff8ef" stroke="#fff8ef" strokeWidth="5" strokeLinejoin="round">
        {TIERS.map((d) => (
          <path key={d} d={d} />
        ))}
        <path d={CURL} />
      </g>
      {/* Each tier is drawn with its own shading before the next overlaps it (no gradient ids to collide). */}
      {[...TIERS, CURL].map((d, i) => (
        <g key={d}>
          <path d={d} fill="var(--poo)" stroke="var(--poo-ink)" strokeWidth="2" strokeLinejoin="round" />
          <path d={SHADE[i]} fill="none" stroke="#4a240d" strokeWidth="3.4" strokeLinecap="round" opacity=".55" />
        </g>
      ))}
      <g fill="none" stroke="var(--poo-hi)" strokeWidth="2.4" strokeLinecap="round" opacity=".9">
        {GLOSS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      {/* Specular highlights: the glossy-toy read. */}
      <g fill="#fff8ef">
        <ellipse cx="14.5" cy="46.2" rx="2.6" ry="1.3" transform="rotate(-24 14.5 46.2)" opacity=".75" />
        <ellipse cx="19.6" cy="32.8" rx="2.2" ry="1.1" transform="rotate(-24 19.6 32.8)" opacity=".7" />
        <ellipse cx="25.2" cy="21.2" rx="1.8" ry=".95" transform="rotate(-24 25.2 21.2)" opacity=".7" />
        <circle cx="35.6" cy="9" r="1.1" opacity=".75" />
      </g>
      <circle cx="16.5" cy="48.5" r="3" fill="var(--primary)" opacity=".45" />
      <circle cx="47.5" cy="48.5" r="3" fill="var(--primary)" opacity=".45" />
      <Eyes mood={mood} />
      <Mouth mood={mood} />
      <Extras mood={mood} />
    </svg>
  );
}
