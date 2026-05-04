import type * as sat from "./sat\.ts";
import { assert } from "./test.ts";

class Arithmetic {
	private count = 0;

	bitZero: number;
	bitOne: number;

	solution: Map<number, 0 | 1> | null = null;

	private sat: sat.SATSolver;
	constructor(sat: sat.SATSolver) {
		this.sat = sat;

		const bits = this.vector(2);
		this.bitZero = bits[0];
		this.bitOne = bits[1];
		this.constrainEqToConstant([this.bitZero], 0);
		this.constrainEqToConstant([this.bitOne], 1);
	}

	solve(): sat.Literal[] | "unsatisfiable" {
		const solution = this.sat.solve();
		if (solution === "unsatisfiable") {
			return "unsatisfiable";
		}
		this.solution = new Map();
		for (const literal of solution) {
			this.solution.set(Math.abs(literal), literal > 0 ? 1 : 0);
		}
		return solution;
	}

	readInt(v: number[]): number {
		const solution = this.solution;
		if (!solution) {
			throw new Error("readInt: call solve() first");
		}

		const bits = [];
		for (let i = v.length - 1; i >= 0; i--) {
			bits.push(solution.get(v[i]));
		}
		return parseInt(bits.join(""), 2);
	}

	vector(n: number): sat.Term[] {
		this.count += n;
		let out = [];
		for (let i = 0; i < n; i++) {
			out.push(this.count - i);
		}
		return out;
	}

	/**
	 * Constrains the integer variable to be equal to the given on-negative
	 * integer (modulo the bit-width of `a`).
	 *
	 * @param a is a fixed-width unsigned integer, with less-significant-bits
	 *          occurring first in the array
	 */
	constrainEqToConstant(a: sat.Literal[], v: number | bigint): void {
		if (v < 0n) {
			throw new Error("Arithmetic.constrainEqToConstant: v must be non-negative");
		}
		const binary = v.toString(2);
		for (let i = 0; i < a.length; i++) {
			const sign = binary[binary.length - 1 - i] === "1" ? 1 : -1;
			const clause = [sign * a[i]];
			this.sat.addClause(clause);
		}
	}

	/**
	 * Constrains the integer variable to be DISEQUAL to the given non-negative
	 * integer (modulo the bit-width of `a`).
	 *
	 * @param a is a fixed-width unsigned integer, with less-significant-bits
	 *          occurring first in the array
	 */
	constrainDisequalToConstant(a: number[], v: number | bigint): void {
		v = BigInt(v);
		if (v < 0n) {
			throw new Error("Arithmetic.constrainDisequalToConstant: v must be non-negative");
		}
		const binary = v.toString(2);
		const clause = [];
		for (let i = 0; i < a.length; i++) {
			const sign = binary[binary.length - 1 - i] === "1" ? 1 : -1;
			clause.push(-sign * a[i]);
		}
		this.sat.addClause(clause);
	}

	implies(supposeLiterals: number[], concludeLiteral: number): void {
		// (& supposeLiterals) => concludeLiteral
		// ~(& supposeLiterals) or concludeLiteral
		const clause = [concludeLiteral, ...supposeLiterals.map(x => -x)];
		this.sat.addClause(clause);
	}

	table(inputs: number[], outputs: number[], table: number[][]): void {
		for (const row of table) {
			const ant = [];
			for (let i = 0; i < inputs.length; i++) {
				const sign = row[i] ? 1 : -1;
				ant.push(inputs[i] * sign);
			}
			for (let o = 0; o < outputs.length; o++) {
				const sign = row[inputs.length + o] ? 1 : -1;
				this.implies(ant, outputs[o] * sign);
			}
		}
	}

	bitAdderEquation(a: number, b: number, cIn: number, s: number, cOut: number): void {
		this.table([a, b, cIn], [cOut, s], [
			[0, 0, 0, 0, 0],
			[0, 0, 1, 0, 1],
			[0, 1, 0, 0, 1],
			[0, 1, 1, 1, 0],
			[1, 0, 0, 0, 1],
			[1, 0, 1, 1, 0],
			[1, 1, 0, 1, 0],
			[1, 1, 1, 1, 1],
		]);
	}

