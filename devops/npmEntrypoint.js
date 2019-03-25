/* eslint-disable no-console */
'use strict';

const { spawn } = require('child_process');
const fs        = require('fs');
const yargs     = require('yargs');

/**
 * HACK: register an empty SIGINT handler so that any sub-processes
 * cleanup logging prints out before this parent process exits when
 * the user hits `Ctr+C`
 */
process.on('SIGINT', () => {});

const argv = yargs
	.scriptName('npm start')
	.command('watch', 'build the app and watch for changes')
	.command('app',   'run the app')
	.command('shell', 'starts a shell in a new watch container')
	.help('h')
	.wrap(yargs.terminalWidth())
	.strict()
	.argv
;

(async function() {
	switch (argv._[0]) {
		case 'watch':
			watchLog();
			await run('docker-compose up watch');
			break;
		case 'app':
			await run('docker-compose up node');
			break;
		case 'shell':
			await run('docker-compose run --rm watch bash');
			break;
		default:
			yargs.showHelp();
	}
})();

/**
 * Helper function to spawn the given command as a child-process, using stdin/stdout for IO.
 * @param  {String}   command    The command to be run
 * @param  {String[]} [argArray] Any arguments to pass to the command
 * @param  {Object}   [execEnv]  Dictionary of environment variables to set for the command
 * @param  {Object}   [runOptions]
 * @param  {Boolean}  [runOptions.ignoreNonZeroExit=false]
 */
async function run(command, argArray = [], execEnv = {}, { ignoreNonZeroExit = false } = {}) {
	console.log('----------');	// delimit output between commands
	if (Object.keys(execEnv).length) {
		console.log(`ENV: ${keyValueStrings(execEnv).join(' ')}`);
	}
	console.log(`CMD: ${command} ${argArray.join(' ')}\n`);

	execEnv.PATH = process.env.PATH;

	await new Promise((resolve, reject) => {
		const childProcess = spawn(command, argArray, { shell : true, stdio : 'inherit', env : execEnv });

		childProcess.on('exit', exitCode => {
			if (exitCode !== 0 && !ignoreNonZeroExit) {
				console.error(`ERR: Nonzero exit code received from command (exit code: ${exitCode})`);
				process.exit(exitCode);
				reject(exitCode);
			}
			else {
				resolve();
			}
		});
	});
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
