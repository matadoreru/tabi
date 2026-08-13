import { apiClient } from "./api-client.js";
import { rateKey } from "./currency.js";
import { tripCache } from "./offline-cache.js";

const SETTINGS_KEY = "tabi-settings-v2";
const LEGACY_KEY = "tabi-data-v1";
const EXCHANGE_RATE_CLIENT_TTL_MS = 12 * 60 * 60 * 1000;
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
  "inspirations",
  "notes",
  "reminders",
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
      financialTransactions: [],
      expenseSplits: [],
      settlementBalances: [],
      settlementTransfers: [],
      connectionStatus: "online",
      exchangeRates: {},
      exchangeRateMeta: {},
      ...Object.fromEntries(COLLECTIONS.map((name) => [name, []])),
    };
  }
  loadSettings() {
    try {
      return {
        theme: "system",
        dayStart: "08:00",
        dayEnd: "22:00",
        ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"),
      };
    } catch {
      return { theme: "system", dayStart: "08:00", dayEnd: "22:00" };
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
    let payload;
    try {
      payload = await apiClient.get(`/trips/${tripId}/bootstrap`);
      await tripCache.put(tripId, payload);
      this.state.connectionStatus = "online";
    } catch (error) {
      if (globalThis.navigator?.onLine !== false && !(error instanceof TypeError)) throw error;
      payload = await tripCache.get(tripId);
      if (!payload) throw error;
      payload = { ...payload, offline: true };
      this.state.connectionStatus = "offline";
    }
    for (const queued of await tripCache.queued(tripId)) {
      payload[queued.collection] ||= [];
      if (!payload[queued.collection].some((item) => item.id === queued.temporaryId)) {
        payload[queued.collection].push({
          ...queued.item,
          id: queued.temporaryId,
          tripId,
          version: 0,
          offlinePending: true,
        });
      }
    }
    const exchange = await this.loadExchangeRates(payload);
    this.state = { ...this.state, ...payload, ...exchange, trips: [payload.trip], activeTripId: tripId };
    this.connectEvents(tripId, onRemoteChange);
    this.notify();
    return payload;
  }
  async loadExchangeRates(payload, force = false) {
    const trip = payload.trip;
    const primary = trip.currency;
    const secondary = trip.secondaryCurrency;
    const currencies = new Set([trip.budgetCurrency || primary, secondary]);
    for (const collection of COLLECTIONS) {
      for (const item of payload[collection] || []) currencies.add(item.currency || primary);
    }
    const pairs = [...currencies].filter((currency) => currency && currency !== primary).map((currency) => [
      currency,
      primary,
    ]);
    if (trip.exchangeRateMode === "automatic" && secondary !== primary) pairs.push([primary, secondary]);
    const uniquePairs = [...new Map(pairs.map((pair) => [rateKey(...pair), pair])).values()];
    const rates = {};
    const meta = {};
    if (trip.exchangeRateMode === "manual") {
      const manual = Number(trip.manualExchangeRate || 0);
      if (manual > 0) {
        rates[rateKey(primary, secondary)] = manual;
        rates[rateKey(secondary, primary)] = 1 / manual;
        meta[rateKey(primary, secondary)] = { provider: "manual", rate: manual };
      }
    }
    await Promise.all(uniquePairs.map(async ([base, quote]) => {
      if (trip.exchangeRateMode === "manual" && base === primary && quote === secondary) return;
      const key = rateKey(base, quote);
      const existingMeta = this.state.exchangeRateMeta?.[key];
      const existingRate = Number(this.state.exchangeRates?.[key]);
      if (
        !force && existingRate > 0 && existingMeta?.fetchedAt &&
        Date.now() - Date.parse(existingMeta.fetchedAt) < EXCHANGE_RATE_CLIENT_TTL_MS
      ) {
        rates[key] = existingRate;
        rates[rateKey(quote, base)] = 1 / existingRate;
        meta[key] = existingMeta;
        return;
      }
      try {
        const result = force
          ? await apiClient.post("/exchange-rates", { base, quote, force: true })
          : await apiClient.get(`/exchange-rates?base=${encodeURIComponent(base)}&quote=${encodeURIComponent(quote)}`);
        rates[key] = Number(result.rate);
        rates[rateKey(quote, base)] = 1 / Number(result.rate);
        meta[key] = result;
      } catch (error) {
        meta[key] = { error: error.message };
      }
    }));
    return { exchangeRates: rates, exchangeRateMeta: meta };
  }
  async refreshExchangeRates(force = true) {
    if (!this.activeTrip) return;
    const exchange = await this.loadExchangeRates(this.state, force);
    this.state = { ...this.state, ...exchange };
    this.notify();
    return exchange;
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
    if (globalThis.navigator?.onLine === false) {
      const pending = {
        ...item,
        id: `offline_${crypto.randomUUID().replaceAll("-", "")}`,
        tripId: this.state.activeTripId,
        version: 0,
        offlinePending: true,
      };
      await tripCache.queue({ tripId: this.state.activeTripId, collection, temporaryId: pending.id, item });
      this.state[collection].push(pending);
      this.state.connectionStatus = "offline";
      this.notify();
      return pending;
    }
    const result = await apiClient.post(`/trips/${this.state.activeTripId}/${collection}`, item);
    this.state[collection].push(result.item);
    this.applyFinancialResult(result);
    await this.persistCurrentTrip();
    this.notify();
    return result.item;
  }
  async flushOutbox() {
    if (!this.state.activeTripId || globalThis.navigator?.onLine === false) return;
    for (const queued of await tripCache.queued(this.state.activeTripId)) {
      try {
        const result = await apiClient.post(`/trips/${queued.tripId}/${queued.collection}`, queued.item);
        const index = this.state[queued.collection].findIndex((item) => item.id === queued.temporaryId);
        if (index >= 0) this.state[queued.collection][index] = result.item;
        this.applyFinancialResult(result);
        await tripCache.dequeue(queued.queueId);
      } catch (error) {
        if (error instanceof TypeError) break;
        this.state.connectionStatus = "sync-error";
        break;
      }
    }
    await this.persistCurrentTrip();
    this.notify();
  }
  async edit(collection, id, changes) {
    const current = this.state[collection].find((item) => item.id === id);
    if (current?.offlinePending) throw new Error("El borrador debe sincronizarse antes de editarlo.");
    const result = await apiClient.patch(`/trips/${this.state.activeTripId}/${collection}/${id}`, {
      ...changes,
      version: current?.version,
    });
    const index = this.state[collection].findIndex((item) => item.id === id);
    if (index >= 0) this.state[collection][index] = result.item;
    this.applyFinancialResult(result);
    await this.persistCurrentTrip();
    this.notify();
    return result.item;
  }
  async remove(collection, id) {
    const current = this.state[collection].find((item) => item.id === id);
    if (current?.offlinePending) throw new Error("El borrador debe sincronizarse antes de eliminarlo.");
    const result = await apiClient.delete(`/trips/${this.state.activeTripId}/${collection}/${id}`, {
      version: current?.version,
    });
    this.state[collection] = this.state[collection].filter((item) => item.id !== id);
    this.applyFinancialResult(result);
    await this.persistCurrentTrip();
    this.notify();
  }
  applyFinancialResult(result) {
    for (const key of ["financialTransactions", "expenseSplits", "settlementBalances", "settlementTransfers"]) {
      if (result?.[key]) this.state[key] = result[key];
    }
  }
  persistCurrentTrip() {
    if (!this.state.activeTripId) return Promise.resolve();
    return tripCache.put(this.state.activeTripId, { ...this.state, trip: this.activeTrip });
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
    source.onopen = () => {
      this.state.connectionStatus = "online";
      this.flushOutbox();
      this.notify();
    };
    source.onerror = () => {
      this.state.connectionStatus = navigator.onLine ? "reconnecting" : "offline";
      this.notify();
    };
    source.addEventListener("trip-change", async (event) => {
      const change = JSON.parse(event.data);
      if (onRemoteChange) await onRemoteChange(change);
    });
  }
  closeEvents() {
    this.eventSource?.close();
    this.eventSource = null;
  }
  clearOfflineData() {
    return tripCache.clearAll();
  }
}