	/**
	 * Adds an equation constraining `a + b = sum`, where `a`, `b`, and `sum`
	 * are interpreted as fixed-width integers, with less-significant-bits
	 * appearing earlier in their bit-arrays.
	 */
	constrainSum(a: sat.Literal[], b: sat.Literal[], sum: sat.Literal[]): void {
		if (a.length !== b.length || a.length !== sum.length) {
			throw new Error("Arithmetic.constrainSum: bit-width of a, b, and sum must be the same");
		}

		let carry = this.bitZero;
		for (let i = 0; i < a.length; i++) {
			const nextCarry = this.vector(1)[0];
			this.bitAdderEquation(a[i], b[i], carry, sum[i], nextCarry);
			carry = nextCarry;
		}
	}

	select(
		control: sat.Literal,
		ifZero: sat.Literal[],
		ifOne: sat.Literal[],
	): sat.Literal[] {
		if (ifZero.length !== ifOne.length) {
			throw new Error("select: bad");
		}

		const alloc = this.vector(ifZero.length);
		for (let i = 0; i < ifZero.length; i++) {
			this.sat.addClause([-control, -ifOne[i], alloc[i]]);
			this.sat.addClause([-control, ifOne[i], -alloc[i]]);

			this.sat.addClause([control, -ifZero[i], alloc[i]]);
			this.sat.addClause([control, ifZero[i], -alloc[i]]);
		}

		return alloc;
	}

	product(a: sat.Literal[], b: sat.Literal[]): sat.Literal[] {
		// Perform "cross multiplication": repeatedly shift `b >> i` and add
		// whenever `a[i]` is `1`.
		b = b.slice(0);
		const zeros = [];
		for (let i = 0; i < b.length; i++) {
			zeros.push(this.bitZero);
		}
		let partial: number[] = this.select(a[0], zeros, b);
		for (let i = 1; i < a.length; i++) {
			b = [this.bitZero, ...b.slice(0, b.length - 1)];
			const shift = this.select(a[i], zeros, b);
			const nextPartial = this.vector(b.length);
			this.constrainSum(partial, shift, nextPartial);
			partial = nextPartial;
		}
		return partial;
	}
}

export function differentialTest(p: {
	underTest: () => sat.SATSolver,
	oracle: () => sat.SATSolver,
}, instance: sat.Literal[][]) {
	const oracle = p.oracle();
	const underTest = p.underTest();
	for (const clause of instance) {
		oracle.addClause(clause);
		underTest.addClause(clause);
	}

	const t0 = performance.now();
	const oracleAnswer = oracle.solve();
	const t1 = performance.now();

	const underTestAnswer = underTest.solve();
	const t2 = performance.now();

	if (oracleAnswer === "unsatisfiable") {
		assert(underTestAnswer, "is equal to", oracleAnswer);
	} else {
		if (underTestAnswer === "unsatisfiable") {
			throw new Error("underTestAnswer should be satisfiable, but was " + JSON.stringify(underTestAnswer));
		}
		for (const literal of underTestAnswer) {
			assert(
				{
					literal,
					isInteger: Number.isSafeInteger(literal),
					allAppearancesOfTerm: underTestAnswer.filter(l => Math.abs(l) === Math.abs(literal)),
				},
				"is equal to",
				{
					literal,
					isInteger: true,
					allAppearancesOfTerm: [literal],
				},
			);
		}
		for (const clause of instance) {
			assert(
				{
					clause,
					isSatisfied: clause.some(literal => underTestAnswer.includes(literal)),
					assignment: underTestAnswer,
				},
				"is equal to",
				{
					clause,
					isSatisfied: true,
					assignment: underTestAnswer,
				},
			);
		}
	}
}

function factoringProblem(
	factory: () => sat.SATSolver,
	setup: {
		product: number,
		factorBits: number,
	},
): "prime" | [number, number] {
	const arithmetic = new Arithmetic(factory());

	const alpha = arithmetic.vector(2 * setup.factorBits);
	const beta = arithmetic.vector(2 * setup.factorBits);

	const product = arithmetic.product(alpha, beta);
	arithmetic.constrainEqToConstant(product, setup.product);

	// Only "half words".
	arithmetic.constrainEqToConstant(alpha.slice(setup.factorBits), 0);
	arithmetic.constrainEqToConstant(beta.slice(setup.factorBits), 0);

	arithmetic.constrainDisequalToConstant(alpha.slice(0, setup.factorBits), 1);
	arithmetic.constrainDisequalToConstant(beta.slice(0, setup.factorBits), 1);

	const solved = arithmetic.solve();
	if (solved === "unsatisfiable") {
		return "prime";
	}

	const factored = [
		arithmetic.readInt(alpha),
		arithmetic.readInt(beta)
	].sort((a, b) => a - b);

	assert(arithmetic.readInt(product), "is equal to", setup.product);
	assert(arithmetic.readInt(product), "is equal to", factored[0] * factored[1]);
	return factored as [number, number];
}

