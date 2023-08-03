import {test} from "./util/test-runner.js";
import {formatCode} from "./util/format-code.js";
import {generateRollupBundle} from "./setup/setup-rollup.js";
import {createBuiltInModuleTestFiles} from "./setup/test-file.js";

test.serial("Is still capable of resolving SourceFiles when needed for when a file path is matched by the 'exclude' glob. #1", "*", async (t, {typescript, rollup}) => {
	const bundle = await generateRollupBundle(
		[
			...createBuiltInModuleTestFiles("buffer"),
			{
				entry: true,
				fileName: "index.ts",
				text: `\
				export function foo (arg: Buffer): Buffer {
					return arg;
				}
				`
			}
		],
		{
			typescript,
			rollup,
			debug: false,
			exclude: ["node_modules/**/*.*"]
		}
	);
	const {
		declarations: [file]
	} = bundle;

	t.deepEqual(
		formatCode(file.code),
		formatCode(`\
		/// <reference types="node" />
		declare function foo(arg: Buffer): Buffer;
		export { foo };
	`)
	);
});
