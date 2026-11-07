import { parse, stringify } from "yaml";

type Handler = (...args: unknown[]) => unknown;

export class Events {
	private handlers = new Map<string, Set<Handler>>();
	on(name: string, cb: Handler): { name: string; cb: Handler } {
		let set = this.handlers.get(name);
		if (!set) {
			set = new Set();
			this.handlers.set(name, set);
		}
		set.add(cb);
		return { name, cb };
	}
	off(name: string, cb: Handler): void {
		this.handlers.get(name)?.delete(cb);
	}
	offref(ref: { name: string; cb: Handler }): void {
		this.off(ref.name, ref.cb);
	}
	trigger(name: string, ...args: unknown[]): void {
		for (const cb of [...(this.handlers.get(name) ?? [])]) cb(...args);
	}
}

export class Component {
	private cleanups: (() => unknown)[] = [];
	load(): void {}
	unload(): void {
		for (const cb of this.cleanups.splice(0)) cb();
	}
	onload(): void {}
	onunload(): void {}
	addChild<T extends Component>(child: T): T {
		return child;
	}
	register(cb: () => unknown): void {
		this.cleanups.push(cb);
	}
	registerEvent(_ref: unknown): void {}
	registerDomEvent(..._args: unknown[]): void {}
	registerInterval(id: number): number {
		return id;
	}
}

export class Plugin extends Component {
	app: unknown = {};
	manifest: unknown = {};
	addCommand(cmd: unknown): unknown {
		return cmd;
	}
	addSettingTab(_tab: unknown): void {}
	addStatusBarItem(): HTMLElement {
		return document.body.createDiv({ cls: "status-bar-item" });
	}
	registerBasesView(_id: string, _def: unknown): void {}
	loadData(): Promise<unknown> {
		return Promise.resolve(null);
	}
	saveData(_data: unknown): Promise<void> {
		return Promise.resolve();
	}
}

export class TFile {
	path = "";
	name = "";
	basename = "";
	extension = "";
}

export class Notice {
	constructor(public message?: string | DocumentFragment, public duration?: number) {}
	hide(): void {}
}

export class Modal {
	modalEl: HTMLElement;
	titleEl: HTMLElement;
	contentEl: HTMLElement;
	constructor(public app: unknown) {
		this.modalEl = document.createElement("div");
		this.titleEl = this.modalEl.appendChild(document.createElement("div"));
		this.contentEl = this.modalEl.appendChild(document.createElement("div"));
	}
	open(): void {
		document.body.appendChild(this.modalEl);
		this.onOpen();
	}
	close(): void {
		this.onClose();
		this.modalEl.remove();
	}
	onOpen(): void {}
	onClose(): void {}
	setTitle(title: string): this {
		this.titleEl.textContent = title;
		return this;
	}
}

interface MockMatch<T> {
	item: T;
	match: { score: number; matches: [number, number][] };
}

export class FuzzySuggestModal<T> extends Modal {
	inputEl: HTMLInputElement;
	resultContainerEl: HTMLElement;
	emptyStateText = "";
	constructor(app: unknown) {
		super(app);
		this.inputEl = this.modalEl.appendChild(document.createElement("input"));
		this.resultContainerEl = this.modalEl.appendChild(document.createElement("div"));
	}
	setPlaceholder(_text: string): void {}
	getItems(): T[] {
		return [];
	}
	getItemText(_item: T): string {
		return "";
	}
	getSuggestions(query: string): MockMatch<T>[] {
		const q = query.toLowerCase();
		return this.getItems()
			.filter((item) => this.getItemText(item).toLowerCase().includes(q))
			.map((item) => ({ item, match: { score: 0, matches: [] } }));
	}
	renderSuggestion(_match: MockMatch<T>, _el: HTMLElement): void {}
	onChooseSuggestion(_match: MockMatch<T>, _evt: MouseEvent | KeyboardEvent): void {}
	selectSuggestion(match: MockMatch<T>, evt: MouseEvent | KeyboardEvent): void {
		this.close();
		this.onChooseItem(match.item, evt);
		this.onChooseSuggestion(match, evt);
	}
	onChooseItem(_item: T, _evt: MouseEvent | KeyboardEvent): void {}
	/** Test helper: renders the suggestions for a query the way the modal's result list does. */
	renderAll(query: string): void {
		this.resultContainerEl.empty();
		for (const match of this.getSuggestions(query)) {
			const div = this.resultContainerEl.createDiv();
			this.renderSuggestion(match, div);
			div.addEventListener("click", (evt) => this.selectSuggestion(match, evt));
		}
	}
}

export function renderMatches(el: HTMLElement | DocumentFragment, text: string, _matches: unknown, _offset?: number): void {
	if (el instanceof DocumentFragment) el.append(document.createTextNode(text));
	else el.textContent = text;
}

export class PluginSettingTab {
	containerEl: HTMLElement = document.createElement("div");
	constructor(public app: unknown, public plugin: unknown) {}
	display(): void {}
	hide(): void {}
}

/** Language Obsidian reports; tests set it through `setMockLanguage`. */
let mockLanguage = "en";
export function getLanguage(): string {
	return mockLanguage;
}
export function setMockLanguage(code: string): void {
	mockLanguage = code;
}

export const Platform = {
	isDesktop: true,
	isMobile: false,
	isDesktopApp: true,
	isMobileApp: false,
};

export function getFrontMatterInfo(text: string): { exists: boolean; frontmatter: string } {
	const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
	return m ? { exists: true, frontmatter: m[1] ?? "" } : { exists: false, frontmatter: "" };
}

export function parseYaml(text: string): unknown {
	return parse(text);
}

export function stringifyYaml(value: unknown): string {
	return stringify(value);
}

