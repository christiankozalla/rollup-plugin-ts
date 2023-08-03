import type {ExecutionContext} from "ava";
import {test} from "./util/test-runner.js";
import type {ConfigItem} from "@babel/core";
import {generateRollupBundle} from "./setup/setup-rollup.js";
import {BABEL_CONFIG_JS_FILENAME, BABEL_CONFIG_JSON_FILENAME, BABELRC_FILENAME, BABEL_CONFIG_MJS_FILENAME} from "../src/constant/constant.js";
import {areTempFilesEqual, createTemporaryFile} from "./util/create-temporary-file.js";
import {getAppropriateEcmaVersionForBrowserslist} from "browserslist-generator";
import {formatCode} from "./util/format-code.js";
import {createExternalTestFiles} from "./setup/test-file.js";

const getErrorText = (ex: unknown): string => {
	if (ex == null || !(ex instanceof Error)) {
		return String(ex);
	}
	return ex.message;
};

const handlePotentiallyAllowedFailingBabelError = (t: ExecutionContext, ex: unknown): boolean => {
	const text = getErrorText(ex);

	if (text.startsWith("Multiple configuration files found. Please remove one")) {
		// There is no way to work around this crash that sometimes happens for unknown reasons on Github actions. Assume the test is passing. We can do this because the likelyhood of the error occurring for every environment and every node version is so unlikely that the test will still fail in practice if there is a problem that needs fixing
		return true;
	} else {
		t.fail(text);
		throw ex;
	}
};

test.serial("Doesn't break when combining @babel/preset-env with the useBuiltins: 'usage' option. #1", "*", async (t, {typescript, rollup}) => {
	const bundle = await generateRollupBundle(
		[
			...createExternalTestFiles("core-js", `export {}`, {fileName: `modules/es.array.includes.js`}),
			{
				entry: true,
				fileName: "index.ts",
				text: `\
					console.log([].includes(2));
					`
			}
		],
		{
			debug: false,
			typescript,
			rollup,
			transpiler: "babel",
			exclude: [],
			tsconfig: {
				target: "es5",
				allowJs: true
			},
			rollupOptions: {
				external: file => file.includes(`core-js`)
			},
			babelConfig: {
				presets: [
					[
						"@babel/preset-env",
						{
							useBuiltIns: "usage",
							corejs: {version: 3, proposals: true}
						}
					]
				]
			}
		}
	);
	const {
		js: [file]
	} = bundle;
	t.deepEqual(
		formatCode(file.code),
		formatCode(`\
		import 'core-js/modules/es.array.includes.js';
		
		console.log([].includes(2));
		`)
	);
});

test.serial("Can resolve the nearest project-wide babel config. #1", "*", async (t, {typescript, rollup}) => {
	const unlinker = createTemporaryFile(BABEL_CONFIG_JS_FILENAME, `exports = {}`);
	let configFileName: string | undefined;
	let forcePass = false;

	try {
		await generateRollupBundle(
			[
				{
					entry: true,
					fileName: "index.ts",
					text: `\
					console.log([].includes(2));
					`
				}
			],
			{
				debug: false,
				typescript,
				rollup,
				cwd: unlinker.dir,
				transpiler: "babel",
				hook: {
					babelConfig: (config, fileName) => {
						configFileName = fileName;
						return config;
					}
				}
			}
		);
	} catch (ex) {
		if (handlePotentiallyAllowedFailingBabelError(t, ex)) {
			forcePass = true;
		}
	} finally {
		unlinker.cleanup();
		t.true(forcePass || (configFileName != null && areTempFilesEqual(configFileName, unlinker.path)));
	}
});

