import { Application } from "/vendor/hotwired/stimulus.js";
import SessionsController from "./controllers/sessions-controller.js";
import ClipboardController from "./controllers/clipboard-controller.js";
import ConfirmController from "./controllers/confirm-controller.js";
import CountdownController from "./controllers/countdown-controller.js";
import RevealController from "./controllers/reveal-controller.js";
import ToggleController from "./controllers/toggle-controller.js";

const application = Application.start();
application.debug = false;
application.register("sessions", SessionsController);
application.register("clipboard", ClipboardController);
application.register("confirm", ConfirmController);
application.register("countdown", CountdownController);
application.register("reveal", RevealController);
application.register("toggle", ToggleController);

window.GoylordStimulus = application;

export { application };
