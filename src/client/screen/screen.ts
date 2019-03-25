import _                   from 'lodash';
import Vue                 from 'vue';
import QRCode              from 'qrcode';
import YouTubePlayer       from '/lib/VueYouTubePlayer';
import Socket              from '/lib/Socket';
import cleanupKaraokeTitle from '/lib/karaokeTitle';

Vue.component('youtube-player', YouTubePlayer);

class ScreenSocket extends Socket {
	onQueue(newQueue) {
		vm.queue = newQueue;
	}

	onPlayVideo(videoID) {
		vm.playVideo(videoID);
	}
}

const vm = new Vue({
	el : '#root',

	data : {
		title : 'KADORI - Karaoke Done Right',

		controllerURL : document.location.origin + '/controller',

		controllerDataURI : '',

		// the list of users in the order to sing
		queue : [],

		socket : ScreenSocket,

		youtubePlayer : YouTubePlayer,
	},

	created : function() {
		this.socket = new ScreenSocket();

		QRCode.toDataURL(this.controllerURL, (error, url) => {
			this.controllerDataURI = url;
		});
	},

	mounted : async function() {
		this.youtubePlayer = this.$refs.youtube;
		await this.youtubePlayer.whenReady;

		vm.queue = await this.socket.emitWithReply('getQueue');
		this.playVideo(await this.socket.emitWithReply('getCurrentVideoID'));
	},

	methods : {
		playVideo : function(videoID) {
			if (!videoID) {
				return;
			}

			this.youtubePlayer.playVideo(videoID);
		},

		onPlayingVideo : function() {
			this.title = cleanupKaraokeTitle(this.youtubePlayer.getCurrentVideoTitle());
			this.emitCurrentVideoID();
		},

		emitCurrentVideoID : function() {
			const state = this.youtubePlayer.getState();

			// in the unstarted state, wait a bit in hopes that the videoPlayer will start playing something soon
			const timeout = state === 'unstarted' ? 2000 : 0;

			setTimeout(() => {
				const state = this.youtubePlayer.getState();
				this.socket.emit('setCurrentVideoID', state === 'unstarted' || state === 'ended' ? '' : this.youtubePlayer.getCurrentVideoID())
			}, timeout);
		},

		getNextUp : function() {
			const upNext = _.find(this.queue, 'queue');
			return upNext ? upNext.name : '';
		}
	}
});

export default vm;
