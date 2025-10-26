import * as satShiru from "./sat-shiru.js";
import * as satTests from "./sat-tests.js";
import * as test from "./test.js";

const testRunner = new test.TestRunner([]);

testRunner.runTests("ShiruSATSolver", satTests.tests(() => new satShiru.ShiruSATSolver()));

const passed = testRunner.runs.filter(x => x.type == "pass");
const failed: test.FailRun[] = testRunner.runs.filter(x => x.type == "fail");

for (const pass of passed) {
	console.log(`  pass  ${pass.name} (${pass.elapsedMillis.toFixed(0)} ms)`);
}

for (const failure of failed) {
	console.log("\u{25be}".repeat(80));
	console.log(`  FAIL! ${failure.name} (${failure.elapsedMillis.toFixed(0)} ms)`);
	const indent = "      ";
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
	console.log("\u{25b4}".repeat(80));
}

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
