import test from "ava";
import {formatCode} from "./util/format-code";
import {generateRollupBundle} from "./setup/setup-rollup";
// tslint:disable:no-duplicate-string

test("Flattens declarations. #1", async t => {
	const bundle = await generateRollupBundle([
		{
			entry: true,
			fileName: "index.ts",
			text: `\
					import {Bar} from "./bar";
					export interface Foo extends Bar {}
					`
		},
		{
			entry: false,
			fileName: "bar.ts",
			text: `\
					export interface Bar {
						a: string;
					}
					`
		}
	]);
	const {
		declarations: [file]
	} = bundle;
	t.deepEqual(
		formatCode(file.code),
		formatCode(`\
		interface Bar {
			a: string;
		}
		export interface Foo extends Bar {}
		`)
	);
});

test("Flattens declarations. #2", async t => {
	const bundle = await generateRollupBundle([
		{
			entry: true,
			fileName: "index.ts",
			text: `\
					import Bar from "./bar";
					export interface Foo extends Bar {}
					`
		},
		{
			entry: false,
			fileName: "bar.ts",
			text: `\
					export default interface Bar {
						a: string;
					}
					`
		}
	]);
	const {
		declarations: [file]
	} = bundle;
	t.deepEqual(
		formatCode(file.code),
		formatCode(`\
		interface Bar {
			a: string;
		}
		export interface Foo extends Bar {}
		`)
	);
});

test("Flattens declarations. #3", async t => {
	const bundle = await generateRollupBundle([
		{
			entry: true,
			fileName: "index.ts",
			text: `\
					import {Bar} from "./bar";
					export interface Foo extends Bar {}
					`
		},
		{
			entry: false,
			fileName: "bar.ts",
			text: `\
					interface Foo {
						a: string;
					}
					export interface Bar extends Foo {
					}
					`
		}
	]);
	const {
		declarations: [file]
	} = bundle;
	t.deepEqual(
		formatCode(file.code),
		formatCode(`\
		interface Foo {
			a: string;
		}
		interface Bar extends Foo {
		}
		export interface Foo_$0 extends Bar {
		}
		`)
	);
});

test("Flattens declarations. #4", async t => {
	const bundle = await generateRollupBundle([
		{
			entry: true,
			fileName: "index.ts",
			text: `\
					export * from "./bar";
					`
		},
		{
			entry: false,
			fileName: "bar.ts",
			text: `\
					export interface Foo {}
					`
		}
	]);
	const {
		declarations: [file]
	} = bundle;
	t.deepEqual(
		formatCode(file.code),
		formatCode(`\
		interface Foo {}
		export {Foo};
		`)
	);
});

test("Flattens declarations. #5", async t => {
	const bundle = await generateRollupBundle([
		{
			entry: true,
			fileName: "index.ts",
			text: `\
					export * from "./bar";
					`
		},
		{
			entry: false,
			fileName: "bar.ts",
			text: `\
					export * from "./baz";
					`
		},
		{
			entry: false,
			fileName: "baz.ts",
			text: `\
					export interface Foo {}
					`
		}
	]);
	const {
		declarations: [file]
	} = bundle;
	t.deepEqual(
		formatCode(file.code),
		formatCode(`\
		interface Foo {}
		export {Foo};
		`)
	);
});

test("Flattens declarations. #6", async t => {
	const bundle = await generateRollupBundle([
		{
			entry: true,
			fileName: "index.ts",
			text: `\
					export * from "./bar";
					`
		},
		{
			entry: false,
			fileName: "bar.ts",
			text: `\
					export * from "./a";
					export * from "./b";
					`
		},
		{
			entry: false,
			fileName: "a.ts",
			text: `\
					export type Something =
					| "foo"
					| "bar";
					`
		},
		{
			entry: false,
			fileName: "b.ts",
			text: `\
					export const enum SomethingElse {
						FOO = 0,
						BAR = 1
					}
					`
		}
	]);
	const {
		declarations: [file]
	} = bundle;
	t.deepEqual(
		formatCode(file.code),
		formatCode(`\
		declare type Something =
			| "foo"
			| "bar";
		declare const enum SomethingElse {
			FOO = 0,
			BAR = 1
		}
		export {Something, SomethingElse};
		`)
	);
});

test("Flattens declarations. #7", async t => {
	const bundle = await generateRollupBundle([
		{
			entry: true,
			fileName: "index.ts",
			text: `\
					import * as m from './bar';
					export { m };
					`
		},
		{
			entry: false,
			fileName: "bar.ts",
			text: `\
					export const ten = 10;
					`
		}
	]);
	const {
		declarations: [file]
	} = bundle;
	t.deepEqual(
		formatCode(file.code),
		formatCode(`\
		declare const ten = 10;
		declare module m {
				const ten = 10;
		}
		export { m };
		`)
	);
});

