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
export type LengthKey = "0.5" | "1" | "3" | "6" | "15" | "30";

export type ChecklistKey =
  | "secondCamOperator"
  | "secondCamGear"
  | "audio"
  | "drone"
  | "graphics"
  | "color";

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
 *
 * EVERY item here works the same way, and the rule has no exceptions:
 *
 *   the making-type (and the other answers) set the DEFAULT;
 *   "Yes" forces it in, "No" forces it out, "I don't know" takes the default.
 *
 * Nothing on this list is ever locked, greyed out or answered-for by what
 * they're making. It used to be: an event forced a second camera and a
 * conversation forced a sound person, both rendered as disabled buttons, so
 * the one question a buyer most wants to push back on was the one they
 * couldn't. A default the visitor cannot overrule is not a default, it is the
 * tool telling them what they want.
 *
 * The single greying rule left is between two items on this list rather than
 * from the making-type: a second OPERATOR brings their own camera, so
 * gear-only goes quiet and contributes nothing while an operator is in. Set
 * the operator question to No and gear-only comes straight back.
 */
export const CHECKLIST: {
  key: ChecklistKey;
  label: string;
  help: string;
  /** Overrides TRI_OPTS where the three states need their own wording. */
  opts?: [TriState, string][];
}[] = [
  {
    key: "secondCamOperator",
    label: "Second camera + operator?",
    help: "A second camera with its own person behind it — someone framing and following the action live. What event coverage and anything cut fast needs.",
  },
  {
    key: "secondCamGear",
    label: "Second camera — gear only?",
    help: "A second body locked off on a tripod, run by the shooter you already have. A second angle for the edit without a second wage.",
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
  {
    key: "color",
    label: "A color grade?",
    help: "A colourist matching and shaping the look across every shot — the difference between footage and a film.",
    // The only checklist item whose "I don't know" is not simply a no: colour
    // falls back to what this kind of video normally gets (COLOR_MAKING), so
    // the wording has to say that rather than "Yes / No / I don't know".
    opts: [
      ["yes", "Yes, add color"],
      ["no", "No, skip color"],
      ["unsure", "I don't know"],
    ],
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
  // Was "5 minutes or more" — it had to stop saying "or more" the moment
  // there were longer options underneath it.
  ["6", "Around 5 minutes"],
  ["15", "About 15 minutes"],
  // The open end of the scale. Priced as exactly 30 everywhere — the key IS
  // the number the maths uses, so there is no separate "treat 30+ as 30" rule
  // to keep in sync. A genuinely longer piece needs a person, not a button.
  ["30", "30 minutes or more"],
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

/**
 * The making-types that carry a colour grade BY DEFAULT.
 *
 * The dividing line is whether the look is part of the product. A brand film,
 * a product piece, a sizzle reel or an ad is judged on how it looks, and an
 * ungraded one reads as cheap however well it was shot. A testimonial, a
 * conference recap or a safety training video is judged on whether you can
 * hear and follow it — a grade there is money that buys the client nothing
 * they would notice.
 *
 * The founder interview is the one talking-head piece on this list, and it is
 * here for the same reason it forces a sound person: it is the CEO, it goes on
 * the homepage, and it is the one interview anybody will look at twice.
 *
 * This is a DEFAULT, not a rule. The buyer's own answer on the checklist beats
 * it in either direction — see `wantsColor` in buildScope.
 */
export const COLOR_MAKING = new Set([
  "Brand video",
  "Product video",
  "Promo / teaser",
  "Sizzle reel",
  "TV commercial",
  "Paid social ad",
  "Founder / CEO interview",
]);

/**
 * What second camera, if any, a making-type gets by default.
 *
 * Three states, and the base shooter is in every quote regardless — these say
 * only what goes ON TOP of that one camera.
 *
 *   OPERATOR ($1,400)  a second person shooting. For anything that happens
 *                      once and cannot be repeated: a conference, a gala, a
 *                      sizzle cut from live coverage. Miss the moment with one
 *                      camera and there is no second take.
 *   GEAR ONLY ($400)   a second body on a tripod, run by the shooter already
 *                      there. For pieces that are staged and repeatable but
 *                      want a cutaway — a founder interview, a panel, an
 *                      explainer, safety training.
 *   NEITHER            everything else. One camera, and the edit works.
 *
 * A making-type must not appear in both sets — the assertion below throws at
 * import if one ever does, because the alternative is a quote that silently
 * charges for an operator and a spare body on the same shoot.
 */
export const SECOND_CAM_OPERATOR_MAKING = new Set([
  "Sizzle reel",
  "Conference recap",
  "Gala / fundraiser",
]);

export const SECOND_CAM_GEAR_MAKING = new Set([
  "Founder / CEO interview",
  "Panel / livestream",
  "How-to / explainer",
  "Safety training",
]);

for (const m of SECOND_CAM_OPERATOR_MAKING) {
  if (SECOND_CAM_GEAR_MAKING.has(m)) {
    throw new Error(
      `scoping: "${m}" is in both second-camera default sets — it would bill an operator and a spare body for the same shoot`
    );
  }
}

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
  /*
   * EVERY judgment call starts neutral, and neutral means "use the default
   * for what they're making".
   *
   * These used to start at "no", which quietly made the checklist lie: the
   * engine ORed the buyer's "no" with its own rules, so a making-type that
   * needed a sound person got one while the button still read No, and there
   * was no way to say no and be listened to. Now the making-type sets the
   * default, "unsure" accepts it, and yes/no override it. Nothing is locked.
   */
  secondCamOperator: "unsure",
  secondCamGear: "unsure",
  audio: "unsure",
  drone: "unsure",
  graphics: "unsure",
  color: "unsure",
};

/* =================== CHECKLIST DEFAULTS =================== */

/**
 * What a judgment call defaults to when the buyer leaves it on "I don't know",
 * and the plain-English reason, so the tool can say which way it fell.
 *
 * `on` is a DEFAULT and never a verdict — buildScope applies yes/no over the
 * top of it, and the UI keeps all three buttons live.
 */
export type ChecklistDefault = { on: boolean; because: string };

export const archOf = (making: string): Archetype =>
  MAKING.find((m) => m.label === making)?.arch ?? "branded";

/**
 * The defaults for every checklist item, from the making-type and the answers
 * already given.
 *
 * This replaced `autoRules`, which returned `{ forced: true }` for three of
 * the items and drove a `disabled` attribute in the UI. The shape change is
 * the point: there is no longer anything for a component to lock, because
 * nothing here claims to be final.
 */
export function checklistDefaults(a: Answers): Record<ChecklistKey, ChecklistDefault> {
  const arch = archOf(a.making);
  const isAd = arch === "ad" || a.destination === "tv";
  const making = a.making.toLowerCase();

  const audioBecause =
    a.onCamera === "conversation"
      ? "a 2–3 person conversation needs one"
      : a.onCamera === "execs"
        ? "senior execs on camera raise the stakes"
        : a.destination === "tv"
          ? "it's airing as a TV or paid ad"
          : AUDIO_MAKING.has(a.making)
            ? `a ${making} always gets one`
            : "";

  const operator = SECOND_CAM_OPERATOR_MAKING.has(a.making);
  const gear = SECOND_CAM_GEAR_MAKING.has(a.making);

  return {
    secondCamOperator: {
      on: operator,
      because: operator
        ? `a ${making} happens once — a second pair of hands is how you don't miss it`
        : `a ${making} doesn't need a second person on camera`,
    },
    secondCamGear: {
      on: gear,
      because: gear
        ? `a ${making} cuts better with a second angle, and the shooter can run it`
        : `one camera covers a ${making}`,
    },
    audio: {
      on: audioBecause !== "",
      because: audioBecause || "one person to camera usually records fine into the camera",
    },
    drone: {
      on: false,
      because: "nothing you've told us needs an aerial",
    },
    graphics: {
      on: isAd || a.polish === "full",
      because: isAd
        ? "it's airing as a TV or paid ad"
        : a.polish === "full"
          ? "you asked for the fully-produced treatment"
          : "nothing here needs titles or animation",
    },
    color: {
      on: COLOR_MAKING.has(a.making),
      because: COLOR_MAKING.has(a.making)
        ? `a ${making} normally gets a grade`
        : `a ${making} normally doesn't get one`,
    },
  };
}

/**
 * The buyer's answer over the top of the default. The whole override rule, in
 * one line, used for every item so none of them can drift apart.
 */
export const resolveChecklist = (answer: TriState, fallback: boolean): boolean =>
  answer === "yes" ? true : answer === "no" ? false : fallback;

/* ========================= ENGINE ========================= */

export const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

/**
 * The ONE place that decides whether a budget was actually given.
 *
 * Blank, "0", "000" and "Not sure yet" are all the same answer — "I haven't
 * got a number for you" — and all three return null. That is not tidiness: a
 * literal 0 landing in the leads table reads as a real $0 budget and wrecks
 * the budget-against-estimate comparison the call list is sorted on. Nobody
 * commissioning a video has a budget of zero; they have no budget yet.
 *
 * Everything that asks "did they tell us a budget?" goes through this — the
 * estimate panel, the variant fitting, and the session capture — so the
 * screen, the number and the stored row can never disagree about it.
 */
export function parseBudget(input: string): number | null {
  const digits = input.replace(/[^0-9]/g, "");
  if (digits === "") return null;
  const value = Number(digits);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function buildScope(a: Answers, B: Baseline, variant: Variant): Scope {
  const r = Object.fromEntries(Object.entries(B).map(([k, o]) => [k, o.v])) as Record<
    BaselineKey,
    number
  >;

  // "Other / not sure" and anything unrecognized price as a branded piece,
  // which is the middle of the range rather than the cheap or dear end.
  const arch = archOf(a.making);
  const days = { couple: 1, one: 1, two: 2, three: 3 }[a.filming];

  /* Read off the same defaults table the checklist uses rather than recomputed
     here — this used to be a second copy of the audio rule, and a second copy
     is a rule that will eventually disagree with the first. */
  const def = checklistDefaults(a);
  const audioRequired = def.audio.on;
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

  /* ---- Colour grade ----
     Whole days, exactly like editing, off the SAME totalMin the edit is billed
     from — there is deliberately no second finished-minutes calculation here.
     Rounded UP with a one-day floor, so 1–15 min is one day, 16–30 is two.
     A grade covers more ground per day than an edit (15 min against 4), which
     is the only difference between the two sums. */
  const colorPerDay = Math.max(1, r.minsPerColorDay);
  const colorDays = Math.max(1, Math.ceil(totalMin / colorPerDay));
  const colorCost = colorDays * r.colorDay;

  // A line goes in if the answers force it OR the buyer asked for it on the
  // checklist. "I don't know" is deliberately not a yes — it leaves the line
  // out and shows up in the assumptions instead.
  /* EVERY judgment call resolves the same way: the making-type proposes, the
     buyer disposes. `resolveChecklist` is the only place that rule lives, so
     no item can quietly grow its own semantics — which is exactly how the old
     code ended up ORing the buyer's "no" with its own rules and ignoring them. */
  const wantsGraphics = resolveChecklist(a.graphics, def.graphics.on);
  const wantsColor = resolveChecklist(a.color, def.color.on);
  const wantsAudio = resolveChecklist(a.audio, def.audio.on);
  const wantsDrone = resolveChecklist(a.drone, def.drone.on);

  /* Second camera, in two flavours that must never both bill.

     The operator brings their own body, so gear-only is worth nothing on top
     of them — it is zeroed here rather than merely hidden in the UI, so the
     arithmetic is right even if a stale answer says yes.

     Premium adds an operator to a branded piece, which is the tier doing its
     job rather than the making-type deciding — but an explicit No still wins,
     or the override would be a lie in one tier out of three. */
  const wantsOperator =
    resolveChecklist(a.secondCamOperator, def.secondCamOperator.on) ||
    (variant === "premium" && arch === "branded" && a.secondCamOperator !== "no");
  const wantsGearCam = !wantsOperator && resolveChecklist(a.secondCamGear, def.secondCamGear.on);

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

  if (wantsOperator) {
    if (variant === "lean" && arch !== "event") {
      dropped.push(["Second camera + operator", r.secondCamOperator]);
    } else {
      lines.push({
        key: "cam2",
        amt: r.secondCamOperator,
        simple: "Second camera + operator — a second angle, shot live",
      });
    }
  } else if (wantsGearCam) {
    if (variant === "lean") dropped.push(["Second camera (gear only)", r.secondCamGearOnly]);
    else {
      lines.push({
        key: "cam2gear",
        amt: r.secondCamGearOnly,
        simple: "Second camera — extra body, no extra crew",
      });
    }
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
  if (wantsDrone) {
    if (variant === "lean") dropped.push(["Drone package", r.droneDay]);
    else lines.push({ key: "drone", amt: r.droneDay, simple: "Aerial — drone package" });
  }

  /* Post */
  lines.push({ key: "edit", amt: editCost, simple: editLabel });

  /* Colour is a flex line, handled by the same trim the second camera and the
     motion graphics use: lean drops it to reach its number and says so in
     `dropped`. The exception matches graphics — an ad keeps its grade in every
     tier, because an ungraded commercial is not a cheaper commercial, it is a
     commercial nobody will run. */
  if (wantsColor) {
    if (variant === "lean" && !isAd) dropped.push(["Color grade", colorCost]);
    else {
      lines.push({
        key: "color",
        amt: colorCost,
        simple: `Color grade — ${colorDays} day${colorDays > 1 ? "s" : ""}`,
      });
    }
  }
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
  if (!has("cam2") && !has("cam2gear")) {
    assumptions.push(say("This quote assumes one camera", a.secondCamOperator));
  }
  if (!has("drone")) {
    assumptions.push(say("This quote assumes no aerial or drone shots", a.drone));
  }
  if (!has("gfx")) {
    assumptions.push(say("This quote assumes no motion graphics or titles", a.graphics));
  }
  /* Colour gets its own sentence rather than going through say()'s "you
     weren't sure" flag: on this one question "I don't know" is not an
     unanswered question, it is the buyer letting us use the normal answer for
     what they're making — so the receipt should say which way that went and
     why. Only when the grade is genuinely out; a lean trim is reported by
     `dropped` instead. */
  if (!wantsColor) {
    assumptions.push(
      a.color === "no"
        ? "This quote assumes no color grade — you asked to skip it."
        : `This quote assumes no color grade, which is normal for a ${a.making.toLowerCase()}. Ask for one if the look matters.`
    );
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
