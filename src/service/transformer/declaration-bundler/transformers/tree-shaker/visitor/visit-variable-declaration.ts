import {TreeShakerVisitorOptions} from "../tree-shaker-visitor-options";
import {TS} from "../../../../../../type/ts";

export function visitVariableDeclaration({node, continuation, factory}: TreeShakerVisitorOptions<TS.VariableDeclaration>): TS.VariableDeclaration | undefined {
	const nameContinuationResult = continuation(node.name);
	if (nameContinuationResult == null) {
		return undefined;
	}

	return node.name === nameContinuationResult ? node : factory.updateVariableDeclaration(node, nameContinuationResult, node.exclamationToken, node.type, node.initializer);
}
