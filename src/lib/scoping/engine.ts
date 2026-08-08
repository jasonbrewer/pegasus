/**
 * The pricing engine behind "Scope a job".
 *
 * Pure TypeScript — no React, no Next, no Supabase, no I/O. It takes the
 * buyer's answers plus the house rate sheet and returns a line-item scope.
 * Nothing here reads or writes anything; the tool is stateless by design and
 * a scope is never persisted (spec §9).
 *
 * The rules are baked in, but every line carries the plain-English sentence
 * that explains it, because the point of this tool is not to produce a number
 * — it is to teach a non-producer where the invisible costs live (travel,
 * licensing, deliverable volume) so they can walk into a real quote knowing
 * the shape of the job.
 */

import type { Baseline, BaselineKey } from "./baseline";

/* ========================= TYPES ========================= */

export type Variant = "lean" | "recommended" | "premium";

/** What a job prices *like*, regardless of what the buyer calls it. */
export type Archetype = "talkinghead" | "branded" | "event" | "training" | "ad";

export type OnCamera = "one" | "mix" | "conversation" | "execs" | "broll" | "crowd";
export type Destination = "socialfeed" | "website" | "bigscreen" | "tv";
export type Filming = "couple" | "one" | "two" | "three";
/**
 * The judgment calls. "unsure" is a real answer a buyer presses, not an
 * unanswered default: it keeps the line OUT of the estimate (so the ballpark
 * stays honest and low) and puts the item in the assumptions list flagged for
 * them to raise with a professional.
 */
export type TriState = "yes" | "no" | "unsure";
export type Hire = "local" | "import";
export type Distance = "near" | "drive1" | "drive2" | "flight";
export type PolishKey = "quick" | "standard" | "full";
export type CountKey = "1" | "2" | "4" | "8";
export type LengthKey = "0.5" | "1" | "3" | "6";

export type ChecklistKey = "secondCam" | "audio" | "drone" | "graphics";

export type Answers = {
  making: string;
  onCamera: OnCamera;
  destination: Destination;
  filming: Filming;
  hire: Hire;
  distance: Distance;
  polish: PolishKey;
  count: CountKey;
  each: LengthKey;
  /**
   * Where the shoot is — a city, a metro or a zip, exactly as typed. Free text
   * on purpose: it is not geocoded, not validated against the zip table, and
   * never inferred from an IP address. Empty string means "not sure yet",
   * which is a real answer here and not a missing one.
   *
   * It earns its place in the intake twice over. For the buyer it anchors the
   * travel questions below it — travel is priced off `hire` and `distance`,
   * and those two read as abstractions until there is a place attached. For
   * us it is the first thing anyone needs in order to line up crew.
   */
  shootLocation: string;
} & Record<ChecklistKey, TriState>;

export type ScopeLine = { key: string; amt: number; simple: string };

export type Scope = {
  lines: ScopeLine[];
  /** Teaching notes, shown under the estimate. */
  notes: string[];
  /** "This quote assumes…" — the choices behind this number, in plain English. */
  assumptions: string[];
  /** [label, amount] pairs the lean variant cut to hit its price. */
  dropped: [string, number][];
  total: number;
  variant: Variant;
  isAd: boolean;
  audioRequired: boolean;
  editDays: number;
  totalMin: number;
  count: number;
};

/* ======================= QUESTIONS ======================= */

/**
 * 21 recognizable options → 5 pricing archetypes. The client finds their own
 * word for it; the engine knows what it prices like.
 */
