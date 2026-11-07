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
} from "../trip-config.js";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const migrationPath =
  "supabase/migrations/20261107120000_patty_ann_striper_run.sql";

test("the trip identifies the right boat, crew, and day", () => {
  assert.equal(TRIP.slug, "patty-ann-2026-11-07");
  assert.equal(TRIP.date, "2026-11-07");
  assert.equal(TRIP.boat, "Patty Ann");
  assert.equal(TRIP.captain, "Greg");
  assert.equal(TRIP.mate, "AJ");
  assert.equal(TRIP.primaryTarget, "Striped bass");

  assert.deepEqual(
    CREW.map((member) => member.name),
    ["Bruce", "Will", "Tom", "Dennis", "John", "Donald"],
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

test("every waypoint sits in the ocean off Fire Island, not somewhere else", () => {
  for (const [key, point] of Object.entries(POINTS)) {
    assert.equal(point.key, key, `${key} should carry its own key`);
    assert.ok(point.label && point.note, `${key} needs a label and a chart note`);
    assert.ok(
      point.lat > 40.5 && point.lat < 40.75,
      `${key} latitude ${point.lat} is outside the Fire Island area`,
    );
    assert.ok(
      point.lon > -73.45 && point.lon < -73.15,
      `${key} longitude ${point.lon} is outside the Fire Island area`,
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

test("the destination dropdown, the config, and the database agree", async () => {
  const [html, migration] = await Promise.all([read("index.html"), read(migrationPath)]);

  const select = html.match(/<select id="destinationControl"[\s\S]*?<\/select>/);
  assert.ok(select, "the tracker needs a destination control");
  const options = [...select[0].matchAll(/<option[^>]*>([^<]+)<\/option>/g)].map((m) => m[1].trim());
  assert.deepEqual(options, DESTINATION_LABELS, "dropdown options must match trip-config");

  const selected = select[0].match(/<option selected>([^<]+)<\/option>/);
  assert.ok(selected, "one destination should be preselected");
  assert.equal(selected[1].trim(), DEFAULT_DESTINATION);

  // A destination the check constraint rejects would make every save fail.
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

test("the log form offers exactly the configured types, anglers, and methods", async () => {
  const html = await read("index.html");

  const typeSelect = html.match(/<select id="typeInput">[\s\S]*?<\/select>/);
  assert.ok(typeSelect, "the log form needs a type control");
  const types = [...typeSelect[0].matchAll(/<option[^>]*>([^<]+)<\/option>/g)].map((m) => m[1].trim());
  assert.deepEqual(types, LOG_TYPES, "type options must match trip-config");

  const methodSelect = html.match(/<select id="methodInput">[\s\S]*?<\/select>/);
  assert.ok(methodSelect, "the log form needs a method control");
  const methods = [...methodSelect[0].matchAll(/<option[^>]*>([^<]+)<\/option>/g)].map((m) => m[1].trim());
  assert.deepEqual(methods, METHODS, "method options must match trip-config");

  const anglerSelect = html.match(/<select id="anglerInput">[\s\S]*?<\/select>/);
  assert.ok(anglerSelect, "the log form needs an angler control");
  const anglers = [...anglerSelect[0].matchAll(/<option[^>]*>([^<]+)<\/option>/g)]
    .map((m) => m[1].trim())
    .filter((name) => name !== "Crew");
  assert.deepEqual(anglers, CREW.map((member) => member.name), "angler options must match the crew");
});

test("every element app.js reads actually exists in the page", async () => {
  const [html, app] = await Promise.all([read("index.html"), read("app.js")]);

  const elsBlock = app.match(/const els = \{[\s\S]*?\n\};/);
  assert.ok(elsBlock, "app.js should keep its element map in one block");
  const ids = [...elsBlock[0].matchAll(/querySelector\("#([A-Za-z0-9_-]+)"\)/g)].map((m) => m[1]);
  assert.ok(ids.length > 30, "expected the full element map, found " + ids.length);

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
  assert.ok(/three nautical miles|3 nautical miles/i.test(html), "the EEZ boundary must be explained");
  assert.ok(
    html.includes("dec.ny.gov/things-to-do/saltwater-fishing/recreational-fishing-regulations"),
    "link out so the crew can confirm live limits",
  );
});

test("the species guide leads with striped bass and covers the realistic catch", async () => {
  const html = await read("index.html");
  const cards = [...html.matchAll(/<article class="species-card ([a-z]+)">/g)].map((m) => m[1]);
  assert.equal(cards[0], "striper", "striped bass goes first, it is the target");
  assert.deepEqual(cards, ["striper", "bluefish", "albie", "blackfish", "seabass"]);

  assert.ok(html.includes("Morone saxatilis"), "the primer should name the species");
  assert.ok(/anadromous/i.test(html), "the migration is why the fall run exists");

  // Each card must carry real art, not a broken image reference.
  const artCount = [...html.matchAll(/<svg class="species-art"/g)].length;
  assert.equal(artCount, cards.length, "every species card needs its illustration");
  assert.ok(!/src="assets\//.test(html), "no leftover raster assets from the old trip");
});

test("the tracker promises keep GPS on the device", async () => {
  const [html, app] = await Promise.all([read("index.html"), read("app.js")]);
  assert.ok(
    /stays on your phone and is not published/i.test(html),
    "the page states the GPS privacy boundary",
  );
  // Nothing handed to the shared store may carry a coordinate.
  const writeCalls = [...app.matchAll(/sharedStore\.(saveTripUpdate|updateDestination|updateEntry|deleteEntry)\(/g)];
  assert.ok(writeCalls.length >= 3, `expected the shared-store write call sites, found ${writeCalls.length}`);
  writeCalls.forEach((call) => {
    const payload = app.slice(call.index, call.index + 600);
    assert.ok(
      !/latitude|longitude|latestTrackerFix|\.coords/.test(payload),
      `a shared-board write (${call[1]}) includes position data`,
    );
  });

  // The only place a fix is stored is the module-level tracker variable.
  const fixAssignments = [...app.matchAll(/(?<!let )latestTrackerFix\s*=/g)];
  assert.equal(fixAssignments.length, 1, "the GPS fix should be written in exactly one place");

  // The shared client must not reference any position column.
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
  assert.ok(
    build.includes("window.PATTY_ANN_SHARED_CONFIG"),
    "the generated config must use the namespace app.js reads",
  );
  assert.ok(
    /service\[_-\]\?role/.test(build) || /service[_-]?role/.test(build),
    "the build must still refuse a service-role key",
  );
});
