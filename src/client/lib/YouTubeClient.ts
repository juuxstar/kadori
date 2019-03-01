import axios from "axios";

export default class YouTubeClient {
	private apiKey : string;
	private axios;

	constructor(apiKey : string) {
		this.apiKey   = apiKey;
		this.axios    = axios.create({ baseURL: 'https://www.googleapis.com/youtube/v3' });
	}

	/**
	 *
	 * @param {string} query
	 * @param {string} [options.order] - see the equivalent options for the order param in https://developers.google.com/youtube/v3/docs/search/list
	 * @param {string} [options.type]  - see the equivalent options for the type  param in https://developers.google.com/youtube/v3/docs/search/list
	 */
	async search(query, { order = 'relevance', maxResults = 20, type = undefined }={}) : Promise<SearchResult[]> {
		return (await this.axios.get('search', {
			params : { key : this.apiKey, part : 'snippet',
				q : query, order, type, maxResults
			},
		}))
		.data.items.map(item => ({
			videoID     : item.id.videoId,
			title       : item.snippet.title,
			description : item.snippet.description,
			thumbnailUrl: item.snippet.thumbnails.default.url
		}));
	}
}

export interface SearchResult {
	videoID      : string;
	title        : string;
	description  : string;
	thumbnailUrl?: string;
}