export const MAKING: { label: string; arch: Archetype }[] = [
  { label: "Testimonial", arch: "talkinghead" },
  { label: "Customer story", arch: "talkinghead" },
  { label: "Founder / CEO interview", arch: "talkinghead" },
  { label: "Recruitment / hiring", arch: "talkinghead" },
  { label: "Expert Q&A", arch: "talkinghead" },
  { label: "Employee spotlight", arch: "talkinghead" },
  { label: "Brand video", arch: "branded" },
  { label: "Product video", arch: "branded" },
  { label: "Promo / teaser", arch: "branded" },
  { label: "Culture / about-us", arch: "branded" },
  { label: "Sizzle reel", arch: "branded" },
  { label: "Case study", arch: "branded" },
  { label: "Real-estate / property", arch: "branded" },
  { label: "Conference recap", arch: "event" },
  { label: "Gala / fundraiser", arch: "event" },
  { label: "Panel / livestream", arch: "event" },
  { label: "Onboarding", arch: "training" },
  { label: "How-to / explainer", arch: "training" },
  { label: "Safety training", arch: "training" },
  { label: "TV commercial", arch: "ad" },
  { label: "Paid social ad", arch: "ad" },
  { label: "Other / not sure", arch: "branded" },
];

export const POLISH: { key: PolishKey; title: string; note: string }[] = [
  { key: "quick", title: "Simple cut", note: "Fast, clean edit — the social-feed look. Gets the job done." },
  { key: "standard", title: "Polished", note: "The standard nice version most brand videos want." },
  { key: "full", title: "Fully produced", note: "Full color, motion graphics, the whole treatment." },
];

export type Question = {
  key: keyof Answers;
  label: string;
  /** Only asked once this other answer opens it up. */
  trigger?: keyof Answers;
  opts: [string, string][];
};

export const QUESTIONS: Question[] = [
  {
    key: "onCamera",
    label: "Who's on camera?",
    opts: [
      ["one", "One person at a time"],
      ["mix", "A mix of interviews and b-roll"],
      ["conversation", "A conversation — 2–3 people"],
      ["execs", "Senior execs / high-stakes"],
      ["broll", "Mostly b-roll, no interviews"],
      ["crowd", "A room / live audience"],
    ],
  },
  {
    key: "destination",
    label: "Where will people watch it?",
    opts: [
      ["socialfeed", "Social feeds"],
      ["website", "Our website"],
      ["bigscreen", "A screen at an event"],
      ["tv", "TV or a paid ad"],
    ],
  },
  {
    key: "filming",
    label: "Roughly how much filming?",
    opts: [
      ["couple", "A couple of hours, one spot"],
      ["one", "About a day"],
      ["two", "Two days"],
      ["three", "Three days"],
    ],
  },
  {
    key: "hire",
    label: "Who's shooting it?",
    opts: [
      ["local", "Someone local"],
      ["import", "Open to bringing someone in"],
    ],
  },
  {
    key: "distance",
    label: "How far is the shoot from the crew?",
    trigger: "hire",
    opts: [
      ["near", "Under an hour"],
      ["drive1", "A 1–2.5 hr drive"],
      ["drive2", "A 2.5–4 hr drive"],
      ["flight", "A flight away"],
    ],
  },
];

/**
 * The judgment-call checklist — the things a buyer might not know they need.
 * Aerial/drone was a plain yes/no question in v1 and lives here now, so all
 * four of these get the same three-state treatment.
 */
export const CHECKLIST: { key: ChecklistKey; label: string; help: string }[] = [
  {
    key: "secondCam",
    label: "A second camera?",
    help: "A second angle. Common for events or a more produced look.",
  },
  {
    key: "audio",
    label: "A separate audio person?",
    help: "For multi-person scenes or high-stakes shoots. A single interview usually records fine into the camera.",
  },
  {
    key: "drone",
    label: "Aerial / drone shots?",
    help: "Overhead or establishing shots from a drone.",
  },
  {
    key: "graphics",
    label: "Motion graphics?",
    help: "Titles, lower-thirds, animated elements.",
  },
];

export const TRI_OPTS: [TriState, string][] = [
  ["yes", "Yes"],
  ["no", "No"],
  ["unsure", "I don't know"],
];

/** Deliverables — number of cuts × length each. Length values are minutes. */
export const COUNT_OPTS: [CountKey, string][] = [
  ["1", "Just one"],
  ["2", "A couple (2–3)"],
  ["4", "A handful (4–6)"],
  ["8", "A whole set (8+)"],
];

