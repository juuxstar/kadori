import _                        from 'lodash';
import VueDraggable             from 'vuedraggable';
import { Vue, Component, Prop } from 'vue-property-decorator';
import Socket                          from '/lib/Socket';
import YouTubeClient, { SearchResult } from '/lib/YouTubeClient';
import cleanupKaraokeTitle             from '/lib/karaokeTitle';
import { googleAPIKey }                from '/config/secrets';
import KadoriVideo                     from './KadoriVideo';

const youTubeClient = new YouTubeClient(googleAPIKey);

const localUserName    = localStorage.getItem('kadori.userName') || '';
const localSearchValue = localStorage.getItem('kadori.searchValue');

Vue.component('draggable', VueDraggable);
Vue.component('kadori-video', KadoriVideo);

class SingerSocket extends Socket {
	setName(newName : string) {
		this.emit('setName', newName);
	}

	setQueueLength() {
		this.emit('setQueueLength', vm.queued.length);
	}

	onConnect() {
		if (vm.userName) {
			this.setName(vm.userName);
			this.setQueueLength();
		}
	}

	// server asking for this user's next queued up videoID
	onGetNextVideo() : string {
		return (_.first(vm.queued) || {}).videoID;
	}

	onPlayingVideo(videoID) {
		const oldLength = vm.queued.length;
		const newQueue = vm.queued.filter(video => video.videoID != videoID);
		if (oldLength != newQueue.length) {
			vm.queued = newQueue;
		}
	}
}

const vm = new Vue({
	el : '#root',

	data : {
		// the name of the current user
		userName : localUserName,

		isUserNameEditorVisible : !localUserName,

		visiblePane : 'queue',

		searchValue : localSearchValue,

		// the list of videos in the search results
		searchResults : [],

		// the list of videos queued up next
		queued : [],

		socket : SingerSocket,
	},

	created : function() {
		// populate initial search results
		if (this.searchValue) {
			this.search();
		}
		this.socket = new SingerSocket();	// creates and connects socket to the server
	},

	watch : {
		searchValue : function() {
			this.search();
			localStorage.setItem('kadori.searchValue', this.searchValue);
		},

		userName : function() {
			localStorage.setItem('kadori.userName', this.userName);
			this.socket.setName(this.userName);
		},

		queued : function() {
			this.socket.setQueueLength();
		}
	},

	methods : {
		submitUserName : function() {
			this.isUserNameEditorVisible = !this.userName;
		},

		search : _.debounce(async function() {
			// NOTE: double-quotes around "karaoke" indicates that it's a required to appear in the search results
			this.searchResults = _(await youTubeClient.search(`"karaoke" ${this.searchValue}`, {
				type : 'video', order : 'relevance', details : true, maxResults : 50
			}))
				.filter('embeddable')
				.map(result => {
					// try to clean up the title a bit
					result.title = cleanupKaraokeTitle(result.title);
					return result;
				})
				.orderBy('viewCount', 'desc')
				.valueOf();
			;
		}, 500),

		addToQueue : function(video) {
			this.queued.push(video);
			this.removeFromSearch(video);
		},

		removeFromSearch : function(video) {
			this.searchResults = this.searchResults.filter(result => result.videoID !== video.videoID);
		},

		removeFromQueue : function(video) {
			this.queued = this.queued.filter(song => song.videoID !== video.videoID);
		},

		togglePane : function(paneName) {
			this.visiblePane = this.visiblePane === paneName ? 'queue' : paneName;
		}
	},
});
