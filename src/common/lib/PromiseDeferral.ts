/**
 * Allows a promise to be deferred and resolved at a later time.
 */
export default class PromiseDeferral {
	promise : Promise<any>;
	resolve : Function;
	reject  : Function;

	constructor() {
		this.promise = new Promise((resolve, reject) => {
			this.resolve = resolve;
			this.reject  = reject;
		});
	}
}