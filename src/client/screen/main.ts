import _             from 'lodash';
import Vue           from 'vue';
import io            from 'socket.io-client';
import '/lib/VueYouTubePlayer';

// const videoPlayer = new YouTubePlayer(document.querySelector('.youtube-player'));
const socket      = io.connect('/screen');

const vm = new Vue({
	el : '#root',

	data : {
		controllerURL : document.location.origin + '/controller',

		// the list of users in the order to sing
		queue : [],
	},

	created : function() {
		socket.emit('queue', queue => {
			this.queue = queue;
		});
		socket.emit('currentVideo', currentVideoID => {
			this.playVideo(currentVideoID);
		});
	},

	methods : {
		playVideo : function(videoID) {
			if (!videoID) {
				return;
			}

			this.$refs.youtube.player.playVideo(videoID);
			/*videoPlayer.whenReady().then(() => {
				videoPlayer.cueVideo(videoID);
			});*/
		}
	}
});

socket
	.on('queue', queue => {
		vm.queue = queue;
	})
	.on('playVideo', videoID => {
		vm.playVideo(videoID);
	})
;
