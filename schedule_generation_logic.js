import * as db from './db.js';

const TIME_SLOT_CONFIG = {
    'Mon': [{ time: '06:00', type: 'elementary', sequential: true, categoryKey: 'elementary_6am' }],
    'Tue': [{ time: '17:00', type: 'elementary', random: true, categoryKey: 'elementary_random' }],
    'Wed': [{ time: '06:00', type: 'elementary', sequential: true, categoryKey: 'elementary_6am' }],
    'Thu': [{ time: '17:00', type: 'elementary', random: true, categoryKey: 'elementary_random' }],
    'Fri': [{ time: '06:00', type: 'elementary', sequential: true, categoryKey: 'elementary_6am' }],
    'Sat': [{ time: '16:00', type: 'elementary', random: true, categoryKey: 'elementary_random' }, { time: '18:00', type: 'middle', random: true, categoryKey: 'middle_random' }],
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

function getEnhancedParticipantData(participant, slotInfo, prevMonthAssignmentCounts, currentMonthAssignmentCounts, coreCategoriesMap, calculatedPrevTotalCounts) {
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
            if ((prevCountsForParticipant.get(coreCategoryForType) || 0) > 0) {
                crossPreferenceScore = -1;
            }
        } else {
            if ((prevCountsForParticipant.get(coreCategoryForType) || 0) > 0) {
                crossPreferenceScore = 1;
            }
        }
    }

    return {
        id: participantId,
        gender: participant.gender,
        obj: participant,
        prevCategoryCount,
        prevTotalCount,
        currentCategoryCount,
        crossPreferenceScore
    };
}

function compareEnhancedParticipants(aData, bData, prioritizeZeroCurrentMonthTotal = false, assignmentCountsForSort = null, useRandomTieBreaker = false) {
    if (prioritizeZeroCurrentMonthTotal && assignmentCountsForSort) {
        const totalA = assignmentCountsForSort.get(aData.id)?.get('total') || 0;
        const totalB = assignmentCountsForSort.get(bData.id)?.get('total') || 0;

        if (totalA === 0 && totalB > 0) return -1;
        if (totalA > 0 && totalB === 0) return 1;
    }

    if (aData.prevCategoryCount !== bData.prevCategoryCount) {
        return aData.prevCategoryCount - bData.prevCategoryCount;
    }
    if (aData.crossPreferenceScore !== bData.crossPreferenceScore) {
        return bData.crossPreferenceScore - aData.crossPreferenceScore;
    }
    if (aData.prevTotalCount !== bData.prevTotalCount) {
        return aData.prevTotalCount - bData.prevTotalCount;
    }
    if (aData.currentCategoryCount !== bData.currentCategoryCount) {
        return aData.currentCategoryCount - bData.currentCategoryCount;
    }

    if (useRandomTieBreaker) {
        return Math.random() - 0.5;
    } else {
        return aData.id - bData.id;
    }
}


