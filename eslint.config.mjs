// eslint.config.mjs
import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";

// Cosmetic-only: keep UI sentence-case visible without failing the lint.
// ignoreWords/ignoreRegex teach the rules this plugin's proper nouns
// (tab, modal and feature names) and format-mask placeholders; genuine
// sentence-case violations are still reported. Shared by the UI rule and the
// English locale-module rule.
const sentenceCaseOptions = {
    ignoreWords: [
      // Plugin / feature names
      "Hoard", "Watchlist", "Upcoming", "Reading", "Cards",
      "Drafts", "Books", "Manga", "Games",
      "Quotes", "Regenerate",
      // External services / acronyms not in the rule defaults
      "Google", "MAL", "TSV", "URLs", "APIs", "Steam", "Tenrai", "English",
      // Stored type name, Steam's privacy option and the default rating-tier label
      "Book", "Public", "Good",
    ],
    ignoreRegex: [
      "^DD/MM/YYYY$",            // date format mask
      "^https://",               // URL placeholder
      "^Season \\d",             // season-spec example placeholder
      "\\(Season 1 = color 1",    // season example inside the help text
      "^p\\. 123",               // quote-location example placeholder
      "^APIs & Services",        // Google Cloud console path
      '"N due"',                 // N is a number placeholder
      "^\\* Last type used$",    // sentinel option; * confuses sentence-start detection
      '"Last type used"',        // quotes that sentinel option's label
      "^#\\w+$",                 // tag placeholder (#hoard)
      "^\\d+h$",                 // duration placeholder (0h)
      // Label values that must match stored values letter-for-letter
      "^TV Show$",
      "^Korean TV Show$",
      "^Plan to Read$",
      // list area: lowercase stat captions under a value, and quoted stored status/section names
      "^(left|watched|episodes|progress)$",
      '^Nothing to recommend; add titles to "Plan to watch" or "Watching"\\.$',
      '^Reorder the sections or switch them off\\. "By type"',
      // lists/widget areas: lowercase stat captions and relative-date words, uppercase card headers, prose naming UI terms
      "^(completed|remaining|titles completed|today|tomorrow)$",
      "^(NOW WATCHING|UPCOMING NEXT)$",
      "^Missing id field\\.$",
      "^These columns are pre-populated when creating a new list\\.",
      "^TSV pastes into spreadsheets",
      "^Paste tab-separated values copied from a spreadsheet",
    ],
  };

export default defineConfig([
  {
    ignores: ["main.js", "node_modules/**", "dist/**", "*.js", "vitest.config.ts", "scripts/**", ".ref/**", "spike/**", ".claude/**"]
  },
  // obsidianmd recommended rules require type info, so only apply to TS files
  ...obsidianmd.configs.recommendedWithLocalesEn.map((config) =>
    config.rules ? { ...config, files: config.files ?? ["**/*.ts"] } : config,
  ),
  {
    // Options: see sentenceCaseOptions above.
    files: ["**/*.ts"],
    plugins: { obsidianmd },
    rules: {
      "obsidianmd/ui/sentence-case": ["warn", sentenceCaseOptions],
      "obsidianmd/ui/sentence-case-locale-module": ["warn", sentenceCaseOptions],
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
      "no-console": "off"
    }
  },
  {
    // Tests run in Node/happy-dom, not in the plugin sandbox: obsidianmd rules off.
    files: ["test/**/*.ts"],
    rules: Object.fromEntries(
      Object.keys(obsidianmd.rules).map((name) => [`obsidianmd/${name}`, "off"]),
    ),
  },
]);
