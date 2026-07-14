#!/usr/bin/env bun
/**
 * Minify all public JS, CSS, and HTML assets in-place.
 * Uses terser (JS), clean-css (CSS), html-minifier-terser (HTML).
 *
 * Usage:  bun run scripts/minify-public.ts [--dir public]
 */
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { minify as terserMinify } from "terser";
import CleanCSS from "clean-css";
import { minify as htmlMinify } from "html-minifier-terser";

const args = process.argv.slice(2);
let publicDir = path.resolve("public");
const dirIdx = args.indexOf("--dir");
if (dirIdx !== -1 && args[dirIdx + 1]) {
  publicDir = path.resolve(args[dirIdx + 1]);
}

const cleanCss = new CleanCSS({ level: 2 });

const htmlOpts = {
  collapseWhitespace: true,
  removeComments: true,
  removeRedundantAttributes: true,
  removeEmptyAttributes: true,
  minifyCSS: true,
  minifyJS: true,
  sortAttributes: true,
  sortClassName: true,
};

type Stats = { js: number; css: number; html: number; savedBytes: number };
const stats: Stats = { js: 0, css: 0, html: 0, savedBytes: 0 };
let failures = 0;

async function collectFiles(dir: string, exts: Set<string>): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      // Skip vendor — already distributed minified
      if (e.name === "vendor") continue;
      results.push(...(await collectFiles(full, exts)));
    } else if (exts.has(path.extname(e.name).toLowerCase())) {
      results.push(full);
    }
  }
  return results;
}

async function minifyJS(filePath: string) {
  const src = await Bun.file(filePath).text();
  const result = await terserMinify(src, {
    compress: { passes: 2, drop_console: false, ecma: 2020 },
    mangle: { toplevel: false },
    format: { ecma: 2020 },
    module: true,
  });
  if (result.code && result.code.length < src.length) {
    stats.savedBytes += src.length - result.code.length;
    await Bun.write(filePath, result.code);
  }
  stats.js++;
}

async function minifyCSS(filePath: string) {
  const src = await Bun.file(filePath).text();
  const result = cleanCss.minify(src);
  if (result.styles && result.styles.length < src.length) {
    stats.savedBytes += src.length - result.styles.length;
    await Bun.write(filePath, result.styles);
  }
  stats.css++;
}

async function minifyHTML(filePath: string) {
  const src = await Bun.file(filePath).text();
  const result = await htmlMinify(src, htmlOpts);
  if (result.length < src.length) {
    stats.savedBytes += src.length - result.length;
    await Bun.write(filePath, result);
  }
  stats.html++;
}

// Collect all files
const jsFiles = await collectFiles(path.join(publicDir, "assets"), new Set([".js"]));
const cssFiles = await collectFiles(path.join(publicDir, "assets"), new Set([".css"]));
const htmlFiles = await collectFiles(publicDir, new Set([".html"]));

console.log(`Minifying ${jsFiles.length} JS, ${cssFiles.length} CSS, ${htmlFiles.length} HTML files...`);

// Process in parallel batches
await Promise.all([
  ...jsFiles.map((f) => minifyJS(f).catch((e) => {
    failures++;
    console.error(`JS error ${f}: ${e.message}`);
  })),
  ...cssFiles.map((f) => minifyCSS(f).catch((e) => {
    failures++;
    console.error(`CSS error ${f}: ${e.message}`);
  })),
  ...htmlFiles.map((f) => minifyHTML(f).catch((e) => {
    failures++;
    console.error(`HTML error ${f}: ${e.message}`);
  })),
]);

console.log(
  `Done: ${stats.js} JS, ${stats.css} CSS, ${stats.html} HTML — saved ${(stats.savedBytes / 1024).toFixed(1)} KB`,
);

if (failures > 0) {
  console.error(`Minification failed for ${failures} file(s).`);
  process.exit(1);
}