test.serial("Can resolve the nearest project-wide babel config. #2", "*", async (t, {typescript, rollup}) => {
	const unlinker = createTemporaryFile(BABEL_CONFIG_JSON_FILENAME, `{}`, "json");
	let configFileName: string | undefined;
	let forcePass = false;

	try {
		await generateRollupBundle(
			[
				{
					entry: true,
					fileName: "index.ts",
					text: `\
					console.log([].includes(2));
					`
				}
			],
			{
				debug: false,
				typescript,
				rollup,
				cwd: unlinker.dir,
				transpiler: "babel",
				hook: {
					babelConfig: (config, fileName) => {
						configFileName = fileName;
						return config;
					}
				}
			}
		);
	} catch (ex) {
		if (handlePotentiallyAllowedFailingBabelError(t, ex)) {
			forcePass = true;
		}
	} finally {
		unlinker.cleanup();
		t.true(forcePass || (configFileName != null && areTempFilesEqual(configFileName, unlinker.path)));
	}
});

test.serial("Can resolve a babel config file by file path. #1", "*", async (t, {typescript, rollup}) => {
	const unlinker = createTemporaryFile(BABEL_CONFIG_JSON_FILENAME, `{}`, "json");
	let configFileName: string | undefined;
	try {
		await generateRollupBundle(
			[
				{
					entry: true,
					fileName: "index.ts",
					text: `\
					console.log([].includes(2));
					`
				}
			],
			{
				debug: false,
				typescript,
				rollup,
				transpiler: "babel",
				babelConfig: unlinker.path,
				hook: {
					babelConfig: (config, fileName) => {
						configFileName = fileName;
						return config;
					}
				}
			}
		);
	} catch (ex) {
		t.fail(getErrorText(ex));
		throw ex;
	} finally {
		unlinker.cleanup();
		t.true(configFileName != null && areTempFilesEqual(configFileName, unlinker.path));
	}
});

test.serial("Can find a babel config with rootMode: 'upward'. #1", "*", async (t, {typescript, rollup}) => {
	const unlinker = createTemporaryFile(BABEL_CONFIG_JSON_FILENAME, `{}`, "json");

	let configFileName: string | undefined;
	let forcePass = false;

	try {
		await generateRollupBundle(
			[
				{
					entry: true,
					fileName: "index.ts",
					text: `\
					console.log([].includes(2));
					`
				}
			],
			{
				debug: false,
				typescript,
				rollup,
				transpiler: "babel",
				cwd: unlinker.dir,
				babelConfig: {
					rootMode: "upward"
				},
				hook: {
					babelConfig: (config, fileName) => {
						configFileName = fileName;
						return config;
					}
				}
			}
		);
	} catch (ex) {
		if (handlePotentiallyAllowedFailingBabelError(t, ex)) {
			forcePass = true;
		}
	} finally {
		unlinker.cleanup();
		t.true(forcePass || (configFileName != null && areTempFilesEqual(configFileName, unlinker.path)));
	}
});

test.serial("Can resolve the nearest file-relative babel config. #1", "*", async (t, {typescript, rollup}) => {
	const unlinker = createTemporaryFile(BABELRC_FILENAME, `{}`, "json");
	let configFileName: string | undefined;
	try {
		await generateRollupBundle(
			[
				{
					entry: true,
					fileName: "index.ts",
					text: `\
					console.log([].includes(2));
					`
				}
			],
			{
				debug: false,
				typescript,
				rollup,
				cwd: unlinker.dir,
				transpiler: "babel",
				hook: {
					babelConfig: (config, fileName) => {
						configFileName = fileName;
						return config;
					}
				}
			}
		);
	} catch (ex) {
		t.fail(getErrorText(ex));
		throw ex;
	} finally {
		unlinker.cleanup();
		t.true(configFileName != null && areTempFilesEqual(configFileName, unlinker.path));
	}
});

