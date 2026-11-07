import test from "node:test";
import assert from "node:assert/strict";
import { createSharedStore } from "../shared-store.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    read: (key) => values.get(key) ?? null,
  };
}

const serverSnapshot = {
  trip: { id: "trip-1", slug: "patty-ann-2026-11-07", title: "The Patty Ann" },
  tripState: {
    trip_id: "trip-1",
    status: "underway",
    active_destination: "Democrat Point",
    return_note: "Late afternoon",
  },
  entries: [
    {
      id: "entry-1",
      trip_id: "trip-1",
      time_label: "6:00 AM",
      entry_type: "Boat life",
      method: "Running",
      angler: null,
      moment: "Heading offshore",
      created_at: "2026-08-08T10:00:00Z",
    },
  ],
};

test("missing client starts in local-only mode with seeds", async () => {
  const store = createSharedStore({
    client: null,
    storage: memoryStorage(),
    seeds: serverSnapshot.entries,
  });

  await store.start();

  assert.equal(store.getSnapshot().syncState, "local-only");
  assert.deepEqual(store.getSnapshot().entries, serverSnapshot.entries);
});

test("local-only edits persist without creating an unreplayable queue", async () => {
  const storage = memoryStorage();
  const store = createSharedStore({
    client: null,
    storage,
    seeds: serverSnapshot.entries,
    uuid: () => "local-entry",
  });
  await store.start();

  await store.saveTripUpdate({
    state: {
      status: "underway",
      active_destination: "Democrat Point",
      return_note: "Local fallback still works",
    },
    entry: {
      time_label: "7:30 AM",
      entry_type: "Quote",
      method: "Other",
      moment: "Local fallback still works",
    },
  });

  assert.equal(store.getSnapshot().syncState, "local-only");
  assert.equal(store.getSnapshot().queuedCount, 0);
  assert.equal(storage.read("patty-ann-shared-queue-v1"), null);
  assert.match(storage.read("patty-ann-shared-cache-v1"), /Local fallback still works/);
});

test("cached snapshot renders before server load and is replaced", async () => {
  let resolveLoad;
  const cached = { ...serverSnapshot, entries: [{ ...serverSnapshot.entries[0], id: "cached" }] };
  const storage = memoryStorage({
    "patty-ann-shared-cache-v1": JSON.stringify(cached),
  });
  const client = {
    load: () => new Promise((resolve) => (resolveLoad = resolve)),
    subscribe: () => () => {},
  };
  const store = createSharedStore({ client, storage });

  const starting = store.start();
  assert.equal(store.getSnapshot().entries[0].id, "cached");
  resolveLoad(serverSnapshot);
  await starting;

  assert.equal(store.getSnapshot().entries[0].id, "entry-1");
  assert.equal(store.getSnapshot().syncState, "synced");
});

test("offline create is durable and replays once with its client UUID", async () => {
  const storage = memoryStorage();
  let isOnline = false;
  const mutations = [];
  const client = {
    load: async () => serverSnapshot,
    subscribe: () => () => {},
    mutate: async (mutation) => mutations.push(mutation),
  };
  const store = createSharedStore({
    client,
    storage,
    online: () => isOnline,
    uuid: () => "entry-offline",
  });
  await store.start();

  await store.saveTripUpdate({
    state: {
      status: "fishing",
      active_destination: "Democrat Point",
      return_note: "Bluefin at the rail",
    },
    entry: {
      id: "entry-offline",
      time_label: "7:00 AM",
      entry_type: "Tuna",
      method: "Jig",
      angler: "Will",
      moment: "Bluefin at the rail",
    },
  });

  assert.equal(store.getSnapshot().syncState, "offline");
  assert.equal(store.getSnapshot().queuedCount, 2);
  assert.match(storage.read("patty-ann-shared-queue-v1"), /entry-offline/);

  isOnline = true;
  await store.replayQueue();
  await store.replayQueue();

  assert.equal(mutations.length, 2);
  assert.equal(mutations[1].row.id, "entry-offline");
  assert.equal(store.getSnapshot().syncState, "synced");
});

