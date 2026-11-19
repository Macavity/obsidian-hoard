/** A live tab instance; recreated on every switch to its tab, re-rendered in place on data changes. */
export interface TabInstance {
	render(): void | Promise<void>;
	destroy?(): void;
}
