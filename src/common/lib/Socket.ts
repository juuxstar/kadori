export interface SioSocket {
	/**
	 * Must conform to the socketio send() method:
	 * https://socket.io/docs/server-api/#socket-send-%E2%80%A6args-ack
	 */
	send(...data);
}

/**
 * Collection of all socket instances keyed by socket class.
 */
const instancesAll : Map<Function, Socket[]> = new Map();

/**
 * Base class for all server/client sockets which includes common functionality.
 */
export default abstract class Socket {
	constructor() {
		let array = instancesAll.get(this.constructor);
		if (!array) {
			array = [];
			instancesAll.set(this.constructor, array);
		}
		array.push(this);
	}

	/**
	 * Returns an implementation of the SocketIOSocket interface
	 **/
	protected abstract get sioSocket() : SioSocket;

	/**
	 * Send message and data to this socket.
	 */
	emit(message : string, ...data) {
		this.sioSocket.send(message, ...data);
	}

	/**
	 * Send a message and data to this socket and wait for reply from the other end.
	 */
	emitWithReply(message : string, ...data) : Promise<any> {
		return new Promise(resolve => {
			this.sioSocket.send(message, ...data, reply => {
				resolve(reply);
			});
		});
	}

	/**
	 * Called when socket is re/connected.
	 * Subclasses must implement logic to call this method whenever a message comes in.
	 */
	protected onConnect() { }

	/**
	 * Called when the socket disconnects.
	 * Subclasses must implement logic to call this method whenever a message comes in.
	 */
	protected onDisconnect() {
		// remove socket from instances list
		let array = instancesAll.get(this.constructor);
		if (array) {
			array = array.filter(elem => elem !== this);
			instancesAll.set(this.constructor, array);
		}
	}

	/**
	 * Callback for when a message comes from the remote end of the socket.
	 * Subclasses must implement logic to call this method whenever a message comes in.
	 * If the method returns a value that is not undefined, reply to the message with that.
	 */
	protected onMessage(message, ...args) {
		// ignore certain messages since they have specific callbacks already
		if (message === 'message' || message === 'connected') {
			return;
		}

		// try to find a method that matches the event
		const methodName = 'on' + message[0].toUpperCase() + message.slice(1);

		if (typeof this[methodName] !== 'function') {
			console.warn('method not found: ' + methodName);
			return;
		}

		let reply     = data => {};
		const lastArg = args[args.length - 1];

		// check if reply is desired (last argument is a reply function)
		if (typeof lastArg === 'function') {
			reply = lastArg;
			args  = args.slice(0, args.length - 1);
		}

		const response = this[methodName].call(this, ...args);

		// log
		console.log('message', message, args);
		if (reply === lastArg) {
			console.log('replying with: ', response);
		}

		reply(response);
	}

	// STATICS

	/**
	 * Send data to all sockets of this type.
	 */
	static emit(message, ...data) {
		// COULDDO: get the namespace and call emit only once
		this.instances.forEach(socket => socket.emit(message, ...data));
	}

	/**
	 * Returns an array of instances of Socket of this specific class type.
	 */
	static get instances() : Socket[] {
		return instancesAll.get(this) || [];
	}

	/**
	 * Returns the socket.io namespace for all sockets of this type.
	 */
	protected static getNamespaceName(socketClass) : string {
		return '/' + socketClass.name;
	}
}
