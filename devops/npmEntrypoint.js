/* global process console */
/* eslint-disable no-console */
/**
 * Helper script which starts up various services using `docker-compose` depending on which options
 * have been passed.
 *
 * NOTE: This script is meant as a convenience for development and SHOULD NOT be used
 *       for starting the app in any other environments.
 */
'use strict';

/**
 * NOTE: This script intentionally does not have dependencies outside of the core
 * Node libraries to avoid users needing to install any node modules locally.
 */
const { spawn } = require('child_process');
const path      = require('path');
const fs        = require('fs');

const MAX_API_WORKERS  = 4;
const MAX_TASK_WORKERS = 4;

const ENVIRONMENTS = Object.freeze({
	DEVELOPMENT : 'development',
	AUTOTESTING : 'autotesting',
});

/**
 * All app services (i.e. all services in the compose file, excluding mongo and watch)
 * NOTE: If this list is not complete, the `clean` command will likely fail when trying to remove build volumes
 */
const APP_SERVICES = [
	'api',
	'debug_proxy',
	'proxy',
	'selenium',
	'socket',
	'sync',
	'task',
	'task_worker',
	'test',
];

/**
 * All old docker-compose services whose containers
 * should be cleaned up (i.e. removed) as part of the
 * clean operation.
 */
const OLD_SERVICES = [
	'app',
	'api1',
	'api2',
	'api3',
	'api4',
	'recurring_task',
	'recurring_task_inspect',
	'task_inspect',
	'task_worker_inspect',
	'socket_inspect',
	'api_inspect',
];

/**
 * All build volumes that should be removed as part of the clean
 */
const BUILD_VOLUMES = [
	'build-app',
	'build-proxy',
];

/**
 * HACK: register an empty SIGINT handler so that any subprocesses
 * cleanup logging prints out before this parent process exits when
 * the user hits `Ctr+C`
 */
process.on('SIGINT', () => {});


/**
 * Command line options
 */
const options = {
	/**
	 * MODES
	 * These are the various modes this script can start the app in.
	 * If no mode specified, the app will start normally.
	 */

	/**
	 * starts the `watch` container
	 */
	'watch' : {
		type    : Boolean,
		default : false,
	},

	/**
	 * Removes all app service containers, as well as the `watch` container, then removes
	 * all build volumes.
	 * (Leaves the `mongo` container alone)
	 */
	'clean' : {
		type    : Boolean,
		default : false,
	},
	/**
	 * Stops any services that could have been started by this script
	 */
	'stop' : {
		type    : Boolean,
		default : false,
	},
	/**
	 * Starts an interative REPL mode.
	 * Can also be used as `repl=path/to/script` to run a specific REPL script
	 */
	'repl' : {
		type    : String,
		default : null,
	},
	/**
	 * Starts the automated server and system tests.
	 * Can also be used as `test=regexp` to filter tests based on a regular expression pattern
	 * Also aliased as 'tests'.
	 */
	'test' : {
		type    : String,
		default : null,
	},

	/**
	 * OPTIONS
	 * These are various options (which may or may-not apply in the modes specified above)
	 */

	/**
	 * Handles all special cases for jenkins to work properly
	 */
	'jenkins' : {
		type    : Boolean,
		default : false,
	},

	/**
	 * Run containers in the background using -d
	 */
	'daemon' : {
		type    : Boolean,
		default : false,
	},

	/**
	 * Flag indicating whether client certificate authentication is required to access the application.
	 */
	'client-certs' : {
		type    : Boolean,
		default : true,
	},
	/**
	 * The database name to use. If specified, will override any auto-generated DB names (ex. in autotesting env)
	 */
	'db' : {
		type    : String,
		default : 'roadmunk',
	},
	/**
	 * Flag indicating whether *this* script should do a dry-run.
	 * (i.e. only generate the command, but do not run it)
	 */
	'dry-run' : {
		type    : Boolean,
		default : false,
	},
	/**
	 * The `NODE_ENV` to use for all services.
	 */
	'env' : {
		type    : String,
		default : ENVIRONMENTS.DEVELOPMENT,
	},
	/**
	 * Flag whether the debug_proxy container should be started up to allow inspecting of containers
	 */
	'inspect' : {
		type    : Boolean,
		default : false,
	},
	/**
	 * Use this to start up the debug_proxy by itself, to allow for inspecting already running containers
	 */
	'inspect-only' : {
		type    : Boolean,
		default : false,
	},
	/**
	 * The number of TaskWorker services to launch.
	 */
	'task-workers' : {
		type    : Number,
		default : 2,
	},
	/**
	 * The number of APIWorker services to launch.
	 */
	'api-workers' : {
		type    : Number,
		default : 4,
	},

	'autotesting' : {
		type    : Boolean,
		default : false,
	},
};


