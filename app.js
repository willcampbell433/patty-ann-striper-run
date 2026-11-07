import {
  TRIP,
  CREW,
  POINTS,
  ROUTE_KEYS,
  OFF_TRACK_KEYS,
  SOURCES,
  CATCH_TYPES,
  SEED_ENTRIES,
} from "./trip-config.js";

const departure = new Date(TRIP.departureIso);
const storageKey = `${TRIP.slug}-log-v1`;

const route = ROUTE_KEYS.map((key) => POINTS[key]);
const crew = CREW.map((member) => member.name);

const onboardConditions = {
  waterTempF: null,
  source: "the Patty Ann's electronics",
  observed: "waiting on the first onboard reading",
};

const seedEntries = SEED_ENTRIES;

const tideFallback = SOURCES.tideFallback;

const els = {
  lastUpdate: document.querySelector("#lastUpdate"),
  catchCount: document.querySelector("#catchCount"),
  timeline: document.querySelector("#timelineList"),
  replacementGrade: document.querySelector("#replacementGrade"),
  tideList: document.querySelector("#tideList"),
  runDistance: document.querySelector("#runDistance"),
  crewTally: document.querySelector("#crewTally"),
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
};

let sharedStore = null;
let sharedEntries = null;

function entryTime(entry) {
  return entry.time_label ?? entry.time ?? "Update";
}

function entryType(entry) {
  return entry.entry_type ?? entry.type ?? "Boat life";
}

function isCatchType(type) {
  return CATCH_TYPES.includes(type);
}

/**
 * The trip is closed out, so the scoreboard reports what the log holds rather
 * than guessing at a live status.
 */
function tripStatusLabel(catchCount) {
  if (catchCount > 0) return `${catchCount} bass, three keepers`;
  return "Logged and docked";
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

function initMap() {
  if (typeof L === "undefined") {
    console.warn("Leaflet failed to load; the rest of the board still works.");
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

}

/* ---------- Live weather (Open-Meteo) ---------- */

function compass(deg) {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
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
        // The trip is over, so the gallery reads as a story: dock first, ride home last.
        await supabase.from("trip_photos").select("*").eq("trip_id", tripId).order("created_at", { ascending: true }),
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
      .sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)));
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
  await setupSharedPhotos(client, sharedStore.getSnapshot().trip);
  window.addEventListener("online", () => sharedStore.replayQueue());
}

/* ---------- Wire up ---------- */

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

runStartupTask("timeline", renderTimeline);
runStartupTask("shared board", setupSharedBoard);
runStartupTask("buoy", refreshBuoy);
runStartupTask("tides", refreshTides);
runStartupTask("map", initMap);
