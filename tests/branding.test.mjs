import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const brand = readFileSync(new URL("../components/Brand.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../components/ErrandsApp.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const icon = readFileSync(new URL("../app/icon.svg", import.meta.url), "utf8");
const manifest = readFileSync(new URL("../app/manifest.ts", import.meta.url), "utf8");
const productLogo = readFileSync(new URL("../public/sami-errands-logo.svg", import.meta.url), "utf8");
const companyLogo = readFileSync(new URL("../public/sami-technologies-logo.svg", import.meta.url), "utf8");

test("SaMi masterbrand and Errands product use a shared accessible route mark", () => {
  assert.ok(brand.includes('aria-label="SaMi Errands home"'));
  assert.ok(brand.includes('className="brand-name">SaMi'));
  assert.ok(brand.includes('className="brand-product">ERRANDS'));
  assert.ok(brand.includes('viewBox="0 0 48 48"'));
  assert.ok(app.includes('import Brand, { BrandMark } from "@/components/Brand"'));
  assert.ok(app.includes('<Brand onClick='));
});

test("the product icon, app manifest and metadata share the brand palette", () => {
  assert.ok(icon.includes("#087E76"));
  assert.ok(icon.includes("#F4BB4B"));
  assert.ok(manifest.includes('name: "SaMi Errands"'));
  assert.ok(manifest.includes('theme_color: "#087E76"'));
  assert.ok(layout.includes('default: "SaMi Errands — Everyday help, organised."'));
  assert.ok(layout.includes('siteName: "SaMi Errands"'));
});

test("customer-facing copy keeps one product name and tagline", () => {
  assert.ok(app.includes("Everyday help, organised."));
  assert.ok(app.includes("SaMi Technologies product"));
  assert.ok(!app.includes("Everyday help, with follow-through."));
  assert.ok(!app.includes("saMi / errands"));
});

test("brand assets exist for both the SaMi Technologies parent and SaMi Errands product", () => {
  assert.ok(productLogo.includes("SaMi Errands"));
  assert.ok(productLogo.includes(">ERRANDS</text>"));
  assert.ok(companyLogo.includes("SaMi Technologies"));
  assert.ok(companyLogo.includes(">TECHNOLOGIES</text>"));
});

test("responsive wordmark and brand tokens are defined", () => {
  for (const value of ["--brand:#087e76","--brand-deep:#065b56","--brand-night:#102c38","--gold:#f4bb4b",".brand-lockup",".brand-product",".sidebar-brand .brand-lockup{display:none}"]) {
    assert.ok(css.includes(value), "missing brand style: " + value);
  }
});
