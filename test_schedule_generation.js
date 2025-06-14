import { generateSchedule } from './schedule_generation_logic.js';
import { __setMockData, __clearMockData } from './db.js';

// Define constants used in tests if not exported from module
const CORE_SLOT_ELEMENTARY = 'elementary_6am';
const CORE_SLOT_MIDDLE = 'middle_7am';

// Helper function for assertions (basic)
function assertEquals(expected, actual, message) {
    // Using JSON.stringify for simple comparison of objects/arrays, consider deep-equal library for more robustness
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
        console.error(`FAIL: ${message}. Expected: ${JSON.stringify(expected)}, Actual: ${JSON.stringify(actual)}`);
        return false;
    }
    console.log(`INFO: assertEquals check passed for: ${message}`);
    return true;
}
function assertTrue(actual, message) {
    if (!actual) {
        console.error(`FAIL: ${message}. Expected true, got false.`);
        return false;
    }
    console.log(`INFO: assertTrue check passed for: ${message}`);
    return true;
}

async function testCoreAbsentees() {
    console.log("Running Test Case 1: Core Assignment for Absentees...");
    let passed = true;
    const testYear = 2024;
    const testMonth = 7; // July

    const mockParticipants = [
        { id: 1, name: "엘리멘트결석1", type: "초등", gender: "남", isActive: true, groups: ["groupA"] },
        { id: 2, name: "미들아비결석1", type: "중등", gender: "여", isActive: true, groups: ["groupB"] },
        { id: 3, name: "엘리멘트일반1", type: "초등", gender: "여", isActive: true, groups: ["groupA"] },
        { id: 4, name: "엘리멘트일반2", type: "초등", gender: "남", isActive: true, groups: ["groupA"] },
        { id: 5, name: "엘리멘트일반3", type: "초등", gender: "여", isActive: true, groups: ["groupC"] },
        { id: 6, name: "미들일반1", type: "중등", gender: "남", isActive: true, groups: ["groupB"] },
        { id: 7, name: "미들일반2", type: "중등", gender: "여", isActive: true, groups: ["groupB"] },
        { id: 8, name: "미들일반3", type: "중등", gender: "남", isActive: true, groups: ["groupD"], copyType: "소복사" },
        { id: 9, name: "엘리멘트소복사1", type: "초등", gender: "여", isActive: true, groups: ["groupE"], copyType: "소복사"},
        { id: 10, name: "미들소복사2", type: "중등", gender: "남", isActive: true, groups: ["groupF"], copyType: "소복사"}
    ];
    const mockPrevAbsentees = [1, 2];
    const mockPrevAssignments = new Map();

    global.sessionStorage = {
        getItem: function(key) { return null; },
        setItem: function(key, value) {},
        removeItem: function(key){},
        clear: function(){}
    };

    try {
        __setMockData(mockParticipants, mockPrevAssignments, mockPrevAbsentees);

        const result = await generateSchedule(testYear, testMonth);
        const { schedule, assignmentSummary, assignmentCounts } = result;

        console.log("Generated Schedule (first 3 days for brevity):", JSON.stringify(schedule.slice(0,3), null, 2));
        const relevantAssignmentCounts = Array.from(assignmentCounts.entries())
            .filter(([pId]) => mockPrevAbsentees.includes(pId) || pId <= 7)
            .map(([pId, counts]) => {
                const participant = mockParticipants.find(p=>p.id === pId);
                return {
                    pId,
                    name: participant ? participant.name : 'Unknown',
                    total: counts.get('total'),
                    [CORE_SLOT_ELEMENTARY]: counts.get(CORE_SLOT_ELEMENTARY) || 0,
                    [CORE_SLOT_MIDDLE]: counts.get(CORE_SLOT_MIDDLE) || 0
                };
            });
        console.log("Assignment Counts (Absentees and first few Regulars):", relevantAssignmentCounts);

        // Assertions for absentee 1 (Elementary)
        const absentee1Counts = assignmentCounts.get(1);
        if (!assertTrue(absentee1Counts !== undefined, "Absentee 1 should have assignment counts.")) {
            passed = false;
        } else {
            const absentee1CoreAssignments = absentee1Counts.get(CORE_SLOT_ELEMENTARY) || 0;
            // Check if they got AT LEAST 2 core assignments. Phase 1 aims for 2. Later phases might add more if possible.
            if (!assertTrue(absentee1CoreAssignments >= 2, `Absentee 1 (Elem) should have AT LEAST 2 core assignments in ${CORE_SLOT_ELEMENTARY}. Got: ${absentee1CoreAssignments}`)) passed = false;
            if (!assertTrue((absentee1Counts.get('total') || 0) >= absentee1CoreAssignments, "Absentee 1 total assignments should be >= core assignments in its category")) passed = false;
        }

        // Assertions for absentee 2 (Middle)
        const absentee2Counts = assignmentCounts.get(2);
        if (!assertTrue(absentee2Counts !== undefined, "Absentee 2 should have assignment counts.")) {
            passed = false;
        } else {
            const absentee2CoreAssignments = absentee2Counts.get(CORE_SLOT_MIDDLE) || 0;
            if (!assertTrue(absentee2CoreAssignments >= 2, `Absentee 2 (Mid) should have AT LEAST 2 core assignments in ${CORE_SLOT_MIDDLE}. Got: ${absentee2CoreAssignments}`)) passed = false;
            if (!assertTrue((absentee2Counts.get('total') || 0) >= absentee2CoreAssignments, "Absentee 2 total assignments should be >= core assignments in its category")) passed = false;
        }

        let absentee1Phase1TracedAssignments = [];
        let absentee2Phase1TracedAssignments = [];
        schedule.forEach(day => {
            day.timeSlots.forEach(slot => {
                if (slot.assigned.includes(1) && slot.categoryKey === CORE_SLOT_ELEMENTARY) {
                    if (absentee1Phase1TracedAssignments.length < 2) absentee1Phase1TracedAssignments.push({ date: day.date, slot });
                    if(slot.assigned.length !== 2) {
                        console.error(`FAIL: Absentee 1 not in a pair for a core slot on ${day.date} at ${slot.time}`);
                        passed = false;
                    }
                }
                if (slot.assigned.includes(2) && slot.categoryKey === CORE_SLOT_MIDDLE) {
                     if (absentee2Phase1TracedAssignments.length < 2) absentee2Phase1TracedAssignments.push({ date: day.date, slot });
                     if(slot.assigned.length !== 2) {
                        console.error(`FAIL: Absentee 2 not in a pair for a core slot on ${day.date} at ${slot.time}`);
                        passed = false;
                    }
                }
            });
        });

        if (absentee1Phase1TracedAssignments.length === 2) {
            const week1 = Math.floor((new Date(absentee1Phase1TracedAssignments[0].date).getDate() - 1) / 7);
            const week2 = Math.floor((new Date(absentee1Phase1TracedAssignments[1].date).getDate() - 1) / 7);
            if (absentee1Phase1TracedAssignments[0].date !== absentee1Phase1TracedAssignments[1].date) {
                 if (week1 === week2) {
                     console.warn(`WARN: Absentee 1 (Elem) first 2 core assignments are in the same week (Week ${week1}). This is acceptable if slot availability is constrained but ideally they are in different weeks.`);
                 } else {
                     console.log(`INFO: Absentee 1 (Elem) first 2 core assignments are in different weeks (Week ${week1}, Week ${week2}). Good.`);
                 }
            } else {
                 console.warn(`WARN: Absentee 1 (Elem) first 2 core assignments are on the SAME DAY. This implies very limited slots or specific setup.`);
            }
        } else {
            // This might fail the >= 2 check above, this is just for more info.
            console.warn(`WARN: Absentee 1 (Elem) did not have exactly 2 core assignments traced for detailed weekly check. Found: ${absentee1Phase1TracedAssignments.length}. Count from summary: ${assignmentCounts.get(1)?.get(CORE_SLOT_ELEMENTARY) || 0}`);
        }

        if (absentee2Phase1TracedAssignments.length === 2) {
            const week1 = Math.floor((new Date(absentee2Phase1TracedAssignments[0].date).getDate() - 1) / 7);
            const week2 = Math.floor((new Date(absentee2Phase1TracedAssignments[1].date).getDate() - 1) / 7);
             if (absentee2Phase1TracedAssignments[0].date !== absentee2Phase1TracedAssignments[1].date) {
                if (week1 === week2) {
                    console.warn(`WARN: Absentee 2 (Mid) first 2 core assignments are in the same week (Week ${week1}). Acceptable if constrained.`);
                } else {
                    console.log(`INFO: Absentee 2 (Mid) first 2 core assignments are in different weeks (Week ${week1}, Week ${week2}). Good.`);
                }
            } else {
                 console.warn(`WARN: Absentee 2 (Mid) first 2 core assignments are on the SAME DAY.`);
            }
        } else {
            console.warn(`WARN: Absentee 2 (Mid) did not have exactly 2 core assignments traced for detailed weekly check. Found: ${absentee2Phase1TracedAssignments.length}. Count from summary: ${assignmentCounts.get(2)?.get(CORE_SLOT_MIDDLE) || 0}`);
        }

        if (passed) {
            console.log("PASS: Test Case 1 - Core Assignment for Absentees.");
        } else {
            console.error("FAIL: Test Case 1 - Core Assignment for Absentees. See errors above.");
        }

    } catch (error) {
        console.error("FAIL: Test Case 1 - Exception during test execution.", error);
        passed = false;
    } finally {
        __clearMockData();
        delete global.sessionStorage; // Clean up mock
    }
    return passed;
}

async function runTests() {
    let allTestsPassed = true;
    console.log("Starting test suite...");
    allTestsPassed = await testCoreAbsentees() && allTestsPassed;
    // Add more test case calls here
    // allTestsPassed = await testSomeOtherFeature() && allTestsPassed;

    console.log("--------------------");
    if (allTestsPassed) {
        console.log("All test cases passed!");
    } else {
        console.error("Some test cases failed.");
    }
    console.log("Test suite finished.");
}

runTests();
