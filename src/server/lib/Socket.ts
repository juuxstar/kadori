import * as SocketIO               from 'socket.io';
import CommonSocket, { SioSocket } from '/common/lib/Socket';

/**
 * Server-side implementation of ISioSocket
 */
export default class ServerSocket extends CommonSocket
{
	private ioSocket : SocketIO.Socket;

	protected get sioSocket() : SioSocket {
		return (this.ioSocket as unknown) as SioSocket;
	}

	/**
	 * Initialize the Socket class.
	 * Call on each subclass of Socket.
	 */
	static initialize(httpServer) {
		getIO(httpServer)
		// create a namespace for each Socket subclass
		.of(CommonSocket.getNamespaceName(this))
		.on('connection', (ioSocket : SocketIO.Socket) => {
			const socket : ServerSocket = new this();	// use "this" in order to instantiate the correct subclass
			socket.ioSocket = ioSocket
				.on('message', (message, ...args) => {
					socket.onMessage(message, ...args);
				})
				.on('disconnect', () => {
					socket.onDisconnect();
				})
			;
			socket.onConnect();
		});
	}
}

/**
 * Cache of io instances (keyed by the corresponding httpServer instances)
 */
const ioCache : WeakMap<Object, SocketIO.Server> = new WeakMap();

function getIO(httpServer) : SocketIO.Server {
	let io = ioCache.get(httpServer);
	if (!io) {
		io = SocketIO(httpServer);
		ioCache.set(httpServer, io);
	}
	return io;
}