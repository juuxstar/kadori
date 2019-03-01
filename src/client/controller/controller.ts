import _               from 'lodash';
import Vue             from 'vue';
import VueDraggable    from 'vuedraggable';
import io              from 'socket.io-client';
import YouTubeClient, { SearchResult } from '/lib/YouTubeClient';

const googleAPIKey  = 'AIzaSyCA-EQFjc-c8pBfEv9F_GYuiBjHu_Ym18k';
const youTubeClient = new YouTubeClient(googleAPIKey);
const socket        = io.connect('/singer');

const localUserName    = localStorage.getItem('kadori.userName') || '';
const localSearchValue = localStorage.getItem('kadori.searchValue');

Vue.component('draggable', VueDraggable);


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
		queued : []
	},

	created : function() {
		// populate initial search results
		if (this.searchValue) {
			this.search();
		}
		if (this.userName) {
			socket.emit('name', this.userName);
		}
	},

	watch : {
		searchValue : function() {
			this.search();
			localStorage.setItem('kadori.searchValue', this.searchValue);
		},

		userName : function() {
			localStorage.setItem('kadori.userName', this.userName);
			socket.emit('name', this.userName);
		},

		queued : function() {
			socket.emit('queueUpdate');
		}
	},

	methods : {
		submitUserName : function() {
			this.isUserNameEditorVisible = !this.userName;
		},

		search : _.debounce(async function() {
			// NOTE: double-quotes around "karaoke" indicates that it's a required to appear in the search results
			this.searchResults = (await youTubeClient.search(`"karaoke" ${this.searchValue}`, { type : 'video', order : 'relevance' }))
				.map(result => {
					// try to clean up the title a bit
					result.title = cleanUpTitle(result.title);
					return result;
				});
			;
		}, 500),

		swipeLeft : function() {
			console.log('swiped left', arguments);
		},

		moving : function() {
			console.log('moving', arguments);
		}
	},
});

function cleanUpTitle(title) {
	return title
		.replace(/\(\s*[(HD)(Lyrics)\s]*Karaoke[(with\s+Lyrics)(Version)\s]*\s*\)/i, '')
		.replace(/^karaoke\s*-?\s*/i, '')
		.replace(/\s*-?\s*karaoke\s*-?\s*(lyrics)?\s*$/i, '')
		.replace(/\[[(instrumental)\s*\/(karaoke)]*\]/i, '')
		.replace(/\*$/, '')
		.replace(/\[\s*goodkaraokesongs.com\s*\]/i, '')
	;
}

socket.on('getNextVideo', reply => {
	const nextVideo = _.first(vm.queued);
	reply(nextVideo ? nextVideo.videoID : undefined);
});
