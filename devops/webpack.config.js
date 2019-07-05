const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');

module.exports = {
	mode  : 'development',
	entry : {
		'screen/screen'         : '../src/client/screen/screen.ts',
		'controller/controller' : '../src/client/controller/controller.ts',
	},
	resolve : {
		extensions : [ '.ts', '.tsx', '.js' ],
		plugins    : [ new TsconfigPathsPlugin({ configFile : '../src/client/tsconfig.json' }) ],
		modules    : [ '/srv/build/client/node_modules/', 'node_modules' ],
		alias      : {
			'/lib'        : '/srv/src/client/lib',
			'/common/lib' : '/srv/src/common/lib',
			'/config'     : '/srv/src/client/config',
			'vue'         : '/srv/build/client/node_modules/vue/dist/vue.js',
		},
	},
	module : {
		rules : [
			// all files with a `.ts` or `.tsx` extension will be handled by `ts-loader`
			{
				test   : /\.tsx?$/,
				loader : '/srv/devops/node_modules/ts-loader',
			},
		],
	},
	output : {
		filename : '[name].js',
		path     : `${__dirname}/../build/client`,
	},
};
