import {test} from "./util/test-runner.js";
import {generateRollupBundle} from "./setup/setup-rollup.js";
import multiEntry from "@rollup/plugin-multi-entry";
import {formatCode} from "./util/format-code.js";
import {createTemporaryFile} from "./util/create-temporary-file.js";
import {generateRandomHash} from "../src/util/hash/generate-random-hash.js";

test.serial("Can generate declarations for a virtual entry file using @rollup/plugin-multi-entry #1", "*", async (t, {typescript, rollup}) => {
	const unlinkerA = createTemporaryFile(
		`${generateRandomHash()}.ts`,
		`
		export type A = {
			foo: boolean;
		};
		export const a: A = {
			foo: true,
		};
	`
	);

	const unlinkerB = createTemporaryFile(
		`${generateRandomHash()}.ts`,
		`
		export type B = {
			bar: number;
		};
					
		export const b: B = {
			bar: 1,
		};
	`
	);

	try {
		const bundle = await generateRollupBundle(
			[
				{
					entry: false,
					fileName: unlinkerA.path,
					text: unlinkerA.code
				},
				{
					entry: false,
					fileName: unlinkerB.path,
					text: unlinkerB.code
				}
			],
			{
				typescript,
				rollup,
				debug: false,
				prePlugins: [multiEntry()]
			}
		);
		const {
			declarations: [file]
		} = bundle;

		t.deepEqual(
			formatCode(file.code),
			formatCode(`\
			type B = {
					bar: number;
			};
			declare const b: B;
			type A = {
					foo: boolean;
			};
			declare const a: A;
			export { B, b, A, a };
		`)
		);
	} finally {
		unlinkerA.cleanup();
		unlinkerB.cleanup();
	}
});
