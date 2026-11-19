/**
 * Thousands-separated count — word totals run into six digits. Locale-independent
 * by design: the grouping character must not drift with the OS.
 */
export function formatCount(n: number): string {
	return String(Math.max(0, Math.round(n || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatTime(minutes: number): string {
	if (minutes <= 0) return '0m';
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	// comma groups, like formatCount; a dot here reads back as a decimal
	const hStr = h >= 1000 ? String(h).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : String(h);
	if (h === 0) return `${m}m`;
	if (m === 0) return `${hStr}h`;
	return `${hStr}h ${m}m`;
}

/**
 * One number out of a playtime string. A separator followed by exactly three digits is
 * digit grouping ("3,000" / "3.000" = 3000); anything else is a decimal ("1.5" / "1,5").
 */
function parseTimeNumber(raw: string): number {
	const s = raw
		.replace(/\s/g, '')
		.replace(/[.,](?=\d{3}(?:[.,]|$))/g, '')
		.replace(',', '.');
	const n = Number(s);
	return Number.isFinite(n) ? n : 0;
}

/**
 * Parses a freeform playtime into minutes: "42h 30m", "42h", "90m", "1.5h", "2:30",
 * or a bare number (read as hours — games are hour-scale). 0 = untracked.
 */
export function parsePlaytimeInput(text: string): number {
	const s = text.trim().toLowerCase();
	if (!s) return 0;

	const clock = s.match(/^(\d+):([0-5]?\d)$/);
	if (clock) return Number(clock[1]) * 60 + Number(clock[2]);

	// NUM matches grouped numbers too, so "3,000h" is not read as 3
	let minutes = 0;
	let matched = false;
	const hours = s.match(/(\d+(?:[.,]\d+)*)\s*h/);
	if (hours) {
		minutes += Math.round(parseTimeNumber(hours[1]!) * 60);
		matched = true;
	}
	const mins = s.match(/(\d+(?:[.,]\d+)*)\s*m/);
	if (mins) {
		minutes += Math.round(parseTimeNumber(mins[1]!));
		matched = true;
	} else if (hours) {
		// "12h30" — a unit-less tail after the hours reads as minutes
		const tail = s.match(/h\s*(\d+)\s*$/);
		if (tail) minutes += Number(tail[1]);
	}
	if (matched) return minutes;

	const bare = parseTimeNumber(s);
	return bare > 0 ? Math.round(bare * 60) : 0;
}

// API result types
