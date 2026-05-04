import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://miskosz.github.io",
  base: "/root-rewrite-system-prototype/",
  integrations: [mdx()],
  vite: {
    plugins: [tailwindcss()],
  },
});
