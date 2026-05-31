import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

const domainPackagePatterns = [
  "**/workflow-*",
  "**/entity-model-viewer",
  "**/agent-bridge-contract",
];

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  { ignores: ["**/dist/**", "**/build/**", "**/target/**", "**/node_modules/**"] },

  js.configs.recommended,

  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2022, sourceType: "module", ecmaFeatures: { jsx: true } },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    settings: { react: { version: "18.3" } },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
    },
  },

  {
    files: ["packages/console-design-system/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: domainPackagePatterns.map((group) => ({
            group: [group],
            message: "Design system must not import domain packages.",
          })),
        },
      ],
    },
  },

  {
    files: ["packages/console-shell/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: domainPackagePatterns.map((group) => ({
            group: [group],
            message: "Shell must not import domain packages.",
          })),
        },
      ],
    },
  },
];