export const LEN_OPTS: [LengthKey, string][] = [
  ["0.5", "About 30 seconds"],
  ["1", "Around a minute"],
  ["3", "A few minutes"],
  ["6", "5 minutes or more"],
];

/** Representative counts for the per-extra-cut overhead math. */
export const COUNT_N: Record<CountKey, number> = { "1": 1, "2": 3, "4": 5, "8": 9 };

/**
 * The only "what are you making" choices that force a sound person.
 * Everything else is genuinely a judgment call — hence the standing advisory
 * on every quote. onCamera "conversation"/"execs" and a TV/paid-ad
 * destination also trigger it.
 */
export const AUDIO_MAKING = new Set([
  "Founder / CEO interview",
  "Recruitment / hiring",
  "Case study",
  "Safety training",
  "TV commercial",
]);

export const DEFAULTS: Answers = {
  making: "Testimonial",
  onCamera: "one",
  destination: "website",
  filming: "couple",
  hire: "local",
  distance: "near",
  polish: "standard",
  count: "1",
  each: "3",
  shootLocation: "",
  secondCam: "no",
  audio: "no",
  drone: "no",
  graphics: "no",
};

/* ===================== AUTO-RULES ===================== */

/** What the buyer's other answers already decided for them, and why. */
export type AutoRule = { forced: boolean; because: string };

export const archOf = (making: string): Archetype =>
  MAKING.find((m) => m.label === making)?.arch ?? "branded";

/**
 * Three of the four checklist items can be forced ON by answers given
 * elsewhere — an event needs a second angle, a 2–3 person conversation needs a
 * sound person, an ad needs titles. The checklist shows those as answered
 * rather than letting a "No" here quietly contradict the estimate.
 *
 * These are the variant-independent rules only. A premium second camera or a
 * lean trim is the tier doing its job, not the answers forcing a line.
 */
export function autoRules(a: Answers): Record<"secondCam" | "audio" | "graphics", AutoRule> {
  const arch = archOf(a.making);
  const isAd = arch === "ad" || a.destination === "tv";

  const audioBecause =
    a.onCamera === "conversation"
      ? "a 2–3 person conversation needs one"
      : a.onCamera === "execs"
        ? "senior execs on camera raise the stakes"
        : a.destination === "tv"
          ? "it's airing as a TV or paid ad"
          : AUDIO_MAKING.has(a.making)
            ? `a ${a.making.toLowerCase()} always gets one`
            : "";

  return {
    secondCam: {
      forced: arch === "event",
      because: "event coverage can't stop for a second take",
    },
    audio: { forced: audioBecause !== "", because: audioBecause },
    graphics: {
      forced: isAd || a.polish === "full",
      because: isAd ? "it's airing as a TV or paid ad" : "you asked for the fully-produced treatment",
    },
  };
}

/* ========================= ENGINE ========================= */

export const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

