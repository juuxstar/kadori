'use strict';

const Promise      = require('bluebird');
const path         = require('path');
const fs           = Promise.promisifyAll(require('fs'));
const childProcess = Promise.promisifyAll(require('child_process'));
const clc          = require('cli-color');
const _            = require('lodash');
const changed      = require('gulp-changed');
const sourcemaps   = require('gulp-sourcemaps');
const typeScript   = require('gulp-typescript');
const webpack      = require('webpack');
const guzzle       = require('@juuxstar/gulp-guzzle');

// gulp plugins to guzzle
guzzle({
	npmInstall : require('gulp-install'),
	changed    : require('gulp-changed'),
	filter     : require('gulp-filter'),
	less       : require('gulp-less'),
	tap        : require('gulp-tap'),
},
{	// options
	taskGraph : 'tasksDependencyGraph.svg',	// instructs guzzle to output a graph of the tasks
	onFinish  : function() {
		console.log(clc.green.bold('DONE!'));
		fs.writeFileAsync('/srv/devops/watch-notifications.log', 'Watch is done!');	// fire and forget
	},
});

const START_TIME      = new Date();
const SRC_PATH        = path.resolve('../src');
const SRC_CLIENT_PATH = path.join(SRC_PATH, 'client');
const DST_PATH        = path.resolve('../build');
const DST_CLIENT_PATH = path.join(DST_PATH, 'client');

// Guzzle Tasks
guzzle.task('default', [ 'build' ]);
guzzle.task('build',   [ 'server', 'client' ]);

/**
 * Clean destination directory
 * only clean the first time (since subsequent times are called by watch which do partial builds)
 * Note: leave node_modules since the install task will take care of removing unwanted modules.
 */
guzzle.task('clean', _.once(async () => {
	const excludeDirs = [ 'server/node_modules', 'client/node_modules' ].map(dir => path.join(DST_PATH, dir));

	// to clear all but the specified dir, we remove its write perms, delete everything, and restore write perms
	// the `|| true` prevents early exits from errors (fullDir might not exist and that's okay)
	await Promise.all(excludeDirs.map(dir => childProcess.execAsync(`chmod 100 ${dir} || true`)));
	await childProcess.execAsync(`rm -fr ${DST_PATH} || true`);
	await Promise.all(excludeDirs.map(dir => childProcess.execAsync(`chmod 755 ${dir} || true`)));
}));

[ 'server', 'client' ].forEach(component => {
	const source = path.join(SRC_PATH, component);
	const dest   = path.join(DST_PATH, component);

	guzzle.task(component, [
		// copy all files in all src directories to destination directory
		guzzle.task('copy', [ 'clean' ], function() {
			this.read([ '**', '!**/*.ts', '!**/*.less', '!package*.json' ], { cwd : source })
				.changed(dest)
				.write(dest);
		}),

		// install npm modules
		guzzle.task('installNodeModules', [ 'clean' ], function() {
			this.read([ 'package.json', 'package-lock.json' ], { cwd : source })
				.changed(dest, { hasChanged : changed.compareContents })
				.write(dest)
				.filter(file => file.path.endsWith('package.json'))
				.npmInstall()
				.on('end', () => {
					// when npmInstall finishes, copy potentially modified lock-file back to source
					this.read([ 'package-lock.json' ], { cwd : dest })
						.changed(source, { hasChanged : changed.compareContents })
						.write(source);
				});
		}),

		// add other server/client tasks
		...({
			server : [ 'server.typeScript' ],
			client : [ 'client.webpack', 'client.less' /* ,'adjustNonES6Modules'*/ ],
		})[component],
	]);
});


// compile all server typeScript files
// HACK: need 2 projects as cannot use the same project instance twice
const tsProjectServer       = typeScript.createProject('../src/server/tsconfig.json');
const tsProjectServerCommon = typeScript.createProject('../src/server/tsconfig.json');

guzzle.task('server.typeScript', [ 'clean', 'server.installNodeModules' ], function() {
	this.read([ `${SRC_PATH}/server/**/*.ts` ])
		.changed(`${DST_PATH}/server`, { extension : '.ts ' })
		.pipe(tsProjectServer())
		.on('error', () => { /* Ignore compiler errors */ })
		.write(`${DST_PATH}/server`)

		.read([ `${SRC_PATH}/common/**/*.ts` ])
		.changed(`${DST_PATH}/server/common`, { extension : '.ts ' })
		.pipe(tsProjectServerCommon())
		.on('error', () => { /* Ignore compiler errors */ })
		.write(`${DST_PATH}/server/common`)
	;
});

