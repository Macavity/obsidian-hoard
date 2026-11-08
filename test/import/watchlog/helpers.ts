import type { createFakeApp } from '../../fakes/fakeApp';

/** Copies of the fake app's vault and adapter files, to assert that nothing was written. */
export function snapshot(f: Pick<ReturnType<typeof createFakeApp>, 'files' | 'adapterFiles'>) {
	return { files: new Map(f.files), adapterFiles: new Map(f.adapterFiles) };
}
