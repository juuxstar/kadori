import * as express  from 'express';
import * as path     from 'path';
import * as http     from 'http';
import favicon       from 'serve-favicon';
import * as morgan   from 'morgan';
import * as _        from 'lodash';
// import cookieParser from 'cookie-parser';
// import bodyParser   from 'body-parser';
import * as clc      from 'cli-color';
import * as socketio from 'socket.io';

const app     = express();
const server  = http.createServer(app);
const io      = socketio(server);
const singers = new Map();	// the collection of singers, key=socket, value=Singer
let currentVideoID;

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

app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../client/screen/main.html')));
app.get('/controller', (req, res) => res.sendFile(path.join(__dirname, '../client/controller/controller.html')));

io.of('/screen')
	.on('connection', socket => {
		socket.join('screens');
		socket
			// returns the list of currently queued up singers
			.on('queue', reply => {
				reply(_.map(Array.from(singers.values()), 'name'));
			})
			.on('currentVideo', reply => {
				reply(currentVideoID);
			})
		;
	})
;

io.of('/singer')
	.on('connection', socket => {
		singers.set(socket, new Singer(socket));

		socket.join('singers');
		socket
			// sets the name of the singer
			.on('name', name => {
				singers.get(socket).name = name;
				updateSingersList();
			})
			.on('queueUpdate', () => {
				tryPlayingVideo();
			})
			.on('disconnect', () => {
				singers.delete(socket);
				updateSingersList();
			})
		;
	})
;

server.listen(80);
console.log('Listening on http://localhost');

class Singer {
	socket : any;
	name   : String;    // the name of the singer
	lastUp : Date;      // the date/time of the most recent time when the singer had their song selected

	constructor(socket) {
		this.socket = socket;
	}
}

function getSingerQueue() : Singer[] {
	return _.sortBy(Array.from(singers.values()), 'lastUp');
}

function updateSingersList() {
	io.of('/screen').emit('queue', _.map(getSingerQueue(), 'name'));
}

async function tryPlayingVideo() {
	if (currentVideoID) {
		return;
	}

	const singers = getSingerQueue();

	for (let singer of singers) {
		currentVideoID = await emitWithResponse(singer.socket, 'getNextVideo');
		if (currentVideoID) {
			break;
		}
	}

	io.of('/screen').in('screens').emit('playVideo', currentVideoID);
}

function emitWithResponse(socket, ...args) : Promise<any> {
	return new Promise(resolve => {
		socket.emit.call(socket, ...args, (response : any) => {
			resolve(response);
		});
	});
}