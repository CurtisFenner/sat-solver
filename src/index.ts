import { ShiruSATSolver } from "./sat-shiru.ts";
import type { SATSolver } from "./sat.ts";

export type { SATSolver, Literal, Term } from "./sat.ts";

export function emptySolver(): SATSolver {
	return new ShiruSATSolver();
}
