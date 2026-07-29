/**
 * ESLint configuration.
 *
 * Tuned to catch defects rather than to enforce style — formatting is left
 * alone so the diff stays reviewable. The rules that are errors here are the
 * ones that would have caught real bugs in this codebase, notably
 * `no-unused-expressions` (which flags `.catch((err) => bad)`, a promise
 * handler that returns the reject function instead of calling it, leaving the
 * request hung forever).
 */

const globals = require("globals");

module.exports = [
  {
    ignores: [
      "node_modules/**",
      "public/js/**",
      "coverage/**",
      "test/.tmp/**",
      "mnt/**",
      "tmp/**",
    ],
  },

  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        ...globals.es2023,
      },
    },
    rules: {
      // --- Real defects ---
      "no-unused-expressions": "error", // `.catch(err => bad)` — never calls bad
      "no-unreachable": "error",
      "no-dupe-keys": "error",
      "no-dupe-args": "error",
      "no-duplicate-case": "error",
      "no-self-assign": "error", // `x.length = x.length`
      "no-self-compare": "error",
      "no-constant-condition": "error",
      "no-cond-assign": "error",
      "no-fallthrough": "error",
      "no-sparse-arrays": "error",
      "use-isnan": "error",
      "valid-typeof": "error",
      "no-compare-neg-zero": "error",
      "no-async-promise-executor": "error",
      "require-atomic-updates": "warn", // read-then-write races
      "no-prototype-builtins": "warn",

      // --- Hygiene ---
      "no-undef": "error",
      "no-unused-vars": [
        "warn",
        { args: "none", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "no-redeclare": "error",
      "no-shadow-restricted-names": "error",
      eqeqeq: ["warn", "smart"],

      // --- Security-adjacent ---
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",
    },
  },

  {
    // Mocha globals.
    files: ["test/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.mocha,
        testHelpers: "readonly",
      },
    },
    rules: {
      // chai's fluent assertions are expressions by design
      // (`expect(x).to.be.true`).
      "no-unused-expressions": "off",
      // Specs deliberately construct `javascript:` URLs to prove they are
      // rejected.
      "no-script-url": "off",
    },
  },

  {
    // Browser-side scripts.
    files: ["public/**/*.js", "views/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.jquery,
        io: "readonly",
      },
    },
  },
];
