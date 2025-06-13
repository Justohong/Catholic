import * as db from './db.js';

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

function getWeekOfMonth(date) {
  return Math.floor((date.getDate() - 1) / 7);
}

async function getParticipantsMap(participantsList) {
    const map = new Map();
    participantsList.forEach(p => map.set(p.id, p));
    return map;
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
        const participantTypeInitial = participant.type === '초등' ? 'elementary' : 'middle';
        const coreCategoryForType = coreCategoriesMap[participantTypeInitial];
        if (slotInfo.categoryKey === coreCategoryForType) {
            if ((prevCountsForParticipant.get(coreCategoryForType) || 0) > 0) crossPreferenceScore = -1;
        } else {
            if ((prevCountsForParticipant.get(coreCategoryForType) || 0) > 0) crossPreferenceScore = 1;
        }
    }
    return { id: participantId, gender: participant.gender, obj: participant, prevCategoryCount, prevTotalCount, currentCategoryCount, crossPreferenceScore };
}

function compareB1Participants(pA, pB, calculatedPrevTotalCounts, prevMonthAssignmentCounts, CORE_CATEGORIES) {
    const prevTotalA = calculatedPrevTotalCounts.get(pA.id) || 0;
    const prevTotalB = calculatedPrevTotalCounts.get(pB.id) || 0;
    if (prevTotalA !== prevTotalB) return prevTotalA - prevTotalB;
    const coreCategoryA = pA.type === '초등' ? CORE_CATEGORIES.elementary : CORE_CATEGORIES.middle;
    const coreCategoryB = pB.type === '초등' ? CORE_CATEGORIES.elementary : CORE_CATEGORIES.middle;
    const prevCoreCountA = prevMonthAssignmentCounts.get(pA.id)?.get(coreCategoryA) || 0;
    const prevCoreCountB = prevMonthAssignmentCounts.get(pB.id)?.get(coreCategoryB) || 0;
    if (prevCoreCountA !== prevCoreCountB) return prevCoreCountA - prevCoreCountB;
    return pA.id - pB.id;
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

export async function generateSchedule(year, month) {
    const MAX_ALLOWED_ASSIGNMENTS = 3;
    const participants = await db.getAllParticipants();
    if (!participants || participants.length === 0) throw new Error("기준정보에 등록된 인원이 없습니다.");
    for (const p of participants) {
        if (typeof p.gender === 'undefined' || !p.gender) throw new Error(`Participant ${p.name} (ID: ${p.id}) is missing gender information.`);
    }
    const participantsMap = await getParticipantsMap(participants);
    const prevMonthAssignmentCounts = await db.getPreviousMonthAssignmentCounts(year, month);
    const CORE_CATEGORIES = { elementary: 'elementary_6am', middle: 'middle_7am' };
    const calculatePrevTotalCount = (participantId) => {
        let total = 0; const counts = prevMonthAssignmentCounts.get(participantId);
        if (counts) { for (const count of counts.values()) total += count; } return total;
    };
    const calculatedPrevTotalCounts = new Map();
    participants.forEach(p => calculatedPrevTotalCounts.set(p.id, calculatePrevTotalCount(p.id)));
    const prevMonthDateForAbsenteeFetch = new Date(year, month - 1, 0);
    const prevMonthAbsenteesList = await db.getAbsenteesForMonth(prevMonthDateForAbsenteeFetch.getFullYear(), prevMonthDateForAbsenteeFetch.getMonth() + 1);
    const prevMonthAbsentees = new Set(prevMonthAbsenteesList);
    const fixedAbsenteeAssignments = new Map(); prevMonthAbsentees.forEach(id => fixedAbsenteeAssignments.set(id, 0));
    const daysInMonth = new Date(year, month, 0).getDate();
    let totalCoreSlots = { elementary_6am: 0, middle_7am: 0 };
    for (let dayIter = 1; dayIter <= daysInMonth; dayIter++) {
        const slotsForDayIter = TIME_SLOT_CONFIG[DAYS_OF_WEEK[new Date(year, month - 1, dayIter).getDay()]] || [];
        slotsForDayIter.forEach(slot => {
            if (slot.categoryKey === CORE_CATEGORIES.elementary) totalCoreSlots.elementary_6am++;
            else if (slot.categoryKey === CORE_CATEGORIES.middle) totalCoreSlots.middle_7am++;
        });
    }
    const absenteesForSecondRandomRound = new Set();
    const elementaryAbsentees = new Set(); const middleAbsentees = new Set();
    if (prevMonthAbsentees.size > 0) {
        participants.forEach(p => {
            if (prevMonthAbsentees.has(p.id)) {
                if (p.type === '초등') elementaryAbsentees.add(p.id); else if (p.type === '중등') middleAbsentees.add(p.id);
            }
        });
    }
    let elementaryTargetCoreAssignments = 2;
    if (elementaryAbsentees.size > 0 && (elementaryAbsentees.size * 2) > totalCoreSlots.elementary_6am) {
        elementaryTargetCoreAssignments = 1; elementaryAbsentees.forEach(id => absenteesForSecondRandomRound.add(id));
    }
    let middleTargetCoreAssignments = 2;
    if (middleAbsentees.size > 0 && (middleAbsentees.size * 2) > totalCoreSlots.middle_7am) {
        middleTargetCoreAssignments = 1; middleAbsentees.forEach(id => absenteesForSecondRandomRound.add(id));
    }
    let assignedCoreSlotsCount = { elementary_6am: 0, middle_7am: 0 };
    const absenteesAssignedInMainLoop = new Set();
    const activeParticipants = participants.filter(p => p.isActive);
    let generalParticipantsForB1 = activeParticipants.filter(p => !prevMonthAbsentees.has(p.id));
    generalParticipantsForB1.sort((a,b) => compareB1Participants(a,b,calculatedPrevTotalCounts, prevMonthAssignmentCounts, CORE_CATEGORIES));
    const b1CoreSelectedElementary = []; const b1CoreSelectedMiddle = [];
    for (const p of generalParticipantsForB1) {
        if (p.type === '초등' && b1CoreSelectedElementary.length < totalCoreSlots.elementary_6am * 2) b1CoreSelectedElementary.push(p);
        else if (p.type === '중등' && b1CoreSelectedMiddle.length < totalCoreSlots.middle_7am * 2) b1CoreSelectedMiddle.push(p);
    }
    if (b1CoreSelectedElementary.length > 1) b1CoreSelectedElementary.sort(() => Math.random() - 0.5);
    if (b1CoreSelectedMiddle.length > 1) b1CoreSelectedMiddle.sort(() => Math.random() - 0.5);
    console.log("B-1 Pre-selection (shuffled): Elementary candidates:", b1CoreSelectedElementary.length, "Middle candidates:", b1CoreSelectedMiddle.length);

    let scheduleData = [];
    const assignmentCounts = new Map();
    const uniqueCategoryKeys = new Set();
    Object.values(TIME_SLOT_CONFIG).flat().forEach(slot => { if (slot.categoryKey) uniqueCategoryKeys.add(slot.categoryKey); });
    uniqueCategoryKeys.add('elementary_random_fallback'); uniqueCategoryKeys.add('middle_random_fallback');
    participants.forEach(p => {
        const categoryMap = new Map(); uniqueCategoryKeys.forEach(key => categoryMap.set(key, 0));
        categoryMap.set('total', 0); assignmentCounts.set(p.id, categoryMap);
    });
    const participantWeeklyAssignments = new Map(); activeParticipants.forEach(p => participantWeeklyAssignments.set(p.id, new Set()));
    const absenteeFixedWeeklyAssignments = new Map(); activeParticipants.forEach(p => absenteeFixedWeeklyAssignments.set(p.id, new Set()));
    const elementaryParticipants = activeParticipants.filter(p => p.type === '초등');
    const middleParticipants = activeParticipants.filter(p => p.type === '중등');

    for (let day = 1; day <= daysInMonth; day++) {
        const currentDate = new Date(year, month - 1, day);
        const dayOfWeekShort = DAYS_OF_WEEK[currentDate.getDay()];
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        let dailyAssignments = new Set(); let daySchedule = { date: dateStr, dayOfWeek: dayOfWeekShort, timeSlots: [] };
        const slotsForDay = TIME_SLOT_CONFIG[dayOfWeekShort] || [];

        for (const slotInfo of slotsForDay) {
            let assignedPair = []; let fixedAssigneeId = null;
            const originalTargetPool = slotInfo.type === 'elementary' ? elementaryParticipants : middleParticipants;
            if (originalTargetPool.length < 2) continue;
            const currentWeekForSlot = getWeekOfMonth(currentDate);

            if (slotInfo.sequential) {
                const isElementaryCoreSlot = slotInfo.categoryKey === CORE_CATEGORIES.elementary;
                const isMiddleCoreSlot = slotInfo.categoryKey === CORE_CATEGORIES.middle;
                let attemptA1Successful = false;

                if (isElementaryCoreSlot || isMiddleCoreSlot) { // A-1
                    const potentialAbsenteesForFirstCoreAssignment = originalTargetPool.filter(p =>
                        prevMonthAbsentees.has(p.id) && (fixedAbsenteeAssignments.get(p.id) || 0) === 0 &&
                        !absenteeFixedWeeklyAssignments.get(p.id)?.has(currentWeekForSlot) && !dailyAssignments.has(p.id) &&
                        !((assignmentCounts.get(p.id)?.get('total') || 0) >= 2 && participantWeeklyAssignments.get(p.id)?.has(currentWeekForSlot)) &&
                        ((assignmentCounts.get(p.id)?.get('total') || 0) < MAX_ALLOWED_ASSIGNMENTS)
                    );
                    if (potentialAbsenteesForFirstCoreAssignment.length > 0) {
                        const sortedPotentialAbsentees = potentialAbsenteesForFirstCoreAssignment.map(p => getEnhancedParticipantData(p, slotInfo, prevMonthAssignmentCounts, assignmentCounts, CORE_CATEGORIES, calculatedPrevTotalCounts)).sort((a,b) => compareEnhancedParticipants(a,b,false,assignmentCounts, false));
                        for (const absenteeData of sortedPotentialAbsentees) {
                            const absenteeToAssign = absenteeData.obj;
                            const eligiblePartnersPool = originalTargetPool.filter(p => p.id !== absenteeToAssign.id && !dailyAssignments.has(p.id) && p.gender === absenteeToAssign.gender && !((assignmentCounts.get(p.id)?.get('total') || 0) >= 2 && participantWeeklyAssignments.get(p.id)?.has(currentWeekForSlot)) && ((assignmentCounts.get(p.id)?.get('total') || 0) < MAX_ALLOWED_ASSIGNMENTS));
                            const enhancedEligiblePartners = eligiblePartnersPool.map(p => getEnhancedParticipantData(p, slotInfo, prevMonthAssignmentCounts, assignmentCounts, CORE_CATEGORIES, calculatedPrevTotalCounts)).sort((a,b) => compareEnhancedParticipants(a,b,false,assignmentCounts, false));
                            let partnerToAssign = null; let preferredPartnerData = enhancedEligiblePartners.find(pd => !prevMonthAbsentees.has(pd.obj.id) || (fixedAbsenteeAssignments.get(pd.obj.id) || 0) >= (pd.obj.type === '초등' ? elementaryTargetCoreAssignments : middleTargetCoreAssignments));
                            if (preferredPartnerData) partnerToAssign = preferredPartnerData.obj; else if (enhancedEligiblePartners.length > 0) partnerToAssign = enhancedEligiblePartners[0].obj;
                            if (partnerToAssign) { assignedPair = [absenteeToAssign.id, partnerToAssign.id]; fixedAssigneeId = absenteeToAssign.id; fixedAbsenteeAssignments.set(absenteeToAssign.id, (fixedAbsenteeAssignments.get(absenteeToAssign.id) || 0) + 1); absenteeFixedWeeklyAssignments.get(absenteeToAssign.id).add(currentWeekForSlot); if (isElementaryCoreSlot) assignedCoreSlotsCount.elementary_6am++; else if (isMiddleCoreSlot) assignedCoreSlotsCount.middle_7am++; attemptA1Successful = true; absenteesAssignedInMainLoop.add(absenteeToAssign.id); if (partnerToAssign && prevMonthAbsentees.has(partnerToAssign.id)) absenteesAssignedInMainLoop.add(partnerToAssign.id); break; }
                        }
                    }
                }
                if (!attemptA1Successful && (isElementaryCoreSlot || isMiddleCoreSlot)) { // A-2
                    const potentialAbsenteesForSecondCore = originalTargetPool.filter(p => { const targetAssignments = p.type === '초등' ? elementaryTargetCoreAssignments : middleTargetCoreAssignments; return prevMonthAbsentees.has(p.id) && (fixedAbsenteeAssignments.get(p.id) || 0) === 1 && targetAssignments === 2 && !absenteeFixedWeeklyAssignments.get(p.id)?.has(currentWeekForSlot) && !dailyAssignments.has(p.id) && !((assignmentCounts.get(p.id)?.get('total') || 0) >= 2 && participantWeeklyAssignments.get(p.id)?.has(currentWeekForSlot)) && ((assignmentCounts.get(p.id)?.get('total') || 0) < MAX_ALLOWED_ASSIGNMENTS); });
                    if (potentialAbsenteesForSecondCore.length > 0) {
                        const sortedPotentialAbsentees = potentialAbsenteesForSecondCore.map(p => getEnhancedParticipantData(p, slotInfo, prevMonthAssignmentCounts, assignmentCounts, CORE_CATEGORIES, calculatedPrevTotalCounts)).sort((a,b) => compareEnhancedParticipants(a,b,false,assignmentCounts, false));
                        for (const absenteeData of sortedPotentialAbsentees) {
                            const absenteeToAssign = absenteeData.obj;
                            const eligiblePartnersPool = originalTargetPool.filter(p => p.id !== absenteeToAssign.id && !dailyAssignments.has(p.id) && p.gender === absenteeToAssign.gender && !((assignmentCounts.get(p.id)?.get('total') || 0) >= 2 && participantWeeklyAssignments.get(p.id)?.has(currentWeekForSlot)) && ((assignmentCounts.get(p.id)?.get('total') || 0) < MAX_ALLOWED_ASSIGNMENTS));
                            const enhancedEligiblePartners = eligiblePartnersPool.map(p => getEnhancedParticipantData(p, slotInfo, prevMonthAssignmentCounts, assignmentCounts, CORE_CATEGORIES, calculatedPrevTotalCounts)).sort((a,b) => compareEnhancedParticipants(a,b,false,assignmentCounts, false));
                            let partnerToAssign = null; let preferredPartnerData = enhancedEligiblePartners.find(pd => !prevMonthAbsentees.has(pd.obj.id) || (fixedAbsenteeAssignments.get(pd.obj.id) || 0) >= (pd.obj.type === '초등' ? elementaryTargetCoreAssignments : middleTargetCoreAssignments));
                            if (preferredPartnerData) partnerToAssign = preferredPartnerData.obj; else if (enhancedEligiblePartners.length > 0) partnerToAssign = enhancedEligiblePartners[0].obj;
                            if (partnerToAssign) { assignedPair = [absenteeToAssign.id, partnerToAssign.id]; fixedAssigneeId = absenteeToAssign.id; fixedAbsenteeAssignments.set(absenteeToAssign.id, (fixedAbsenteeAssignments.get(absenteeToAssign.id) || 0) + 1); absenteeFixedWeeklyAssignments.get(absenteeToAssign.id).add(currentWeekForSlot); if (isElementaryCoreSlot) assignedCoreSlotsCount.elementary_6am++; else if (isMiddleCoreSlot) assignedCoreSlotsCount.middle_7am++; absenteesAssignedInMainLoop.add(absenteeToAssign.id); if (partnerToAssign && prevMonthAbsentees.has(partnerToAssign.id)) absenteesAssignedInMainLoop.add(partnerToAssign.id); break; }
                        }
                    }
                }
                if (assignedPair.length < 2 && (isElementaryCoreSlot || isMiddleCoreSlot)) { // B-1
                    const typeKeyB1 = isElementaryCoreSlot ? 'elementary' : 'middle';
                    const coreCategoryKeyForB1 = (typeKeyB1 === 'elementary' ? CORE_CATEGORIES.elementary : CORE_CATEGORIES.middle);
                    const b1CandidatePoolForSlot = (typeKeyB1 === 'elementary' ? b1CoreSelectedElementary : b1CoreSelectedMiddle)
                        .filter(p => {
                            const pTotalAssignments = assignmentCounts.get(p.id)?.get('total') || 0;
                            const pCoreCategoryAssignments = assignmentCounts.get(p.id)?.get(coreCategoryKeyForB1) || 0;
                            return pTotalAssignments < MAX_ALLOWED_ASSIGNMENTS && pCoreCategoryAssignments === 0 &&
                                   !dailyAssignments.has(p.id) && !participantWeeklyAssignments.get(p.id)?.has(currentWeekForSlot) &&
                                   !absenteesAssignedInMainLoop.has(p.id);
                        });
                    if (b1CandidatePoolForSlot.length >= 2) {
                        b1CandidatePoolForSlot.sort(() => Math.random() - 0.5); let p1_B1 = null, p2_B1 = null;
                        for (let i = 0; i < b1CandidatePoolForSlot.length; i++) { const cand1 = b1CandidatePoolForSlot[i]; if (dailyAssignments.has(cand1.id) || participantWeeklyAssignments.get(cand1.id)?.has(currentWeekForSlot) || (assignmentCounts.get(cand1.id)?.get(coreCategoryKeyForB1) || 0) !== 0 ) continue; for (let j = i + 1; j < b1CandidatePoolForSlot.length; j++) { const cand2 = b1CandidatePoolForSlot[j]; if (dailyAssignments.has(cand2.id) || participantWeeklyAssignments.get(cand2.id)?.has(currentWeekForSlot) || (assignmentCounts.get(cand2.id)?.get(coreCategoryKeyForB1) || 0) !== 0 ) continue; if (cand1.gender === cand2.gender) { p1_B1 = cand1; p2_B1 = cand2; break; } } if (p1_B1 && p2_B1) break; }
                        if (p1_B1 && p2_B1) { assignedPair = [p1_B1.id, p2_B1.id]; fixedAssigneeId = null; if (isElementaryCoreSlot) assignedCoreSlotsCount.elementary_6am++; else if (isMiddleCoreSlot) assignedCoreSlotsCount.middle_7am++; }
                    }
                }
                if (assignedPair.length < 2) { // B-2 or General Sequential
                    if (isElementaryCoreSlot || isMiddleCoreSlot) {
                        const coreCategoryKeyForSlot = slotInfo.categoryKey;
                        let countMissingFirstCore = 0;
                        const participantPoolForB2Check = (slotInfo.type === 'elementary' ? elementaryParticipants : middleParticipants).filter(p => p.isActive && !prevMonthAbsentees.has(p.id));
                        for (const p of participantPoolForB2Check) {
                            if ((assignmentCounts.get(p.id)?.get(coreCategoryKeyForSlot) || 0) === 0) {
                                countMissingFirstCore++;
                            }
                        }
                        const b2ActivationThreshold = 0;
                        if (countMissingFirstCore <= b2ActivationThreshold) {
                            const remainingCoreSlotsForType = totalCoreSlots[coreCategoryKeyForSlot] - assignedCoreSlotsCount[coreCategoryKeyForSlot];
                            if (remainingCoreSlotsForType > 0) {
                                const potentialRegularsForSecondCore = originalTargetPool.filter(p => !prevMonthAbsentees.has(p.id) && !absenteesAssignedInMainLoop.has(p.id) && (assignmentCounts.get(p.id)?.get(coreCategoryKeyForSlot) || 0) === 1 && !dailyAssignments.has(p.id) && !((assignmentCounts.get(p.id)?.get('total') || 0) >= 2 && participantWeeklyAssignments.get(p.id)?.has(currentWeekForSlot)) && ((assignmentCounts.get(p.id)?.get('total') || 0) < MAX_ALLOWED_ASSIGNMENTS));
                                if (potentialRegularsForSecondCore.length >= 2) {
                                    const sortedRegularsForSecondCore = potentialRegularsForSecondCore.map(p => getEnhancedParticipantData(p, slotInfo, prevMonthAssignmentCounts, assignmentCounts, CORE_CATEGORIES, calculatedPrevTotalCounts)).sort((a,b) => compareEnhancedParticipants(a,b,false,assignmentCounts, false)).map(data => data.obj);
                                    let p1Obj_B2 = null, p2Obj_B2 = null;
                                    for (let i = 0; i < sortedRegularsForSecondCore.length; i++) { const candidate1_B2 = sortedRegularsForSecondCore[i]; if (dailyAssignments.has(candidate1_B2.id) || (assignmentCounts.get(candidate1_B2.id)?.get(coreCategoryKeyForSlot) || 0) !== 1) continue; p1Obj_B2 = candidate1_B2; for (let p2LoopIdx = i + 1; p2LoopIdx < sortedRegularsForSecondCore.length; p2LoopIdx++) { const candidate2_B2 = sortedRegularsForSecondCore[p2LoopIdx]; if (dailyAssignments.has(candidate2_B2.id) || candidate2_B2.id === p1Obj_B2.id || (assignmentCounts.get(candidate2_B2.id)?.get(coreCategoryKeyForSlot) || 0) !== 1) continue; if (candidate2_B2.gender === p1Obj_B2.gender) { p2Obj_B2 = candidate2_B2; break; } } if (p1Obj_B2 && p2Obj_B2) { assignedPair = [p1Obj_B2.id, p2Obj_B2.id]; fixedAssigneeId = null; if (isElementaryCoreSlot) assignedCoreSlotsCount.elementary_6am++; else if (isMiddleCoreSlot) assignedCoreSlotsCount.middle_7am++; break; } if(p1Obj_B2 && !p2Obj_B2) p1Obj_B2 = null; }
                                }
                            }
                        } else {
                             console.log(`B-2 skipped for ${coreCategoryKeyForSlot} on ${dateStr}: ${countMissingFirstCore} participants still need their first core assignment.`);
                        }
                    }
                    if (assignedPair.length < 2) { // General Sequential Fallback
                        const filteredTargetPool = originalTargetPool.filter(p => {
                            let isEligible = true; if (prevMonthAbsentees.has(p.id)) { const targetCount = (p.type === '초등' && isElementaryCoreSlot) ? elementaryTargetCoreAssignments : (p.type === '중등' && isMiddleCoreSlot) ? middleTargetCoreAssignments : 2; if ((fixedAbsenteeAssignments.get(p.id) || 0) >= targetCount) isEligible = false; if ((isElementaryCoreSlot || isMiddleCoreSlot) && absenteeFixedWeeklyAssignments.get(p.id)?.has(currentWeekForSlot)) isEligible = false; } if (!isEligible && (isElementaryCoreSlot || isMiddleCoreSlot)) return false;
                            const pCountsMap = assignmentCounts.get(p.id); const pWeeklyAssignments = participantWeeklyAssignments.get(p.id);
                            if ((pCountsMap.get('total') || 0) >= 2 && pWeeklyAssignments.has(currentWeekForSlot)) return false;
                            if ((pCountsMap.get('total') || 0) >= MAX_ALLOWED_ASSIGNMENTS) return false;
                            return !dailyAssignments.has(p.id);
                        });
                        const enhancedTargetPool = filteredTargetPool.map(p => getEnhancedParticipantData(p, slotInfo, prevMonthAssignmentCounts, assignmentCounts, CORE_CATEGORIES, calculatedPrevTotalCounts)).sort((a,b) => compareEnhancedParticipants(a,b,false,assignmentCounts, false));
                        const sortedTargetPool = enhancedTargetPool.map(data => data.obj); let p1Obj = null, p2Obj = null;
                        if (sortedTargetPool.length >= 2) { for (let i = 0; i < sortedTargetPool.length; i++) { const cand1 = sortedTargetPool[i]; if(dailyAssignments.has(cand1.id)) continue; for (let j = i + 1; j < sortedTargetPool.length; j++) { const cand2 = sortedTargetPool[j]; if(dailyAssignments.has(cand2.id) || cand1.id === cand2.id) continue; if (cand1.gender === cand2.gender) { p1Obj = cand1; p2Obj = cand2; break; } } if (p1Obj && p2Obj) break; } }
                        if (p1Obj && p2Obj) {
                            assignedPair = [p1Obj.id, p2Obj.id]; fixedAssigneeId = null;
                            [p1Obj, p2Obj].forEach(person => { if (prevMonthAbsentees.has(person.id) && (isElementaryCoreSlot || isMiddleCoreSlot)) { const targetCount = (person.type === '초등') ? elementaryTargetCoreAssignments : middleTargetCoreAssignments; if ((fixedAbsenteeAssignments.get(person.id) || 0) < targetCount && !absenteeFixedWeeklyAssignments.get(person.id)?.has(currentWeekForSlot) ) { fixedAbsenteeAssignments.set(person.id, (fixedAbsenteeAssignments.get(person.id) || 0) + 1); absenteeFixedWeeklyAssignments.get(person.id).add(currentWeekForSlot); if (!fixedAssigneeId) fixedAssigneeId = person.id; } } });
                            if (isElementaryCoreSlot || isMiddleCoreSlot) { if (slotInfo.categoryKey === CORE_CATEGORIES.elementary) assignedCoreSlotsCount.elementary_6am++; else if (slotInfo.categoryKey === CORE_CATEGORIES.middle) assignedCoreSlotsCount.middle_7am++; }
                        }
                    }
                }
            } else if (slotInfo.random) {
                let eligibleForRandomRaw = originalTargetPool.filter(p => {
                    if (dailyAssignments.has(p.id)) return false; const pCountsMap = assignmentCounts.get(p.id); const pWeeklyAssignments = participantWeeklyAssignments.get(p.id);
                    if ((pCountsMap.get('total') || 0) >= 2 && pWeeklyAssignments.has(currentWeekForSlot)) return false;
                    if ((pCountsMap.get('total') || 0) >= MAX_ALLOWED_ASSIGNMENTS) return false;
                    return true;
                });
                const nonAbsentees = eligibleForRandomRaw.filter(p => !prevMonthAbsentees.has(p.id)); if (nonAbsentees.length >= 2) eligibleForRandomRaw = nonAbsentees;
                const enhancedEligibleForRandom = eligibleForRandomRaw.map(p => getEnhancedParticipantData(p, slotInfo, prevMonthAssignmentCounts, assignmentCounts, CORE_CATEGORIES, calculatedPrevTotalCounts));
                enhancedEligibleForRandom.sort((a,b) => compareEnhancedParticipants(a,b,true,assignmentCounts, true));
                let p1Data = null, p2Data = null;
                for (let i = 0; i < enhancedEligibleForRandom.length; i++) { p1Data = enhancedEligibleForRandom[i]; for (let j = i + 1; j < enhancedEligibleForRandom.length; j++) { p2Data = enhancedEligibleForRandom[j]; if (p1Data.gender === p2Data.gender) { assignedPair = [p1Data.id, p2Data.id]; break; } } if (assignedPair.length === 2) break; p2Data = null; }
                if (!p1Data || !p2Data || assignedPair.length < 2) assignedPair = [];
                if (assignedPair.length < 2 && eligibleForRandomRaw.length >=2) {
                    const poolForFallback = enhancedEligibleForRandom.map(data => data.obj); let p1Obj = null, p2Obj = null;
                    for (let i = 0; i < poolForFallback.length; i++) { const candidate1 = poolForFallback[i]; if (dailyAssignments.has(candidate1.id)) continue; p1Obj = candidate1; for (let j = i + 1; j < poolForFallback.length; j++) { const candidate2 = poolForFallback[j]; if (dailyAssignments.has(candidate2.id) || candidate2.id === p1Obj.id) continue; if (candidate2.gender === p1Obj.gender) { p2Obj = candidate2; break; } } if (p1Obj && p2Obj) { assignedPair = [p1Obj.id, p2Obj.id]; break; } if(p1Obj && !p2Obj) p1Obj = null; }
                }
            }

            if (assignedPair.length === 2) {
                assignedPair.forEach(id => { dailyAssignments.add(id); const countsForParticipant = assignmentCounts.get(id); countsForParticipant.set('total', (countsForParticipant.get('total') || 0) + 1); if (slotInfo.categoryKey) countsForParticipant.set(slotInfo.categoryKey, (countsForParticipant.get(slotInfo.categoryKey) || 0) + 1); participantWeeklyAssignments.get(id).add(currentWeekForSlot); });
                daySchedule.timeSlots.push({ time: slotInfo.time, type: slotInfo.type, assigned: assignedPair, assignedNames: assignedPair.map(id => participantsMap.get(id)?.name || `ID:${id}`), isFixedStatus: assignedPair.map(id => id === fixedAssigneeId && fixedAssigneeId !== null), categoryKey: slotInfo.categoryKey });
            } else {
                daySchedule.timeSlots.push({ time: slotInfo.time, type: slotInfo.type, assigned: [], assignedNames: ['미배정'], isFixedStatus: [false, false], categoryKey: slotInfo.categoryKey });
            }
        }
        if (daySchedule.timeSlots.length > 0) scheduleData.push(daySchedule);
    }

    console.log("Attempting 2nd round 'non-core' assignments for absentees who still need them.");
    const absenteesStillNeedingSecondAssignmentFiltered = activeParticipants.filter(p => prevMonthAbsentees.has(p.id) && (fixedAbsenteeAssignments.get(p.id) || 0) < 2 && ((assignmentCounts.get(p.id)?.get('total') || 0) < MAX_ALLOWED_ASSIGNMENTS) && (absenteesForSecondRandomRound.has(p.id) || ((p.type === '초등' && elementaryTargetCoreAssignments === 2) || (p.type === '중등' && middleTargetCoreAssignments === 2))));
    if (absenteesStillNeedingSecondAssignmentFiltered.length > 0) {
        console.log("Absentees for 2nd non-core round:", absenteesStillNeedingSecondAssignmentFiltered.map(p=>p.name));
        const postLoopDailyAssignments_A2_NonCore = new Map();
        for(let d = 1; d <= daysInMonth; d++) { const dateStrKey = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`; postLoopDailyAssignments_A2_NonCore.set(dateStrKey, new Set()); const dayScheduleFromMainLoop = scheduleData.find(ds => ds.date === dateStrKey); if (dayScheduleFromMainLoop) dayScheduleFromMainLoop.timeSlots.forEach(slot => slot.assigned.forEach(id => postLoopDailyAssignments_A2_NonCore.get(dateStrKey).add(id))); }

        for (const absentee of absenteesStillNeedingSecondAssignmentFiltered) {
            if ((fixedAbsenteeAssignments.get(absentee.id) || 0) >= 2 || (assignmentCounts.get(absentee.id)?.get('total') || 0) >= MAX_ALLOWED_ASSIGNMENTS) continue;
            for (let day = 1; day <= daysInMonth; day++) {
                if ((fixedAbsenteeAssignments.get(absentee.id) || 0) >= 2 || (assignmentCounts.get(absentee.id)?.get('total') || 0) >= MAX_ALLOWED_ASSIGNMENTS) break;
                const currentDate = new Date(year, month - 1, day); const currentWeek = getWeekOfMonth(currentDate); const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`; const dailyAssignedForThisDay = postLoopDailyAssignments_A2_NonCore.get(dateStr);
                if (absenteeFixedWeeklyAssignments.get(absentee.id)?.has(currentWeek) || dailyAssignedForThisDay.has(absentee.id)) continue;
                const slotsForDay = TIME_SLOT_CONFIG[DAYS_OF_WEEK[currentDate.getDay()]] || [];
                for (const slotInfo_A2_NonCore of slotsForDay) {
                    if ((fixedAbsenteeAssignments.get(absentee.id) || 0) >= 2 || (assignmentCounts.get(absentee.id)?.get('total') || 0) >= MAX_ALLOWED_ASSIGNMENTS) break;
                    if (slotInfo_A2_NonCore.categoryKey === CORE_CATEGORIES.elementary || slotInfo_A2_NonCore.categoryKey === CORE_CATEGORIES.middle) continue;
                    const daySch = scheduleData.find(ds => ds.date === dateStr); if (!daySch) continue;
                    const targetSlot = daySch.timeSlots.find(ts => ts.time === slotInfo_A2_NonCore.time && ts.type === slotInfo_A2_NonCore.type && ts.categoryKey === slotInfo_A2_NonCore.categoryKey);
                    if (!targetSlot || targetSlot.assigned.length > 0) continue;
                    if (((assignmentCounts.get(absentee.id)?.get('total') || 0) >= 2 && participantWeeklyAssignments.get(absentee.id)?.has(currentWeek))) continue;
                    const partnerPool = (absentee.type === '초등' ? elementaryParticipants : middleParticipants).filter(p => p.id !== absentee.id && !dailyAssignedForThisDay.has(p.id) && p.gender === absentee.gender && !(((assignmentCounts.get(p.id)?.get('total') || 0) >= 2 && participantWeeklyAssignments.get(p.id)?.has(currentWeek))) && ((assignmentCounts.get(p.id)?.get('total') || 0) < MAX_ALLOWED_ASSIGNMENTS) );
                    if (partnerPool.length > 0) {
                        const partner = partnerPool[0]; targetSlot.assigned = [absentee.id, partner.id]; targetSlot.assignedNames = [participantsMap.get(absentee.id)?.name, participantsMap.get(partner.id)?.name]; targetSlot.isFixedStatus = [false, false]; dailyAssignedForThisDay.add(absentee.id); dailyAssignedForThisDay.add(partner.id); fixedAbsenteeAssignments.set(absentee.id, (fixedAbsenteeAssignments.get(absentee.id) || 0) + 1);
                        [absentee.id, partner.id].forEach(pid => { const counts = assignmentCounts.get(pid); counts.set('total', (counts.get('total') || 0) + 1); if (slotInfo_A2_NonCore.categoryKey) counts.set(slotInfo_A2_NonCore.categoryKey, (counts.get(slotInfo_A2_NonCore.categoryKey) || 0) + 1); participantWeeklyAssignments.get(pid).add(currentWeek); });
                        break;
                    }
                }
            }
        }
    }

    console.log("C-Step: Attempting 2nd assignment for all participants with < 2 total, prioritizing by last month's total assignments.");
    if (MAX_ALLOWED_ASSIGNMENTS >= 2) {
        const postLoopDailyAssignments_C = new Map();
        for(let d = 1; d <= daysInMonth; d++) { const dateStrKey = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`; postLoopDailyAssignments_C.set(dateStrKey, new Set()); const dayScheduleFromMainLoop = scheduleData.find(ds => ds.date === dateStrKey); if (dayScheduleFromMainLoop) dayScheduleFromMainLoop.timeSlots.forEach(slot => slot.assigned.forEach(id => postLoopDailyAssignments_C.get(dateStrKey).add(id))); }
        let participantsForCStep = activeParticipants.filter(p => (assignmentCounts.get(p.id)?.get('total') || 0) < 2 && (assignmentCounts.get(p.id)?.get('total') || 0) < MAX_ALLOWED_ASSIGNMENTS);
        if (participantsForCStep.length >= 2) {
            console.log(`C-Step: Found ${participantsForCStep.length} participants with < 2 assignments.`);
            let sortedParticipantsForCStep = [...participantsForCStep].sort((pA, pB) => { const prevTotalA = calculatedPrevTotalCounts.get(pA.id) || 0; const prevTotalB = calculatedPrevTotalCounts.get(pB.id) || 0; if (prevTotalA !== prevTotalB) return prevTotalA - prevTotalB; return pA.id - pB.id; });
            const candidatePairsForC = []; const pairedIdsInCStepPass = new Set();
            for (let i = 0; i < sortedParticipantsForCStep.length; i++) { const p1 = sortedParticipantsForCStep[i]; if (pairedIdsInCStepPass.has(p1.id) || (assignmentCounts.get(p1.id)?.get('total') || 0) >= 2 || (assignmentCounts.get(p1.id)?.get('total') || 0) >= MAX_ALLOWED_ASSIGNMENTS) continue; for (let j = i + 1; j < sortedParticipantsForCStep.length; j++) { const p2 = sortedParticipantsForCStep[j]; if (pairedIdsInCStepPass.has(p2.id) || (assignmentCounts.get(p2.id)?.get('total') || 0) >= 2 || (assignmentCounts.get(p2.id)?.get('total') || 0) >= MAX_ALLOWED_ASSIGNMENTS) continue; if (p1.gender === p2.gender) { candidatePairsForC.push({ p1: p1, p2: p2 }); pairedIdsInCStepPass.add(p1.id); pairedIdsInCStepPass.add(p2.id); break; } } }
            console.log(`C-Step: Generated ${candidatePairsForC.length} candidate pairs.`);
            const remainingEmptySlots_C = []; scheduleData.forEach(daySch => daySch.timeSlots.forEach(slot => { if (slot.assigned.length === 0) remainingEmptySlots_C.push({ date: daySch.date, ...slot }); }));
            console.log(`C-Step: Found ${remainingEmptySlots_C.length} empty slots.`);
            let assignedInCStepCount = 0; remainingEmptySlots_C.sort(() => Math.random() - 0.5);
            for (const pairToAssign of candidatePairsForC) {
                const p1 = pairToAssign.p1; const p2 = pairToAssign.p2;
                if (((assignmentCounts.get(p1.id)?.get('total') || 0) >= 2 || (assignmentCounts.get(p1.id)?.get('total') || 0) >= MAX_ALLOWED_ASSIGNMENTS) && ((assignmentCounts.get(p2.id)?.get('total') || 0) >= 2 || (assignmentCounts.get(p2.id)?.get('total') || 0) >= MAX_ALLOWED_ASSIGNMENTS)) continue;
                let cStepAssignedThisPair = false;
                for (const emptySlot of remainingEmptySlots_C) {
                    if (emptySlot.cStepAssigned) continue; const currentDate_C = new Date(emptySlot.date); const currentWeek_C = getWeekOfMonth(currentDate_C); const dailyAssignedForThisDay_C = postLoopDailyAssignments_C.get(emptySlot.date);
                    const p1CanBeAssigned = !dailyAssignedForThisDay_C.has(p1.id) && !participantWeeklyAssignments.get(p1.id)?.has(currentWeek_C) && (assignmentCounts.get(p1.id)?.get('total') || 0) < 2 && (assignmentCounts.get(p1.id)?.get('total') || 0) < MAX_ALLOWED_ASSIGNMENTS;
                    const p2CanBeAssigned = !dailyAssignedForThisDay_C.has(p2.id) && !participantWeeklyAssignments.get(p2.id)?.has(currentWeek_C) && (assignmentCounts.get(p2.id)?.get('total') || 0) < 2 && (assignmentCounts.get(p2.id)?.get('total') || 0) < MAX_ALLOWED_ASSIGNMENTS;
                    if (p1CanBeAssigned && p2CanBeAssigned) {
                        const daySchToUpdate = scheduleData.find(ds => ds.date === emptySlot.date); const slotToUpdate = daySchToUpdate.timeSlots.find(s => s.time === emptySlot.time && s.type === emptySlot.type && s.categoryKey === emptySlot.categoryKey);
                        slotToUpdate.assigned = [p1.id, p2.id]; slotToUpdate.assignedNames = [participantsMap.get(p1.id)?.name, participantsMap.get(p2.id)?.name]; slotToUpdate.isFixedStatus = [false, false]; dailyAssignedForThisDay_C.add(p1.id); dailyAssignedForThisDay_C.add(p2.id);
                        [p1.id, p2.id].forEach(pid => { const counts = assignmentCounts.get(pid); counts.set('total', (counts.get('total') || 0) + 1); if (slotToUpdate.categoryKey) counts.set(slotToUpdate.categoryKey, (counts.get(slotToUpdate.categoryKey) || 0) + 1); participantWeeklyAssignments.get(pid).add(currentWeek_C); });
                        assignedInCStepCount++; emptySlot.cStepAssigned = true; cStepAssignedThisPair = true; break;
                    }
                }
                if (!cStepAssignedThisPair) console.log(`C-Step: Could not find a suitable slot for pair ${p1.name} & ${p2.name}.`);
            }
            if (assignedInCStepCount > 0) console.log(`C-Step: Assigned ${assignedInCStepCount} pairs.`);
        } else console.log("C-Step: Not enough participants needing more assignments, or all eligible have 2 or met MAX_ALLOWED_ASSIGNMENTS.");
    }

    console.log("D-Step: Final random assignments for any remaining slots.");
    const postLoopDailyAssignments_D = new Map();
    for(let d = 1; d <= daysInMonth; d++) { const dateStrKey = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`; postLoopDailyAssignments_D.set(dateStrKey, new Set()); const dayScheduleFromCurrent = scheduleData.find(ds => ds.date === dateStrKey); if (dayScheduleFromCurrent) dayScheduleFromCurrent.timeSlots.forEach(slot => slot.assigned.forEach(id => postLoopDailyAssignments_D.get(dateStrKey).add(id))); }
    let dStepAssignedCount = 0; const emptySlotsForDStep = [];
    scheduleData.forEach(daySch => daySch.timeSlots.forEach(slot => { if (slot.assigned.length === 0) emptySlotsForDStep.push({ date: daySch.date, ...slot }); }));
    if (emptySlotsForDStep.length > 0) {
        console.log(`D-Step: Found ${emptySlotsForDStep.length} empty slots for final assignment.`);
        emptySlotsForDStep.sort(() => Math.random() - 0.5);
        for (const emptySlot of emptySlotsForDStep) {
            const daySchToUpdate = scheduleData.find(ds => ds.date === emptySlot.date); const slotToUpdate = daySchToUpdate?.timeSlots.find(s => s.time === emptySlot.time && s.type === emptySlot.type && s.categoryKey === emptySlot.categoryKey); if (!slotToUpdate || slotToUpdate.assigned.length > 0) continue;
            const currentDateD = new Date(emptySlot.date); const currentWeekD = getWeekOfMonth(currentDateD); const dailyAssignedForThisDay_D = postLoopDailyAssignments_D.get(emptySlot.date);
            let potentialP1List_D = activeParticipants.filter(p => !dailyAssignedForThisDay_D.has(p.id) && !participantWeeklyAssignments.get(p.id)?.has(currentWeekD) && (assignmentCounts.get(p.id)?.get('total') || 0) < MAX_ALLOWED_ASSIGNMENTS);
            if (potentialP1List_D.length === 0) continue;
            const tempSlotInfoForDSort = { categoryKey: emptySlot.categoryKey || 'general_D_step_sort' };
            const sortedPotentialP1_D = potentialP1List_D.map(p => getEnhancedParticipantData(p, tempSlotInfoForDSort, prevMonthAssignmentCounts, assignmentCounts, CORE_CATEGORIES, calculatedPrevTotalCounts)).sort((a,b) => { const totalA_D = assignmentCounts.get(a.id)?.get('total') || 0; const totalB_D = assignmentCounts.get(b.id)?.get('total') || 0; if (totalA_D !== totalB_D) return totalA_D - totalB_D; return Math.random() - 0.5; });
            if (sortedPotentialP1_D.length === 0) continue;
            let p1_D = null, p2_D = null;
            for (const p1Data_D of sortedPotentialP1_D) {
                const candidateP1 = p1Data_D.obj; if (dailyAssignedForThisDay_D.has(candidateP1.id) || participantWeeklyAssignments.get(candidateP1.id)?.has(currentWeekD)) continue;
                let potentialPartners_D = activeParticipants.filter(p => p.id !== candidateP1.id && !dailyAssignedForThisDay_D.has(p.id) && p.gender === candidateP1.gender && !participantWeeklyAssignments.get(p.id)?.has(currentWeekD) && (assignmentCounts.get(p.id)?.get('total') || 0) < MAX_ALLOWED_ASSIGNMENTS);
                if (potentialPartners_D.length > 0) {
                    const sortedPotentialPartners_D = potentialPartners_D.map(p => getEnhancedParticipantData(p, tempSlotInfoForDSort, prevMonthAssignmentCounts, assignmentCounts, CORE_CATEGORIES, calculatedPrevTotalCounts)).sort((a,b) => { const totalA_DP = assignmentCounts.get(a.id)?.get('total') || 0; const totalB_DP = assignmentCounts.get(b.id)?.get('total') || 0; if (totalA_DP !== totalB_DP) return totalA_DP - totalB_DP; return Math.random() - 0.5; });
                    if (sortedPotentialPartners_D.length > 0) { p1_D = candidateP1; p2_D = sortedPotentialPartners_D[0].obj; break; }
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
    if (dStepAssignedCount > 0) console.log(`D-Step: Assigned ${dStepAssignedCount} additional pairs.`);
    
    await db.saveSchedule(year, month, scheduleData);
    let summaryLines = ["초등학생 배정 현황 요약:"];
    const elementaryStudentCounts = new Map();
    for (const participant of participants) {
        if (participant.type === '초등') {
            const studentId = participant.id;
            const studentName = participant.name;
            const studentAssignmentCountsMap = assignmentCounts.get(studentId); // This is a Map
            const totalAssignments = studentAssignmentCountsMap?.get('total') || 0;

            let categoryDetails = [];
            if (studentAssignmentCountsMap) {
                for (const [categoryKey, count] of studentAssignmentCountsMap.entries()) {
                    if (categoryKey !== 'total' && count > 0) {
                        categoryDetails.push(`${categoryKey}: ${count}회`); // Use raw categoryKey
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
            console.log(`Monthly assignment counts for ${year}-${month} saved.`);
        }
    } catch (error) { console.error(`Failed to save monthly assignment counts for ${year}-${month}:`, error); }
    if (absenteesForSecondRandomRound.size > 0) {
        console.log(`Participants targeted for a potential 2nd random assignment (due to reduced core slots):`, Array.from(absenteesForSecondRandomRound));
        absenteesForSecondRandomRound.forEach(absenteeId => {
            const absentee = participantsMap.get(absenteeId);
            if (absentee && (fixedAbsenteeAssignments.get(absenteeId) || 0) < 2) {
                 console.log(`Participant ${absentee.name} (ID: ${absenteeId}, Type: ${absentee.type}) still needs ${2 - (fixedAbsenteeAssignments.get(absenteeId) || 0)} core assignments, targeted for random.`);
            }
        });
    }
    return { schedule: scheduleData, assignmentSummary: summaryString };
}
