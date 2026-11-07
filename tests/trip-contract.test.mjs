import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  TRIP,
  CREW,
  POINTS,
  ROUTE_KEYS,
  DESTINATION_LABELS,
  DEFAULT_DESTINATION,
  SOURCES,
  CATCH_TYPES,
  LOG_TYPES,
  METHODS,
  SEED_ENTRIES,
} from "../trip-config.js";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const migrationPath =
  "supabase/migrations/20261107120000_patty_ann_striper_run.sql";

test("the charter's fixed dock times are set and ordered", () => {
  const boarding = new Date(TRIP.boardingIso);
  const departure = new Date(TRIP.departureIso);
  const returnBy = new Date(TRIP.returnByIso);
  [boarding, departure, returnBy].forEach((d) => assert.ok(Number.isFinite(d.getTime())));
  assert.ok(boarding < departure, "the crew boards before the boat sails");
  assert.ok(departure < returnBy, "the boat sails before it is due back");
  // Bruce's briefing: aboard 5:30, sails 6:00, back 11:00.
  assert.equal(TRIP.departureIso, "2026-11-07T06:00:00-05:00");
  assert.equal(TRIP.returnByIso, "2026-11-07T11:00:00-05:00");
});

test("the board is closed out: no live tracker, no new entries", async () => {
  const [html, app] = await Promise.all([read("index.html"), read("app.js")]);

  // The trip is over. Anything that asked the reader for live input is gone.
  for (const id of ["tripUpdateForm", "destinationControl", "locateButton", "homeReadout", "etaReadout"]) {
    assert.ok(!html.includes(`id="${id}"`), `${id} is live-trip furniture and should be off the recap page`);
  }
  assert.ok(!/navigator\.geolocation/.test(app), "the GPS watcher should be gone with the tracker");
  assert.ok(!/data-entry-delete/.test(app), "a closed log should not offer delete buttons");
  assert.ok(!/sharedStore\.(saveTripUpdate|updateDestination|updateEntry|deleteEntry)\(/.test(app),
    "nothing on the page should still write trip state or log entries");

  // What has to survive: the log, the standings, the chart, and the gallery.
  for (const id of ["timelineList", "crewTally", "leafletMap", "sharedPhotoList", "photoPicker"]) {
    assert.ok(html.includes(`id="${id}"`), `the recap still needs ${id}`);
  }
});

test("the trip identifies the right boat, crew, and day", () => {
  assert.equal(TRIP.slug, "patty-ann-2026-11-07");
  assert.equal(TRIP.date, "2026-11-07");
  assert.equal(TRIP.boat, "Patty Ann");
  assert.equal(TRIP.captain, "Greg");
  assert.equal(TRIP.mate, "AJ");
  assert.equal(TRIP.primaryTarget, "Striped bass");

  assert.deepEqual(
    CREW.map((member) => member.name),
    ["Bruce", "Will", "Tom", "Dennis", "Jon", "Don"],
    "six aboard, in the order Will listed them",
  );
  assert.equal(new Set(CREW.map((m) => m.name)).size, 6, "no duplicate anglers in the standings");
});

test("departure precedes the end of the trip day", () => {
  const departure = new Date(TRIP.departureIso);
  const dayEnd = new Date(TRIP.dayEndIso);
  assert.ok(Number.isFinite(departure.getTime()), "departure must parse");
  assert.ok(Number.isFinite(dayEnd.getTime()), "day end must parse");
  assert.ok(departure < dayEnd, "the trip clock would never leave pre-departure otherwise");
  assert.ok(
    TRIP.departureIso.startsWith(TRIP.date),
    "departure must fall on the trip date",
  );
});

test("every waypoint sits on the south shore run, not somewhere else", () => {
  for (const [key, point] of Object.entries(POINTS)) {
    assert.equal(point.key, key, `${key} should carry its own key`);
    assert.ok(point.label && point.note, `${key} needs a label and a chart note`);
    assert.ok(
      point.lat > 40.5 && point.lat < 40.75,
      `${key} latitude ${point.lat} is outside the south shore beachfront run`,
    );
    // West bound reaches Long Beach, east bound reaches the Fire Island Lighthouse.
    assert.ok(
      point.lon > -73.7 && point.lon < -73.15,
      `${key} longitude ${point.lon} is outside the south shore beachfront run`,
    );
  }
});

test("Fire Island Reef matches the DEC published site", () => {
  // DEC corners: 40 deg 35.600' to 40 deg 36.100' N, 73 deg 11.500' to 73 deg 13.500' W.
  const { lat, lon } = POINTS.fireIslandReef;
  assert.ok(lat >= 40.5933 && lat <= 40.6017, `reef latitude ${lat} is outside the DEC corners`);
  assert.ok(lon >= -73.225 && lon <= -73.1917, `reef longitude ${lon} is outside the DEC corners`);
});

test("the planned route starts at the dock and leaves through the inlet", () => {
  assert.equal(ROUTE_KEYS[0], "captree", "the run starts at the home dock");
  assert.equal(ROUTE_KEYS[1], "fireIslandInlet", "the only way out is the inlet");
  assert.ok(ROUTE_KEYS.length >= 3, "a route needs somewhere to fish");
  ROUTE_KEYS.forEach((key) => {
    assert.ok(POINTS[key], `route references unknown waypoint ${key}`);
  });
  assert.equal(new Set(ROUTE_KEYS).size, ROUTE_KEYS.length, "no repeated legs");
});

test("selectable destinations resolve to real waypoints", () => {
  const labels = new Set(Object.values(POINTS).map((point) => point.label));
  DESTINATION_LABELS.forEach((label) => {
    assert.ok(labels.has(label), `destination "${label}" has no waypoint, so ETA would break`);
  });
  assert.ok(
    DESTINATION_LABELS.includes(DEFAULT_DESTINATION),
    "the default destination must be selectable",
  );
});

test("the configured destinations still match the database constraint", async () => {
  const migration = await read(migrationPath);
  const constraint = migration.match(
    /add constraint trip_state_active_destination_check[\s\S]*?\);/,
  );
  assert.ok(constraint, "the migration must constrain active_destination");
  DESTINATION_LABELS.forEach((label) => {
    assert.ok(
      constraint[0].includes(`'${label}'`),
      `the database would reject destination "${label}"`,
    );
  });
  assert.ok(DESTINATION_LABELS.includes(DEFAULT_DESTINATION), "the default must be a real destination");
});

