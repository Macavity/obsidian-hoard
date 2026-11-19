import { describe, expect, it, vi } from 'vitest';
import { followIndex } from '../src/shared/services/followIndex';

function setup() {
	let cb: (ids: Set<string>) => void = () => {};
	const index = { onChange: (f: (ids: Set<string>) => void) => { cb = f; } };
	const views = new Map<string, unknown>([['A/1', {}], ['A/2', {}], ['B/1', {}]]);
	const dirty = new Set<string>(['A/2']);
	const onTouched = vi.fn();
	followIndex(index, views, dirty, (id) => id.startsWith('A/'), onTouched);
	return { fire: (...ids: string[]) => cb(new Set(ids)), views, onTouched };
}

describe('followIndex', () => {
	it('drops clean own views and notifies once', () => {
		const { fire, views, onTouched } = setup();
		fire('A/1', 'A/2');
		expect([...views.keys()]).toEqual(['A/2', 'B/1']);
		expect(onTouched).toHaveBeenCalledTimes(1);
	});

	it('ignores foreign ids', () => {
		const { fire, views, onTouched } = setup();
		fire('B/1');
		expect(views.size).toBe(3);
		expect(onTouched).not.toHaveBeenCalled();
	});
});
