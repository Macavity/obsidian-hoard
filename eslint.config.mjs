// eslint.config.mjs
import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";

// Exceptions for the two sentence-case rules, shared by the UI rule and the English locale-module rule.
// The Obsidian review bot runs these rules without this list (`pnpm lint:bot` shows what it reports),
// so an entry belongs here only when the text cannot be sentence case: a proper name, a service or
// product name, a stored value, or a format placeholder. Everything else is rewritten instead.
// test/eslintConfig.test.ts fails on an ignoreRegex entry that no bot warning needs any more.
export const sentenceCaseOptions = {
  // multi-word names and acronyms in canonical casing, matched anywhere (also at the start of a sentence)
  brands: [
    "Obsidian", "Markdown", "Open Library",       // products named in texts (own list, not the plugin defaults)
    "Google Books", "Google Cloud", "Books API",  // Google services
    "Steam Web API", "TMDB", "RAWG", "IGDB", "MAL", "Jikan", // API providers (Jikan: hyphenated "Jikan-compatible")
    "TV", "TSV", "ISBN", "PC", "UTC", "JST",      // acronyms missing from the rule defaults
    // names of things in the interface, written as the user sees them there
    "Plan to watch", "Plan to Read", "To be released", // statuses
    // wording of external services
    "Web API", "Google Sheets",
  ],
  // proper names kept as written when they are not at the start of a sentence
  ignoreWords: [
    "Hoard",                                      // this plugin
    "Homepage",                                   // another Obsidian plugin
    "Steam", "Twitch", "Tenrai",                  // API providers and services
    "Cinemeta", "OMDb", "AniList", "MyAnimeList", "Excel",
    // names of things in the interface, written as the user sees them there
    "Watchlist", "Upcoming", "Reading", "Drafts", "Books", "Manga", "Games", "Settings", // tabs and sub-tabs
    "Watching", "Completed", "Dropped", "Maybe",  // statuses
    "Anime", "Movie", "Movies", "Book",           // types
    "Edit", "Seasons", "Director", "Cast", "Name", "Notes", "Quotes", "Progress", "Pages", "Words", "Regenerate", // buttons, fields, sections
  ],
  // whole texts the rules cannot judge
  ignoreRegex: [
    "https://",                 // URL placeholder or example
    "^\\d+h$",                  // duration placeholder (0h)
    "^#\\w+$",                  // tag placeholder (#hoard)
    '"Season (Name|\\d)',        // season-spec format mask: the text a user types must match letter for letter
    '"Game details"',           // Steam's own profile privacy wording
    "APIs & Services",          // Google Cloud console menu path
    // label values that must match stored values letter for letter
    "^TV Show$",
    "^Korean TV Show$",
    "^Plan to Read$",
    // lowercase captions under a value and units after a number; the text is composed around a number
    "^(pages|words|chapters|volumes|eps|of)$",
    "^(left|watched|episodes|progress|completed|remaining|titles completed|today|tomorrow)$",
    // link text that continues the sentence "No books yet; "
    "^add your first (book|manga)$",
    // help texts that quote a label of the interface exactly as it is shown there
    '"(Skip|By (genre|type|status)|Plan to watch|Last type used|Refresh cover|Good|Total episodes|Now watching)"',
    // help texts that list labels, types or a switch of the interface without quotes
    "^Full-width (triple|double) card: ",
    "Anime, Movie, and TV Show",
    "Movies & TV Shows",
    "the Pages/Words switch",
    "^Any title with a release date",
    "^Keep as Added$",          // names the stored status
    // names the literal `id` field of a widget block
    "^Missing id field\\.$",
  ],
};

export default defineConfig([
  {
    ignores: ["main.js", "node_modules/**", "dist/**", "*.js", "vitest.config.ts", "scripts/**", "test/e2e/**", ".ref/**", "spike/**", ".claude/**"]
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
    // Obsidian guideline: no inline styles from code.
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-syntax": ["error", {
        selector: "MemberExpression[property.name='style']",
        message: "Use CSS classes or setCssProps with custom properties.",
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
