import { describe, it, expect, vi } from 'vitest';
import { createSectionedResults } from '../../src/design-system/SectionedResults';
import { El } from '../helpers/fakeEl';

const SECTIONS = [
	{ key: 'anime', label: 'Anime' },
	{ key: 'movie', label: 'Movies' },
	{ key: 'game', label: 'Games' },
];

function setup() {
	const onSelect = vi.fn();
	const view = createSectionedResults<string>({
		renderItem: (host, item, select) => {
			const el = (host as unknown as El).createDiv({ cls: 'hoard-search-picker__result-card', text: item });
			el.addEventListener('click', () => select(el as unknown as HTMLElement));
			return el as unknown as HTMLElement;
		},
		onSelect,
	});
	const root = new El('root');
	view.mount(root as unknown as HTMLElement);
	view.setSections(SECTIONS);
	const section = (key: string): El =>
		root.findAll('hoard-result-sections__section').find((s) => s.attr['data-section'] === key)!;
	return { view, root, onSelect, section };
}

describe('SectionedResults', () => {
	it('renders sections in the given order', () => {
		const { root } = setup();
		const keys = root.findAll('hoard-result-sections__section').map((s) => s.attr['data-section']);
		expect(keys).toEqual(['anime', 'movie', 'game']);
		const labels = root.findAll('hoard-result-sections__label').map((l) => l.text);
		expect(labels).toEqual(['Anime', 'Movies', 'Games']);
	});

	it('empty results hide the section', () => {
		const { view, section } = setup();
		view.setResults('anime', ['a']);
		expect(section('anime').hidden).toBe(false);
		view.setResults('anime', []);
		expect(section('anime').hidden).toBe(true);
	});

	it('error in one section leaves the others', () => {
		const { view, section } = setup();
		view.setResults('anime', ['a', 'b']);
		view.setLoading('movie');
		view.setError('game', 'boom');
		expect(section('anime').findAll('hoard-search-picker__result-card')).toHaveLength(2);
		expect(section('movie').find('hoard-modal__loading')).toBeDefined();
		const err = section('game').find('hoard-search-picker__api-error')!;
		expect(err.find('hoard-search-picker__missing-api-text')!.text).toBe('boom');
		expect(section('game').hidden).toBe(false);
	});

	it('header click collapses only that section', () => {
		const { view, section } = setup();
		view.setResults('anime', ['a']);
		view.setResults('movie', ['m']);
		section('anime').find('hoard-result-sections__header')!.fire('click');
		expect(section('anime').has('is-collapsed')).toBe(true);
		expect(section('movie').has('is-collapsed')).toBe(false);
		section('anime').find('hoard-result-sections__header')!.fire('click');
		expect(section('anime').has('is-collapsed')).toBe(false);
	});

	it('header is a keyboard-operable button that reports aria-expanded', () => {
		const { view, section } = setup();
		view.setResults('anime', ['a']);
		const header = section('anime').find('hoard-result-sections__header')!;
		expect(header.attr).toMatchObject({ role: 'button', tabindex: '0', 'aria-expanded': 'true' });
		header.fire('keydown', { key: 'Enter' });
		expect(section('anime').has('is-collapsed')).toBe(true);
		expect(header.attr['aria-expanded']).toBe('false');
		header.fire('keydown', { key: ' ' });
		expect(section('anime').has('is-collapsed')).toBe(false);
		expect(header.attr['aria-expanded']).toBe('true');
		header.fire('keydown', { key: 'a' });
		expect(header.attr['aria-expanded']).toBe('true');
	});

	it('select marks one item across sections and calls onSelect(key, item)', () => {
		const { view, root, section, onSelect } = setup();
		view.setResults('anime', ['a']);
		view.setResults('movie', ['m']);
		const a = section('anime').find('hoard-search-picker__result-card')!;
		const m = section('movie').find('hoard-search-picker__result-card')!;
		a.fire('click');
		m.fire('click');
		expect(a.has('is-selected')).toBe(false);
		expect(m.has('is-selected')).toBe(true);
		expect(root.findAll('is-selected')).toHaveLength(1);
		expect(onSelect).toHaveBeenLastCalledWith('movie', 'm');
	});

	it('setSections resets all sections', () => {
		const { view, section } = setup();
		view.setResults('anime', ['a']);
		view.setSections(SECTIONS);
		expect(section('anime').hidden).toBe(true);
		expect(section('anime').find('hoard-search-picker__result-card')).toBeUndefined();
	});
});
