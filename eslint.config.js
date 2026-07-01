import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import prettier from "eslint-config-prettier";

export default [
  { ignores: ["dist/**", "node_modules/**", "*.db", "*.db-*"] },

  js.configs.recommended,

  // Project-wide rule tuning.
  {
    rules: {
      // Allow intentionally-unused catch bindings and `_`-prefixed args, and
      // destructured "rest" omissions (e.g. dropping a key via { x, ...rest }).
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrors: "none", ignoreRestSiblings: true },
      ],
    },
  },

  // Server + tests + config files run in Node.
  {
    files: ["server/**/*.js", "scripts/**/*.js", "test/**/*.js", "*.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
  },

  // Client is a browser React app.
  {
    files: ["client/**/*.{js,jsx}"],
    plugins: { react, "react-hooks": reactHooks },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off", // not needed with the modern JSX transform
      "react/prop-types": "off", // not using prop-types in this codebase
      "react/no-unescaped-entities": "off", // apostrophes/quotes in copy are fine
      "react-hooks/set-state-in-effect": "off", // intentional: derived snapshots
    },
  },

  // Keep ESLint out of formatting decisions; Prettier owns those.
  prettier,
];
