import { ImageResponse } from "next/og";

// The picture shown when someone shares a link to Drip (WhatsApp, Facebook, Reddit, X...).
// Generated once at build time. The numbers are the example subscriptions a first-time visitor sees.

export const alt =
  "Drip: every subscription in one place. A card shows €43.47 a month, Netflix charging in 3 days and €299.76 a year you could save.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Dark theme colours from globals.css.
const C = {
  bg: "#0d1412",
  surface: "#151f1c",
  ink: "#e4ede9",
  muted: "#93a59e",
  line: "#2a3a35",
  accent: "#3cc3b6",
  accentInk: "#06201d",
  accentSoft: "#143b37",
  warn: "#f08a55",
  warnSoft: "#3a2116",
  good: "#6fcb7c",
  goodSoft: "#17321c",
};

const HEADLINE = "Every subscription, in one place.";
const SUBLINE = "See what they really cost, get a warning before each charge, and find the ones you no longer use.";
const CHIPS = ["Free", "No account needed", "Works on any phone"];
const TOTAL = "€43.47";
const SAVING = "€299.76 / yr";
const ROWS = [
  { name: "Netflix", price: "€13.99", tag: "In 3 days", warn: true },
  { name: "Spotify", price: "€11.99", tag: "In 9 days", warn: false },
  { name: "Xbox Game Pass", price: "€14.99", tag: "Not used", warn: true },
];
const LABELS = { total: "PER MONTH", month: "/ month", save: "You could save" };

// ImageResponse reads TTF/OTF/WOFF, not the WOFF2 that next/font serves. Google Fonts sends TTF to
// non-browser clients, and `text` trims each font down to the letters used here.
async function googleFont(family: string, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(text)}`, {
      cache: "force-cache",
    }).then((response) => response.text());
    const src = /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/.exec(css)?.[1];
    if (!src) throw new Error("no TTF in the stylesheet");
    const font = await fetch(src, { cache: "force-cache" });
    if (!font.ok) throw new Error(`HTTP ${font.status}`);
    return await font.arrayBuffer();
  } catch (error) {
    // Better a preview in the fallback font than a failed deploy.
    console.warn(`opengraph-image: couldn't load ${family}:`, error);
    return null;
  }
}

const [bricolage, figtree, mono, monoHeavy] = await Promise.all([
  googleFont("Bricolage+Grotesque:opsz,wght@96,800", "Drip" + HEADLINE),
  googleFont(
    "Figtree:wght@500",
    [SUBLINE, ...CHIPS, ...ROWS.flatMap((row) => [row.name, row.tag]), ...Object.values(LABELS)].join(""),
  ),
  googleFont("JetBrains+Mono:wght@500", ROWS.map((row) => row.price).join("") + SAVING),
  googleFont("JetBrains+Mono:wght@800", TOTAL),
]);

const fonts = [
  bricolage && { name: "Bricolage", data: bricolage, weight: 800 as const },
  figtree && { name: "Figtree", data: figtree, weight: 500 as const },
  mono && { name: "JetBrains Mono", data: mono, weight: 500 as const },
  monoHeavy && { name: "JetBrains Mono", data: monoHeavy, weight: 800 as const },
].filter((font) => font !== null);

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          padding: "64px 72px",
          background: C.bg,
          color: C.ink,
          fontFamily: "Figtree",
          fontWeight: 500,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", width: 560 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <svg width="52" height="52" viewBox="0 0 32 32">
              <path d="M16 3c5 7 9 11.5 9 17a9 9 0 0 1-18 0c0-5.5 4-10 9-17z" fill={C.accent} />
              <path d="M12 21a4 4 0 0 0 4 4" stroke={C.accentInk} strokeWidth="2" fill="none" strokeLinecap="round" />
            </svg>
            <div style={{ fontFamily: "Bricolage", fontWeight: 800, fontSize: 48, letterSpacing: -1 }}>Drip</div>
          </div>
          <div
            style={{
              marginTop: 44,
              fontFamily: "Bricolage",
              fontWeight: 800,
              fontSize: 68,
              lineHeight: 1.02,
              letterSpacing: -2.4,
            }}
          >
            {HEADLINE}
          </div>
          <div style={{ marginTop: 24, fontSize: 27, lineHeight: 1.4, color: C.muted }}>{SUBLINE}</div>
          <div style={{ display: "flex", gap: 12, marginTop: "auto" }}>
            {CHIPS.map((chip) => (
              <div
                key={chip}
                style={{
                  flexShrink: 0,
                  padding: "8px 16px",
                  borderRadius: 999,
                  background: C.accentSoft,
                  color: C.accent,
                  fontSize: 20,
                }}
              >
                {chip}
              </div>
            ))}
          </div>
        </div>

        {/* A slice of the app itself */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: 440,
            marginLeft: "auto",
            alignSelf: "center",
            padding: 32,
            borderRadius: 28,
            border: `1px solid ${C.line}`,
            background: C.surface,
          }}
        >
          <div style={{ fontSize: 16, letterSpacing: 2, color: C.muted }}>{LABELS.total}</div>
          <div style={{ display: "flex", alignItems: "baseline", marginTop: 6 }}>
            <div style={{ fontFamily: "JetBrains Mono", fontWeight: 800, fontSize: 64, letterSpacing: -2 }}>{TOTAL}</div>
            <div style={{ marginLeft: 10, fontSize: 24, color: C.muted }}>{LABELS.month}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 20, borderTop: `1px solid ${C.line}` }}>
            {ROWS.map((row) => (
              <div
                key={row.name}
                style={{ display: "flex", alignItems: "center", padding: "14px 0", borderBottom: `1px solid ${C.line}` }}
              >
                <div style={{ marginRight: 16, fontSize: 22 }}>{row.name}</div>
                <div style={{ marginLeft: "auto", fontFamily: "JetBrains Mono", fontSize: 20 }}>{row.price}</div>
                <div
                  style={{
                    marginLeft: 12,
                    padding: "3px 10px",
                    borderRadius: 8,
                    fontSize: 15,
                    background: row.warn ? C.warnSoft : C.line,
                    color: row.warn ? C.warn : C.muted,
                  }}
                >
                  {row.tag}
                </div>
              </div>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginTop: 20,
              padding: "12px 16px",
              borderRadius: 14,
              background: C.goodSoft,
              color: C.good,
              fontSize: 20,
            }}
          >
            <div>{LABELS.save}</div>
            <div style={{ marginLeft: "auto", fontFamily: "JetBrains Mono", fontSize: 22 }}>{SAVING}</div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
