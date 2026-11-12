// eslint.config.mjs
import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";

export default defineConfig([
  {
    ignores: ["main.js", "node_modules/**", "dist/**", "*.js", "vitest.config.ts", "scripts/**", "test/e2e/**", ".ref/**", "spike/**", ".claude/**"]
  },
  // obsidianmd recommended rules require type info, so only apply to TS files
  ...obsidianmd.configs.recommended.map((config) =>
    config.rules ? { ...config, files: config.files ?? ["**/*.ts"] } : config,
  ),
  {
    files: ["**/*.ts"],
    plugins: { obsidianmd },
    rules: {
      // Casing of UI text is a writing convention (docs/architecture/i18n.md), not a lint rule: the rule
      // only knows English and needs a list of interface words to stay quiet. The community scanner has it off.
      "obsidianmd/ui/sentence-case": "off",
      // Declarative settings API (Obsidian 1.13+) is a separate migration of the whole SettingsTab.
      "obsidianmd/settings-tab/prefer-setting-definitions": "off",
    },
  },
  {
    files: ["**/*.ts"],
    // Enable reporting of unused disable directives (matches Obsidian bot behavior)
    linterOptions: {
      reportUnusedDisableDirectives: "error"
    },
    languageOptions: {
      parser: tsparser,
      parserOptions: { 
        project: "./tsconfig.json",
        sourceType: "module"
      },
      globals: {
        ...globals.browser,
        require: "readonly", // Node.js require function (available in Obsidian's environment)
        DomElementInfo: "readonly",
        SvgElementInfo: "readonly",
        activeDocument: "readonly",
        activeWindow: "readonly",
        ajax: "readonly",
        ajaxPromise: "readonly",
        createDiv: "readonly",
        createEl: "readonly",
        createFragment: "readonly",
        createSpan: "readonly",
        createSvg: "readonly",
        fish: "readonly",
        fishAll: "readonly",
        isBoolean: "readonly",
        nextFrame: "readonly",
        ready: "readonly",
        sleep: "readonly"
      }
    },
    // Custom rule overrides
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-empty-function": "off",
      "no-prototype-builtins": "off",
      "@typescript-eslint/no-misused-promises": ["error",{"checksVoidReturn":{"attributes":false,"properties":false,"returns":false,"variables":false}}],
      // Console rules: Match Obsidian bot requirements (only warn/error/debug allowed)
      "no-console": ["error", { "allow": ["warn", "error", "debug"] }],
      // Require await in async functions (matches Obsidian bot)
      "@typescript-eslint/require-await": "error",
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly"
      }
    },
    // Build tooling runs in Node, not inside the plugin sandbox, so the
    // mobile-compatibility and console restrictions that apply to plugin
    // source are not relevant here. The community scorecard scans plugin
    // source only and does not flag these files either.
    rules: {
      "obsidianmd/no-nodejs-modules": "off",
      "obsidianmd/rule-custom-message": "off",
      // tooling names `.obsidian` as a path pattern, it never resolves a vault's config folder
      "obsidianmd/hardcoded-config-path": "off",
      "no-console": "off"
    }
  },
  {
    // Obsidian guideline: no inline styles from code.
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-syntax": ["error", {
        selector: "MemberExpression[property.name='style']",
        message: "Use CSS classes or setCssProps with custom properties.",
      }, {
        // a plain key (`top: …`) is an inline style by another name; computed keys hold `--hoard-…` constants
        selector: "CallExpression[callee.property.name='setCssProps'] > ObjectExpression > Property[computed=false][key.type='Identifier']",
        message: "setCssProps takes custom properties only (keys starting with --).",
      }, {
        selector: "CallExpression[callee.property.name='setCssProps'] > ObjectExpression > Property[key.type='Literal']:not([key.value=/^--/])",
        message: "setCssProps takes custom properties only (keys starting with --).",
      }],
    },
  },
  {
    // Tests run in Node/happy-dom, not in the plugin sandbox: obsidianmd rules off.
    files: ["test/**/*.ts"],
    rules: Object.fromEntries(
      Object.keys(obsidianmd.rules).map((name) => [`obsidianmd/${name}`, "off"]),
    ),
  },
]);