test("Flattens declarations. #8", async t => {
	const bundle = await generateRollupBundle([
		{
			entry: true,
			fileName: "index.ts",
			text: `\
          import {BuiltInParser} from './bar';
					import {Bar} from "./bar";
          export interface Foo extends Bar {
            x: BuiltInParser;
          }
					`
		},
		{
			entry: false,
			fileName: "bar.ts",
			text: `\
          export {BuiltInParser} from 'prettier';
					export interface Bar {
						a: string;
					}
					`
		}
	]);
	const {
		declarations: [file]
	} = bundle;
	t.deepEqual(
		formatCode(file.code),
		formatCode(`\
		import { BuiltInParser } from "prettier";
		interface Bar {
  		a: string;
  	}
  	export interface Foo extends Bar {
  		x: BuiltInParser;
  	}
		`)
	);
});

test("Flattens declarations. #9", async t => {
	const bundle = await generateRollupBundle([
		{
			entry: true,
			fileName: "index.ts",
			text: `\
          import magicString from './bar';
					export const Foo = magicString;
					`
		},
		{
			entry: false,
			fileName: "bar.ts",
			text: `\
          export {default} from 'magic-string';
					`
		}
	]);
	const {
		declarations: [file]
	} = bundle;
	t.deepEqual(
		formatCode(file.code),
		formatCode(`\
		import { default as magicString } from "magic-string";
		export declare const Foo: typeof magicString;
		`)
	);
});

test("Flattens declarations. #10", async t => {
	const bundle = await generateRollupBundle([
		{
			entry: true,
			fileName: "index.ts",
			text: `\
          import magicString from './bar';
					export const Foo = magicString;
					`
		},
		{
			entry: false,
			fileName: "bar.ts",
			text: `\
          export {default as default} from 'magic-string';
					`
		}
	]);
	const {
		declarations: [file]
	} = bundle;
	t.deepEqual(
		formatCode(file.code),
		formatCode(`\
		import { default as magicString } from "magic-string";
		export declare const Foo: typeof magicString;
		`)
	);
});

test("Flattens declarations. #11", async t => {
	const bundle = await generateRollupBundle([
		{
			entry: true,
			fileName: "index.ts",
			text: `\
          import {Bar} from './bar';
					export const Foo = Bar;
					`
		},
		{
			entry: false,
			fileName: "bar.ts",
			text: `\
          export {default as Bar} from 'magic-string';
					`
		}
	]);
	const {
		declarations: [file]
	} = bundle;
	t.deepEqual(
		formatCode(file.code),
		formatCode(`\
		import { default as Bar } from "magic-string";
		export declare const Foo: typeof Bar;
		`)
	);
});

test("Flattens declarations. #12", async t => {
	const bundle = await generateRollupBundle([
		{
			entry: true,
			fileName: "index.ts",
			text: `\
          		import X from './bar';
          		export { X }
        	`
		},
		{
			entry: false,
			fileName: "bar.ts",
			text: `\
				interface Foo { n: number; }
				export const fn = (x: Foo): Foo => x;
				export default fn({ n: 0 });
            `
		}
	]);
	const {
		declarations: [file]
	} = bundle;
	t.deepEqual(
		formatCode(file.code),
		formatCode(`\
		interface Foo {
    	n: number;
		}
		declare const defaultBarExport: Foo;
		declare const X: typeof defaultBarExport;
		export { X };
		`)
	);
});

test("Flattens declarations. #13", async t => {
	const bundle = await generateRollupBundle([
		{
			entry: true,
			fileName: "index.ts",
			text: `\
          		import X from './bar';
          		export { X }
        	`
		},
		{
			entry: false,
			fileName: "bar.ts",
			text: `\
				export default function foo (): string {return "";} `
		}
	]);
	const {
		declarations: [file]
	} = bundle;

	t.deepEqual(
		formatCode(file.code),
		formatCode(`\
		declare function foo(): string;
		declare const X: typeof foo;
		export { X };
		`)
	);
});

test("Flattens declarations. #14", async t => {
	const bundle = await generateRollupBundle([
		{
			entry: true,
			fileName: "index.ts",
			text: `\
          		import X from './bar';
          		export { X }
        	`
		},
		{
			entry: false,
			fileName: "bar.ts",
			text: `\
				enum FooKind {A, B}
				export default FooKind;
				`
		}
	]);
	const {
		declarations: [file]
	} = bundle;

	t.deepEqual(
		formatCode(file.code),
		formatCode(`\
		declare enum FooKind {
			A = 0,
			B = 1
		}
		declare type X = FooKind;
		export { X };
		`)
	);
});

