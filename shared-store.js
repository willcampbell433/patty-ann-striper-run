const DEFAULT_CACHE_KEY = "patty-ann-shared-cache-v1";
const DEFAULT_QUEUE_KEY = "patty-ann-shared-queue-v1";
const DEFAULT_TRIP_SLUG = "patty-ann-2026-11-07";
const DEFAULT_TRIP_ID = "a7770000-0000-4000-8000-000000000001";
const DEFAULT_RETURN_NOTE = "Back at Captree, exact time TBD";

function parseStored(storage, key, fallback) {
  try {
    const parsed = JSON.parse(storage?.getItem(key));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function sortEntries(entries) {
  return [...entries].sort((left, right) => {
    const byCreated = String(left.created_at || "").localeCompare(String(right.created_at || ""));
    return byCreated || String(left.id).localeCompare(String(right.id));
  });
}

function plainError(error) {
  const message = error?.message || String(error || "Shared board update failed");
  if (/check constraint|violates check/i.test(message)) return "That update contains an invalid or oversized value.";
  if (/network|fetch|offline/i.test(message)) return "Connection unavailable. Your update is still queued.";
  return message;
}

function isRejectedValue(error) {
  const message = error?.message || String(error || "");
  return error?.code === "23514" || /check constraint|violates check/i.test(message);
}

export function createSharedStore({
  client,
  storage = globalThis.localStorage,
  online = () => globalThis.navigator?.onLine !== false,
  uuid = () => globalThis.crypto.randomUUID(),
  now = () => new Date().toISOString(),
  seeds = [],
  tripSlug = DEFAULT_TRIP_SLUG,
  tripId: configuredTripId = DEFAULT_TRIP_ID,
  defaultReturnNote = DEFAULT_RETURN_NOTE,
  cacheKey = DEFAULT_CACHE_KEY,
  queueKey = DEFAULT_QUEUE_KEY,
} = {}) {
  const cached = parseStored(storage, cacheKey, null);
  let queue = parseStored(storage, queueKey, []);
  if (!Array.isArray(queue)) queue = [];
  let snapshot = {
    mode: client ? "shared" : "local",
    syncState: client ? "pending" : "local-only",
    trip: cached?.trip || null,
    tripState: cached?.tripState || null,
    entries: sortEntries(cached?.entries || seeds),
    queuedCount: queue.length,
    error: null,
  };
  const listeners = new Set();
  let unsubscribeRemote = null;

  function emit() {
    snapshot.queuedCount = queue.length;
    listeners.forEach((listener) => listener(snapshot));
  }

  function cacheSnapshot() {
    storage?.setItem(
      cacheKey,
      JSON.stringify({ trip: snapshot.trip, tripState: snapshot.tripState, entries: snapshot.entries }),
    );
  }

  function persistQueue() {
    storage?.setItem(queueKey, JSON.stringify(queue));
  }

  /** The trip this store writes to, preferring whatever the server last confirmed. */
  function resolveTripId() {
    return snapshot.tripState?.trip_id || snapshot.trip?.id || configuredTripId;
  }

  function setSyncState(syncState, error = null) {
    snapshot.syncState = syncState;
    snapshot.error = error;
    emit();
  }

  function reconcile(event) {
    if (event.table === "trip_state" && event.eventType !== "DELETE") {
      snapshot.tripState = event.new;
    }
    if (event.table === "trip_log_entries") {
      const id = event.eventType === "DELETE" ? event.old?.id : event.new?.id;
      const remaining = snapshot.entries.filter((entry) => entry.id !== id);
      snapshot.entries = event.eventType === "DELETE"
        ? remaining
        : sortEntries([...remaining, event.new]);
    }
    cacheSnapshot();
    emit();
  }

  function enqueue(mutation) {
    queue.push({ id: uuid(), queued_at: now(), ...mutation });
    persistQueue();
  }

  function acknowledge(mutation) {
    if (mutation.kind === "create-entry" || mutation.kind === "update-entry") {
      snapshot.entries = snapshot.entries.map((entry) =>
        entry.id === mutation.row.id ? { ...entry, _pending: false } : entry,
      );
    }
    if (mutation.kind === "update-state" && snapshot.tripState) {
      snapshot.tripState = { ...snapshot.tripState, _pending: false };
    }
    cacheSnapshot();
  }

  async function replayQueue() {
    if (!client) {
      setSyncState("local-only");
      return;
    }
    if (!online()) {
      setSyncState("offline");
      return;
    }
    if (!queue.length) {
      setSyncState("synced");
      return;
    }

    setSyncState("pending");
    while (queue.length && online()) {
      const mutation = queue[0];
      try {
        await client.mutate(mutation);
        acknowledge(mutation);
        queue.shift();
        persistQueue();
      } catch (error) {
        if (isRejectedValue(error)) {
          queue.shift();
          persistQueue();
          try {
            const remote = await client.load(snapshot.trip?.slug || tripSlug);
            snapshot = {
              ...snapshot,
              syncState: queue.length ? "pending" : "synced",
              trip: remote.trip,
              tripState: remote.tripState,
              entries: sortEntries(remote.entries || []),
              error: plainError(error),
            };
            cacheSnapshot();
            emit();
            if (queue.length) continue;
            return;
          } catch (reloadError) {
            setSyncState(online() ? "pending" : "offline", plainError(reloadError));
            return;
          }
        }
        setSyncState(online() ? "pending" : "offline", plainError(error));
        return;
      }
    }
    setSyncState(queue.length ? "offline" : "synced");
  }

  async function start() {
    emit();
    if (!client) {
      setSyncState("local-only");
      return snapshot;
    }
    try {
      const remote = await client.load(tripSlug);
      snapshot = {
        ...snapshot,
        mode: "shared",
        syncState: queue.length ? "pending" : "synced",
        trip: remote.trip,
        tripState: remote.tripState,
        entries: sortEntries(remote.entries || []),
        error: null,
      };
      cacheSnapshot();
      unsubscribeRemote = client.subscribe?.(reconcile) || null;
      emit();
      await replayQueue();
    } catch (error) {
      setSyncState("offline", plainError(error));
    }
    return snapshot;
  }

  async function updateEntry(id, patch) {
    const existing = snapshot.entries.find((entry) => entry.id === id);
    if (!existing) return;
    const row = { ...existing, ...patch, id, updated_at: now() };
    delete row._pending;
    snapshot.entries = snapshot.entries.map((entry) =>
      entry.id === id ? { ...row, _pending: Boolean(client) } : entry,
    );
    if (client) enqueue({ kind: "update-entry", row });
    cacheSnapshot();
    emit();
    await replayQueue();
  }

  async function deleteEntry(id) {
    snapshot.entries = snapshot.entries.filter((entry) => entry.id !== id);
    if (client) enqueue({ kind: "delete-entry", id });
    cacheSnapshot();
    emit();
    await replayQueue();
  }

  async function updateDestination(activeDestination) {
    const timestamp = now();
    const tripId = resolveTripId();
    const stateRow = {
      status: "underway",
      return_note: defaultReturnNote,
      ...snapshot.tripState,
      trip_id: tripId,
      active_destination: activeDestination,
      updated_at: timestamp,
    };
    delete stateRow._pending;

    snapshot.tripState = { ...stateRow, _pending: Boolean(client) };
    if (client) enqueue({ kind: "update-state", row: stateRow });
    cacheSnapshot();
    emit();
    await replayQueue();
    return stateRow;
  }

  async function saveTripUpdate({ state, entry }) {
    const timestamp = now();
    const tripId = resolveTripId();
    const stateRow = {
      ...snapshot.tripState,
      ...state,
      trip_id: tripId,
      updated_at: timestamp,
    };
    const entryRow = {
      id: entry.id || uuid(),
      trip_id: tripId,
      time_label: entry.time_label,
      entry_type: entry.entry_type,
      method: entry.method,
      angler: entry.angler || null,
      moment: entry.moment,
      created_at: entry.created_at || timestamp,
      updated_at: entry.updated_at || timestamp,
    };
    delete stateRow._pending;

    snapshot.tripState = { ...stateRow, _pending: Boolean(client) };
    snapshot.entries = sortEntries([
      ...snapshot.entries,
      { ...entryRow, _pending: Boolean(client) },
    ]);
    if (client) {
      enqueue({ kind: "update-state", row: stateRow });
      enqueue({ kind: "create-entry", row: entryRow });
    }
    cacheSnapshot();
    emit();
    await replayQueue();
    return { state: stateRow, entry: entryRow };
  }

  return {
    start,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot);
      return () => listeners.delete(listener);
    },
    updateEntry,
    deleteEntry,
    updateDestination,
    saveTripUpdate,
    replayQueue,
    destroy() {
      unsubscribeRemote?.();
      listeners.clear();
    },
  };
}
