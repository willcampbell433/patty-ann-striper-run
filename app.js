import {
  TRIP,
  CREW,
  POINTS,
  ROUTE_KEYS,
  OFF_TRACK_KEYS,
  DEFAULT_DESTINATION,
  SOURCES,
  CATCH_TYPES,
  SEED_ENTRIES,
} from "./trip-config.js";

const departure = new Date(TRIP.departureIso);
const returnBy = new Date(TRIP.returnByIso);
// Used only when the GPS has not produced a usable speed yet.
const ASSUMED_CRUISE_KT = 20;
// The boat is in. The clock stops at the real dock time and stays there.
const docked = new Date(TRIP.dockedIso);
const storageKey = `${TRIP.slug}-log-v1`;

const route = ROUTE_KEYS.map((key) => POINTS[key]);
const crew = CREW.map((member) => member.name);

let trackerDestination = Object.values(POINTS).find((point) => point.label === DEFAULT_DESTINATION);
let latestTrackerFix = null;

const onboardConditions = {
  waterTempF: null,
  source: "the Patty Ann's electronics",
  observed: "waiting on the first onboard reading",
};

const weatherFallback = {
  day1: {
    head: "Inlet model slow - use NOAA/Windy",
    metrics: [
      ["Ground", "Fire Island Inlet"],
      ["Plan", "Read the rips, the bait, and the birds"],
      ["Primary", "Use onboard instruments until data returns"],
    ],
  },
  day2: {
    head: "Reef model slow - use NOAA/Windy",
    metrics: [
      ["Ground", "Fire Island Reef"],
      ["Forecast", "Use NOAA point forecast + NDBC 44025"],
      ["Reminder", "Capt. Greg's call beats any forecast"],
    ],
  },
};

const seedEntries = SEED_ENTRIES;

const tideFallback = SOURCES.tideFallback;

const els = {
  days: document.querySelector("#daysValue"),
  hours: document.querySelector("#hoursValue"),
  minutes: document.querySelector("#minutesValue"),
  missionStatus: document.querySelector("#missionStatus"),
  lastUpdate: document.querySelector("#lastUpdate"),
  catchCount: document.querySelector("#catchCount"),
  timeline: document.querySelector("#timelineList"),
  replacementGrade: document.querySelector("#replacementGrade"),
  tideList: document.querySelector("#tideList"),
  runDistance: document.querySelector("#runDistance"),
  locateButton: document.querySelector("#locateButton"),
  locationState: document.querySelector("#locationState"),
  locationStatus: document.querySelector("#locationStatus"),
  positionReadout: document.querySelector("#positionReadout"),
  speedCourseReadout: document.querySelector("#speedCourseReadout"),
  etaReadout: document.querySelector("#etaReadout"),
  homeReadout: document.querySelector("#homeReadout"),
  crewTally: document.querySelector("#crewTally"),
  tripUpdateForm: document.querySelector("#tripUpdateForm"),
  tripUpdateInput: document.querySelector("#tripUpdateInput"),
  tripStatusControl: document.querySelector("#tripStatusControl"),
  destinationControl: document.querySelector("#destinationControl"),
  destinationSaveState: document.querySelector("#destinationSaveState"),
  typeInput: document.querySelector("#typeInput"),
  methodInput: document.querySelector("#methodInput"),
  anglerInput: document.querySelector("#anglerInput"),
  lengthInput: document.querySelector("#lengthInput"),
  catchDetails: document.querySelector("#catchDetails"),
  slotHint: document.querySelector("#slotHint"),
  currentTripStatus: document.querySelector("#currentTripStatus"),
  currentTripDestination: document.querySelector("#currentTripDestination"),
  currentTripNote: document.querySelector("#currentTripNote"),
  saveTripUpdateButton: document.querySelector("#saveTripUpdateButton"),
  syncState: document.querySelector("#syncState"),
  syncError: document.querySelector("#syncError"),
  photoPickerAction: document.querySelector("#photoPickerAction"),
  photoPicker: document.querySelector("#photoPicker"),
  photoUploadPanel: document.querySelector("#photoUploadPanel"),
  photoSelectionSummary: document.querySelector("#photoSelectionSummary"),
  photoCaptionInput: document.querySelector("#photoCaptionInput"),
  uploadPhotosButton: document.querySelector("#uploadPhotosButton"),
  photoUploadStatus: document.querySelector("#photoUploadStatus"),
  sharedPhotoList: document.querySelector("#sharedPhotoList"),
  buoyHead: document.querySelector("#buoyHead"),
  buoyMetrics: document.querySelector("#buoyMetrics"),
  buoyNote: document.querySelector("#buoyNote"),
  day1Head: document.querySelector("#day1Head"),
  day1Metrics: document.querySelector("#day1Metrics"),
  day2Head: document.querySelector("#day2Head"),
  day2Metrics: document.querySelector("#day2Metrics"),
  sunMoonList: document.querySelector("#sunMoonList"),
};

let sharedStore = null;
let sharedEntries = null;

function entryTime(entry) {
  return entry.time_label ?? entry.time ?? "Update";
}

function entryType(entry) {
  return entry.entry_type ?? entry.type ?? "Boat life";
}

function formatTripStatus(status) {
  return {
    "pre-departure": "Pre-departure",
    underway: "Underway",
    fishing: "Fishing",
    "heading-home": "Heading home",
    recap: "Recap",
  }[status] || status;
}

function isCatchType(type) {
  return CATCH_TYPES.includes(type);
}

/**
 * Zero fish does not mean zero effort. Once the boat has actually fished, the
 * scoreboard should say so rather than claiming lines are still not in.
 */
function tripStatusLabel(catchCount) {
  if (catchCount > 0) return "Fish on the deck";
  const status = els.tripStatusControl?.value;
  if (status === "pre-departure" || new Date() < departure) return "Lines not in yet";
  if (status === "recap") return "Skunked, but we were out there";
  return "Still hunting";
}

