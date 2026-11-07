/**
 * Single source of truth for everything trip-specific.
 *
 * If a time, a name, or a waypoint is wrong, fix it here and nowhere else.
 * `scripts/generate-shared-config.mjs` and the Supabase migration both read
 * TRIP.slug and TRIP.id from this file, so the slug and UUID must stay in sync
 * with `supabase/migrations/`.
 */

export const TRIP = {
  id: "a7770000-0000-4000-8000-000000000001",
  slug: "patty-ann-2026-11-07",
  title: "The Patty Ann",
  date: "2026-11-07",
  // Estimate only: the crew was already underway before 6:40 AM. Confirm the real
  // time with Capt. Greg and change this one line; the trip clock follows it.
  departureIso: "2026-11-07T06:30:00-05:00",
  dayEndIso: "2026-11-08T00:00:00-05:00",
  boat: "Patty Ann",
  boatDetail: "Patty Ann Charters, Captree State Park",
  captain: "Greg",
  mate: "AJ",
  charterPhone: "(516) 909-5531",
  charterSite: "https://www.pattyannchartersny.com/",
  primaryTarget: "Striped bass",
};

export const CREW = [
  { name: "Bruce", role: "Dad", note: "The reason the six of us are on the water today. Chief morale officer." },
  { name: "Will", role: "Lookout / Trip Log", note: "Watching for birds, bait, and blitzes, then calling it out fast. Also on photos and this board." },
  { name: "Tom", role: "Deck", note: "Steady hands on the rail and a good read on where the fish went." },
  { name: "Dennis", role: "Deck", note: "Long-game angler. Will out-wait a slow bite and get paid for it." },
  { name: "John", role: "Deck", note: "Will have a bass on before anyone finishes rigging." },
  { name: "Donald", role: "Deck", note: "Quietly outfishes everybody and says nothing about it." },
];

export const BOAT_CREW = [
  { name: "Greg", role: "Captain", note: "Capt. Greg Gargiulo runs the Patty Ann out of Captree. His call is the only call that matters." },
  { name: "AJ", role: "Mate", note: "Rigging, gaffing, netting, and keeping six guys untangled. Tip the mate." },
];

/**
 * All coordinates are public references for trip awareness only.
 * The boat's chartplotter and the captain are the source of truth.
 */
export const POINTS = {
  captree: {
    key: "captree",
    lat: 40.639,
    lon: -73.26,
    label: "Captree Boat Basin",
    note: "Home dock. Patty Ann Charters sails from Captree State Park, 3500 Ocean Parkway, Babylon.",
  },
  fireIslandInlet: {
    key: "fireIslandInlet",
    lat: 40.6298,
    lon: -73.2736,
    label: "Fire Island Inlet",
    note: "The way out. Shifting shoals and real current. The captain times this on the tide, not on a schedule.",
  },
  democratPoint: {
    key: "democratPoint",
    lat: 40.6333,
    lon: -73.2933,
    label: "Democrat Point",
    note: "West side of the inlet mouth. Rips, moving sand, and bass sitting in the current on a dropping tide.",
  },
  lighthouseBeach: {
    key: "lighthouseBeach",
    lat: 40.625,
    lon: -73.218,
    label: "Lighthouse beachfront",
    note: "Ocean side east of the inlet, under the Fire Island Lighthouse. Work the bars and troughs for fall-run fish.",
  },
  fireIslandReef: {
    key: "fireIslandReef",
    lat: 40.5975,
    lon: -73.2083,
    label: "Fire Island Reef",
    note: "DEC artificial reef, 62 to 73 feet, 744 acres, 2.0 nm south of the Fire Island Lighthouse. Structure for bass, blackfish, and sea bass.",
  },
  gilgoBeachfront: {
    key: "gilgoBeachfront",
    lat: 40.612,
    lon: -73.38,
    label: "Gilgo beachfront",
    note: "Ocean side west of the inlet. The run-and-gun option when the bait pushes west.",
  },
  home: {
    key: "home",
    lat: 40.639,
    lon: -73.26,
    label: "Home",
    note: "Back through the inlet to Captree.",
  },
};

/** Drawn as the planned line on the chart, in order. */
export const ROUTE_KEYS = [
  "captree",
  "fireIslandInlet",
  "democratPoint",
  "lighthouseBeach",
  "fireIslandReef",
];

/**
 * Selectable ETA destinations. Must exactly match the
 * trip_state.active_destination check constraint in the migration.
 */
export const DESTINATION_LABELS = [
  "Fire Island Inlet",
  "Democrat Point",
  "Lighthouse beachfront",
  "Fire Island Reef",
  "Gilgo beachfront",
  "Home",
];

export const DEFAULT_DESTINATION = "Democrat Point";

/** Live data sources. */
export const SOURCES = {
  // NDBC 44025, Long Island, 30 NM south of Islip. The south-shore ocean buoy.
  buoyStation: "44025",
  buoyPage: "https://www.ndbc.noaa.gov/station_page.php?station=44025",
  // NOAA tide predictions at Democrat Point, Fire Island Inlet.
  tideStation: "8515228",
  tidePage: "https://tidesandcurrents.noaa.gov/noaatidepredictions.html?id=8515228",
  tideFallback: [
    { t: "2026-11-07 05:21", type: "H" },
    { t: "2026-11-07 11:52", type: "L" },
    { t: "2026-11-07 17:38", type: "H" },
  ],
};

export const LOG_TYPES = ["Boat life", "Striped bass", "Bluefish", "False albacore", "Blackfish", "Black sea bass", "Weather", "Mark", "Quote"];

/** Log types that count as a catch for the fish box standings. */
export const CATCH_TYPES = ["Striped bass", "Bluefish", "False albacore", "Blackfish", "Black sea bass"];

export const METHODS = ["Jigging", "Trolling", "Live bait", "Chunking", "Bottom", "Running", "Dockside", "Other"];
