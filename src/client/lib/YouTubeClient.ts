import axios from "axios";

export default class YouTubeClient {
	private apiKey : string;
	private axios;

	constructor(apiKey : string) {
		this.apiKey = apiKey;
		this.axios  = axios.create({ baseURL: 'https://www.googleapis.com/youtube/v3' });
	}

	/**
	 *
	 * @param {string}  query
	 * @param {string}  [options.order] - see the equivalent options for the order param in https://developers.google.com/youtube/v3/docs/search/list
	 * @param {string}  [options.type]  - see the equivalent options for the type  param in https://developers.google.com/youtube/v3/docs/search/list
	 * @param {boolean} [options.details=false] if true, retrieves extra details about each video
	 */
	async search(query, { order = 'relevance', maxResults = 20, type = undefined, details = false }={}) : Promise<SearchResult[]> {
		const result = (await this.axios.get('search', {
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

		if (details) {
			(await this.axios.get('videos', {
				params : { key : this.apiKey, part : 'status,statistics,contentDetails',
					id : result.map(r => r.videoID).join(',')
				}
			})).data.items.forEach(item => {
				const videoResult = result.find(r => r.videoID === item.id);
				if (videoResult) {
					videoResult.viewCount  = Number(item.statistics.viewCount);
					videoResult.likeCount  = Number(item.statistics.likeCount);
					videoResult.embeddable = item.status.embeddable;
				}
			});
		}

		return result;
	}
}

export interface SearchResult {
	videoID      : string;
	title        : string;
	description  : string;
	thumbnailUrl?: string;
	viewCount    : number;
	likeCount    : number;
	embeddable   : boolean;
}