function updateCatchDetailsVisibility() {
  const show = isCatchType(els.typeInput.value);
  els.catchDetails.hidden = !show;
  els.catchDetails.setAttribute("aria-hidden", String(!show));
  if (els.slotHint) {
    els.slotHint.hidden = els.typeInput.value !== "Striped bass";
  }
}

function activeEntries() {
  return sharedEntries || readEntries();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------- Trip clock ---------- */

function renderTimer() {
  const now = new Date();
  let diff = departure - now;

  if (now >= docked) {
    // Trip is over. Hold the final elapsed time, 6:00 AM to 12:30 PM.
    els.missionStatus.textContent = "Trip complete";
    diff = docked - departure;
  } else if (now >= departure) {
    els.missionStatus.textContent = "Time underway";
    diff = now - departure;
  } else {
    els.missionStatus.textContent = "Pre-departure";
  }

  const totalMinutes = Math.max(0, Math.floor(diff / 60000));
  els.days.textContent = String(Math.floor(totalMinutes / 1440)).padStart(2, "0");
  els.hours.textContent = String(Math.floor((totalMinutes % 1440) / 60)).padStart(2, "0");
  els.minutes.textContent = String(totalMinutes % 60).padStart(2, "0");
}

/* ---------- Trip log ---------- */

function readEntries() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey));
    if (!Array.isArray(parsed)) return seedEntries;
    let cleaned = parsed;
    seedEntries.forEach((seed) => {
      if (!cleaned.some((entry) => entry.moment === seed.moment)) {
        cleaned = [...cleaned, seed];
      }
    });
    if (cleaned.length !== parsed.length) writeEntries(cleaned);
    return cleaned;
  } catch {
    return seedEntries;
  }
}

function writeEntries(entries) {
  localStorage.setItem(storageKey, JSON.stringify(entries));
}

function renderTimeline(entries = activeEntries()) {
  els.timeline.innerHTML = entries
    .slice()
    .reverse()
    .map(
      (entry) => `
        <li${entry._pending ? ' class="pending"' : ""}>
          <time>${escapeHtml(entryTime(entry))}</time>
          <div>
            <strong>${escapeHtml(entry.moment)}</strong>
            <span>${escapeHtml(entryType(entry))} / ${escapeHtml(entry.method)}${entry.angler ? ` / ${escapeHtml(entry.angler)}` : ""}</span>
            ${entry.id ? `<div class="entry-actions"><button type="button" data-entry-edit="${escapeHtml(entry.id)}">Edit</button><button type="button" data-entry-delete="${escapeHtml(entry.id)}">Delete</button></div>` : ""}
          </div>
        </li>
      `,
    )
    .join("");

  const catchCount = entries.filter((entry) => isCatchType(entryType(entry))).length;
  els.catchCount.textContent = String(catchCount);
  els.lastUpdate.textContent = entries.length ? entryTime(entries.at(-1)) : "Stand by";
  els.replacementGrade.textContent = tripStatusLabel(catchCount);
  renderTally(entries);
}

function renderTally(entries) {
  if (!els.crewTally) return;
  const counts = Object.fromEntries(crew.map((name) => [name, 0]));
  entries.forEach((entry) => {
    if (isCatchType(entryType(entry)) && entry.angler && counts[entry.angler] !== undefined) {
      counts[entry.angler] += 1;
    }
  });
  const leader = Math.max(...crew.map((name) => counts[name]));
  els.crewTally.innerHTML = crew
    .map((name) => {
      const isLeader = leader > 0 && counts[name] === leader;
      return `<li${isLeader ? ' class="leader"' : ""}><span>${name}</span><strong>${counts[name]}</strong>${isLeader ? "<em>leader</em>" : ""}</li>`;
    })
    .join("");
}

/* ---------- Leaflet map ---------- */

