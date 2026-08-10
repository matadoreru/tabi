import { apiClient } from "./api-client.js";

const SETTINGS_KEY = "tabi-settings-v2";
const LEGACY_KEY = "tabi-data-v1";
const COLLECTIONS = [
  "activities",
  "places",
  "tasks",
  "purchases",
  "expenses",
  "funds",
  "stays",
  "transports",
  "reservations",
  "documents",
  "inspirations",
];

export class Store {
  constructor() {
    this.listeners = new Set();
    this.eventSource = null;
    this.state = {
      settings: this.loadSettings(),
      trips: [],
      activeTripId: "",
      members: [],
      invitations: [],
      logs: [],
      ...Object.fromEntries(COLLECTIONS.map((name) => [name, []])),
    };
  }
  loadSettings() {
    try {
      return {
        theme: "system",
        exchangeRate: .0058,
        defaultCurrency: "JPY",
        dayStart: "08:00",
        dayEnd: "22:00",
        ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"),
      };
    } catch {
      return { theme: "system", exchangeRate: .0058, dayStart: "08:00", dayEnd: "22:00" };
    }
  }
  getState() {
    return this.state;
  }
  get activeTrip() {
    return this.state.trips.find((trip) => trip.id === this.state.activeTripId);
  }
  collection(name) {
    return this.state[name] || [];
  }
  async loadTrip(tripId, onRemoteChange) {
    const payload = await apiClient.get(`/trips/${tripId}/bootstrap`);
    this.state = { ...this.state, ...payload, trips: [payload.trip], activeTripId: tripId };
    this.connectEvents(tripId, onRemoteChange);
    this.notify();
    return payload;
  }
  reload() {
    if (this.state.activeTripId) return this.loadTrip(this.state.activeTripId);
  }
  update(mutator) {
    const next = structuredClone(this.state);
    mutator(next);
    this.state = next;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next.settings));
    this.notify();
  }
  async add(collection, item) {
    const result = await apiClient.post(`/trips/${this.state.activeTripId}/${collection}`, item);
    this.state[collection].push(result.item);
    this.notify();
    return result.item;
  }
  async edit(collection, id, changes) {
    const current = this.state[collection].find((item) => item.id === id);
    const result = await apiClient.patch(`/trips/${this.state.activeTripId}/${collection}/${id}`, {
      ...changes,
      version: current?.version,
    });
    const index = this.state[collection].findIndex((item) => item.id === id);
    if (index >= 0) this.state[collection][index] = result.item;
    this.notify();
    return result.item;
  }
  async remove(collection, id) {
    await apiClient.delete(`/trips/${this.state.activeTripId}/${collection}/${id}`);
    this.state[collection] = this.state[collection].filter((item) => item.id !== id);
    this.notify();
  }
  hasLegacyData() {
    return Boolean(localStorage.getItem(LEGACY_KEY));
  }
  legacyData() {
    try {
      return JSON.parse(localStorage.getItem(LEGACY_KEY) || "null");
    } catch {
      return null;
    }
  }
  clearLegacyData() {
    localStorage.removeItem(LEGACY_KEY);
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  notify() {
    this.listeners.forEach((listener) => listener(this.state));
  }
  connectEvents(tripId, onRemoteChange) {
    this.eventSource?.close();
    const source = new EventSource(`/api/trips/${tripId}/events`);
    this.eventSource = source;
    source.addEventListener("trip-change", async (event) => {
      const change = JSON.parse(event.data);
      if (onRemoteChange) await onRemoteChange(change);
    });
  }
  closeEvents() {
    this.eventSource?.close();
    this.eventSource = null;
  }
}
