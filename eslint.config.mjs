import strictCore from "./eslint-core.mjs";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { files: ["**/*.{js,mjs,cjs,ts,tsx}"], rules: strictCore },
  { ignores: ["**/node_modules/**", "**/dist/**", ".vscode-test/**"] },
  { linterOptions: { reportUnusedDisableDirectives: "error" } },
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [js.configs.recommended],
    rules: strictCore,
    languageOptions: { globals: globals.node },
  },
  {
    files: ["**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: globals.node,
    },
  },
);
