/**
 * Component that shows one video result.
 * Supports a swipe-left and swipe-right action.
 */

import { Vue, Component, Prop } from 'vue-property-decorator';
import { SearchResult }         from '/lib/YouTubeClient';

const MAX_SWIPE_PIXELS = 200;	// the max number of pixels that the component can be swiped left/right

const template = `
<div class="video flex-row">
	<div class="action-left flex-row flex-center"
		v-if="$slots['action-left']"
		v-on:click="$emit('action-left', video)"
	>
		<slot name="action-left"></slot>
	</div>
	<div class="action-right flex-row flex-center"
		v-if="$slots['action-right']"
		v-on:click="$emit('action-right', video)"
	>
		<slot name="action-right"></slot>
	</div>

	<div class="front-face flex-row flex-v-center flex-grow"
		:class="{ dragging : draggingStart !== 0 }"
		:style="{ left : computeLeftPos + 'px' }"
		v-on:touchstart="onTouchStart($event.changedTouches.item(0).clientX)"
		v-on:touchmove ="onTouchMove($event.changedTouches.item(0).clientX)"
		v-on:touchend  ="onTouchEnd()"
	>
		<img :src="video.thumbnailUrl" />
		<label class="flex-grow">{{ video.title }}</label>
		<div class="views flex-row flex-center">
			<svg class="icon-eye"><use xlink:href="#eye"></use></svg>
			<label>{{ humanizeNumber(video.viewCount) }}</label>
		</div>
	</div>
</div>
`;

@Component({ template })
export default class KadoriVideo extends Vue {

	// PROPS

	/**
	 * The video SearchResult to show.
	 */
	@Prop()
	video : SearchResult;

	// DATA
	draggingStart : number = 0;
	draggingOffset: number = 0;
	resetTimer    : number = 0;

	get computeLeftPos() {
		// don't start moving until swiping quite a bit (to prevent accidental swiping when say user is scrolling the screen)
		if (Math.abs(this.draggingOffset) < 100) {
			return 0;
		}

		return Math.max(-MAX_SWIPE_PIXELS, Math.min(MAX_SWIPE_PIXELS, this.draggingOffset));
	}

	onTouchStart(touchCoordX : number) {
		this.draggingStart  = touchCoordX;
		this.draggingOffset = 0;
	}

	onTouchMove(touchCoordX : number) {
		this.draggingOffset = touchCoordX - this.draggingStart;
		if ((!this.$slots['action-right'] && this.draggingOffset < 0) ||
			(!this.$slots['action-left']  && this.draggingOffset > 0)
		) {
			this.draggingOffset = 0;
		}
	}

	onTouchEnd(force = false) {
		// if swiping is at max, make swipe stick
		if (!force && Math.abs(this.computeLeftPos) === MAX_SWIPE_PIXELS) {
			if (this.resetTimer) {
				clearTimeout(this.resetTimer);
			}

			// reset dragging after a while
			this.resetTimer = window.setTimeout(() => { this.onTouchEnd(true) }, 3000);
			return;
		}

		this.draggingStart  = 0;
		this.draggingOffset = 0;
	}

	/**
	 * Returns a rounded string version of the input number with a suffix to make the number more easily readable.
	 */
	humanizeNumber(number : number) {
		if (number >= 1000000) {
			return (Math.round(number / 100000) / 10) + ' M';
		}
		if (number >= 1000) {
			return (Math.round(number / 100) / 10) + ' K';
		}
		return number + '';
	}
}