// compile all client typeScript files
const webpackClient = webpack(require('./webpack.config.js'));

guzzle.task('client.webpack', [ 'clean', 'client.installNodeModules' ], function(done) {
	webpackClient.run(err => {
		done(err);
	});
});

// compiles LESS to CSS files
guzzle.task('client.less', [ 'clean' ], function(done) {
	this.read([ 'screen/screen.less', 'controller/controller.less' ], { cwd : SRC_CLIENT_PATH, base : SRC_CLIENT_PATH })
		.pipe(sourcemaps.init())
		.less({ paths : [ path.join(SRC_CLIENT_PATH, 'lib/less') ] })
		.on('error', done)		// handles errors from LESS
		.pipe(sourcemaps.write())
		.write(DST_CLIENT_PATH);
});


// watch for any changes to client files
// exclude vendor and node_modules cause there's a lot of files to watch and they don't tend to change very often
// thus if you change vendor libs or node_modules, run a full build
guzzle.task('watch', [ 'build' ], function() {
	guzzle.watch([ 'client/**/*', '!**/vendor/**', '!*.less' ],   { cwd : SRC_PATH }, [ 'client.copy' ]);
	guzzle.watch([ 'server/**/*', '!server/package-lock.json' ],  { cwd : SRC_PATH }, [ 'server.copy' ]);
	guzzle.watch([ 'client/**/*.ts', 'common/**/*.ts' ],          { cwd : SRC_PATH }, [ 'client.webpack' ]);
	guzzle.watch([ 'server/**/*.ts', 'common/**/*.ts' ],          { cwd : SRC_PATH }, [ 'server.typeScript' ]);
	guzzle.watch([ 'client/**/*.less' ],                          { cwd : SRC_PATH }, [ 'client.less' ]);
	guzzle.watch([ 'client/package.json' ],                       { cwd : SRC_PATH }, [ 'client.installNodeModules' ]);

	return readyMessage('watch');
});

// HELPERS

function readyMessage(prefix) {
	console.log(clc.green.bold.underline(`${prefix} is ready (${Math.round(new Date() - START_TIME) / 1000} sec)`));
	return Promise.resolve();	// so it can be passed to the return of the task function
}

/* function adjustModule(contents, tsConfigPaths, {
	stripPathPrefix = '',		// if truthy, remove this prefix from the start of import/require paths
	exactMatch      = '',
	dependencies    = [],		// list of other modules that this module depends upon
	isNodeModule    = false,	// true if the contents are a node module
}) {
	contents = contents.toString();

	// check if module is new-style ES or old-style AMD
	if (!isNodeModule && !contents.match(/^\s*(import\s)|(export\s)/)) {
		// assume using AMD pattern (module, exports, require)
		let imports, requireFunction;
		if (dependencies.length > 0) {
			// add import statements
			imports         = dependencies.map(dependency => `import ${dependency} from "${dependency}";`).join('\n');
			requireFunction = `function require(dependency) {
				return {
					${dependencies.map(dependency => `"${dependency}": ${dependency}`).join(',\n')}
				}[dependency];
			}`;
		}

		// add module.exports wrapper
		contents = `${imports}\nlet exports={},module={exports};${requireFunction};${contents};\nexport default module.exports;`;
	}

	const dependsPathRegex = isNodeModule
		? /(^.*[\s=]\s*require\s*\(['"])(.*)(['"].*$)/gm   // require statements
		: /(^\s*import\s.*['"])(.+)(['"].*$)/gm            // import statements
	;

	// adjust import paths with paths from tsConfig (if any)
	contents = contents.replace(dependsPathRegex, (match, preContent, importPath, postContent) => {
		_.forEach(tsConfigPaths, (pathReplacements, pathPattern) => {
			const patternPrefix = pathPattern.split('*', 1)[0];
			if (!patternPrefix) {
				return;
			}

			if (exactMatch ? importPath === patternPrefix : importPath.startsWith(patternPrefix)) {
				importPath = pathReplacements[0].split('*', 1)[0] + importPath.substr(patternPrefix.length);

				// remove prefix (if specified)
				if (stripPathPrefix && importPath.startsWith(stripPathPrefix)) {
					importPath = importPath.substr(stripPathPrefix.length);
				}

				return false;	// break out from _.forEach
			}
		});

		return preContent + importPath + postContent;
	});

	return contents;
}
*/