export function tests(factory: () => sat.SATSolver, settings: { skip?: RegExp | RegExp[] } = {}) {
	const testCases = {
		"simple-satisfiable"() {
			const sat = factory();
			const instance = [
				[+7, +4, +6],
				[+1, -7, +5],
				[-5, -2, +7],
				[-1, -6, +4],
				[+5, +4, -2],
				[-1, -9, +2],
				[-9, -4, -5],
				[+2, -8, -4],
				[-3, -7, +9],
				[-4, +2, +5],
			];

			for (let clause of instance) {
				sat.addClause(clause);
			}

			const model = sat.solve();
			assert(model, "is array");
			for (let clause of instance) {
				let satisfied = false;
				for (let literal of clause) {
					assert(model.indexOf(literal) < 0 || model.indexOf(-literal) < 0, "is equal to", true);
					satisfied = satisfied || model.indexOf(literal) >= 0;
				}
				assert(satisfied, "is equal to", true);
			}
		},
		"simple-unsatisfiable"() {
			const sat = factory();
			sat.addClause([+1, +2, -3]);
			sat.addClause([+1, -2, -3]);
			sat.addClause([-1, +2, -3]);
			sat.addClause([-1, -2, -3]);
			sat.addClause([+3]);

			const model = sat.solve();
			assert(model, "is equal to", "unsatisfiable");
		},
		"conflicting-unit-clauses"() {
			const sat = factory();
			sat.addClause([+1]);
			sat.addClause([-1]);
			const model = sat.solve();
			assert(model, "is equal to", "unsatisfiable");
		},
		"conflict-in-initial-unit-propagation"() {
			const sat = factory();

			// Initial unit propagation leads to a conflict.
			const instance = [
				[1, 2],
				[3],
				[4],
				[-2, -1, -4, -3],
				[5],
				[2, -1, -5, -4, -3],
				[-1, -5, -4, -3],
				[-2, 1, -5, -4, -3],
			];

			for (let clause of instance) {
				sat.addClause(clause);
			}

			const result = sat.solve();
			assert(result, "is equal to", "unsatisfiable");
		},
		"semiprime-20-bit-factoring"() {
			const factor1 = 811;
			const factor2 = 839;

			const result = factoringProblem(factory, {
				product: factor1 * factor2,
				factorBits: 10,
			});
			assert(result, "is equal to", [factor1, factor2]);
		},
		"semiprime-24-bit-factoring"() {
			const factor1 = 2243;
			const factor2 = 3943;

			const result = factoringProblem(factory, {
				product: factor1 * factor2,
				factorBits: 12,
			});
			assert(result, "is equal to", [factor1, factor2]);
		},
		// "semiprime-30-bit-factoring"() {
		// 	const factor1 = 25117;
		// 	const factor2 = 23879;

		// 	const result = factoringProblem(factory, {
		// 		product: factor1 * factor2,
		// 		factorBits: 15,
		// 	});
		// 	assert(result, "is equal to", [factor1, factor2]);
		// },
		// "semiprime-40-bit-factoring"() {
		// 	const factor1 = 578689;
		// 	const factor2 = 846851;

		// 	const result = factoringProblem(factory, {
		// 		product: factor1 * factor2,
		// 		factorBits: 20,
		// 	});
		// 	assert(result, "is equal to", [factor1, factor2]);
		// },
		"prime-testing"() {
			const result = factoringProblem(factory, {
				product: 7333,
				factorBits: 8,
			});
			assert(result, "is equal to", "prime");
		},
		"clauses-with-repeated-literals"() {
			// The solver must be able to tolerate clauses with repeated literals
			// and tautological clauses.
			const clauses = [
				[2, 3], [-4, 5], [16, 15, -14],
				[16, -18, -17], [-19, 16, -20], [4, 21],
				[23, 24], [-20, 25], [26, 27],
				[-20, 28], [-33, 14, 34], [34, -36, -35],
				[-37, 34, -38], [20, 39], [41, 42],
				[-38, 43], [38, 44], [20, 46],
				[48, 49], [-4, 50], [16, 15, -14],
				[16, -18, -17], [-19, 16, -20], [4, 51],
				[53, 54], [-20, 55], [56, 57],
				[-20, 58], [-33, 14, 34], [34, -36, -35],
				[-37, 34, -38], [20, 59], [61, 62],
				[-38, 63], [38, 64], [20, 66],
				[1], [-4, 6], [-4, 7],
				[-4, 8], [-4, 9], [-4, 10],
				[-4, 11], [-4, 12], [-4, 13],
				[6, 20, -4], [7, 20, -4], [8, 20, -4],
				[9, 20, -4], [10, 20, -4], [11, 20, -4],
				[12, 20, -4], [13, 20, -4], [6, 20, 20, -4],
				[7, 20, 20, -4], [8, 20, 20, -4], [9, 20, 20, -4],
				[29, 20, 20, -4], [30, 20, 20, -4], [31, 20, 20, -4],
				[32, 20, 20, -4], [60, 20, -4], [6, 20, -4],
				[7, 20, -4], [8, 20, -4], [9, 20, -4],
				[29, 20, -4], [30, 20, -4], [31, 20, -4],
				[32, 20, -4], [6, 20, 38, -4], [7, 20, 38, -4],
				[8, 20, 38, -4], [9, 20, 38, -4], [29, 20, 38, -4],
				[30, 20, 38, -4], [31, 20, 38, -4], [32, 20, 38, -4],
				[65, 20, -4], [4], [-67],
				[-50, 50, 1, -2, 3],
				[67, -53], [-22, -3, 53, 67], [-2, 22, 53, 67],
				[-47, -24, 53, 67], [-23, 47, 53, 67], [-40, -27, 53, 67],
				[-26, 40, 53, 67], [-45, -42, 53, 67], [-41, 45, 53, 67],
				[-52, -49, 53, 67], [-48, 52, 53, 67], [-60, -57, 53, 67],
				[-56, 60, 53, 67], [-65, -62, 53, 67], [-61, 65, 53, 67],
				[-55, -20, 53],
			];

			const sat = factory();
			for (const clause of clauses) {
				sat.addClause(clause);
			}

			const solution = sat.solve();
			assert(Array.isArray(solution), "is equal to", true);
		},
		"unknown-crash"() {
			const clauses = [
				// First, make a free decision of +1.
				// Then, make a free decision of +2.
				// Assignment stack is now [+1, +2].
				[-2, -21],
				[-2, 21],
				// Learn clause [-2] as a result of the above conflict.
				// Rollback.
				// NOTE: you must rollback to decision level 0, NOT 1,
				// since this new learned clause is a unit clause in level 0.
				// Now propagate using -2 as asserting literal.
				[2, -1, 20],
				[2, -1, -20],
				// Learn clause [-1] as a result of the above conflict.

				// Artificially boost the term weight of 1 so that it is the first
				// decision variable.
				[1, 11],
				[1, 12],
				[1, 13],
				[1, 14],
				[1, 15],
				[1, 16],
				[2, 17],
				[2, 18],
				[2, 19],
			];

			const sat = factory();
			for (const clause of clauses) {
				sat.addClause(clause);
			}

			const solution = sat.solve();
			assert(Array.isArray(solution), "is equal to", true);
		},
	};

	return Object.fromEntries(
		Object.entries(testCases)
			.filter(([key]) => {
				if (!settings.skip) {
					return true;
				}
				return Array.isArray(settings.skip)
					? settings.skip.every(skip => !skip.test(key))
					: !settings.skip.test(key);
			}),
	);
}

