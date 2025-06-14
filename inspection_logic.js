// inspection_logic.js
import * as db from './db.js';
// TIME_SLOT_CONFIG를 직접 가져오거나, 필요한 categoryKey 목록을 다른 방식으로 관리해야 함.
// schedule_generation_logic.js에서 export 가능하다면 그것을 사용.
// 여기서는 schedule_generation_logic.js에서 TIME_SLOT_CONFIG와 CORE_CATEGORIES를 export했다고 가정.
// 만약 export 되어있지 않다면, 이 파일 내에 직접 정의하거나, 필요한 부분만 가져와야 함.
// 우선, schedule_generation_logic.js에서 TIME_SLOT_CONFIG, CORE_CATEGORIES가 export 되었다고 가정하고 import.
// 실제로는 해당 파일에서 export const TIME_SLOT_CONFIG = ...; export const CORE_CATEGORIES = ...; 필요.
// 이번 subtask에서는 이들이 global scope에 있거나, 혹은 이 파일 내에 복사되었다고 가정하고 진행 (실제로는 import 필요)

// 임시로 inspection_logic.js 내에 TIME_SLOT_CONFIG와 CORE_CATEGORIES 정의 (원래는 schedule_generation_logic.js에서 가져와야 함)
const TIME_SLOT_CONFIG = {
    'Mon': [{ time: '06:00', type: 'elementary', sequential: true, categoryKey: 'elementary_6am' }],
    'Tue': [{ time: '19:30', type: 'elementary', random: true, categoryKey: 'elementary_random' }], // Changed from 17:00
    'Wed': [{ time: '06:00', type: 'elementary', sequential: true, categoryKey: 'elementary_6am' }],
    'Thu': [{ time: '19:30', type: 'elementary', random: true, categoryKey: 'elementary_random' }], // Changed from 17:00
    'Fri': [{ time: '06:00', type: 'elementary', sequential: true, categoryKey: 'elementary_6am' }],
    'Sat': [
        { time: '10:00', type: 'elementary', random: true, categoryKey: 'elementary_random' }, // Added
        { time: '16:00', type: 'elementary', random: true, categoryKey: 'elementary_random' },
        { time: '18:00', type: 'middle', random: true, categoryKey: 'middle_random' }
    ],
    'Sun': [{ time: '07:00', type: 'middle', sequential: true, categoryKey: 'middle_7am' }, { time: '09:00', type: 'middle', random: true, categoryKey: 'middle_random' }, { time: '11:00', type: 'middle', random: true, categoryKey: 'middle_random' }, { time: '18:00', type: 'middle', random: true, categoryKey: 'middle_random' }]
};
const CORE_CATEGORIES = { // schedule_generation_logic.js와 동일하게 정의
    elementary: 'elementary_6am',
    middle: 'middle_7am'
};


function getAllCategoryKeys() {
    const keys = new Set();
    Object.values(TIME_SLOT_CONFIG).flat().forEach(slot => {
        if (slot.categoryKey) keys.add(slot.categoryKey);
    });
    // Add known fallback keys if they are distinct categories
    keys.add('elementary_random_fallback');
    keys.add('middle_random_fallback');
    keys.add('elementary_vacation_10am'); // Explicitly add vacation category key
    return Array.from(keys);
}

