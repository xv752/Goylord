import AnsiToHtml from "/vendor/ansi-to-html/ansi-to-html.esm.js";

const converter = new AnsiToHtml({ newline: true, escapeHtml: true });

export function ansiToHtml(input = "") {
  return converter.toHtml(input);
}
