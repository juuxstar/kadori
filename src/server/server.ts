
const Module = require('module');
const oldRequire = Module.prototype.require;
Module.prototype.require = function(id) {
	if (id.startsWith('/')) {
		id = __dirname + id;
	}
	return oldRequire.call(this, id);
}

import express  = require('express');
import path     = require('path');
import http     = require('http');
import clc      = require('cli-color');
import morgan   = require('morgan');
import _        = require('lodash');
// import favicon      from 'serve-favicon';
// import cookieParser from 'cookie-parser';
// import bodyParser   from 'body-parser';
import Socket     from '/lib/Socket';

const app     = express();
const server  = http.createServer(app);

//app.use(favicon('../client/images/favicon.ico'));

const logFormat = ':date[iso] :remote-addr :response-time :colored-status :method :url';
morgan.token('colored-status', function(req, res) {
	if (res.statusCode < 300) {
		return clc.green(res.statusCode);
	}
	if (res.statusCode < 400) {
		return clc.cyan(res.statusCode);
	}
	if (res.statusCode < 500) {
		return clc.red(res.statusCode);
	}
	return clc.redBright(res.statusCode);
});

// log all errors
app.use(morgan(logFormat, { skip : (req, res) => res.statusCode < 400 }));

/* app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended : false }));
app.use(cookieParser());
*/
app.use(express.static('../client', { extensions : ['js'] }));
app.use('/common', express.static('../common', { extensions : ['js'] }));

// logs everything else (skips logging errors since that was already logged by previous logger)
app.use(morgan(logFormat, { skip : (req, res) => res.statusCode >= 400 }));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../client/screen/screen.html')));
app.get('/controller', (req, res) => res.sendFile(path.join(__dirname, '../client/controller/controller.html')));



/**
 * Represents a socket for clients for the main screen.
 * Ideally should only be one connected at any given time.
 */
class ScreenSocket extends Socket {
	onGetQueue() {
		return _.map(ScreenSocket.getSingerQueue(), singer => ({
			name  : singer.name,
			queue : singer.queueLength
		}));
	}

	onGetCurrentVideoID() {
		return ScreenSocket.currentVideoID;
	}

	onSetCurrentVideoID(videoID) {
		ScreenSocket.currentVideoID = videoID;
		if (!videoID) {
			ScreenSocket.tryPlayingVideo();
		}
	}

	// STATICS

	/**
	 * The videoID of the currently playing video.
	 */
	static currentVideoID : string = '';

	static getSingerQueue() : SingerSocket[] {
		return _.sortBy(SingerSocket.instances as SingerSocket[], 'lastUp');
	}

	static updateSingersList() {
		ScreenSocket.emit('queue', _.map(ScreenSocket.getSingerQueue(), singer => ({
			name  : singer.name,
			queue : singer.queueLength
		}) ));
	}

	static async tryPlayingVideo() {
		if (ScreenSocket.currentVideoID) {
			return;	// video already playing
		}

		const singers = ScreenSocket.getSingerQueue();
		let singer : SingerSocket;

		for (singer of singers) {
			ScreenSocket.currentVideoID = await singer.getNextVideo();
			if (ScreenSocket.currentVideoID) {
				break;
			}
		}

		if (!ScreenSocket.currentVideoID) {
			return;
		}

		ScreenSocket.emit('playVideo', ScreenSocket.currentVideoID);
		SingerSocket.emit('playingVideo', ScreenSocket.currentVideoID);

		singer.lastUp = new Date();
		ScreenSocket.updateSingersList();
	}
}
ScreenSocket.initialize(server);

/**
 * Represents a socket for clients of the mobile controllers.
 */
class SingerSocket extends Socket {
	/**
	 * The name of the singer.
	 */
	name        : string;    // the name of the singer
	lastUp      : Date;      // the date/time of the most recent time when the singer had their song selected
	queueLength : Number;    // the length of the singer's song queue

	constructor() {
		super();
		this.lastUp = new Date();
	}

	getNextVideo() : Promise<string> {
		return this.emitWithReply('getNextVideo') as Promise<string>;
	}

	playingVideo(videoID) {
		this.emit('playingVideo', videoID);
	}

	onSetName(name) {
		this.name = name;
		ScreenSocket.updateSingersList();
	}

	onSetQueueLength(queueLength : Number) {
		this.queueLength = queueLength;
		ScreenSocket.updateSingersList();
		// if no video currently playing, maybe the new queue might have something
		ScreenSocket.tryPlayingVideo();
	}

	onDisconnect() {
		super.onDisconnect();
		ScreenSocket.updateSingersList();
	}
}
SingerSocket.initialize(server);


server.listen(80);
console.log('Listening on http://localhost');
