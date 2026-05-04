import * as sat from "./sat.ts";

type ClauseID = number;

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

	private termWeights: number[] = [0];

	/**
	 * Together with `clausesFalse`, describes the current set of clauses.
	 *
	 * If bit `k` of a `clausesTrue[c]` is `1`, the literal `+k` satisfies
	 * clause `c`.
	 *
	 * Bit `0` is always `0`.
	 */
	private clausesTrueTerms: bigint[] = [];

	/**
	 * Together with `clausesTrue`, describes the current set of clauses.
	 *
	 * If bit `k` of a `clausesFalse[c]` is `1`, the literal `-k` satisfies
	 * clause `c`.
	 *
	 * Bit `0` is always `0`.
	 */
	private clausesFalseTerms: bigint[] = [];

	/**
	 * These clauses refute the current assignment, and thus have not
	 * yet been added to the other data structures.
	 */
	private refutingClauses: sat.Literal[][] = [];

	termCount(): number {
		return this.termWeights.length - 1;
	}

	initTerms(term: number): void {
		for (let i = this.termWeights.length; i <= term; i++) {
			this.termWeights[i] = 0;
		}
	}

	getAssignmentStack(): sat.Literal[] {
		const map = this.getAssignmentMap();
		const assignmentLiterals = [];
		for (let term = 1; term < map.length; term++) {
			if (map[term] !== 0) {
				assignmentLiterals.push(term * map[term]);
			}
		}
		return assignmentLiterals;
	}

	getAssignmentMap(): (-1 | 0 | 1)[] {
		const out: (-1 | 0 | 1)[] = [0];
		let assignedTrue = this.assignedTrue;
		let assignedFalse = this.assignedFalse;
		const termCount = this.termCount();
		for (let term = 1; term <= termCount; term++) {
			const bit = 1n << BigInt(term);
			if ((assignedTrue & bit) !== 0n) {
				out[term] = 1;
			} else if ((assignedFalse & bit) !== 0n) {
				out[term] = -1;
			} else {
				out[term] = 0;
			}
		}
		return out;
	}

	solve(): sat.SATResult {
		this.assignedTrue = 0n;
		const termCount = this.termCount();
		const exceedBit = 1n << BigInt(termCount + 1);

		while (this.assignedTrue < exceedBit) {
			// const bits = this.assignedTrue.toString(2).split("").reverse().join("").padEnd(termCount + 1, "0");
			// console.log(this.assignedTrue);
			// console.log(bits);

			this.assignedFalse = ~this.assignedTrue;

			let satisfied = true;
			for (let clauseIndex = 0; clauseIndex < this.clausesTrueTerms.length; clauseIndex += 1) {
				const clauseTrueTerms = this.clausesTrueTerms[clauseIndex];
				const clauseFalseTerms = this.clausesFalseTerms[clauseIndex];
				const trueSatisfied = clauseTrueTerms & this.assignedTrue;
				const falseSatisfied = clauseFalseTerms & this.assignedFalse;
				if (trueSatisfied === 0n && falseSatisfied === 0n) {
					// This clause is refuted by the current assignment.
					// const trueX = "t" + clauseTrueTerms.toString(2).replace(/0/g, " ").split("").reverse().join("").padEnd(termCount + 1, " ").substring(1);
					// const falseX = "f" + clauseFalseTerms.toString(2).replace(/0/g, " ").split("").reverse().join("").padEnd(termCount + 1, " ").substring(1);
					// console.log(trueX);
					// console.log(falseX);

					// Isolate the lowest bit of this clause
					const wrongBits = clauseTrueTerms | clauseFalseTerms;
					const step = leastSignificantBit(wrongBits);

					satisfied = false;
					// The find smallest successor of the assignment which
					// _possibly_ satisfies this clause
					this.assignedTrue += step;
					this.assignedTrue &= ~(step - 1n);
					this.assignedFalse = ~this.assignedTrue;
				}
			}

			if (satisfied) {
				return this.getAssignmentStack();
			}
		}

		return "unsatisfiable";
	}

	private drainRefutingClauses(): void {
		const refutingClauses = this.refutingClauses.splice(0);
		for (const refutingClause of refutingClauses) {
			this.addClause(refutingClause);
		}
	}

	addClause(unprocessedClause: sat.Literal[]): ClauseID | null {
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
			return null;
		}
		this.initTerms(maxTerm);

		const unfalsifiedTerms = (clauseTrue & ~this.assignedFalse) | (clauseFalse & ~this.assignedTrue);
		if (unfalsifiedTerms === 0n) {
			// This clause refutes the current assignment (or is empty)
			this.refutingClauses.push([...new Set(unprocessedClause)]);
			return null;
		}

		for (const literal of unprocessedClause) {
			this.termWeights[Math.abs(literal)] += 1;
		}

		const clauseIndex = this.clausesFalseTerms.length;
		this.clausesTrueTerms.push(clauseTrue);
		this.clausesFalseTerms.push(clauseFalse);
		return clauseIndex;
	}
}

function isPowerOf2(n: bigint): boolean {
	return n === leastSignificantBit(n);
}

function bitIndex(n: bigint): number {
	if (n === 0n) {
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

function leastSignificantBit(n: bigint): bigint {
	return n & -n;
}

function toBitIndexSet(n: bigint, scale = 1): number[] {
	let index = 0;
	const out = [];
	while (n !== 0n) {
		if ((n & 1n) !== 0n) {
			out.push(index * scale);
			index += 1;
			n /= 2n;
		} else if ((n & 0b1111n) === 0n) {
			n /= 16n;
			index += 4;
		} else {
			n /= 2n;
			index += 1;
		}
	}
	return out;
}
