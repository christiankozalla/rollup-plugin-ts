/* eslint-disable deprecation/deprecation */
import type {ReferenceVisitorOptions} from "../reference-visitor-options.js";
import type {TS} from "../../../../../../../type/ts.js";
import {isSymbolIdentifier} from "../../../../util/is-symbol-identifier.js";

export function checkPropertySignature({node, continuation, typescript}: ReferenceVisitorOptions<TS.PropertySignature>): string[] {
	const referencedIdentifiers: string[] = [];

	if (!typescript.isIdentifier(node.name) || isSymbolIdentifier(node.name, typescript)) {
		referencedIdentifiers.push(...continuation(node.name));
	}

	if (node.type != null) {
		referencedIdentifiers.push(...continuation(node.type));
	}
	return referencedIdentifiers;
}
