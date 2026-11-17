import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import json from "@rollup/plugin-json";

export default {
  input: "src/mapa-nieba-card.ts",
  output: {
    file: "../custom_components/mapa_nieba/www/mapa-nieba-card.js",
    format: "es",
    inlineDynamicImports: true,
  },
  plugins: [resolve(), json(), typescript({ tsconfig: "./tsconfig.json", noEmit: false, declaration: false })],
};
