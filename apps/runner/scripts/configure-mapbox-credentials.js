const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const platform = process.env.EAS_BUILD_PLATFORM;
const token = process.env.MAPBOX_DOWNLOADS_TOKEN?.trim();

if (!token) {
  throw new Error(
    "MAPBOX_DOWNLOADS_TOKEN is missing. Add a secret with the Mapbox Downloads:Read scope to the EAS development, preview, and production environments."
  );
}

if (platform === "ios") {
  const netrcPath = path.join(os.homedir(), ".netrc");
  const newline = String.fromCharCode(10);
  let existing = "";

  try {
    existing = fs.readFileSync(netrcPath, "utf8");
  } catch {
    // A new EAS build worker may not have a .netrc file.
  }

  const keptLines = [];
  let skippingMapboxEntry = false;

  for (const line of existing.split(newline)) {
    const trimmed = line.trim();

    if (trimmed.startsWith("machine ")) {
      skippingMapboxEntry = trimmed === "machine api.mapbox.com";
    }

    if (!skippingMapboxEntry) {
      keptLines.push(line);
    }
  }

  const withoutMapboxEntry = keptLines.join(newline).trim();
  const mapboxEntry = [
    "machine api.mapbox.com",
    "  login mapbox",
    `  password ${token}`,
    ""
  ].join(newline);

  const output = withoutMapboxEntry
    ? `${withoutMapboxEntry}${newline}${newline}${mapboxEntry}`
    : mapboxEntry;

  fs.writeFileSync(netrcPath, output, { mode: 0o600 });
  fs.chmodSync(netrcPath, 0o600);
}

console.log(
  `SaMi Mapbox download credentials configured for ${platform || "local"}.`
);
