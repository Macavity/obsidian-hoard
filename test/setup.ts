// Vitest leaves setup files out of coverage, so the polyfills live in a module of their own.
import "./domPolyfills";

import { setLocale } from "../src/i18n";
setLocale("en");
