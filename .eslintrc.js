module.exports = {
	"extends" : "./node_modules/@roadmunk/eslint-config-roadmunk/index.js",

	parserOptions : {
		"ecmaVersion"  : 2017,
		"sourceType"   : "module",	// expect files to be written as CommonJS modules
		"ecmaFeatures" : {
			"globalReturn" : true	// NOTE: apparently doesn't work yet:  https://github.com/feross/standard/issues/167
		}
	},

	env : {
		"amd" : true
	},

	globals : {
		"setImmediate" : true,
		"not"          : true,
		"module"       : true,
		"humanizeJoin" : true
	}
};
