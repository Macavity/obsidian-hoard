// eslint.config.mjs
import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";

const ARCH_DOC = "See docs/architecture/overview.md.";

const STYLE_SELECTORS = [{
  selector: "MemberExpression[property.name='style']",
  message: "Use CSS classes or setCssProps with custom properties.",
}, {
  // a plain key (`top: …`) is an inline style by another name; computed keys hold `--hoard-…` constants
  selector: "CallExpression[callee.property.name='setCssProps'] > ObjectExpression > Property[computed=false][key.type='Identifier']",
  message: "setCssProps takes custom properties only (keys starting with --).",
}, {
  selector: "CallExpression[callee.property.name='setCssProps'] > ObjectExpression > Property[key.type='Literal']:not([key.value=/^--/])",
  message: "setCssProps takes custom properties only (keys starting with --).",
}];

// Constructor injection (docs/architecture/overview.md): no `*Deps` bags, no `deps` names, dependencies are separate parameters.
const DI_SELECTORS = [{
  selector: "TSInterfaceDeclaration[id.name=/Deps$/]",
  message: `Do not declare a *Deps type: take each dependency as a private readonly constructor parameter. ${ARCH_DOC}`,
}, {
  selector: "TSTypeAliasDeclaration[id.name=/Deps$/]",
  message: `Do not declare a *Deps type: take each dependency as a private readonly constructor parameter. ${ARCH_DOC}`,
}, {
  selector: "Identifier[name='deps']",
  message: `Do not pass dependencies as a \`deps\` bag: use explicit constructor parameters. ${ARCH_DOC}`,
}, {
  selector: "MethodDefinition[kind='constructor'] RestElement",
  message: `Constructors take named parameters, not a rest tuple of dependencies. ${ARCH_DOC}`,
}];

// Only src/app may hold App; modules and shared take Vault, Workspace, MetadataCache or a Pick instead.
const NO_THIS_APP = {
  selector: "MemberExpression[object.type='ThisExpression'][property.name='app']",
  message: `Do not reach for this.app: inject Vault, Workspace, MetadataCache or a Pick of them (App only for super(app)). ${ARCH_DOC}`,
};

const BASE_SELECTORS = [...STYLE_SELECTORS, ...DI_SELECTORS];

export default defineConfig([
  {
    ignores: ["main.js", "node_modules/**", "dist/**", "*.js", "vitest.config.ts", "scripts/**", "test/e2e/**", ".ref/**", "spike/**", ".claude/**", ".superpowers/**"]
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
    // Inline `eslint-disable` would let a change switch the architecture rules off: source files take no inline config.
    files: ["src/**/*.ts"],
    linterOptions: { noInlineConfig: true },
  },
  {
    // Obsidian guideline: no inline styles from code.
    files: ["src/**/*.ts"],
    rules: { "no-restricted-syntax": ["error", ...BASE_SELECTORS] },
  },
  {
    // Objects are wired once, in src/app. Same rule key as above, so it repeats the style selectors.
    files: ["src/**/*.ts"],
    ignores: ["src/app/**"],
    rules: {
      "no-restricted-syntax": ["error", ...BASE_SELECTORS, NO_THIS_APP, {
        selector: "NewExpression[callee.name=/(Manager|Service)$/]",
        message: `Do not construct a Manager or Service here: take it as a constructor dependency and let src/app wire it. ${ARCH_DOC}`,
      }],
    },
  },
  {
    // UI reaches data and services only through injected dependencies.
    files: ["src/modules/*/ui/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["**/shared/storage/**"],
            message: `UI must not touch storage: depend on an injected service interface instead. ${ARCH_DOC}`,
          },
          {
            group: ["**/app/**"],
            message: `UI must not import from app: receive what you need as a constructor dependency. ${ARCH_DOC}`,
          },
          {
            group: ["**/services/**", "!**/shared/services/**"],
            allowTypeImports: true,
            message: `UI may only use \`import type\` from a services file: take the service as an injected dependency, and move pure helpers to shared/domain. ${ARCH_DOC}`,
          },
        ],
      }],
    },
  },
  {
    // Services report codes (ManagerNotice); they never show UI.
    files: ["src/modules/*/services/**/*.ts", "src/shared/services/**/*.ts", "src/shared/storage/**/*.ts", "src/shared/api/**/*.ts"],
    rules: {
      // Named imports are caught below; a namespace or default import would reach the same UI classes.
      "no-restricted-syntax": ["error", ...BASE_SELECTORS, NO_THIS_APP, {
        selector: "ImportDeclaration[source.value='obsidian'] > :matches(ImportNamespaceSpecifier, ImportDefaultSpecifier)",
        message: `Services must not use Obsidian UI classes: import only what you need by name, and report a code (ManagerNotice) instead of showing UI. ${ARCH_DOC}`,
      }, {
        selector: "NewExpression[callee.name=/(Manager|Service)$/]",
        message: `Do not construct a Manager or Service here: take it as a constructor dependency and let src/app wire it. ${ARCH_DOC}`,
      }],
      "@typescript-eslint/no-restricted-imports": ["error", {
        paths: [{
          name: "obsidian",
          importNames: ["App", "Modal", "Notice", "Setting", "PluginSettingTab", "ItemView", "Menu"],
          message: `Services must not use Obsidian UI classes or App: inject Vault, Workspace or a Pick, and report a code (ManagerNotice) for the UI to show. ${ARCH_DOC}`,
        }],
        patterns: [{
          group: ["**/ui/**", "**/design-system/**"],
          message: `Services must not import UI: expose data or a code and let the UI call you. ${ARCH_DOC}`,
        }],
      }],
    },
  },
  {
    // Outside data is read from `unknown`, never asserted (docs/architecture/storage.md): the data layer stays assertion-free.
    files: [
      "src/shared/storage/**/*.ts",
      "src/modules/import/services/**/*.ts",
      "src/shared/api/ApiService.ts",
      "src/shared/api/PosterService.ts",
      "src/shared/api/cinemetaApi.ts",
      "src/shared/api/openLibraryApi.ts",
      "src/shared/api/steamStoreApi.ts",
      "src/shared/api/lookup.ts",
      "src/modules/settings/services/settingsSplit.ts",
      "src/modules/backup/services/backup.ts",
    ],
    rules: {
      "@typescript-eslint/no-unsafe-type-assertion": "error",
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
