/** A Completed title has every episode ticked: the full list when that applies, else undefined. */
export function completedEpisodes(status: string, totalEpisodes: number): number[] | undefined {
	return status === 'Completed' && totalEpisodes > 0
		? Array.from({ length: totalEpisodes }, (_, i) => i + 1)
		: undefined;
}
