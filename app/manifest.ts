import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SaMi Errands",
    short_name: "SaMi",
    description: "Everyday help, organised.",
    start_url: "/",
    display: "standalone",
    background_color: "#F6F8F7",
    theme_color: "#087E76",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }]
  };
}
