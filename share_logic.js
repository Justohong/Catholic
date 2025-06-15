import * as db from './db.js';
import { setScheduleConfirmation, getScheduleConfirmation, removeScheduleConfirmation } from './db.js';

export async function getScheduleForMonth(year, month) {
    return await db.getSchedule(year, month);
}

export async function getAvailableParticipantsForSlot(date, slotType, existingAssignedIdsInSlot, genderFilter, allParticipants, fullMonthScheduleData) {
    const typeKr = slotType === 'elementary' ? '초등' : '중등';

    const dailySchedule = fullMonthScheduleData.find(d => d.date === date);
    let participantsAssignedOnDate = new Set();
    if (dailySchedule && dailySchedule.timeSlots) {
        dailySchedule.timeSlots.forEach(slot => {
            slot.assigned.forEach(id => participantsAssignedOnDate.add(id));
        });
    }
    
    existingAssignedIdsInSlot.forEach(id => participantsAssignedOnDate.delete(id));


    return allParticipants.filter(p => {
        if (p.type !== typeKr) return false;
        if (genderFilter !== 'all' && p.gender !== genderFilter) return false;
        if (participantsAssignedOnDate.has(p.id)) return false; 
        if (existingAssignedIdsInSlot.includes(p.id)) return false; 
        return true;
    }).sort((a,b) => a.name.localeCompare(b.name));
}


export async function unassignParticipant(year, month, date, time, participantIdToUnassign) {
    const schedule = await db.getSchedule(year, month);
    if (!schedule || !schedule.data) throw new Error("기존 일정을 찾을 수 없습니다.");

    const scheduleData = schedule.data;
    const daySchedule = scheduleData.find(d => d.date === date);
    if (!daySchedule) throw new Error("해당 날짜의 일정을 찾을 수 없습니다.");

    const timeSlot = daySchedule.timeSlots.find(ts => ts.time === time);
    if (!timeSlot) throw new Error("해당 시간대의 일정을 찾을 수 없습니다.");

    timeSlot.assigned = timeSlot.assigned.filter(id => id !== participantIdToUnassign);
    
    await db.saveSchedule(year, month, scheduleData);
}

export async function confirmSchedule(year, month) {
    if (!year || !month) {
        console.error("confirmSchedule: Year and month are required.");
        return { success: false, error: "Year and month are required." };
    }
    try {
        await setScheduleConfirmation(year, month, true);
        console.log(`Schedule for ${year}-${month} confirmed in share_logic.`);
        return { success: true };
    } catch (error) {
        console.error(`Error confirming schedule for ${year}-${month}:`, error);
        return { success: false, error: error.message || "Failed to confirm schedule." };
    }
}

export async function cancelScheduleConfirmation(year, month) {
    if (!year || !month) {
        console.error("cancelScheduleConfirmation: Year and month are required.");
        return { success: false, error: "Year and month are required." };
    }
    try {
        await removeScheduleConfirmation(year, month);
        console.log(`Schedule confirmation for ${year}-${month} cancelled in share_logic.`);
        return { success: true };
    } catch (error) {
        console.error(`Error cancelling schedule confirmation for ${year}-${month}:`, error);
        return { success: false, error: error.message || "Failed to cancel schedule confirmation." };
    }
}

export async function isScheduleConfirmed(year, month) {
    if (!year || !month) {
        console.error("isScheduleConfirmed: Year and month are required.");
        // Return true or throw error? Let's return a value indicating uncertainty or error.
        // For now, let's assume if year/month are invalid, it cannot be confirmed.
        return false;
    }
    try {
        const confirmed = await getScheduleConfirmation(year, month);
        return confirmed;
    } catch (error) {
        console.error(`Error checking schedule confirmation for ${year}-${month}:`, error);
        // In case of error, should we assume not confirmed or propagate error?
        // For safety, let's assume not confirmed if there's an error reading status.
        return false;
    }
}

export async function replaceParticipant(year, month, date, time, participantIdToReplace, newParticipantId) {
    const schedule = await db.getSchedule(year, month);
    if (!schedule || !schedule.data) throw new Error("기존 일정을 찾을 수 없습니다.");

    const scheduleData = schedule.data;
    const daySchedule = scheduleData.find(d => d.date === date);
    if (!daySchedule) throw new Error("해당 날짜의 일정을 찾을 수 없습니다.");
    
    const timeSlot = daySchedule.timeSlots.find(ts => ts.time === time);
    if (!timeSlot) throw new Error("해당 시간대의 일정을 찾을 수 없습니다.");

    const index = timeSlot.assigned.indexOf(participantIdToReplace);
    if (index === -1) throw new Error("교체할 기존 인원을 찾을 수 없습니다.");

    const allParticipants = await db.getAllParticipants();
    const newParticipant = allParticipants.find(p => p.id === newParticipantId);
    if (!newParticipant) throw new Error("새로운 인원 정보를 찾을 수 없습니다.");


    const slotTypeKr = timeSlot.type === 'elementary' ? '초등' : '중등';
    if (newParticipant.type !== slotTypeKr) {
        throw new Error(`새로운 인원은 ${slotTypeKr} 유형이어야 합니다.`);
    }


    const dailyScheduleForCheck = scheduleData.find(d => d.date === date);
    let participantsAssignedOnDate = new Set();
    if (dailyScheduleForCheck && dailyScheduleForCheck.timeSlots) {
        dailyScheduleForCheck.timeSlots.forEach(s => {
            if (s.time === time) { // For the current slot, only consider others not being replaced
                s.assigned.forEach(id => {
                    if (id !== participantIdToReplace) participantsAssignedOnDate.add(id);
                });
            } else { // For other slots, consider all
                 s.assigned.forEach(id => participantsAssignedOnDate.add(id));
            }
        });
    }

    if (participantsAssignedOnDate.has(newParticipantId)) {
        throw new Error(`${newParticipant.name}님은 이미 해당 날짜의 다른 시간대에 배정되어 있습니다.`);
    }

    timeSlot.assigned[index] = newParticipantId;
    const participantDetails = allParticipants.find(p => p.id === newParticipantId);
    if (participantDetails) {
         const nameIndex = timeSlot.assignedNames.findIndex(name => {
            const oldParticipant = allParticipants.find(p => p.id === participantIdToReplace);
            return oldParticipant && name === oldParticipant.name;
         });
         if(nameIndex !== -1) {
            timeSlot.assignedNames[nameIndex] = participantDetails.name;
         }
    }


    await db.saveSchedule(year, month, scheduleData);
}
