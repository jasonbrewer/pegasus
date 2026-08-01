#!/usr/bin/env node
// Loads data/us-zip-centroids.csv into the zip_codes table.
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the service
// role bypasses RLS, which is what lets this write to a table that is
// read-only for everyone else).
//
//   npm run seed:zips
//
// Idempotent: upserts on the zip primary key, so re-running is safe.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = join(__dirname, "..", "data", "us-zip-centroids.csv");
const BATCH_SIZE = 1000;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY\n" +
      "(both are in .env.example; the service role key is under Project Settings > API)."
  );
  process.exit(1);
}

// The CSV is machine-generated with no quoted fields or embedded commas,
// so a split on "," is sufficient and avoids a parser dependency.
function parseCsv(text) {
  const lines = text.trim().split("\n");
  const header = lines[0].split(",");
  const expected = ["zip", "lat", "lng", "city", "state"];
  if (header.join(",") !== expected.join(",")) {
    throw new Error(`Unexpected CSV header: ${header.join(",")}`);
  }

  return lines.slice(1).map((line, i) => {
    const [zip, lat, lng, city, state] = line.split(",");
    const row = {
      zip,
      lat: Number(lat),
      lng: Number(lng),
      city: city || null,
      state: state || null,
    };
    if (!/^\d{5}$/.test(row.zip)) {
      throw new Error(`Row ${i + 2}: invalid zip ${JSON.stringify(zip)}`);
    }
    if (!Number.isFinite(row.lat) || !Number.isFinite(row.lng)) {
      throw new Error(`Row ${i + 2}: invalid coordinates for ${zip}`);
    }
    return row;
  });
}

const rows = parseCsv(readFileSync(CSV_PATH, "utf8"));
console.log(`Parsed ${rows.length} ZIP centroids from ${CSV_PATH}`);

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let written = 0;
for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const batch = rows.slice(i, i + BATCH_SIZE);
  const { error } = await supabase.from("zip_codes").upsert(batch, { onConflict: "zip" });

  if (error) {
    console.error(`\nFailed on batch starting at row ${i}:`, error.message);
    process.exit(1);
  }

  written += batch.length;
  process.stdout.write(`\rSeeded ${written}/${rows.length}`);
}

const { count, error: countError } = await supabase
  .from("zip_codes")
  .select("*", { count: "exact", head: true });

if (countError) {
  console.error(`\nSeeded ${written} rows, but the verification count failed:`, countError.message);
  process.exit(1);
}

console.log(`\nDone. zip_codes now holds ${count} rows.`);
