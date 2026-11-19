/** `tt…` out of a stored `URL` property; both OMDb and TMDB adds write an imdb.com URL */
export function imdbIdFromLink(link: string | undefined): string {
	if (!link) return '';
	return link.match(/\/(tt\d+)/)?.[1] ?? '';
}