export async function generateSchedule(year, month) {
    const participants = await db.getAllParticipants();
    if (!participants || participants.length === 0) {
        throw new Error("기준정보에 등록된 인원이 없습니다.");
    }

    for (const p of participants) {
        if (typeof p.gender === 'undefined' || !p.gender) {
             throw new Error(`Participant ${p.name} (ID: ${p.id}) is missing gender information.`);
        }
    }
    const participantsMap = await getParticipantsMap(participants);

    const prevMonthAssignmentCounts = await db.getPreviousMonthAssignmentCounts(year, month);
    const CORE_CATEGORIES = {
        elementary: 'elementary_6am',
        middle: 'middle_7am'
    };

    const calculatePrevTotalCount = (participantId) => {
        let total = 0;
        const counts = prevMonthAssignmentCounts.get(participantId);
        if (counts) {
            for (const count of counts.values()) {
                total += count;
            }
        }
        return total;
    };

    const calculatedPrevTotalCounts = new Map();
    participants.forEach(p => {
        calculatedPrevTotalCounts.set(p.id, calculatePrevTotalCount(p.id));
    });

    const prevMonthDateForAbsenteeFetch = new Date(year, month - 1, 0);
    const prevYearForAbsenteeFetch = prevMonthDateForAbsenteeFetch.getFullYear();
    const prevMonthForAbsenteeFetch = prevMonthDateForAbsenteeFetch.getMonth() + 1;
    const prevMonthAbsenteesList = await db.getAbsenteesForMonth(prevYearForAbsenteeFetch, prevMonthForAbsenteeFetch);
    const prevMonthAbsentees = new Set(prevMonthAbsenteesList);

    const fixedAbsenteeAssignments = new Map();
    prevMonthAbsentees.forEach(id => fixedAbsenteeAssignments.set(id, 0));

    const daysInMonth = new Date(year, month, 0).getDate();

    let totalCoreSlots = { elementary_6am: 0, middle_7am: 0 };
    for (let dayIter = 1; dayIter <= daysInMonth; dayIter++) {
        const dayOfWeekShortIter = DAYS_OF_WEEK[new Date(year, month - 1, dayIter).getDay()];
        const slotsForDayIter = TIME_SLOT_CONFIG[dayOfWeekShortIter] || [];
        slotsForDayIter.forEach(slot => {
            if (slot.categoryKey === CORE_CATEGORIES.elementary) {
                totalCoreSlots.elementary_6am++;
            } else if (slot.categoryKey === CORE_CATEGORIES.middle) {
                totalCoreSlots.middle_7am++;
            }
        });
    }

    const absenteesForSecondRandomRound = new Set();
    const numberOfAbsentees = prevMonthAbsentees.size;

    const elementaryAbsentees = new Set();
    const middleAbsentees = new Set();
    if (numberOfAbsentees > 0) {
        participants.forEach(p => {
            if (prevMonthAbsentees.has(p.id)) {
                if (p.type === '초등') elementaryAbsentees.add(p.id);
                else if (p.type === '중등') middleAbsentees.add(p.id);
            }
        });
    }

    let elementaryTargetCoreAssignments = 2;
    if (elementaryAbsentees.size > 0 && (elementaryAbsentees.size * 2) > totalCoreSlots.elementary_6am) {
        elementaryTargetCoreAssignments = 1;
        elementaryAbsentees.forEach(id => absenteesForSecondRandomRound.add(id));
    }

    let middleTargetCoreAssignments = 2;
    if (middleAbsentees.size > 0 && (middleAbsentees.size * 2) > totalCoreSlots.middle_7am) {
        middleTargetCoreAssignments = 1;
        middleAbsentees.forEach(id => absenteesForSecondRandomRound.add(id));
    }

    let assignedCoreSlotsCount = { elementary_6am: 0, middle_7am: 0 };

    let scheduleData = [];

    const assignmentCounts = new Map(); 
    const uniqueCategoryKeys = new Set();
    Object.values(TIME_SLOT_CONFIG).flat().forEach(slot => {
        if (slot.categoryKey) uniqueCategoryKeys.add(slot.categoryKey);
    });
    uniqueCategoryKeys.add('elementary_random_fallback');
    uniqueCategoryKeys.add('middle_random_fallback');

    participants.forEach(p => {
        const categoryMap = new Map();
        uniqueCategoryKeys.forEach(key => categoryMap.set(key, 0));
        categoryMap.set('total', 0);
        assignmentCounts.set(p.id, categoryMap);
    });

    const participantWeeklyAssignments = new Map();
    participants.forEach(p => participantWeeklyAssignments.set(p.id, new Set()));

    const absenteeFixedWeeklyAssignments = new Map();
    participants.forEach(p => absenteeFixedWeeklyAssignments.set(p.id, new Set()));
    
    const sequentialStateKeys = {
        'elementary_6am': 'idx_elem_6am',
        'middle_7am': 'idx_mid_7am',
        'elementary_random_fallback': 'idx_elem_rand_fallback',
        'middle_random_fallback': 'idx_mid_rand_fallback',
    };
    const scheduleIndices = {};
    for (const key of Object.values(sequentialStateKeys)) {
        scheduleIndices[key] = await db.getScheduleState(key) || 0;
    }
    
    const elementaryParticipants = participants.filter(p => p.type === '초등' && p.isActive);
    const middleParticipants = participants.filter(p => p.type === '중등' && p.isActive);

    // Main loop for A and B stages (filling slots day by day)
    for (let day = 1; day <= daysInMonth; day++) {
        const currentDate = new Date(year, month - 1, day);
        const dayOfWeekShort = DAYS_OF_WEEK[currentDate.getDay()];
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        let dailyAssignments = new Set(); 
        let daySchedule = { date: dateStr, dayOfWeek: dayOfWeekShort, timeSlots: [] };

        const slotsForDay = TIME_SLOT_CONFIG[dayOfWeekShort] || [];

        for (const slotInfo of slotsForDay) {
            let assignedPair = [];
            let fixedAssigneeId = null;

            const originalTargetPool = slotInfo.type === 'elementary' ? elementaryParticipants : middleParticipants;
            if (originalTargetPool.length < 2) continue;

            const currentWeekForSlot = getWeekOfMonth(currentDate);

            if (slotInfo.sequential) {
                const isElementaryCoreSlot = slotInfo.categoryKey === CORE_CATEGORIES.elementary;
                const isMiddleCoreSlot = slotInfo.categoryKey === CORE_CATEGORIES.middle;
                let attemptA1Successful = false;

                if (isElementaryCoreSlot || isMiddleCoreSlot) { // A-1
                    const potentialAbsenteesForFirstCoreAssignment = originalTargetPool.filter(p => {
                        return prevMonthAbsentees.has(p.id) &&
                               (fixedAbsenteeAssignments.get(p.id) || 0) === 0 &&
                               !absenteeFixedWeeklyAssignments.get(p.id)?.has(currentWeekForSlot) &&
                               !dailyAssignments.has(p.id) &&
                               !((assignmentCounts.get(p.id)?.get('total') || 0) >= 2 && participantWeeklyAssignments.get(p.id)?.has(currentWeekForSlot));
                    });

                    if (potentialAbsenteesForFirstCoreAssignment.length > 0) {
                        const sortedPotentialAbsentees = potentialAbsenteesForFirstCoreAssignment
                            .map(p => getEnhancedParticipantData(p, slotInfo, prevMonthAssignmentCounts, assignmentCounts, CORE_CATEGORIES, calculatedPrevTotalCounts))
                            .sort((a,b) => compareEnhancedParticipants(a,b,false,assignmentCounts, false));

                        for (const absenteeData of sortedPotentialAbsentees) {
                            const absenteeToAssign = absenteeData.obj;
                            const eligiblePartnersPool = originalTargetPool.filter(p => {
                                if (p.id === absenteeToAssign.id || dailyAssignments.has(p.id) || p.gender !== absenteeToAssign.gender) return false;
                                const pCountsMap = assignmentCounts.get(p.id);
                                const pWeeklyAssignments = participantWeeklyAssignments.get(p.id);
                                return !((pCountsMap.get('total') || 0) >= 2 && pWeeklyAssignments.has(currentWeekForSlot));
                            });

                            const enhancedEligiblePartners = eligiblePartnersPool
                                .map(p => getEnhancedParticipantData(p, slotInfo, prevMonthAssignmentCounts, assignmentCounts, CORE_CATEGORIES, calculatedPrevTotalCounts))
                                .sort((a,b) => compareEnhancedParticipants(a,b,false,assignmentCounts, false));

                            let partnerToAssign = null;
                            let preferredPartnerData = enhancedEligiblePartners.find(pd => {
                                const p = pd.obj;
                                const partnerTargetCoreAssignments = (p.type === '초등') ? elementaryTargetCoreAssignments : middleTargetCoreAssignments;
                                return !prevMonthAbsentees.has(p.id) || (fixedAbsenteeAssignments.get(p.id) || 0) >= partnerTargetCoreAssignments;
                            });

                            if (preferredPartnerData) {
                                partnerToAssign = preferredPartnerData.obj;
                            } else if (enhancedEligiblePartners.length > 0) {
                                partnerToAssign = enhancedEligiblePartners[0].obj;
                            }

                            if (partnerToAssign) {
                                assignedPair = [absenteeToAssign.id, partnerToAssign.id];
                                fixedAssigneeId = absenteeToAssign.id;
                                fixedAbsenteeAssignments.set(absenteeToAssign.id, (fixedAbsenteeAssignments.get(absenteeToAssign.id) || 0) + 1);
                                absenteeFixedWeeklyAssignments.get(absenteeToAssign.id).add(currentWeekForSlot);
                                if (isElementaryCoreSlot) assignedCoreSlotsCount.elementary_6am++;
                                else if (isMiddleCoreSlot) assignedCoreSlotsCount.middle_7am++;
                                attemptA1Successful = true;
                                break;
                            }
                        }
                    }
                } // End of A-1

                if (!attemptA1Successful && (isElementaryCoreSlot || isMiddleCoreSlot)) { // A-2
                    const potentialAbsenteesForSecondCore = originalTargetPool.filter(p => {
                        const targetAssignments = p.type === '초등' ? elementaryTargetCoreAssignments : middleTargetCoreAssignments;
                        return prevMonthAbsentees.has(p.id) &&
                               (fixedAbsenteeAssignments.get(p.id) || 0) === 1 &&
                               targetAssignments === 2 &&
                               !absenteeFixedWeeklyAssignments.get(p.id)?.has(currentWeekForSlot) &&
                               !dailyAssignments.has(p.id) &&
                               !((assignmentCounts.get(p.id)?.get('total') || 0) >= 2 && participantWeeklyAssignments.get(p.id)?.has(currentWeekForSlot));
                    });

                    if (potentialAbsenteesForSecondCore.length > 0) {
                         const sortedPotentialAbsentees = potentialAbsenteesForSecondCore
                            .map(p => getEnhancedParticipantData(p, slotInfo, prevMonthAssignmentCounts, assignmentCounts, CORE_CATEGORIES, calculatedPrevTotalCounts))
                            .sort((a,b) => compareEnhancedParticipants(a,b,false,assignmentCounts, false));

                        for (const absenteeData of sortedPotentialAbsentees) {
                            const absenteeToAssign = absenteeData.obj;
                             const eligiblePartnersPool = originalTargetPool.filter(p => {
                                if (p.id === absenteeToAssign.id || dailyAssignments.has(p.id) || p.gender !== absenteeToAssign.gender) return false;
                                const pCountsMap = assignmentCounts.get(p.id);
                                const pWeeklyAssignments = participantWeeklyAssignments.get(p.id);
                                return !((pCountsMap.get('total') || 0) >= 2 && pWeeklyAssignments.has(currentWeekForSlot));
                            });

                            const enhancedEligiblePartners = eligiblePartnersPool
                                .map(p => getEnhancedParticipantData(p, slotInfo, prevMonthAssignmentCounts, assignmentCounts, CORE_CATEGORIES, calculatedPrevTotalCounts))
                                .sort((a,b) => compareEnhancedParticipants(a,b,false,assignmentCounts, false));

                            let partnerToAssign = null;
                            let preferredPartnerData = enhancedEligiblePartners.find(pd => {
                                const p = pd.obj;
                                const partnerTargetCoreAssignments = (p.type === '초등') ? elementaryTargetCoreAssignments : middleTargetCoreAssignments;
                                return !prevMonthAbsentees.has(p.id) || (fixedAbsenteeAssignments.get(p.id) || 0) >= partnerTargetCoreAssignments;
                            });
                            if (preferredPartnerData) { partnerToAssign = preferredPartnerData.obj; }
                            else if (enhancedEligiblePartners.length > 0) { partnerToAssign = enhancedEligiblePartners[0].obj; }

                            if (partnerToAssign) {
                                assignedPair = [absenteeToAssign.id, partnerToAssign.id];
                                fixedAssigneeId = absenteeToAssign.id;
                                fixedAbsenteeAssignments.set(absenteeToAssign.id, (fixedAbsenteeAssignments.get(absenteeToAssign.id) || 0) + 1);
                                absenteeFixedWeeklyAssignments.get(absenteeToAssign.id).add(currentWeekForSlot);
                                if (isElementaryCoreSlot) assignedCoreSlotsCount.elementary_6am++;
                                else if (isMiddleCoreSlot) assignedCoreSlotsCount.middle_7am++;
                                break;
                            }
                        }
                    }
                } // End of A-2

                if (assignedPair.length < 2) {
                    let attemptB1Successful = false;
                    if (isElementaryCoreSlot || isMiddleCoreSlot) { // B-1
                        const potentialRegularsForFirstCore = originalTargetPool.filter(p => {
                            return !prevMonthAbsentees.has(p.id) &&
                                   (assignmentCounts.get(p.id)?.get(slotInfo.categoryKey) || 0) === 0 &&
                                   !dailyAssignments.has(p.id) &&
                                   !((assignmentCounts.get(p.id)?.get('total') || 0) >= 2 && participantWeeklyAssignments.get(p.id)?.has(currentWeekForSlot));
                        });

                        if (potentialRegularsForFirstCore.length >= 2) {
                            const sortedRegularsForFirstCore = potentialRegularsForFirstCore
                                .map(p => getEnhancedParticipantData(p, slotInfo, prevMonthAssignmentCounts, assignmentCounts, CORE_CATEGORIES, calculatedPrevTotalCounts))
                                .sort((a,b) => compareEnhancedParticipants(a,b,false,assignmentCounts, false))
                                .map(data => data.obj);

                            let p1Obj_B1 = null, p2Obj_B1 = null;
                            for (let i = 0; i < sortedRegularsForFirstCore.length; i++) {
                                const candidate1_B1 = sortedRegularsForFirstCore[i];
                                if (dailyAssignments.has(candidate1_B1.id) || (assignmentCounts.get(candidate1_B1.id)?.get(slotInfo.categoryKey) || 0) !== 0) continue;
                                p1Obj_B1 = candidate1_B1;
                                for (let p2LoopIdx = i + 1; p2LoopIdx < sortedRegularsForFirstCore.length; p2LoopIdx++) {
                                    const candidate2_B1 = sortedRegularsForFirstCore[p2LoopIdx];
                                    if (dailyAssignments.has(candidate2_B1.id) || candidate2_B1.id === p1Obj_B1.id || (assignmentCounts.get(candidate2_B1.id)?.get(slotInfo.categoryKey) || 0) !== 0) continue;
                                    if (candidate2_B1.gender === p1Obj_B1.gender) {
                                        p2Obj_B1 = candidate2_B1;
                                        break;
                                    }
                                }
                                if (p1Obj_B1 && p2Obj_B1) {
                                    assignedPair = [p1Obj_B1.id, p2Obj_B1.id];
                                    fixedAssigneeId = null;
                                    attemptB1Successful = true;
                                    if (isElementaryCoreSlot) assignedCoreSlotsCount.elementary_6am++; else if (isMiddleCoreSlot) assignedCoreSlotsCount.middle_7am++;
                                    break;
                                }
                                if(p1Obj_B1 && !p2Obj_B1) p1Obj_B1 = null;
                            }
                        }
                    } // End of B-1

                    if (!attemptB1Successful && (isElementaryCoreSlot || isMiddleCoreSlot)) { // B-2
                        const coreCategoryKeyForSlot = slotInfo.categoryKey;
                        const remainingCoreSlotsForType = totalCoreSlots[coreCategoryKeyForSlot] - assignedCoreSlotsCount[coreCategoryKeyForSlot];

                        if (remainingCoreSlotsForType > 0) {
                            const potentialRegularsForSecondCore = originalTargetPool.filter(p => {
                                return !prevMonthAbsentees.has(p.id) &&
                                    (assignmentCounts.get(p.id)?.get(coreCategoryKeyForSlot) || 0) === 1 &&
                                    !dailyAssignments.has(p.id) &&
                                    !((assignmentCounts.get(p.id)?.get('total') || 0) >= 2 && participantWeeklyAssignments.get(p.id)?.has(currentWeekForSlot));
                            });

                            if (potentialRegularsForSecondCore.length >= 2) {
                                const sortedRegularsForSecondCore = potentialRegularsForSecondCore
                                    .map(p => getEnhancedParticipantData(p, slotInfo, prevMonthAssignmentCounts, assignmentCounts, CORE_CATEGORIES, calculatedPrevTotalCounts))
                                    .sort((a,b) => compareEnhancedParticipants(a,b,false,assignmentCounts, false))
                                    .map(data => data.obj);

                                let p1Obj_B2 = null, p2Obj_B2 = null;
                                for (let i = 0; i < sortedRegularsForSecondCore.length; i++) {
                                    const candidate1_B2 = sortedRegularsForSecondCore[i];
                                    if (dailyAssignments.has(candidate1_B2.id) || (assignmentCounts.get(candidate1_B2.id)?.get(coreCategoryKeyForSlot) || 0) !== 1) continue;
                                    p1Obj_B2 = candidate1_B2;
                                    for (let p2LoopIdx = i + 1; p2LoopIdx < sortedRegularsForSecondCore.length; p2LoopIdx++) {
                                        const candidate2_B2 = sortedRegularsForSecondCore[p2LoopIdx];
                                        if (dailyAssignments.has(candidate2_B2.id) || candidate2_B2.id === p1Obj_B2.id || (assignmentCounts.get(candidate2_B2.id)?.get(coreCategoryKeyForSlot) || 0) !== 1) continue;
                                        if (candidate2_B2.gender === p1Obj_B2.gender) {
                                            p2Obj_B2 = candidate2_B2;
                                            break;
                                        }
                                    }
                                    if (p1Obj_B2 && p2Obj_B2) {
                                        assignedPair = [p1Obj_B2.id, p2Obj_B2.id];
                                        fixedAssigneeId = null;
                                        if (isElementaryCoreSlot) assignedCoreSlotsCount.elementary_6am++; else if (isMiddleCoreSlot) assignedCoreSlotsCount.middle_7am++;
                                        break;
                                    }
                                    if(p1Obj_B2 && !p2Obj_B2) p1Obj_B2 = null;
                                }
                            }
                        }
                    } // End of B-2

                    if (assignedPair.length < 2) { // General sequential for remaining slots or non-core sequential
                        const filteredTargetPool = originalTargetPool.filter(p => {
                            let isEligibleForFixedGeneral = true;
                            if (prevMonthAbsentees.has(p.id)) {
                                const targetCount = (p.type === '초등' && isElementaryCoreSlot) ? elementaryTargetCoreAssignments :
                                                  (p.type === '중등' && isMiddleCoreSlot) ? middleTargetCoreAssignments : 2;
                                if ((fixedAbsenteeAssignments.get(p.id) || 0) >= targetCount) isEligibleForFixedGeneral = false;
                                if ((isElementaryCoreSlot || isMiddleCoreSlot) && absenteeFixedWeeklyAssignments.get(p.id)?.has(currentWeekForSlot)) isEligibleForFixedGeneral = false;
                            }
                            if (!isEligibleForFixedGeneral && (isElementaryCoreSlot || isMiddleCoreSlot)) return false;

                            const pCountsMap = assignmentCounts.get(p.id);
                            const pWeeklyAssignments = participantWeeklyAssignments.get(p.id);
                            if (pCountsMap.get('total') >= 2 && pWeeklyAssignments.has(currentWeekForSlot)) return false;

                            return !dailyAssignments.has(p.id);
                        });

                        const enhancedTargetPool = filteredTargetPool.map(p => getEnhancedParticipantData(p, slotInfo, prevMonthAssignmentCounts, assignmentCounts, CORE_CATEGORIES, calculatedPrevTotalCounts));
                        enhancedTargetPool.sort((a,b) => compareEnhancedParticipants(a,b,false,assignmentCounts, false));
                        const sortedTargetPool = enhancedTargetPool.map(data => data.obj);

                        let baseCurrentIndexKey = slotInfo.categoryKey;
                        if (!sequentialStateKeys[baseCurrentIndexKey]) {
                            console.warn(`Sequential slot categoryKey ${baseCurrentIndexKey} not found in sequentialStateKeys. Using default index logic.`);
                            baseCurrentIndexKey = slotInfo.type === 'elementary' ? 'elementary_6am' : 'middle_7am';
                        }
                        let baseCurrentIndex = scheduleIndices[sequentialStateKeys[baseCurrentIndexKey]] || 0;
                        let effectiveCurrentIndex = baseCurrentIndex;
                        let p1Obj = null, p2Obj = null;

                        for (let i = 0; i < sortedTargetPool.length; i++) {
                            const candidate1 = sortedTargetPool[(effectiveCurrentIndex + i) % sortedTargetPool.length];
                            if (!candidate1 || dailyAssignments.has(candidate1.id)) continue;
                            p1Obj = candidate1;
                            let foundP2OriginalIndex = -1;
                            for (let p2LoopIdx = 0; p2LoopIdx < sortedTargetPool.length; p2LoopIdx++) {
                                const p2PoolIndex = (effectiveCurrentIndex + p2LoopIdx) % sortedTargetPool.length;
                                if (p2PoolIndex === (effectiveCurrentIndex + i) % sortedTargetPool.length) continue;
                                const candidate2 = sortedTargetPool[p2PoolIndex];
                                if (!candidate2 || dailyAssignments.has(candidate2.id) || candidate2.id === p1Obj.id) continue;
                                if (candidate2.gender === p1Obj.gender) {
                                    p2Obj = candidate2;
                                    foundP2OriginalIndex = p2LoopIdx;
                                    break;
                                }
                            }
                            if (p1Obj && p2Obj) {
                                assignedPair = [p1Obj.id, p2Obj.id];
                                const advanceBy = Math.max(i, foundP2OriginalIndex) + 1;
                                effectiveCurrentIndex = (baseCurrentIndex + advanceBy);
                                scheduleIndices[sequentialStateKeys[baseCurrentIndexKey]] = effectiveCurrentIndex;

                                fixedAssigneeId = null;
                                [p1Obj, p2Obj].forEach(person => {
                                    if (prevMonthAbsentees.has(person.id) && (isElementaryCoreSlot || isMiddleCoreSlot)) {
                                        const targetCount = (person.type === '초등') ? elementaryTargetCoreAssignments : middleTargetCoreAssignments;
                                        if ((fixedAbsenteeAssignments.get(person.id) || 0) < targetCount &&
                                            !absenteeFixedWeeklyAssignments.get(person.id)?.has(currentWeekForSlot) ) {
                                            fixedAbsenteeAssignments.set(person.id, (fixedAbsenteeAssignments.get(person.id) || 0) + 1);
                                            absenteeFixedWeeklyAssignments.get(person.id).add(currentWeekForSlot);
                                            if (!fixedAssigneeId) fixedAssigneeId = person.id;
                                        }
                                    }
                                });
                                if ((isElementaryCoreSlot || isMiddleCoreSlot) && !attemptB1Successful ) {
                                   if (slotInfo.categoryKey === CORE_CATEGORIES.elementary) assignedCoreSlotsCount.elementary_6am++;
                                   else if (slotInfo.categoryKey === CORE_CATEGORIES.middle) assignedCoreSlotsCount.middle_7am++;
                                }
                                break;
                            }
                             if(p1Obj && !p2Obj) p1Obj = null;
                        }
                    }
                }
            } else if (slotInfo.random) {
                let eligibleForRandomRaw = originalTargetPool.filter(p => {
                    if (dailyAssignments.has(p.id)) return false;
                    const pCountsMap = assignmentCounts.get(p.id);
                    const pWeeklyAssignments = participantWeeklyAssignments.get(p.id);
                    if (pCountsMap.get('total') >= 2 && pWeeklyAssignments.has(currentWeekForSlot)) return false;
                    return true;
                });

                const nonAbsentees = eligibleForRandomRaw.filter(p => !prevMonthAbsentees.has(p.id));
                if (nonAbsentees.length >= 2) {
                    eligibleForRandomRaw = nonAbsentees;
                }

                const enhancedEligibleForRandom = eligibleForRandomRaw.map(p =>
                    getEnhancedParticipantData(p, slotInfo, prevMonthAssignmentCounts, assignmentCounts, CORE_CATEGORIES, calculatedPrevTotalCounts)
                );
                enhancedEligibleForRandom.sort((a,b) => compareEnhancedParticipants(a,b,true,assignmentCounts, true));


                let p1Data = null, p2Data = null;
                for (let i = 0; i < enhancedEligibleForRandom.length; i++) {
                    p1Data = enhancedEligibleForRandom[i];
                    for (let j = i + 1; j < enhancedEligibleForRandom.length; j++) {
                        p2Data = enhancedEligibleForRandom[j];
                        if (p1Data.gender === p2Data.gender) {
                            assignedPair = [p1Data.id, p2Data.id];
                            break;
                        }
                    }
                    if (assignedPair.length === 2) break;
                    p2Data = null;
                }
                 if (!p1Data || !p2Data || assignedPair.length < 2) assignedPair = [];

                if (assignedPair.length < 2 && eligibleForRandomRaw.length >=2) {
                    let fallbackIndexKey = slotInfo.categoryKey;
                    if (!sequentialStateKeys[fallbackIndexKey]) {
                        fallbackIndexKey = slotInfo.type === 'elementary' ? 'elementary_random_fallback' : 'middle_random_fallback';
                    }

                    let baseCurrentIndex = scheduleIndices[sequentialStateKeys[fallbackIndexKey]] || 0;
                    let p1Obj = null, p2Obj = null;
                    const poolForFallback = enhancedEligibleForRandom.map(data => data.obj);
                    for (let i = 0; i < poolForFallback.length; i++) {
                        const candidate1 = poolForFallback[(baseCurrentIndex + i) % poolForFallback.length];
                        if (dailyAssignments.has(candidate1.id)) continue;
                        p1Obj = candidate1;
                        let foundP2OriginalIndex = -1;
                        for (let p2_idx = 0; p2_idx < poolForFallback.length; p2_idx++) {
                            const p2PoolIndex = (baseCurrentIndex + p2_idx) % poolForFallback.length;
                             if (p2PoolIndex === (baseCurrentIndex + i) % poolForFallback.length) continue;
                            const candidate2 = poolForFallback[p2PoolIndex];
                            if (dailyAssignments.has(candidate2.id) || candidate2.id === p1Obj.id) continue;
                            if (candidate2.gender === p1Obj.gender) {
                                p2Obj = candidate2;
                                foundP2OriginalIndex = p2_idx;
                                break;
                            }
                        }
                        if (p1Obj && p2Obj) {
                            assignedPair = [p1Obj.id, p2Obj.id];
                            const advanceBy = Math.max(i, foundP2OriginalIndex) + 1;
                            scheduleIndices[sequentialStateKeys[fallbackIndexKey]] = (baseCurrentIndex + advanceBy);
                            break;
                        }
                        if(p1Obj && !p2Obj) p1Obj = null;
                    }
                }
            }

            if (assignedPair.length === 2) {
                assignedPair.forEach(id => {
                    dailyAssignments.add(id);
                    const countsForParticipant = assignmentCounts.get(id);
                    countsForParticipant.set('total', (countsForParticipant.get('total') || 0) + 1);
                    if (slotInfo.categoryKey) {
                        countsForParticipant.set(slotInfo.categoryKey, (countsForParticipant.get(slotInfo.categoryKey) || 0) + 1);
                    }
                    const weekOfMonth = getWeekOfMonth(currentDate);
                    participantWeeklyAssignments.get(id).add(weekOfMonth);
                });
                const assignedPairNames = assignedPair.map(id => participantsMap.get(id)?.name || `ID:${id}`);
                let isFixedStatusArray = assignedPair.map(id => id === fixedAssigneeId && fixedAssigneeId !== null);

                daySchedule.timeSlots.push({ 
                    time: slotInfo.time, 
                    type: slotInfo.type, 
                    assigned: assignedPair,
                    assignedNames: assignedPairNames,
                    isFixedStatus: isFixedStatusArray,
                    categoryKey: slotInfo.categoryKey
                });
            } else {
                 daySchedule.timeSlots.push({ 
                    time: slotInfo.time, 
                    type: slotInfo.type, 
                    assigned: [],
                    assignedNames: ['미배정'],
                    isFixedStatus: [false, false],
                    categoryKey: slotInfo.categoryKey
                });
            }
        }
        if (daySchedule.timeSlots.length > 0) {
            scheduleData.push(daySchedule);
        }
    }

    // --- A단계 - 결석자 2회차 '그 외 시간대' 배정 (슬롯 부족 또는 2차 핵심 실패 시) ---
    // (이전 subtask에서 구현됨, 현재 파일 내용에 이미 포함)


    // --- C단계: (A, B단계 후) 남은 가용 슬롯에 대한 2차 배정 (횟수 채우기 및 균등 분배 강화) ---
    console.log("C-Step: Attempting 2nd assignment for all participants with < 2 total, prioritizing by last month's total assignments.");

    const postLoopDailyAssignments_C = new Map();
    for(let d = 1; d <= daysInMonth; d++) {
        const dateStrKey = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        postLoopDailyAssignments_C.set(dateStrKey, new Set());
        const dayScheduleFromMainLoop = scheduleData.find(ds => ds.date === dateStrKey);
        if (dayScheduleFromMainLoop) {
            dayScheduleFromMainLoop.timeSlots.forEach(slot => {
                slot.assigned.forEach(id => postLoopDailyAssignments_C.get(dateStrKey).add(id));
            });
        }
    }

    let participantsForCStep = participants.filter(p => (assignmentCounts.get(p.id)?.get('total') || 0) < 2);
    if (participantsForCStep.length < 2) {
        console.log("C-Step: Not enough participants needing more assignments to form pairs or all eligible have 2.");
    } else {
        console.log(`C-Step: Found ${participantsForCStep.length} participants with < 2 assignments.`);
        let sortedParticipantsForCStep = [...participantsForCStep].sort((pA, pB) => {
            const prevTotalA = calculatedPrevTotalCounts.get(pA.id) || 0;
            const prevTotalB = calculatedPrevTotalCounts.get(pB.id) || 0;
            if (prevTotalA !== prevTotalB) {
                return prevTotalA - prevTotalB;
            }
            return pA.id - pB.id; // Tie-breaking
        });

        const candidatePairs = [];
        // const cStepPairedParticipantIds = new Set(); // Not used as per prompt's example

        for (let i = 0; i < sortedParticipantsForCStep.length; i++) {
            const p1 = sortedParticipantsForCStep[i];
            if ((assignmentCounts.get(p1.id)?.get('total') || 0) >= 2) continue; // Already got 2 assignments

            for (let j = i + 1; j < sortedParticipantsForCStep.length; j++) {
                const p2 = sortedParticipantsForCStep[j];
                if ((assignmentCounts.get(p2.id)?.get('total') || 0) >= 2) continue; // Already got 2 assignments

                if (p1.gender === p2.gender) {
                    candidatePairs.push({
                        p1: p1,
                        p2: p2,
                        priorityScore: calculatedPrevTotalCounts.get(p1.id) || 0
                    });
                    break;
                }
            }
        }

        candidatePairs.sort((pairA, pairB) => {
            if (pairA.priorityScore !== pairB.priorityScore) {
                return pairA.priorityScore - pairB.priorityScore;
            }
            return pairA.p1.id - pairB.p1.id;
        });
        console.log(`C-Step: Generated ${candidatePairs.length} candidate pairs based on prev month total.`);

        const remainingEmptySlots_C = []; // Renamed to avoid conflict
        scheduleData.forEach(daySch => {
            daySch.timeSlots.forEach(slot => {
                if (slot.assigned.length === 0) {
                    remainingEmptySlots_C.push({
                        date: daySch.date,
                        dayOfWeekShort: DAYS_OF_WEEK[new Date(daySch.date).getDay()],
                        ...slot
                    });
                }
            });
        });
        console.log(`C-Step: Found ${remainingEmptySlots_C.length} empty slots.`);

        let assignedInCStepCount = 0;
        const assignmentsToMake_C = Math.min(remainingEmptySlots_C.length, candidatePairs.length); // Renamed
        const usedEmptySlotsCStep = new Set();

        for (let i = 0; i < assignmentsToMake_C; i++) {
            const pairToAssign = candidatePairs[i];
            const p1 = pairToAssign.p1;
            const p2 = pairToAssign.p2;

            if ((assignmentCounts.get(p1.id)?.get('total') || 0) >= 2 || (assignmentCounts.get(p2.id)?.get('total') || 0) >= 2) continue;

            let cStepAssignedThisPair = false;
            remainingEmptySlots_C.sort(() => Math.random() - 0.5);

            for (const emptySlot of remainingEmptySlots_C) {
                const slotIdentifier = `${emptySlot.date}-${emptySlot.time}-${emptySlot.type}-${emptySlot.categoryKey}`;
                if (usedEmptySlotsCStep.has(slotIdentifier)) continue;

                const currentDate_C = new Date(emptySlot.date); // Renamed
                const currentWeek_C = getWeekOfMonth(currentDate_C); // Renamed
                const dailyAssignedForThisDay_C = postLoopDailyAssignments_C.get(emptySlot.date);

                const p1CanBeAssigned = !dailyAssignedForThisDay_C.has(p1.id) &&
                                        !participantWeeklyAssignments.get(p1.id)?.has(currentWeek_C) && // Strict 1 assignment per week for C-step
                                        (assignmentCounts.get(p1.id)?.get('total') || 0) < 2;
                const p2CanBeAssigned = !dailyAssignedForThisDay_C.has(p2.id) &&
                                        !participantWeeklyAssignments.get(p2.id)?.has(currentWeek_C) && // Strict 1 assignment per week for C-step
                                        (assignmentCounts.get(p2.id)?.get('total') || 0) < 2;


                if (p1CanBeAssigned && p2CanBeAssigned) {
                    const daySchToUpdate = scheduleData.find(ds => ds.date === emptySlot.date);
                    const slotToUpdate = daySchToUpdate.timeSlots.find(s => s.time === emptySlot.time && s.type === emptySlot.type && s.categoryKey === emptySlot.categoryKey);

                    slotToUpdate.assigned = [p1.id, p2.id];
                    slotToUpdate.assignedNames = [participantsMap.get(p1.id), participantsMap.get(p2.id)];
                    slotToUpdate.isFixedStatus = [false, false];

                    dailyAssignedForThisDay_C.add(p1.id);
                    dailyAssignedForThisDay_C.add(p2.id);

                    [p1.id, p2.id].forEach(pid => {
                        const counts = assignmentCounts.get(pid);
                        counts.set('total', (counts.get('total') || 0) + 1);
                        if (slotToUpdate.categoryKey) counts.set(slotToUpdate.categoryKey, (counts.get(slotToUpdate.categoryKey) || 0) + 1);
                        participantWeeklyAssignments.get(pid).add(currentWeek_C);
                        if (slotToUpdate.categoryKey === CORE_CATEGORIES.elementary) assignedCoreSlotsCount.elementary_6am++;
                        else if (slotToUpdate.categoryKey === CORE_CATEGORIES.middle) assignedCoreSlotsCount.middle_7am++;
                    });

                    assignedInCStepCount++;
                    usedEmptySlotsCStep.add(slotIdentifier);
                    cStepAssignedThisPair = true;
                    break;
                }
            }
            if (!cStepAssignedThisPair) {
                 console.log(`C-Step: Could not find a suitable slot for pair ${p1.name} & ${p2.name}`);
            }
        }
        console.log(`C-Step: Assigned ${assignedInCStepCount} pairs.`);
    }
    // --- C단계 끝 ---


    // --- D단계: 최종 추가 랜덤 배정 ---
    console.log("Entering D-Step: Final random assignments for any remaining slots.");

    const postLoopDailyAssignments_D = new Map();
    for(let d = 1; d <= daysInMonth; d++) {
        const dateStrKey = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        postLoopDailyAssignments_D.set(dateStrKey, new Set());
        const dayScheduleFromCurrent = scheduleData.find(ds => ds.date === dateStrKey);
        if (dayScheduleFromCurrent) {
            dayScheduleFromCurrent.timeSlots.forEach(slot => {
                slot.assigned.forEach(id => postLoopDailyAssignments_D.get(dateStrKey).add(id));
            });
        }
    }

    let dStepAssignedCount = 0;
    for (let dayD = 1; dayD <= daysInMonth; dayD++) {
        const currentDateD = new Date(year, month - 1, dayD);
        const currentWeekD = getWeekOfMonth(currentDateD);
        const dateStrD = `${year}-${String(month).padStart(2, '0')}-${String(dayD).padStart(2, '0')}`;
        const dailyAssignedForThisDay_D = postLoopDailyAssignments_D.get(dateStrD);

        const daySch_D = scheduleData.find(ds => ds.date === dateStrD);
        if (!daySch_D) continue;

        const slotsForDay_D = TIME_SLOT_CONFIG[DAYS_OF_WEEK[currentDateD.getDay()]] || [];

        for (const slotInfo_D of slotsForDay_D) {
            const targetSlot_D = daySch_D.timeSlots.find(ts => ts.time === slotInfo_D.time && ts.type === slotInfo_D.type && ts.categoryKey === slotInfo_D.categoryKey);
            if (!targetSlot_D || targetSlot_D.assigned.length > 0) continue;

            let potentialP1List_D = participants.filter(p => {
                if (dailyAssignedForThisDay_D.has(p.id)) return false;
                if (participantWeeklyAssignments.get(p.id)?.has(currentWeekD)) return false;
                return true;
            });

            if (potentialP1List_D.length === 0) continue;

            const tempSlotInfoForDSort = { categoryKey: 'general_D_step_sort' };
            const sortedPotentialP1_D = potentialP1List_D
                .map(p => getEnhancedParticipantData(p, tempSlotInfoForDSort, prevMonthAssignmentCounts, assignmentCounts, CORE_CATEGORIES, calculatedPrevTotalCounts))
                .sort((a,b) => {
                    const totalA_D = assignmentCounts.get(a.id)?.get('total') || 0;
                    const totalB_D = assignmentCounts.get(b.id)?.get('total') || 0;
                    if (totalA_D !== totalB_D) return totalA_D - totalB_D;
                    return Math.random() - 0.5;
                });

            if (sortedPotentialP1_D.length === 0) continue;

            let p1_D = null, p2_D = null;

            for (const p1Data_D of sortedPotentialP1_D) {
                const candidateP1 = p1Data_D.obj;
                if (dailyAssignedForThisDay_D.has(candidateP1.id) || participantWeeklyAssignments.get(candidateP1.id)?.has(currentWeekD)) continue;

                let potentialPartners_D = participants.filter(p => {
                    if (p.id === candidateP1.id || dailyAssignedForThisDay_D.has(p.id) || p.gender !== candidateP1.gender) return false;
                    if (participantWeeklyAssignments.get(p.id)?.has(currentWeekD)) return false;
                    return true;
                });

                if (potentialPartners_D.length > 0) {
                    const sortedPotentialPartners_D = potentialPartners_D
                        .map(p => getEnhancedParticipantData(p, tempSlotInfoForDSort, prevMonthAssignmentCounts, assignmentCounts, CORE_CATEGORIES, calculatedPrevTotalCounts))
                        .sort((a,b) => {
                            const totalA_DP = assignmentCounts.get(a.id)?.get('total') || 0;
                            const totalB_DP = assignmentCounts.get(b.id)?.get('total') || 0;
                            if (totalA_DP !== totalB_DP) return totalA_DP - totalB_DP;
                            return Math.random() - 0.5;
                        });

                    if (sortedPotentialPartners_D.length > 0) {
                        p1_D = candidateP1;
                        p2_D = sortedPotentialPartners_D[0].obj;
                        break;
                    }
                }
            }

            if (p1_D && p2_D) {
                targetSlot_D.assigned = [p1_D.id, p2_D.id];
                targetSlot_D.assignedNames = [participantsMap.get(p1_D.id), participantsMap.get(p2_D.id)];
                targetSlot_D.isFixedStatus = [false, false];

                dailyAssignedForThisDay_D.add(p1_D.id);
                dailyAssignedForThisDay_D.add(p2_D.id);

                [p1_D.id, p2_D.id].forEach(pid => {
                    const counts = assignmentCounts.get(pid);
                    counts.set('total', (counts.get('total') || 0) + 1);
                    if (slotInfo_D.categoryKey) counts.set(slotInfo_D.categoryKey, (counts.get(slotInfo_D.categoryKey) || 0) + 1);
                    participantWeeklyAssignments.get(pid).add(currentWeekD);
                });
                dStepAssignedCount++;
            }
        }
    }
    if (dStepAssignedCount > 0) {
        console.log(`D-Step: Assigned ${dStepAssignedCount} additional pairs randomly.`);
    }
    // --- D단계 끝 ---

    // --- E단계: 추가 랜덤 배정 ---
    console.log("Entering E-Step: Final random assignments for remaining slots.");
    // TODO: Implement E-Step logic
    // --- E단계 끝 ---


    for (const dbKey of Object.values(sequentialStateKeys)) {
        await db.saveScheduleState(dbKey, scheduleIndices[dbKey]);
    }
    
    await db.saveSchedule(year, month, scheduleData);

    try {
        const formattedAssignmentData = [];
        for (const [participantId, categoryMap] of assignmentCounts.entries()) {
            for (const [categoryKey, count] of categoryMap.entries()) {
                if (categoryKey !== 'total' && count > 0) {
                    formattedAssignmentData.push({
                        participantId: participantId,
                        categoryKey: categoryKey,
                        count: count
                    });
                }
            }
        }
        if (formattedAssignmentData.length > 0) {
            await db.saveMonthlyAssignmentCounts(year, month, formattedAssignmentData);
            console.log(`Monthly assignment counts for ${year}-${month} saved.`);
        }
    } catch (error) {
        console.error(`Failed to save monthly assignment counts for ${year}-${month}:`, error);
    }

    if (absenteesForSecondRandomRound.size > 0) {
        console.log(`Participants targeted for a potential 2nd random assignment (due to reduced core slots):`, Array.from(absenteesForSecondRandomRound));
        absenteesForSecondRandomRound.forEach(absenteeId => {
            const absentee = participantsMap.get(absenteeId);
            if (absentee && (fixedAbsenteeAssignments.get(absenteeId) || 0) < 2) {
                 console.log(`Participant ${absentee.name} (ID: ${absenteeId}, Type: ${absentee.type}) still needs ${2 - (fixedAbsenteeAssignments.get(absenteeId) || 0)} core assignments, targeted for random.`);
            }
        });
    }

    return scheduleData;
}
