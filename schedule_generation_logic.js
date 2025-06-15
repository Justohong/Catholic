import * as db from './db.js';
import { isScheduleConfirmed } from './share_logic.js';

const TIME_SLOT_CONFIG = {
    'Mon': [{ time: '06:00', type: 'elementary', sequential: true, categoryKey: 'elementary_6am' }],
    'Tue': [{ time: '19:30', type: 'elementary', random: true, categoryKey: 'elementary_random' }],
    'Wed': [{ time: '06:00', type: 'elementary', sequential: true, categoryKey: 'elementary_6am' }],
    'Thu': [{ time: '19:30', type: 'elementary', random: true, categoryKey: 'elementary_random' }],
    'Fri': [{ time: '06:00', type: 'elementary', sequential: true, categoryKey: 'elementary_6am' }],
    'Sat': [{ time: '10:00', type: 'elementary', random: true, categoryKey: 'elementary_random' }, { time: '16:00', type: 'elementary', random: true, categoryKey: 'elementary_random' }, { time: '18:00', type: 'middle', random: true, categoryKey: 'middle_random' }],
    'Sun': [{ time: '07:00', type: 'middle', sequential: true, categoryKey: 'middle_7am' }, { time: '09:00', type: 'middle', random: true, categoryKey: 'middle_random' }, { time: '11:00', type: 'middle', random: true, categoryKey: 'middle_random' }, { time: '18:00', type: 'middle', random: true, categoryKey: 'middle_random' }]
};
const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CORE_CATEGORIES_LIST = ['elementary_6am', 'middle_7am'];

function getWeekOfMonth(date) {
  return Math.floor((date.getDate() - 1) / 7);
}

async function getParticipantsMap(participantsList) {
    const map = new Map();
    participantsList.forEach(p => map.set(p.id, p));
    return map;
}

function getEnglishParticipantType(participantType) {
    if (participantType === '초등') return 'elementary';
    if (participantType === '중등') return 'middle';
    return participantType;
}

function getEnhancedParticipantData(participant, slotInfo = null, prevMonthAssignmentCounts, currentMonthAssignmentCounts, coreCategoriesMap, calculatedPrevTotalCounts) {
    const participantId = participant.id;
    const prevCountsForParticipant = prevMonthAssignmentCounts.get(participantId) || new Map();
    let prevCategoryCount = 0;
    if (slotInfo?.categoryKey) {
        prevCategoryCount = prevCountsForParticipant.get(slotInfo.categoryKey) || 0;
    }
    const prevTotalCount = calculatedPrevTotalCounts.get(participantId) || 0;
    const currentCategoryCount = currentMonthAssignmentCounts.get(participantId)?.get(slotInfo?.categoryKey) || 0;
    let crossPreferenceScore = 0;
    if (slotInfo?.categoryKey) {
        const participantEngType = getEnglishParticipantType(participant.type);
        const coreCategoryForType = coreCategoriesMap[participantEngType];
        if (slotInfo.categoryKey === coreCategoryForType) {
            if ((prevCountsForParticipant.get(coreCategoryForType) || 0) > 0) crossPreferenceScore = -1;
        } else {
            if ((prevCountsForParticipant.get(coreCategoryForType) || 0) > 0) crossPreferenceScore = 1;
        }
    }
    return { id: participantId, gender: participant.gender, obj: participant, prevCategoryCount, prevTotalCount, currentCategoryCount, crossPreferenceScore };
}

function compareEnhancedParticipants(aData, bData, prioritizeZeroCurrentMonthTotal = false, assignmentCountsForSort = null, useRandomTieBreaker = false) {
    if (prioritizeZeroCurrentMonthTotal && assignmentCountsForSort) {
        const totalA = assignmentCountsForSort.get(aData.id)?.get('total') || 0;
        const totalB = assignmentCountsForSort.get(bData.id)?.get('total') || 0;
        if (totalA === 0 && totalB > 0) return -1;
        if (totalA > 0 && totalB === 0) return 1;
        if (useRandomTieBreaker) {
            if (totalA > 0 && totalB > 0) {
                if (totalA === 1 && totalB > 1) return -1;
                if (totalA > 1 && totalB === 1) return 1;
            }
        }
    }
    if (aData.prevCategoryCount !== bData.prevCategoryCount) return aData.prevCategoryCount - bData.prevCategoryCount;
    if (aData.crossPreferenceScore !== bData.crossPreferenceScore) return bData.crossPreferenceScore - aData.crossPreferenceScore;
    if (aData.prevTotalCount !== bData.prevTotalCount) return aData.prevTotalCount - bData.prevTotalCount;
    if (aData.currentCategoryCount !== bData.currentCategoryCount) return aData.currentCategoryCount - bData.currentCategoryCount;
    if (useRandomTieBreaker) return Math.random() - 0.5;
    return aData.id - bData.id;
}

function isPairingAllowed(p1_id, p2_id, participantsMap) {
    const p1_copyType = participantsMap.get(p1_id)?.copyType;
    const p2_copyType = participantsMap.get(p2_id)?.copyType;
    if (p1_copyType === '소복사' && p2_copyType === '소복사') {
        return false;
    }
    return true;
}

