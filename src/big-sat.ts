import type * as sat from "./sat.ts";

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

	private termWeights: number[] = [];

	private unassignTermSet(termSet: bigint): void {
		this.assignedFalse &= ~termSet;
		this.assignedTrue &= ~termSet;
	}

	private assignmentDecisionLevel: Array<number> = [];
	private assignmentDecisionLast = 0;
	private assignTerm(term: sat.Literal, value: boolean): void {
		const termBit = 1n << BigInt(term);
		if (!value) {
			this.assignedFalse |= termBit;
		} else {
			this.assignedTrue |= termBit;
		}

		this.assignmentDecisionLevel[term] = this.assignmentDecisionLast;
	}

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

	private clauseLiterals: Array<readonly sat.Literal[]> = [];

	/**
	 * `watchingTrue[n]` is a set of `ClauseID`s that are "watching" the literal
	 * `+n`.
	 *
	 * A satisfied clause watches two arbitrary literals in it.
	 *
	 * An unsatisfied clause watches two unfalsified literals in it.
	 */
	private watchingTrue: Set<ClauseID>[] = [null as any];
	private watchingFalse: Set<ClauseID>[] = [null as any];

	/**
	 * These clauses refute the current assignment, and thus have not
	 * yet been added to the other data structures.
	 */
	private refutingClauses: sat.Literal[][] = [];

	termCount(): number {
		return this.watchingTrue.length - 1;
	}

	initTerms(term: number): void {
		for (let i = this.watchingTrue.length; i <= term; i++) {
			this.watchingTrue[i] = new Set<ClauseID>();
			this.watchingFalse[i] = new Set<ClauseID>();
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
		const out = [];
		for (const clause of clauses) {
			let outClause: sat.Literal[] | null = [];
			for (const literal of clause) {
				const term = Math.abs(literal);
				const termBit = 1n << BigInt(term);
				if (this.assignedTrue & termBit) {
					if (literal > 0) {
						outClause = null;
						break;
					} else {
						continue;
					}
				} else if (this.assignedFalse & termBit) {
					if (literal < 0) {
						outClause = null;
						break;
					} else {
						continue;
					}
				}
			}
			if (outClause !== null) {
				out.push(outClause);
			}
		}
		return out;
	}

	/**
	 * @returns an implied clause
	 */
	private unitPropagate(
		initialClauseIDs: ClauseID[],
	): sat.Literal[] | "unfalsified" {
		// Suppose initially A=true.
		// Suppose there are clauses
		// [~A or C] and [~C or ~B] and [~A or ~C or B].
		// 1. `~A or C`: needsTrue = {C}, needsFalse = {}.
		//    So C := true.
		// 2. `~C or ~B`: needsTrue = {}, needsFalse = {B}.
		//    So B := false.
		// 3. `~A or ~C or B`: needsTrue = {}. needsFalse = {}.
		//    So, a contradiction!
		// Apply "rel_sat": resolve the falsified clause with the
		// antecedents discovered during unit-propagation:
		// * Term `A` was not assigned during this series of propagation, so
		//   the literal `~A` remains.
		// * Term `C` was assigned because of (1.: `A implies C`). Resolution
		//   results in `~A or (~A) or ~B` = `~A or ~B`.
		// * Term `B` was assigned because of (2.: `C implies ~B`).
		//   Resolution results in `~A or (~C)`, but because `~C` has already
		//   been "expanded", this can be written as just `~A`.

		const relSatAntecedentTerms: Array<bigint> = [];
		let relSatAntecedentTermsKeySet: bigint = 0n;
		const qSet = new Set<ClauseID>(initialClauseIDs);
		while (qSet.size !== 0) {
			const clauseID = qSet.values().next().value!;
			qSet.delete(clauseID);

			const clauseTrue = this.clausesTrue[clauseID];
			const clauseFalse = this.clausesFalse[clauseID];

			const clauseIsSatisfied =
				(clauseTrue & this.assignedTrue) !== 0n
				|| (clauseFalse & this.assignedFalse) !== 0n;
			if (clauseIsSatisfied) {
				continue;
			}

			const needsTrue = clauseTrue & ~this.assignedFalse;
			const needsFalse = clauseFalse & ~this.assignedTrue;
			if (needsTrue === 0n && needsFalse === 0n) {
				// A contradiction has been reached.
				// Recursively resolve all literals in the falsified clause.
				let learnedTrue = 0n;
				let learnedFalse = 0n;
				let processedTerms = 0n;
				let waitingTerms = clauseTrue | clauseFalse;
				while (waitingTerms !== 0n) {
					const termToProcess = bitIndex(waitingTerms);
					const termBit = 1n << BigInt(termToProcess);

					const antTerms = relSatAntecedentTerms[termToProcess];
					processedTerms |= termBit;
					if (antTerms !== undefined) {
						// Use "rel_sat": resolve literals with their antecedent
						// if they were assigned in this decision level;
						// otherwise leave them as-is.
						waitingTerms |= antTerms;
					} else {
						learnedTrue |= this.assignedFalse & termBit;
						learnedFalse |= this.assignedTrue & termBit;
					}
					waitingTerms &= ~processedTerms;
				}

				this.unassignTermSet(relSatAntecedentTermsKeySet);
				return [
					...toBitIndexSet(learnedTrue),
					...toBitIndexSet(learnedFalse, -1),
				];
			}

			const unassignedTerms = needsTrue | needsFalse;
			if (!isPowerOf2(unassignedTerms)) {
				// This clause is not satisfied,
				// and has at least 2 unfalsified literals.
				// Update its 2-WL entries.
				this.updateWatches(clauseID);
				continue;
			}

			// This is a unit clause!
			const forcedTerm = bitIndex(unassignedTerms);
			let watchingClauseIDs;
			if (needsTrue) {
				this.assignTerm(forcedTerm, true);
				watchingClauseIDs = this.watchingFalse[forcedTerm];
			} else {
				this.assignTerm(forcedTerm, false);
				watchingClauseIDs = this.watchingTrue[forcedTerm];
			}
			relSatAntecedentTerms[forcedTerm] = clauseTrue | clauseFalse;
			relSatAntecedentTermsKeySet |= unassignedTerms;
			for (const watchingClauseID of watchingClauseIDs) {
				qSet.add(watchingClauseID);
			}
		}

		return "unfalsified";
	}

	solve(): sat.SATResult {
		this.drainRefutingClauses();
		if (this.refutingClauses.length !== 0) {
			// This CNF instance includes clauses which refute the current
			// assignment.
			return "unsatisfiable";
		}

		let initialUnitClauses: ClauseID[];
		while (true) {
			const scan = this.scanClauses();
			if (scan === "refuted") {
				return "unsatisfiable"
			} else if (scan.pureFalse !== 0n || scan.pureTrue !== 0n) {
				for (const term of toBitIndexSet(scan.pureFalse)) {
					this.assignTerm(term, false);
				}
				for (const term of toBitIndexSet(scan.pureTrue)) {
					this.assignTerm(term, true);
				}
				continue;
			} else if (scan.mixedUnfalsifiedTerms === 0n) {
				// All clauses are satisfied by the current assignment.
				return this.getAssignmentStack();
			}
			initialUnitClauses = scan.unitClauses;
			break;
		}

		while (true) {
			const learnedClause = this.unitPropagate(initialUnitClauses);
			if (learnedClause !== "unfalsified") {
				this.rollbackUntilAsserting(learnedClause);
				const learnedClauseID = this.addClause(learnedClause);
				if (learnedClauseID === null) {
					return "unsatisfiable";
				}
				initialUnitClauses = [learnedClauseID];
			} else {
				const decisionLiteral = this.makeDecision();
				if (!decisionLiteral) {
					// All terms are already assigned.
					return this.getAssignmentStack();
				}
				this.assignmentDecisionLast += 1;
				const decisionTerm = decisionLiteral > 0 ? decisionLiteral : -decisionLiteral;
				if (decisionLiteral > 0) {
					this.assignTerm(decisionTerm, true);
					initialUnitClauses = [...this.watchingFalse[decisionLiteral]];
				} else {
					this.assignTerm(decisionTerm, false);
					initialUnitClauses = [...this.watchingTrue[decisionTerm]];
				}
			}
		}
	}

	/**
	 * **Modifies** the current assignment
	 */
	private rollbackUntilAsserting(literals: sat.Literal[]) {
		if (literals.length === 0) {
			return;
		}
		let assignedCount = 0;
		let mostRecentSequence = -1;
		let mostRecentTermSet = 0n;
		for (const literal of literals) {
			const term = literal > 0 ? literal : -literal;
			const termBit = 1n << BigInt(term);
			const isAssigned = ((this.assignedFalse | this.assignedTrue) & termBit) !== 0n;
			if (isAssigned) {
				assignedCount += 1;

				const sequence = this.assignmentDecisionLevel[term];
				if (sequence > mostRecentSequence) {
					mostRecentSequence = sequence;
					mostRecentTermSet = termBit;
				} else if (sequence === mostRecentSequence) {
					mostRecentTermSet |= termBit;
				}
			}
		}
		const unassignedCount = literals.length - assignedCount;
		if (unassignedCount === 0 && mostRecentTermSet !== 0n) {
			this.unassignTermSet(mostRecentTermSet);
		}
	}

	/**
	 * @returns `null` if all terms are already assigned.
	 * Otherwise, returns an arbitrary unassigned literal.
	 */
	private makeDecision(): sat.Literal | null {
		const assignedBits = this.assignedFalse | this.assignedTrue;

		const terms = this.termWeights
			.map((weight, term) => ({ weight, term }))
			.filter(({ term }) => term > 0)
			.sort((a, b) => b.weight - a.weight);
		for (const { term } of terms) {
			const termBit = 1n << BigInt(term);
			if (assignedBits & termBit) {
				continue;
			}

			return this.watchingFalse[term] < this.watchingTrue[term]
				? -term
				: term;
		}
		return null;
	}

	private drainRefutingClauses(): void {
		const refutingClauses = this.refutingClauses.splice(0);
		for (const refutingClause of refutingClauses) {
			this.addClause(refutingClause);
		}
	}

	private scanClauses() {
		const assignedTerms = this.assignedTrue | this.assignedFalse;
		const unassignedTerms = ~assignedTerms;

		for (const set of [...this.watchingTrue, ...this.watchingFalse]) {
			set?.clear();
		}

		let unfalsifiedTrue = 0n;
		let unfalsifiedFalse = 0n;
		const unitClauses: ClauseID[] = [];
		let unitTrue = 0n;
		let unitFalse = 0n;
		for (let clauseIndex = 0; clauseIndex < this.clausesTrue.length; clauseIndex++) {
			const clauseTrue = this.clausesTrue[clauseIndex];
			const clauseFalse = this.clausesFalse[clauseIndex];
			const satisfied = (clauseTrue & this.assignedTrue) !== 0n || (clauseFalse & this.assignedFalse) !== 0n;
			if (satisfied) {
				continue;
			}

			this.updateWatches(clauseIndex);

			const unfalsifiedTerms = (clauseTrue | clauseFalse) & unassignedTerms;
			unfalsifiedTrue |= unfalsifiedTerms & clauseTrue;
			unfalsifiedFalse |= unfalsifiedTerms & clauseFalse;
			if (unfalsifiedTerms === 0n) {
				return "refuted";
			} else if (isPowerOf2(unfalsifiedTerms)) {
				// Unit literal!
				unitTrue |= unfalsifiedTerms & clauseTrue;
				unitFalse |= unfalsifiedTerms & clauseFalse;
				unitClauses.push(clauseIndex);
			}
		}

		if ((unitTrue & unitFalse) !== 0n) {
			return "refuted";
		}

		const pureTerms = unfalsifiedTrue ^ unfalsifiedFalse;
		return {
			unitTrueTerms: unitTrue,
			unitFalseTerms: unitFalse,
			unitClauses,
			pureTrue: unfalsifiedTrue & pureTerms,
			pureFalse: unfalsifiedFalse & pureTerms,
			mixedUnfalsifiedTerms: (unfalsifiedTrue | unfalsifiedFalse) & ~pureTerms,
		};
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

		const literalSet = new Set(unprocessedClause);
		for (const literal of literalSet) {
			this.termWeights[Math.abs(literal)] += 1;
		}

		const clauseIndex = this.clausesFalse.length;
		this.clausesTrue.push(clauseTrue);
		this.clausesFalse.push(clauseFalse);
		this.clauseLiterals.push(Object.freeze([...literalSet]));
		this.updateWatches(clauseIndex);
		return clauseIndex;
	}

	private updateWatches(clauseIndex: ClauseID) {
		const clauseTrue = this.clausesTrue[clauseIndex];
		const clauseFalse = this.clausesFalse[clauseIndex];
		const unfalsifiedTerms = (clauseTrue & ~this.assignedFalse) | (clauseFalse & ~this.assignedTrue);

		const unfalsifiedBitTermA = leastSignificantBit(unfalsifiedTerms);

		const termA = bitIndex(unfalsifiedBitTermA);
		if (termA > 0) {
			if (clauseTrue & unfalsifiedBitTermA) {
				this.watchingTrue[termA].add(clauseIndex);
			} else {
				this.watchingFalse[termA].add(clauseIndex);
			}

			const unfalsifiedTermsExceptA = unfalsifiedTerms & ~unfalsifiedBitTermA;
			const unfalsifiedBitTermB = leastSignificantBit(unfalsifiedTermsExceptA);
			const termB = bitIndex(unfalsifiedBitTermB);
			if (termB > 0) {
				if (clauseTrue & unfalsifiedBitTermB) {
					this.watchingTrue[termB].add(clauseIndex);
				} else {
					this.watchingFalse[termB].add(clauseIndex);
				}
			}
		}
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
