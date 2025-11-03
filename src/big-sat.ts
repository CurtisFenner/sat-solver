import * as sat from "./sat.js";

export class BigSATSolver implements sat.SATSolver {

	/**
	 * Together with `assignedFalse`, describes the current assignment.
	 *
	 * If bit `i` of `assignedTrue` is `1`, the literal `+i` is part of the
	 * current assignment.
	 *
	 * Bit `0` is always `0`.
	 */
	private assignedTrue: bigint = 0n;

	/**
	 * Together with `assignedTrue`, describes the current assignment.
	 *
	 * If bit `i` of `assignedFalse` is `1`, the literal `-i` is part of the
	 * current assignment.
	 *
	 * Bit `0` is always `0`.
	 */
	private assignedFalse: bigint = 0n;

	/**
	 * Together with `clausesFalse`, describes the current set of clauses.
	 *
	 * If bit `k` of a `clausesTrue[c]` is `1`, the literal `+k` satisfies
	 * clause `c`.
	 *
	 * Bit `0` is always `0`.
	 */
	private clausesTrue: bigint[] = [];

	/**
	 * Together with `clausesTrue`, describes the current set of clauses.
	 *
	 * If bit `k` of a `clausesFalse[c]` is `1`, the literal `+k` satisfies
	 * clause `c`.
	 *
	 * Bit `0` is always `0`.
	 */
	private clausesFalse: bigint[] = [];

	initTerms(term: number): void {
	}

	getAssignment(): sat.Literal[] {
		throw new Error("Method not implemented.");
	}

	getAssignmentMap(): (-1 | 0 | 1)[] {
		throw new Error("Method not implemented.");
	}

	simplifyClauses(clauses: sat.Literal[][]): sat.Literal[][] {
		throw new Error("Method not implemented.");
	}

	fastPartialSolve(): sat.SATResult {
		throw new Error("Method not implemented.");
	}

	solve(): sat.SATResult {
		throw new Error("Method not implemented.");
	}

	addClause(unprocessedClause: sat.Literal[]): void {
		let clauseTrue = 0n;
		let clauseFalse = 0n;
		for (const literal of unprocessedClause) {
			if (literal > 0) {
				clauseTrue |= 1n << BigInt(literal);
			} else {
				clauseFalse |= 1n << BigInt(-literal);
			}
		}

		if ((clauseTrue & clauseFalse) !== 0n) {
			// The clause is a tautology (contains both +l and -l)
			return;
		}

		this.clausesTrue.push(clauseTrue);
		this.clausesFalse.push(clauseFalse);
	}

	rollbackToDecisionLevel(level: number): void {
		throw new Error("Method not implemented.");
	}
}