function nmBetween(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 3440.065;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function setTrackerDestination(label) {
  const destination = Object.values(POINTS).find((point) => point.label === label);
  if (!destination) return false;
  trackerDestination = destination;
  if (els.currentTripDestination) els.currentTripDestination.textContent = destination.label;
  refreshTrackerEta();
  return true;
}

function refreshTrackerEta() {
  if (els.etaReadout) {
    if (!latestTrackerFix) {
      els.etaReadout.textContent = `Start live location for distance and ETA to ${trackerDestination.label}.`;
    } else {
      const { latitude, longitude, speed } = latestTrackerFix;
      updateEta(nmBetween({ lat: latitude, lon: longitude }, trackerDestination), speed);
    }
  }
  refreshHomeTiming();
}

function formatClockTime(date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * The charter is booked back at the dock by a fixed time, so the number that
 * actually matters while running west is not the ETA to the next spot. It is
 * the latest moment the boat can turn and still make it home.
 */
function refreshHomeTiming() {
  if (!els.homeReadout) return;

  const returnLabel = formatClockTime(returnBy);
  if (!latestTrackerFix) {
    els.homeReadout.textContent = `Start live location to see the latest turn for a return by ${returnLabel}.`;
    return;
  }

  const { latitude, longitude, speed } = latestTrackerFix;
  const homeNm = nmBetween({ lat: latitude, lon: longitude }, POINTS.home);
  const measuredKt = Number.isFinite(speed) && speed !== null ? speed * 1.94384 : null;
  const usableKt = measuredKt && measuredKt > 3 ? measuredKt : ASSUMED_CRUISE_KT;
  const assumed = !(measuredKt && measuredKt > 3);

  const minutesHome = (homeNm / usableKt) * 60;
  const turnBy = new Date(returnBy.getTime() - minutesHome * 60000);
  const slackMinutes = Math.round((turnBy - Date.now()) / 60000);

  const basis = assumed ? `assuming ${ASSUMED_CRUISE_KT} kt` : `at ${usableKt.toFixed(1)} kt`;
  const run = `${homeNm.toFixed(1)} nm home, ~${Math.round(minutesHome)} min ${basis}.`;

  if (slackMinutes <= 0) {
    els.homeReadout.textContent = `${run} Past the turn for a return by ${returnLabel}.`;
    els.homeReadout.dataset.state = "late";
    return;
  }

  const hours = Math.floor(slackMinutes / 60);
  const mins = slackMinutes % 60;
  const slack = hours ? `${hours}h ${String(mins).padStart(2, "0")}m` : `${mins}m`;
  els.homeReadout.textContent =
    `${run} Turn by ${formatClockTime(turnBy)} to be back by ${returnLabel}, ${slack} of fishing left.`;
  els.homeReadout.dataset.state = slackMinutes <= 30 ? "soon" : "ok";
}

function updateEta(remainingNm, speedMs) {
  if (!els.etaReadout) return;
  if (remainingNm < 0.5) {
    els.etaReadout.textContent = `At ${trackerDestination.label} - follow the captain's call.`;
    return;
  }
  const kt = Number.isFinite(speedMs) && speedMs !== null ? speedMs * 1.94384 : null;
  let etaText = "";
  if (kt && kt > 1) {
    const hours = remainingNm / kt;
    const eta = new Date(Date.now() + hours * 3600000);
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    const clock = eta.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    etaText = ` | ${h}h ${String(m).padStart(2, "0")}m out, ETA ${clock}`;
  }
  els.etaReadout.textContent = `${remainingNm.toFixed(1)} nm to ${trackerDestination.label}${etaText}`;
}

function setLocationState(state, message) {
  if (els.locationState) {
    els.locationState.textContent = state;
    els.locationState.dataset.state = state.toLowerCase().replace("gps ", "");
  }
  if (els.locationStatus) els.locationStatus.textContent = message;
}

function initMap() {
  if (typeof L === "undefined") {
    setLocationState("GPS ERROR", "The route chart did not load, so live tracking is unavailable. The rest of the board still works.");
    return;
  }

  const map = L.map("leafletMap", { scrollWheelZoom: false });

  const oceanLayer = L.tileLayer(
    "https://services.arcgisonline.com/arcgis/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
    {
      attribution: "Esri Ocean Basemap — GEBCO, NOAA, Garmin",
      maxZoom: 13,
    },
  ).addTo(map);

  let tileErrors = 0;
  oceanLayer.on("tileerror", () => {
    tileErrors += 1;
    if (tileErrors < 3) return;
    oceanLayer.off("tileerror");
    map.removeLayer(oceanLayer);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "CARTO / OpenStreetMap",
      maxZoom: 14,
    }).addTo(map);
  });

  const latLngs = route.map((p) => [p.lat, p.lon]);
  const offTrack = OFF_TRACK_KEYS.map((key) => POINTS[key]);
  const allLatLngs = [...latLngs, ...offTrack.map((p) => [p.lat, p.lon])];

  L.polyline(latLngs, {
    color: "#ff8d4d",
    weight: 4,
    dashArray: "4 10",
    lineCap: "round",
  }).addTo(map);

  route.forEach((p, i) => {
    const isStart = i === 0;
    const isDestination = i === route.length - 1;
    const isInlet = p.key === "fireIslandInlet";
    const marker = L.circleMarker([p.lat, p.lon], {
      radius: isStart || isDestination ? 10 : 7,
      color: "#04111d",
      weight: 3,
      fillColor: isDestination ? "#ff8d4d" : isStart ? "#6cbcff" : "#6df4d4",
      fillOpacity: 1,
    })
      .addTo(map)
      .bindPopup(`<strong>${p.label}</strong><br>${p.note}`);
    if (isDestination || isStart) {
      marker.bindTooltip(p.label, { permanent: true, direction: "right", offset: [12, 0] });
    } else if (isInlet) {
      marker.bindTooltip("Fire Island Inlet", { permanent: true, direction: "right", offset: [10, 0] });
    }
  });

  // Reference spots that are not part of today's run get a muted pin and no line.
  offTrack.forEach((p) => {
    L.circleMarker([p.lat, p.lon], {
      radius: 6,
      color: "#04111d",
      weight: 3,
      fillColor: "#9fb5c7",
      fillOpacity: 0.85,
    })
      .addTo(map)
      .bindPopup(`<strong>${p.label}</strong><br>${p.note}`);
  });

  map.fitBounds(allLatLngs, { padding: [36, 36] });

  let total = 0;
  for (let i = 1; i < route.length; i += 1) total += nmBetween(route[i - 1], route[i]);
  els.runDistance.textContent = `~${total.toFixed(1)} nm`;

  initLocationPin(map, allLatLngs);
}

