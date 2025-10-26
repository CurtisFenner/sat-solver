/**
 * `Literal` represents a Boolean literal. A `Literal` is a non-zero integer.
 *
 * The positive integer `a` is satisfied by an assignment of `true` to variable
 * `a`; a negative integer `-b` is satisfied by an assignment of `false` to
 * variable `b`.
 */
export type Literal = number;

/** `Term` represents a boolean variable.
 *
 * A `Term` is a strictly positive integer.
 *
 * A `term` has two associated literals:
 * * `term`, satisfied by an assignment of `true` to `term`
 * * `-term`, satisfied by an assignment of `false` to `term`
 */
export type Term = number;

/**
 * Represents the result of sat-solving.
 * * `"unsatisfiable":` This instance has no satisfying boolean assignment
 * * `Literal[]`: A partial boolean assignment that satisfies this instance
 */
export type SATResult = "unsatisfiable" | Literal[];

export interface SATSolver {
	/// Initializes the internal data-structures for terms 1, 2, ..., `term`
	/// (if not already initialized).
	/// Terms must be initialized before being used in clauses passed to
	/// `addClause`.
	initTerms(term: number): void;

	/**
	 * @returns the current (partial) assignment stack as an array of `Literal`s
	 */
	getAssignment(): Literal[];

	/**
	 * `getAssignmentMap()` returns a mapping from terms to their assignments
	 * (`-1` is negative, `0` is unassigned, and `1` is positive).
	 *
	 * Note that because there is no term `0`, entry `[0]` is not-defined (and
	 * may not be a number).
	 */
	getAssignmentMap(): (-1 | 0 | 1)[];

	getAssignmentMapDefaulting(defaultingTo: boolean): Map<Term, boolean>;

	/**
	 * `simplifyClauses(clauses)` returns the given set of clauses "simplified"
	 * by the current assignment.
	 *
	 * Only unsatisfied clauses are returned, and only unrefuted literals in
	 * those clauses are included.
	 */
	simplifyClauses(clauses: Literal[][]): Literal[][];

	/**
	 * `fastPartialSolve()` partially solves this instance.
	 *
	 * `fastPartialSolve()` returns `"unsatisfiable"` if this instance has been
	 * refuted.
	 *
	 * Otherwise, it returns a partial assignment. If this instance is
	 * satisfiable, this partial assignment is necessarily a subset of any
	 * satisfying assignment.
	 *
	 * This method mutates this SATSolver instance to include new assignments,
	 * but does not increase the decision level.
	 *
	 * **Requires** that the current decision level is zero.
	 */
	fastPartialSolve(): SATResult;

	/**
	 * `solve()` searches for a satisfying assignment (given the current
	 * partial assignment).
	 *
	 * @returns a satisfying partial assignment (as a set of literals), or
	 * `"unsatisfiable"` when the solver has proven that this instance has no
	 * satisfying assignment which contains the partial assignment the solver
	 * had at the time `solve()` was invoked.
	 *
	 * **Requires** that the current decision level is 0.
	 */
	solve(): SATResult;

	/**
	 * Modifies this CNF-SAT instance to include a new clause.
	 *
	 * A formula is satisfied when all of its clauses are satisfied.
	 *
	 * A clause is satisfied when at least one of its literals is satisfied.
	 *
	 * @param unprocessedClause is interpreted as a disjunction ("or") of the
	 * literals it contains
	 */
	addClause(unprocessedClause: Literal[]): void;

	rollbackToDecisionLevel(level: number): void;
};
