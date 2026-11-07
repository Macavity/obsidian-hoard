// Opens test-vault in Obsidian (one-time registration: confirm the dialog).
import { execFileSync } from "node:child_process";
import { VAULT_PATH } from "./lib/cli.mjs";

const url = `obsidian://open?path=${encodeURIComponent(VAULT_PATH)}`;
const [cmd, args] =
	process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
execFileSync(cmd, args, { stdio: "inherit" });
console.log(`opened ${url}`);
