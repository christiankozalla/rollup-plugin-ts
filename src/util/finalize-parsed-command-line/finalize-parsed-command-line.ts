import type {TS} from "../../type/ts.js";
import {ensureAbsolute, setExtension} from "../path/path-util.js";
import {TSBUILDINFO_EXTENSION} from "../../constant/constant.js";
import type {ParsedCommandLineResult} from "../get-parsed-command-line/parsed-command-line-result.js";
import path from "crosspath";
import {allowsNodeNextModuleResolution} from "../module-resolution/module-resolution-util.js";

export interface FinalizeParsedCommandLineOptions {
	typescript: typeof TS;
	cwd: string;
	parsedCommandLineResult: ParsedCommandLineResult;
}

export function finalizeParsedCommandLine({
	cwd,
	typescript,
	parsedCommandLineResult: {originalCompilerOptions, parsedCommandLine, tsconfigPath}
}: FinalizeParsedCommandLineOptions): TS.ParsedCommandLine {
	/**
	 * If 'Classic' Module resolution is requested, replace that one with 'NodeNext' instead.
	 * If anything else is requested, leave it as it is
	 */
	if (parsedCommandLine.options.moduleResolution === typescript.ModuleResolutionKind.Classic) {
		parsedCommandLine.options.moduleResolution =
			typescript.ModuleResolutionKind.NodeNext != null && allowsNodeNextModuleResolution(typescript)
				? typescript.ModuleResolutionKind.NodeNext
				: // eslint-disable-next-line deprecation/deprecation
				  typescript.ModuleResolutionKind.Node16 ?? typescript.ModuleResolutionKind.Node10 ?? typescript.ModuleResolutionKind.NodeJs;
	}

	// Declarations may be generated, but not as part of the Builder/Incremental program which is used during the transform, renderChunk, and generateBundle phases, so a nice optimization can be to instruct TypeScript not to generate them.
	// The raw CompilerOptions will be preserved and used in the last compilation phase to generate declarations if needed.
	// However, when 'composite' is true or when incremental compilation is active, declarations must be emitted for buildInfo to work, so under such circumstances this optimization must be skipped.
	const canApplySkipDeclarationsOptimization =
		!Boolean(parsedCommandLine.options.incremental) &&
		!Boolean(parsedCommandLine.options.composite) &&
		parsedCommandLine.options.tsBuildInfoFile == null &&
		(parsedCommandLine.projectReferences == null || parsedCommandLine.projectReferences.length < 1);
	if (canApplySkipDeclarationsOptimization) {
		parsedCommandLine.options.declaration = false;
		parsedCommandLine.options.declarationMap = false;
		parsedCommandLine.options.declarationDir = undefined;
	}

	// Ensure that at tsBuildInfoFile exists if 'composite' or 'incremental' is true
	if (parsedCommandLine.options.incremental === true || parsedCommandLine.options.composite === true) {
		if (parsedCommandLine.options.tsBuildInfoFile != null) {
			parsedCommandLine.options.tsBuildInfoFile = ensureAbsolute(cwd, parsedCommandLine.options.tsBuildInfoFile);
		}

		// Otherwise, use the _actual_ outDir/outFile from the resolved tsconfig to build the path to the .tsbuildinfo file since TypeScript should be able to actually
		// resolve the file from the path pointed to by the user
		else {
			let tsBuildInfoAbsolutePath: string;
			// Use outDir as the base directory
			if (originalCompilerOptions.outDir != null) {
				tsBuildInfoAbsolutePath = path.join(ensureAbsolute(cwd, originalCompilerOptions.outDir), `${path.parse(tsconfigPath).name}${TSBUILDINFO_EXTENSION}`);
			}

			// Otherwise, use outFile but replace the extension
			else if (originalCompilerOptions.outFile != null) {
				tsBuildInfoAbsolutePath = ensureAbsolute(cwd, setExtension(originalCompilerOptions.outFile, TSBUILDINFO_EXTENSION));
			}

			// Otherwise, use 'cwd' as the directory for the .tsbuildinfo file
			else {
				tsBuildInfoAbsolutePath = path.join(ensureAbsolute(cwd, `${path.parse(tsconfigPath).name}${TSBUILDINFO_EXTENSION}`));
			}

			parsedCommandLine.options.tsBuildInfoFile = tsBuildInfoAbsolutePath;
		}
	}

	return parsedCommandLine;
}