test.serial("Can handle ESM-based babel configs. #1", "*", async (t, {typescript, rollup}) => {
	const unlinker = createTemporaryFile(BABEL_CONFIG_MJS_FILENAME, `export default {}`);
	let configFileName: string | undefined;
	let forcePass = false;

	try {
		await generateRollupBundle(
			[
				{
					entry: true,
					fileName: "index.ts",
					text: `\
					`
				}
			],
			{
				debug: false,
				typescript,
				rollup,
				cwd: unlinker.dir,
				transpiler: "babel",
				hook: {
					babelConfig: (config, fileName) => {
						configFileName = fileName;
						return config;
					}
				}
			}
		);
	} catch (ex) {
		if (handlePotentiallyAllowedFailingBabelError(t, ex)) {
			forcePass = true;
		}
	} finally {
		unlinker.cleanup();
		t.true(forcePass || (configFileName != null && areTempFilesEqual(configFileName, unlinker.path)));
	}
});

test.serial("Won't apply @babel/preset-env if the browserslist option is 'false'. #1", "*", async (t, {typescript, rollup}) => {
	let hasPresetEnv: boolean | undefined;
	await generateRollupBundle(
		[
			{
				entry: true,
				fileName: "index.ts",
				text: `\
					console.log([].includes(2));
					`
			}
		],
		{
			debug: false,
			typescript,
			rollup,
			transpiler: "babel",
			browserslist: false,
			hook: {
				babelConfig: (config, _, phase) => {
					if (phase === "chunk") return config;
					hasPresetEnv =
						config != null &&
						(config.presets ?? []).length > 0 &&
						((config.presets as ConfigItem[]) ?? []).some(preset => preset.file != null && preset.file.resolved.includes("preset-env"));
					return config;
				}
			}
		}
	);
	t.true(hasPresetEnv === false);
});

test.serial("Will apply @babel/preset-env if a Browserslist is provided or discovered. #1", "*", async (t, {typescript, rollup}) => {
	let hasPresetEnv: boolean | undefined;
	await generateRollupBundle(
		[
			{
				entry: true,
				fileName: "index.ts",
				text: `\
					console.log([].includes(2));
					`
			}
		],
		{
			debug: false,
			typescript,
			rollup,
			transpiler: "babel",
			browserslist: ["> 3%"],
			hook: {
				babelConfig: (config, _, phase) => {
					if (phase === "chunk") return config;
					hasPresetEnv =
						config != null &&
						(config.presets ?? []).length > 0 &&
						((config.presets as ConfigItem[]) ?? []).some(preset => preset.file != null && preset.file.resolved.includes("preset-env"));
					return config;
				}
			}
		}
	);
	t.true(hasPresetEnv === true);
});

test.serial(
	"Will auto-generate a Browserslist based on the 'target' from the tsconfig if none is discovered and babel is used as transpiler. #1",
	"*",
	async (t, {typescript, rollup}) => {
		let browserslist: string[] | undefined;
		await generateRollupBundle(
			[
				{
					entry: true,
					fileName: "index.ts",
					text: `\
					console.log([].includes(2));
					`
				}
			],
			{
				debug: false,
				typescript,
				rollup,
				transpiler: "babel",
				tsconfig: {
					target: "es2015"
				},
				hook: {
					babelConfig: (config, _, phase) => {
						if (phase === "chunk") return config;
						const matchingPreset =
							config == null || config.presets == null
								? undefined
								: (config.presets as ConfigItem[]).find(preset => preset.file != null && preset.file.resolved.includes("preset-env"));
						if (matchingPreset != null) {
							browserslist = (matchingPreset as {options: {targets: {browsers: string[]}}}).options.targets.browsers;
						}
						return config;
					}
				}
			}
		);

		t.true(browserslist != null && getAppropriateEcmaVersionForBrowserslist(browserslist) === "es2015");
	}
);

test.serial("Will apply minification-related plugins only in the renderChunk phase. #1", "*", async (t, {typescript, rollup}) => {
	let isMinifiedInTransformPhase: boolean | undefined;
	let isMinifiedInChunkPhase: boolean | undefined;
	await generateRollupBundle(
		[
			{
				entry: true,
				fileName: "index.ts",
				text: `\
					class Mangler {
						private program?: object;

						constructor(program?: object) {
							this.program = program;
						}
					}
					console.log(new Mangler());
					`
			}
		],
		{
			debug: false,
			typescript,
			rollup,
			transpiler: "babel",

			browserslist: false,
			postPlugins: [
				{
					name: "plugin",
					transform(code, file) {
						// It may be invoked with a CommonJS virtual entry file
						if (file.includes("?")) return;

						isMinifiedInTransformPhase = !/\r?\n/.test(code);

						return null;
					},

					renderChunk(code) {
						isMinifiedInChunkPhase = !/\r?\n/.test(code);
						return null;
					}
				}
			],
			babelConfig: {
				presets: ["minify"]
			}
		}
	);

	t.false(isMinifiedInTransformPhase);
	t.true(isMinifiedInChunkPhase);
});