/**
 * Helper function to spawn the given command as a child-process, using stdin/stdout for IO.
 * @param  {String}   command    The command to be run
 * @param  {String[]} [argArray] Any arguments to pass to the command
 * @param  {Object}   [execEnv]  Dictionary of environment variables to set for the command
 * @param  {Object}   [runOptions]
 * @param  {Boolean}  [runOptions.ignoreNonZeroExit=false]
 */
async function run(command, argArray = [], execEnv, runOptions = {}) {
	runOptions.ignoreNonZeroExit = !!runOptions.ignoreNonZeroExit;
	console.log('----------');	// delimit output between commands
	if (execEnv) {
		console.log(`ENV: ${keyValueStrings(execEnv).join(' ')}`);
	}
	console.log(`CMD: ${command} ${argArray.join(' ')}\n`);

	// exit before running anything if we were given the `dryRun` option
	if (options['dry-run'].value) {
		return;
	}

	execEnv.PATH = process.env.PATH;

	await new Promise((res, rej) => {
		const childProcess = spawn(command, argArray, { shell : true, stdio : 'inherit', env : execEnv });

		childProcess.on('exit', exitCode => {
			if (!runOptions.ignoreNonZeroExit && exitCode !== 0) {
				console.error(`ERR: Nonzero exit code received from command (exit code: ${exitCode})`);
				process.exit(exitCode);
				rej(exitCode);
				return;
			}
			res();
		});
	});
}


const modeFunctions = {
	'watch' : (options, execEnv) => {
		watchLog();
		return { execEnv, argArray : [ 'up', 'watch' ] };
	},

	'clean' : (options, execEnv) => ({
		execEnv,
		argArray : [ 'rm', '--stop', '--force', 'watch', ...APP_SERVICES ],
	}),

	'stop' : (options, execEnv) => ({
		execEnv,
		argArray : [ 'stop', ...APP_SERVICES ],
	}),

	'repl' : (options, execEnv) => {
		let argArray = 'run --rm --service-ports repl node'.split(' ');

		if (options.inspect.value) {
			argArray.push('--inspect=0.0.0.0:9233');
		}

		argArray = [ ...argArray, 'servers/REPLServer', '--repl' ];

		if (options.repl.value) {
			argArray.push(options.repl.value);
		}

		return { execEnv, argArray };
	},

	'test' : (options, execEnv) => {
		ensureTestingEnv(options, execEnv);

		const argArray = 'run --rm --service-ports'.split(' ');

		if (options.jenkins.value) {
			argArray.push('-e JENKINS=true');
		}

		argArray.push('test node --trace-warnings');

		if (options.inspect.value) {
			argArray.push('--inspect=0.0.0.0:9234');
		}
		argArray.push('servers/TestingServer');
		argArray.push('-t');

		if (options.test.value) {
			argArray.push(`"${options.test.value}"`);	// Note: must wrap in quotes so that whitespace doesn't break
		}

		return { execEnv, argArray };
	},

	'inspect-only' : (options, execEnv) => ({
		execEnv,
		argArray : [ 'up', 'debug_proxy' ],
	}),

	'normal' : (options, execEnv) => {
		if (options.inspect.value) {
			defaultToOneWorkerUnlessSet(options);
		}

		if (options.autotesting.value) {
			ensureTestingEnv(options, execEnv);
			execEnv.VERIFY_CLIENT_CERT = 'none';
		}

		let argOptions = [];
		let services   = [];
		[
			coreServices,
			apiWorkerServices,
			taskWorkerServices,
		].forEach(fn => {
			const result = fn(options);
			argOptions   = argOptions.concat(result.argOptions);
			services     = services.concat(result.services);
		});

		if (options.inspect.value) {
			services.push('debug_proxy');
		}

		const dockerCommand = [ 'up' ];
		if (options.daemon.value) {
			dockerCommand.push('-d');
		}

		return { execEnv, argArray : dockerCommand.concat(argOptions, services) };
	},
};