export async function analyzeScheduleForInspection(year, month) {
    let prevInspectionYear = year;
    let prevInspectionMonth = month - 1;
    if (prevInspectionMonth === 0) {
        prevInspectionMonth = 12;
        prevInspectionYear--;
    }

    let prevMonthAbsentees = [];
    try {
        prevMonthAbsentees = await db.getAbsenteesForMonth(prevInspectionYear, prevInspectionMonth);
    } catch (error) {
        console.error(`Error fetching previous month absentees for inspection of ${year}-${month}:`, error);
        // prevMonthAbsentees will remain empty, modal can still display schedule analysis
    }

    const scheduleObject = await db.getSchedule(year, month);
    const participants = await db.getAllParticipants();

    if (!participants || participants.length === 0) {
        return {
            error: "참가자 정보가 없습니다.",
            analysis: []
        };
    }

    const participantsMap = new Map();
    participants.forEach(p => participantsMap.set(p.id, p.name));

    const allCategoryKeys = getAllCategoryKeys();
    const inspectionAnalysis = new Map();

    participants.forEach(p => {
        const assignmentsByCategory = new Map();
        allCategoryKeys.forEach(key => {
            assignmentsByCategory.set(key, { count: 0, fixedCount: 0 });
        });
        inspectionAnalysis.set(p.id, {
            participantId: p.id,
            participantName: p.name,
            participantType: p.type, // <-- ADDED
            totalAssignments: 0,
            assignmentsByCategory
        });
    });

    if (!scheduleObject || !scheduleObject.data || scheduleObject.data.length === 0) {
        // 일정이 없어도 참가자 목록과 0회 배정으로 결과 반환 (Aggregated categories for consistency)
        for (const participantAnalysis of inspectionAnalysis.values()) {
            participantAnalysis.aggregatedByCategory = new Map();
            participantAnalysis.aggregatedByCategory.set('새벽', { count: 0, fixedCount: 0 });
            participantAnalysis.aggregatedByCategory.set('1차랜덤', { count: 0, fixedCount: 0 });
            participantAnalysis.aggregatedByCategory.set('2차랜덤', { count: 0, fixedCount: 0 });
        }
        const resultForNoSchedule = Array.from(inspectionAnalysis.values());
        resultForNoSchedule.sort((a, b) => {
            // Primary sort: participantType ('초등' then '중등')
            if (a.participantType === '초등' && b.participantType === '중등') {
                return -1;
            }
            if (a.participantType === '중등' && b.participantType === '초등') {
                return 1;
            }

            // Secondary sort: totalAssignments (descending) - will be 0 for this case
            if (b.totalAssignments !== a.totalAssignments) {
                return b.totalAssignments - a.totalAssignments;
            }

            // Tertiary sort: participantName (ascending)
            return a.participantName.localeCompare(b.participantName);
        });
        const newAggregatedCategoryKeys = ['새벽', '1차랜덤', '2차랜덤'];
        return {
            message: "해당 월에 생성된 일정이 없습니다.",
            analysis: resultForNoSchedule,
            uniqueCategoryKeys: newAggregatedCategoryKeys,
            prevMonthAbsentees // Include here as well
        };
    }

    const scheduleData = scheduleObject.data;

    scheduleData.forEach(daySchedule => {
        if (daySchedule.timeSlots) {
            daySchedule.timeSlots.forEach(slot => {
                if (slot.assigned && slot.categoryKey) { // categoryKey가 있는 슬롯만 분석
                    slot.assigned.forEach((participantId, index) => {
                        if (inspectionAnalysis.has(participantId)) {
                            const participantAnalysis = inspectionAnalysis.get(participantId);
                            participantAnalysis.totalAssignments++;

                            const categoryStats = participantAnalysis.assignmentsByCategory.get(slot.categoryKey);
                            if (categoryStats) { // Should always be true due to initialization
                                categoryStats.count++;
                                if (slot.isFixedStatus && slot.isFixedStatus[index] === true) {
                                    categoryStats.fixedCount++;
                                }
                            } else {
                                // This case should not happen if allCategoryKeys is comprehensive
                                console.warn(`Category key ${slot.categoryKey} not pre-initialized for participant ${participantId}`);
                                // participantAnalysis.assignmentsByCategory.set(slot.categoryKey, { count: 1, fixedCount: (slot.isFixedStatus && slot.isFixedStatus[index] === true ? 1 : 0) });
                            }
                        }
                    });
                }
            });
        }
    });

    const finalAnalysis = Array.from(inspectionAnalysis.values());
    finalAnalysis.sort((a, b) => {
        // Primary sort: participantType ('초등' then '중등')
        if (a.participantType === '초등' && b.participantType === '중등') {
            return -1; // '초등' comes before '중등'
        }
        if (a.participantType === '중등' && b.participantType === '초등') {
            return 1;  // '중등' comes after '초등'
        }

        // Secondary sort: totalAssignments (descending)
        // This applies if types are the same
        if (b.totalAssignments !== a.totalAssignments) {
            return b.totalAssignments - a.totalAssignments;
        }

        // Tertiary sort: participantName (ascending)
        return a.participantName.localeCompare(b.participantName);
    });

    // Calculate and store aggregated categories
    const el_6am = CORE_CATEGORIES.elementary;
    const mid_7am = CORE_CATEGORIES.middle;
    const el_rand = 'elementary_random';
    const mid_rand = 'middle_random';
    const el_fall = 'elementary_random_fallback';
    const mid_fall = 'middle_random_fallback';

    const explicitlyAggregatedKeys = new Set([el_6am, mid_7am, el_rand, mid_rand, el_fall, mid_fall]);

    for (const participantAnalysis of finalAnalysis) {
        participantAnalysis.aggregatedByCategory = new Map();

        const el_6am_data = participantAnalysis.assignmentsByCategory.get(el_6am) || { count: 0, fixedCount: 0 };
        const mid_7am_data = participantAnalysis.assignmentsByCategory.get(mid_7am) || { count: 0, fixedCount: 0 };
        const el_rand_data = participantAnalysis.assignmentsByCategory.get(el_rand) || { count: 0, fixedCount: 0 };
        const mid_rand_data = participantAnalysis.assignmentsByCategory.get(mid_rand) || { count: 0, fixedCount: 0 };
        const el_fall_data = participantAnalysis.assignmentsByCategory.get(el_fall) || { count: 0, fixedCount: 0 };
        const mid_fall_data = participantAnalysis.assignmentsByCategory.get(mid_fall) || { count: 0, fixedCount: 0 };

        participantAnalysis.aggregatedByCategory.set('새벽', {
            count: el_6am_data.count + mid_7am_data.count,
            fixedCount: el_6am_data.fixedCount + mid_7am_data.fixedCount
        });
        participantAnalysis.aggregatedByCategory.set('1차랜덤', {
            count: el_rand_data.count + mid_rand_data.count,
            fixedCount: el_rand_data.fixedCount + mid_rand_data.fixedCount
        });
        participantAnalysis.aggregatedByCategory.set('2차랜덤', {
            count: el_fall_data.count + mid_fall_data.count,
            fixedCount: el_fall_data.fixedCount + mid_fall_data.fixedCount
        });

        let otherCount = 0;
        let otherFixedCount = 0;
        for (const [categoryKey, stats] of participantAnalysis.assignmentsByCategory.entries()) {
            if (!explicitlyAggregatedKeys.has(categoryKey)) {
                otherCount += stats.count;
                otherFixedCount += stats.fixedCount;
            }
        }
        participantAnalysis.aggregatedByCategory.set('기타', { count: otherCount, fixedCount: otherFixedCount });
    }

    const newAggregatedCategoryKeys = ['새벽', '1차랜덤', '2차랜덤', '기타'];

    return {
        analysis: finalAnalysis,
        uniqueCategoryKeys: newAggregatedCategoryKeys,
        prevMonthAbsentees
    };
}
