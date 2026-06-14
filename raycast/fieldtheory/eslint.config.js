const prettier = require("eslint-config-prettier/flat");
const typescript = require("typescript-eslint");
const raycast = require("@raycast/eslint-plugin");
const js = require("@eslint/js");
const globals = require("globals");

const raycastRecommended = raycast.configs.recommended;

module.exports = [
  js.configs.recommended,
  ...typescript.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.node,
      },
    },
  },
  ...(Array.isArray(raycastRecommended) ? raycastRecommended : [raycastRecommended]),
  prettier,
];
