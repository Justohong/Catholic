// Dynamically import generateSchedule from the modified file
import { generateSchedule } from './schedule_generation_logic.js';

async function runTest() {
  try {
    // The generateSchedule function will pick up the mock db.js via its own import statement.
    const result = await generateSchedule(2024, 7);
    // Output only the assignmentSummary string as required.
    process.stdout.write(result.assignmentSummary + '\n');
  } catch (error) {
    // Output error to stderr to avoid polluting stdout if something goes wrong.
    console.error("Error during test execution:", error);
    process.exit(1); // Exit with error code
  }
}

runTest();
