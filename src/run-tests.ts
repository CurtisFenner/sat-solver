import * as bigSat from "./big-sat.ts";
import * as satShiru from "./sat-shiru.ts";
import * as satTests from "./sat-tests.ts";
import * as test from "./test.ts";

import * as util from "node:util";

const testRunner = new class extends test.TestRunner {
	protected override beforeStart(test: { name: string; }): void {
		console.log(util.styleText(["bgWhite", "black", "bold"], `test ${test.name}...`));
	}
	protected override afterFinish(test: { name: string }, run: test.Run): void {
		printRun(run);
	}
};

const CONSOLE_WIDTH = 120;

await testRunner.runSuites({
	ShiruSATSolver: satTests.tests(() => new satShiru.ShiruSATSolver()),
	BigSATSolver: satTests.tests(() => new bigSat.BigSATSolver(), {
		// These tests are too slow!
		skip: /prime/,
	}),
	reducingTests: satTests.reducingTests({
		underTest: () => new bigSat.BigSATSolver(),
		oracle: () => new satShiru.ShiruSATSolver(),
	}),
});

const passed = testRunner.runs.filter(x => x.type == "pass");
const failed: test.FailRun[] = testRunner.runs.filter(x => x.type == "fail");

function printRun(run: test.Run): void {
	if (run.type === "fail") {
		console.log(util.styleText(["bgRed", "bold"], `  FAIL! ${run.name} (${run.elapsedMillis.toFixed(0)} ms)`));
	} else {
		console.log(util.styleText(["bgWhite", "black", "bold"], `  pass  ${run.name} (${run.elapsedMillis.toFixed(0)} ms)`));
	}
}

if (passed.length !== 0) {
	console.log("");
	console.log(util.styleText(["bgWhite", "black", "bold"], "-- Passed: ".padEnd(CONSOLE_WIDTH, "-")));
}
for (const pass of passed) {
	printRun(pass);
}

if (failed.length !== 0) {
	console.log("");
	console.log(util.styleText(["bgRed", "bold"], "-- Failed: ".padEnd(CONSOLE_WIDTH, "-")));
}
for (const failure of failed) {
	console.log("");
	printRun(failure);
	const indent = util.styleText(["bgRed"], "      ");
	let exception: string;
	if (failure.exception instanceof Error) {
		exception = failure.exception.stack + "";
	} else {
		exception = failure.exception + "";
	}
	if (failure.exception.constructor && failure.exception.constructor.name) {
		exception = `(${failure.exception.constructor.name}) ${exception}`;
	}
	console.log(indent + exception.replace(/\t/g, "    ").replace(/\n/g, "\n" + indent));
	console.log("");
}

console.log("-".repeat(CONSOLE_WIDTH));
console.log("");
console.log("Passed: " + passed.length + ".");
console.log("Failed: " + failed.length + (failed.length == 0 ? "." : "!"));

if (testRunner.runs.length !== 0) {
	let slowest = testRunner.runs[0];
	for (let i = 1; i < testRunner.runs.length; i++) {
		if (testRunner.runs[i].elapsedMillis > slowest.elapsedMillis) {
			slowest = testRunner.runs[i];
		}
	}
	console.log(`Slowest: ${slowest.name} took ${slowest.elapsedMillis.toFixed(0)} ms`);
}

process.exitCode = (failed.length !== 0 || passed.length === 0)
	? 1
	: 0;
