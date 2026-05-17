import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["assets/**", "main.js", "node_modules/**", "coverage/**"],
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        document: "readonly",
        Element: "readonly",
        HTMLButtonElement: "readonly",
        HTMLDivElement: "readonly",
        HTMLIFrameElement: "readonly",
        MessageEvent: "readonly",
        window: "readonly",
      },
      sourceType: "module",
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
