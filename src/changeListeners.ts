/** The functions a data manager calls after its data changed. */
export class ChangeListeners {
	private listeners: Array<() => void> = [];

	add(listener: () => void): void {
		this.listeners.push(listener);
	}

	/** Removes every registration of the listener. */
	remove(listener: () => void): void {
		this.listeners = this.listeners.filter((l) => l !== listener);
	}

	/** Calls the listeners in the order they were added. */
	emit(): void {
		for (const listener of this.listeners) listener();
	}
}
