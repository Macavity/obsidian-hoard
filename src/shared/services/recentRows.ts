/**
 * Search rows a provider keeps so a picked hit still carries its source record into the form.
 * Insertion order is recency: setting a key again moves it to the newest end.
 */
export class RecentRows<T> {
	private readonly rows = new Map<string, T>();

	constructor(private readonly cap: number) {}

	set(key: string, row: T): void {
		this.rows.delete(key);
		this.rows.set(key, row);
	}

	get(key: string): T | undefined {
		return this.rows.get(key);
	}

	/** Drops the oldest rows beyond the cap. Call once after a batch of `set`, so the batch is never cut. */
	trim(): void {
		for (const oldest of this.rows.keys()) {
			if (this.rows.size <= this.cap) break;
			this.rows.delete(oldest);
		}
	}
}