function initLocationPin(map, routeLatLngs) {
  if (!els.locateButton || !els.locationStatus) return;

  let watchId = null;
  let locationMarker;
  let accuracyCircle;
  let firstFix = true;
  const trail = [];
  const trailLine = L.polyline([], {
    color: "#6df4d4",
    weight: 3,
    opacity: 0.7,
    lineCap: "round",
  }).addTo(map);

  function stopTracking() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    els.locateButton.textContent = "Start live location";
  }

  function onPosition(position) {
    const { latitude, longitude, accuracy, speed, heading } = position.coords;
    const latLng = [latitude, longitude];
    latestTrackerFix = { latitude, longitude, speed };

    if (locationMarker) locationMarker.remove();
    if (accuracyCircle) accuracyCircle.remove();

    accuracyCircle = L.circle(latLng, {
      radius: accuracy,
      color: "#6df4d4",
      weight: 1,
      fillColor: "#6df4d4",
      fillOpacity: 0.08,
    }).addTo(map);

    locationMarker = L.circleMarker(latLng, {
      radius: 9,
      color: "#04111d",
      weight: 3,
      fillColor: "#6df4d4",
      fillOpacity: 1,
    }).addTo(map);

    trail.push(latLng);
    trailLine.setLatLngs(trail);

    if (firstFix) {
      map.fitBounds([...routeLatLngs, latLng], { padding: [36, 36] });
      firstFix = false;
    } else {
      map.panTo(latLng);
    }

    const speedReadout = Number.isFinite(speed) && speed !== null ? `${(speed * 1.94384).toFixed(1)} kt` : "Speed unavailable";
    const courseReadout = Number.isFinite(heading) && heading !== null ? `${compass(heading)} ${Math.round(heading)}°` : "Course unavailable";
    if (els.positionReadout) {
      els.positionReadout.textContent = `${latitude.toFixed(4)}, ${longitude.toFixed(4)} (±${Math.round(accuracy)} m)`;
    }
    if (els.speedCourseReadout) {
      els.speedCourseReadout.textContent = `${speedReadout} | ${courseReadout}`;
    }
    setLocationState("LIVE", "Position is updating on the route chart above.");

    refreshTrackerEta();
    locationMarker.bindPopup(
      `<strong>${TRIP.boat}</strong><br>${latitude.toFixed(4)}, ${longitude.toFixed(4)}<br>GPS accuracy: ~${Math.round(accuracy)} m`,
    );
  }

  function onError(error) {
    const permissionDenied = error.code === 1 || error.code === error.PERMISSION_DENIED;
    if (permissionDenied) stopTracking();
    setLocationState(
      "GPS ERROR",
      permissionDenied
        ? "Location permission was blocked. Enable it in the browser to track."
        : "Lost the GPS fix. Still trying to reconnect…",
    );
  }

  els.locateButton.addEventListener("click", () => {
    if (!navigator.geolocation) {
      setLocationState("GPS ERROR", "GPS is not available in this browser.");
      return;
    }

    if (watchId !== null) {
      stopTracking();
      setLocationState("PAUSED", "Live tracking paused. Your trail stays on the chart.");
      return;
    }

    setLocationState("CONNECTING", "Waiting on GPS permission and a position fix…");
    els.locateButton.textContent = "Stop live location";
    firstFix = true;
    watchId = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 5000,
    });
  });
}

/* ---------- Live weather (Open-Meteo) ---------- */

