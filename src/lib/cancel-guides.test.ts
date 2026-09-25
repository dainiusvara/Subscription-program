import { describe, expect, it } from "vitest";
import {
  CANCEL_GUIDES,
  GENERAL_GUIDE,
  SERVICE_GUIDE_COUNT,
  cancellationEmail,
  findGuideByName,
  guideFor,
  normalizeName,
  searchGuides,
} from "./cancel-guides";
import { PRESETS } from "./catalog";

describe("normalizeName", () => {
  it("keeps words, drops symbols and accents", () => {
    expect(normalizeName("Disney+")).toBe("disney");
    expect(normalizeName("iCloud+ 200GB")).toBe("icloud 200gb");
    expect(normalizeName("  Apple TV+ ")).toBe("apple tv");
    expect(normalizeName("Déezer")).toBe("deezer");
  });
});

describe("findGuideByName", () => {
  const id = (name: string) => findGuideByName(name)?.id ?? null;

  it("finds services however people write them", () => {
    expect(id("Netflix")).toBe("netflix");
    expect(id("netflix premium")).toBe("netflix");
    expect(id("Spotify Family")).toBe("spotify");
    expect(id("Disney+")).toBe("disney");
    expect(id("PS Plus")).toBe("playstation");
    expect(id("Xbox Game Pass Ultimate")).toBe("xbox");
    expect(id("Office 365")).toBe("microsoft-365");
    expect(id("Adobe Photoshop")).toBe("adobe");
    expect(id("HBO Max")).toBe("hbo-max");
    expect(id("Max")).toBe("hbo-max");
    expect(id("Prime Video")).toBe("amazon-prime");
  });

  it("prefers the most specific match", () => {
    expect(id("Apple Music")).toBe("apple");
    expect(id("iCloud+")).toBe("icloud");
    expect(id("YouTube Music")).toBe("youtube");
    expect(id("Google One")).toBe("google-one");
    expect(id("Google Play Pass")).toBe("google-play");
  });

  it("matches whole words only", () => {
    expect(id("Maximum Fitness")).toBe("gym"); // not HBO Max
    expect(id("Deezerlike app")).toBeNull();
    expect(id("Local newspaper")).toBeNull();
  });
});

describe("guideFor", () => {
  it("falls back to the gym guide for fitness, then the general guide", () => {
    expect(guideFor({ name: "FitLife Club", category: "Fitness" }).id).toBe("gym");
    expect(guideFor({ name: "My Gym", category: "Other" }).id).toBe("gym");
    expect(guideFor({ name: "The Times", category: "News" })).toBe(GENERAL_GUIDE);
  });

  it("has a specific guide for every preset", () => {
    for (const preset of PRESETS) {
      expect(guideFor(preset), preset.name).not.toBe(GENERAL_GUIDE);
    }
  });
});

describe("guide data", () => {
  it("has official https links, steps and unique ids", () => {
    const ids = new Set<string>();
    for (const guide of CANCEL_GUIDES) {
      expect(ids.has(guide.id), guide.id).toBe(false);
      ids.add(guide.id);
      if (guide.url) expect(guide.url).toMatch(/^https:\/\//);
      expect(guide.steps.length).toBeGreaterThanOrEqual(2);
      expect(guide.aliases.length).toBeGreaterThan(0);
    }
    expect(SERVICE_GUIDE_COUNT).toBe(22);
  });

  it("searches by name or alias", () => {
    expect(searchGuides("photo").map((g) => g.id)).toEqual(["adobe"]);
    expect(searchGuides("").length).toBe(CANCEL_GUIDES.length + 1);
    expect(searchGuides("zzz")).toEqual([]);
  });
});

describe("cancelling directly", () => {
  it("links straight to the cancel page only on the services' own sites", () => {
    for (const guide of CANCEL_GUIDES) {
      if (!guide.cancelUrl) continue;
      expect(new URL(guide.cancelUrl).protocol).toBe("https:");
    }
    expect(CANCEL_GUIDES.find((g) => g.id === "netflix")?.cancelUrl).toBe("https://www.netflix.com/cancelplan");
  });

  it("writes a cancellation email for services without a cancel button", () => {
    const email = cancellationEmail("FitZone Vilnius");
    expect(email.subject).toBe("Cancellation of my FitZone Vilnius membership");
    expect(email.body).toContain("stop all further payments");
    expect(cancellationEmail(" ").subject).toBe("Cancellation of my membership");
  });
});