export abstract class BasesView extends Component {
	app: unknown = {};
	config: { get(key: string): unknown } = { get: () => undefined };
	data: { data: Array<{ file: TFile }> } = { data: [] };
	constructor(_controller?: unknown) {
		super();
	}
	abstract onDataUpdated(): void;
}

export class MarkdownRenderer {
	static render(_app: unknown, _md: string, _el: HTMLElement, _sourcePath: string, _component: Component): Promise<void> {
		return Promise.resolve();
	}
}

export function addIcon(_iconId: string, _svgContent: string): void {}

/** Wikilinks only; anything else is "not a link", as in Obsidian. */
export class LinkValue {
	constructor(private readonly raw: string) {}
	static parseFromString(_app: unknown, raw: string, _sourcePath: string): LinkValue | null {
		return /^\[\[.*\]\]$/.test(raw) ? new LinkValue(raw) : null;
	}
	renderTo(el: HTMLElement, _ctx: unknown): void {
		el.textContent = this.raw;
	}
}

export function removeIcon(_iconId: string): void {}

export class ButtonComponent {
	buttonEl: HTMLButtonElement;
	constructor(containerEl: HTMLElement) {
		this.buttonEl = containerEl.createEl("button");
	}
	setButtonText(text: string): this {
		this.buttonEl.textContent = text;
		return this;
	}
	setCta(): this {
		return this;
	}
	setDestructive(): this {
		return this;
	}
	setDisabled(disabled: boolean): this {
		this.buttonEl.disabled = disabled;
		return this;
	}
	onClick(cb: (evt: MouseEvent) => unknown): this {
		this.buttonEl.addEventListener("click", cb);
		return this;
	}
}

export class TextComponent {
	inputEl: HTMLInputElement;
	constructor(containerEl: HTMLElement) {
		this.inputEl = containerEl.createEl("input");
	}
	setValue(value: string): this {
		this.inputEl.value = value;
		return this;
	}
	onChange(cb: (value: string) => unknown): this {
		this.inputEl.addEventListener("input", () => cb(this.inputEl.value));
		return this;
	}
}

export class DropdownComponent {
	selectEl: HTMLSelectElement;
	constructor(containerEl: HTMLElement) {
		this.selectEl = containerEl.createEl("select");
	}
	addOption(value: string, display: string): this {
		this.selectEl.createEl("option", { text: display, attr: { value } });
		return this;
	}
	setValue(value: string): this {
		this.selectEl.value = value;
		return this;
	}
	onChange(cb: (value: string) => unknown): this {
		this.selectEl.addEventListener("change", () => cb(this.selectEl.value));
		return this;
	}
}

export class ToggleComponent {
	toggleEl: HTMLElement;
	private value = false;
	constructor(containerEl: HTMLElement) {
		this.toggleEl = containerEl.createDiv();
	}
	setValue(value: boolean): this {
		this.value = value;
		return this;
	}
	onChange(cb: (value: boolean) => unknown): this {
		this.toggleEl.addEventListener("click", () => {
			this.value = !this.value;
			cb(this.value);
		});
		return this;
	}
}

export class Setting {
	settingEl: HTMLElement;
	nameEl: HTMLElement;
	controlEl: HTMLElement;
	constructor(containerEl: HTMLElement) {
		this.settingEl = containerEl.createDiv({ cls: "setting-item" });
		this.nameEl = this.settingEl.createDiv({ cls: "setting-item-name" });
		this.controlEl = this.settingEl.createDiv({ cls: "setting-item-control" });
	}
	setName(name: string): this {
		this.nameEl.textContent = name;
		return this;
	}
	setDesc(_desc: string): this {
		return this;
	}
	addButton(cb: (b: ButtonComponent) => unknown): this {
		cb(new ButtonComponent(this.controlEl));
		return this;
	}
	addText(cb: (t: TextComponent) => unknown): this {
		cb(new TextComponent(this.controlEl));
		return this;
	}
	addDropdown(cb: (d: DropdownComponent) => unknown): this {
		cb(new DropdownComponent(this.controlEl));
		return this;
	}
	addToggle(cb: (t: ToggleComponent) => unknown): this {
		cb(new ToggleComponent(this.controlEl));
		return this;
	}
}

export class MenuItem {
	private clickHandler: (() => unknown) | null = null;
	setTitle(_title: string): this {
		return this;
	}
	setIcon(_icon: string): this {
		return this;
	}
	setSection(_section: string): this {
		return this;
	}
	setChecked(_checked: boolean): this {
		return this;
	}
	onClick(cb: () => unknown): this {
		this.clickHandler = cb;
		return this;
	}
	click(): void {
		this.clickHandler?.();
	}
}

export class Menu {
	items: MenuItem[] = [];
	addItem(cb: (item: MenuItem) => unknown): this {
		const item = new MenuItem();
		cb(item);
		this.items.push(item);
		return this;
	}
	setUseNativeMenu(_flag: boolean): this {
		return this;
	}
	addSeparator(): this {
		return this;
	}
	showAtMouseEvent(_evt: MouseEvent): this {
		return this;
	}
	onHide(_cb: () => unknown): this {
		return this;
	}
	hide(): this {
		return this;
	}
}

export function setIcon(el: HTMLElement, iconId: string): void {
	el.setAttribute("data-icon", iconId);
}

export const KNOWN_ICONS = new Set<string>();

export function getIcon(id: string): SVGSVGElement | null {
	return KNOWN_ICONS.has(id) ? document.createElementNS("http://www.w3.org/2000/svg", "svg") : null;
}

export function setTooltip(el: HTMLElement, tooltip: string, _options?: unknown): void {
	el.setAttribute("data-tooltip", tooltip);
}
