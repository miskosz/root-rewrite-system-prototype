import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import { rehypeRrs } from "./src/lib/rehype-rrs.ts";
import { rehypeGithubAlerts } from "rehype-github-alerts";

export default defineConfig({
  site: "https://miskosz.github.io",
  base: "/root-rewrite-system-prototype/",
  integrations: [mdx()],
  devToolbar: { enabled: false },
  markdown: {
    syntaxHighlight: false,
    rehypePlugins: [rehypeRrs, rehypeGithubAlerts],
  },
});