/**
 * Parses the given options, generating execution environment variables, and the agument array to use.
 * @param  {Object} options
 * @return {Object}
 */
function parseOptions(options) {
	const execEnv = {
		NODE_ENV           : options.env.value,
		DB_NAME            : options.db.value,
		VERIFY_CLIENT_CERT : options['client-certs'].value ? 'required' : 'none',
	};

	let argArray = [];

	// Use the docker-compose.dev.yml file unless the 'jenkins' option is specified
	if (!options.jenkins.value) {
		argArray = [ '-f', 'docker-compose.yml', '-f', 'docker-compose.dev.yml' ];

		// Keep the ability to use a docker-compose.override.yml file
		if (fs.existsSync('docker-compose.override.yml')) {
			argArray = [ ...argArray, '-f', 'docker-compose.override.yml' ];
		}
	}

	const modes = [
		'watch',
		'clean',
		'stop',
		'repl',
		'test',
		'inspect-only',
	].filter(option => options[option].type === Boolean ? options[option].value : options[option].valueSet);

	if (modes.length > 1) {
		console.error(`More than one mode specified: ${modes.join()}`);
		process.exit(-1);
	}

	const mode     = modes[0] || 'normal';
	const modeArgs = modeFunctions[mode](options, execEnv);

	return {
		execEnv  : modeArgs.execEnv,
		argArray : [ ...argArray, ...modeArgs.argArray ],
	};
}

function defaultToOneWorkerUnlessSet(options) {
	[
		'api-workers',
		'task-workers',
	].forEach(service => {
		if (!options[service].valueSet) {
			options[service].value = 1;
		}
	});
}

/**
 * Determines the docker-compose project name for the current working directory
 * @return {String}
 */
function getComposeProjectName() {
	// HACK: assume the project name is just the current directory name (docker-compose's default)
	// SHOULDDO: actually determine if a different project name is being used
	return path.basename(process.cwd());
}

/**
 * Helper function which mutates the given execution environment variables to make them reflect
 * the automated testing environment.
 * @param  {Object} options
 * @param  {Object} execEnv
 */
function ensureTestingEnv(options, execEnv) {
	execEnv.NODE_ENV = ENVIRONMENTS.AUTOTESTING;
	if (options.env.valueSet && options.env.value !== ENVIRONMENTS.AUTOTESTING) {
		console.warn(`WARN: test mode requires '${ENVIRONMENTS.AUTOTESTING}' env, ignoring given '${options.env.value}' value.`);
	}
}

/**
 * A 'list' of services and additional options to pass to `docker-compose up`
 * @typedef {Object} UpServiceList
 * @param {String[]} argOptions	Any `up` arguments that must be passed before the list of services
 * @param {String[]} services   A list of services
 */

/**
 * Helper function to generate a list of the core (non-APIWorker) services
 * @return {UpServiceList}
 */
function coreServices() {
	return {
		argOptions : [],
		services   : [ 'proxy', 'task', 'socket', 'sync' ],
	};
}

/**
 * Helper function to generate a list of the TaskWorker services to start, based on any applicable options
 * @param  {Object} options
 * @return {UpServiceList}
 */
function taskWorkerServices(options) {
	return createScaledService(
		options['task-workers'].value,
		'task_worker',
		MAX_TASK_WORKERS
	);
}

/**
 * Helper function to generate a list of the APIWorker services to start, based on any applicable options
 * @param  {Object} options
 * @return {UpServiceList}
 */
function apiWorkerServices(options) {
	return createScaledService(
		options['api-workers'].value,
		'api',
		MAX_API_WORKERS
	);
}

