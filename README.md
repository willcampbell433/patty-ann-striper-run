# The Patty Ann Striper Run

Live trip board for the November 7, 2026 striped bass run aboard the **Patty Ann** out of
Captree State Park, Babylon, through Fire Island Inlet and into the ocean.

Six aboard: Bruce, Will, Tom, Dennis, John, and Donald. Capt. Greg Gargiulo at the wheel,
AJ on the deck. [Patty Ann Charters](https://www.pattyannchartersny.com/).

This board is built on the same architecture as the Ofishal Business trip boards
(`willcampbell433/core-four-canyon-run`).

## What it includes

- **Live GPS tracker** — plots this device on the route chart, draws the trail, and shows
  position, accuracy, speed, course, distance, and ETA to a selectable spot
- **Interactive Leaflet chart** — Captree, Fire Island Inlet, Democrat Point, the Lighthouse
  beachfront, Fire Island Reef, and Gilgo as the westward backup
- **Trip clock** — counts down to departure, then counts time underway
- **Live marine conditions** — Open-Meteo wind and waves at the inlet and the reef, NDBC buoy
  44025 observations, NOAA tide predictions at Democrat Point (station 8515228)
- **Bite windows** — sunrise, sunset, and moon phase
- **Trip log** — one save updates live trip status, destination, and note, and appends a
  timestamped entry; per-angler striper standings; edit and delete
- **Photo gallery** — client-compressed uploads to Supabase Storage with realtime metadata,
  append-only for public visitors
- **Species guide** — a full striped bass primer plus bluefish, false albacore, blackfish, and
  black sea bass, all with inline SVG illustrations
- **Rules** — NY marine striped bass slot, bag, season, and circle-hook rules as of the
  May 12, 2026 DEC revision, the federal EEZ prohibition, and the NY marine fishing registry
- **Offline write queue** — durable queue with visible synced, pending, offline, and
  this-phone-only states

GPS stays on each device. It is never written to the shared board. Photo uploads are
online-only and are compressed in the browser before leaving the phone.

## Hosting

Currently served from **GitHub Pages**, which runs the board in local-only mode: every feature
works, but each phone keeps its own trip log instead of a shared one.

Shared sync needs Supabase credentials. Once they are set, `vercel.json` and
`scripts/generate-shared-config.mjs` produce the shared build exactly as the Ofishal Business
board does.

### Turning shared sync on

1. Apply `supabase/migrations/20261107120000_patty_ann_striper_run.sql` to the Supabase project.
   The migration is additive and does not touch other trips' rows.
2. Set the browser-safe public values in the hosting project:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
3. Deploy. The build writes `shared-config.js` into `dist/`.

Store these as non-sensitive variables. A Vercel variable marked sensitive is masked as
`[SENSITIVE]` when pulled for a local prebuilt build and produces a broken browser config.

Never use a Supabase service-role key in browser configuration. The build rejects any
credential labeled as service role.

## Changing trip details

Everything trip-specific lives in [`trip-config.js`](trip-config.js): times, crew, waypoints,
destinations, data sources, log types, and methods. The tests assert that the HTML form options,
the destination dropdown, and the Supabase check constraint all agree with that file, so a
mismatch fails the build rather than breaking the board on the water.

The departure time is an estimate. Confirm it with Capt. Greg and change `TRIP.departureIso`.

## Local development

```bash
npm run serve
```

Open `http://127.0.0.1:4173/`.

## Tests

```bash
npm run build
```

Runs the full suite, then syntax checks, then generates `dist/`.
