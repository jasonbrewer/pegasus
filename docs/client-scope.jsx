import { useState, useMemo } from "react";

/* ============================================================
   CLIENT SCOPE — Production Circles working prototype (v2)
   A fluency machine, not just a quote machine. Plain questions
   a non-producer can honestly answer; the tool surfaces the
   invisible costs (travel, licensing, deliverable volume) as
   owned decisions, each one a teaching moment.

   Numbers come from a HOUSE BASELINE rate sheet JB controls
   (the "Baseline rates" tab). Rules are baked in but shown in
   plain English next to every line, so they can be audited.

   v2 changes: $-prefix no longer overlaps digits · 21 "what
   are you making" options → 5 archetypes · b-roll+interview
   mix · darker/legible body text · car-wash polish labels ·
   deliverables billing (finished-minutes ÷ edit-day + per-
   extra-cut overhead), with two new editable knobs.
   ============================================================ */

const FONT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,900&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
:root{
  --paper:#EFEBE4; --card:#FBFAF7; --ink:#20211C; --ink-soft:#4A4A42;
  --rule:#DAD5C9; --rule-dark:#B4AE9E;
  --sun:#E86A2C; --sun-soft:#F7DFCB;
  --teach:#245C52; --teach-soft:#DCEDE9;
  --flag:#9E2B25; --flag-soft:#F3E0DC;
  --focus:#3A5A8C;
}
.cs-root{font-family:'Inter',system-ui,sans-serif;background:var(--paper);color:var(--ink);min-height:100vh;}
.cs-serif{font-family:'Fraunces',Georgia,serif;}
.cs-mono{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;}
.cs-eyebrow{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--ink-soft);}
.cs-body{color:var(--ink);}
.cs-muted{color:var(--ink-soft);}
.cs-underline{background:linear-gradient(180deg,transparent 62%,var(--sun-soft) 62%);}
.cs-opt{border:1.5px solid var(--rule-dark);background:var(--card);color:var(--ink);border-radius:999px;padding:9px 15px;font-size:14px;font-weight:500;cursor:pointer;transition:all .12s;text-align:left;}
.cs-opt:hover{border-color:var(--ink);}
.cs-opt:focus-visible{outline:2.5px solid var(--focus);outline-offset:2px;}
.cs-opt[data-on="true"]{border-color:var(--sun);background:var(--sun);color:#fff;font-weight:600;}
.cs-optbig{border:1.5px solid var(--rule-dark);background:var(--card);color:var(--ink);border-radius:12px;padding:12px 15px;cursor:pointer;transition:all .12s;text-align:left;display:block;width:100%;}
.cs-optbig:hover{border-color:var(--ink);}
.cs-optbig:focus-visible{outline:2.5px solid var(--focus);outline-offset:2px;}
.cs-optbig[data-on="true"]{border-color:var(--sun);box-shadow:inset 0 0 0 1.5px var(--sun);background:var(--sun-soft);}
.cs-line{display:flex;align-items:baseline;gap:10px;padding:10px 0;border-bottom:1px solid var(--rule);}
.cs-line:last-child{border-bottom:none;}
.cs-dots{flex:1;border-bottom:1.5px dotted var(--rule-dark);transform:translateY(-3px);min-width:14px;}
.cs-card{background:var(--card);border:1px solid var(--rule-dark);border-radius:14px;box-shadow:0 1px 0 var(--rule),0 18px 40px -28px rgba(32,33,28,.5);}
.cs-tab{font-family:'IBM Plex Mono',monospace;font-size:12px;letter-spacing:.12em;text-transform:uppercase;padding:11px 18px;border:none;border-bottom:2.5px solid transparent;cursor:pointer;background:none;color:var(--ink-soft);}
.cs-tab[data-on="true"]{color:var(--ink);border-bottom-color:var(--sun);}
.cs-tab:focus-visible{outline:2.5px solid var(--focus);outline-offset:2px;}
/* money input: prefix and field are siblings in a flex wrapper — never overlap */
.cs-money{display:flex;align-items:stretch;border:1.5px solid var(--rule-dark);border-radius:10px;background:var(--card);overflow:hidden;max-width:170px;}
.cs-money:focus-within{outline:2.5px solid var(--focus);outline-offset:1px;border-color:var(--ink);}
.cs-money .cs-pfx{font-family:'IBM Plex Mono',monospace;font-size:15px;color:var(--ink-soft);padding:10px 4px 10px 12px;user-select:none;}
.cs-money input{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;border:none;outline:none;background:transparent;padding:10px 12px 10px 2px;font-size:16px;width:100%;color:var(--ink);}
.cs-chip{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:6px 11px;border:1.5px solid var(--rule-dark);border-radius:999px;background:var(--card);cursor:pointer;color:var(--ink);}
.cs-chip[data-on="true"]{background:var(--ink);color:#fff;border-color:var(--ink);}
.cs-chip:focus-visible{outline:2.5px solid var(--focus);outline-offset:2px;}
.cs-teach{background:var(--teach-soft);border-left:3px solid var(--teach);border-radius:0 8px 8px 0;padding:9px 12px;color:var(--ink);font-size:13px;line-height:1.45;}
@media (prefers-reduced-motion: reduce){ *{transition:none !important;} }
`;

/* Money input with a real prefix that can't collide with digits */
function MoneyInput({ value, onChange, ariaLabel, placeholder }) {
  return (
    <div className="cs-money">
      <span className="cs-pfx" aria-hidden="true">$</span>
      <input inputMode="numeric" aria-label={ariaLabel} placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))} />
    </div>
  );
}

/* ================= HOUSE BASELINE RATE SHEET ================= */

const BASELINE_DEFAULTS = {
  shooterDay:   { v: 1400, group: "Filming",   label: "Shooter + full kit (per day)", trigger: "Always — the core of any shoot day.", help: "Labor + package (camera, lens, lights, one mic)." },
  onebandHalf:  { v: 800,  group: "Filming",   label: "Half day, one person", trigger: "Local · a couple hours · single person on camera.", help: "Straight to camera, no separate sound." },
  quickHour:    { v: 450,  group: "Filming",   label: "Quick local hour", trigger: "Under-budget fallback: local, ~1 hr, footage handed off, no editing.", help: "" },
  secondCam:    { v: 1400, group: "Filming",   label: "Second camera (per day)", trigger: "Event coverage, or a produced piece that needs two angles.", help: "Second operator + kit." },
  audioDay:     { v: 1250, group: "Sound",     label: "Sound specialist (per day)", trigger: "2–3 people in a scene · execs on camera · a live event · a TV/ad spot.", help: "A dedicated person, labor + gear. Not needed for a single interview." },

  editDay:      { v: 650,  group: "Post",      label: "Editing (per day)", trigger: "The core edit rate. One day covers a set amount of finished video (below).", help: "Rough → fine → final cut, one flat rate." },
  minsPerEditDay:{ v: 4,   group: "Post",      label: "Finished minutes per edit day", trigger: "The billing unit. Total finished video ÷ this = edit days.", help: "4 finished minutes ≈ one edit day. Four 1-min cuts and one 4-min cut are the same cutting time.", unit: "min" },
  deliverableFee:{ v: 40,  group: "Post",      label: "Per extra deliverable", trigger: "Each cut beyond the first — its own export, aspect ratio, top & tail.", help: "Eight 30-sec cuts = same cutting time as one 4-min video, but seven extra handling charges." },
  editHour:     { v: 90,   group: "Post",      label: "Editing (per hour)", trigger: "Small single cuts under one edit day bill hourly instead.", help: "For the John's-plumbing 40-second clip." },
  changesHour:  { v: 85,   group: "Post",      label: "Changes after final (per hour)", trigger: "Only if the client keeps revising past final cut.", help: "Protects against the endless edit — the client always knows the price of a finished product." },
  colorHour:    { v: 75,   group: "Post",      label: "Color finishing (per hour)", trigger: "Always — hours scale with total length & polish.", help: "Separate line. A short clip won't take a day." },
  graphicsDay:  { v: 650,  group: "Post",      label: "Motion graphics (per day)", trigger: "Fully-produced pieces and ads with titles / animation.", help: "" },

  droneDay:     { v: 400,  group: "Aerial",    label: "Drone package (per day)", trigger: "Client asks for aerial shots.", help: "Gear line — no extra crew." },
  licensing:    { v: 1500, group: "Rights",    label: "Music & broadcast licensing", trigger: "Anything airing as TV or a paid ad — needs licensed music + usage rights.", help: "The cost most people never budget for. A website or social video doesn't carry it." },

  driveAllow:   { v: 150,  group: "Travel",    label: "Regional drive allowance", trigger: "Bringing someone in from 1–2.5 hrs away.", help: "Mileage + drive time." },
  travelDay:    { v: 500,  group: "Travel",    label: "Travel day (labor)", trigger: "Over 2.5 hrs each way — that's a travel day, portal to portal.", help: "" },
  hotelNight:   { v: 200,  group: "Travel",    label: "Hotel (per night)", trigger: "Overnight shoots, or long-haul travel.", help: "" },
  perDiem:      { v: 60,   group: "Travel",    label: "Per diem (per day)", trigger: "Any overnight travel.", help: "" },
  flightLeg:    { v: 500,  group: "Travel",    label: "Flight (each way)", trigger: "Flying a specialist in. Includes checked gear / excess bags.", help: "Roughly doubles a small budget — worth knowing before you fall for an out-of-town reel." },
};

const BASELINE_GROUPS = ["Filming", "Sound", "Post", "Aerial", "Rights", "Travel"];

/* ================= CLIENT QUESTIONS ================= */

/* 21 recognizable options → 5 pricing archetypes. Client finds
   their word; the engine knows what it prices like. */
const MAKING = [
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

const POLISH = [
  { key: "quick",    title: "Simple cut",     note: "Fast, clean edit — the social-feed look. Gets the job done." },
  { key: "standard", title: "Polished",       note: "The standard nice version most brand videos want." },
  { key: "full",     title: "Fully produced", note: "Full color, motion graphics, the whole treatment." },
];

const QUESTIONS = [
  { key: "onCamera", label: "Who's on camera?", opts: [
    ["one", "One person at a time"],
    ["mix", "A mix of interviews and b-roll"],
    ["conversation", "A conversation — 2–3 people"],
    ["execs", "Senior execs / high-stakes"],
    ["broll", "Mostly b-roll, no interviews"],
    ["crowd", "A room / live audience"],
  ]},
  { key: "destination", label: "Where will people watch it?", opts: [
    ["socialfeed", "Social feeds"],
    ["website", "Our website"],
    ["bigscreen", "A screen at an event"],
    ["tv", "TV or a paid ad"],
  ]},
  { key: "filming", label: "Roughly how much filming?", opts: [
    ["couple", "A couple of hours, one spot"],
    ["one", "About a day"],
    ["two", "Two days"],
    ["three", "Three days"],
  ]},
  { key: "drone", label: "Any aerial / drone shots?", opts: [
    ["yes", "Yes"],
    ["no", "No"],
  ]},
  { key: "hire", label: "Who's shooting it?", opts: [
    ["local", "Someone local"],
    ["import", "Open to bringing someone in"],
  ]},
  { key: "distance", label: "How far is the shoot from the crew?", trigger: "hire", opts: [
    ["near", "Under an hour"],
    ["drive1", "A 1–2.5 hr drive"],
    ["drive2", "A 2.5–4 hr drive"],
    ["flight", "A flight away"],
  ]},
];

/* Deliverables — number of cuts × length each. Values in minutes. */
const COUNT_OPTS = [["1", "Just one"], ["2", "A couple (2–3)"], ["4", "A handful (4–6)"], ["8", "A whole set (8+)"]];
const LEN_OPTS = [["0.5", "About 30 seconds"], ["1", "Around a minute"], ["3", "A few minutes"], ["6", "5 minutes or more"]];
const COUNT_N = { "1": 1, "2": 3, "4": 5, "8": 9 };  // representative counts for overhead math

/* The only 'what are you making' choices that force a sound person.
   Everything else is genuinely a judgment call — see the advisory in
   every quote. onCamera 'conversation'/'execs' and a TV/paid-ad
   destination also trigger it. */
const AUDIO_MAKING = new Set([
  "Founder / CEO interview",
  "Recruitment / hiring",
  "Case study",
  "Safety training",
  "TV commercial",
]);

const DEFAULTS = {
  making: "Testimonial", onCamera: "one", destination: "website",
  filming: "couple", drone: "no", hire: "local", distance: "near",
  polish: "standard", count: "1", each: "3",
};

/* ========================= ENGINE ========================= */

const fmt = (n) => "$" + Math.round(n).toLocaleString("en-US");

function buildScope(a, B, variant) {
  const r = Object.fromEntries(Object.entries(B).map(([k, o]) => [k, o.v]));
  const arch = (MAKING.find((m) => m.label === a.making) || MAKING.find((m) => m.arch === a.making) || {}).arch
    || a.making;  // tolerate either label or arch stored
  const days = { couple: 1, one: 1, two: 2, three: 3 }[a.filming];

  const audioRequired =
    ["conversation", "execs"].includes(a.onCamera) ||
    a.destination === "tv" ||
    AUDIO_MAKING.has(a.making);
  const isAd = arch === "ad" || a.destination === "tv";
  const halfEligible =
    a.filming === "couple" && a.hire === "local" && a.distance === "near" &&
    a.onCamera === "one" && arch === "talkinghead" && variant !== "premium";

  const polish = variant === "lean" ? "quick" : variant === "premium" ? "full"
    : (isAd ? "full" : a.polish);

  /* ---- Deliverables billing ---- */
  const eachMin = Number(a.each);
  const count = COUNT_N[a.count] || 1;
  const totalMin = +(eachMin * count).toFixed(2);
  const perDay = Math.max(1, r.minsPerEditDay);
  const singleSmall = count === 1 && totalMin < perDay;

  let editCost, editLabel;
  if (singleSmall) {
    const hours = Math.max(2, Math.round((totalMin / perDay) * 8) + (polish === "full" ? 1 : 0));
    editCost = hours * r.editHour;
    editLabel = `Editing — ${hours} hrs (one short cut)`;
  } else {
    let editDays = Math.ceil(totalMin / perDay);
    if (polish === "full") editDays += 1;      // the works finesses longer
    editDays = Math.max(1, editDays);
    const base = editDays * r.editDay;
    const extra = Math.max(0, count - 1) * r.deliverableFee;
    editCost = base + extra;
    editLabel = extra > 0
      ? `Editing — ${editDays} day${editDays > 1 ? "s" : ""} + ${count - 1} extra cut${count - 1 > 1 ? "s" : ""}`
      : `Editing to final cut — ${editDays} day${editDays > 1 ? "s" : ""}`;
  }

  const colorHours =
    ({ quick: 2, standard: 4, full: 8 }[polish]) + (totalMin >= 10 ? 4 : totalMin >= 5 ? 2 : 0);
  const wantsGraphics = polish === "full" || isAd;
  const wantsSecondCam = arch === "event" || (variant === "premium" && arch === "branded");

  const lines = [];
  const notes = [];
  const dropped = [];

  /* Filming */
  if (halfEligible) lines.push({ key: "cam", amt: r.onebandHalf, simple: "Filming — half day, one shooter with full kit" });
  else lines.push({ key: "cam", amt: days * r.shooterDay, simple: `Filming — ${days} day${days > 1 ? "s" : ""}, shooter + full kit` });

  if (wantsSecondCam) {
    if (variant === "lean" && arch !== "event") dropped.push(["Second camera", r.secondCam]);
    else lines.push({ key: "cam2", amt: r.secondCam, simple: "Second camera — a second angle" });
  }

  /* Sound — a starting guess only; the advisory in the quote does the honest work */
  if (audioRequired) {
    lines.push({ key: "audio", amt: days * r.audioDay, simple: `Sound specialist — ${days} day${days > 1 ? "s" : ""}` });
  }

  /* Aerial */
  if (a.drone === "yes") {
    if (variant === "lean") dropped.push(["Drone package", r.droneDay]);
    else lines.push({ key: "drone", amt: r.droneDay, simple: "Aerial — drone package" });
  }

  /* Post */
  lines.push({ key: "edit", amt: editCost, simple: editLabel });
  lines.push({ key: "color", amt: colorHours * r.colorHour, simple: `Color finishing — ${colorHours} hrs` });
  if (wantsGraphics) {
    const gd = totalMin > 4 || count >= 5 ? 2 : 1;
    if (variant === "lean" && !isAd) dropped.push(["Motion graphics", gd * r.graphicsDay]);
    else lines.push({ key: "gfx", amt: gd * r.graphicsDay, simple: `Motion graphics — ${gd} day${gd > 1 ? "s" : ""}` });
  }

  /* Deliverables teaching note */
  if (count > 1)
    notes.push(`${count} separate cuts of about ${eachMin < 1 ? Math.round(eachMin * 60) + " sec" : eachMin + " min"} each is ~${totalMin} finished minutes — billed by cutting time, plus a small handling charge per extra cut for the separate exports and aspect ratios.`);

  /* Rights */
  if (isAd) {
    lines.push({ key: "lic", amt: r.licensing, simple: "Music & broadcast licensing" });
    notes.push("Anything airing as a TV or paid ad needs licensed music and usage rights — a real cost most people don't budget for. A website or social video doesn't carry it.");
  }

  /* Travel — surfaced as an owned decision */
  if (a.hire === "local" || a.distance === "near") {
    notes.push("Hiring local keeps travel off the sheet entirely. Open up to bringing someone in and you'd add travel days, maybe a hotel.");
  } else if (a.distance === "drive1") {
    lines.push({ key: "travel", amt: r.driveAllow, simple: "Travel — regional drive" });
  } else if (a.distance === "drive2") {
    const amt = r.travelDay + r.hotelNight * days + r.perDiem * (days + 1) + r.driveAllow;
    lines.push({ key: "travel", amt, simple: "Travel — overnight (travel day, hotel, per diem)" });
    notes.push("Over 2.5 hours each way counts as a travel day. A same-day return runs into overtime — usually the hotel is cheaper.");
  } else if (a.distance === "flight") {
    const amt = 2 * r.flightLeg + 2 * r.travelDay + r.hotelNight * (days + 1) + r.perDiem * (days + 2);
    lines.push({ key: "travel", amt, simple: "Travel — flights, travel days, hotel, per diem" });
    notes.push("Flying a specialist in roughly doubles a small budget. Worth knowing before you fall for an out-of-town reel — a local hire may get you 90% of the result for far less.");
  }

  const total = lines.reduce((s, l) => s + l.amt, 0);
  return { lines, notes, dropped, total, variant, isAd, audioRequired, totalMin, count };
}

function useScopes(a, baseline) {
  return useMemo(() => ({
    lean: buildScope(a, baseline, "lean"),
    recommended: buildScope(a, baseline, "recommended"),
    premium: buildScope(a, baseline, "premium"),
  }), [a, baseline]);
}

/* =========================== UI =========================== */

function MakingPicker({ value, onPick }) {
  return (
    <fieldset className="mb-7">
      <legend className="cs-eyebrow mb-2">What are you making?</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="What are you making">
        {MAKING.map((m) => (
          <button key={m.label} type="button" role="radio" aria-checked={value === m.label}
            className="cs-opt" data-on={value === m.label} onClick={() => onPick("making", m.label)}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="text-sm mt-2 cs-muted">Pick the closest — most of these film about the same way, so the price won't swing much.</p>
    </fieldset>
  );
}

function OptionGroup({ q, value, onPick }) {
  return (
    <fieldset className="mb-7">
      <legend className="cs-eyebrow mb-2">{q.label}</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={q.label}>
        {q.opts.map(([v, label]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v}
            className="cs-opt" data-on={value === v} onClick={() => onPick(q.key, v)}>
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function PolishPicker({ value, onPick }) {
  return (
    <fieldset className="mb-7">
      <legend className="cs-eyebrow mb-2">How finished should it feel?</legend>
      <p className="text-sm mb-2 cs-muted">Roughly: further down means more editing polish, and more cost. Pick the feel you're after.</p>
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="How finished should it feel">
        {POLISH.map((p) => (
          <button key={p.key} type="button" role="radio" aria-checked={value === p.key}
            className="cs-optbig" data-on={value === p.key} onClick={() => onPick("polish", p.key)}>
            <span className="block font-semibold text-sm mb-1">{p.title}</span>
            <span className="block text-xs cs-muted" style={{ lineHeight: 1.4 }}>{p.note}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Deliverables({ answers, onPick }) {
  return (
    <fieldset className="mb-7">
      <legend className="cs-eyebrow mb-2">What are you getting out of it?</legend>
      <p className="text-sm mb-3 cs-muted">One shoot can make many videos. Editing is billed by total finished length, plus a little per extra cut.</p>
      <div className="mb-4">
        <span className="text-sm font-semibold block mb-1">How many videos?</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How many videos">
          {COUNT_OPTS.map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={answers.count === v}
              className="cs-opt" data-on={answers.count === v} onClick={() => onPick("count", v)}>{label}</button>
          ))}
        </div>
      </div>
      <div>
        <span className="text-sm font-semibold block mb-1">How long is each?</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How long is each">
          {LEN_OPTS.map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={answers.each === v}
              className="cs-opt" data-on={answers.each === v} onClick={() => onPick("each", v)}>{label}</button>
          ))}
        </div>
      </div>
    </fieldset>
  );
}

function Estimate({ scopes, budget, baseline, answers }) {
  const [pick, setPick] = useState(null);
  const [copied, setCopied] = useState(false);
  const order = ["lean", "recommended", "premium"];
  const b = budget === "" ? null : Number(budget);
  const has = b != null && !Number.isNaN(b);

  let fitted = null;
  if (has) for (const k of [...order].reverse()) if (scopes[k].total <= b) { fitted = k; break; }
  const underFloor = has && fitted === null;
  const active = pick || fitted || "recommended";
  const scope = scopes[active];
  const next = order[order.indexOf(active) + 1];

  const quickEligible =
    answers.filming === "couple" && answers.hire === "local" &&
    answers.distance === "near" && ["one", "broll"].includes(answers.onCamera);

  const copyIt = async () => {
    const body = scope.lines.map((l) => `  ${l.simple} — ${fmt(l.amt)}`).join("\n");
    const text = `SCOPE — ${answers.making} (${active})\n${body}\n  TOTAL — ${fmt(scope.total)}\n\nIncludes rough, fine, and final cut. Later changes: ${fmt(baseline.changesHour.v)}/hr.`;
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch (e) {}
  };

  return (
    <div className="cs-card p-5 md:p-6">
      <div className="flex items-baseline justify-between mb-3">
        <span className="cs-eyebrow">Your estimate</span>
        <span className="cs-eyebrow">Baseline rates</span>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap" role="tablist" aria-label="Scope level">
        {order.map((k) => (
          <button key={k} className="cs-chip" data-on={active === k} role="tab"
            aria-selected={active === k} onClick={() => setPick(k)}>
            {k} · {fmt(scopes[k].total)}
          </button>
        ))}
      </div>

      {has && !underFloor && (
        <p className="text-base mb-4">
          <span className="cs-underline cs-serif" style={{ fontWeight: 600 }}>
            {fmt(b)} gets you the {active} version.
          </span>
        </p>
      )}

      {underFloor && (
        <div className="p-4 mb-4" style={{ background: "var(--flag-soft)", border: "1.5px solid var(--flag)", borderRadius: 10 }}>
          <p className="text-sm font-semibold mb-1" style={{ color: "var(--flag)" }}>
            That budget is short for what you're describing.
          </p>
          <p className="text-sm mb-2 cs-body">
            The leanest honest version is <span className="cs-mono font-semibold">{fmt(scopes.lean.total)}</span> — and nothing in it is padding.
          </p>
          {quickEligible && (
            <p className="text-sm cs-body">
              If you just need footage: a quick local hour, handed off raw, no editing —
              <span className="cs-mono font-semibold"> {fmt(baseline.quickHour.v)}</span>.
            </p>
          )}
        </div>
      )}

      <div className="mb-3">
        {scope.lines.map((l) => (
          <div key={l.key} className="cs-line">
            <span className="text-sm cs-body">{l.simple}</span>
            <span className="cs-dots" />
            <span className="cs-mono text-sm font-semibold">{fmt(l.amt)}</span>
          </div>
        ))}
      </div>

      <div className="flex items-baseline gap-3 pt-2" style={{ borderTop: "2px solid var(--ink)" }}>
        <span className="cs-eyebrow">Estimate</span>
        <span className="cs-dots" />
        <span className="cs-mono text-2xl font-semibold cs-serif">{fmt(scope.total)}</span>
      </div>

      {next && (
        <p className="text-sm mt-3 cs-muted">
          +{fmt(scopes[next].total - scope.total)} → <b className="cs-body">{next}</b>
          {next === "premium" ? ": fully produced — full polish, graphics, a second angle." : ": the full scope as described."}
        </p>
      )}

      {scope.dropped.length > 0 && (
        <p className="text-sm mt-2 cs-muted">
          Trimmed to fit lean: {scope.dropped.map(([l, a]) => `${l} (−${fmt(a)})`).join(", ")}.
        </p>
      )}

      {scope.notes.length > 0 && (
        <div className="mt-4 space-y-2">
          {scope.notes.map((n, i) => <p key={i} className="cs-teach">{n}</p>)}
        </div>
      )}

      <p className="cs-teach mt-4">
        Sound is genuinely hard to predict — too many variables to pin down here. Ask your production professional whether this shoot needs a dedicated audio person{scope.audioRequired ? " (we've included one as a starting point)" : ""}.
      </p>

      <p className="text-sm mt-4 cs-muted">
        Includes rough, fine, and final cut. Changes after that run {fmt(baseline.changesHour.v)}/hr — so you always know the price of a finished video before anyone opens an editor.
      </p>

      <div className="flex gap-2 mt-4">
        <button className="cs-chip" onClick={copyIt}>{copied ? "Copied ✓" : "Copy this scope"}</button>
      </div>
      <p className="text-sm mt-3 cs-muted">
        An honest ballpark from typical regional rates. A specific pro may quote their own number — this gets you in the room already knowing the shape of the job.
      </p>
    </div>
  );
}

function ScopeTab({ answers, setAnswers, budget, setBudget, baseline }) {
  const scopes = useScopes(answers, baseline);
  const onPick = (k, v) => setAnswers((a) => ({ ...a, [k]: v }));
  return (
    <div className="grid gap-8 lg:grid-cols-2 items-start">
      <div>
        <fieldset className="mb-8">
          <legend className="cs-eyebrow mb-2">What's your budget? (optional)</legend>
          <div className="flex items-center gap-3 flex-wrap">
            <MoneyInput value={budget} onChange={setBudget} ariaLabel="Budget in dollars" placeholder="e.g. 3500" />
            {budget !== "" && <button className="cs-chip" onClick={() => setBudget("")}>Clear</button>}
          </div>
          <p className="text-sm mt-2 cs-muted">Tell us what you have and we'll fit the most video to it. Or leave it blank and compare levels.</p>
        </fieldset>

        <MakingPicker value={answers.making} onPick={onPick} />
        {QUESTIONS.slice(0, 2).map((q) => <OptionGroup key={q.key} q={q} value={answers[q.key]} onPick={onPick} />)}
        <PolishPicker value={answers.polish} onPick={onPick} />
        <Deliverables answers={answers} onPick={onPick} />
        {QUESTIONS.slice(2).map((q) => {
          if (q.trigger === "hire" && answers.hire !== "import") return null;
          return <OptionGroup key={q.key} q={q} value={answers[q.key]} onPick={onPick} />;
        })}
      </div>
      <div className="lg:sticky lg:top-6">
        <Estimate scopes={scopes} budget={budget} baseline={baseline} answers={answers} />
      </div>
    </div>
  );
}

function BaselineTab({ baseline, setBaseline }) {
  const reset = () => setBaseline(JSON.parse(JSON.stringify(BASELINE_DEFAULTS)));
  return (
    <div className="max-w-3xl">
      <p className="text-base mb-2 cs-body">
        The house baseline the client estimate reads from. You own these numbers — change them whenever the market moves.
      </p>
      <p className="text-sm mb-6 cs-muted">
        Each line shows the plain-English rule for when it appears in a client's quote, so you can audit why the estimate came out the way it did. Adding new line items and scope variables (a PA, a teleprompter, extra locations) is how this grows — tell me the rule and I'll wire it in.
      </p>
      {BASELINE_GROUPS.map((g) => (
        <section key={g} className="mb-8">
          <h3 className="cs-eyebrow mb-3 pb-1" style={{ borderBottom: "2px solid var(--ink)" }}>{g}</h3>
          <div className="space-y-5">
            {Object.entries(baseline).filter(([, o]) => o.group === g).map(([k, o]) => (
              <div key={k} className="grid gap-3 sm:grid-cols-[190px_1fr] items-start">
                <label className="block">
                  <span className="text-sm font-semibold block mb-1 cs-body">{o.label}</span>
                  {o.unit === "min" ? (
                    <div className="cs-money" style={{ maxWidth: 120 }}>
                      <input inputMode="numeric" aria-label={o.label} value={o.v}
                        onChange={(e) => { const v = Number(e.target.value.replace(/[^0-9]/g, "") || 0); setBaseline((r) => ({ ...r, [k]: { ...r[k], v } })); }} />
                      <span className="cs-pfx" aria-hidden="true" style={{ padding: "10px 12px 10px 4px" }}>min</span>
                    </div>
                  ) : (
                    <MoneyInput value={o.v} ariaLabel={o.label}
                      onChange={(val) => setBaseline((r) => ({ ...r, [k]: { ...r[k], v: Number(val || 0) } }))} />
                  )}
                </label>
                <div className="pt-1">
                  <p className="cs-eyebrow mb-1" style={{ textTransform: "none", letterSpacing: ".04em" }}>Appears when</p>
                  <p className="text-sm cs-body">{o.trigger}</p>
                  {o.help && <p className="text-sm mt-1 cs-muted">{o.help}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      <button className="cs-chip" onClick={reset}>Reset to defaults</button>
    </div>
  );
}

export default function ClientScope() {
  const [tab, setTab] = useState("scope");
  const [answers, setAnswers] = useState(DEFAULTS);
  const [budget, setBudget] = useState("");
  const [baseline, setBaseline] = useState(() => JSON.parse(JSON.stringify(BASELINE_DEFAULTS)));

  return (
    <div className="cs-root">
      <style>{FONT_CSS}</style>
      <div className="max-w-6xl mx-auto px-5 py-8 md:py-12">
        <header className="mb-8">
          <p className="cs-eyebrow mb-3">Production Circles — client side · prototype</p>
          <h1 className="cs-serif" style={{ fontWeight: 900, fontSize: "clamp(2.2rem,6vw,4rem)", lineHeight: 1.02, letterSpacing: "-.02em" }}>
            Not sure what a video<br />should cost? <span className="cs-underline">Start here.</span>
          </h1>
          <p className="text-base mt-4 max-w-xl cs-body">
            Answer a few plain questions — no production jargon. You'll get an honest estimate, and you'll learn where the real costs hide, so you walk into any quote already knowing the shape of the job.
          </p>
        </header>

        <nav className="flex mb-8 gap-1" style={{ borderBottom: "1px solid var(--rule)" }} role="tablist" aria-label="Sections">
          <button className="cs-tab" data-on={tab === "scope"} role="tab" aria-selected={tab === "scope"} onClick={() => setTab("scope")}>Scope a job</button>
          <button className="cs-tab" data-on={tab === "baseline"} role="tab" aria-selected={tab === "baseline"} onClick={() => setTab("baseline")}>Baseline rates</button>
        </nav>

        {tab === "scope"
          ? <ScopeTab answers={answers} setAnswers={setAnswers} budget={budget} setBudget={setBudget} baseline={baseline} />
          : <BaselineTab baseline={baseline} setBaseline={setBaseline} />}

        <footer className="mt-12 pt-4" style={{ borderTop: "1px solid var(--rule)" }}>
          <p className="cs-eyebrow">Prototype · you control the baseline numbers · rules are baked in but shown · nothing saves yet</p>
        </footer>
      </div>
    </div>
  );
}
