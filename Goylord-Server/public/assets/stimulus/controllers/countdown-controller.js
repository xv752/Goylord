import { Controller } from "/vendor/hotwired/stimulus.js";

export default class extends Controller {
  static values = {
    expiresAt: Number,
    interval: { type: Number, default: 60_000 },
  };

  connect() {
    this.update();
    if (this.expiresAtValue > Date.now()) {
      this.clock = window.setInterval(() => this.update(), this.intervalValue);
    }
  }

  disconnect() {
    window.clearInterval(this.clock);
  }

  update() {
    const remaining = this.expiresAtValue - Date.now();
    if (remaining <= 0) {
      this.element.textContent = "Expired";
      this.setTone("text-red-400");
      window.clearInterval(this.clock);
      return;
    }

    const days = Math.floor(remaining / 86_400_000);
    const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
    const minutes = Math.floor((remaining % 3_600_000) / 60_000);
    this.element.textContent = days > 0
      ? `${days}d ${hours}h`
      : hours > 0
        ? `${hours}h ${minutes}m`
        : `${minutes}m`;
    this.setTone(days >= 3
      ? "text-green-400"
      : days >= 1
        ? "text-yellow-400"
        : "text-orange-400");
  }

  setTone(tone) {
    this.element.classList.remove(
      "text-red-400",
      "text-green-400",
      "text-yellow-400",
      "text-orange-400",
    );
    this.element.classList.add(tone, "font-medium");
  }
}
