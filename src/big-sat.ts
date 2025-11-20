import * as sat from "./sat.js";

type ClauseID = number;

export class BigSATSolver implements sat.SATSolver {

	/**
	 * If bit `i` of `unitClauses` is `1`, unit-clause(*) `[i]` or `[-i]` was
	 * added to this solver, and at least one of
	 * `assignedTrue[i]` or `assignedFalse[i]` is `1`.
	 *
	 * BOTH `assignedTrue[i]` and `assignedFalse[i]` _may_ be `1` if the set of
	 * added clauses is inconsistent.
	 *
	 */
	private unitClauses: bigint = 0n;

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

	/**
	 * `watchingTrue[n]` is a set of `ClauseID`s that are "watching" the literal
	 * `+n`.
	 *
	 * A satisfied clause watches two arbitrary literals in it.
	 *
	 * An unsatisfied clause watches two unfalsified literals in it.
	 */
	private watchingTrue: Set<ClauseID>[] = [];
	private watchingFalse: Set<ClauseID>[] = [];

	initTerms(term: number): void {
		for (let i = this.watchingTrue.length; i <= term; i++) {
			this.watchingTrue[i] = new Set<ClauseID>();
			this.watchingFalse[i] = new Set<ClauseID>();
		}
	}

	getAssignment(): sat.Literal[] {
		const map = this.getAssignmentMap();

		throw new Error("Method not implemented.");
	}

	getAssignmentMap(): (-1 | 0 | 1)[] {
		const out: (-1 | 0 | 1)[] = [0];
		let assignedTrue = this.assignedTrue;
		let assignedFalse = this.assignedFalse;
		for (let index = 1; index < this.watchingTrue.length; index++) {
			const bit = 1n << BigInt(index);
			if ((assignedTrue & bit) !== 0n) {
				out[index] = 1;
			} else if ((assignedFalse & bit) !== 0n) {
				out[index] = -1;
			} else {
				out[index] = 0;
			}
		}
		return out;
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

	private scanClauses() {
		let unfalsifiedTrue = 0n;
		let unfalsifiedFalse = 0n;
		let unitTrue = 0n;
		let unitFalse = 0n;
		const assignedTerms = this.assignedTrue | this.assignedFalse;
		const unassignedTerms = ~assignedTerms;

		for (let clauseIndex = 0; clauseIndex < this.clausesTrue.length; clauseIndex++) {
			const clauseTrue = this.clausesTrue[clauseIndex];
			const clauseFalse = this.clausesFalse[clauseIndex];
			const satisfied = (clauseTrue & this.assignedTrue) | (clauseFalse & this.assignedFalse);
			if (satisfied !== 0n) {
				continue;
			}

			const unfalsifiedTerms = (clauseTrue | clauseFalse) & unassignedTerms;
			if (unfalsifiedTerms === 0n) {
				return "refuted";
			} else if (isPowerOf2(unassignedTerms)) {
				// Unit literal!
				unitTrue |= unfalsifiedTerms & clauseTrue;
				unitFalse |= unfalsifiedTerms & clauseFalse;
			} else {
				unfalsifiedTrue |= unfalsifiedTerms & clauseTrue;
				unfalsifiedFalse |= unfalsifiedTerms & clauseFalse;
			}
		}

		const pureTerms = unfalsifiedTrue ^ unfalsifiedFalse;
	}

	addClause(unprocessedClause: sat.Literal[]): void {
		if (unprocessedClause.length === 0) {
			// term 0
			this.unitClauses |= 1n;
			this.assignedTrue |= 1n;
			this.assignedFalse |= 1n;
		}

		let clauseTrue = 0n;
		let clauseFalse = 0n;
		let maxTerm = 0;
		for (const literal of unprocessedClause) {
			let term;
			if (literal === 0) {
				throw new Error("invalid literal 0");
			} else if (literal > 0) {
				term = literal;
				const bit = 1n << BigInt(term);
				clauseTrue |= bit;
			} else {
				term = -literal;
				const bit = 1n << BigInt(term);
				clauseFalse |= bit;
			}
			maxTerm = Math.max(maxTerm, term);
		}

		if ((clauseTrue & clauseFalse) !== 0n) {
			// The clause is a tautology (contains both +l and -l)
			return;
		}
		this.initTerms(maxTerm);

		const terms = clauseTrue | clauseFalse;
		if (isPowerOf2(terms)) {
			// This clause is a unit clause.
			const term = bitIndex(terms);
			const termBit = 1n << BigInt(term);
			this.unitClauses |= termBit;
			if ((clauseTrue & termBit) !== 0n) {
				this.assignedTrue |= termBit;
			} else {
				this.assignedFalse |= termBit;
			}
		} else {
			// This clause is NOT a unit clause.

			// Find 2 non-falsified literals in the clause.
			const unfalsifiedTerms = (clauseTrue & ~this.assignedFalse) | (clauseFalse & ~this.assignedTrue);
			const unfalsifiedBitTermA = unfalsifiedTerms & -unfalsifiedTerms;
			const unfalsifiedTermsExceptA = unfalsifiedTerms & ~unfalsifiedBitTermA;
			const unfalsifiedBitTermB = unfalsifiedTermsExceptA & -unfalsifiedTermsExceptA;
			if (unfalsifiedBitTermB === 0n) {
				throw new Error("cannot add clause; refuted by current assignment");
			}

			const termA = bitIndex(unfalsifiedBitTermA);
			const termB = bitIndex(unfalsifiedBitTermB);
			const clauseIndex = this.clausesFalse.length;

			if (clauseTrue & unfalsifiedBitTermA) {
				this.watchingTrue[termA].add(clauseIndex);
			} else {
				this.watchingFalse[termA].add(clauseIndex);
			}
			if (clauseTrue & unfalsifiedBitTermB) {
				this.watchingTrue[termB].add(clauseIndex);
			} else {
				this.watchingFalse[termB].add(clauseIndex);
			}

			this.clausesTrue.push(clauseTrue);
			this.clausesFalse.push(clauseFalse);
		}
	}

	rollbackToDecisionLevel(level: number): void {
		throw new Error("Method not implemented.");
	}
}

function isPowerOf2(n: bigint): boolean {
	return n === (n & -n);
}

function bitIndex(n: bigint): number {
	if (n <= 0n) {
		return -1;
	}
	let from = 0;
	while ((n & 0b1111_1111n) === 0n) {
		from += 8;
		n = n >> 8n;
	}

	if ((n & 0b1111n) !== 0n) {
		if ((n & 0b1n) !== 0n) {
			return from;
		} else if ((n & 0b10n) !== 0n) {
			return from + 1;
		} else if ((n & 0b100n) !== 0n) {
			return from + 2;
		}
		return from + 3;
	} else {
		if ((n & 0b10000n) !== 0n) {
			return from + 4;
		} else if ((n & 0b100000n) !== 0n) {
			return from + 5;
		} else if ((n & 0b1000000n) !== 0n) {
			return from + 6;
		}
		return from + 7;
	}
}
