---
version: 1
slug: "frontend-app"
primary_target: "frontend/app"
related_targets: ["frontend/components"]
---

# Surface brief: Shit Go Where web app (all routes)

Scope: the whole frontend (map + sheet, /go urgent and calm results and route, toilet detail, add, review, leaderboard, /me, about, privacy, login, 404 and error pages). Visitor mode: Operate. Phone first, desktop adapted. Dark by default with a light theme in settings. Code-led build (no image generation).

Audience and job: locals on phones, one-handed, often underground or at night, who need a decent toilet now; contributors check in and review in calmer moments. Proof and content are unchanged: trust tiers, open-data caveats, "no toilet here" notes, URL-state routing, check-in loop.

Constraints: WCAG 2.2 AA in both themes; tiers stay legible without colour (fill, outline, dash); standard controls only; Singlish in display headings, facts in plain text; no mascot on data surfaces; OneMap ships only fixed raster styles, so its Grey tiles are gradient-mapped to chocolate (dark) or caramel paper (light) in the browser.

Open decisions resolved at build: urgency red against the candy palette, light-theme ground, four mascot moods (happy, worried, celebrating, lost).

## Direction contract

THESIS: Poo as a lovable character. The app is a glossy poo-pop toy on chocolate dark: a swirl-poo mascot is the panic button and the celebration, while every fact sits plain on sticker cards. It refuses the category default of a grey maps app with one blue accent, and the cream-and-teal civic look it replaces.

OWN-WORLD: Chocolate-dark ground with warm brown surfaces; glossy vinyl poo brown and caramel highlights; candy pink for selection and primary actions; mint for good news and walk time; one hot red for urgency. Chunky single-weight display face (Dela Gothic One) for headlines and big numbers, rounded workhorse sans (M PLUS Rounded 1c) for everything else. Rounded sticker cards with a soft lift and a glossy top highlight, pill chips and buttons.

STORY: The visitor sees nearby toilets at once, trusts what each one claims because the tier shows plainly, and taps the poo when it is urgent. They walk there, check in, and the mascot cheers them.

FIRST VIEWPORT: Phone, dark. A chocolate-and-toffee map fills the top half with recoloured toilet-roll pins; rounded search pill and pill filter chips float over it. A chocolate sheet below holds a display headline ("50 toilets within 1 km"), the pin key, and sticker cards with a mint walk-minute block, name, tier, cleanliness. The bottom nav holds Map, Add, Ranks, Me around the raised glossy poo mascot labelled I NEED TO GO.

FORM: Unko Pop (Japanese poo-character pop), position 1 of 7 on the ordered list (IMPECCABLE'S PICK, chosen over the assigned Hawker Lightbox). seed:7df63651bc18b899. Signature interaction: pressing the mascot squishes and plops before navigating to urgent mode; its ring pulse is the only perpetual motion.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
