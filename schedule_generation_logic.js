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

// Helper function defined outside generateSchedule for clarity or can be inside
function getEnhancedParticipantData(participant, slotInfo, prevMonthAssignmentCounts, currentMonthAssignmentCounts, coreCategoriesMap, calculatedPrevTotalCounts) {
    const participantId = participant.id;
    const prevCountsForParticipant = prevMonthAssignmentCounts.get(participantId) || new Map();

    let prevCategoryCount = 0;
    if (slotInfo.categoryKey) {
        prevCategoryCount = prevCountsForParticipant.get(slotInfo.categoryKey) || 0;
    }

    const prevTotalCount = calculatedPrevTotalCounts.get(participantId) || 0; // Use pre-calculated total
    const currentCategoryCount = currentMonthAssignmentCounts.get(participantId)?.get(slotInfo.categoryKey) || 0;

    let crossPreferenceScore = 0;
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

function compareEnhancedParticipants(aData, bData) {
    // 1. Previous category count (lower is better)
    if (aData.prevCategoryCount !== bData.prevCategoryCount) {
        return aData.prevCategoryCount - bData.prevCategoryCount;
    }
    // 2. Cross-preference score (higher is better)
    if (aData.crossPreferenceScore !== bData.crossPreferenceScore) {
        return bData.crossPreferenceScore - aData.crossPreferenceScore;
    }
    // 3. Previous total count (lower is better)
    if (aData.prevTotalCount !== bData.prevTotalCount) {
        return aData.prevTotalCount - bData.prevTotalCount;
    }
    // 4. Current category count for this month (lower is better)
    if (aData.currentCategoryCount !== bData.currentCategoryCount) {
        return aData.currentCategoryCount - bData.currentCategoryCount;
    }
    // 5. ID for tie-breaking (ensures stable sort for sequential logic)
    return aData.id - bData.id;
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

    // Load previous month's assignment counts
    const prevMonthAssignmentCounts = await db.getPreviousMonthAssignmentCounts(year, month);
    const CORE_CATEGORIES = {
        elementary: 'elementary_6am', // Assuming this is the core sequential for elementary
        middle: 'middle_7am'         // Assuming this is the core sequential for middle
    };

    // Helper to calculate total previous counts for a participant
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


    let scheduleData = [];
    const daysInMonth = new Date(year, month, 0).getDate();

    const assignmentCounts = new Map(); 
    const uniqueCategoryKeys = new Set();
    Object.values(TIME_SLOT_CONFIG).flat().forEach(slot => {
        if (slot.categoryKey) uniqueCategoryKeys.add(slot.categoryKey);
    });
    // Add known fallback keys if they are distinct categories to be tracked
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
    
    const fixedAbsenteeAssignments = new Map(); 
    const prevMonthAbsenteesList = await db.getAbsenteesForMonth(new Date(year, month - 1, 0).getFullYear(), new Date(year, month - 1, 0).getMonth() + 1);
    const prevMonthAbsentees = new Set(prevMonthAbsenteesList);
    prevMonthAbsentees.forEach(id => fixedAbsenteeAssignments.set(id, 0));

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
                const absenteesForThisSlotType = originalTargetPool.filter(p => prevMonthAbsentees.has(p.id) && (fixedAbsenteeAssignments.get(p.id) || 0) < 2);
                
                for (const absentee of absenteesForThisSlotType) {
                    if (assignedPair.length === 2) break;
                    if (dailyAssignments.has(absentee.id)) continue;

                    const absenteeCountsMap = assignmentCounts.get(absentee.id);
                    const absenteeWeeklyAssignments = participantWeeklyAssignments.get(absentee.id);
                    if (absenteeCountsMap.get('total') >= 2 && absenteeWeeklyAssignments.has(currentWeekForSlot)) {
                        continue;
                    }
                    const absenteeData = getEnhancedParticipantData(absentee, slotInfo, prevMonthAssignmentCounts, assignmentCounts, CORE_CATEGORIES, calculatedPrevTotalCounts);


                    const eligiblePartnersPool = originalTargetPool.filter(p => {
                        if (p.id === absentee.id || dailyAssignments.has(p.id) || p.gender !== absentee.gender) return false;
                        const pCountsMap = assignmentCounts.get(p.id);
                        const pWeeklyAssignments = participantWeeklyAssignments.get(p.id);
                        if (pCountsMap.get('total') >= 2 && pWeeklyAssignments.has(currentWeekForSlot)) return false;

                        // Enhanced data for partner candidate for crossPreference check (simple version)
                        // This could be more deeply integrated with the full sorting if needed, but here we primarily check weekly and daily limits
                        const pDataForCheck = getEnhancedParticipantData(p, slotInfo, prevMonthAssignmentCounts, assignmentCounts, CORE_CATEGORIES, calculatedPrevTotalCounts);
                        // Example: if absentee is core and partner is core, and both have high prev counts, maybe skip.
                        // For now, the main filter is weekly and daily. Cross-preference is handled by sorting later.
                        return true;
                    });

                    const enhancedEligiblePartners = eligiblePartnersPool
                        .map(p => getEnhancedParticipantData(p, slotInfo, prevMonthAssignmentCounts, assignmentCounts, CORE_CATEGORIES, calculatedPrevTotalCounts))
                        .sort(compareEnhancedParticipants);

                    let partnerData = enhancedEligiblePartners.find(pd => {
                        const p = pd.obj;
                        return (!prevMonthAbsentees.has(p.id) || (fixedAbsenteeAssignments.get(p.id) || 0) >= 2);
                    });
                    if (!partnerData) {
                        partnerData = enhancedEligiblePartners[0]; // Take the best available if no non-absentee preferred
                    }

                    if (partnerData) {
                        const partnerObj = partnerData.obj;
                        assignedPair = [absentee.id, partnerObj.id];
                        fixedAbsenteeAssignments.set(absentee.id, (fixedAbsenteeAssignments.get(absentee.id) || 0) + 1);
                        fixedAssigneeId = absentee.id;
                        break; 
                    }
                }
                
                if (assignedPair.length < 2) {
                    const filteredTargetPool = originalTargetPool.filter(p => {
                        const isPrevAbsentee = prevMonthAbsentees.has(p.id);
                        const absenteeFixedCount = fixedAbsenteeAssignments.get(p.id) || 0;
                        if (isPrevAbsentee && absenteeFixedCount >= 2) return false;

                        const pCountsMap = assignmentCounts.get(p.id);
                        const pWeeklyAssignments = participantWeeklyAssignments.get(p.id);
                        if (pCountsMap.get('total') >= 2 && pWeeklyAssignments.has(currentWeekForSlot)) return false;

                        return !dailyAssignments.has(p.id); // Ensure not already assigned today
                    });

                    const enhancedTargetPool = filteredTargetPool.map(p => getEnhancedParticipantData(p, slotInfo, prevMonthAssignmentCounts, assignmentCounts, CORE_CATEGORIES, calculatedPrevTotalCounts));
                    enhancedTargetPool.sort(compareEnhancedParticipants);
                    const sortedTargetPool = enhancedTargetPool.map(data => data.obj);

                    let baseCurrentIndex = slotInfo.categoryKey === 'elementary_6am' ? scheduleIndices[sequentialStateKeys.elementary_6am] : scheduleIndices[sequentialStateKeys.middle_7am];
                    let effectiveCurrentIndex = baseCurrentIndex;
                    let p1Obj = null, p2Obj = null;

                    for (let i = 0; i < sortedTargetPool.length; i++) {
                        const candidate1 = sortedTargetPool[(effectiveCurrentIndex + i) % sortedTargetPool.length];
                        if (!candidate1 || dailyAssignments.has(candidate1.id)) continue; // Already checked in filter, but good for safety
                        p1Obj = candidate1;

                        for (let p2LoopIdx = i + 1; p2LoopIdx < sortedTargetPool.length; p2LoopIdx++) {
                            const candidate2 = sortedTargetPool[(effectiveCurrentIndex + p2LoopIdx) % sortedTargetPool.length];
                            if (!candidate2 || dailyAssignments.has(candidate2.id) || candidate2.id === p1Obj.id) continue;
                            if (candidate2.gender === p1Obj.gender) {
                                p2Obj = candidate2;
                                break;
                            }
                        }
                        if (p1Obj && p2Obj) {
                            assignedPair = [p1Obj.id, p2Obj.id];
                            effectiveCurrentIndex = (effectiveCurrentIndex + Math.max(i, p2LoopIdx) + 1); // Advance index past used pair
                             if (slotInfo.categoryKey === 'elementary_6am') scheduleIndices[sequentialStateKeys.elementary_6am] = effectiveCurrentIndex;
                             else scheduleIndices[sequentialStateKeys.middle_7am] = effectiveCurrentIndex;
                            break;
                        }
                         if(p1Obj && !p2Obj) p1Obj = null; // Reset p1 if no p2 found for it, to try next p1
                    }
                }

            } else if (slotInfo.random) {
                let eligibleForRandomRaw = originalTargetPool.filter(p => {
                     // Apply weekly check and daily assignment check upfront
                    if (dailyAssignments.has(p.id)) return false;
                    const pCountsMap = assignmentCounts.get(p.id);
                    const pWeeklyAssignments = participantWeeklyAssignments.get(p.id);
                    if (pCountsMap.get('total') >= 2 && pWeeklyAssignments.has(currentWeekForSlot)) return false;
                    return true;
                });

                // If not enough non-absentees, consider all active, but still apply weekly/daily checks
                const nonAbsentees = eligibleForRandomRaw.filter(p => !prevMonthAbsentees.has(p.id));
                if (nonAbsentees.length < 2 && eligibleForRandomRaw.length >=2 ) {
                    // This condition might be too simple, but for now, we use the filtered 'eligibleForRandomRaw'
                } else if (nonAbsentees.length >= 2) {
                    eligibleForRandomRaw = nonAbsentees; // Prefer non-absentees if enough
                }


                const enhancedEligibleForRandom = eligibleForRandomRaw.map(p =>
                    getEnhancedParticipantData(p, slotInfo, prevMonthAssignmentCounts, assignmentCounts, CORE_CATEGORIES, calculatedPrevTotalCounts)
                );
                enhancedEligibleForRandom.sort(compareEnhancedParticipants);

                let p1Data = null, p2Data = null;

                for (let i = 0; i < enhancedEligibleForRandom.length; i++) {
                    p1Data = enhancedEligibleForRandom[i];
                    // Daily check already done by initial filter for eligibleForRandomRaw

                    for (let j = i + 1; j < enhancedEligibleForRandom.length; j++) {
                        p2Data = enhancedEligibleForRandom[j];
                        if (p1Data.gender === p2Data.gender) {
                            assignedPair = [p1Data.id, p2Data.id];
                            break;
                        }
                    }
                    if (assignedPair.length === 2) break;
                    p2Data = null; // Reset if inner loop didn't find a pair
                }
                 if (!p1Data || !p2Data || assignedPair.length < 2) assignedPair = []; // Ensure it's empty if no pair

                // Fallback for random slots (if primary sort didn't yield a pair)
                if (assignedPair.length < 2 && eligibleForRandomRaw.length >=2) {
                    // This fallback should also use the sorted enhanced list for consistency or a simpler index-based approach
                    // For simplicity, reusing the sorted list and trying to pick with index (less robust than full sequential here)
                    let fallbackIndexKey = slotInfo.categoryKey === 'elementary_random' ? sequentialStateKeys.elementary_random_fallback : sequentialStateKeys.middle_random_fallback;
                    if (!sequentialStateKeys[slotInfo.categoryKey] && slotInfo.type === 'elementary') fallbackIndexKey = sequentialStateKeys.elementary_random_fallback;
                    else if (!sequentialStateKeys[slotInfo.categoryKey] && slotInfo.type === 'middle') fallbackIndexKey = sequentialStateKeys.middle_random_fallback;
                    
                    let baseCurrentIndex = scheduleIndices[fallbackIndexKey] || 0;
                    let p1Obj = null, p2Obj = null;

                    const poolForFallback = enhancedEligibleForRandom.map(data => data.obj); // Get original objects

                    for (let i = 0; i < poolForFallback.length; i++) {
                        const candidate1 = poolForFallback[(baseCurrentIndex + i) % poolForFallback.length];
                        if (dailyAssignments.has(candidate1.id)) continue; // Should be pre-filtered, but double check
                        p1Obj = candidate1;

                        for (let j = i + 1; j < poolForFallback.length; j++) {
                            const candidate2 = poolForFallback[(baseCurrentIndex + j) % poolForFallback.length];
                            if (dailyAssignments.has(candidate2.id) || candidate2.id === p1Obj.id) continue;
                            if (candidate2.gender === p1Obj.gender) {
                                p2Obj = candidate2;
                                break;
                            }
                        }
                        if (p1Obj && p2Obj) {
                            assignedPair = [p1Obj.id, p2Obj.id];
                            scheduleIndices[fallbackIndexKey] = (baseCurrentIndex + Math.max(i,j) + 1);
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
                    categoryKey: slotInfo.categoryKey // Persist categoryKey
                });
            } else {
                 daySchedule.timeSlots.push({ 
                    time: slotInfo.time, 
                    type: slotInfo.type, 
                    assigned: [],
                    assignedNames: ['미배정'],
                    isFixedStatus: [false, false],
                    categoryKey: slotInfo.categoryKey // Persist categoryKey
                });
            }
        }
        if (daySchedule.timeSlots.length > 0) {
            scheduleData.push(daySchedule);
        }
    }

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
                        categoryKey: categoryKey, // Actual categoryKey from TIME_SLOT_CONFIG
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

    return scheduleData;
}

