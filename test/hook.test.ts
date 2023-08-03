import {test} from "./util/test-runner.js";
import {formatCode} from "./util/format-code.js";
import {generateRollupBundle} from "./setup/setup-rollup.js";
import type {DeclarationStats} from "../src/type/declaration-stats.js";
import {createBuiltInModuleTestFiles, createExternalTestFiles} from "./setup/test-file.js";

test.serial("Declarations respect rewritten output paths. #1", "*", async (t, {typescript, rollup}) => {
	const bundle = await generateRollupBundle(
		[
			{
				entry: true,
				fileName: "index.ts",
				text: `\
					import {Foo} from "./foo";
					export {Foo}
					`
			},
			{
				entry: false,
				fileName: "foo.ts",
				text: `\
					export type Foo = string;
					`
			}
		],
		{
			typescript,
			rollup,
			debug: false,
			tsconfig: {
				declarationMap: true,
				declarationDir: "./foobarbaz"
			},
			hook: {
				outputPath: path => path.replace("index.d.ts", "some-other-dir/hey/there/index-rewritten.d.ts")
			}
		}
	);
	const {
		declarations: [file]
	} = bundle;

	t.deepEqual(
		formatCode(file.code),
		formatCode(`\
		type Foo = string;
		export {Foo};
		//# sourceMappingURL=index-rewritten.d.ts.map
		`)
	);
});

test.serial("Diagnostics can be filtered with the 'diagnostics' hook. #1", "*", async (t, {typescript, rollup}) => {
	const bundle = await generateRollupBundle(
		[
			{
				entry: true,
				fileName: "index.ts",
				text: `\
					export const foo: number = String(2);
					`
			}
		],
		{
			typescript,
			rollup,
			hook: {
				diagnostics: () => undefined
			}
		}
	);
	const {
		declarations: [file]
	} = bundle;

	t.deepEqual(
		formatCode(file.code),
		formatCode(`\
		declare const foo: number;
		export {foo};
		`)
	);
});

test.serial("External types can be retrieved with the 'declarationStats' hook. #1", "*", async (t, {typescript, rollup}) => {
	let stats: DeclarationStats | undefined;

	await generateRollupBundle(
		[
			...createBuiltInModuleTestFiles("buffer"),
			...createExternalTestFiles("my-library", `export declare class Foo {}`),
			{
				entry: true,
				fileName: "index.ts",
				text: `\
					import {Foo} from "my-library";
					export const foo = Foo;
					export const bar = Buffer.from("");
					`
			}
		],
		{
			typescript,
			rollup,
			hook: {
				declarationStats: declarationStats => (stats = declarationStats)
			}
		}
	);

	t.true(stats != null);
	t.true(stats?.["index.d.ts"].externalTypes != null);
	t.true(stats?.["index.d.ts"].externalTypes[0] != null);
	t.true(stats?.["index.d.ts"].externalTypes[0].library === "my-library");
	t.true(stats?.["index.d.ts"].externalTypes[1] != null);
	t.true(stats?.["index.d.ts"].externalTypes[1].library === "@types/node");
});
