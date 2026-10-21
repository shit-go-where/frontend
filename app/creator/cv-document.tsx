import { Document, Font, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { CONTACT_EMAIL, SITE_URL } from "@/lib/site";
import {
  CERTIFICATIONS,
  EDUCATION,
  EXPERIENCE,
  HEADLINE,
  LINKEDIN_URL,
  NAME,
  PROJECTS,
  SHIT_GO_WHERE,
  SKILLS,
  roleDates,
  type Project,
} from "./content";

/*
 * The CV behind /creator/cv.pdf, built from content.ts so the page and the PDF never disagree. Plain and
 * printable: black on white, the PDF's built-in Helvetica (no font files), A4. Never a phone number, the
 * school email or GPA: content.ts holds none of them, and nothing is added here.
 */

// Whole words only: react-pdf hyphenates by default, which splits "organi-sations" across lines.
Font.registerHyphenationCallback((word) => [word]);

const INK = "#000000";
const SOFT = "#333333";

const s = StyleSheet.create({
  page: { paddingVertical: 36, paddingHorizontal: 42, fontFamily: "Helvetica", fontSize: 9.2, lineHeight: 1.32, color: INK },
  name: { fontFamily: "Helvetica-Bold", fontSize: 19, lineHeight: 1.1 },
  headline: { marginTop: 2, fontSize: 10, color: SOFT },
  contact: { marginTop: 4, flexDirection: "row", flexWrap: "wrap" },
  link: { color: INK, textDecoration: "none" },
  section: { marginTop: 9 },
  heading: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9.6,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    paddingBottom: 2,
    marginBottom: 3,
    borderBottomWidth: 0.75,
    borderBottomColor: INK,
  },
  entry: { marginTop: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  strong: { fontFamily: "Helvetica-Bold" },
  dates: { color: SOFT, textAlign: "right", marginLeft: 8 },
  sub: { color: SOFT },
  bullet: { flexDirection: "row", marginTop: 1 },
  dot: { width: 9 },
  bulletText: { flex: 1 },
});

function Bullets({ items }: { items: string[] }) {
  return (
    <View>
      {items.map((b) => (
        <View key={b} style={s.bullet}>
          <Text style={s.dot}>•</Text>
          <Text style={s.bulletText}>{b}</Text>
        </View>
      ))}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.heading}>{title}</Text>
      {children}
    </View>
  );
}

function ProjectEntry({ p }: { p: Project }) {
  return (
    <View style={s.entry} wrap={false}>
      <View style={s.row}>
        <Text>
          <Text style={s.strong}>{p.name}</Text>
          {p.context ? <Text style={s.sub}> · {p.context}</Text> : null}
          {p.links.map((l) => (
            <Text key={l.href} style={s.sub}>
              {" · "}
              <Link src={l.href} style={s.link}>
                {l.href.replace(/^https?:\/\/(www\.)?/, "")}
              </Link>
            </Text>
          ))}
        </Text>
        <Text style={s.dates}>{p.dates}</Text>
      </View>
      <Bullets items={p.bullets} />
      <Text style={s.sub}>Built with: {p.tags.join(", ")}</Text>
    </View>
  );
}

const sgw = SHIT_GO_WHERE;
/** The app leads the projects, with its live address. */
const SGW_PROJECT: Project = {
  name: sgw.name,
  context: sgw.cv.context,
  dates: sgw.cv.dates,
  links: [{ label: SITE_URL, href: SITE_URL }],
  bullets: sgw.cv.bullets,
  tags: sgw.cv.tags,
};

export function CvDocument() {
  const site = `${SITE_URL}/creator`;
  const contact = [
    { label: LINKEDIN_URL.replace(/^https?:\/\/(www\.)?/, ""), href: LINKEDIN_URL },
    { label: site.replace(/^https?:\/\//, ""), href: site },
    ...(CONTACT_EMAIL ? [{ label: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}` }] : []),
  ];
  return (
    <Document title={`${NAME} CV`} author={NAME} subject={`${NAME}, ${HEADLINE.toLowerCase()}`} creator={NAME} producer={NAME}>
      <Page size="A4" style={s.page}>
        <Text style={s.name}>{NAME}</Text>
        <Text style={s.headline}>{HEADLINE}</Text>
        <View style={s.contact}>
          {contact.map((c, i) => (
            <View key={c.href} style={{ flexDirection: "row" }}>
              {i > 0 ? <Text style={{ marginHorizontal: 6, color: SOFT }}>·</Text> : null}
              <Link src={c.href} style={s.link}>
                {c.label}
              </Link>
            </View>
          ))}
        </View>

        <Section title="Experience">
          {EXPERIENCE.map((r) => (
            <View key={`${r.company} ${r.start}`} style={s.entry} wrap={false}>
              <View style={s.row}>
                <Text>
                  <Text style={s.strong}>{r.title}</Text>
                  <Text>, {r.company}</Text>
                  {r.location ? <Text style={s.sub}> · {r.location}</Text> : null}
                </Text>
                <Text style={s.dates}>{roleDates(r)}</Text>
              </View>
              <Bullets items={r.bullets} />
            </View>
          ))}
        </Section>

        <Section title="Projects">
          {[SGW_PROJECT, ...PROJECTS].map((p) => (
            <ProjectEntry key={p.name} p={p} />
          ))}
        </Section>

        <Section title="Education">
          <View style={s.row}>
            <Text>
              <Text style={s.strong}>{EDUCATION.school}</Text>
              <Text>, {EDUCATION.degree}</Text>
            </Text>
            <Text style={s.dates}>{EDUCATION.dates}</Text>
          </View>
          <Text style={s.sub}>Majors: {EDUCATION.majors.join(" and ")}</Text>
        </Section>

        <Section title="Skills">
          {SKILLS.map((g) => (
            <Text key={g.group} style={{ marginTop: 1 }}>
              <Text style={s.strong}>{g.group}: </Text>
              {g.items.join(", ")}
            </Text>
          ))}
        </Section>

        <Section title="Certifications">
          <Text>
            <Text style={s.strong}>{CERTIFICATIONS.issuer}: </Text>
            {CERTIFICATIONS.courses.join("; ")}
          </Text>
        </Section>
      </Page>
    </Document>
  );
}
