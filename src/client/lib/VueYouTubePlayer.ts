import PromiseDeferral          from '/lib/PromiseDeferral';
import { Vue, Component, Prop } from 'vue-property-decorator';

const instancesToInitialize = [];

declare let YT : any;	// the global YouTube object

@Component({ name : 'youtube-player' })
export default class VueYouTubePlayer extends Vue {

	// PROPERTIES
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

	// LIFECYCLE HOOKS

	/**
	 * Called when component is mounted.
	 */
	mounted() {
		if (YT === undefined) {
			// YouTube script not yet loaded; wait for ready callback
			instancesToInitialize.push(this);
			this.initOptions = { fs : this.fullScreenButton };
			this.readyDeferral = new PromiseDeferral();
		}
		else {
			initialize(this);
		}
	}

	beforeDestroy() {
		if (this.ytPlayer) {
			this.ytPlayer.destroy()
			delete this.ytPlayer;
		}
	}
}

function checkReady(player) {
	if (!player.whenReady()) {
		throw new Error('YouTube player not yet ready; wait on Promise from .whenReady()');
	}
}

function initialize(player) {
	if (player.ytPlayer) {
		return;
	}

	this.ytPlayer = new YT.Player(this.element, { playerVars : Object.assign({}, { enablejsapi : 1 }, this.initOptions) });
	this.ytPlayer.addEventListener('onReady', () => {
		if (this.readyDeferral) {
			this.readyDeferral.resolve();
		}
	});
}

// * this is the callback function for the script above and unfortunately has to be at the global level
(window as any).onYouTubeIframeAPIReady = function() {
	instancesToInitialize.forEach(instance => instance.initialize());
}

// include the youtube iframe API script
const tag            = document.createElement('script');
tag.src              = 'http://www.youtube.com/iframe_api';
const firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);