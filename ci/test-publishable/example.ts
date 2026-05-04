import * as sat from "@curtisf/sat-solver";

const example: sat.SATSolver = sat.emptySolver();
example.addClause([1, 2]);
example.addClause([1, 3]);
example.addClause([-1]);

const solution: "unsatisfiable" | sat.Literal[] = example.solve();
if (solution === "unsatisfiable") {
	throw new Error("expected satisfiable!");
}
const set = new Set(solution);
if (set.size !== 3) {
	throw new Error("expected 3 elements!");
} else if (!set.has(-1)) {
	throw new Error("expected -1!");
} else if (!set.has(2)) {
	throw new Error("expected 2!");
} else if (!set.has(3)) {
	throw new Error("expected 3!");
}
