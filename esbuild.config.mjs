import esbuild from "esbuild";
import process from "process";

const prod = process.env.NODE_ENV === "production";

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "cjs",
  target: "es2020",
  outfile: "main.js",
  sourcemap: prod ? false : "inline",
  minify: prod,
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
