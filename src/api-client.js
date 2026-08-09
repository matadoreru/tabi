export class ApiError extends Error {
  constructor(status, payload) {
    super(payload?.error?.message || "No se ha podido completar la operación.");
    this.status = status;
    this.code = payload?.error?.code || "REQUEST_FAILED";
    this.details = payload?.error?.details;
  }
}

export class ApiClient {
  async request(path, options = {}) {
    const response = await fetch(`/api${path}`, {
      credentials: "same-origin",
      ...options,
      headers: options.body ? { "content-type": "application/json", ...options.headers } : options.headers,
      body: options.body && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body,
    });
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(response.status, payload);
    return payload;
  }
  get(path) {
    return this.request(path);
  }
  post(path, body = {}) {
    return this.request(path, { method: "POST", body });
  }
  patch(path, body) {
    return this.request(path, { method: "PATCH", body });
  }
  delete(path, body = {}) {
    return this.request(path, { method: "DELETE", body });
  }
}

export const apiClient = new ApiClient();
