import { afterEach, describe, expect, it, vi } from 'vitest';
import { emitDataChanged, onDataChanged } from '../src/changeSignal';
import { setupDataManager } from './helpers/setupDataManager';

/** A second window (the settings window since Obsidian 1.15, a popout) that holds the focus. */
const otherDocument = (): Document => document.implementation.createHTMLDocument('other');
const focus = (doc: Document): void => { vi.stubGlobal('activeDocument', doc); };

afterEach(() => vi.unstubAllGlobals());

describe('change signal', () => {
	it('reaches a listener added while another window had the focus', () => {
		focus(otherDocument());
		const heard = vi.fn();
		const off = onDataChanged(heard);
		focus(document);
		emitDataChanged();
		expect(heard).toHaveBeenCalledTimes(1);
		off();
	});

	it('reaches a listener when the change happens while another window has the focus', () => {
		focus(document);
		const heard = vi.fn();
		const off = onDataChanged(heard);
		focus(otherDocument());
		emitDataChanged();
		expect(heard).toHaveBeenCalledTimes(1);
		off();
	});

	it('stops after off(), also when the focus moved in between', () => {
		focus(document);
		const heard = vi.fn();
		const off = onDataChanged(heard);
		focus(otherDocument());
		off();
		emitDataChanged();
		expect(heard).not.toHaveBeenCalled();
	});

	it('stays a DOM event on the main document (the visual capture script fires it there)', () => {
		const heard = vi.fn();
		const off = onDataChanged(heard);
		document.dispatchEvent(new CustomEvent('hoard-data-changed'));
		expect(heard).toHaveBeenCalledTimes(1);
		off();
	});
});

describe('manager change while another window has the focus', () => {
	it('DataManager.notifyChange reaches the main document', async () => {
		const { dm } = await setupDataManager({});
		const heard = vi.fn();
		document.addEventListener('hoard-data-changed', heard);
		focus(otherDocument());
		dm.notifyChange();
		document.removeEventListener('hoard-data-changed', heard);
		expect(heard).toHaveBeenCalledTimes(1);
	});
});
