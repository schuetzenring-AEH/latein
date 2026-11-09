import { copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** Repo name used by GitHub project Pages: https://<user>.github.io/latein/ */
export const pagesBase = "/latein/";

function githubPagesSpaFallback(): Plugin {
  return {
    name: "github-pages-spa-fallback",
    apply: "build",
    closeBundle() {
      const dist = resolve("dist");
      copyFileSync(resolve(dist, "index.html"), resolve(dist, "404.html"));
    },
  };
}

export default defineConfig({
  base: pagesBase,
  plugins: [react(), tailwindcss(), githubPagesSpaFallback()],
  server: { host: true, port: 5173 },
});
