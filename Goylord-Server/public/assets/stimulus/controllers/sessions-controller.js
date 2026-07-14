import { Controller } from "/vendor/hotwired/stimulus.js";

export default class extends Controller {
  static targets = ["time"];

  connect() {
    this.updateTimes();
    this.clock = window.setInterval(() => this.updateTimes(), 30_000);
  }

  disconnect() {
    window.clearInterval(this.clock);
  }

  updateTimes() {
    const now = Math.floor(Date.now() / 1000);
    for (const element of this.timeTargets) {
      const timestamp = Number(element.dataset.timestamp);
      if (!Number.isFinite(timestamp) || timestamp <= 0) {
        element.textContent = "—";
        continue;
      }

      if (element.dataset.format === "relative") {
        const difference = Math.max(0, now - timestamp);
        element.textContent = difference < 60
          ? "Just now"
          : difference < 3_600
            ? `${Math.floor(difference / 60)}m ago`
            : difference < 86_400
              ? `${Math.floor(difference / 3_600)}h ago`
              : `${Math.floor(difference / 86_400)}d ago`;
      } else {
        element.textContent = new Date(timestamp * 1_000).toLocaleString();
      }
    }
  }
}
