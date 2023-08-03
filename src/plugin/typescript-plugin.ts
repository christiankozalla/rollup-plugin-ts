import type {
	ExistingRawSourceMap,
	InputOptions,
	InputPluginOption,
	OutputBundle,
	OutputOptions,
	Plugin,
	PluginContext,
	RenderedChunk,
	RollupCache,
	SourceDescription
} from "rollup";
import {getParsedCommandLine} from "../util/get-parsed-command-line/get-parsed-command-line.js";
import {getForcedCompilerOptions} from "../util/get-forced-compiler-options/get-forced-compiler-options.js";
import {getSourceDescriptionFromEmitOutput} from "../util/get-source-description-from-emit-output/get-source-description-from-emit-output.js";
import {emitDiagnostics} from "../service/emit/diagnostics/emit-diagnostics.js";
import type {SupportedExtensions} from "../util/get-supported-extensions/get-supported-extensions.js";
import {getSupportedExtensions} from "../util/get-supported-extensions/get-supported-extensions.js";
import {ensureRelative, getExtension, isBabelHelper, isMultiEntryModule, isRegeneratorRuntime, isSwcHelper} from "../util/path/path-util.js";
import {takeBundledFilesNames} from "../util/take-bundled-filenames/take-bundled-filenames.js";
import type {TypescriptPluginOptions} from "./typescript-plugin-options.js";
import {getPluginOptions, getTranspilerOptions, isUsingTranspiler} from "../util/plugin-options/get-plugin-options.js";
import {getBrowserslist} from "../util/get-browserslist/get-browserslist.js";
import {ResolveCache} from "../service/cache/resolve-cache/resolve-cache.js";
import {JSON_EXTENSION, REGENERATOR_RUNTIME_VIRTUAL_SRC, ROLLUP_PLUGIN_VIRTUAL_PREFIX} from "../constant/constant.js";
import {REGENERATOR_SOURCE} from "../lib/regenerator/regenerator.js";
import {createFilter} from "@rollup/pluginutils";
import {mergeTransformers} from "../util/merge-transformers/merge-transformers.js";
import {ensureArray} from "../util/ensure-array/ensure-array.js";
import type {ParsedCommandLineResult} from "../util/get-parsed-command-line/parsed-command-line-result.js";
import {takeBrowserslistOrComputeBasedOnCompilerOptions} from "../util/take-browserslist-or-compute-based-on-compiler-options/take-browserslist-or-compute-based-on-compiler-options.js";
import {matchAll} from "@wessberg/stringutil";
import {emitDeclarations} from "../service/emit/declaration/emit-declarations.js";
import {CompilerHost} from "../service/compiler-host/compiler-host.js";
import {pickResolvedModule} from "../util/pick-resolved-module.js";
import {emitBuildInfo} from "../service/emit/tsbuildinfo/emit-build-info.js";
import {shouldDebugEmit} from "../util/is-debug/should-debug.js";
import {logEmit} from "../util/logging/log-emit.js";
import {isJsonLike} from "../util/is-json-like/is-json-like.js";
import path from "crosspath";
import {loadBabel, loadSwc} from "../util/transpiler-loader.js";
import type {BabelConfigFactory} from "../transpiler/babel.js";
import {getBabelConfig, getDefaultBabelOptions, getForcedBabelOptions, replaceBabelHelpers} from "../transpiler/babel.js";
import type {SwcConfigFactory} from "../transpiler/swc.js";
import {getSwcConfigFactory} from "../transpiler/swc.js";
import {inputOptionsAreEqual} from "../util/rollup/rollup-util.js";
import {isPromise} from "../util/object/object-util.js";
import {isDefined} from "../util/is-defined/is-defined.js";

/**
 * The name of the Rollup plugin
 */
const PLUGIN_NAME = "Typescript";

/**
 * A Rollup plugin that transpiles the given input with Typescript
 */
