import { Controller } from "/vendor/hotwired/stimulus.js";

export default class extends Controller {
  static values = { message: String };

  confirm(event) {
    if (!this.hasMessageValue || window.confirm(this.messageValue)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
  }
}
