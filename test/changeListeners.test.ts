import { describe, expect, it } from 'vitest';
import { ChangeListeners } from '../src/changeListeners';

describe('ChangeListeners', () => {
	it('calls the listeners in the order they were added', () => {
		const calls: string[] = [];
		const listeners = new ChangeListeners();
		listeners.add(() => calls.push('a'));
		listeners.add(() => calls.push('b'));
		listeners.emit();
		listeners.emit();
		expect(calls).toEqual(['a', 'b', 'a', 'b']);
	});

	it('stops calling a removed listener and ignores one it never had', () => {
		const calls: string[] = [];
		const a = (): void => { calls.push('a'); };
		const b = (): void => { calls.push('b'); };
		const listeners = new ChangeListeners();
		listeners.add(a);
		listeners.add(b);
		listeners.remove(a);
		listeners.remove(() => {});
		listeners.emit();
		expect(calls).toEqual(['b']);
	});

	it('calls a listener added twice twice, and removes both at once', () => {
		let n = 0;
		const count = (): void => { n++; };
		const listeners = new ChangeListeners();
		listeners.add(count);
		listeners.add(count);
		listeners.emit();
		expect(n).toBe(2);
		listeners.remove(count);
		listeners.emit();
		expect(n).toBe(2);
	});

	it('lets a listener remove itself while the others still run', () => {
		const calls: string[] = [];
		const listeners = new ChangeListeners();
		const once = (): void => { calls.push('once'); listeners.remove(once); };
		listeners.add(once);
		listeners.add(() => calls.push('always'));
		listeners.emit();
		listeners.emit();
		expect(calls).toEqual(['once', 'always', 'always']);
	});
});