export default function typescriptRollupPlugin(pluginInputOptions: Partial<TypescriptPluginOptions> = {}): Plugin {
	const pluginOptions: TypescriptPluginOptions = getPluginOptions(pluginInputOptions);
	const {include, exclude, tsconfig, cwd, browserslist, typescript, fileSystem, transpileOnly} = pluginOptions;
	const transformers = pluginOptions.transformers == null ? [] : ensureArray(pluginOptions.transformers);
	const transpilerOptions = getTranspilerOptions(pluginOptions.transpiler);

	// Make sure to normalize the received Browserslist
	const normalizedBrowserslist = getBrowserslist({browserslist, cwd, fileSystem});

	/**
	 * The ParsedCommandLine to use with Typescript
	 */
	let parsedCommandLineResult: ParsedCommandLineResult;

	/**
	 * The config to use with Babel for each file, if Babel should transpile source code
	 */
	let babelConfigFileFactory: BabelConfigFactory | undefined;

	/**
	 * The config to use with Babel for each chunk, if Babel should transpile source code
	 */
	let babelConfigChunkFactory: BabelConfigFactory | undefined;

	/**
	 * The config to use with swc for each file, if swc should transpile source code
	 */
	let swcConfigFileFactory: SwcConfigFactory | undefined;

	/**
	 * The config to use with swc for each chunk, if swc should transpile source code
	 */
	let swcConfigChunkFactory: SwcConfigFactory | undefined;

	/**
	 * The CompilerHost to use
	 */
	let host: CompilerHost;

	/**
	 * The ResolveCache to use
	 */
	const resolveCache = new ResolveCache({fileSystem});

	/**
	 * The filter function to use
	 */
	const internalFilter = createFilter(include, exclude);
	const filter = (id: string): boolean => !isSwcHelper(id) && (internalFilter(id) || internalFilter(path.normalize(id)) || internalFilter(path.native.normalize(id)));

	/**
	 * All supported extensions
	 */
	let SUPPORTED_EXTENSIONS: SupportedExtensions;

	/**
	 * The InputOptions provided to Rollup
	 */
	let rollupInputOptions: InputOptions;

	/**
	 * The previously emitted Rollup cache used as input, if any
	 */
	let inputCache: RollupCache | undefined;

	/**
	 * A Set of the entry filenames for when using rollup-plugin-multi-entry (we need to track this for generating valid declarations)
	 */
	let MULTI_ENTRY_FILE_NAMES: Set<string> | undefined;

	/**
	 * The virtual module name generated when using @rollup/plugin-multi-entry in combination with this plugin
	 */
	let MULTI_ENTRY_MODULE: string | undefined;

	const addFile = (fileName: string, text: string, dependencyCb?: (dependency: string) => void): void => {
		// Add the file to the CompilerHost
		host.add({fileName, text, fromRollup: true});

		if (dependencyCb != null) {
			// Add all dependencies of the file to the File Watcher if missing
			const dependencies = host.getDependenciesForFile(fileName, true);

			if (dependencies != null) {
				for (const dependency of dependencies) {
					const pickedDependency = pickResolvedModule(dependency, false);
					if (pickedDependency == null) continue;
					dependencyCb(pickedDependency);
				}
			}
		}
	};

	const emitFile = (fileName: string): SourceDescription | undefined => {
		// Get some EmitOutput, optionally from the cache if the file contents are unchanged
		const emitOutput = host.emit(path.normalize(fileName), false);

		// Return the emit output results to Rollup
		return getSourceDescriptionFromEmitOutput(emitOutput);
	};

	const transpileWithBabel = async (fileName: string, input: SourceDescription, initial = false): Promise<SourceDescription | undefined> => {
		// Conditionally initialize babel at this point.
		// Only require @babel/preset-typescript if relevant for the initial emit that may include TypeScript specific syntax
		const babel = await loadBabel(initial);
		const babelConfigResult = await babelConfigFileFactory!(fileName, initial);

		const transpilationResult = await babel.transformAsync(input.code, {
			...babelConfigResult.config,
			filenameRelative: ensureRelative(cwd, path.normalize(fileName)),
			inputSourceMap: typeof input.map === "string" ? JSON.parse(input.map) : input.map
		});

		return transpilationResult?.code == null
			? undefined
			: {
					code: transpilationResult.code,
					map: transpilationResult.map ?? undefined
			  };
	};

	const transpileWithSwc = async (fileName: string, input: SourceDescription, initial = false): Promise<SourceDescription | undefined> => {
		// Conditionally initialize swc at this point
		const swc = await loadSwc();
		const swcConfigResult = swcConfigFileFactory!(fileName, initial);

		const transpilationResult = await swc.transform(input.code, {
			...swcConfigResult,
			inputSourceMap: typeof input.map === "string" ? input.map : JSON.stringify(input.map)
		});

		return transpilationResult?.code == null
			? undefined
			: {
					code: transpilationResult.code,
					map: transpilationResult.map ?? undefined
			  };
	};

	/**
	 * This little helper is used in very rare cases, when something other than the TypeScript Compiler APIs has removed TypeScript specific features, and TypeScript should now strictly
	 * be used for applying additional syntax lowering. This will happen when something like babel or swc is used for TypeScript syntax, but typescript/tsc is used for other syntax.
	 * This is likely a very rare, odd scenario, and one that bypasses the Compiler host entirely. It is, however, completely OK, and the closest tsc provides to a simple transformation,
	 * akin to what babel and swc provides.
	 */
	const transpileWithTypescript = (fileName: string, input: SourceDescription): SourceDescription | undefined => {
		const transpilationResult = typescript.transpileModule(input.code, {
			compilerOptions: host.getCompilationSettings(),
			fileName: path.normalize(fileName),
			transformers: host.getCustomTransformers(),
			// We've moved on from the TypeScript specific parts at this point, so do not report any diagnostics here. This is purely a syntax transformation!
			reportDiagnostics: false
		});

		return {
			code: transpilationResult.outputText,
			map: transpilationResult.sourceMapText
		};
	};

	const isFileRelevant = (code: string, file: string): {relevant: boolean; isSupportedByCompilerHost: boolean} => {
		const normalizedFile = path.normalize(file);

		// Skip the file if it doesn't match the filter or if the helper cannot be transformed
		if (!filter(normalizedFile)) {
			return {relevant: false, isSupportedByCompilerHost: false};
		}

		const hasJsonExtension = getExtension(normalizedFile) === JSON_EXTENSION;

		// Files with a .json extension may not necessarily be JSON, for example
		// if a JSON plugin came before rollup-plugin-ts, in which case it shouldn't be treated
		// as JSON.
		const isJsInDisguise = hasJsonExtension && !isJsonLike(code);

		return {
			relevant: true,
			isSupportedByCompilerHost: host.isSupportedFileName(normalizedFile) && !isJsInDisguise
		};
	};

	async function flattenPlugins(plugins: InputPluginOption | undefined): Promise<Plugin[]> {
		const flattened: Plugin[] = [];
		const awaitedPlugins = ensureArray(isPromise(plugins) ? await plugins : plugins).filter(isDefined);
		for (const awaitedPlugin of awaitedPlugins) {
			if (awaitedPlugin == null || awaitedPlugin === false) continue;
			if (Array.isArray(awaitedPlugin) || isPromise(awaitedPlugin)) {
				flattened.push(...(await flattenPlugins(awaitedPlugin)));
			} else {
				flattened.push(awaitedPlugin);
			}
		}
		return flattened;
	}

	return {
		name: PLUGIN_NAME,

		/**
		 * Invoked when Input options has been received by Rollup
		 */
		async options(options: InputOptions): Promise<undefined> {
			// Always update the input cache
			inputCache = typeof options.cache === "boolean" ? undefined : options.cache;

			// Don't proceed if the options are identical to the previous ones
			if (rollupInputOptions != null && inputOptionsAreEqual(rollupInputOptions, options)) return;

			// Re-assign the full input options
			rollupInputOptions = options;

			const plugins = await flattenPlugins(options.plugins);
			const multiEntryPlugin = plugins?.find(plugin => plugin != null && typeof plugin !== "boolean" && plugin.name === "multi-entry");

			// If the multi-entry plugin is being used, we can extract the name of the entry module
			// based on it
			if (multiEntryPlugin != null) {
				if (typeof options.input === "string") {
					MULTI_ENTRY_MODULE = `${ROLLUP_PLUGIN_VIRTUAL_PREFIX}${options.input}`;
				}
			}

			// Make sure we have a proper ParsedCommandLine to work with
			parsedCommandLineResult = getParsedCommandLine({
				tsconfig,
				cwd,
				fileSystem,
				typescript,
				pluginOptions,
				filter,
				forcedCompilerOptions: getForcedCompilerOptions({pluginOptions, rollupInputOptions, browserslist: normalizedBrowserslist})
			});

			if (isUsingTranspiler("babel", transpilerOptions)) {
				// Prepare a Babel config if Babel should be the transpiler for some or all emit
				// A browserslist may already be provided, but if that is not the case, one can be computed based on the "target" from the tsconfig
				const computedBrowserslist = takeBrowserslistOrComputeBasedOnCompilerOptions(normalizedBrowserslist, parsedCommandLineResult.originalCompilerOptions, typescript);

				const sharedBabelConfigFactoryOptions = {
					babel: await loadBabel(),
					cwd,
					hook: pluginOptions.hook.babelConfig,
					babelConfig: pluginOptions.babelConfig,
					forcedOptions: getForcedBabelOptions({cwd}),
					defaultOptions: getDefaultBabelOptions({browserslist: computedBrowserslist, transpilerOptions}),
					browserslist: computedBrowserslist,
					rollupInputOptions
				};

				babelConfigFileFactory = getBabelConfig({
					...sharedBabelConfigFactoryOptions,
					phase: "file"
				});

				babelConfigChunkFactory = getBabelConfig({
					...sharedBabelConfigFactoryOptions,
					phase: "chunk"
				});
			}

			if (isUsingTranspiler("swc", transpilerOptions)) {
				// Prepare a swc config file factory if swc should be the transpiler for some or all emit
				const sharedSwcConfigFactoryOptions = {
					cwd,
					fileSystem,
					typescript,
					pluginOptions,
					hook: pluginOptions.hook.swcConfig,
					swcConfig: pluginOptions.swcConfig,
					browserslist: normalizedBrowserslist === false ? undefined : normalizedBrowserslist,
					ecmaVersion: parsedCommandLineResult.originalCompilerOptions.target
				};

				swcConfigFileFactory = getSwcConfigFactory({
					...sharedSwcConfigFactoryOptions,
					phase: "file"
				});

				swcConfigChunkFactory = getSwcConfigFactory({
					...sharedSwcConfigFactoryOptions,
					phase: "chunk"
				});
			}

			SUPPORTED_EXTENSIONS = getSupportedExtensions(
				Boolean(parsedCommandLineResult.parsedCommandLine.options.allowJs),
				Boolean(parsedCommandLineResult.parsedCommandLine.options.resolveJsonModule),
				typescript
			);

			// Hook up a CompilerHost
			host = new CompilerHost({
				filter,
				cwd,
				resolveCache,
				fileSystem,
				typescript,
				extensions: SUPPORTED_EXTENSIONS,
				externalOption: rollupInputOptions.external,
				parsedCommandLineResult,
				transformers: mergeTransformers(...transformers)
			});

			return undefined;
		},

		/**
		 * Renders the given chunk. Will emit declaration files if the Typescript config says so.
		 * Will also apply any minification via Babel if a minification plugin or preset has been provided,
		 * and if Babel is the chosen transpiler. Otherwise, it will simply do nothing
		 */
		async renderChunk(this: PluginContext, code: string, chunk: RenderedChunk, outputOptions: OutputOptions): Promise<SourceDescription | null> {
			let updatedSourceDescription: SourceDescription | undefined;

			if (transpilerOptions.otherSyntax === "babel") {
				const {config} = await babelConfigChunkFactory!(chunk.fileName);
				const babel = await loadBabel();

				// When targeting CommonJS and using babel as a transpiler, we may need to rewrite forced ESM paths for preserved external helpers to paths that are compatible with CommonJS.
				updatedSourceDescription = replaceBabelHelpers(code, chunk.fileName, outputOptions.format === "cjs" || outputOptions.format === "commonjs" ? "cjs" : "esm");

				// Don't proceed if there is no minification config
				if (config == null) {
					return updatedSourceDescription ?? null;
				}

				const updatedCode = updatedSourceDescription != null ? updatedSourceDescription.code : code;
				const updatedMap = updatedSourceDescription != null ? (updatedSourceDescription.map as ExistingRawSourceMap) : undefined;

				const transpilationResult = await babel.transformAsync(updatedCode, {
					...config,
					filenameRelative: ensureRelative(cwd, chunk.fileName),
					...(updatedMap == null
						? {}
						: {
								inputSourceMap: {...updatedMap, file: updatedMap.file ?? ""} as never
						  })
				});

				if (transpilationResult == null || transpilationResult.code == null) {
					return updatedSourceDescription == null ? null : updatedSourceDescription;
				}

				// Return the results
				return {
					code: transpilationResult.code,
					map: transpilationResult.map ?? undefined
				};
			} else if (transpilerOptions.otherSyntax === "swc") {
				const config = swcConfigChunkFactory!(chunk.fileName);
				const swc = await loadSwc();

				// Don't proceed if there is no minification config
				if (config == null) {
					return updatedSourceDescription ?? null;
				}

				const updatedCode = updatedSourceDescription != null ? updatedSourceDescription.code : code;
				const updatedMap = updatedSourceDescription != null ? (updatedSourceDescription.map as ExistingRawSourceMap) : undefined;

				const transpilationResult = await swc.transform(updatedCode, {
					...config,
					...(updatedMap == null
						? {}
						: {
								inputSourceMap: JSON.stringify(updatedMap)
						  })
				});

				if (transpilationResult == null || transpilationResult.code == null) {
					return updatedSourceDescription == null ? null : updatedSourceDescription;
				}

				// Return the results
				return {
					code: transpilationResult.code,
					map: transpilationResult.map ?? undefined
				};
			} else {
				return updatedSourceDescription ?? null;
			}
		},

		/**
		 * When a file changes, make sure to clear it from any caches to avoid stale caches
		 */
		watchChange(id: string): void {
			host.delete(id);
			resolveCache.delete(id);
			host.clearCaches();
		},

		/**
		 * Transforms the given code and file
		 */
		async transform(this: PluginContext, code: string, file: string): Promise<SourceDescription | undefined> {
			const normalizedFile = path.normalize(file);

			// If this file represents ROLLUP_PLUGIN_MULTI_ENTRY, we need to parse its' contents to understand which files it aliases.
			// Following that, there's nothing more to do
			if (isMultiEntryModule(normalizedFile, MULTI_ENTRY_MODULE)) {
				MULTI_ENTRY_FILE_NAMES = new Set(matchAll(code, /(import|export)\s*(\*\s*from\s*)?["'`]([^"'`]*)["'`]/).map(([, , , p]) => path.normalize(p.replace(/\\\\/g, "\\"))));
				return undefined;
			}

			const {relevant, isSupportedByCompilerHost} = isFileRelevant(code, file);

			if (!relevant) return undefined;

			let sourceDescription: SourceDescription = {code, map: undefined};

			// Some @babel/runtime helpers may depend on other helpers, but sometimes these are imported from the incorrect paths.
			// For example, some @babel/runtime/helpers/esm files depend on CJS helpers where they actually should depend on esm helpers instead.
			// In these cases, we'll have to transform the imports immediately since it will otherwise break for users who don't use something like the commonjs plugin,
			// even though this is technically not a problem directly caused by or related to rollup-plugin-ts
			if (isUsingTranspiler("babel", transpilerOptions) && isBabelHelper(normalizedFile)) {
				sourceDescription = replaceBabelHelpers(code, normalizedFile, "esm") ?? sourceDescription;
			}

			// Only add the file to the Typescript CompilerHost if its extension is supported.
			if (isSupportedByCompilerHost) {
				addFile(normalizedFile, sourceDescription.code, dependency => this.addWatchFile(dependency));
			}

			switch (transpilerOptions.typescriptSyntax) {
				case "typescript": {
					if (isSupportedByCompilerHost) {
						sourceDescription = emitFile(file) ?? sourceDescription;
					}

					break;
				}

				case "babel": {
					sourceDescription = (await transpileWithBabel(file, sourceDescription, true)) ?? sourceDescription;
					break;
				}

				case "swc": {
					sourceDescription = (await transpileWithSwc(file, sourceDescription, true)) ?? sourceDescription;
					break;
				}
			}

			// If the same transpiler is used for both TypeScript- and other syntax,
			// return the generated source description at this point.
			if (transpilerOptions.otherSyntax === transpilerOptions.typescriptSyntax) {
				return sourceDescription;
			} else {
				switch (transpilerOptions.otherSyntax) {
					case "typescript": {
						return transpileWithTypescript(file, sourceDescription) ?? sourceDescription;
					}

					case "babel": {
						return (await transpileWithBabel(file, sourceDescription)) ?? sourceDescription;
					}

					case "swc": {
						return (await transpileWithSwc(file, sourceDescription)) ?? sourceDescription;
					}
				}
			}
		},

		/**
		 * Attempts to resolve the given id via the LanguageServiceHost
		 */
		resolveId(this: PluginContext, id: string, parent: string | undefined): string | null {
			// Don't proceed if there is no parent (in which case this is an entry module)
			if (parent == null) return null;

			if (id === "regenerator-runtime") {
				return REGENERATOR_RUNTIME_VIRTUAL_SRC;
			}

			const resolveResult = host.resolve(id, parent);

			const pickedResolveResult = resolveResult == null ? undefined : pickResolvedModule(resolveResult, false);
			return pickedResolveResult == null ? null : path.native.normalize(pickedResolveResult);
		},

		/**
		 * Optionally loads the given id. Is used to swap out the regenerator-runtime implementation used by babel
		 * to use one that is using ESM by default to play nice with Rollup even when rollup-plugin-commonjs isn't
		 * being used
		 */
		load(this: PluginContext, id: string): string | null {
			// Return the alternative source for the regenerator runtime if that file is attempted to be loaded
			if (isRegeneratorRuntime(path.normalize(id))) {
				return REGENERATOR_SOURCE;
			}
			return null;
		},

		/**
		 * Invoked when a full bundle is generated. Will take all modules for all chunks and make sure to remove all removed files
		 * from the LanguageService
		 */
		generateBundle(this: PluginContext, outputOptions: OutputOptions, bundle: OutputBundle): void {
			// If a cache was provided to Rollup,
			// some or all files may not have been added to the CompilerHost
			// and therefore it will not be possible to compile correct diagnostics,
			// declarations, and/or .buildinfo. To work around this, we'll have to make sure
			// all files that are part of the compilation unit is in fact added to the CompilerHost
			if (inputCache != null) {
				for (const module of inputCache.modules) {
					const normalizedFile = path.normalize(module.id);

					// Don't proceed if we already know about that file
					if (host.has(normalizedFile) || !isFileRelevant(module.originalCode, normalizedFile).isSupportedByCompilerHost) continue;

					// Add to the CompilerHost
					addFile(normalizedFile, module.originalCode);
				}
			}

			// If debugging is active, log the outputted files
			for (const file of Object.values(bundle)) {
				if (!("fileName" in file)) continue;

				const normalizedFileName = path.normalize(file.fileName);
				const text = "code" in file ? file.code : file.source.toString();

				if (shouldDebugEmit(pluginOptions.debug, normalizedFileName, text, "javascript")) {
					logEmit(normalizedFileName, text);
				}
			}

			// Only emit diagnostics if the plugin options allow it
			if (!Boolean(transpileOnly)) {
				// Emit all reported diagnostics
				emitDiagnostics({host, pluginOptions, context: this});
			}

			// Emit tsbuildinfo files if required
			if (Boolean(parsedCommandLineResult.parsedCommandLine.options.incremental) || Boolean(parsedCommandLineResult.parsedCommandLine.options.composite)) {
				emitBuildInfo({
					host,
					outputOptions,
					pluginOptions,
					pluginContext: this
				});
			}

			// Emit declaration files if required
			if (Boolean(parsedCommandLineResult.originalCompilerOptions.declaration)) {
				emitDeclarations({
					host,
					bundle,
					externalOption: rollupInputOptions.external,
					outputOptions,
					pluginOptions,
					pluginContext: this,
					multiEntryFileNames: MULTI_ENTRY_FILE_NAMES,
					multiEntryModule: MULTI_ENTRY_MODULE,
					originalCompilerOptions: parsedCommandLineResult.originalCompilerOptions
				});
			}

			const bundledFilenames = takeBundledFilesNames(bundle);

			// Walk through all of the files of the LanguageService and make sure to remove them if they are not part of the bundle
			for (const fileName of host.getRollupFileNames()) {
				if (!bundledFilenames.has(fileName)) {
					host.delete(fileName);
				}
			}
		}
	};
}
