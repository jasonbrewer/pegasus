/**
 * House baseline rate sheet — the numbers every client estimate is built from.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TO CHANGE A RATE: edit the number below, commit, redeploy. That's it.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * There is deliberately no database and no admin UI behind this in v1. The
 * rates move a few times a year, one person owns them, and putting them in
 * Postgres would mean a migration, a policy, and a write path — all of it for
 * a file that can be edited in ten seconds. Config file first; earn the table.
 *
 * `trigger` and `help` are the plain-English audit trail for each line: when it
 * appears in a client's quote, and what it covers. They are written for a
 * reader, not a developer — the deferred admin editor renders them verbatim.
 *
 * TODO(spec §7 — after Batch 6 merges, not before): move these to an isolated
 * `scoping_baseline` table (or a single JSONB row), JB-only write via the
 * existing admin security-definer pattern, read by the engine. That is the one
 * piece of this feature that needs a migration, which is exactly why it is not
 * in v1 — it must not stack on top of the security batch.
 */

export type BaselineGroup = "Filming" | "Sound" | "Post" | "Aerial" | "Rights" | "Travel";

export type BaselineItem = {
  /** The rate itself. Dollars, except where `unit` says otherwise. */
  v: number;
  group: BaselineGroup;
  label: string;
  /** When this line shows up in a client's quote, in plain English. */
  trigger: string;
  /** What the money covers. Empty when the label already says it. */
  help: string;
  /** Set on the one knob that isn't money, so an editor can label it. */
  unit?: "min";
};

export const BASELINE_GROUPS: BaselineGroup[] = [
  "Filming",
  "Sound",
  "Post",
  "Aerial",
  "Rights",
  "Travel",
];

export const BASELINE = {
  shooterDay: {
    v: 1400,
    group: "Filming",
    label: "Shooter + full kit (per day)",
    trigger: "Always — the core of any shoot day.",
    help: "Labor + package (camera, lens, lights, one mic).",
  },
  onebandHalf: {
    v: 800,
    group: "Filming",
    label: "Half day, one person",
    trigger: "Local · a couple hours · single person on camera.",
    help: "Straight to camera, no separate sound.",
  },
  quickHour: {
    v: 450,
    group: "Filming",
    label: "Quick local hour",
    trigger: "Under-budget fallback: local, ~1 hr, footage handed off, no editing.",
    help: "",
  },
  secondCamOperator: {
    v: 1400,
    group: "Filming",
    label: "Second camera + operator (per day)",
    trigger: "Anything that happens once — a conference, a gala, a sizzle cut from live coverage.",
    help: "A second person shooting, with their own kit. They bring the camera, so the gear-only line below never applies on top of this one.",
  },
  secondCamGearOnly: {
    v: 400,
    group: "Filming",
    label: "Second camera, gear only (per day)",
    trigger: "A staged, repeatable piece that wants a cutaway — an interview, a panel, an explainer.",
    help: "An extra body locked off on a tripod, run by the shooter already there. A second angle without a second wage.",
  },
  audioDay: {
    v: 1250,
    group: "Sound",
    label: "Sound specialist (per day)",
    trigger: "2–3 people in a scene · execs on camera · a live event · a TV/ad spot.",
    help: "A dedicated person, labor + gear. Not needed for a single interview.",
  },

  editDay: {
    v: 650,
    group: "Post",
    label: "Editing (per day)",
    trigger:
      "The core edit rate, and a day minimum — there is no sub-day edit. One day covers a set amount of finished video (below).",
    help: "Rough → fine → final cut, one flat rate.",
  },
  minsPerEditDay: {
    v: 4,
    group: "Post",
    label: "Finished minutes per edit day",
    trigger: "The billing unit. Total finished video ÷ this = edit days.",
    help: "4 finished minutes ≈ one edit day. Four 1-min cuts and one 4-min cut are the same cutting time.",
    unit: "min",
  },
  deliverableFee: {
    v: 40,
    group: "Post",
    label: "Per extra deliverable",
    trigger: "Each cut beyond the first — its own export, aspect ratio, top & tail.",
    help: "Eight 30-sec cuts = same cutting time as one 4-min video, but seven extra handling charges.",
  },
  changesHour: {
    v: 85,
    group: "Post",
    label: "Changes after final (per hour)",
    trigger: "Only if the client keeps revising past final cut.",
    help: "Protects against the endless edit — the client always knows the price of a finished product.",
  },
  colorDay: {
    v: 600,
    group: "Post",
    label: "Color grade (per day)",
    trigger:
      "Pieces where the look is part of the product — brand, product, promo, sizzle, ads, and a founder interview. Off elsewhere unless the client asks for it.",
    help: "A colourist day, billed like an edit day. There is no sub-day grade.",
  },
  minsPerColorDay: {
    v: 15,
    group: "Post",
    label: "Finished minutes per color day",
    trigger: "The billing unit for grading. Total finished video ÷ this = color days.",
    help: "A grade moves faster than an edit — 15 finished minutes a day against the edit's 4.",
    unit: "min",
  },
  graphicsDay: {
    v: 650,
    group: "Post",
    label: "Motion graphics (per day)",
    trigger: "Fully-produced pieces and ads with titles / animation.",
    help: "",
  },

  droneDay: {
    v: 400,
    group: "Aerial",
    label: "Drone package (per day)",
    trigger: "Client asks for aerial shots.",
    help: "Gear line — no extra crew.",
  },
  licensing: {
    v: 1500,
    group: "Rights",
    label: "Music & broadcast licensing",
    trigger: "Anything airing as TV or a paid ad — needs licensed music + usage rights.",
    help: "The cost most people never budget for. A website or social video doesn't carry it.",
  },

  driveAllow: {
    v: 150,
    group: "Travel",
    label: "Regional drive allowance",
    trigger: "Bringing someone in from 1–2.5 hrs away.",
    help: "Mileage + drive time.",
  },
  travelDay: {
    v: 500,
    group: "Travel",
    label: "Travel day (labor)",
    trigger: "Over 2.5 hrs each way — that's a travel day, portal to portal.",
    help: "",
  },
  hotelNight: {
    v: 200,
    group: "Travel",
    label: "Hotel (per night)",
    trigger: "Overnight shoots, or long-haul travel.",
    help: "",
  },
  perDiem: {
    v: 60,
    group: "Travel",
    label: "Per diem (per day)",
    trigger: "Any overnight travel.",
    help: "",
  },
  flightLeg: {
    v: 500,
    group: "Travel",
    label: "Flight (each way)",
    trigger: "Flying a specialist in. Includes checked gear / excess bags.",
    help: "Roughly doubles a small budget — worth knowing before you fall for an out-of-town reel.",
  },
} as const satisfies Record<string, BaselineItem>;

export type BaselineKey = keyof typeof BASELINE;
export type Baseline = Record<BaselineKey, BaselineItem>;