test("one trip update queues live state and its log entry together in order", async () => {
  let isOnline = false;
  let uuidCount = 0;
  const mutations = [];
  const store = createSharedStore({
    client: {
      load: async () => serverSnapshot,
      subscribe: () => () => {},
      mutate: async (mutation) => mutations.push(mutation.kind),
    },
    storage: memoryStorage(),
    online: () => isOnline,
    uuid: () => `queued-${++uuidCount}`,
  });
  await store.start();

  await store.saveTripUpdate({
    state: {
      status: "fishing",
      active_destination: "Democrat Point",
      return_note: "Still trolling, no fish yet",
    },
    entry: {
      id: "trip-update-entry",
      time_label: "8:00 AM",
      entry_type: "Boat life",
      method: "Other",
      moment: "Still trolling, no fish yet",
    },
  });

  assert.equal(store.getSnapshot().queuedCount, 2);
  assert.equal(store.getSnapshot().tripState.return_note, "Still trolling, no fish yet");
  assert.equal(store.getSnapshot().entries.at(-1).id, "trip-update-entry");

  isOnline = true;
  await store.replayQueue();

  assert.deepEqual(mutations, ["update-state", "create-entry"]);
  assert.equal(store.getSnapshot().queuedCount, 0);
});

test("provided deterministic import UUID is preserved", async () => {
  const mutations = [];
  const store = createSharedStore({
    client: {
      load: async () => serverSnapshot,
      subscribe: () => () => {},
      mutate: async (mutation) => mutations.push(mutation),
    },
    storage: memoryStorage(),
  });
  await store.start();

  await store.saveTripUpdate({
    state: {
      status: "recap",
      active_destination: "Home",
      return_note: "Publish once",
    },
    entry: {
      id: "11111111-1111-4111-8111-111111111111",
      time_label: "Imported",
      entry_type: "Quote",
      method: "Other",
      moment: "Publish once",
    },
  });

  assert.equal(mutations[1].row.id, "11111111-1111-4111-8111-111111111111");
});

test("queued create update delete replay in original order", async () => {
  let isOnline = false;
  const mutations = [];
  const store = createSharedStore({
    client: {
      load: async () => serverSnapshot,
      subscribe: () => () => {},
      mutate: async (mutation) => mutations.push(mutation.kind),
    },
    storage: memoryStorage(),
    online: () => isOnline,
    uuid: () => "entry-ordered",
  });
  await store.start();
  await store.saveTripUpdate({
    state: {
      status: "underway",
      active_destination: "Democrat Point",
      return_note: "First draft",
    },
    entry: {
      id: "entry-ordered",
      time_label: "7:15 AM",
      entry_type: "Boat life",
      method: "Running",
      moment: "First draft",
    },
  });
  await store.updateEntry("entry-ordered", { moment: "Edited draft" });
  await store.deleteEntry("entry-ordered");
  isOnline = true;

  await store.replayQueue();

  assert.deepEqual(mutations, ["update-state", "create-entry", "update-entry", "delete-entry"]);
  assert.equal(store.getSnapshot().entries.some((entry) => entry.id === "entry-ordered"), false);
});

test("realtime events reconcile rows by ID without duplicate echoes", async () => {
  let receive;
  const store = createSharedStore({
    client: {
      load: async () => serverSnapshot,
      subscribe: (handler) => {
        receive = handler;
        return () => {};
      },
    },
    storage: memoryStorage(),
  });
  await store.start();

  receive({ table: "trip_log_entries", eventType: "INSERT", new: serverSnapshot.entries[0] });
  assert.equal(store.getSnapshot().entries.length, 1);
  receive({
    table: "trip_log_entries",
    eventType: "UPDATE",
    new: { ...serverSnapshot.entries[0], moment: "Updated remotely" },
  });
  assert.equal(store.getSnapshot().entries[0].moment, "Updated remotely");
  receive({ table: "trip_log_entries", eventType: "DELETE", old: { id: "entry-1" } });
  assert.equal(store.getSnapshot().entries.length, 0);
});

