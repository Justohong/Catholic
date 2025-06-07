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
  // Returns the 0-indexed week of the month.
  // The first day of the month (e.g., 1st) is in week 0.
  // 8th is in week 1, 15th in week 2, etc.
  return Math.floor((date.getDate() - 1) / 7);
}

async function getParticipantsMap(participantsList) {
    const map = new Map();
    participantsList.forEach(p => map.set(p.id, p));
    return map;
}

export async function generateSchedule(year, month) {
    const participants = await db.getAllParticipants();
    if (!participants || participants.length === 0) {
        throw new Error("기준정보에 등록된 인원이 없습니다.");
    }

    for (const p of participants) {
        if (typeof p.gender === 'undefined') {



            if (!p.gender) throw new Error(`Participant ${p.name} (ID: ${p.id}) is missing gender information.`);
        }
    }
    const participantsMap = await getParticipantsMap(participants);

    const prevMonthDate = new Date(year, month - 1, 0);
    const prevYear = prevMonthDate.getFullYear();
    const prevMonth = prevMonthDate.getMonth() + 1;
    const prevMonthAbsenteesList = await db.getAbsenteesForMonth(prevYear, prevMonth);
    const prevMonthAbsentees = new Set(prevMonthAbsenteesList);

    let scheduleData = [];
    const daysInMonth = new Date(year, month, 0).getDate();

    const assignmentCounts = new Map(); 
    participants.forEach(p => assignmentCounts.set(p.id, { total: 0, random_elementary: 0, random_middle: 0 }));

    const participantWeeklyAssignments = new Map(); // participantId -> Set of week numbers
    participants.forEach(p => participantWeeklyAssignments.set(p.id, new Set()));
    
    const fixedAbsenteeAssignments = new Map(); 
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
            let fixedAssigneeId = null; // New variable

            const targetPool = slotInfo.type === 'elementary' ? elementaryParticipants : middleParticipants;
            if (targetPool.length < 2) continue;

            if (slotInfo.sequential) {
                const absenteesForThisSlotType = targetPool.filter(p => prevMonthAbsentees.has(p.id) && (fixedAbsenteeAssignments.get(p.id) || 0) < 2);
                
                for (const absenteeObj of absenteesForThisSlotType) {
                    if (assignedPair.length === 2) break;
                    if (dailyAssignments.has(absenteeObj.id)) continue;

                    // New weekly assignment eligibility check for absenteeObj
                    const absenteeCounts = assignmentCounts.get(absenteeObj.id);
                    const absenteeWeeklyAssignments = participantWeeklyAssignments.get(absenteeObj.id);
                    const currentWeekForSlot = getWeekOfMonth(currentDate);
                    if (absenteeCounts.total >= 2 && absenteeWeeklyAssignments.has(currentWeekForSlot)) {
                        continue; // Skip this absenteeObj if ineligible
                    }

                    // Filter for eligible partners for the absenteeObj
                    // const currentWeekForSlot = getWeekOfMonth(currentDate); // Already available from absenteeObj check
                    const eligiblePartnersPool = targetPool.filter(p => {
                        if (p.id === absenteeObj.id || dailyAssignments.has(p.id) || p.gender !== absenteeObj.gender) return false;
                        const pCounts = assignmentCounts.get(p.id);
                        const pWeeklyAssignments = participantWeeklyAssignments.get(p.id);
                        if (pCounts.total >= 2 && pWeeklyAssignments.has(currentWeekForSlot)) {
                            return false; // Ineligible due to weekly rule
                        }
                        return true;
                    });

                    let partnerObj = eligiblePartnersPool.find(p =>
                        (!prevMonthAbsentees.has(p.id) || (fixedAbsenteeAssignments.get(p.id) || 0) >= 2)
                    );
                    if (!partnerObj) { // If no such preferred partner, try any eligible partner from the filtered pool
                        partnerObj = eligiblePartnersPool.find(p => true);
                    }

                    if (partnerObj) {
                        assignedPair = [absenteeObj.id, partnerObj.id];
                        fixedAbsenteeAssignments.set(absenteeObj.id, (fixedAbsenteeAssignments.get(absenteeObj.id) || 0) + 1);
                        // The following lines that incremented for partnerObj are removed/commented out:
                        // if(prevMonthAbsentees.has(partnerObj.id) && (fixedAbsenteeAssignments.get(partnerObj.id) || 0) < 2){
                        //      fixedAbsenteeAssignments.set(partnerObj.id, (fixedAbsenteeAssignments.get(partnerObj.id) || 0) + 1);
                        // }
                        fixedAssigneeId = absenteeObj.id; // Set fixedAssigneeId
                        // fixedAssignment = true; // Removed
                        break; 
                    }
                }
                
                if (assignedPair.length < 2) {
                    let baseCurrentIndex = slotInfo.categoryKey === 'elementary_6am' ? scheduleIndices[sequentialStateKeys.elementary_6am] : scheduleIndices[sequentialStateKeys.middle_7am];
                    let effectiveCurrentIndex = baseCurrentIndex;
                    let p1Obj = null, p2Obj = null;
                    let p1ScannedCountTotal = 0; // Total items scanned from baseCurrentIndex to find p1 and then p2

                    const maxSearchAttempts = targetPool.length + 1; // Iterate through pool once for p1
                    for (let p1Attempt = 0; p1Attempt < maxSearchAttempts && assignedPair.length < 2; p1Attempt++) {
                        p1Obj = null;
                        let p1ScannedThisTry = 0;
                        for (let i = 0; i < targetPool.length; i++) {
                            p1ScannedThisTry++;
                            const candidate = targetPool[(effectiveCurrentIndex + i) % targetPool.length];
                            if (!candidate || dailyAssignments.has(candidate.id)) continue;
                            
                            const isPrevAbsentee = prevMonthAbsentees.has(candidate.id);
                            const absenteeFixedCount = fixedAbsenteeAssignments.get(candidate.id) || 0;
                            if (isPrevAbsentee && absenteeFixedCount >= 2) continue;

                            // New weekly assignment eligibility check for p1 candidate
                            const p1CandidateCounts = assignmentCounts.get(candidate.id);
                            const p1CandidateWeeklyAssignments = participantWeeklyAssignments.get(candidate.id);
                            const currentWeekForSlot = getWeekOfMonth(currentDate); // Ensure currentDate is in scope
                            if (p1CandidateCounts.total >= 2 && p1CandidateWeeklyAssignments.has(currentWeekForSlot)) {
                                continue; // Skip this candidate for p1
                            }

                            p1Obj = candidate;
                            break;
                        }

                        if (!p1Obj) break; // No valid p1 found in the rest of the pool

                        p2Obj = null;
                        let p2ScannedThisTry = 0;
                        for (let i = 1; i < targetPool.length; i++) { // Start search for p2 after p1's relative position
                            p2ScannedThisTry++;
                            const p2CandidateIndex = (effectiveCurrentIndex + p1ScannedThisTry -1 + i) % targetPool.length;
                            const candidate = targetPool[p2CandidateIndex];

                            if (!candidate || dailyAssignments.has(candidate.id) || candidate.id === p1Obj.id) continue;
                            
                            const isPrevAbsentee = prevMonthAbsentees.has(candidate.id);
                            const absenteeFixedCount = fixedAbsenteeAssignments.get(candidate.id) || 0;
                            if (isPrevAbsentee && absenteeFixedCount >= 2) continue;

                            // New weekly assignment eligibility check for p2 candidate
                            const p2CandidateCounts = assignmentCounts.get(candidate.id);
                            const p2CandidateWeeklyAssignments = participantWeeklyAssignments.get(candidate.id);
                            const currentWeekForSlot = getWeekOfMonth(currentDate); // Ensure currentDate is in scope
                            if (p2CandidateCounts.total >= 2 && p2CandidateWeeklyAssignments.has(currentWeekForSlot)) {
                                continue; // Skip this candidate for p2
                            }

                            if (candidate.gender === p1Obj.gender) { // SAME GENDER CHECK
                                p2Obj = candidate;
                                break;
                            }
                        }
                        
                        if (p1Obj && p2Obj) {
                            assignedPair = [p1Obj.id, p2Obj.id];
                            p1ScannedCountTotal = p1ScannedThisTry + p2ScannedThisTry;
                            [p1Obj, p2Obj].forEach(person => {
                                if (prevMonthAbsentees.has(person.id) && (fixedAbsenteeAssignments.get(person.id) || 0) < 2) {
                                    fixedAbsenteeAssignments.set(person.id, (fixedAbsenteeAssignments.get(person.id) || 0) + 1);
                                }
                            });
                            effectiveCurrentIndex += p1ScannedCountTotal;
                            if (slotInfo.categoryKey === 'elementary_6am') scheduleIndices[sequentialStateKeys.elementary_6am] = effectiveCurrentIndex;
                            else scheduleIndices[sequentialStateKeys.middle_7am] = effectiveCurrentIndex;
                            break; 
                        } else if (p1Obj) { // p1 found, but no p2. Advance effectiveCurrentIndex past p1.
                            effectiveCurrentIndex += p1ScannedThisTry;
                            p1ScannedCountTotal = 0; // Reset for next p1 search
                        }
                    }
                }

            } else if (slotInfo.random) {
                let eligibleForRandom = targetPool.filter(p => !prevMonthAbsentees.has(p.id));
                if (eligibleForRandom.length < 2) { 
                    eligibleForRandom = targetPool.filter(p => p.isActive); // Use all active if not enough non-absentees
                }
                
                eligibleForRandom.sort((a, b) => {
                    const countA = assignmentCounts.get(a.id)[slotInfo.type === 'elementary' ? 'random_elementary' : 'random_middle'];
                    const countB = assignmentCounts.get(b.id)[slotInfo.type === 'elementary' ? 'random_elementary' : 'random_middle'];
                    if (countA !== countB) return countA - countB;
                    return Math.random() - 0.5; 
                });

                for (let i = 0; i < eligibleForRandom.length && assignedPair.length < 2; i++) {
                    const p1Candidate = eligibleForRandom[i];
                    if (dailyAssignments.has(p1Candidate.id)) continue;

                    // New weekly assignment eligibility check for p1Candidate
                    const p1Counts = assignmentCounts.get(p1Candidate.id);
                    const p1WeeklyAssignments = participantWeeklyAssignments.get(p1Candidate.id);
                    const currentWeekForSlot = getWeekOfMonth(currentDate);
                    if (p1Counts.total >= 2 && p1WeeklyAssignments.has(currentWeekForSlot)) {
                        continue; // Skip this p1Candidate
                    }
                    const p1Obj = p1Candidate; // Assign to p1Obj if eligible

                    for (let j = i + 1; j < eligibleForRandom.length; j++) {
                        const p2Candidate = eligibleForRandom[j];
                        if (dailyAssignments.has(p2Candidate.id)) continue;

                        // New weekly assignment eligibility check for p2Candidate
                        const p2Counts = assignmentCounts.get(p2Candidate.id);
                        const p2WeeklyAssignments = participantWeeklyAssignments.get(p2Candidate.id);
                        // currentWeekForSlot is already defined from p1Obj check scope
                        if (p2Counts.total >= 2 && p2WeeklyAssignments.has(currentWeekForSlot)) {
                            continue; // Skip this p2Candidate
                        }
                        const p2Obj = p2Candidate; // Assign to p2Obj if eligible

                        if (p1Obj.gender === p2Obj.gender) { // SAME GENDER CHECK
                            assignedPair = [p1Obj.id, p2Obj.id];
                            break; 
                        }
                    }
                    if (assignedPair.length === 2) break;
                }

                if (assignedPair.length < 2 && eligibleForRandom.length >=2) {
                    let fallbackIndexKey = slotInfo.type === 'elementary' ? sequentialStateKeys.elementary_random_fallback : sequentialStateKeys.middle_random_fallback;
                    let baseCurrentIndex = scheduleIndices[fallbackIndexKey];
                    let effectiveCurrentIndex = baseCurrentIndex;
                    let p1Obj = null, p2Obj = null;
                    let p1ScannedCountTotal = 0;
                    
                    const maxSearchAttempts = eligibleForRandom.length + 1;
                    for (let p1Attempt = 0; p1Attempt < maxSearchAttempts && assignedPair.length < 2; p1Attempt++) {
                        p1Obj = null;
                        let p1ScannedThisTry = 0;
                        for (let i = 0; i < eligibleForRandom.length; i++) {
                             p1ScannedThisTry++;
                            const candidate = eligibleForRandom[(effectiveCurrentIndex + i) % eligibleForRandom.length];
                            if (!candidate || dailyAssignments.has(candidate.id) || assignedPair.includes(candidate.id)) continue;

                            // New weekly assignment eligibility check for p1 candidate
                            const p1CandidateCounts = assignmentCounts.get(candidate.id);
                            const p1CandidateWeeklyAssignments = participantWeeklyAssignments.get(candidate.id);
                            const currentWeekForSlot = getWeekOfMonth(currentDate);
                            if (p1CandidateCounts.total >= 2 && p1CandidateWeeklyAssignments.has(currentWeekForSlot)) {
                                continue; // Skip this candidate for p1
                            }
                            p1Obj = candidate;
                            break;
                        }
                        if (!p1Obj) break;

                        p2Obj = null;
                        let p2ScannedThisTry = 0;
                        for (let i = 1; i < eligibleForRandom.length; i++) {
                            p2ScannedThisTry++;
                            const p2CandidateIndex = (effectiveCurrentIndex + p1ScannedThisTry -1 + i) % eligibleForRandom.length;
                            const candidate = eligibleForRandom[p2CandidateIndex];
                            if (!candidate || dailyAssignments.has(candidate.id) || candidate.id === p1Obj.id || assignedPair.includes(candidate.id)) continue;

                            // New weekly assignment eligibility check for p2 candidate
                            // currentWeekForSlot is already defined from p1Obj check scope
                            const p2CandidateCounts = assignmentCounts.get(candidate.id);
                            const p2CandidateWeeklyAssignments = participantWeeklyAssignments.get(candidate.id);
                            if (p2CandidateCounts.total >= 2 && p2CandidateWeeklyAssignments.has(currentWeekForSlot)) {
                                continue; // Skip this candidate for p2
                            }
                            
                            if (candidate.gender === p1Obj.gender) { // SAME GENDER CHECK
                                p2Obj = candidate;
                                break;
                            }
                        }

                        if (p1Obj && p2Obj) {
                            assignedPair = [p1Obj.id, p2Obj.id];
                            p1ScannedCountTotal = p1ScannedThisTry + p2ScannedThisTry;
                            effectiveCurrentIndex += p1ScannedCountTotal;
                            scheduleIndices[fallbackIndexKey] = effectiveCurrentIndex;
                            break; 
                        } else if (p1Obj) {
                            effectiveCurrentIndex += p1ScannedThisTry;
                             p1ScannedCountTotal = 0;
                        }
                    }
                }
            }

            if (assignedPair.length === 2) {
                assignedPair.forEach(id => {
                    dailyAssignments.add(id);
                    const counts = assignmentCounts.get(id);
                    counts.total++;
                    if (slotInfo.random) {
                        if (slotInfo.type === 'elementary') counts.random_elementary++;
                        else counts.random_middle++;
                    }
                    // Update weekly assignments
                    const weekOfMonth = getWeekOfMonth(currentDate);
                    participantWeeklyAssignments.get(id).add(weekOfMonth);
                });
                const assignedPairNames = assignedPair.map(id => participantsMap.get(id)?.name || `ID:${id}`);

                let isFixedStatusArray = [false, false];
                if (assignedPair.length === 2) {
                    isFixedStatusArray = assignedPair.map(id => id === fixedAssigneeId && fixedAssigneeId !== null);
                }

                daySchedule.timeSlots.push({ 
                    time: slotInfo.time, 
                    type: slotInfo.type, 
                    assigned: assignedPair,
                    assignedNames: assignedPairNames,
                    isFixedStatus: isFixedStatusArray
                });
            } else {
                 daySchedule.timeSlots.push({ 
                    time: slotInfo.time, 
                    type: slotInfo.type, 
                    assigned: [],
                    assignedNames: ['미배정'],
                    isFixedStatus: [false, false]
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
    return scheduleData;
}
