import {test} from "./util/test-runner.js";
import {formatCode} from "./util/format-code.js";
import {generateRollupBundle} from "./setup/setup-rollup.js";
import type {TS} from "../src/type/ts.js";
import {ensureNodeFactory} from "compatfactory";

test.serial("Supports Custom Transformers, including on bundled declarations. #1", "*", async (t, {typescript, rollup}) => {
	const transformer: (ts: typeof TS) => TS.TransformerFactory<TS.SourceFile> = ts => context => sourceFile => {
		const factory = ensureNodeFactory(context.factory ?? ts);

		function visitNode(node: TS.Node): TS.VisitResult<TS.Node> {
			if (ts.isClassDeclaration(node)) {
				return factory.updateClassDeclaration(node, node.modifiers, factory.createIdentifier("Bar"), node.typeParameters, node.heritageClauses, node.members);
			} else if (ts.isExportSpecifier(node)) {
				return factory.updateExportSpecifier(node, false, node.propertyName, factory.createIdentifier("Bar"));
			} else {
				return ts.visitEachChild(node, visitNode, context);
			}
		}

		return ts.visitEachChild(sourceFile, visitNode, context);
	};

	const bundle = await generateRollupBundle(
		[
			{
				entry: true,
				fileName: "index.ts",
				text: `\
					export class Foo {}
					`
			}
		],
		{
			typescript,
			rollup,
			debug: false,
			transformers: ({typescript: ts}) => ({
				before: [transformer(ts)],
				afterDeclarations: [transformer(ts) as TS.TransformerFactory<TS.SourceFile | TS.Bundle>]
			})
		}
	);
	const {
		declarations: [declarationFile],
		bundle: {
			output: [file]
		}
	} = bundle;

	t.deepEqual(
		formatCode(declarationFile.code),
		formatCode(`\
		declare class Bar {
		}
		export {Bar};
		`)
	);

	t.deepEqual(
		formatCode(file.code),
		formatCode(`\
		class Bar {
		}

		export {Bar};
		`)
	);
});

test.serial("Supports Custom Transformers, including on bundled declarations. #2", "*", async (t, {typescript, rollup}) => {
	const bundle = await generateRollupBundle(
		[
			{
				entry: true,
				fileName: "index.ts",
				text: `\
					export class Foo {}
					`
			}
		],
		{
			typescript,
			rollup,
			debug: false,
			transformers: ({typescript: ts}) => ({
				after: [
					context => sourceFile => {
						const factory = ensureNodeFactory(context.factory ?? ts);

						return factory.updateSourceFile(sourceFile, [
							...sourceFile.statements,
							factory.createExpressionStatement(
								factory.createCallExpression(factory.createPropertyAccessExpression(factory.createIdentifier("console"), factory.createIdentifier("log")), undefined, [
									factory.createStringLiteral("foo")
								])
							)
						]);
					}
				]
			})
		}
	);
	const {
		declarations: [declarationFile],
		bundle: {
			output: [file]
		}
	} = bundle;

	t.deepEqual(
		formatCode(declarationFile.code),
		formatCode(`\
		declare class Foo {
		}
		export {Foo};
		`)
	);

	t.deepEqual(
		formatCode(file.code),
		formatCode(`\
		class Foo {
		}
		console.log("foo");

		export {Foo};
		`)
	);
});

test.serial("Supports adding diagnostics from Custom Transformers. #1", "*", async (t, {typescript, rollup}) => {
	let hadDiagnostic = false;
	await generateRollupBundle(
		[
			{
				entry: true,
				fileName: "index.ts",
				text: `\
					export class Foo {}
					`
			}
		],
		{
			typescript,
			rollup,
			debug: false,
			hook: {
				diagnostics: diagnostics => {
					hadDiagnostic = diagnostics.length > 0;
					return [];
				}
			},
			transformers: ({addDiagnostics, typescript: ts}) => ({
				before: [
					() => sourceFile => {
						addDiagnostics({
							code: 123,
							category: ts.DiagnosticCategory.Error,
							messageText: `This is a custom diagnostic`,
							file: sourceFile,
							start: 0,
							length: 0
						});
						return sourceFile;
					}
				]
			})
		}
	);
	t.true(hadDiagnostic);
});
