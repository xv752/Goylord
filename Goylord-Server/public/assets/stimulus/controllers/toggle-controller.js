import { Controller } from "/vendor/hotwired/stimulus.js";

export default class extends Controller {
  static targets = ["content"];

  toggle(event) {
    event.preventDefault();
    const hidden = this.contentTarget.classList.toggle("hidden");
    event.currentTarget.setAttribute("aria-expanded", String(!hidden));
  }
}
