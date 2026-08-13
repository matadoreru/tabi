class OfflineTripCache {
  open() {
    if (!globalThis.indexedDB) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("tabi-offline-v1", 2);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("trips")) {
          request.result.createObjectStore("trips", { keyPath: "id" });
        }
        if (!request.result.objectStoreNames.contains("outbox")) {
          request.result.createObjectStore("outbox", { keyPath: "queueId" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async get(id) {
    const database = await this.open().catch(() => null);
    if (!database) return null;
    return await new Promise((resolve) => {
      const request = database.transaction("trips").objectStore("trips").get(id);
      request.onsuccess = () => resolve(request.result?.payload || null);
      request.onerror = () => resolve(null);
    });
  }
  async put(id, payload) {
    const database = await this.open().catch(() => null);
    if (!database) return;
    await new Promise((resolve, reject) => {
      const request = database.transaction("trips", "readwrite").objectStore("trips").put({
        id,
        payload,
        cachedAt: Date.now(),
      });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  async queue(operation) {
    const database = await this.open();
    await new Promise((resolve, reject) => {
      const request = database.transaction("outbox", "readwrite").objectStore("outbox").put({
        ...operation,
        queueId: crypto.randomUUID(),
        queuedAt: Date.now(),
      });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  async queued(tripId) {
    const database = await this.open().catch(() => null);
    if (!database) return [];
    return await new Promise((resolve) => {
      const request = database.transaction("outbox").objectStore("outbox").getAll();
      request.onsuccess = () => resolve(request.result.filter((item) => item.tripId === tripId));
      request.onerror = () => resolve([]);
    });
  }
  async dequeue(queueId) {
    const database = await this.open();
    await new Promise((resolve, reject) => {
      const request = database.transaction("outbox", "readwrite").objectStore("outbox").delete(queueId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  async clearAll() {
    const database = await this.open().catch(() => null);
    if (!database) return;
    await Promise.all(["trips", "outbox"].map((name) =>
      new Promise((resolve) => {
        const request = database.transaction(name, "readwrite").objectStore(name).clear();
        request.onsuccess = request.onerror = () => resolve();
      })
    ));
  }
  async diagnostics(tripId = "") {
    const database = await this.open().catch(() => null);
    if (!database) return { available: false, cachedTrips: 0, queuedChanges: 0, cachedAt: null };
    const [trips, outbox] = await Promise.all(["trips", "outbox"].map((name) =>
      new Promise((resolve) => {
        const request = database.transaction(name).objectStore(name).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => resolve([]);
      })
    ));
    return {
      available: true,
      cachedTrips: trips.length,
      queuedChanges: outbox.length,
      cachedAt: trips.find((item) => item.id === tripId)?.cachedAt || null,
    };
  }
}

export const tripCache = new OfflineTripCache();