/**
 * Helper function which generates a service and scales it appropriately.
 * @param  {Number}  numToMake - The scale factor of the service to be generated
 * @param  {String}  name      - The name of the service
 * @param  {Number}  max       - The maximum number of services of this type that can be launched
 * @return {UpServiceList}
 */
function createScaledService(numToMake, name, max) {
	if (numToMake > max) {
		console.warn(`WARN: The ${numToMake} '${name}' services requested exceeds the maximum allowed (${max}). Only ${max} will be started.`);
		numToMake = max;
	}

	if (numToMake === 0) {
		return {
			services   : [],
			argOptions : [],
		};
	}

	return {
		argOptions : [ `--scale ${name}=${numToMake}` ],
		services   : [ name ],
	};
}


/**
 * Helper function which converts a dictionary of key-value pairs
 * into an array of strings of the form 'key=value'.
 * @param  {Object} obj The dictionary to be converted
 * @return {String[]}
 */
function keyValueStrings(obj) {
	return Object.keys(obj).map(key => `${key}=${obj[key]}`);
}

/**
 * Helper function to coerce a string value to the specified type
 * @param  {*} type       The type constructor (ex. Number, Boolean, etc)
 * @param  {String} value The value to coerce
 * @return {*}            The parsed value
 */
function coerceType(type, value) {
	// Any special cases should be done first.
	if (type === Boolean) {
		return ![ 'false', '0', '', 'null', 'undefined' ].includes(value.toLowerCase());
	}

	// Otherwise just use the primitive wrapper constructor to coerce the value
	return type(value).valueOf();
}

/**
 * Watches a log file to which the watch command writes notifications to display to the user.
 */
function watchLog() {
	const filename = './devops/watch-notifications.log';
	let timeout, notifier;

	fs.openSync(filename, 'w');	// ensure the file exists

	fs.watch(filename, { persistent : false }, () => {
		if (!notifier) {
			try {
				notifier = require('node-notifier');
			}
			catch (e) {
				// node-notifier not installed yet
				return;
			}
		}

		if (timeout) {
			clearTimeout(timeout);
		}

		// debounce it since it seems to fire multiple times per run
		timeout = setTimeout(function() {
			notifier.notify({
				title   : 'Watch',
				message : `${fs.readFileSync(filename, 'utf8')}\n\n${new Date().toLocaleString()}`,	// time needed in order for the message to always have content
			});
		}, 500);
	});
}

(async () => {
	// populate the values with the defaults
	Object.keys(options).forEach(key => {
		options[key].value = options[key].default;
	});

	// process any values given to us on the command line
	process.argv.forEach(rawVal => {
		const eqIndex = rawVal.indexOf('=');
		if (eqIndex !== -1) {
			const key   = rawVal.substr(0, eqIndex);
			const value = rawVal.substr(eqIndex + 1);

			if (options[key]) {
				const opt    = options[key];
				opt.value    = coerceType(opt.type, value);
				opt.valueSet = true; // flag to indicate a value was specifically set
			}
		}
		else if (options[rawVal]) {
			options[rawVal].valueSet = true;

			if (options[rawVal].type === Boolean) {
				options[rawVal].value = true;
			}
		}
	});

	const { execEnv, argArray } = parseOptions(options);
	await run('docker-compose', argArray, execEnv);

	// If we're in 'clean' mode, also need to run a command to remove the build volumes
	// (needs to be done after the generated `docker-compose` command)
	// SHOULDDO: refactor this script so that each mode can generate multiple successive commands from `parseOptions()`
	if (options.clean.value) {
		const projectName = getComposeProjectName();

		// Remove any containers from old compose-file versions
		// COULDDO: detect if any of these containers actually exist
		const oldContainers = OLD_SERVICES.map(serv => `${projectName}_${serv}_1`);
		await run('docker', 'rm --force'.split(' ').concat(oldContainers), {}, { ignoreNonZeroExit : true });

		// Remove the build volumes
		const volumes = BUILD_VOLUMES.map(vol => `${projectName}_${vol}`);
		await run('docker', 'volume rm --force'.split(' ').concat(volumes), {});
	}
})();