export function buildScope(a: Answers, B: Baseline, variant: Variant): Scope {
  const r = Object.fromEntries(Object.entries(B).map(([k, o]) => [k, o.v])) as Record<
    BaselineKey,
    number
  >;

  // "Other / not sure" and anything unrecognized price as a branded piece,
  // which is the middle of the range rather than the cheap or dear end.
  const arch = archOf(a.making);
  const days = { couple: 1, one: 1, two: 2, three: 3 }[a.filming];

  const audioRequired =
    ["conversation", "execs"].includes(a.onCamera) ||
    a.destination === "tv" ||
    AUDIO_MAKING.has(a.making);
  const isAd = arch === "ad" || a.destination === "tv";
  const halfEligible =
    a.filming === "couple" &&
    a.hire === "local" &&
    a.distance === "near" &&
    a.onCamera === "one" &&
    arch === "talkinghead" &&
    variant !== "premium";

  const polish: PolishKey =
    variant === "lean" ? "quick" : variant === "premium" ? "full" : isAd ? "full" : a.polish;

  /* ---- Deliverables billing ----
     An editor is a day minimum. There is no such thing as a sub-day edit, so
     there is no hourly path here: total finished minutes ÷ minutes-per-edit-day,
     rounded UP, floored at one. At 4 min/day that is 1–4 min → 1 day, 5–8 → 2,
     9–12 → 3. The only honest sub-day option in the whole tool is the quick
     local hour, which hands footage off with no edit at all. */
  const eachMin = Number(a.each);
  const count = COUNT_N[a.count] ?? 1;
  const totalMin = +(eachMin * count).toFixed(2);
  const perDay = Math.max(1, r.minsPerEditDay);

  let editDays = Math.max(1, Math.ceil(totalMin / perDay));
  if (polish === "full") editDays += 1; // the works finesses longer — after the floor
  const extraCuts = Math.max(0, count - 1);
  const editCost = editDays * r.editDay + extraCuts * r.deliverableFee;
  const editLabel =
    extraCuts > 0
      ? `Editing — ${editDays} day${editDays > 1 ? "s" : ""} + ${extraCuts} extra cut${
          extraCuts > 1 ? "s" : ""
        }`
      : `Editing to final cut — ${editDays} day${editDays > 1 ? "s" : ""}`;

  const colorHours =
    { quick: 2, standard: 4, full: 8 }[polish] + (totalMin >= 10 ? 4 : totalMin >= 5 ? 2 : 0);

  // A line goes in if the answers force it OR the buyer asked for it on the
  // checklist. "I don't know" is deliberately not a yes — it leaves the line
  // out and shows up in the assumptions instead.
  const wantsGraphics = polish === "full" || isAd || a.graphics === "yes";
  const wantsSecondCam =
    arch === "event" || a.secondCam === "yes" || (variant === "premium" && arch === "branded");
  const wantsAudio = audioRequired || a.audio === "yes";

  const lines: ScopeLine[] = [];
  const notes: string[] = [];
  const dropped: [string, number][] = [];

  /* Filming */
  if (halfEligible) {
    lines.push({
      key: "cam",
      amt: r.onebandHalf,
      simple: "Filming — half day, one shooter with full kit",
    });
  } else {
    lines.push({
      key: "cam",
      amt: days * r.shooterDay,
      simple: `Filming — ${days} day${days > 1 ? "s" : ""}, shooter + full kit`,
    });
  }

  if (wantsSecondCam) {
    if (variant === "lean" && arch !== "event") dropped.push(["Second camera", r.secondCam]);
    else lines.push({ key: "cam2", amt: r.secondCam, simple: "Second camera — a second angle" });
  }

  /* Sound — a starting guess only; the advisory in the quote does the honest work. */
  if (wantsAudio) {
    lines.push({
      key: "audio",
      amt: days * r.audioDay,
      simple: `Sound specialist — ${days} day${days > 1 ? "s" : ""}`,
    });
  }

  /* Aerial */
  if (a.drone === "yes") {
    if (variant === "lean") dropped.push(["Drone package", r.droneDay]);
    else lines.push({ key: "drone", amt: r.droneDay, simple: "Aerial — drone package" });
  }

  /* Post */
  lines.push({ key: "edit", amt: editCost, simple: editLabel });
  lines.push({
    key: "color",
    amt: colorHours * r.colorHour,
    simple: `Color finishing — ${colorHours} hrs`,
  });
  if (wantsGraphics) {
    const gd = totalMin > 4 || count >= 5 ? 2 : 1;
    if (variant === "lean" && !isAd) dropped.push(["Motion graphics", gd * r.graphicsDay]);
    else
      lines.push({
        key: "gfx",
        amt: gd * r.graphicsDay,
        simple: `Motion graphics — ${gd} day${gd > 1 ? "s" : ""}`,
      });
  }

  /* Deliverables teaching note */
  if (count > 1) {
    notes.push(
      `${count} separate cuts of about ${
        eachMin < 1 ? Math.round(eachMin * 60) + " sec" : eachMin + " min"
      } each is ~${totalMin} finished minutes — billed by cutting time, plus a small handling charge per extra cut for the separate exports and aspect ratios.`
    );
  }

  /* Rights */
  if (isAd) {
    lines.push({ key: "lic", amt: r.licensing, simple: "Music & broadcast licensing" });
    notes.push(
      "Anything airing as a TV or paid ad needs licensed music and usage rights — a real cost most people don't budget for. A website or social video doesn't carry it."
    );
  }

  /* Travel — surfaced as an owned decision, not a surprise on the invoice.

     The place they named does not move the maths — travel is priced off `hire`
     and `distance`, and it always was. What it moves is whether these notes
     are about anybody in particular. "Hiring local" is an abstraction until
     there is a town attached to it. */
  const place = a.shootLocation.trim();

  if (a.hire === "local" || a.distance === "near") {
    notes.push(
      place
        ? `Hiring local to ${place} keeps travel off the sheet entirely. Open up to bringing someone in and you'd add travel days, maybe a hotel.`
        : "Hiring local keeps travel off the sheet entirely. Open up to bringing someone in and you'd add travel days, maybe a hotel."
    );
  } else if (a.distance === "drive1") {
    lines.push({ key: "travel", amt: r.driveAllow, simple: "Travel — regional drive" });
  } else if (a.distance === "drive2") {
    const amt = r.travelDay + r.hotelNight * days + r.perDiem * (days + 1) + r.driveAllow;
    lines.push({
      key: "travel",
      amt,
      simple: "Travel — overnight (travel day, hotel, per diem)",
    });
    notes.push(
      "Over 2.5 hours each way counts as a travel day. A same-day return runs into overtime — usually the hotel is cheaper."
    );
  } else if (a.distance === "flight") {
    const amt =
      2 * r.flightLeg + 2 * r.travelDay + r.hotelNight * (days + 1) + r.perDiem * (days + 2);
    lines.push({ key: "travel", amt, simple: "Travel — flights, travel days, hotel, per diem" });
    notes.push(
      "Flying a specialist in roughly doubles a small budget. Worth knowing before you fall for an out-of-town reel — a local hire may get you 90% of the result for far less."
    );
  }

  /* ---- "This quote assumes…" ----
     The receipt for this particular number: what was left out, in plain
     sentences, and only where it is actually true of these answers. A
     judgment call the buyer wasn't sure about says so, and points at the
     person who can answer it. */
  const has = (key: string) => lines.some((l) => l.key === key);
  // The flag goes inside the sentence, before the full stop, so it reads as
  // English rather than as an afterthought bolted on after the period.
  const say = (sentence: string, v?: TriState) =>
    sentence + (v === "unsure" ? " (you weren't sure — ask your pro)" : "") + ".";
  const assumptions: string[] = [];

  if (!has("audio")) {
    assumptions.push(say("This quote assumes audio is recorded into the camera", a.audio));
  }
  if (!has("cam2")) assumptions.push(say("This quote assumes one camera", a.secondCam));
  if (!has("drone")) {
    assumptions.push(say("This quote assumes no aerial or drone shots", a.drone));
  }
  if (!has("gfx")) {
    assumptions.push(say("This quote assumes no motion graphics or titles", a.graphics));
  }
  if (!has("lic")) assumptions.push(say("This quote assumes no licensed music"));
  if (!has("travel")) {
    assumptions.push(
      say(
        place
          ? `This quote assumes no travel — crew already in or near ${place}`
          : "This quote assumes no travel"
      )
    );
  }
  if (!place) {
    assumptions.push(
      say("This quote assumes a typical location — you haven't said where the shoot is yet")
    );
  }
  if (editDays === 1) {
    assumptions.push(say("This quote assumes one round to final cut, then hourly for changes"));
  }

  const total = lines.reduce((s, l) => s + l.amt, 0);
  return {
    lines,
    notes,
    assumptions,
    dropped,
    total,
    variant,
    isAd,
    audioRequired,
    editDays,
    totalMin,
    count,
  };
}
