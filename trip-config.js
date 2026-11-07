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
    note: "Second stop and the westernmost point of the day, about 8:20 AM. Rods down 20 to 30 minutes with no hits, but the bunker were thick: five or six snagged live, three put in the water. Only dogfish bites. Turned east at 8:52.",
  },
  outsideDemocratPoint: {
    key: "outsideDemocratPoint",
    lat: 40.6225,
    lon: -73.295,
    label: "Outside Democrat Point",
    note: "Third stop, and the one that produced all of it. Ran the whole way back east and set up on the ocean side just outside the inlet, where the rest of the fleet was already working. Bruce put the first fish in the boat at 11:00 AM on a bunker spoon, 30 inches and inside the slot. Dennis followed at 11:20 with a 36 incher, over the slot and released. The next run through was massive: four more bass, for a boat total of six. Two of the six were inside the slot, the rest too big.",
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
 * The outbound leg was all westbound: out the inlet, first drop at Democrat
 * Point at 6:30, then down the ocean beachfront past Gilgo and Jones Beach to
 * Jones Inlet at 7:38 and Long Beach by 8:20. Turned around at 8:52, ran the
 * whole way back east, and set up just outside Democrat Point, where the fleet
 * was. That is where the fish were: two stripers between 11:00 and 11:20, then
 * four more on the next run through. Six bass total, two inside the slot.
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
  "longBeach",
  "outsideDemocratPoint",
];

/** Pinned on the chart for reference but not on today's track. */
export const OFF_TRACK_KEYS = ["lighthouseBeach", "fireIslandReef"];

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

// Fishing outside Democrat Point past the scheduled 11:00 AM return, so the only
// distance that still matters is the run back to the dock.
export const DEFAULT_DESTINATION = "Home";

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

/**
 * The log entries the board starts with, in order.
 *
 * These are duplicated as seeded rows in the Supabase migration so the shared
 * board and a local-only device show the same log. `tests/trip-contract.test.mjs`
 * asserts the two stay identical; they drifted once already.
 */
export const SEED_ENTRIES = [
  {
    time: "Nov 7, dock",
    type: "Boat life",
    method: "Dockside",
    moment: "Six aboard the Patty Ann at Captree: Bruce, Will, Tom, Dennis, Jon, and Don. Capt. Greg running it, AJ on the deck.",
  },
  {
    time: "Nov 7, plan",
    type: "Boat life",
    method: "Running",
    moment: "Out Fire Island Inlet and west along the ocean beachfront. Fall run, so the bait decides where we stop.",
  },
  {
    time: "Nov 7, before lines in",
    type: "Boat life",
    method: "Other",
    moment: "Striped bass: 28 to under 31 inch slot, one fish per person, inline circle hooks when fishing bait. Everything else goes back.",
  },
  {
    time: "Nov 7, 6:30 AM",
    type: "Mark",
    method: "Jigging",
    moment: "First drop of the day off Democrat Point. Birds diving over the rips but nothing underneath them. Pulled up after 15 minutes and ran the beachfront west.",
  },
  {
    time: "Nov 7, 7:30 AM",
    type: "Mark",
    method: "Running",
    moment: "Passed Jones Beach about half a mile off the sand, heading west down the beachfront.",
  },
  {
    time: "Nov 7, 7:38 AM",
    type: "Mark",
    method: "Running",
    moment: "Off Jones Inlet between Point Lookout and the Jones Beach west end, still running west. About 15 nm from Captree with an 11:00 AM return.",
  },
  {
    time: "Nov 7, ~8:20 AM",
    type: "Mark",
    method: "Jigging",
    moment: "Second stop, off Long Beach. Rods down 20 to 30 minutes with no hits on the jigs, but the bunker were thick and we snagged five or six live ones.",
  },
  {
    time: "Nov 7, ~8:40 AM",
    type: "Boat life",
    method: "Live bait",
    moment: "Three live bunker in the water. Couple of dogfish bites and nothing else, so the bass are not under this bait.",
  },
  {
    time: "Nov 7, 8:52 AM",
    type: "Mark",
    method: "Running",
    moment: "Turned around and running back east. Greg says a buddy of his put fish together back where we started, so we are retracing the morning with live bunker aboard.",
  },
  {
    time: "Nov 7, back east",
    type: "Mark",
    method: "Running",
    moment: "Ran the whole way back east and set up just outside Democrat Point, ocean side of the inlet. Boats everywhere. Found where everyone is.",
  },
  {
    time: "Nov 7, 11:00 AM",
    type: "Striped bass",
    method: "Trolling",
    angler: "Bruce",
    moment: "First fish in the boat. Bruce on the bunker spoon, and it measured right inside the slot. (30\")",
  },
  {
    time: "Nov 7, 11:20 AM",
    type: "Striped bass",
    method: "Trolling",
    angler: "Dennis",
    moment: "Dennis on the board twenty minutes later, and it is the first striped bass of his life. Too big for the slot so it went back, but it fought him the whole way. (36\")",
  },
  {
    time: "Nov 7, next run",
    type: "Mark",
    method: "Running",
    moment: "Another run through the same water outside Democrat Point, and this one was massive. Four more bass in the boat.",
  },
  {
    time: "Nov 7, next run",
    type: "Striped bass",
    method: "Trolling",
    angler: "Dennis",
    moment: "Dennis right back on the board. Second bass of the day for a guy who had never caught one before today.",
  },
  {
    time: "Nov 7, next run",
    type: "Striped bass",
    method: "Trolling",
    angler: "Dennis",
    moment: "And again. Three for Dennis, high hook on the Patty Ann.",
  },
  {
    time: "Nov 7, next run",
    type: "Striped bass",
    method: "Trolling",
    angler: "Jon",
    moment: "Jon gets his, and it is a good fish.",
  },
  {
    time: "Nov 7, next run",
    type: "Striped bass",
    method: "Trolling",
    angler: "Bruce",
    moment: "Bruce adds his second of the day. Boat total is six bass, two of them inside the slot and the rest too big to keep.",
  },
  {
    time: "Nov 7, next run",
    type: "Boat life",
    method: "Other",
    moment: "Cameras out for this one. Finally some fish worth photographing.",
  },
];

export const LOG_TYPES = ["Boat life", "Striped bass", "Bluefish", "False albacore", "Blackfish", "Black sea bass", "Weather", "Mark", "Quote"];

/** Log types that count as a catch for the fish box standings. */
export const CATCH_TYPES = ["Striped bass", "Bluefish", "False albacore", "Blackfish", "Black sea bass"];

export const METHODS = ["Jigging", "Trolling", "Live bait", "Chunking", "Bottom", "Running", "Dockside", "Other"];
