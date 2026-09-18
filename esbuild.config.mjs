import esbuild from "esbuild";
import process from "process";
import { readFile } from "node:fs/promises";
import { pdfWorkerPlugin } from "./scripts/pdf-worker-plugin.mjs";

const prod = process.env.NODE_ENV === "production";

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "cjs",
  target: "es2020",
  outfile: "main.js",
  sourcemap: prod ? false : "inline",
  minify: false,
  plugins: [pdfWorkerPlugin],
  legalComments: "inline",
  banner: { js: `/*! Remark My Words\n${await readFile('LICENSE', 'utf8')}\nPDF.js is distributed under the following license:\n${await readFile('node_modules/pdfjs-dist/LICENSE', 'utf8')}\n*/` },
  external: ["obsidian"],
  logLevel: "info",
});

if (!prod) {
  await ctx.watch();
  console.log("Watching...");
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log("Built.");
}
