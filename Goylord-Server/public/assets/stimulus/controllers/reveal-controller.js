import { Controller } from "/vendor/hotwired/stimulus.js";

export default class extends Controller {
  static targets = ["input", "icon"];

  toggle(event) {
    event.preventDefault();
    const revealing = this.inputTarget.type === "password";
    this.inputTarget.type = revealing ? "text" : "password";
    event.currentTarget.setAttribute("aria-pressed", String(revealing));
    event.currentTarget.setAttribute("aria-label", revealing ? "Hide value" : "Show value");
    if (this.hasIconTarget) {
      this.iconTarget.classList.toggle("fa-eye", !revealing);
      this.iconTarget.classList.toggle("fa-eye-slash", revealing);
    }
  }
}
