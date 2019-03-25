import PromiseDeferral          from '/common/lib/PromiseDeferral';
import { Vue, Component, Prop } from 'vue-property-decorator';

const instancesToInitialize = [];
const YOUTUBE_PLAYER_STATES = {
	'-1': 'unstarted',
	'0' : 'ended',
	'1' : 'playing',
	'2' : 'paused',
	'3' : 'buffering',
	'5' : 'video-cued'
};

@Component
export default class VueYouTubePlayer extends Vue {

	// PROPS
	/**
	 * Property: true if the full-screen button should be visible
	 */
	@Prop(Boolean) fullScreenButton : boolean;

	// DATA

	/**
	 * The instance of the underlying YT.Player instance
	 */
	ytPlayer : any;

	readyDeferral : PromiseDeferral;

	initOptions : Object;

	// METHODS

	getCurrentVideoID() : string {
		const videoData = this.ytPlayer.getVideoData();
		return videoData ? videoData.video_id : '';
	}

	getCurrentVideoTitle() : string {
		const videoData = this.ytPlayer.getVideoData();
		return videoData ? videoData.title : '';
	}

	getState() : string {
		return YOUTUBE_PLAYER_STATES[this.ytPlayer.getPlayerState()];
	}

	/**
	 * @returns {Promise} resolves to true when the player is fully initialized
	 *                    must call this after construction before any other methods
	 */
	get whenReady() : Promise<boolean> {
		return this.readyDeferral ? this.readyDeferral.promise : Promise.resolve(false);
	}

	/**
	 * Loads but does not play the video.
	 * @param {string} urlOrID - the video's URL or youtube ID
	 */
	cueVideo(urlOrID : string) {
		checkReady(this);
		this.ytPlayer[urlOrID.startsWith('http') ? 'cueVideoByUrl' : 'cueVideoById'](urlOrID);
	}

	/**
	 * Loads and plays the video
	 * @param {string} urlOrID - the video's URL or youtube ID
	 */
	playVideo(urlOrID : string) {
		checkReady(this);
		this.ytPlayer[urlOrID.startsWith('http') ? 'loadVideoByUrl' : 'loadVideoById'](urlOrID);
	}

	// LIFE-CYCLE HOOKS

	/**
	 * Called when component is mounted.
	 */
	mounted() {
		if ((window as any).YT === undefined) {
			// YouTube script not yet loaded; wait for ready callback
			instancesToInitialize.push(this);
			this.initOptions = { fs : this.fullScreenButton };
			this.readyDeferral = new PromiseDeferral();
		}
		else {
			initialize(this);
		}
	}

	render(h) {
		return h('div')
	}

	beforeDestroy() {
		if (this.ytPlayer) {
			this.ytPlayer.destroy()
			delete this.ytPlayer;
		}
	}
}

function checkReady(player : VueYouTubePlayer) {
	if (!player.whenReady) {
		throw new Error('YouTube player not yet ready; wait on Promise from .whenReady');
	}
}

function initialize(player : VueYouTubePlayer) {
	if (player.ytPlayer) {
		return;
	}

	player.ytPlayer = new (window as any).YT.Player(player.$el, { playerVars : Object.assign({}, { enablejsapi : 1 }, player.initOptions) });
	player.ytPlayer.addEventListener('onReady', () => {
		if (player.readyDeferral) {
			player.readyDeferral.resolve();
		}
	});
	player.ytPlayer.addEventListener('onStateChange', event => {
		player.$emit(YOUTUBE_PLAYER_STATES[event.data]);
	});
}

// * this is the callback function for the script above and unfortunately has to be at the global level
(window as any).onYouTubeIframeAPIReady = function() {
	instancesToInitialize.forEach(initialize);
}

// include the youtube iframe API script
const tag            = document.createElement('script');
tag.src              = 'http://www.youtube.com/iframe_api';
const firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);