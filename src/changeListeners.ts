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

/** Base of the data managers: listener registration and the trigger for external callers (e.g. CsvModal) that force a UI refresh. */
export abstract class ChangeNotifier {
	private readonly listeners = new ChangeListeners();

	onChange(listener: () => void): void {
		this.listeners.add(listener);
	}

	offChange(listener: () => void): void {
		this.listeners.remove(listener);
	}

	notifyChange(): void {
		this.notifyListeners();
	}

	protected notifyListeners(): void {
		this.listeners.emit();
	}
}