export async function generateSchedule(year, month) {
    // Add this block at the beginning
    const scheduleIsConfirmed = await isScheduleConfirmed(year, month);
    console.log(`[schedule_generation_logic.js] generateSchedule: isScheduleConfirmed returned: ${scheduleIsConfirmed} for ${year}-${month}`);
    if (scheduleIsConfirmed) {
        console.log(`[schedule_generation_logic.js] Schedule generation for ${year}-${month} BLOCKED because it is confirmed.`);
        // Throw a specific error or return an object that the UI layer can uniquely identify.
        // Using an error with a specific message is common.
        throw new Error(`SCHEDULE_CONFIRMED: ${year}년 ${month}월의 일정은 이미 확정되었습니다. 재생성할 수 없습니다.`);
    }
    console.log(`[schedule_generation_logic.js] Schedule generation for ${year}-${month} PROCEEDING.`);

    const MAX_ALLOWED_ASSIGNMENTS = 3;

    const vacationStartDateStr = sessionStorage.getItem('vacationStartDate');
    const vacationEndDateStr = sessionStorage.getItem('vacationEndDate');
    let vacationStartDate = null;
    let vacationEndDate = null;

    if (vacationStartDateStr && vacationEndDateStr) {
        vacationStartDate = new Date(vacationStartDateStr);
        vacationEndDate = new Date(vacationEndDateStr);
        if (vacationStartDate) vacationStartDate.setHours(0,0,0,0);
        if (vacationEndDate) vacationEndDate.setHours(0,0,0,0);
        const firstDayOfCurrentMonth = new Date(year, month - 1, 1);
        const lastDayOfCurrentMonth = new Date(year, month, 0);
        if (vacationEndDate < firstDayOfCurrentMonth || vacationStartDate > lastDayOfCurrentMonth) {
            vacationStartDate = null;
            vacationEndDate = null;
            // console.log("Vacation period is outside the current month.");
        } else {
            // console.log(`Vacation period found: ${vacationStartDateStr} to ${vacationEndDateStr}`);
        }
    }

    const participants = await db.getAllParticipants();
    if (!participants || participants.length === 0) throw new Error("기준정보에 등록된 인원이 없습니다.");
    for (const p of participants) {
        if (typeof p.gender === 'undefined' || !p.gender) throw new Error(`Participant ${p.name} (ID: ${p.id}) is missing gender information.`);
    }
    const participantsMap = await getParticipantsMap(participants);
    const prevMonthAssignmentCounts = await db.getPreviousMonthAssignmentCounts(year, month);
    const CORE_CATEGORIES_MAP = { elementary: 'elementary_6am', middle: 'middle_7am' };

    const calculatePrevTotalCount = (participantId) => {
        let total = 0; const counts = prevMonthAssignmentCounts.get(participantId);
        if (counts) { for (const count of counts.values()) total += count; } return total;
    };
    const calculatedPrevTotalCounts = new Map();
    participants.forEach(p => calculatedPrevTotalCounts.set(p.id, calculatePrevTotalCount(p.id)));
    const prevMonthDateForAbsenteeFetch = new Date(year, month - 1, 0);
    const prevMonthAbsenteesList = await db.getAbsenteesForMonth(prevMonthDateForAbsenteeFetch.getFullYear(), prevMonthDateForAbsenteeFetch.getMonth() + 1);
    const prevMonthAbsentees = new Set(prevMonthAbsenteesList);

    const daysInMonth = new Date(year, month, 0).getDate();
    const activeParticipants = participants.filter(p => p.isActive);

    let assignmentCounts = new Map();
    const uniqueCategoryKeys = new Set();
    Object.values(TIME_SLOT_CONFIG).flat().forEach(slot => { if (slot.categoryKey) uniqueCategoryKeys.add(slot.categoryKey); });
    uniqueCategoryKeys.add('elementary_random_fallback');
    uniqueCategoryKeys.add('middle_random_fallback');
    uniqueCategoryKeys.add('elementary_vacation_10am');
    participants.forEach(p => {
        const categoryMap = new Map(); uniqueCategoryKeys.forEach(key => categoryMap.set(key, 0));
        categoryMap.set('total', 0); assignmentCounts.set(p.id, categoryMap);
    });

    let participantWeeklyAssignments = new Map();
    activeParticipants.forEach(p => participantWeeklyAssignments.set(p.id, new Set()));

    let scheduleData = [];

    const coreSlotInstances = [];
    for (let day = 1; day <= daysInMonth; day++) {
        const currentDate = new Date(year, month - 1, day);
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayOfWeekShort = DAYS_OF_WEEK[currentDate.getDay()];
        const slotsForDay = TIME_SLOT_CONFIG[dayOfWeekShort] || [];
        for (const slotInfo of slotsForDay) {
            if (CORE_CATEGORIES_LIST.includes(slotInfo.categoryKey)) {
                coreSlotInstances.push({
                    date: dateStr,
                    dayOfWeek: dayOfWeekShort,
                    time: slotInfo.time,
                    type: slotInfo.type,
                    categoryKey: slotInfo.categoryKey,
                    originalSlotInfo: { ...slotInfo },
                    assigned: [],
                    assignedNames: ['미배정'],
                    isFixedStatus: [false, false]
                });
            }
        }
    }
    coreSlotInstances.sort((a, b) => {
        if (a.date < b.date) return -1;
        if (a.date > b.date) return 1;
        if (a.time < b.time) return -1;
        if (a.time > b.time) return 1;
        return 0;
    });

    const absenteesForCore = activeParticipants.filter(p => prevMonthAbsentees.has(p.id));
    const regularsForCore = activeParticipants.filter(p => !prevMonthAbsentees.has(p.id));

    const absenteeCoreAssignmentsCount = new Map();
    absenteesForCore.forEach(p => absenteeCoreAssignmentsCount.set(p.id, 0));

    const tempParticipantWeeklyAssignments = new Map();
    activeParticipants.forEach(p => tempParticipantWeeklyAssignments.set(p.id, new Set()));
    const tempDailyAssignments = new Map();

    console.log(`Starting Phase 1: Assigning previous month absentees (${absenteesForCore.length}) to 2 core slots each.`);
    for (const absentee of absenteesForCore) {
        let assignmentsMadeForThisAbsentee = absenteeCoreAssignmentsCount.get(absentee.id) || 0;
        if (assignmentsMadeForThisAbsentee >= 2) continue;

        for (const slot of coreSlotInstances) {
            // console.log(`Phase 1: Abs_Test: ${absentee.name} (ID ${absentee.id}), slot ${slot.categoryKey} on ${slot.date} ${slot.time}. CoreMade: ${assignmentsMadeForThisAbsentee}, TotalMade: ${(assignmentCounts.get(absentee.id)?.get('total') || 0)}`);
            if (assignmentsMadeForThisAbsentee >= 2) break;

            let skipReason = "";
            const absenteeEnglishType = getEnglishParticipantType(absentee.type);
            if (slot.assigned.length > 0) skipReason = "slot already assigned";
            else if (slot.type !== absenteeEnglishType) skipReason = `slot type (${slot.type}) !== absentee type (${absentee.type} -> ${absenteeEnglishType})`;

            if (skipReason) { /*console.log(`Phase 1: Abs_Test: SKIP slot for ${absentee.name} because: ${skipReason}`);*/ continue; }

            const slotDateObj = new Date(slot.date);
            const slotWeek = getWeekOfMonth(slotDateObj);

            if (tempDailyAssignments.get(slot.date)?.has(absentee.id)) skipReason = "absentee already assigned this day";
            else if (tempParticipantWeeklyAssignments.get(absentee.id)?.has(slotWeek)) skipReason = "absentee already assigned this week";

            const absenteeTotalAssignments = assignmentCounts.get(absentee.id)?.get('total') || 0;
            if (!skipReason && absenteeTotalAssignments >= MAX_ALLOWED_ASSIGNMENTS) skipReason = "absentee at MAX_ALLOWED_ASSIGNMENTS";
            else if (!skipReason && absenteeTotalAssignments >= 2 && (tempParticipantWeeklyAssignments.get(absentee.id)?.has(slotWeek) || participantWeeklyAssignments.get(absentee.id)?.has(slotWeek))) skipReason = "absentee has >=2 total and already assigned this week";

            if (skipReason) { /*console.log(`Phase 1: Abs_Test: SKIP slot for ${absentee.name} because: ${skipReason}`);*/ continue; }

            let partnerFound = null;
            // console.log(`Phase 1: Abs_Test: ${absentee.name} suitable for ${slot.date} ${slot.time}. Searching partner.`);

            for (const regular of regularsForCore) {
                let partnerSkipReason = "";
                const regularEnglishType = getEnglishParticipantType(regular.type);
                if (regular.id === absentee.id) partnerSkipReason = "is self";
                else if (regularEnglishType !== slot.type) partnerSkipReason = `partner type (${regular.type} -> ${regularEnglishType}) !== slot type (${slot.type})`;
                else if (tempDailyAssignments.get(slot.date)?.has(regular.id)) partnerSkipReason = "partner daily conflict";
                else if (tempParticipantWeeklyAssignments.get(regular.id)?.has(slotWeek)) partnerSkipReason = "partner weekly conflict";
                else if (!isPairingAllowed(absentee.id, regular.id, participantsMap)) partnerSkipReason = "pairing not allowed";
                else {
                    const regularTotalAssignments = assignmentCounts.get(regular.id)?.get('total') || 0;
                    if (regularTotalAssignments >= MAX_ALLOWED_ASSIGNMENTS) partnerSkipReason = "partner at MAX_ALLOWED_ASSIGNMENTS";
                    else if (regularTotalAssignments >= 2 && (tempParticipantWeeklyAssignments.get(regular.id)?.has(slotWeek) || participantWeeklyAssignments.get(regular.id)?.has(slotWeek))) partnerSkipReason = "partner has >=2 total and weekly conflict";
                }
                if (!partnerSkipReason) { partnerFound = regular; /*console.log(`Phase 1: Abs_Test: Found regular partner ${partnerFound.name} for ${absentee.name}`);*/ break; }
                // else { console.log(`Phase 1: Abs_Test: Regular ${regular.name} skipped for ${absentee.name} because: ${partnerSkipReason}`); }
            }
            if (!partnerFound) {
                // console.log(`Phase 1: Abs_Test: No regular partner for ${absentee.name}. Trying other absentees needing core.`);
                for (const otherAbsentee of absenteesForCore) {
                    let partnerSkipReason = "";
                    const otherAbsenteeEnglishType = getEnglishParticipantType(otherAbsentee.type);
                    if (otherAbsentee.id === absentee.id) partnerSkipReason = "is self";
                    else if ((absenteeCoreAssignmentsCount.get(otherAbsentee.id) || 0) >= 2) partnerSkipReason = "other absentee already has 2 core";
                    else if (otherAbsenteeEnglishType !== slot.type) partnerSkipReason = `partner type (${otherAbsentee.type} -> ${otherAbsenteeEnglishType}) !== slot type (${slot.type})`;
                    else if (tempDailyAssignments.get(slot.date)?.has(otherAbsentee.id)) partnerSkipReason = "partner daily conflict";
                    else if (tempParticipantWeeklyAssignments.get(otherAbsentee.id)?.has(slotWeek)) partnerSkipReason = "partner weekly conflict";
                    else if (!isPairingAllowed(absentee.id, otherAbsentee.id, participantsMap)) partnerSkipReason = "pairing not allowed";
                    else {
                        const otherAbsenteeTotalAssignments = assignmentCounts.get(otherAbsentee.id)?.get('total') || 0;
                        if (otherAbsenteeTotalAssignments >= MAX_ALLOWED_ASSIGNMENTS) partnerSkipReason = "partner at MAX_ALLOWED_ASSIGNMENTS";
                        else if (otherAbsenteeTotalAssignments >= 2 && (tempParticipantWeeklyAssignments.get(otherAbsentee.id)?.has(slotWeek) || participantWeeklyAssignments.get(otherAbsentee.id)?.has(slotWeek))) partnerSkipReason = "partner has >=2 total and weekly conflict";
                    }
                    if (!partnerSkipReason) { partnerFound = otherAbsentee; /*console.log(`Phase 1: Abs_Test: Found other absentee (needing core) partner ${partnerFound.name} for ${absentee.name}`);*/ break; }
                    // else { console.log(`Phase 1: Abs_Test: Other absentee (needing core) ${otherAbsentee.name} skipped for ${absentee.name} because: ${partnerSkipReason}`);}
                }
            }
            if (!partnerFound) {
                // console.log(`Phase 1: Abs_Test: No other absentee needing core for ${absentee.name}. Trying any other absentee (fallback).`);
                for (const otherAbsentee of absenteesForCore) {
                     let partnerSkipReason = "";
                    const otherAbsenteeEnglishTypeFallback = getEnglishParticipantType(otherAbsentee.type);
                    if (otherAbsentee.id === absentee.id) partnerSkipReason = "is self";
                    else if (otherAbsenteeEnglishTypeFallback !== slot.type) partnerSkipReason = `partner type (${otherAbsentee.type} -> ${otherAbsenteeEnglishTypeFallback}) !== slot type (${slot.type})`;
                    else if (tempDailyAssignments.get(slot.date)?.has(otherAbsentee.id)) partnerSkipReason = "partner daily conflict";
                    else if (tempParticipantWeeklyAssignments.get(otherAbsentee.id)?.has(slotWeek)) partnerSkipReason = "partner weekly conflict";
                    else if (!isPairingAllowed(absentee.id, otherAbsentee.id, participantsMap)) partnerSkipReason = "pairing not allowed";
                     else {
                        const otherAbsenteeTotalAssignments = assignmentCounts.get(otherAbsentee.id)?.get('total') || 0;
                        if (otherAbsenteeTotalAssignments >= MAX_ALLOWED_ASSIGNMENTS) partnerSkipReason = "partner at MAX_ALLOWED_ASSIGNMENTS";
                        else if (otherAbsenteeTotalAssignments >= 2 && (tempParticipantWeeklyAssignments.get(otherAbsentee.id)?.has(slotWeek) || participantWeeklyAssignments.get(otherAbsentee.id)?.has(slotWeek))) partnerSkipReason = "partner has >=2 total and weekly conflict";
                    }
                    if (!partnerSkipReason) { partnerFound = otherAbsentee; /*console.log(`Phase 1: Abs_Test: Found other absentee (fallback) partner ${partnerFound.name} for ${absentee.name}`);*/ break; }
                    // else { console.log(`Phase 1: Abs_Test: Other absentee (fallback) ${otherAbsentee.name} skipped for ${absentee.name} because: ${partnerSkipReason}`);}
                }
            }
            if (partnerFound) {
                // console.log(`Phase 1: Abs_Test: SUCCESS - Assigning ${absentee.name} and ${partnerFound.name} to slot ${slot.date} ${slot.time}`);
                slot.assigned = [absentee.id, partnerFound.id];
                slot.assignedNames = [participantsMap.get(absentee.id)?.name, participantsMap.get(partnerFound.id)?.name];
                const absenteeCounts = assignmentCounts.get(absentee.id);
                absenteeCounts.set(slot.categoryKey, (absenteeCounts.get(slot.categoryKey) || 0) + 1);
                absenteeCounts.set('total', (absenteeCounts.get('total') || 0) + 1);
                const partnerCounts = assignmentCounts.get(partnerFound.id);
                partnerCounts.set(slot.categoryKey, (partnerCounts.get(slot.categoryKey) || 0) + 1);
                partnerCounts.set('total', (partnerCounts.get('total') || 0) + 1);
                if (!tempDailyAssignments.has(slot.date)) tempDailyAssignments.set(slot.date, new Set());
                tempDailyAssignments.get(slot.date).add(absentee.id);
                tempDailyAssignments.get(slot.date).add(partnerFound.id);
                tempParticipantWeeklyAssignments.get(absentee.id).add(slotWeek);
                tempParticipantWeeklyAssignments.get(partnerFound.id).add(slotWeek);
                absenteeCoreAssignmentsCount.set(absentee.id, (absenteeCoreAssignmentsCount.get(absentee.id) || 0) + 1);
                assignmentsMadeForThisAbsentee++;
                if (prevMonthAbsentees.has(partnerFound.id)) {
                    absenteeCoreAssignmentsCount.set(partnerFound.id, (absenteeCoreAssignmentsCount.get(partnerFound.id) || 0) + 1);
                }
                // console.log(`Phase 1: Assigned ${participantsMap.get(absentee.id)?.name} and ${participantsMap.get(partnerFound.id)?.name} to ${slot.categoryKey} on ${slot.date} ${slot.time}`);
            }
        }
        if (assignmentsMadeForThisAbsentee < 2) {
            console.log(`Phase 1: Could only assign ${participantsMap.get(absentee.id)?.name} to ${assignmentsMadeForThisAbsentee} core slots.`);
        }
    }
    console.log("Finished Phase 1.");

    console.log("Starting Phase 2: Assigning selected regulars to remaining core slots.");
    const remainingUnfilledCoreSlots = coreSlotInstances.filter(s => s.assigned.length === 0);
    // console.log(`Phase 2: Found ${remainingUnfilledCoreSlots.length} remaining unfilled core slots.`);

    if (remainingUnfilledCoreSlots.length > 0) {
        const sortedRegularsForCore = [...regularsForCore].sort((pA, pB) => {
            const pAEnglishType = getEnglishParticipantType(pA.type);
            const pBEnglishType = getEnglishParticipantType(pB.type);
            const coreCategoryKeyA = pAEnglishType === 'elementary' ? CORE_CATEGORIES_MAP.elementary : CORE_CATEGORIES_MAP.middle;
            const coreCategoryKeyB = pBEnglishType === 'elementary' ? CORE_CATEGORIES_MAP.elementary : CORE_CATEGORIES_MAP.middle;
            
            // 이전 월 새벽 배정 횟수 비교
            const prevCoreCountA = prevMonthAssignmentCounts.get(pA.id)?.get(coreCategoryKeyA) || 0;
            const prevCoreCountB = prevMonthAssignmentCounts.get(pB.id)?.get(coreCategoryKeyB) || 0;
            
            // 현재 월 새벽 배정 횟수도 고려 (현재 월에 이미 배정된 경우 우선순위 낮춤)
            const currentCoreCountA = assignmentCounts.get(pA.id)?.get(coreCategoryKeyA) || 0;
            const currentCoreCountB = assignmentCounts.get(pB.id)?.get(coreCategoryKeyB) || 0;
            
            // 현재 월 배정과 이전 월 배정을 모두 고려한 총 점수 계산
            const totalScoreA = prevCoreCountA + (currentCoreCountA * 2); // 현재 월 배정은 가중치 2배
            const totalScoreB = prevCoreCountB + (currentCoreCountB * 2);
            
            // 총 점수가 다르면 점수가 낮은 사람 우선 (배정이 적은 사람)
            if (totalScoreA !== totalScoreB) return totalScoreA - totalScoreB;
            
            // 점수가 같으면 이전 월 전체 배정 횟수로 비교
            const prevTotalCountA = calculatedPrevTotalCounts.get(pA.id) || 0;
            const prevTotalCountB = calculatedPrevTotalCounts.get(pB.id) || 0;
            if (prevTotalCountA !== prevTotalCountB) return prevTotalCountA - prevTotalCountB;
            
            // 모두 같으면 랜덤 정렬
            return Math.random() - 0.5;
        });
        const numSlotsToFill = remainingUnfilledCoreSlots.length;
        let estimatedParticipantsNeeded = numSlotsToFill * 2;
        
        // 더 많은 참가자를 고려하도록 수정 (균등 배정 기회 증가)
        estimatedParticipantsNeeded = Math.min(estimatedParticipantsNeeded + Math.ceil(sortedRegularsForCore.length * 0.3), sortedRegularsForCore.length);
        
        let selectedRegularsList = sortedRegularsForCore.slice(0, estimatedParticipantsNeeded);
        
        // 랜덤 섞기 전에 현재 월 새벽 배정이 적은 순으로 정렬
        selectedRegularsList.sort((pA, pB) => {
            const pAEnglishType = getEnglishParticipantType(pA.type);
            const pBEnglishType = getEnglishParticipantType(pB.type);
            const coreCategoryKeyA = pAEnglishType === 'elementary' ? CORE_CATEGORIES_MAP.elementary : CORE_CATEGORIES_MAP.middle;
            const coreCategoryKeyB = pBEnglishType === 'elementary' ? CORE_CATEGORIES_MAP.elementary : CORE_CATEGORIES_MAP.middle;
            
            const currentCoreCountA = assignmentCounts.get(pA.id)?.get(coreCategoryKeyA) || 0;
            const currentCoreCountB = assignmentCounts.get(pB.id)?.get(coreCategoryKeyB) || 0;
            
            if (currentCoreCountA !== currentCoreCountB) return currentCoreCountA - currentCoreCountB;
            return Math.random() - 0.5;
        });
        
        let regularsAssignedInPhase2 = new Set();

        for (const slot of remainingUnfilledCoreSlots) {
            // console.log(`Phase 2: Reg_Test: Slot ${slot.categoryKey} on ${slot.date} ${slot.time}.`);
            if (slot.assigned.length > 0) continue;
            const slotDateObj = new Date(slot.date);
            const slotWeek = getWeekOfMonth(slotDateObj);
            let p1 = null, p2 = null;
            for (let i = 0; i < selectedRegularsList.length; i++) {
                const candidateP1 = selectedRegularsList[i];
                const candidateP1EnglishType = getEnglishParticipantType(candidateP1.type);
                let p1SkipReason = "";
                if (regularsAssignedInPhase2.has(candidateP1.id)) p1SkipReason = "already assigned in Phase 2";
                else if (candidateP1EnglishType !== slot.type) p1SkipReason = `type (${candidateP1.type} -> ${candidateP1EnglishType}) mismatch slot type (${slot.type})`;
                else if (tempDailyAssignments.get(slot.date)?.has(candidateP1.id)) p1SkipReason = "daily conflict";
                else if (tempParticipantWeeklyAssignments.get(candidateP1.id)?.has(slotWeek)) p1SkipReason = "weekly conflict";
                else {
                    const p1TotalAssignments = assignmentCounts.get(candidateP1.id)?.get('total') || 0;
                    if (p1TotalAssignments >= MAX_ALLOWED_ASSIGNMENTS) p1SkipReason = "at MAX_ALLOWED_ASSIGNMENTS";
                    else if (p1TotalAssignments >= 2 && (tempParticipantWeeklyAssignments.get(candidateP1.id)?.has(slotWeek) || participantWeeklyAssignments.get(candidateP1.id)?.has(slotWeek))) p1SkipReason = "has >=2 total and weekly conflict";
                }
                if (p1SkipReason) { /*console.log(`Phase 2: Reg_Test: P1 ${candidateP1.name} skipped for slot ${slot.date} because: ${p1SkipReason}`);*/ continue;}
                p1 = candidateP1;
                
                // 새벽 배정이 적은 순서로 파트너 후보 정렬
                const potentialP2List = selectedRegularsList.filter((p, idx) => {
                    if (idx === i) return false; // 자기 자신 제외
                    
                    const pEnglishType = getEnglishParticipantType(p.type);
                    if (pEnglishType !== slot.type) return false; // 타입 불일치 제외
                    
                    if (regularsAssignedInPhase2.has(p.id)) return false; // 이미 Phase 2에서 배정된 경우 제외
                    if (tempDailyAssignments.get(slot.date)?.has(p.id)) return false; // 해당 일에 이미 배정된 경우 제외
                    if (tempParticipantWeeklyAssignments.get(p.id)?.has(slotWeek)) return false; // 해당 주에 이미 배정된 경우 제외
                    
                    const pTotalAssignments = assignmentCounts.get(p.id)?.get('total') || 0;
                    if (pTotalAssignments >= MAX_ALLOWED_ASSIGNMENTS) return false; // 최대 배정 횟수 초과 제외
                    
                    if (pTotalAssignments >= 2 && 
                        (tempParticipantWeeklyAssignments.get(p.id)?.has(slotWeek) || 
                         participantWeeklyAssignments.get(p.id)?.has(slotWeek))) return false; // 주간 충돌 제외
                    
                    if (!isPairingAllowed(p1.id, p.id, participantsMap)) return false; // 페어링 불가 제외
                    
                    return true;
                });
                
                // 새벽 배정이 적은 순서로 정렬
                const sortedP2Candidates = potentialP2List.sort((pA, pB) => {
                    const pAEnglishType = getEnglishParticipantType(pA.type);
                    const pBEnglishType = getEnglishParticipantType(pB.type);
                    const coreCategoryKeyA = pAEnglishType === 'elementary' ? CORE_CATEGORIES_MAP.elementary : CORE_CATEGORIES_MAP.middle;
                    const coreCategoryKeyB = pBEnglishType === 'elementary' ? CORE_CATEGORIES_MAP.elementary : CORE_CATEGORIES_MAP.middle;
                    
                    // 현재 월 새벽 배정 횟수 비교
                    const currentCoreCountA = assignmentCounts.get(pA.id)?.get(coreCategoryKeyA) || 0;
                    const currentCoreCountB = assignmentCounts.get(pB.id)?.get(coreCategoryKeyB) || 0;
                    
                    if (currentCoreCountA !== currentCoreCountB) return currentCoreCountA - currentCoreCountB;
                    
                    // 이전 월 새벽 배정 횟수 비교
                    const prevCoreCountA = prevMonthAssignmentCounts.get(pA.id)?.get(coreCategoryKeyA) || 0;
                    const prevCoreCountB = prevMonthAssignmentCounts.get(pB.id)?.get(coreCategoryKeyB) || 0;
                    
                    if (prevCoreCountA !== prevCoreCountB) return prevCoreCountA - prevCoreCountB;
                    
                    // 총 배정 횟수 비교
                    const totalA = assignmentCounts.get(pA.id)?.get('total') || 0;
                    const totalB = assignmentCounts.get(pB.id)?.get('total') || 0;
                    
                    if (totalA !== totalB) return totalA - totalB;
                    
                    return Math.random() - 0.5;
                });
                
                // 정렬된 후보 중 첫 번째를 선택
                if (sortedP2Candidates.length > 0) {
                    p2 = sortedP2Candidates[0];
                    break;
                }
                
                if (!p2) p1 = null; // p2를 찾지 못했으면 p1도 초기화
            }
            if (p1 && p2) {
                // console.log(`Phase 2: Reg_Test: SUCCESS - Assigning regulars ${p1.name} and ${p2.name} to slot ${slot.date} ${slot.time}`);
                slot.assigned = [p1.id, p2.id];
                slot.assignedNames = [participantsMap.get(p1.id)?.name, participantsMap.get(p2.id)?.name];
                [p1.id, p2.id].forEach(pid => {
                    const counts = assignmentCounts.get(pid);
                    counts.set(slot.categoryKey, (counts.get(slot.categoryKey) || 0) + 1);
                    counts.set('total', (counts.get('total') || 0) + 1);
                });
                if (!tempDailyAssignments.has(slot.date)) tempDailyAssignments.set(slot.date, new Set());
                tempDailyAssignments.get(slot.date).add(p1.id);
                tempDailyAssignments.get(slot.date).add(p2.id);
                tempParticipantWeeklyAssignments.get(p1.id).add(slotWeek);
                tempParticipantWeeklyAssignments.get(p2.id).add(slotWeek);
                regularsAssignedInPhase2.add(p1.id);
                regularsAssignedInPhase2.add(p2.id);
                // console.log(`Phase 2: Assigned regulars ${participantsMap.get(p1.id)?.name} and ${participantsMap.get(p2.id)?.name} to ${slot.categoryKey} on ${slot.date} ${slot.time}`);
            } else {
                 // console.log(`Phase 2: Could not find suitable pair for core slot ${slot.categoryKey} on ${slot.date} ${slot.time}`);
            }
        }
    }
    console.log("Finished Phase 2.");

    coreSlotInstances.forEach(coreSlot => {
        let dayEntry = scheduleData.find(ds => ds.date === coreSlot.date);
        if (!dayEntry) {
            dayEntry = { date: coreSlot.date, dayOfWeek: coreSlot.dayOfWeek, timeSlots: [] };
            scheduleData.push(dayEntry);
        }
        const existingSlotInDay = dayEntry.timeSlots.find(ts =>
            ts.time === coreSlot.time &&
            ts.type === coreSlot.type &&
            ts.categoryKey === coreSlot.categoryKey
        );
        if (!existingSlotInDay) {
            dayEntry.timeSlots.push({
                time: coreSlot.time,
                type: coreSlot.type,
                assigned: coreSlot.assigned,
                assignedNames: coreSlot.assignedNames,
                isFixedStatus: coreSlot.isFixedStatus,
                categoryKey: coreSlot.categoryKey,
                processedInCorePhase: true
            });
        } else {
            if (coreSlot.assigned.length > 0 && existingSlotInDay.assigned.length === 0) {
                 existingSlotInDay.assigned = coreSlot.assigned;
                 existingSlotInDay.assignedNames = coreSlot.assignedNames;
                 existingSlotInDay.isFixedStatus = coreSlot.isFixedStatus;
            }
            existingSlotInDay.processedInCorePhase = true;
        }
    });

    scheduleData.forEach(dayEntry => {
        if (dayEntry.timeSlots.some(ts => ts.processedInCorePhase)) {
            dayEntry.timeSlots.sort((a, b) => {
                if (a.time < b.time) return -1;
                if (a.time > b.time) return 1;
                return 0;
            });
        }
    });

    for (const [participantId, weeks] of tempParticipantWeeklyAssignments) {
        const mainWeeks = participantWeeklyAssignments.get(participantId);
        if (mainWeeks) {
            weeks.forEach(week => mainWeeks.add(week));
        }
    }

    const elementaryParticipants = activeParticipants.filter(p => p.type === '초등');
    const middleParticipants = activeParticipants.filter(p => p.type === '중등');

    for (let day = 1; day <= daysInMonth; day++) {
        const currentDate = new Date(year, month - 1, day);
        const dayOfWeekShort = DAYS_OF_WEEK[currentDate.getDay()];
        const dayOfWeekNumeric = currentDate.getDay();
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        let dailyAssignments = tempDailyAssignments.get(dateStr) ? new Set(tempDailyAssignments.get(dateStr)) : new Set();

        let dayScheduleEntry = scheduleData.find(ds => ds.date === dateStr);
        if (!dayScheduleEntry) {
            dayScheduleEntry = { date: dateStr, dayOfWeek: dayOfWeekShort, timeSlots: [] };
            const existingDayIndex = scheduleData.findIndex(ds => ds.date === dateStr);
            if (existingDayIndex === -1) {
                scheduleData.push(dayScheduleEntry);
            } else {
                dayScheduleEntry = scheduleData[existingDayIndex];
            }
        }

        const slotsForDayConfig = [...(TIME_SLOT_CONFIG[dayOfWeekShort] || [])];

        if (vacationStartDate && vacationEndDate &&
            currentDate >= vacationStartDate && currentDate <= vacationEndDate &&
            dayOfWeekNumeric >= 1 && dayOfWeekNumeric <= 5) {
            slotsForDayConfig.push({
                time: '10:00',
                type: 'elementary',
                random: true,
                categoryKey: 'elementary_vacation_10am',
                isVacationSlot: true
            });
        }

        if (dayOfWeekNumeric === 2 || dayOfWeekNumeric === 4 || (vacationStartDate && vacationEndDate)) {
            slotsForDayConfig.sort((a, b) => {
                if (a.time < b.time) return -1;
                if (a.time > b.time) return 1;
                return 0;
            });
        }

        for (const slotInfo of slotsForDayConfig) {
            const coreAssignedSlot = dayScheduleEntry.timeSlots.find(ts =>
                ts.time === slotInfo.time &&
                getEnglishParticipantType(ts.type) === getEnglishParticipantType(slotInfo.type) &&
                ts.categoryKey === slotInfo.categoryKey &&
                ts.assigned.length > 0
            );

            if (coreAssignedSlot) {
                continue;
            }
            let assignedPair = [];
            const slotEnglishType = getEnglishParticipantType(slotInfo.type);
            const originalTargetPool = slotEnglishType === 'elementary' ? elementaryParticipants : middleParticipants;

            if (originalTargetPool.length < 2) {
                const existingTimeSlot = dayScheduleEntry.timeSlots.find(ts => ts.time === slotInfo.time && getEnglishParticipantType(ts.type) === slotEnglishType && ts.categoryKey === slotInfo.categoryKey);
                if(!existingTimeSlot){
                    dayScheduleEntry.timeSlots.push({ time: slotInfo.time, type: slotInfo.type, assigned: [], assignedNames: ['미배정'], isFixedStatus: [false, false], categoryKey: slotInfo.categoryKey });
                }
                continue;
            }
            const currentWeekForSlot = getWeekOfMonth(currentDate);

            if (slotInfo.sequential) {
                const isCoreSlotCategory = CORE_CATEGORIES_LIST.includes(slotInfo.categoryKey);
                if (isCoreSlotCategory) {
                    // console.log(`Main Loop: Core sequential slot ${slotInfo.categoryKey} on ${dateStr} at ${slotInfo.time} was not filled in core phases. Attempting general assignment.`);
                }
                const filteredTargetPool = originalTargetPool.filter(p => {
                    if (dailyAssignments.has(p.id)) return false;
                    const pCountsMap = assignmentCounts.get(p.id);
                    const pWeeklyAssignments = participantWeeklyAssignments.get(p.id);
                    if ((pCountsMap.get('total') || 0) >= MAX_ALLOWED_ASSIGNMENTS) return false;
                    if (((pCountsMap.get('total') || 0) >= 2 && pWeeklyAssignments.has(currentWeekForSlot))) return false;
                    return true;
                });
                const enhancedTargetPool = filteredTargetPool.map(p => getEnhancedParticipantData(p, slotInfo, prevMonthAssignmentCounts, assignmentCounts, CORE_CATEGORIES_MAP, calculatedPrevTotalCounts)).sort((a,b) => compareEnhancedParticipants(a,b,false,assignmentCounts, false));
                const sortedTargetPool = enhancedTargetPool.map(data => data.obj);
                let p1Obj = null, p2Obj = null;
                if (sortedTargetPool.length >= 2) {
                    for (let i = 0; i < sortedTargetPool.length; i++) {
                        const cand1 = sortedTargetPool[i];
                        if(dailyAssignments.has(cand1.id)) continue;
                        for (let j = i + 1; j < sortedTargetPool.length; j++) {
                            const cand2 = sortedTargetPool[j];
                            if(dailyAssignments.has(cand2.id) || cand1.id === cand2.id) continue;
                            if (isPairingAllowed(cand1.id, cand2.id, participantsMap)) {
                                p1Obj = cand1; p2Obj = cand2; break;
                            }
                        }
                        if (p1Obj && p2Obj) break;
                    }
                }
                if (p1Obj && p2Obj) {
                    assignedPair = [p1Obj.id, p2Obj.id];
                }
            } else if (slotInfo.random) {
                const isCoreSlotCategoryRandom = CORE_CATEGORIES_LIST.includes(slotInfo.categoryKey);
                if (isCoreSlotCategoryRandom) {
                    // console.log(`Main Loop: Core random slot ${slotInfo.categoryKey} on ${dateStr} at ${slotInfo.time} was not filled in core phases. Attempting general random assignment.`);
                }
                let eligibleForRandomRaw = originalTargetPool.filter(p => {
                    if (dailyAssignments.has(p.id)) return false;
                    const pCountsMap = assignmentCounts.get(p.id);
                    if (!pCountsMap || (pCountsMap.get('total') || 0) >= MAX_ALLOWED_ASSIGNMENTS) return false;
                    const pWeeklyAssignments = participantWeeklyAssignments.get(p.id);
                    if (!pWeeklyAssignments || ((pCountsMap.get('total') || 0) >= 2 && pWeeklyAssignments.has(currentWeekForSlot))) return false;
                    if (prevMonthAbsentees.has(p.id)) {
                        const absenteeCoreCount = absenteeCoreAssignmentsCount.get(p.id) || 0;
                        if (isCoreSlotCategoryRandom && absenteeCoreCount < 2) {
                        }
                    }
                    return true;
                });
                const enhancedEligibleForRandom = eligibleForRandomRaw.map(p => getEnhancedParticipantData(p, slotInfo, prevMonthAssignmentCounts, assignmentCounts, CORE_CATEGORIES_MAP, calculatedPrevTotalCounts));
                enhancedEligibleForRandom.sort((a,b) => compareEnhancedParticipants(a,b,true,assignmentCounts, true));
                let p1Data = null, p2Data = null;
                for (let i = 0; i < enhancedEligibleForRandom.length; i++) {
                    p1Data = enhancedEligibleForRandom[i];
                    for (let j = i + 1; j < enhancedEligibleForRandom.length; j++) {
                        p2Data = enhancedEligibleForRandom[j];
                        if (isPairingAllowed(p1Data.id, p2Data.id, participantsMap)) {
                            assignedPair = [p1Data.id, p2Data.id]; break;
                        }
                    }
                    if (assignedPair.length === 2) break;
                    p2Data = null;
                }
                if (!p1Data || !p2Data || assignedPair.length < 2) assignedPair = [];
                if (assignedPair.length < 2 && eligibleForRandomRaw.length >=2) {
                    const poolForFallback = enhancedEligibleForRandom.map(data => data.obj);
                    let p1Obj = null, p2Obj = null;
                    for (let i = 0; i < poolForFallback.length; i++) {
                        const candidate1 = poolForFallback[i];
                        if (dailyAssignments.has(candidate1.id)) continue;
                        p1Obj = candidate1;
                        for (let j = i + 1; j < poolForFallback.length; j++) {
                            const candidate2 = poolForFallback[j];
                            if (dailyAssignments.has(candidate2.id) || candidate2.id === p1Obj.id) continue;
                            if (isPairingAllowed(p1Obj.id, candidate2.id, participantsMap)) {
                                p2Obj = candidate2; break;
                            }
                        }
                        if (p1Obj && p2Obj) { assignedPair = [p1Obj.id, p2Obj.id]; break; }
                        if(p1Obj && !p2Obj) p1Obj = null;
                    }
                }
            }
            const existingTimeSlotIndex = dayScheduleEntry.timeSlots.findIndex(ts => ts.time === slotInfo.time && getEnglishParticipantType(ts.type) === slotEnglishType && ts.categoryKey === slotInfo.categoryKey);
            if (existingTimeSlotIndex !== -1) {
                if (assignedPair.length === 2) {
                    dayScheduleEntry.timeSlots[existingTimeSlotIndex].assigned = assignedPair;
                    dayScheduleEntry.timeSlots[existingTimeSlotIndex].assignedNames = assignedPair.map(id => participantsMap.get(id)?.name || `ID:${id}`);
                    dayScheduleEntry.timeSlots[existingTimeSlotIndex].isFixedStatus = [false, false];
                    assignedPair.forEach(id => {
                        dailyAssignments.add(id);
                        const countsForParticipant = assignmentCounts.get(id);
                        countsForParticipant.set('total', (countsForParticipant.get('total') || 0) + 1);
                        if (slotInfo.categoryKey) countsForParticipant.set(slotInfo.categoryKey, (countsForParticipant.get(slotInfo.categoryKey) || 0) + 1);
                        participantWeeklyAssignments.get(id).add(currentWeekForSlot);
                    });
                }
            } else {
                 dayScheduleEntry.timeSlots.push({
                    time: slotInfo.time,
                    type: slotInfo.type,
                    assigned: assignedPair.length === 2 ? assignedPair : [],
                    assignedNames: assignedPair.length === 2 ? assignedPair.map(id => participantsMap.get(id)?.name || `ID:${id}`) : ['미배정'],
                    isFixedStatus: [false, false],
                    categoryKey: slotInfo.categoryKey
                });
                if (assignedPair.length === 2) {
                    assignedPair.forEach(id => {
                        dailyAssignments.add(id);
                        const countsForParticipant = assignmentCounts.get(id);
                        countsForParticipant.set('total', (countsForParticipant.get('total') || 0) + 1);
                        if (slotInfo.categoryKey) countsForParticipant.set(slotInfo.categoryKey, (countsForParticipant.get(slotInfo.categoryKey) || 0) + 1);
                        participantWeeklyAssignments.get(id).add(currentWeekForSlot);
                    });
                }
            }
        }
        if (dayScheduleEntry.timeSlots.length > 0) {
            const existingDayIndex = scheduleData.findIndex(ds => ds.date === dateStr);
            if (existingDayIndex === -1) {
                dayScheduleEntry.timeSlots.sort((a,b) => {
                    if (a.time < b.time) return -1;
                    if (a.time > b.time) return 1;
                    return 0;
                });
                scheduleData.push(dayScheduleEntry);
            } else {
                scheduleData[existingDayIndex].timeSlots.sort((a,b) => {
                    if (a.time < b.time) return -1;
                    if (a.time > b.time) return 1;
                    return 0;
                });
            }
        }
    }
    scheduleData.sort((a,b) => new Date(a.date) - new Date(b.date));

    // console.log("Attempting 2nd round 'non-core' assignments for absentees who still need them.");
    // console.log("Attempting 2nd assignment (non-core, if core targets not met) for absentees.");
    const absenteesPotentiallyNeedingNonCoreFill = activeParticipants.filter(p =>
        prevMonthAbsentees.has(p.id) &&
        (absenteeCoreAssignmentsCount.get(p.id) || 0) < 2 &&
        (assignmentCounts.get(p.id)?.get('total') || 0) < MAX_ALLOWED_ASSIGNMENTS &&
        (assignmentCounts.get(p.id)?.get('total') || 0) < 2
    );

    if (absenteesPotentiallyNeedingNonCoreFill.length > 0) {
        // console.log("Fall A2: Absentees for 2nd assignment (non-core, because <2 core and <2 total):", absenteesPotentiallyNeedingNonCoreFill.map(p=>p.name + ` (Core: ${absenteeCoreAssignmentsCount.get(p.id)}, Total: ${assignmentCounts.get(p.id)?.get('total')})`));
        const postLoopDailyAssignments_A2_NonCore = new Map();
        scheduleData.forEach(daySch => {
            const dailySet = new Set();
            daySch.timeSlots.forEach(slot => slot.assigned.forEach(id => dailySet.add(id)));
            postLoopDailyAssignments_A2_NonCore.set(daySch.date, dailySet);
        });

        for (const absentee of absenteesPotentiallyNeedingNonCoreFill) {
            if ((assignmentCounts.get(absentee.id)?.get('total') || 0) >= MAX_ALLOWED_ASSIGNMENTS ||
                (assignmentCounts.get(absentee.id)?.get('total') || 0) >= 2) {
                continue;
            }
            for (let day = 1; day <= daysInMonth; day++) {
                 if ((assignmentCounts.get(absentee.id)?.get('total') || 0) >= MAX_ALLOWED_ASSIGNMENTS ||
                     (assignmentCounts.get(absentee.id)?.get('total') || 0) >= 2) {
                    break;
                }
                const currentDate = new Date(year, month - 1, day);
                const currentWeek = getWeekOfMonth(currentDate);
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dailyAssignedForThisDay = postLoopDailyAssignments_A2_NonCore.get(dateStr) || new Set();
                if (( (assignmentCounts.get(absentee.id)?.get('total') || 0) === 1 && participantWeeklyAssignments.get(absentee.id)?.has(currentWeek) ) ||
                    dailyAssignedForThisDay.has(absentee.id)) {
                    continue;
                }
                const daySch = scheduleData.find(ds => ds.date === dateStr);
                if (!daySch) continue;
                const availableSlotsForDay = daySch.timeSlots.filter(ts =>
                    ts.assigned.length === 0 &&
                    !CORE_CATEGORIES_LIST.includes(ts.categoryKey)
                );
                for (const targetSlot of availableSlotsForDay) {
                    if ((assignmentCounts.get(absentee.id)?.get('total') || 0) >= MAX_ALLOWED_ASSIGNMENTS ||
                        (assignmentCounts.get(absentee.id)?.get('total') || 0) >= 2) {
                       break;
                   }
                   if (dailyAssignedForThisDay.has(absentee.id)) continue;
                   if (( (assignmentCounts.get(absentee.id)?.get('total') || 0) === 1 && participantWeeklyAssignments.get(absentee.id)?.has(currentWeek) )) continue;
                    const absenteeEnglishType = getEnglishParticipantType(absentee.type);
                    const targetPoolType = getEnglishParticipantType(targetSlot.type);
                    const partnerPool = (targetPoolType === 'elementary' ? elementaryParticipants : middleParticipants).filter(p => {
                        if (getEnglishParticipantType(p.type) !== targetPoolType) return false;
                        if (p.id === absentee.id || dailyAssignedForThisDay.has(p.id)) return false;
                        const pTotal = assignmentCounts.get(p.id)?.get('total') || 0;
                        if (pTotal >= MAX_ALLOWED_ASSIGNMENTS) return false;
                        if ( (pTotal === 1 && participantWeeklyAssignments.get(p.id)?.has(currentWeek) ) ||
                             (pTotal >= 2 && participantWeeklyAssignments.get(p.id)?.has(currentWeek) ) ) return false;
                        return true;
                    });
                    let partnerToAssign = null;
                    for (const potentialPartner of partnerPool) {
                        if (isPairingAllowed(absentee.id, potentialPartner.id, participantsMap)) {
                            partnerToAssign = potentialPartner;
                            break;
                        }
                    }
                    if (partnerToAssign) {
                        targetSlot.assigned = [absentee.id, partnerToAssign.id];
                        targetSlot.assignedNames = [participantsMap.get(absentee.id)?.name, participantsMap.get(partnerToAssign.id)?.name];
                        targetSlot.isFixedStatus = [false, false];
                        dailyAssignedForThisDay.add(absentee.id);
                        dailyAssignedForThisDay.add(partnerToAssign.id);
                        if (!postLoopDailyAssignments_A2_NonCore.has(dateStr)) postLoopDailyAssignments_A2_NonCore.set(dateStr, new Set());
                        postLoopDailyAssignments_A2_NonCore.get(dateStr).add(absentee.id);
                        postLoopDailyAssignments_A2_NonCore.get(dateStr).add(partnerToAssign.id);
                        [absentee.id, partnerToAssign.id].forEach(pid => {
                            const counts = assignmentCounts.get(pid);
                            counts.set('total', (counts.get('total') || 0) + 1);
                            if (targetSlot.categoryKey) counts.set(targetSlot.categoryKey, (counts.get(targetSlot.categoryKey) || 0) + 1);
                            participantWeeklyAssignments.get(pid).add(currentWeek);
                        });
                        // console.log(`Fall A2: Assigned ${participantsMap.get(absentee.id)?.name} and ${participantsMap.get(partnerToAssign.id)?.name} to non-core ${targetSlot.categoryKey} on ${dateStr}`);
                        break;
                    }
                }
            }
        }
    }

    console.log("Start Step: Ensure all participants receive 2 assignments if possible.");
    if (MAX_ALLOWED_ASSIGNMENTS >= 2) {
        let participantsNeedingTwoAssignments = activeParticipants.filter(p => (assignmentCounts.get(p.id)?.get('total') || 0) < 2);
        const currentDailyAssignments = new Map();
        scheduleData.forEach(daySch => {
            const dailySet = new Set();
            daySch.timeSlots.forEach(slot => slot.assigned.forEach(id => dailySet.add(id)));
            currentDailyAssignments.set(daySch.date, dailySet);
        });
        let emptySlotsForTwoAssgn = [];
        scheduleData.forEach(daySch => {
            daySch.timeSlots.forEach(ts => {
                if (ts.assigned.length === 0) {
                    emptySlotsForTwoAssgn.push({
                        date: daySch.date,
                        dayOfWeek: daySch.dayOfWeek,
                        time: ts.time,
                        type: ts.type,
                        categoryKey: ts.categoryKey,
                        slotObjRef: ts
                    });
                }
            });
        });
        emptySlotsForTwoAssgn.sort(() => Math.random() - 0.5);
        let assignmentsMadeInThisStep = 0;
        let iterationCount = 0;
        const MAX_ITERATIONS_ENSURE_TWO = participantsNeedingTwoAssignments.length * emptySlotsForTwoAssgn.length + 10;
        while (participantsNeedingTwoAssignments.length > 0 && emptySlotsForTwoAssgn.length > 0 && iterationCount < MAX_ITERATIONS_ENSURE_TWO) {
            iterationCount++;
            participantsNeedingTwoAssignments.sort((pA, pB) => {
                const totalA = assignmentCounts.get(pA.id)?.get('total') || 0;
                const totalB = assignmentCounts.get(pB.id)?.get('total') || 0;
                if (totalA !== totalB) return totalA - totalB;
                const prevTotalA = calculatedPrevTotalCounts.get(pA.id) || 0;
                const prevTotalB = calculatedPrevTotalCounts.get(pB.id) || 0;
                if (prevTotalA !== prevTotalB) return prevTotalA - prevTotalB;
                return pA.id - pB.id;
            });
            let p1 = participantsNeedingTwoAssignments[0];
            if ((assignmentCounts.get(p1.id)?.get('total') || 0) >= 2) {
                participantsNeedingTwoAssignments.shift();
                continue;
            }
            let suitableSlotFoundForP1 = false;
            for (let i = 0; i < emptySlotsForTwoAssgn.length; i++) {
                const slotToFill = emptySlotsForTwoAssgn[i];
                const slotDateObj = new Date(slotToFill.date);
                const slotWeek = getWeekOfMonth(slotDateObj);
                const p1EnglishType = getEnglishParticipantType(p1.type);
                if (p1EnglishType !== getEnglishParticipantType(slotToFill.type)) continue; // Compare English types
                if (currentDailyAssignments.get(slotToFill.date)?.has(p1.id)) continue;
                if ((assignmentCounts.get(p1.id)?.get('total') || 0) === 1 && participantWeeklyAssignments.get(p1.id)?.has(slotWeek)) continue;
                let p2 = null;
                for (const candidateP2 of participantsNeedingTwoAssignments) {
                    const candidateP2EnglishType = getEnglishParticipantType(candidateP2.type);
                    if (candidateP2.id === p1.id) continue;
                    if ((assignmentCounts.get(candidateP2.id)?.get('total') || 0) >= 2) continue;
                    if (candidateP2EnglishType !== getEnglishParticipantType(slotToFill.type)) continue; // Compare English types
                    if (currentDailyAssignments.get(slotToFill.date)?.has(candidateP2.id)) continue;
                    if ((assignmentCounts.get(candidateP2.id)?.get('total') || 0) === 1 && participantWeeklyAssignments.get(candidateP2.id)?.has(slotWeek)) continue;
                    if (!isPairingAllowed(p1.id, candidateP2.id, participantsMap)) continue;
                    p2 = candidateP2;
                    break;
                }
                if (!p2) {
                    let otherPotentialPartners = activeParticipants.filter(candP => {
                        const candPEnglishType = getEnglishParticipantType(candP.type);
                        return candP.id !== p1.id &&
                        (assignmentCounts.get(candP.id)?.get('total') || 0) < 2 &&
                        candPEnglishType === getEnglishParticipantType(slotToFill.type) && // Compare English types
                        !currentDailyAssignments.get(slotToFill.date)?.has(candP.id) &&
                        !((assignmentCounts.get(candP.id)?.get('total') || 0) === 1 && participantWeeklyAssignments.get(candP.id)?.has(slotWeek)) &&
                        isPairingAllowed(p1.id, candP.id, participantsMap);
                    });
                    otherPotentialPartners.sort((a,b) => (assignmentCounts.get(a.id)?.get('total') || 0) - (assignmentCounts.get(b.id)?.get('total') || 0));
                    if(otherPotentialPartners.length > 0) p2 = otherPotentialPartners[0];
                }
                if (p2) {
                    const actualSlot = slotToFill.slotObjRef;
                    actualSlot.assigned = [p1.id, p2.id];
                    actualSlot.assignedNames = [participantsMap.get(p1.id)?.name, participantsMap.get(p2.id)?.name];
                    actualSlot.isFixedStatus = [false, false];
                    [p1.id, p2.id].forEach(pid => {
                        const counts = assignmentCounts.get(pid);
                        counts.set('total', (counts.get('total') || 0) + 1);
                        if (actualSlot.categoryKey) counts.set(actualSlot.categoryKey, (counts.get(actualSlot.categoryKey) || 0) + 1);
                        participantWeeklyAssignments.get(pid).add(slotWeek);
                    });
                    if (!currentDailyAssignments.has(slotToFill.date)) currentDailyAssignments.set(slotToFill.date, new Set());
                    currentDailyAssignments.get(slotToFill.date).add(p1.id);
                    currentDailyAssignments.get(slotToFill.date).add(p2.id);
                    emptySlotsForTwoAssgn.splice(i, 1);
                    assignmentsMadeInThisStep++;
                    suitableSlotFoundForP1 = true;
                    // console.log(`Ensure2Step: Assigned ${p1.name} and ${p2.name} to ${actualSlot.categoryKey} on ${slotToFill.date} ${actualSlot.time}. P1 total: ${assignmentCounts.get(p1.id)?.get('total')}, P2 total: ${assignmentCounts.get(p2.id)?.get('total')}`);
                    break;
                }
            }
            if (!suitableSlotFoundForP1) {
                // console.log(`Ensure2Step: Could not find suitable slot/partner for ${p1.name} (current total: ${assignmentCounts.get(p1.id)?.get('total')}). Removing from consideration.`);
                participantsNeedingTwoAssignments.shift();
            }
            participantsNeedingTwoAssignments = activeParticipants.filter(p => (assignmentCounts.get(p.id)?.get('total') || 0) < 2);
        }
        if (iterationCount >= MAX_ITERATIONS_ENSURE_TWO) {
            console.warn("Ensure2Step: Max iterations reached. Exiting loop.");
        }
        // console.log(`Ensure2Step: Made ${assignmentsMadeInThisStep} new pair assignments.`);
        participantsNeedingTwoAssignments = activeParticipants.filter(p => (assignmentCounts.get(p.id)?.get('total') || 0) < 2);
        if(participantsNeedingTwoAssignments.length > 0){
            // console.log(`Ensure2Step: ${participantsNeedingTwoAssignments.length} participants still have < 2 assignments: ` + participantsNeedingTwoAssignments.map(p => `${p.name} (${assignmentCounts.get(p.id)?.get('total')})`).join(', '));
        } else {
            // console.log("Ensure2Step: All active participants have at least 2 assignments or no more assignable slots/pairs.");
        }
    }

    for (let targetCount = 3; targetCount <= 5; targetCount++) {
        // console.log(`Start Step: Attempting to bring participants to ${targetCount} assignments.`);
        let participantsBelowTarget = activeParticipants.filter(p => (assignmentCounts.get(p.id)?.get('total') || 0) < targetCount);
        if (participantsBelowTarget.length === 0) {
            // console.log(`IncrementalAssignStep (${targetCount}): No participants below ${targetCount} assignments.`);
            continue;
        }
        participantsBelowTarget.sort((pA, pB) => {
            const prevTotalA = calculatedPrevTotalCounts.get(pA.id) || 0;
            const prevTotalB = calculatedPrevTotalCounts.get(pB.id) || 0;
            if (prevTotalA !== prevTotalB) return prevTotalA - prevTotalB;
            return Math.random() - 0.5;
        });
        const currentDailyAssignmentsIncremental = new Map();
        scheduleData.forEach(daySch => {
            const dailySet = new Set();
            daySch.timeSlots.forEach(slot => slot.assigned.forEach(id => dailySet.add(id)));
            currentDailyAssignmentsIncremental.set(daySch.date, dailySet);
        });
        let availableEmptySlotsIncremental = [];
        scheduleData.forEach(daySch => {
            daySch.timeSlots.forEach(ts => {
                if (ts.assigned.length === 0) {
                    availableEmptySlotsIncremental.push({
                        date: daySch.date,
                        dayOfWeek: daySch.dayOfWeek,
                        time: ts.time,
                        type: ts.type,
                        categoryKey: ts.categoryKey,
                        slotObjRef: ts
                    });
                }
            });
        });
        availableEmptySlotsIncremental.sort(() => Math.random() - 0.5);
        let assignmentsMadeThisTargetCount = 0;
        let p1Index = 0;
        while (p1Index < participantsBelowTarget.length && availableEmptySlotsIncremental.length > 0) {
            let p1 = participantsBelowTarget[p1Index];
            if ((assignmentCounts.get(p1.id)?.get('total') || 0) >= targetCount) {
                p1Index++;
                continue;
            }
            let suitableSlotFoundForP1 = false;
            for (let slotIndex = 0; slotIndex < availableEmptySlotsIncremental.length; slotIndex++) {
                const slotToFill = availableEmptySlotsIncremental[slotIndex];
                const slotDateObj = new Date(slotToFill.date);
                const slotWeek = getWeekOfMonth(slotDateObj);
                const p1EnglishType = getEnglishParticipantType(p1.type);
                if (p1EnglishType !== getEnglishParticipantType(slotToFill.type)) continue; // Compare English types
                if (currentDailyAssignmentsIncremental.get(slotToFill.date)?.has(p1.id)) continue;
                if (participantWeeklyAssignments.get(p1.id)?.has(slotWeek)) continue;
                let p2 = null;
                let potentialPartners = activeParticipants.filter(candP => {
                    const candPEnglishType = getEnglishParticipantType(candP.type);
                    if (candP.id === p1.id) return false;
                    if ((assignmentCounts.get(candP.id)?.get('total') || 0) >= targetCount) return false;
                    if (candPEnglishType !== getEnglishParticipantType(slotToFill.type)) return false; // Compare English types
                    if (currentDailyAssignmentsIncremental.get(slotToFill.date)?.has(candP.id)) return false;
                    if (participantWeeklyAssignments.get(candP.id)?.has(slotWeek)) return false;
                    return isPairingAllowed(p1.id, candP.id, participantsMap);
                });
                potentialPartners.sort((a,b) => (assignmentCounts.get(a.id)?.get('total') || 0) - (assignmentCounts.get(b.id)?.get('total') || 0));
                if (potentialPartners.length > 0) {
                    p2 = potentialPartners[0];
                }
                if (p2) {
                    const actualSlot = slotToFill.slotObjRef;
                    actualSlot.assigned = [p1.id, p2.id];
                    actualSlot.assignedNames = [participantsMap.get(p1.id)?.name, participantsMap.get(p2.id)?.name];
                    actualSlot.isFixedStatus = [false, false];
                    [p1.id, p2.id].forEach(pid => {
                        const counts = assignmentCounts.get(pid);
                        counts.set('total', (counts.get('total') || 0) + 1);
                        if (actualSlot.categoryKey) counts.set(actualSlot.categoryKey, (counts.get(actualSlot.categoryKey) || 0) + 1);
                        participantWeeklyAssignments.get(pid).add(slotWeek);
                    });
                    if (!currentDailyAssignmentsIncremental.has(slotToFill.date)) currentDailyAssignmentsIncremental.set(slotToFill.date, new Set());
                    currentDailyAssignmentsIncremental.get(slotToFill.date).add(p1.id);
                    currentDailyAssignmentsIncremental.get(slotToFill.date).add(p2.id);
                    availableEmptySlotsIncremental.splice(slotIndex, 1);
                    assignmentsMadeThisTargetCount++;
                    suitableSlotFoundForP1 = true;
                    // console.log(`IncrementalAssignStep (${targetCount}): Assigned ${p1.name} (now ${assignmentCounts.get(p1.id)?.get('total')}) and ${p2.name} (now ${assignmentCounts.get(p2.id)?.get('total')}) to ${actualSlot.categoryKey} on ${slotToFill.date}`);
                    if((assignmentCounts.get(p2.id)?.get('total') || 0) >= targetCount) {
                        participantsBelowTarget = participantsBelowTarget.filter(p => p.id !== p2.id || (assignmentCounts.get(p.id)?.get('total') || 0) < targetCount );
                    }
                    break;
                }
            }
            if (!suitableSlotFoundForP1) {
                // console.log(`IncrementalAssignStep (${targetCount}): Could not find slot/partner for ${p1.name} (total: ${assignmentCounts.get(p1.id)?.get('total')}).`);
            }
            p1Index++;
            if (suitableSlotFoundForP1 && (assignmentCounts.get(p1.id)?.get('total') || 0) >= targetCount) {
                 participantsBelowTarget = activeParticipants.filter(p => (assignmentCounts.get(p.id)?.get('total') || 0) < targetCount);
                 participantsBelowTarget.sort((pA, pB) => {
                    const prevTotalA = calculatedPrevTotalCounts.get(pA.id) || 0;
                    const prevTotalB = calculatedPrevTotalCounts.get(pB.id) || 0;
                    if (prevTotalA !== prevTotalB) return prevTotalA - prevTotalB;
                    return Math.random() - 0.5;
                });
                p1Index = 0;
            }
        }
        // console.log(`IncrementalAssignStep (${targetCount}): Made ${assignmentsMadeThisTargetCount} new pair assignments.`);
        const stillBelowTarget = activeParticipants.filter(p => (assignmentCounts.get(p.id)?.get('total') || 0) < targetCount);
        if (stillBelowTarget.length > 0) {
            // console.log(`IncrementalAssignStep (${targetCount}): ${stillBelowTarget.length} participants still have < ${targetCount} assignments: ` + stillBelowTarget.map(p => `${p.name} (${assignmentCounts.get(p.id)?.get('total')})`).join(', '));
        } else {
            // console.log(`IncrementalAssignStep (${targetCount}): All targeted participants have at least ${targetCount} assignments or no more assignable slots/pairs.`);
        }
    }

    console.log("D-Step: Final random assignments for any remaining slots.");
    const postLoopDailyAssignments_D = new Map();
    scheduleData.forEach(daySch => {
        const dailySet = new Set();
        daySch.timeSlots.forEach(slot => slot.assigned.forEach(id => dailySet.add(id)));
        postLoopDailyAssignments_D.set(daySch.date, dailySet);
    });
    let dStepAssignedCount = 0;
    const emptySlotsForDStep = [];
    scheduleData.forEach(daySch => daySch.timeSlots.forEach(slot => { if (slot.assigned.length === 0) emptySlotsForDStep.push({ date: daySch.date, ...slot }); }));

    if (emptySlotsForDStep.length > 0) {
        // console.log(`D-Step: Found ${emptySlotsForDStep.length} empty slots for final assignment.`);
        emptySlotsForDStep.sort(() => Math.random() - 0.5);
        for (const emptySlot of emptySlotsForDStep) {
            const daySchToUpdate = scheduleData.find(ds => ds.date === emptySlot.date); const slotToUpdate = daySchToUpdate?.timeSlots.find(s => s.time === emptySlot.time && s.type === emptySlot.type && s.categoryKey === emptySlot.categoryKey); if (!slotToUpdate || slotToUpdate.assigned.length > 0) continue;
            const currentDateD = new Date(emptySlot.date); const currentWeekD = getWeekOfMonth(currentDateD); const dailyAssignedForThisDay_D = postLoopDailyAssignments_D.get(emptySlot.date);
            let potentialP1List_D = activeParticipants.filter(p =>
                !dailyAssignedForThisDay_D.has(p.id)
            );
            if (potentialP1List_D.length === 0) continue;
            const tempSlotInfoForDSort = { categoryKey: emptySlot.categoryKey || 'general_D_step_sort' };
            const sortedPotentialP1_D = potentialP1List_D.map(p => getEnhancedParticipantData(p, tempSlotInfoForDSort, prevMonthAssignmentCounts, assignmentCounts, CORE_CATEGORIES_MAP, calculatedPrevTotalCounts)).sort((a,b) => { const totalA_D = assignmentCounts.get(a.id)?.get('total') || 0; const totalB_D = assignmentCounts.get(b.id)?.get('total') || 0; if (totalA_D !== totalB_D) return totalA_D - totalB_D; return Math.random() - 0.5; });
            if (sortedPotentialP1_D.length === 0) continue;
            let p1_D = null, p2_D = null;
            for (const p1Data_D of sortedPotentialP1_D) {
                const candidateP1 = p1Data_D.obj; if (dailyAssignedForThisDay_D.has(candidateP1.id)) continue;
                let potentialPartners_D = activeParticipants.filter(p =>
                    p.id !== candidateP1.id &&
                    !dailyAssignedForThisDay_D.has(p.id)
                );
                if (potentialPartners_D.length > 0) {
                    const sortedPotentialPartners_D = potentialPartners_D.map(p => getEnhancedParticipantData(p, tempSlotInfoForDSort, prevMonthAssignmentCounts, assignmentCounts, CORE_CATEGORIES_MAP, calculatedPrevTotalCounts)).sort((a,b) => { const totalA_DP = assignmentCounts.get(a.id)?.get('total') || 0; const totalB_DP = assignmentCounts.get(b.id)?.get('total') || 0; if (totalA_DP !== totalB_DP) return totalA_DP - totalB_DP; return Math.random() - 0.5; });
                    for (const p2Data_D_partner of sortedPotentialPartners_D) {
                        const candidateP2 = p2Data_D_partner.obj;
                        if (isPairingAllowed(candidateP1.id, candidateP2.id, participantsMap)) {
                            p1_D = candidateP1; p2_D = candidateP2; break;
                        }
                    }
                    if (p1_D && p2_D) break;
                }
            }
            if (p1_D && p2_D) {
                slotToUpdate.assigned = [p1_D.id, p2_D.id]; slotToUpdate.assignedNames = [participantsMap.get(p1_D.id)?.name, participantsMap.get(p2_D.id)?.name]; slotToUpdate.isFixedStatus = [false, false];
                dailyAssignedForThisDay_D.add(p1_D.id); dailyAssignedForThisDay_D.add(p2_D.id);
                [p1_D.id, p2_D.id].forEach(pid => { const counts = assignmentCounts.get(pid); counts.set('total', (counts.get('total') || 0) + 1); if (slotToUpdate.categoryKey) counts.set(slotToUpdate.categoryKey, (counts.get(slotToUpdate.categoryKey) || 0) + 1); participantWeeklyAssignments.get(pid).add(currentWeekD); });
                dStepAssignedCount++;
            }
        }
    }
    // if (dStepAssignedCount > 0) console.log(`D-Step: Assigned ${dStepAssignedCount} additional pairs.`);
    
    await db.saveSchedule(year, month, scheduleData);
    let summaryLines = ["초등학생 배정 현황 요약:"];
    const elementaryStudentCounts = new Map();
    for (const participant of participants) {
        if (getEnglishParticipantType(participant.type) === 'elementary') {
            const studentId = participant.id;
            const studentName = participant.name;
            const studentAssignmentCountsMap = assignmentCounts.get(studentId);
            const totalAssignments = studentAssignmentCountsMap?.get('total') || 0;
            let categoryDetails = [];
            if (studentAssignmentCountsMap) {
                for (const [categoryKey, count] of studentAssignmentCountsMap.entries()) {
                    if (categoryKey !== 'total' && count > 0) {
                        categoryDetails.push(`${categoryKey}: ${count}회`);
                    }
                }
            }
            const detailsString = categoryDetails.length > 0 ? ` (${categoryDetails.join(', ')})` : '';
            summaryLines.push(`${studentName} (ID: ${studentId}): 총 ${totalAssignments}회${detailsString}`);
            elementaryStudentCounts.set(totalAssignments, (elementaryStudentCounts.get(totalAssignments) || 0) + 1);
        }
    }
    let distributionSummary = "배정 분포: ";
    const sortedCounts = Array.from(elementaryStudentCounts.keys()).sort((a, b) => a - b);
    let distributionParts = [];
    for (const count of sortedCounts) { distributionParts.push(`${count}회: ${elementaryStudentCounts.get(count)}명`); }
    distributionSummary += distributionParts.join(', '); summaryLines.push(distributionSummary);
    const summaryString = summaryLines.join('\n');
    try {
        const formattedAssignmentData = [];
        for (const [participantId, categoryMap] of assignmentCounts.entries()) {
            for (const [categoryKey, count] of categoryMap.entries()) {
                if (categoryKey !== 'total' && count > 0) formattedAssignmentData.push({ participantId: participantId, categoryKey: categoryKey, count: count });
            }
        }
        if (formattedAssignmentData.length > 0) {
            await db.saveMonthlyAssignmentCounts(year, month, formattedAssignmentData);
            // console.log(`Monthly assignment counts for ${year}-${month} saved.`);
        }
    } catch (error) { console.error(`Failed to save monthly assignment counts for ${year}-${month}:`, error); }
    // console.log("Final check on absentee core assignments:");
    absenteesForCore.forEach(absentee => {
        const coreCount = absenteeCoreAssignmentsCount.get(absentee.id) || 0;
        if (coreCount < 2) {
            console.warn(`WARN: Absentee ${participantsMap.get(absentee.id)?.name} (ID: ${absentee.id}) has ${coreCount} core assignments (target was 2). Total assignments: ${assignmentCounts.get(absentee.id)?.get('total')}`);
        }
    });

    // 월간 배정 카운트 저장
    const assignmentCountsToSave = [];
    for (const [participantId, categoryMap] of assignmentCounts) {
        for (const [categoryKey, count] of categoryMap) {
            if (count > 0) { // 배정 횟수가 있는 것만 저장
                assignmentCountsToSave.push({ participantId, categoryKey, count });
            }
        }
    }
    await db.saveMonthlyAssignmentCounts(year, month, assignmentCountsToSave);
    
    // 새벽 배정 현황 로그 출력
    console.log(`===== ${year}년 ${month}월 새벽 배정 현황 =====`);
    const elementaryCoreKey = CORE_CATEGORIES_MAP.elementary; // elementary_6am
    const middleCoreKey = CORE_CATEGORIES_MAP.middle; // middle_7am
    
    // 초등부 새벽 배정 현황
    console.log("초등부 새벽 배정 현황:");
    const elementaryParticipantsWithCoreCount = elementaryParticipants
        .filter(p => p.isActive)
        .map(p => ({
            name: p.name,
            id: p.id,
            coreCount: assignmentCounts.get(p.id)?.get(elementaryCoreKey) || 0
        }))
        .sort((a, b) => b.coreCount - a.coreCount); // 배정 많은 순으로 정렬
    
    elementaryParticipantsWithCoreCount.forEach(p => {
        console.log(`${p.name}: ${p.coreCount}회`);
    });
    
    // 중등부 새벽 배정 현황
    console.log("\n중등부 새벽 배정 현황:");
    const middleParticipantsWithCoreCount = middleParticipants
        .filter(p => p.isActive)
        .map(p => ({
            name: p.name,
            id: p.id,
            coreCount: assignmentCounts.get(p.id)?.get(middleCoreKey) || 0
        }))
        .sort((a, b) => b.coreCount - a.coreCount); // 배정 많은 순으로 정렬
    
    middleParticipantsWithCoreCount.forEach(p => {
        console.log(`${p.name}: ${p.coreCount}회`);
    });
    
    // 새벽 배정 통계
    const elementaryCoreStats = calculateCoreStats(elementaryParticipantsWithCoreCount.map(p => p.coreCount));
    const middleCoreStats = calculateCoreStats(middleParticipantsWithCoreCount.map(p => p.coreCount));
    
    console.log("\n새벽 배정 통계:");
    console.log(`초등부 - 평균: ${elementaryCoreStats.average.toFixed(2)}회, 최대: ${elementaryCoreStats.max}회, 최소: ${elementaryCoreStats.min}회, 표준편차: ${elementaryCoreStats.stdDev.toFixed(2)}`);
    console.log(`중등부 - 평균: ${middleCoreStats.average.toFixed(2)}회, 최대: ${middleCoreStats.max}회, 최소: ${middleCoreStats.min}회, 표준편차: ${middleCoreStats.stdDev.toFixed(2)}`);
    console.log("=====================================");

    return { schedule: scheduleData, assignmentSummary: summaryString, assignmentCounts: assignmentCounts };
}

// 새벽 배정 통계 계산 함수
function calculateCoreStats(counts) {
    if (counts.length === 0) return { average: 0, max: 0, min: 0, stdDev: 0 };
    
    const sum = counts.reduce((acc, val) => acc + val, 0);
    const average = sum / counts.length;
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    
    // 표준편차 계산
    const squaredDiffs = counts.map(count => Math.pow(count - average, 2));
    const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / counts.length;
    const stdDev = Math.sqrt(variance);
    
    return { average, max, min, stdDev };
}
