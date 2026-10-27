import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const brand = readFileSync(new URL("../components/Brand.tsx", import.meta.url), "utf8");
const artwork = readFileSync(new URL("../components/SaMiLogo.tsx", import.meta.url), "utf8");
const overlay = readFileSync(new URL("../components/SaMiOverlay.tsx", import.meta.url), "utf8");
const overlayHook = readFileSync(new URL("../components/useSaMiOverlay.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../components/ErrandsApp.tsx", import.meta.url), "utf8");
const setup = readFileSync(new URL("../components/AdminSetupForm.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const icon = readFileSync(new URL("../app/icon.svg", import.meta.url), "utf8");
const manifest = readFileSync(new URL("../app/manifest.ts", import.meta.url), "utf8");
const logo = readFileSync(new URL("../public/sami-logo.svg", import.meta.url), "utf8");
const companyLogo = readFileSync(new URL("../public/sami-technologies-logo.svg", import.meta.url), "utf8");

test("the customer-facing lockup uses the original SaMi logo without a suffix", () => {
  assert.ok(brand.includes('import SaMiLogo from "@/components/SaMiLogo"'));
  assert.ok(brand.includes("<SaMiLogo size="));
  assert.ok(brand.includes('aria-label="SaMi home"'));
  assert.ok(!brand.includes("ERRANDS"));
  assert.ok(!brand.includes("SaMi Errands"));
  assert.ok(artwork.includes("SaMi — Everyday help, organised."));
  assert.ok(artwork.includes("EVERYDAY HELP, ORGANISED"));
  assert.ok(app.includes('import Brand, { BrandMark } from "@/components/Brand"'));
  assert.ok(app.includes("<Brand onClick="));
  assert.ok(!app.includes("SaMi Errands"));
  assert.ok(!app.includes("SAMI ERRANDS"));
  assert.ok(!setup.includes("SaMi Errands"));
});

test("browser metadata, installed-app name and icon use SaMi's blue identity", () => {
  assert.ok(icon.includes("#0A1A40"));
  assert.ok(icon.includes("#2B5CFF"));
  assert.ok(manifest.includes('name: "SaMi"'));
  assert.ok(manifest.includes('short_name: "SaMi"'));
  assert.ok(manifest.includes('theme_color: "#0A1A40"'));
  assert.ok(layout.includes('default: "SaMi — Everyday help, organised."'));
  assert.ok(layout.includes('applicationName: "SaMi"'));
  assert.ok(layout.includes('siteName: "SaMi"'));
  assert.ok(layout.includes('themeColor: "#0A1A40"'));
  assert.ok(!layout.includes("SaMi Errands"));
});

test("the saved wordmark preserves the original custom SaMi letterforms", () => {
  assert.ok(logo.includes('<title id="title">SaMi</title>'));
  assert.ok(logo.includes("M 326 78"));
  assert.ok(logo.includes("#4A7AFF"));
  assert.ok(!logo.includes("ERRANDS"));
  assert.ok(!logo.includes("SaMi Errands"));
  assert.ok(companyLogo.includes("SaMi Technologies"));
  assert.ok(companyLogo.includes(">TECHNOLOGIES</text>"));
});

test("SaMi's overlay has accessible dialog semantics, keyboard dismissal and safe actions", () => {
  assert.ok(overlay.includes('role="alertdialog"'));
  assert.ok(overlay.includes("aria-modal=\"true\""));
  assert.ok(overlay.includes("event.key === \"Escape\""));
  assert.ok(overlay.includes("dismissOnBackdrop = true"));
  assert.ok(overlay.includes('action.tone === "danger"'));
  assert.ok(overlay.includes("createPortal(content, document.body)"));
  assert.ok(overlayHook.includes("confirmAction"));
  assert.ok(overlayHook.includes("showSuccess"));
  assert.ok(overlayHook.includes("showError"));
  assert.ok(css.includes(".sami-overlay-backdrop"));
  assert.ok(css.includes(".sami-overlay-action--danger"));
});

test("responsive SaMi logo styles and blue brand tokens are defined", () => {
  for (const value of ["--brand:#2b5cff","--brand-deep:#1a3e8c","--brand-night:#0a1a40",".brand-logo-wide",".sidebar-brand .brand-logo-wide{display:none}"]) {
    assert.ok(css.includes(value), "missing brand style: " + value);
  }
  assert.ok(!css.includes(".brand-product"));
});
