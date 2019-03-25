import io from 'socket.io-client';
import CommonSocket, { SioSocket } from '/common/lib/Socket';

/**
 * Client-side implementation of ISioSocket
 */
export default class Socket extends CommonSocket {
	private ioSocket : any; // io.Socket;

	protected get sioSocket() : SioSocket {
		return (this.ioSocket as unknown) as SioSocket;
	}

	constructor() {
		super();

		this.ioSocket = io.connect(CommonSocket.getNamespaceName(this.constructor))
			.on('connect', () => {
				this.onConnect();
			})
			.on('disconnect', () => {
				this.onDisconnect();
			})
			.on('message', (message, ...args) => {
				this.onMessage(message, ...args);
			})
		;
	}
}