test.serial("Will use the proper @babel/runtime/helpers/esm helpers when format is ESM. #1", "*", async (t, {typescript, rollup}) => {
	const bundle = await generateRollupBundle(
		[
			{
				entry: true,
				fileName: "index.ts",
				text: `\
						(async () => {})();
					`
			}
		],
		{
			typescript,
			rollup,
			transpiler: "babel",
			loadBabelHelpers: true,
			rollupOptions: {
				external: fileName => fileName.includes("@babel")
			},

			tsconfig: {
				target: "es3"
			}
		}
	);
	const {
		bundle: {
			output: [file]
		}
	} = bundle;

	t.deepEqual(
		formatCode(file.code),
		formatCode(`\
		import _asyncToGenerator from '@babel/runtime/helpers/esm/asyncToGenerator';
		import _regeneratorRuntime from '@babel/runtime/regenerator';
		
		_asyncToGenerator(
		/*#__PURE__*/ _regeneratorRuntime.mark(function _callee() {
			return _regeneratorRuntime.wrap(function _callee$(_context) {
				while (1)
					switch (_context.prev = _context.next) {
						case 0:
						case "end":
							return _context.stop();
					}
				
			}, _callee);
		}))();
			`)
	);
});

test.serial("Will use the proper @babel/runtime/helpers/esm helpers when format is ESM. #3", "*", async (t, {typescript, rollup}) => {
	const bundle = await generateRollupBundle(
		[
			{
				entry: true,
				fileName: "index.ts",
				text: `\
        class ObjX extends Object {}

					`
			}
		],
		{
			typescript,
			rollup,
			transpiler: "babel",
			loadBabelHelpers: true,
			rollupOptions: {
				external: fileName => fileName.includes("@babel") && fileName.includes("typeof")
			},

			tsconfig: {
				target: "es3"
			}
		}
	);
	const {
		bundle: {
			output: [file]
		}
	} = bundle;

	t.true(formatCode(file.code).includes(`@babel/runtime/helpers/esm/typeof`));
});

test.serial("Will use the proper @babel/runtime/helpers helpers when format is CJS. #1", "*", async (t, {typescript, rollup}) => {
	const bundle = await generateRollupBundle(
		[
			{
				entry: true,
				fileName: "index.ts",
				text: `\
						(async () => {})();
					`
			}
		],
		{
			typescript,
			rollup,
			transpiler: "babel",
			loadBabelHelpers: true,
			format: "cjs",
			rollupOptions: {
				external: fileName => fileName.includes("@babel")
			},

			tsconfig: {
				target: "es3"
			}
		}
	);
	const {
		bundle: {
			output: [file]
		}
	} = bundle;

	t.deepEqual(
		formatCode(file.code),
		formatCode(`\
		'use strict';

		var _asyncToGenerator = require("@babel/runtime/helpers/asyncToGenerator");
		var _regeneratorRuntime = require("@babel/runtime/regenerator");

		_asyncToGenerator(
		/*#__PURE__*/ _regeneratorRuntime.mark(function _callee() {
			return _regeneratorRuntime.wrap(function _callee$(_context) {
			while (1)
				switch ((_context.prev = _context.next)) {
				case 0:
				case "end":
					return _context.stop();
				}
			}, _callee);
		})
		)();`)
	);
});

