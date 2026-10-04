import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "src/main.ts",
  format: "cjs",
  target: "es2016",
  fixedExtension: false,
  outExtensions: () => ({ js: ".js" }),
});
