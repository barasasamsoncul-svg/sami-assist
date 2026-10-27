import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SaMi",
    short_name: "SaMi",
    description: "Everyday help, organised.",
    start_url: "/",
    display: "standalone",
    background_color: "#F6F8F7",
    theme_color: "#0A1A40",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }]
  };
}