function compass(deg) {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

function dominantDirection(degrees) {
  const counts = {};
  degrees.forEach((deg) => {
    const dir = compass(deg);
    counts[dir] = (counts[dir] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function daySlice(times, values, date) {
  return values.filter((_, i) => times[i].startsWith(date));
}

function ftRange(values) {
  const ft = values.map((m) => m * 3.28084);
  return `${Math.round(Math.min(...ft))}-${Math.round(Math.max(...ft))} ft`;
}

function renderWeatherDay(headEl, listEl, wind, gusts, dirs, waves, periods) {
  const windLine = `${dominantDirection(dirs)} ${Math.round(Math.min(...wind))}-${Math.round(Math.max(...wind))} kt`;
  headEl.textContent = `${windLine}, seas ${ftRange(waves)}`;
  listEl.innerHTML = `
    <li><strong>Wind</strong> ${windLine}</li>
    <li><strong>Gusts</strong> to ${Math.round(Math.max(...gusts))} kt</li>
    <li><strong>Waves</strong> ${ftRange(waves)}</li>
    <li><strong>Period</strong> ~${Math.round(periods.reduce((a, b) => a + b, 0) / periods.length)} sec</li>
  `;
}

const MOON_NAMES = [
  "New moon",
  "Waxing crescent",
  "First quarter",
  "Waxing gibbous",
  "Full moon",
  "Waning gibbous",
  "Last quarter",
  "Waning crescent",
];

function moonPhase(date) {
  const synodic = 29.53058867;
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14);
  const age = (((date.getTime() - knownNewMoon) / 86400000) % synodic + synodic) % synodic;
  const index = Math.round((age / synodic) * 8) % 8;
  const illumination = Math.round((1 - Math.cos((2 * Math.PI * age) / synodic)) * 50);
  return { name: MOON_NAMES[index], illumination };
}

function formatClock(iso) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function renderMetricList(listEl, metrics) {
  listEl.innerHTML = metrics.map(([label, value]) => `<li><strong>${label}</strong> ${value}</li>`).join("");
}

function renderWeatherFallback() {
  els.day1Head.textContent = weatherFallback.day1.head;
  renderMetricList(els.day1Metrics, weatherFallback.day1.metrics);
  els.day2Head.textContent = weatherFallback.day2.head;
  renderMetricList(els.day2Metrics, weatherFallback.day2.metrics);
}

function renderSunMoonFallback() {
  const moon = moonPhase(departure);
  els.sunMoonList.innerHTML = `
    <li><strong>Sunrise</strong> ~6:28 AM</li>
    <li><strong>Sunset</strong> ~4:42 PM</li>
    <li><strong>Moon</strong> ${moon.name}, ${moon.illumination}% lit</li>
    <li><strong>Note</strong> Fall run. First light and the tide change are the windows.</li>
  `;
}

async function refreshWeather() {
  const date = TRIP.date;
  const locations = [
    { point: POINTS.fireIslandInlet, head: els.day1Head, list: els.day1Metrics },
    { point: POINTS.fireIslandReef, head: els.day2Head, list: els.day2Metrics },
  ];

  try {
    const forecasts = await Promise.all(
      locations.map(async ({ point, head, list }) => {
        const windUrl =
          `https://api.open-meteo.com/v1/forecast?latitude=${point.lat}&longitude=${point.lon}` +
          `&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m&daily=sunrise,sunset` +
          `&wind_speed_unit=kn&timezone=America%2FNew_York&start_date=${date}&end_date=${date}`;
        const marineUrl =
          `https://marine-api.open-meteo.com/v1/marine?latitude=${point.lat}&longitude=${point.lon}` +
          `&hourly=wave_height,wave_period&timezone=America%2FNew_York&start_date=${date}&end_date=${date}`;
        const [windRes, marineRes] = await Promise.all([
          fetchWithTimeout(windUrl, {}, 9000),
          fetchWithTimeout(marineUrl, {}, 9000),
        ]);
        if (!windRes.ok || !marineRes.ok) throw new Error("weather fetch failed");
        return {
          head,
          list,
          windData: await windRes.json(),
          marineData: await marineRes.json(),
        };
      }),
    );

    forecasts.forEach(({ head, list, windData, marineData }) => {
      renderWeatherDay(
        head,
        list,
        daySlice(windData.hourly.time, windData.hourly.wind_speed_10m, date),
        daySlice(windData.hourly.time, windData.hourly.wind_gusts_10m, date),
        daySlice(windData.hourly.time, windData.hourly.wind_direction_10m, date),
        daySlice(marineData.hourly.time, marineData.hourly.wave_height, date),
        daySlice(marineData.hourly.time, marineData.hourly.wave_period, date),
      );
    });

    const windData = forecasts[0].windData;
    const moon = moonPhase(departure);
    els.sunMoonList.innerHTML = `
      <li><strong>Sunrise</strong> ${formatClock(windData.daily.sunrise[0])}</li>
      <li><strong>Sunset</strong> ${formatClock(windData.daily.sunset[0])}</li>
      <li><strong>Moon</strong> ${moon.name}, ${moon.illumination}% lit</li>
      <li><strong>Note</strong> Fall run. First light and the tide change are the windows.</li>
    `;
  } catch {
    renderWeatherFallback();
    renderSunMoonFallback();
  }
}

/* ---------- Live buoy (NDBC 44025, 30 nm south of Islip) ---------- */

async function refreshBuoy() {
  if (!els.buoyHead) return;
  const { lat, lon } = POINTS.fireIslandReef;
  try {
    const stationUrl = `https://api.weather.gov/stations/${SOURCES.buoyStation}/observations/latest`;
    const marineUrl =
      `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
      `&current=sea_surface_temperature,wave_height&timezone=America%2FNew_York`;
    const windUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=kn&timezone=America%2FNew_York`;
    const [stationRes, marineRes, windRes] = await Promise.all([
      fetchWithTimeout(stationUrl, { headers: { Accept: "application/geo+json" } }, 8000),
      fetchWithTimeout(marineUrl, {}, 8000),
      fetchWithTimeout(windUrl, {}, 8000),
    ]);
    if (!stationRes.ok || !marineRes.ok || !windRes.ok) throw new Error("conditions request failed");

    const station = (await stationRes.json()).properties;
    const marine = (await marineRes.json()).current;
    const wind = (await windRes.json()).current;
    const airC = station.temperature?.value;
    const airF = airC === null || airC === undefined ? null : (airC * 9) / 5 + 32;
    const waterC = marine.sea_surface_temperature;
    const waterF = waterC === null || waterC === undefined ? null : (waterC * 9) / 5 + 32;
    const waveM = marine.wave_height;
    const observed = station.timestamp
      ? new Date(station.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : "latest report";

    els.buoyHead.textContent = waterF === null ? "Live ocean conditions" : `${waterF.toFixed(1)}°F model SST`;
    els.buoyMetrics.innerHTML = `
      <li><strong>Buoy air</strong> ${airF === null ? "n/a" : `${airF.toFixed(1)}°F`}</li>
      <li><strong>Model SST</strong> ${waterF === null ? "n/a" : `${waterF.toFixed(1)}°F`}</li>
      <li><strong>Waves</strong> ${waveM === null || waveM === undefined ? "n/a" : `${(waveM * 3.28084).toFixed(1)} ft`}</li>
      <li><strong>Wind</strong> ${compass(wind.wind_direction_10m)} ${Math.round(wind.wind_speed_10m)} kt</li>
      <li><strong>Gusts</strong> to ${Math.round(wind.wind_gusts_10m)} kt</li>
    `;
    els.buoyNote.textContent =
      `NDBC ${SOURCES.buoyStation} air observed at ${observed}; water, waves, and wind are modeled at Fire Island Reef. ` +
      "Water temperature in the 50s and low 60s is prime fall striper range.";
  } catch {
    await buoyFallback();
  }
}

async function buoyFallback() {
  const { lat, lon } = POINTS.fireIslandReef;
  try {
    const marineUrl =
      `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
      `&current=sea_surface_temperature,wave_height&timezone=America%2FNew_York`;
    const windUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=kn&timezone=America%2FNew_York`;
    const [marineRes, windRes] = await Promise.all([
      fetchWithTimeout(marineUrl, {}, 8000),
      fetchWithTimeout(windUrl, {}, 8000),
    ]);
    if (!marineRes.ok || !windRes.ok) throw new Error("fallback fetch failed");
    const marine = (await marineRes.json()).current;
    const wind = (await windRes.json()).current;

    const sstC = marine.sea_surface_temperature;
    const waveM = marine.wave_height;
    const waterF = sstC === null || sstC === undefined ? null : (sstC * 9) / 5 + 32;

    const hasOnboardWater = onboardConditions.waterTempF !== null && onboardConditions.waterTempF !== undefined;
    els.buoyHead.textContent = hasOnboardWater
      ? `${onboardConditions.waterTempF.toFixed(1)}°F water`
      : waterF === null
        ? "Live ocean conditions"
        : `${waterF.toFixed(1)}°F water`;
    els.buoyMetrics.innerHTML = `
      <li><strong>Onboard</strong> ${hasOnboardWater ? `${onboardConditions.waterTempF.toFixed(1)}°F` : "n/a"}</li>
      <li><strong>Model SST</strong> ${waterF === null ? "n/a" : `${waterF.toFixed(1)}°F`}</li>
      <li><strong>Waves</strong> ${waveM === null || waveM === undefined ? "n/a" : `${(waveM * 3.28084).toFixed(1)} ft`}</li>
      <li><strong>Wind</strong> ${compass(wind.wind_direction_10m)} ${Math.round(wind.wind_speed_10m)} kt</li>
      <li><strong>Gusts</strong> to ${Math.round(wind.wind_gusts_10m)} kt</li>
    `;
    els.buoyNote.textContent =
      `Reading from ${onboardConditions.source}, ${onboardConditions.observed}. ` +
      `Waves and wind are modeled at Fire Island Reef (Open-Meteo); buoy ${SOURCES.buoyStation} was unreachable.`;
  } catch {
    const hasOnboardWater = onboardConditions.waterTempF !== null && onboardConditions.waterTempF !== undefined;
    els.buoyHead.textContent = hasOnboardWater
      ? `${onboardConditions.waterTempF.toFixed(1)}°F water`
      : "Conditions feed slow";
    renderMetricList(els.buoyMetrics, [
      ["Onboard", hasOnboardWater ? `${onboardConditions.waterTempF.toFixed(1)}°F` : "waiting on reading"],
      [`Buoy ${SOURCES.buoyStation}`, "unreachable"],
      ["Model feed", "slow/offline"],
    ]);
    els.buoyNote.textContent =
      "Live feeds are slow. Use the linked NDBC and NOAA pages, and the boat's electronics, for the real numbers.";
  }
}

/* ---------- Tides ---------- */

function formatTime(time) {
  const [hourRaw, minute] = time.split(":");
  const hour = Number(hourRaw);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${suffix}`;
}

function tideDayLabel() {
  return new Date(`${TRIP.date}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" });
}

function renderTides(predictions) {
  const label = tideDayLabel();
  const entries = predictions.map((prediction) => {
    const [, time] = prediction.t.split(" ");
    return `${prediction.type === "H" ? "H" : "L"} ${formatTime(time)}`;
  });
  els.tideList.innerHTML = `<li><strong>${label}</strong> ${entries.join(", ")}</li>`;
}

async function refreshTides() {
  const compact = TRIP.date.replaceAll("-", "");
  const url =
    "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions" +
    `&application=patty-ann-trip-board&begin_date=${compact}&end_date=${compact}` +
    `&datum=MLLW&station=${SOURCES.tideStation}&time_zone=lst_ldt&units=english&interval=hilo&format=json`;
  try {
    const response = await fetchWithTimeout(url, {}, 8000);
    if (!response.ok) throw new Error("NOAA tide request failed");
    const data = await response.json();
    if (Array.isArray(data.predictions) && data.predictions.length) {
      renderTides(data.predictions);
    } else {
      renderTides(tideFallback);
    }
  } catch {
    renderTides(tideFallback);
  }
}

/* ---------- Shared board (Supabase) ---------- */

async function createSharedClient() {
  const config = window.PATTY_ANN_SHARED_CONFIG || {};
  if (!config.url || !config.publishableKey) return null;

  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  const supabase = createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  function unwrap(result) {
    if (result.error) throw result.error;
    return result.data;
  }

  return {
    async load(slug) {
      const trip = unwrap(await supabase.from("trips").select("*").eq("slug", slug).single());
      const [stateResult, entriesResult] = await Promise.all([
        supabase.from("trip_state").select("*").eq("trip_id", trip.id).single(),
        supabase.from("trip_log_entries").select("*").eq("trip_id", trip.id).order("created_at"),
      ]);
      return {
        trip,
        tripState: unwrap(stateResult),
        entries: unwrap(entriesResult),
      };
    },
    async mutate(mutation) {
      if (mutation.kind === "create-entry") {
        unwrap(await supabase.from("trip_log_entries").upsert(mutation.row, { onConflict: "id" }));
      } else if (mutation.kind === "update-entry") {
        unwrap(await supabase.from("trip_log_entries").update(mutation.row).eq("id", mutation.row.id));
      } else if (mutation.kind === "delete-entry") {
        unwrap(await supabase.from("trip_log_entries").delete().eq("id", mutation.id));
      } else if (mutation.kind === "update-state") {
        unwrap(await supabase.from("trip_state").upsert(mutation.row, { onConflict: "trip_id" }));
      }
    },
    async listPhotos(tripId) {
      return unwrap(
        await supabase.from("trip_photos").select("*").eq("trip_id", tripId).order("created_at", { ascending: false }),
      );
    },
    async uploadPhoto({ id, tripId, storagePath, blob, caption, width, height }) {
      unwrap(
        await supabase.storage.from("trip-photos").upload(storagePath, blob, {
          cacheControl: "31536000",
          contentType: "image/jpeg",
          upsert: false,
        }),
      );
      return unwrap(
        await supabase.from("trip_photos").insert({
          id,
          trip_id: tripId,
          storage_path: storagePath,
          caption: caption || null,
          width,
          height,
        }).select("*").single(),
      );
    },
    photoUrl(storagePath) {
      return supabase.storage.from("trip-photos").getPublicUrl(storagePath).data.publicUrl;
    },
    subscribePhotos(handler) {
      const channel = supabase
        .channel(`${TRIP.slug}-photos`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "trip_photos" },
          (payload) => handler({ table: "trip_photos", ...payload }),
        )
        .subscribe();
      return () => supabase.removeChannel(channel);
    },
    subscribe(handler) {
      const channel = supabase
        .channel(`${TRIP.slug}-board`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "trip_state" },
          (payload) => handler({ table: "trip_state", ...payload }),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "trip_log_entries" },
          (payload) => handler({ table: "trip_log_entries", ...payload }),
        )
        .subscribe();
      return () => supabase.removeChannel(channel);
    },
  };
}

function photoErrorMessage(error) {
  const message = error?.message || String(error || "Photo upload failed.");
  if (/network|fetch|offline/i.test(message)) return "Connection lost. Reconnect and try the photo upload again.";
  if (/row-level security|policy/i.test(message)) return "Photo storage permissions are not ready yet.";
  return message;
}

function formatPhotoTime(value) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function setupSharedPhotos(client, trip) {
  if (!els.photoPicker || !els.sharedPhotoList) return;
  if (!client || !trip) {
    els.photoUploadStatus.textContent =
      "Shared photo uploads need the hosted board with Supabase configured. Everything else on this page works now.";
    return;
  }

  const { buildPhotoPath, preparePhoto, validatePhotoFile } = await import("./photo-utils.js");
  let photos = [];
  let selectedFiles = [];

  function setPhotoAvailability(available) {
    els.photoPicker.disabled = !available;
    els.photoPickerAction.classList.toggle("is-disabled", !available);
    els.photoPickerAction.setAttribute("aria-disabled", String(!available));
  }

  function upsertPhoto(photo) {
    photos = [photo, ...photos.filter((candidate) => candidate.id !== photo.id)]
      .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
  }

  function renderPhotos() {
    els.sharedPhotoList.querySelectorAll("[data-shared-photo]").forEach((node) => node.remove());
    photos.forEach((photo) => {
      const figure = document.createElement("figure");
      figure.className = "gallery-photo";
      figure.dataset.sharedPhoto = photo.id;

      const link = document.createElement("a");
      link.href = client.photoUrl(photo.storage_path);
      link.target = "_blank";
      link.rel = "noreferrer";
      link.setAttribute("aria-label", `Open full-size trip photo from ${formatPhotoTime(photo.created_at)}`);

      const image = document.createElement("img");
      image.src = link.href;
      image.alt = photo.caption || "Shared trip photo";
      image.loading = "lazy";
      image.width = photo.width;
      image.height = photo.height;
      link.append(image);

      const meta = document.createElement("figcaption");
      meta.className = "shared-photo-meta";
      const caption = document.createElement("p");
      caption.textContent = photo.caption || "Trip photo";
      const timestamp = document.createElement("small");
      timestamp.textContent = formatPhotoTime(photo.created_at);
      meta.append(caption, timestamp);
      figure.append(link, meta);
      els.sharedPhotoList.append(figure);
    });
  }

  function reconcilePhoto(event) {
    const id = event.eventType === "DELETE" ? event.old?.id : event.new?.id;
    photos = photos.filter((photo) => photo.id !== id);
    if (event.eventType !== "DELETE" && event.new) upsertPhoto(event.new);
    renderPhotos();
  }

  function updateSelectionSummary() {
    const count = selectedFiles.length;
    els.photoSelectionSummary.textContent = count
      ? `${count} photo${count === 1 ? "" : "s"} selected`
      : "No photos selected";
    els.photoUploadPanel.hidden = count === 0;
  }

  els.photoPicker.addEventListener("change", () => {
    const failedMessages = [];
    selectedFiles = Array.from(els.photoPicker.files || []).filter((file) => {
      const validation = validatePhotoFile(file);
      if (!validation.valid) failedMessages.push(validation.error);
      return validation.valid;
    });
    updateSelectionSummary();
    els.photoUploadStatus.textContent = failedMessages.join(" ");
  });

  els.uploadPhotosButton.addEventListener("click", async () => {
    if (!selectedFiles.length) return;
    if (!navigator.onLine) {
      els.photoUploadStatus.textContent = "Photo uploads need an internet connection. Reconnect and try again.";
      return;
    }

    const caption = els.photoCaptionInput.value.trim();
    const failedMessages = [];
    const failedFiles = [];
    let uploadedCount = 0;
    els.uploadPhotosButton.disabled = true;

    for (const [index, file] of selectedFiles.entries()) {
      els.photoUploadStatus.textContent = `Preparing photo ${index + 1} of ${selectedFiles.length}...`;
      try {
        const { blob, width, height } = await preparePhoto(file);
        const id = crypto.randomUUID();
        const storagePath = buildPhotoPath({ tripSlug: trip.slug, id });
        els.photoUploadStatus.textContent = `Uploading photo ${index + 1} of ${selectedFiles.length}...`;
        const photo = await client.uploadPhoto({
          id,
          tripId: trip.id,
          storagePath,
          blob,
          caption,
          width,
          height,
        });
        upsertPhoto(photo);
        renderPhotos();
        uploadedCount += 1;
      } catch (error) {
        failedFiles.push(file);
        failedMessages.push(`${file.name}: ${photoErrorMessage(error)}`);
      }
    }

    selectedFiles = failedFiles;
    els.uploadPhotosButton.disabled = false;
    if (!failedFiles.length) {
      els.photoPicker.value = "";
      els.photoCaptionInput.value = "";
    }
    updateSelectionSummary();
    els.photoUploadStatus.textContent = failedMessages.length
      ? `${uploadedCount} uploaded. ${failedMessages.join(" ")}`
      : `${uploadedCount} photo${uploadedCount === 1 ? "" : "s"} uploaded.`;
  });

  setPhotoAvailability(navigator.onLine);
  window.addEventListener("online", () => {
    setPhotoAvailability(true);
    els.photoUploadStatus.textContent = "";
  });
  window.addEventListener("offline", () => {
    setPhotoAvailability(false);
    els.photoUploadStatus.textContent = "Photo uploads are offline. Existing photos remain available.";
  });

  try {
    photos = await client.listPhotos(trip.id);
    renderPhotos();
    client.subscribePhotos(reconcilePhoto);
  } catch (error) {
    setPhotoAvailability(false);
    els.photoUploadStatus.textContent = photoErrorMessage(error);
  }
}

function stableEntryUuid(entry, index) {
  const source = `${entry.time}|${entry.type}|${entry.method}|${entry.angler || ""}|${entry.moment}|${index}`;
  let first = 2166136261;
  let second = 2246822519;
  for (const char of source) {
    first = Math.imul(first ^ char.charCodeAt(0), 16777619) >>> 0;
    second = Math.imul(second ^ char.charCodeAt(0), 3266489917) >>> 0;
  }
  const hex = `${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}pa77000000000000`.replace(/[^0-9a-f]/g, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// Seeds are anchored to the start of the trip day, not to the departure estimate.
// Anchoring them to departure would timestamp them ahead of real entries whenever
// the estimate runs late, and the log would render out of order.
const seedAnchor = new Date(`${TRIP.date}T00:00:00-05:00`);

function legacyEntryToShared(entry, index) {
  const stamp = new Date(seedAnchor.getTime() + index * 60000).toISOString();
  return {
    id: stableEntryUuid(entry, index),
    trip_id: TRIP.id,
    time_label: entry.time,
    entry_type: entry.type,
    method: entry.method,
    angler: entry.angler || null,
    moment: entry.moment,
    created_at: stamp,
    updated_at: stamp,
  };
}

function renderSharedSnapshot(snapshot) {
  sharedEntries = snapshot.entries;
  renderTimeline(snapshot.entries);

  const state = snapshot.tripState;
  if (state) {
    if (document.activeElement !== els.tripStatusControl) els.tripStatusControl.value = state.status;
    if (document.activeElement !== els.destinationControl) els.destinationControl.value = state.active_destination;
    els.currentTripStatus.textContent = formatTripStatus(state.status);
    els.currentTripNote.textContent = state.return_note;
    setTrackerDestination(state.active_destination);
  }

  const labels = {
    synced: "Synced",
    pending: "Pending",
    offline: "Offline",
    "local-only": "This phone only",
  };
  els.syncState.textContent = labels[snapshot.syncState] || "Pending";
  els.syncState.dataset.state = snapshot.syncState;
  els.syncError.hidden = !snapshot.error;
  els.syncError.textContent = snapshot.error || "";
}

async function setupSharedBoard() {
  const [{ createSharedStore }, client] = await Promise.all([
    import("./shared-store.js"),
    createSharedClient(),
  ]);
  const localEntries = readEntries();
  const sharedSeeds = localEntries.map(legacyEntryToShared);
  sharedStore = createSharedStore({
    client,
    seeds: sharedSeeds,
    tripSlug: TRIP.slug,
    tripId: TRIP.id,
    cacheKey: `${TRIP.slug}-shared-cache-v1`,
    queueKey: `${TRIP.slug}-shared-queue-v1`,
  });
  sharedStore.subscribe(renderSharedSnapshot);
  await sharedStore.start();
  els.saveTripUpdateButton.disabled = false;
  els.destinationControl.disabled = false;
  await setupSharedPhotos(client, sharedStore.getSnapshot().trip);
  window.addEventListener("online", () => sharedStore.replayQueue());
}

/* ---------- Wire up ---------- */

els.typeInput.addEventListener("change", updateCatchDetailsVisibility);
updateCatchDetailsVisibility();

els.destinationControl.addEventListener("change", async () => {
  const destination = els.destinationControl.value;
  if (!setTrackerDestination(destination) || !sharedStore) return;

  els.destinationControl.disabled = true;
  if (els.destinationSaveState) els.destinationSaveState.textContent = "Saving for everyone...";
  await sharedStore.updateDestination(destination);
  const snapshot = sharedStore.getSnapshot();
  els.destinationControl.disabled = false;
  if (snapshot.error) {
    const savedDestination = snapshot.tripState?.active_destination || DEFAULT_DESTINATION;
    els.destinationControl.value = savedDestination;
    setTrackerDestination(savedDestination);
    if (els.destinationSaveState) els.destinationSaveState.textContent = "Could not save. Try again.";
    return;
  }
  if (els.destinationSaveState) {
    els.destinationSaveState.textContent = snapshot.queuedCount
      ? "Destination queued until the connection returns."
      : "Destination saved.";
  }
});

els.tripUpdateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!sharedStore) return;

  const updateText = els.tripUpdateInput.value.trim();
  if (!updateText) return;

  const status = els.tripStatusControl.value;
  const type = els.typeInput.value;
  const catchEntry = isCatchType(type);
  const length = catchEntry ? els.lengthInput.value.trim() : "";
  const now = new Date();
  const entry = {
    time_label: now.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
    moment: length ? `${updateText} (${length}")` : updateText,
    entry_type: type,
    method: catchEntry
      ? els.methodInput.value
      : (["underway", "heading-home"].includes(status) ? "Running" : "Other"),
    angler: catchEntry ? (els.anglerInput.value || null) : null,
  };

  els.saveTripUpdateButton.disabled = true;
  els.saveTripUpdateButton.textContent = "Saving...";
  await sharedStore.saveTripUpdate({
    state: {
      status,
      active_destination: els.destinationControl.value,
      return_note: entry.moment,
    },
    entry,
  });

  const snapshot = sharedStore.getSnapshot();
  const accepted = !snapshot.error || snapshot.queuedCount > 0;
  els.saveTripUpdateButton.textContent = accepted
    ? (snapshot.queuedCount ? "Update queued" : "Saved to trip log")
    : "Try again";
  els.saveTripUpdateButton.disabled = false;
  if (accepted) {
    els.tripUpdateInput.value = "";
    els.typeInput.value = "Boat life";
    els.methodInput.value = "Jigging";
    els.anglerInput.value = "";
    els.lengthInput.value = "";
    updateCatchDetailsVisibility();
  }
});

els.timeline.addEventListener("click", async (event) => {
  const editButton = event.target.closest("[data-entry-edit]");
  const deleteButton = event.target.closest("[data-entry-delete]");
  if (!sharedStore || (!editButton && !deleteButton)) return;

  if (editButton) {
    const id = editButton.dataset.entryEdit;
    const entry = activeEntries().find((candidate) => candidate.id === id);
    const moment = prompt("Edit this trip log entry", entry?.moment || "");
    if (moment && moment.trim()) await sharedStore.updateEntry(id, { moment: moment.trim() });
  }

  if (deleteButton) {
    const id = deleteButton.dataset.entryDelete;
    if (confirm("Delete this trip log entry?")) await sharedStore.deleteEntry(id);
  }
});

function runStartupTask(name, task) {
  try {
    const result = task();
    if (result && typeof result.catch === "function") {
      result.catch((error) => console.warn(`${name} failed`, error));
    }
  } catch (error) {
    console.warn(`${name} failed`, error);
  }
}

runStartupTask("timer", renderTimer);
runStartupTask("timeline", renderTimeline);
// Give both tracker readouts their real pre-fix guidance instead of the markup default.
runStartupTask("tracker readouts", refreshTrackerEta);
runStartupTask("shared board", setupSharedBoard);
runStartupTask("weather", refreshWeather);
runStartupTask("buoy", refreshBuoy);
runStartupTask("tides", refreshTides);
runStartupTask("map", initMap);
setInterval(renderTimer, 30000);