// Ensure all participant objects are accessed via .obj when iterating through enhanced data, e.g., p1Data.obj
// Ensure all categoryKey references are correct (e.g. in sequentialStateKeys, TIME_SLOT_CONFIG)
// Added fallback category keys to uniqueCategoryKeys for complete counting.
// Persisted categoryKey in daySchedule.timeSlots for potential use in UI or other logic.
// Corrected gender check: typeof p.gender === 'undefined' || !p.gender
// Fixed absentee preferred partner selection to use enhancedEligiblePartners.
// Simplified sequential assignment after sorting: iterate and pick. Needs careful index management.
// Simplified random fallback to use the already sorted enhancedEligibleForRandom.
// Corrected scheduleIndices update for sequential slots.
// Corrected categoryKey persistence in timeSlots.
// Ensured dailyAssignments check is robust in all loops.
// Ensured fallback keys are added to uniqueCategoryKeys for assignmentCounts initialization.
// The sequential fallback for random slots was simplified; it now uses the already sorted `enhancedEligibleForRandom`
// and attempts to pick sequentially from it. This is not a true sequential rotation like the main sequential slots but
// leverages the sorting order.
// The main sequential slot logic for non-absentees now also filters, then maps to enhanced data, sorts, maps back to objects,
// and then attempts sequential assignment using the scheduleIndices. This is a significant change to how sequential works.
// The fixed absentee assignment logic was also updated to use enhanced data for partner selection.