function randomLiteralForTerm(n: number): number {
	return Math.random() < 0.5 ? -n : +n;
}

function random3CNFInstance({ numTerms, numClauses }: { numTerms: number, numClauses: number }) {
	if (numTerms !== numTerms || numTerms < 4) {
		throw new Error("invalid numTerms");
	} else if (numClauses !== numClauses || numClauses < 1) {
		throw new Error("invalid numClauses");
	}

	const clauses = [];
	for (let i = 0; i < numClauses; i++) {
		let a = Math.floor(Math.random() * numTerms);
		let b = a;
		while (b == a) b = Math.floor(Math.random() * numTerms);
		let c = b;
		while (c == a || c == b) c = Math.floor(Math.random() * numTerms);

		const clause = [
			randomLiteralForTerm(a + 1),
			randomLiteralForTerm(b + 1),
			randomLiteralForTerm(c + 1),
		];
		clauses.push(clause);
	}

	return clauses;
}

function randomHard3SATInstance({ numTerms }: { numTerms: number }) {
	// The "satisfiability threshold" for 3-sat
	// (the ratio of clauses to variables where approximately 50% of random instances are satisfiable)
	// is approximately 4.3, with a lower bound of about 3.5.
	const ratio = 3.9 + Math.random() * 0.8;

	const numClauses = 1 + Math.floor(numTerms * ratio + 0.5);
	return random3CNFInstance({ numTerms, numClauses });
}

