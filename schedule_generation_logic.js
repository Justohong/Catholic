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

                    let partnerObj = targetPool.find(p => 
                        p.id !== absenteeObj.id &&
                        p.gender === absenteeObj.gender && // SAME GENDER CHECK
                        !dailyAssignments.has(p.id) && 
                        (!prevMonthAbsentees.has(p.id) || (fixedAbsenteeAssignments.get(p.id) || 0) >= 2)
                    );
                    if (!partnerObj) {
                        partnerObj = targetPool.find(p => 
                            p.id !== absenteeObj.id &&
                            p.gender === absenteeObj.gender && // SAME GENDER CHECK
                            !dailyAssignments.has(p.id)
                        );
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
                    const p1Obj = eligibleForRandom[i];
                    if (dailyAssignments.has(p1Obj.id)) continue;

                    for (let j = i + 1; j < eligibleForRandom.length; j++) {
                        const p2Obj = eligibleForRandom[j];
                        if (dailyAssignments.has(p2Obj.id)) continue;

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
