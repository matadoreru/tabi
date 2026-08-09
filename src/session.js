import { apiClient } from "./api-client.js";

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
    } catch {
      this.currentUser = null;
    } finally {
      this.loading = false;
    }
  }
  async login(values) {
    this.currentUser = (await apiClient.post("/auth/login", values)).user;
    await this.loadTrips();
  }
  async register(values) {
    this.currentUser = (await apiClient.post("/auth/register", values)).user;
    await this.loadTrips();
  }
  async logout() {
    await apiClient.post("/auth/logout");
    this.currentUser = null;
    this.currentTrip = null;
    this.currentMembership = null;
    this.currentPermissions = [];
    this.trips = [];
  }
  async loadTrips() {
    this.trips = (await apiClient.get("/trips")).trips;
    return this.trips;
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
