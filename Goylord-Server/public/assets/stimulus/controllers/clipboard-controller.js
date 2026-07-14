import { Controller } from "/vendor/hotwired/stimulus.js";

export default class extends Controller {
  static values = {
    text: String,
    successMessage: { type: String, default: "Copied to clipboard" },
  };

  async copy(event) {
    event.preventDefault();
    if (!this.hasTextValue) return;

    try {
      await navigator.clipboard.writeText(this.textValue);
    } catch {
      const input = document.createElement("textarea");
      input.value = this.textValue;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }

    window.showToast?.(this.successMessageValue, "success");
    this.element.dispatchEvent(new CustomEvent("clipboard:copied", {
      bubbles: true,
      detail: { text: this.textValue },
    }));
  }
}
