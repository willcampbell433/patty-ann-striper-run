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
  // Confirmed from Bruce's trip message: sails 6:00 AM, back by 11:00 AM,
  // crew aboard by 5:30. The trip clock and the turn-for-home timing follow these.
  departureIso: "2026-11-07T06:00:00-05:00",
  returnByIso: "2026-11-07T11:00:00-05:00",
  boardingIso: "2026-11-07T05:30:00-05:00",
  dayEndIso: "2026-11-08T00:00:00-05:00",
  boat: "Patty Ann",
  boatDetail: "Patty Ann Charters, Captree State Park",
  captain: "Greg",
  mate: "AJ",
  charterPhone: "(516) 909-5531",
  charterSite: "https://www.pattyannchartersny.com/",
  primaryTarget: "Striped bass",
};

/**
 * First names only. This board is public, so surnames, home towns, and the rest
 * of the roster detail stay off it.
 */
export const CREW = [
  { name: "Bruce", role: "Trip organizer", note: "Will's dad. Put the whole thing together, booked the boat, and wrote the briefing. Chief morale officer." },
  { name: "Will", role: "Lookout / Trip Log", note: "Watching for birds, bait, and blitzes, then calling it out fast. Also on photos and this board." },
  { name: "Tom", role: "Deck", note: "Played lacrosse with Bruce back in the day. Has his own boat, so he knows exactly where the fish aren't." },
  { name: "Dennis", role: "Deck", note: "Lifelong fisherman, now a Hobie fishing kayak guy. Also tutored Will for the SATs, so he has already made him suffer once." },
  { name: "Jon", role: "Deck", note: "Another one from the old lacrosse crew. Made the trip down from the North Shore." },
  { name: "Don", role: "Deck", note: "Long Island Vice. Grew up a few houses from Bruce and has been his friend ever since. Fisherman and pickleball menace." },
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
    note: "First drop, 6:30 AM. Birds diving but no fish in 15 minutes. Rips and moving sand; worth another look on a different tide stage.",
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
  jonesBeach: {
    key: "jonesBeach",
    lat: 40.58,
    lon: -73.524,
    label: "Jones Beach",
    note: "Passed westbound about half a mile off the sand at 7:30 AM.",
  },
  jonesInlet: {
    key: "jonesInlet",
    lat: 40.578,
    lon: -73.57,
    label: "Jones Inlet",
    note: "Position at 7:38 AM, off the inlet mouth between Point Lookout and the Jones Beach west end. Still running west.",
  },
  longBeach: {
    key: "longBeach",
    lat: 40.58,
    lon: -73.656,
    label: "Long Beach",
    note: "Next stretch of open beachfront west of Jones Inlet, if the run keeps going that way.",
  },
  gilgoBeachfront: {
    key: "gilgoBeachfront",
    lat: 40.612,
    lon: -73.38,
    label: "Gilgo beachfront",
    note: "Ocean side between Jones Beach and the inlet. Prime run-and-gun water when the bait pushes west.",
  },
  home: {
    key: "home",
    lat: 40.639,
    lon: -73.26,
    label: "Home",
    note: "Back through the inlet to Captree.",
  },
};

/**
 * The day's working track, in order, drawn as the line on the chart.
 *
 * As run, all westbound: out the inlet, first drop at Democrat Point at 6:30,
 * then down the ocean beachfront past Gilgo and Jones Beach to Jones Inlet by
 * 7:38, still heading west.
 *
 * The Lighthouse beachfront and Fire Island Reef sit east of the inlet and were
 * not part of today's run. They stay pinned as references, not on the track.
 */
export const ROUTE_KEYS = [
  "captree",
  "fireIslandInlet",
  "democratPoint",
  "gilgoBeachfront",
  "jonesBeach",
  "jonesInlet",
];

/** Pinned on the chart for reference but not on today's track. */
export const OFF_TRACK_KEYS = ["lighthouseBeach", "fireIslandReef", "longBeach"];

/**
 * Selectable ETA destinations. Must exactly match the
 * trip_state.active_destination check constraint in the migration.
 */
export const DESTINATION_LABELS = [
  "Long Beach",
  "Jones Inlet",
  "Jones Beach",
  "Gilgo beachfront",
  "Fire Island Inlet",
  "Democrat Point",
  "Lighthouse beachfront",
  "Fire Island Reef",
  "Home",
];

// Where the boat actually is as of the 7:38 AM mark.
export const DEFAULT_DESTINATION = "Jones Inlet";

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