test("trip state realtime updates preserve local-only GPS boundary", async () => {
  let receive;
  const store = createSharedStore({
    client: {
      load: async () => serverSnapshot,
      subscribe: (handler) => {
        receive = handler;
        return () => {};
      },
    },
    storage: memoryStorage(),
  });
  await store.start();
  receive({
    table: "trip_state",
    eventType: "UPDATE",
    new: { ...serverSnapshot.tripState, active_destination: "Fire Island Reef" },
  });

  const snapshot = store.getSnapshot();
  assert.equal(snapshot.tripState.active_destination, "Fire Island Reef");
  assert.doesNotMatch(JSON.stringify(snapshot), /latitude|longitude|coordinates/);
});

test("a rejected trip update is rolled back and cannot poison later saves", async () => {
  const mutations = [];
  let rejectNextEntry = true;
  const store = createSharedStore({
    client: {
      load: async () => serverSnapshot,
      subscribe: () => () => {},
      mutate: async (mutation) => {
        mutations.push(mutation);
        if (mutation.kind === "create-entry" && rejectNextEntry) {
          rejectNextEntry = false;
          throw new Error('new row violates check constraint "trip_state_return_note_check"');
        }
      },
    },
    storage: memoryStorage(),
  });
  await store.start();

  await store.saveTripUpdate({
    state: {
      status: "fishing",
      active_destination: "Democrat Point",
      return_note: "Invalid first update",
    },
    entry: {
      id: "rejected-entry",
      time_label: "8:00 AM",
      entry_type: "Boat life",
      method: "Other",
      moment: "Invalid first update",
    },
  });

  assert.equal(store.getSnapshot().queuedCount, 0);
  assert.equal(store.getSnapshot().syncState, "synced");
  assert.equal(store.getSnapshot().tripState.return_note, "Late afternoon");
  assert.equal(store.getSnapshot().error, "That update contains an invalid or oversized value.");

  await store.saveTripUpdate({
    state: {
      status: "fishing",
      active_destination: "Democrat Point",
      return_note: "Back at Captree, exact time TBD",
    },
    entry: {
      id: "accepted-entry",
      time_label: "8:15 AM",
      entry_type: "Boat life",
      method: "Other",
      moment: "Back at Captree, exact time TBD",
    },
  });

  assert.equal(mutations.length, 4);
  assert.equal(store.getSnapshot().queuedCount, 0);
  assert.equal(store.getSnapshot().syncState, "synced");
  assert.equal(store.getSnapshot().error, null);
});

test("the store exposes only the single create flow plus edit and delete", () => {
  const store = createSharedStore({ client: null, storage: memoryStorage() });

  assert.equal(store.addEntry, undefined);
  assert.equal(store.updateTripState, undefined);
  assert.equal(typeof store.saveTripUpdate, "function");
  assert.equal(typeof store.updateDestination, "function");
  assert.equal(typeof store.updateEntry, "function");
  assert.equal(typeof store.deleteEntry, "function");
});

test("destination-only updates shared trip state without creating a log entry", async () => {
  const mutations = [];
  const store = createSharedStore({
    client: {
      load: async () => serverSnapshot,
      subscribe: () => () => {},
      mutate: async (mutation) => mutations.push(mutation),
    },
    storage: memoryStorage(),
    now: () => "2026-08-08T19:58:00.000Z",
  });
  await store.start();

  await store.updateDestination("Lighthouse beachfront");

  assert.equal(store.getSnapshot().tripState.active_destination, "Lighthouse beachfront");
  assert.equal(store.getSnapshot().entries.length, 1);
  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].kind, "update-state");
  assert.equal(mutations[0].row.active_destination, "Lighthouse beachfront");
  assert.equal(mutations[0].row.return_note, "Late afternoon");
});