test("the migration seeds the same trip identity the app asks for", async () => {
  const migration = await read(migrationPath);
  assert.ok(migration.includes(`'${TRIP.id}'`), "seeded trip UUID must match TRIP.id");
  assert.ok(migration.includes(`'${TRIP.slug}'`), "seeded slug must match TRIP.slug");
  assert.ok(
    migration.includes(`(storage.foldername(name))[1] = '${TRIP.slug}'`),
    "storage policies must scope to this trip's folder",
  );
});

test("photo uploads stay append-only for the public", async () => {
  const migration = await read(migrationPath);
  assert.ok(
    migration.includes("revoke delete on public.trip_photos from anon"),
    "anonymous visitors must not be able to delete other people's photos",
  );
  assert.ok(
    !/create policy "[^"]*photos are deletable"/.test(migration),
    "no delete policy should be created for trip photos",
  );
});

test("catch types are a subset of log types and drive the standings", () => {
  CATCH_TYPES.forEach((type) => {
    assert.ok(LOG_TYPES.includes(type), `catch type "${type}" is not an available log type`);
  });
  assert.ok(CATCH_TYPES.includes("Striped bass"), "the whole point is striped bass");
  assert.ok(!CATCH_TYPES.includes("Boat life"), "boat life should not count as a fish");
  assert.ok(!CATCH_TYPES.includes("Weather"), "weather should not count as a fish");
});

test("every element app.js reads actually exists in the page", async () => {
  const [html, app] = await Promise.all([read("index.html"), read("app.js")]);

  const elsBlock = app.match(/const els = \{[\s\S]*?\n\};/);
  assert.ok(elsBlock, "app.js should keep its element map in one block");
  const ids = [...elsBlock[0].matchAll(/querySelector\("#([A-Za-z0-9_-]+)"\)/g)].map((m) => m[1]);
  assert.ok(ids.length > 10, "expected the full element map, found " + ids.length);

  const missing = ids.filter((id) => !html.includes(`id="${id}"`));
  assert.deepEqual(missing, [], "app.js queries IDs that the page does not define");
});

test("the page is wired to the module entry point and its dependencies", async () => {
  const html = await read("index.html");
  assert.ok(
    html.includes('<script type="module" src="app.js">'),
    "app.js uses ES module imports, so it must load as a module",
  );
  assert.ok(html.includes('<script src="shared-config.js">'), "shared config loads before the app");
  assert.ok(html.includes("leaflet@1.9.4/dist/leaflet.js"), "the chart needs Leaflet");
  assert.ok(html.includes('id="leafletMap"'), "the chart needs a mount point");
});

