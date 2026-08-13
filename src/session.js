import { apiClient } from "./api-client.js";

const SESSION_CACHE_KEY = "tabi-session-cache-v1";
const clearPrivateMediaCache = () =>
  globalThis.navigator?.serviceWorker?.controller?.postMessage({ type: "CLEAR_PRIVATE_CACHE" });

export class SessionContext {
  constructor() {
    this.currentUser = null;
    this.currentTrip = null;
    this.currentMembership = null;
    this.currentPermissions = [];
    this.trips = [];
    this.loading = true;
  }
  can(permission) {
    return this.currentPermissions.includes(permission);
  }
  async restore() {
    try {
      this.currentUser = (await apiClient.get("/me")).user;
      await this.loadTrips();
    } catch (error) {
      const cached = globalThis.navigator?.onLine === false || error instanceof TypeError ? this.cachedSession() : null;
      this.currentUser = cached?.user || null;
      this.trips = cached?.trips || [];
      this.offline = Boolean(cached);
    } finally {
      this.loading = false;
    }
  }
  async login(values) {
    clearPrivateMediaCache();
    this.currentUser = (await apiClient.post("/auth/login", values)).user;
    await this.loadTrips();
  }
  async register(values) {
    clearPrivateMediaCache();
    this.currentUser = (await apiClient.post("/auth/register", values)).user;
    await this.loadTrips();
  }
  async logout() {
    try {
      await apiClient.post("/auth/logout");
    } finally {
      this.currentUser = null;
      this.currentTrip = null;
      this.currentMembership = null;
      this.currentPermissions = [];
      this.trips = [];
      localStorage.removeItem(SESSION_CACHE_KEY);
    }
  }
  async loadTrips() {
    this.trips = (await apiClient.get("/trips")).trips;
    localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({ user: this.currentUser, trips: this.trips }));
    return this.trips;
  }
  cachedSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_CACHE_KEY) || "null");
    } catch {
      return null;
    }
  }
  selectTrip(payload) {
    this.currentTrip = payload.trip;
    this.currentMembership = payload.membership;
    this.currentPermissions = payload.permissions || payload.membership?.permissions || [];
  }
  clearTrip() {
    this.currentTrip = null;
    this.currentMembership = null;
    this.currentPermissions = [];
  }
}

export const session = new SessionContext();