test("Flattens declarations. #15", async t => {
	const bundle = await generateRollupBundle([
		{
			entry: true,
			fileName: "index.ts",
			text: `\
          		export * from "./foo";
        	`
		},
		{
			entry: false,
			fileName: "foo/index.ts",
			text: `\
				export const Foo = "foo";
				`
		}
	]);
	const {
		declarations: [file]
	} = bundle;
	t.deepEqual(
		formatCode(file.code),
		formatCode(`\
			declare const Foo = "foo";
			export {Foo};
		`)
	);
});

test.skip("Flattens declarations. #16", async t => {
	const bundle = await generateRollupBundle([
		{
			entry: true,
			fileName: "index.ts",
			text: `\
          		export * from "./foo.baz";
          		export * from "./bar.baz";
        	`
		},
		{
			entry: false,
			fileName: "foo.baz.ts",
			text: `\
				export const Foo = "foo";
				`
		},
		{
			entry: false,
			fileName: "bar.baz.ts",
			text: `\
				export const Bar = "bar";
				`
		}
	]);
	const {
		declarations: [file]
	} = bundle;
	console.log(file.code);
	t.deepEqual(
		formatCode(file.code),
		formatCode(`\
			declare const Foo = "foo";
			declare const Bar = "bar";
			export {Foo, Bar};
		`)
	);
});

test("A file with no exports generates a .d.ts file with an 'export {}' declaration to mark it as a module. #1", async t => {
	const bundle = await generateRollupBundle([
		{
			entry: true,
			fileName: "index.ts",
			text: `\
					console.log(true);
					`
		}
	]);
	const {
		declarations: [file]
	} = bundle;
	t.deepEqual(
		formatCode(file.code),
		formatCode(`\
		export {};
		`)
	);
});

test("Declaration maps correctly maps input sources. #1", async t => {
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
		{tsconfig: {declarationMap: true}}
	);
	const {
		declarationMaps: [file]
	} = bundle;
	t.deepEqual(
		formatCode(file.code, "json"),
		formatCode(
			`\
		{"version":3,"file":"index.d.ts","sourceRoot":"","sources":["foo.ts","index.ts"],"names":[],"mappings":"AAAK,aAAY,GAAG,GAAG,MAAM,CAACAACK,OAAO,EAAC,GAAG,EAAC,CAAA"}
		`,
			"json"
		)
	);
});

test("Declaration maps correctly maps input sources. #2", async t => {
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

		{tsconfig: {declarationMap: true, declarationDir: "./foobarbaz"}}
	);
	const {
		declarationMaps: [file]
	} = bundle;
	t.deepEqual(
		formatCode(file.code, "json"),
		formatCode(
			`\
		{"version":3,"file":"index.d.ts","sourceRoot":"","sources":["../foo.ts","../index.ts"],"names":[],"mappings":"AAAK,aAAY,GAAG,GAAG,MAAM,CAACAACK,OAAO,EAAC,GAAG,EAAC,CAAA"}
		`,
			"json"
		)
	);
});

test("Declaration maps respect rewritten output paths. #1", async t => {
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
			tsconfig: {
				declarationMap: true,
				declarationDir: "./foobarbaz"
			},
			hook: {
				outputPath: path => path.replace("index.d.ts", "index-rewritten.d.ts")
			}
		}
	);
	const {
		declarationMaps: [file]
	} = bundle;
	t.deepEqual(
		formatCode(file.code, "json"),
		formatCode(
			`\
		{"version":3,"file":"index-rewritten.d.ts","sourceRoot":"","sources":["../foo.ts","../index.ts"],"names":[],"mappings":"AAAK,aAAY,GAAG,GAAG,MAAM,CAACAACK,OAAO,EAAC,GAAG,EAAC,CAAA"}
		`,
			"json"
		)
	);
});

test("Declarations respect rewritten output paths. #1", async t => {
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
			tsconfig: {
				declarationMap: true,
				declarationDir: "./foobarbaz"
			},
			hook: {
				outputPath: path => path.replace("index.d.ts", "index-rewritten.d.ts")
			}
		}
	);
	const {
		declarations: [file]
	} = bundle;
	t.deepEqual(
		formatCode(file.code),
		formatCode(`\
		declare type Foo = string;
		export {Foo};
		//# sourceMappingURL=index-rewritten.d.ts.map
		`)
	);
});