test("live data sources point at the south shore ocean, not New Jersey", async () => {
  const [html, app] = await Promise.all([read("index.html"), read("app.js")]);

  assert.equal(SOURCES.buoyStation, "44025", "44025 is the Long Island south shore ocean buoy");
  assert.equal(SOURCES.tideStation, "8515228", "Democrat Point, Fire Island Inlet");

  assert.ok(html.includes("station=44025"), "the buoy link should match the configured station");
  assert.ok(html.includes("id=8515228"), "the tide link should match the configured station");

  for (const stale of ["44091", "8532591", "Barnegat", "Manasquan", "Seaside Lump", "Monster Ledge"]) {
    assert.ok(!html.includes(stale), `index.html still references the old trip: ${stale}`);
    assert.ok(!app.includes(stale), `app.js still references the old trip: ${stale}`);
  }
});

test("tide fallback predictions are for the trip date and well formed", () => {
  assert.ok(SOURCES.tideFallback.length > 0, "a fallback is what makes the card work offline");
  SOURCES.tideFallback.forEach((prediction) => {
    assert.ok(prediction.t.startsWith(TRIP.date), `fallback tide ${prediction.t} is not on the trip date`);
    assert.ok(["H", "L"], prediction.type);
    assert.match(prediction.t, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });
});

test("the striped bass rules on the page match the May 12 2026 DEC revision", async () => {
  const html = await read("index.html");

  assert.ok(html.includes("28 to under 31"), "the keeper slot must be stated as 28 to under 31 inches");
  assert.ok(/one per person|1 per person|one fish per person/i.test(html), "the bag limit must be stated");
  assert.ok(/April 15 to December 15|Apr 15 - Dec 15/.test(html), "the NY marine season must be stated");
  assert.ok(/inline circle hook/i.test(html), "circle hook rule must be stated");
  assert.ok(
    /not\s+required\s+on\s+artificial\s+lures/i.test(html),
    "the artificial-lure exemption keeps the circle hook rule accurate",
  );
  assert.ok(
    html.includes("dec.ny.gov/things-to-do/saltwater-fishing/recreational-fishing-regulations"),
    "link out so the crew can confirm live limits",
  );
});

test("the species guide covers only what was actually in play, with real photos", async () => {
  const html = await read("index.html");
  const cards = [...html.matchAll(/<article class="species-card ([a-z]+)">/g)].map((m) => m[1]);
  // Will's call: striped bass is the target, bunker was the bait, dogfish were the only
  // thing biting on it. Nothing else belongs on a recap of this trip.
  assert.deepEqual(cards, ["striper", "bunker", "dogfish"]);
  assert.ok(!/species-card bluefish|species-card albie|species-card blackfish|species-card seabass/.test(html),
    "species that never showed up should not be on the page");

  assert.ok(html.includes("Morone saxatilis"), "the primer should name the species");
  assert.ok(/anadromous/i.test(html), "the migration is why the fall run exists");

  // Every card carries a real photo with alt text and a credit line.
  const photos = [...html.matchAll(/<img class="species-photo" src="(assets\/species\/[a-z-]+\.jpg)" alt="([^"]+)"/g)];
  assert.equal(photos.length, cards.length, "every species card needs its photo");
  photos.forEach(([, src, alt]) => {
    assert.ok(alt.length > 20, `${src} needs descriptive alt text`);
  });
  assert.equal(
    [...html.matchAll(/<small class="species-credit">/g)].length,
    cards.length,
    "each photo must credit its source",
  );
});

test("every species photo the page requests exists on disk and is credited", async () => {
  const { readFile, stat } = await import("node:fs/promises");
  const [html, credits] = await Promise.all([read("index.html"), read("assets/species/CREDITS.md")]);
  const sources = [...html.matchAll(/src="(assets\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(sources.length > 0, "expected species photos");
  for (const src of sources) {
    const file = await stat(new URL(`../${src}`, import.meta.url));
    assert.ok(file.size > 1024, `${src} is missing or empty`);
    const name = src.split("/").pop();
    assert.ok(credits.includes(name), `${name} has no license entry in CREDITS.md`);
  }
  void readFile;
});

test("the shared client never learns the boat's position", async () => {
  const app = await read("app.js");
  const client = app.match(/async function createSharedClient\(\)[\s\S]*?\n\}/);
  assert.ok(client, "expected the shared client factory");
  assert.ok(
    !/latitude|longitude|position/i.test(client[0]),
    "the Supabase client must have no concept of the boat's position",
  );
});

test("seed log entries sort before anything logged on the water", async () => {
  const [app, migration] = await Promise.all([read("app.js"), read(migrationPath)]);

  // Regression: seeds anchored to the departure estimate were timestamped ahead of
  // real entries whenever the estimate ran late, which rendered the log out of order.
  assert.ok(
    app.includes("const seedAnchor = new Date(`${TRIP.date}T00:00:00-05:00`)"),
    "seeds must anchor to the start of the trip day, not to the departure estimate",
  );
  assert.ok(
    !/created_at: new Date\(departure\.getTime\(\)/.test(app),
    "seeds must not be timestamped from the departure estimate",
  );

  const dayStart = new Date(`${TRIP.date}T00:00:00-05:00`);
  const departure = new Date(TRIP.departureIso);
  // Only the log entries matter for ordering, so scope to that insert.
  const entryInsert = migration.match(/insert into public\.trip_log_entries[\s\S]*$/);
  assert.ok(entryInsert, "the migration should seed log entries");
  const seedStamps = [...entryInsert[0].matchAll(/'(2026-11-07T\d{2}:\d{2}:\d{2}Z)'/g)].map((m) => new Date(m[1]));
  assert.ok(seedStamps.length > 0, "the migration should seed timestamped log rows");
  seedStamps.forEach((stamp) => {
    assert.ok(stamp >= dayStart, `seed ${stamp.toISOString()} predates the trip day`);
    assert.ok(
      stamp <= departure,
      `seed ${stamp.toISOString()} is after departure, so real entries would sort above it`,
    );
  });
});

test("the client seeds and the migration seeds are the same log", async () => {
  // Regression: the Jon/Don correction and the 8:20/8:40/8:52 entries landed in
  // app.js only, so the shared board would have served a stale, shorter log.
  const migration = await read(migrationPath);
  const insert = migration.match(/insert into public\.trip_log_entries[\s\S]*?on conflict/);
  assert.ok(insert, "the migration should seed log entries");

  const rows = [...insert[0].matchAll(/\(\s*'[0-9a-f-]{36}',\s*'[0-9a-f-]{36}',\s*([\s\S]*?)\s*\),?\s*(?=\(|on conflict)/g)];
  assert.equal(rows.length, SEED_ENTRIES.length, "the migration seeds a different number of entries than the client");

  const unquote = (value) => {
    const trimmed = value.trim();
    if (trimmed === "null") return null;
    assert.match(trimmed, /^'[\s\S]*'$/, `unexpected SQL literal: ${trimmed}`);
    return trimmed.slice(1, -1).replaceAll("''", "'");
  };

  rows.forEach((row, index) => {
    // time_label, entry_type, method, angler, moment, created_at, updated_at
    const fields = row[1].split(/,\n\s*/).map(unquote);
    const [timeLabel, entryType, method, angler, moment] = fields;
    const seed = SEED_ENTRIES[index];
    assert.equal(timeLabel, seed.time, `seed ${index} time_label differs`);
    assert.equal(entryType, seed.type, `seed ${index} entry_type differs`);
    assert.equal(method, seed.method, `seed ${index} method differs`);
    assert.equal(angler, seed.angler ?? null, `seed ${index} angler differs`);
    assert.equal(moment, seed.moment, `seed ${index} moment differs`);
  });
});

test("seeded anglers are real crew members so the standings add up", () => {
  const names = new Set(CREW.map((member) => member.name));
  SEED_ENTRIES.forEach((seed, index) => {
    if (!seed.angler) return;
    assert.ok(names.has(seed.angler), `seed ${index} credits "${seed.angler}", who is not aboard`);
  });
  SEED_ENTRIES.filter((seed) => CATCH_TYPES.includes(seed.type)).forEach((seed, index) => {
    assert.ok(seed.angler, `catch seed ${index} has no angler, so it would not reach the standings`);
  });
});

test("the build output contains every file the page loads", async () => {
  const [html, build] = await Promise.all([read("index.html"), read("scripts/generate-shared-config.mjs")]);
  const localScripts = [...html.matchAll(/src="(?!http)([^"]+\.js)"/g)].map((m) => m[1]);
  const localStyles = [...html.matchAll(/href="(?!http)([^"]+\.css)"/g)].map((m) => m[1]);

  for (const file of [...localStyles, ...localScripts]) {
    if (file === "shared-config.js") continue; // generated by this script
    assert.ok(build.includes(`"${file}"`), `the build does not copy ${file} into dist`);
  }
  // trip-config.js is imported by app.js rather than referenced in the HTML.
  assert.ok(build.includes('"trip-config.js"'), "the build must copy trip-config.js");
  assert.ok(build.includes('"assets"'), "the build must copy the species photos into dist");
  assert.ok(
    build.includes("window.PATTY_ANN_SHARED_CONFIG"),
    "the generated config must use the namespace app.js reads",
  );
  assert.ok(
    /service\[_-\]\?role/.test(build) || /service[_-]?role/.test(build),
    "the build must still refuse a service-role key",
  );
});