function instanceSize(instance: sat.Literal[][]): number {
	let size = 0;
	for (const clause of instance) {
		size += 1 + clause.length;
	}
	return size;
}

function instanceReductions(instance: sat.Literal[][]): sat.Literal[][][] {
	const reductions: sat.Literal[][][] = [];
	for (let clauseIndex = 0; clauseIndex < instance.length; clauseIndex++) {
		// Drop this clause
		const instanceWithDroppedClause = instance.slice();
		instanceWithDroppedClause.splice(clauseIndex, 1);
		reductions.push(instanceWithDroppedClause);

		// Drop each literal
		const clause = instance[clauseIndex];
		if (clause.length > 1) {
			for (let k = 0; k < clause.length; k++) {
				const copy = instance.slice();
				copy[clauseIndex] = clause.slice();
				copy[clauseIndex].splice(k, 1);
				reductions.push(copy);
			}
		}
	}
	return reductions.filter(x => x.length > 0);
}

function reduceTestcase<T>(
	testCase: (instance: T) => void,
	instances: {
		initial: T,
		reducer: (instance: T) => T[],
		sizer: (instance: T) => number,
		maximum: number,
	},
) {
	const failing: { instance: T, error: unknown }[] = [];

	let queue: T[] = [instances.initial];
	while (queue.length > 0) {
		const instance = queue.pop()!;
		try {
			testCase(instance);
		} catch (error) {
			failing.push({ instance, error });
			for (const reduction of instances.reducer(instance)) {
				queue.push(reduction);
			}
		}

		if (queue.length > instances.maximum) {
			queue = queue
				.sort((a, b) => instances.sizer(a) - instances.sizer(b))
				.slice(0, instances.maximum);
		}
	}


	const tuple = failing.sort((a, b) => instances.sizer(a.instance) - instances.sizer(b.instance))[0];
	if (tuple) {
		throw tuple.error;
	}
}

export function reducingTests(targets: {
	underTest: () => sat.SATSolver,
	oracle: () => sat.SATSolver,
	numTerms?: number,
}) {
	const instances: Record<string, sat.Literal[][]> = {
		// Manually reduced cases
		"pure-literal-optimization-must-consider-unit-clauses-too": [
			[1],
			[-1, -2],
		],
		basic: [
			[1],
			[-2, 4],
			[3, -4, -1],
			[-3, -4],
			[4, 2],
		],
		larger: [
			[3, -1],
			[-1, -3],
			[-4],
			[-2],
			[-5, 4, 2],
			[-6, 5, 1],
			[1, 6],
		],
	};

	// Randomly generated cases
	for (let numTerms = 4; numTerms < (targets.numTerms ?? 80); numTerms++) {
		const instance = randomHard3SATInstance({ numTerms });
		const name = `numTerms=${numTerms}, numClauses=${instance.length}`;
		instances[name] = instance;
	}

	const cases: Record<string, () => void> = {};
	for (const [name, instance] of Object.entries(instances)) {
		cases[name] = () => {
			reduceTestcase(instance => {
				try {
					differentialTest(targets, instance);
				} catch (err) {
					console.log("failing instance:\n" + JSON.stringify(instance));
					throw err;
				}
			}, {
				initial: instance,
				reducer: instanceReductions,
				sizer: instanceSize,
				maximum: 100,
			});
		}
	}
	return cases;
}
