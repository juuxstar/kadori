import _               from 'lodash';
import Vue             from 'vue';
import VueDraggable    from 'vuedraggable';
import Socket          from '/lib/Socket';
import YouTubeClient, { SearchResult } from '/lib/YouTubeClient';
import cleanupKaraokeTitle from '/lib/karaokeTitle';

const googleAPIKey  = 'AIzaSyCA-EQFjc-c8pBfEv9F_GYuiBjHu_Ym18k';
const youTubeClient = new YouTubeClient(googleAPIKey);

const localUserName    = localStorage.getItem('kadori.userName') || '';
const localSearchValue = localStorage.getItem('kadori.searchValue');

Vue.component('draggable', VueDraggable);

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

		swipeLeft : function() {
			console.log('swiped left', arguments);
		},

		moving : function() {
			console.log('moving', arguments);
		},

		humanizeNumber : function(number) {
			if (number >= 1000000) {
				return (Math.round(number / 100000) / 10) + ' M';
			}
			if (number >= 1000) {
				return (Math.round(number / 100) / 10) + ' K';
			}
			return number + '';
		}
	},
});
