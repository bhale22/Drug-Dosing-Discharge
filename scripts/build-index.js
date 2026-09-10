#!/usr/bin/env node
/*
 * Builds conditions/index.json from every conditions/<id>.json file.
 *
 * The home page reads that index to draw its cards, so a condition only shows
 * up once this has run. The GitHub Action calls it on every push that touches
 * conditions/**.json; you can also run it by hand:  node scripts/build-index.js
 *
 * A condition file that will not parse is reported in "errors" rather than
 * failing the build, so one bad upload cannot take the whole index down.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "conditions");
const OUT = path.join(DIR, "index.json");

/* Pages that render themselves instead of going through app.html. Anything not
   listed here is opened as app.html?c=<id>. */
const CUSTOM_PAGES = { seizure: "seizure.html" };

function main() {
  if (!fs.existsSync(DIR)) {
    console.error("No conditions/ directory at " + DIR);
    process.exit(1);
  }

  const files = fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".json") && f !== "index.json")
    .sort();

  const conditions = [];
  const errors = [];

  for (const file of files) {
    const id = path.basename(file, ".json");
    let data;
    try {
      data = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8"));
    } catch (e) {
      errors.push(file + " — " + e.message);
      continue;
    }
    if (!data || typeof data !== "object" || !data.title) {
      errors.push(file + ' — missing a "title" field');
      continue;
    }

    const meds = Array.isArray(data.meds) ? data.meds : [];
    /* Species come from the meds actually present unless the file states them,
       so a card never advertises a species with nothing to prescribe. */
    const species = Array.isArray(data.species) && data.species.length
      ? data.species
      : [...new Set(meds.map((m) => m.sp).filter(Boolean))].sort();

    /* The home page searches drug names, so they travel in the index. Names and
       generic/strength labels only - no prose. */
    const drugs = [];
    for (const m of meds) {
      for (const v of [m.name, m.gen]) {
        const t = v ? String(v).trim() : "";
        if (t && !drugs.includes(t)) drugs.push(t);
      }
    }

    const entry = {
      id,
      title: String(data.title),
      icon: data.icon ? String(data.icon) : "💊",
      species,
      medCount: meds.length,
      drugs,
    };
    if (CUSTOM_PAGES[id]) entry.page = CUSTOM_PAGES[id];
    conditions.push(entry);
  }

  conditions.sort((a, b) => a.title.localeCompare(b.title));

  const index = {
    generated: new Date().toISOString().slice(0, 10),
    conditions,
    errors,
  };

  const next = JSON.stringify(index, null, 2) + "\n";
  const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : null;

  /* Ignore the date when deciding whether anything really changed, so the
     Action does not commit a new index every single run. */
  const strip = (t) => (t || "").replace(/"generated":\s*"[^"]*",?\s*/, "");
  if (prev !== null && strip(prev) === strip(next)) {
    console.log("Index unchanged — " + conditions.length + " condition(s).");
    return;
  }

  fs.writeFileSync(OUT, next, "utf8");
  console.log("Wrote " + OUT + " — " + conditions.length + " condition(s).");
  for (const c of conditions) {
    console.log("  " + c.id + "  " + c.medCount + " meds  [" + c.species.join(", ") + "]");
  }
  if (errors.length) {
    console.log("\nSkipped " + errors.length + " file(s):");
    for (const e of errors) console.log("  " + e);
  }
}

main();
