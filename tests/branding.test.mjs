import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const brand = readFileSync(new URL("../components/Brand.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../components/ErrandsApp.tsx", import.meta.url), "utf8");
const setup = readFileSync(new URL("../components/AdminSetupForm.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const icon = readFileSync(new URL("../app/icon.svg", import.meta.url), "utf8");
const manifest = readFileSync(new URL("../app/manifest.ts", import.meta.url), "utf8");
const logo = readFileSync(new URL("../public/sami-logo.svg", import.meta.url), "utf8");
const companyLogo = readFileSync(new URL("../public/sami-technologies-logo.svg", import.meta.url), "utf8");

test("the visible brand lockup is SaMi only", () => {
  assert.ok(brand.includes('aria-label="SaMi home"'));
  assert.ok(brand.includes('className="brand-name">SaMi'));
  assert.ok(!brand.includes("ERRANDS"));
  assert.ok(!brand.includes("SaMi Errands"));
  assert.ok(app.includes('import Brand, { BrandMark } from "@/components/Brand"'));
  assert.ok(app.includes('<Brand onClick='));
  assert.ok(!app.includes("SaMi Errands"));
  assert.ok(!app.includes("SAMI ERRANDS"));
  assert.ok(!setup.includes("SaMi Errands"));
});

test("browser metadata, app icon and installed-app name use SaMi", () => {
  assert.ok(icon.includes("#087E76"));
  assert.ok(icon.includes("#F4BB4B"));
  assert.ok(manifest.includes('name: "SaMi"'));
  assert.ok(manifest.includes('short_name: "SaMi"'));
  assert.ok(manifest.includes('theme_color: "#087E76"'));
  assert.ok(layout.includes('default: "SaMi — Everyday help, organised."'));
  assert.ok(layout.includes('applicationName: "SaMi"'));
  assert.ok(layout.includes('siteName: "SaMi"'));
  assert.ok(!layout.includes("SaMi Errands"));
});

test("tagline and customer-facing identity remain consistent", () => {
  assert.ok(app.includes("Everyday help, organised."));
  assert.ok(app.includes("SaMi. Everyday help, organised."));
  assert.ok(!app.includes("Everyday help, with follow-through."));
  assert.ok(!app.includes("SaMi Technologies product"));
  assert.ok(!app.includes("saMi / errands"));
});

test("logo artwork uses SaMi alone while corporate asset remains separate", () => {
  assert.ok(logo.includes('<title id="title">SaMi</title>'));
  assert.ok(logo.includes(">SaMi</text>"));
  assert.ok(!logo.includes("ERRANDS"));
  assert.ok(!logo.includes("SaMi Errands"));
  assert.ok(companyLogo.includes("SaMi Technologies"));
  assert.ok(companyLogo.includes(">TECHNOLOGIES</text>"));
});

test("responsive wordmark and brand tokens are defined without a category suffix", () => {
  for (const value of ["--brand:#087e76","--brand-deep:#065b56","--brand-night:#102c38","--gold:#f4bb4b",".brand-lockup",".sidebar-brand .brand-lockup{display:none}"]) {
    assert.ok(css.includes(value), "missing brand style: " + value);
  }
  assert.ok(!css.includes(".brand-product"));
});
