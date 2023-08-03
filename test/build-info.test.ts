import {test} from "./util/test-runner.js";
import {generateRollupBundle} from "./setup/setup-rollup.js";

test.serial("Can generate .tsbuildinfo for a compilation unit. #1", "*", async (t, {typescript, rollup}) => {
	const bundle = await generateRollupBundle(
		[
			{
				entry: true,
				fileName: "index.ts",
				text: `\
					export {};
					`
			}
		],
		{
			debug: false,
			typescript,
			rollup,
			tsconfig: {
				outDir: "dist",
				composite: true,
				incremental: true,
				declaration: true
			}
		}
	);
	const {buildInfo} = bundle;
	t.true(buildInfo != null);
});

test.serial("Won't break for older TypeScript versions. #1", "*", async (t, {typescript, rollup}) => {
	await t.notThrowsAsync(
		generateRollupBundle(
			[
				{
					entry: true,
					fileName: "index.ts",
					text: `\
					export {};
					`
				}
			],
			{
				debug: false,
				typescript,
				rollup,
				tsconfig: {
					outDir: "dist",
					composite: true,
					declaration: true
				}
			}
		),
		`Did throw for TypeScript ${typescript.version}`
	);
});

test.serial("Can generate .tsbuildinfo for a compilation unit. #2", "*", async (t, {typescript, rollup}) => {
	const bundle = await generateRollupBundle(
		[
			{
				entry: true,
				fileName: "source/index.ts",
				text: `\
					import("./foo");
					`
			},
			{
				entry: false,
				fileName: "source/foo.ts",
				text: `\
					export type Foo = string;
					`
			},
			{
				entry: false,
				fileName: "tsconfig.json",
				text: `\
					{
						"compilerOptions": {
							"outDir": "dist",
							"composite": true,
							"declaration": true,
							"lib": ["esnext"]
						},
						"include": [
							"./source/**/*"
						]
					}
					`
			}
		],
		{
			debug: false,
			typescript,
			rollup,
			tsconfig: "tsconfig.json"
		}
	);
	const {buildInfo} = bundle;
	t.true(buildInfo != null);
});
