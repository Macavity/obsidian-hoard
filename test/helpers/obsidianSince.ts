// Finds uses of Obsidian APIs whose `@since` in obsidian.d.ts is newer than a given app version.
// Resolves every identifier through the type checker, so `render` on a Hoard class is never confused
// with an Obsidian member of the same name.
import { relative, resolve } from "node:path";
import process from "node:process";
import ts from "typescript";
import { compareVersions } from "../../scripts/lib/release-versions.mjs";

export interface NewerApi {
	file: string;
	line: number;
	symbol: string;
	since: string;
}

const OBSIDIAN_DTS = /[\\/]node_modules[\\/]obsidian[\\/]obsidian\.d\.ts$/;
const norm = (p: string) => resolve(p).replace(/\\/g, "/").toLowerCase();

function compilerOptions(): ts.CompilerOptions {
	const config: unknown = ts.readConfigFile("tsconfig.json", (p) => ts.sys.readFile(p)).config;
	return ts.parseJsonConfigFileContent(config, ts.sys, process.cwd()).options;
}

function createHost(options: ts.CompilerOptions, virtualFiles: Record<string, string>): ts.CompilerHost {
	const base = ts.createCompilerHost(options, true);
	const virtual = new Map(Object.entries(virtualFiles).map(([k, v]) => [norm(k), v]));
	return {
		...base,
		fileExists: (f) => virtual.has(norm(f)) || base.fileExists(f),
		readFile: (f) => virtual.get(norm(f)) ?? base.readFile(f),
		getSourceFile: (f, lang, ...rest) => {
			const text = virtual.get(norm(f));
			return text !== undefined ? ts.createSourceFile(f, text, lang, true) : base.getSourceFile(f, lang, ...rest);
		},
	};
}

function sinceOf(node: ts.Node): string | undefined {
	const tag = ts.getJSDocTags(node).find((t) => t.tagName.text === "since");
	return tag ? ts.getTextOfJSDocComment(tag.comment)?.trim() : undefined;
}

function container(decl: ts.Declaration): ts.ClassDeclaration | ts.InterfaceDeclaration | undefined {
	const p = decl.parent;
	return ts.isClassDeclaration(p) || ts.isInterfaceDeclaration(p) ? p : undefined;
}

function describeDecl(decl: ts.Declaration, name: string): { symbol: string; since: string | undefined } {
	const owner = container(decl);
	const symbol = owner?.name ? `${owner.name.text}.${name}` : name;
	return { symbol, since: sinceOf(decl) ?? (owner ? sinceOf(owner) : undefined) };
}

function obsidianDeclarations(id: ts.Identifier, checker: ts.TypeChecker): ts.Declaration[] {
	let sym = checker.getSymbolAtLocation(id);
	if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
	return (sym?.declarations ?? []).filter((d) => OBSIDIAN_DTS.test(d.getSourceFile().fileName));
}

function newerAt(id: ts.Identifier, checker: ts.TypeChecker, minAppVersion: string): { symbol: string; since: string }[] {
	return obsidianDeclarations(id, checker)
		.map((decl) => describeDecl(decl, id.text))
		.filter((d): d is { symbol: string; since: string } => !!d.since && compareVersions(d.since, minAppVersion) > 0);
}

export function findNewerObsidianApis(opts: {
	minAppVersion: string;
	rootNames: string[];
	virtualFiles?: Record<string, string>;
}): NewerApi[] {
	const options = compilerOptions();
	const program = ts.createProgram(opts.rootNames, options, createHost(options, opts.virtualFiles ?? {}));
	const checker = program.getTypeChecker();
	const roots = new Set(opts.rootNames.map(norm));
	const found = new Map<string, NewerApi>();

	for (const sf of program.getSourceFiles()) {
		if (!roots.has(norm(sf.fileName))) continue;
		const file = relative(process.cwd(), sf.fileName).replace(/\\/g, "/");
		const visit = (node: ts.Node): void => {
			if (ts.isIdentifier(node)) {
				const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
				for (const { symbol, since } of newerAt(node, checker, opts.minAppVersion))
					found.set(`${file}:${line}:${symbol}`, { file, line, symbol, since });
			}
			ts.forEachChild(node, visit);
		};
		visit(sf);
	}
	return [...found.values()];
}
