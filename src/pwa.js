export class PwaManager extends EventTarget {
  constructor() {
    super();
    this.installPrompt = null;
    this.registration = null;
    this.updateAvailable = false;
    this.reloading = false;
  }

  async initialize() {
    if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
    addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      this.installPrompt = event;
      this.changed();
    });
    addEventListener("appinstalled", () => {
      this.installPrompt = null;
      this.changed();
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (this.reloading) return;
      this.reloading = true;
      location.reload();
    });
    this.registration = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
    if (this.registration.waiting) this.markUpdate();
    this.registration.addEventListener("updatefound", () => {
      const worker = this.registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) this.markUpdate();
      });
    });
    await this.registration.update();
    this.changed();
  }

  markUpdate() {
    this.updateAvailable = true;
    this.changed();
  }

  changed() {
    this.dispatchEvent(new Event("change"));
  }

  async install() {
    if (!this.installPrompt) return false;
    await this.installPrompt.prompt();
    const accepted = (await this.installPrompt.userChoice).outcome === "accepted";
    this.installPrompt = null;
    this.changed();
    return accepted;
  }

  applyUpdate() {
    this.registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
  }

  async diagnostics(offlineDiagnostics = {}) {
    const estimate = await navigator.storage?.estimate?.().catch(() => null);
    const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    return {
      serviceWorker: Boolean(navigator.serviceWorker?.controller),
      standalone,
      online: navigator.onLine,
      updateAvailable: this.updateAvailable,
      usageBytes: estimate?.usage || 0,
      quotaBytes: estimate?.quota || 0,
      ...offlineDiagnostics,
    };
  }
}

export const pwaManager = new PwaManager();
