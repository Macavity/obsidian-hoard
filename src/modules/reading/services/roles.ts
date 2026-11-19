import type { Book, Manga, ReadingSettings, ReadingData, ReadingKind, ReadingItem } from '../domain/model';

export interface ReadingReader {
	getBook(id: string): Book | undefined;
	getManga(id: string): Manga | undefined;
	getBooks(): Book[];
	getMangaList(): Manga[];
}

export interface ReadingWriter {
	updateBook(updated: Book): Promise<void>;
	updateManga(updated: Manga): Promise<void>;
}

export interface ReadingSettingsAccess {
	getSettings(): ReadingSettings;
	updateSettings(patch: Partial<ReadingSettings>): Promise<void>;
	rewriteFrontmatterIfExists(kind: ReadingKind, item: ReadingItem): Promise<boolean>;
	createReadingNoteIfMissing(kind: ReadingKind, item: ReadingItem): Promise<boolean>;
}

export interface ReadingSnapshot {
	exportSnapshot(): ReadingData;
	restore(data: ReadingData): Promise<void>;
}