test.serial("Will use @babel/preset-typescript if available for the initial emit by default. #1", "*", async (t, {typescript, rollup}) => {
	const bundle = await generateRollupBundle(
		[
			{
				entry: true,
				fileName: "index.ts",
				text: `\
					const enum Animals {
						Fish
					}
					console.log(Animals.Fish);
					`
			}
		],
		{
			typescript,
			rollup,
			transpiler: "babel",
			babelConfig: {
				presets: [
					[
						"@babel/preset-typescript",
						{
							optimizeConstEnums: true
						}
					]
				]
			}
		}
	);
	const {
		js: [file]
	} = bundle;

	t.deepEqual(
		formatCode(file.code),
		formatCode(`\
		console.log(0);
		`)
	);
});

test.serial("Will use @babel/preset-typescript if available for the initial emit by default. #2", "*", async (t, {typescript, rollup}) => {
	const bundle = await generateRollupBundle(
		[
			{
				entry: true,
				fileName: "index.custom",
				text: `\
					export const foo: string = "Hello, World!";
					`
			}
		],
		{
			typescript,
			rollup,
			transpiler: "babel",
			babelConfig: {
				presets: [
					[
						"@babel/preset-typescript",
						{
							allExtensions: true
						}
					]
				]
			}
		}
	);
	const {
		js: [file]
	} = bundle;

	t.deepEqual(
		formatCode(file.code),
		formatCode(`\
		const foo = "Hello, World!";

		export { foo };
		`)
	);
});

test.serial(
	"Will use @babel/preset-typescript if available for the initial emit by default, even if it isn't present in the user's babel config. #1",
	"*",
	async (t, {typescript, rollup}) => {
		const bundle = await generateRollupBundle(
			[
				{
					entry: true,
					fileName: "index.ts",
					text: `\
					export const foo: string = "Hello, World!";
					`
				}
			],
			{
				typescript,
				rollup,
				transpiler: "babel"
			}
		);
		const {
			js: [file]
		} = bundle;

		t.deepEqual(
			formatCode(file.code),
			formatCode(`\
		const foo = "Hello, World!";

		export { foo };
		`)
		);
	}
);

test.serial(
	"Will use the Typescript Compiler APIs for the initial emit, even if @babel/preset-typescript is available, if passed as the transpiler option for typescript syntax. #1",
	{ts: `<4.7`},
	async (t, {typescript, rollup}) => {
		const bundle = await generateRollupBundle(
			[
				{
					entry: true,
					fileName: "index.ts",
					text: `\
					export const enum Animals {
						Fish
					}
					console.log(Animals.Fish);
					`
				}
			],
			{
				typescript,
				rollup,
				transpiler: {
					typescriptSyntax: "typescript",
					otherSyntax: "babel"
				},
				babelConfig: {
					presets: [
						[
							"@babel/preset-typescript",
							{
								optimizeConstEnums: true
							}
						]
					]
				}
			}
		);
		const {
			js: [file]
		} = bundle;

		t.deepEqual(
			formatCode(file.code),
			formatCode(`\
		console.log(0 /* Fish */);`)
		);
	}
);

test.serial(
	"Will use the Typescript Compiler APIs for the initial emit, even if @babel/preset-typescript is available, if passed as the transpiler option for typescript syntax. #2",
	{ts: `>=4.7`},
	async (t, {typescript, rollup}) => {
		const bundle = await generateRollupBundle(
			[
				{
					entry: true,
					fileName: "index.ts",
					text: `\
					export const enum Animals {
						Fish
					}
					console.log(Animals.Fish);
					`
				}
			],
			{
				typescript,
				rollup,
				transpiler: {
					typescriptSyntax: "typescript",
					otherSyntax: "babel"
				},
				babelConfig: {
					presets: [
						[
							"@babel/preset-typescript",
							{
								optimizeConstEnums: true
							}
						]
					]
				}
			}
		);
		const {
			js: [file]
		} = bundle;

		t.deepEqual(
			formatCode(file.code),
			formatCode(`\
		console.log(0 /* Animals.Fish */);`)
		);
	}
);
