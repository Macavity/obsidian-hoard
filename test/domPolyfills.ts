/* Minimal stand-ins for Obsidian's DOM helpers (happy-dom has none). */
type Opts = { cls?: string | string[]; text?: string; attr?: Record<string, string> } | string;

const normalize = (o?: Opts): Exclude<Opts, string> => (typeof o === "string" ? { cls: o } : (o ?? {}));

function build<K extends keyof HTMLElementTagNameMap>(tag: K, opts?: Opts): HTMLElementTagNameMap[K] {
	const el = document.createElement(tag);
	const { cls, text, attr } = normalize(opts);
	if (cls) el.className = Array.isArray(cls) ? cls.join(" ") : cls;
	if (text !== undefined) el.textContent = text;
	for (const [k, v] of Object.entries(attr ?? {})) el.setAttribute(k, v);
	return el;
}

function createEl<K extends keyof HTMLElementTagNameMap>(this: Node, tag: K, opts?: Opts): HTMLElementTagNameMap[K] {
	return this.appendChild(build(tag, opts));
}

// Obsidian's detached-element globals.
const g = globalThis as unknown as Record<string, unknown>;
g.createEl ??= build;
g.createDiv ??= (o?: Opts) => build("div", o);
g.createSpan ??= (o?: Opts) => build("span", o);

const arr = Array.prototype as unknown as Record<string, unknown>;
arr.remove ??= function (this: unknown[], item: unknown) {
	const i = this.indexOf(item);
	if (i >= 0) this.splice(i, 1);
};

const proto = Node.prototype as unknown as Record<string, unknown>;
proto.createEl ??= createEl;
proto.createDiv ??= function (this: Node, o?: Opts) { return createEl.call(this, "div", o); };
proto.createSpan ??= function (this: Node, o?: Opts) { return createEl.call(this, "span", o); };
proto.instanceOf ??= function (this: Node, type: abstract new (...a: never[]) => unknown) { return this instanceof type; };
proto.addClass ??= function (this: Element, ...c: string[]) { this.classList.add(...c); };
proto.removeClass ??= function (this: Element, ...c: string[]) { this.classList.remove(...c); };
proto.setText ??= function (this: Element, t: string) { this.textContent = t; };
proto.toggleClass ??= function (this: Element, c: string, on: boolean) { this.classList.toggle(c, on); };
proto.setCssProps ??= function (this: HTMLElement, props: Record<string, string>) {
	for (const [k, v] of Object.entries(props)) this.style.setProperty(k, v);
};
proto.empty ??= function (this: Element) { this.replaceChildren(); };
