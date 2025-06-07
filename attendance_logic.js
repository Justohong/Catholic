import * as db from './db.js';

export async function getAttendanceStatus(participantId, dateString) {
    try {
        const record = await db.getAttendanceLogForParticipantDate(participantId, dateString);
        return { isAbsent: !!record, logId: record ? record.id : null };
    } catch (error) {
        console.error(`Error fetching attendance status for P_ID ${participantId} on ${dateString}:`, error);
        throw error;
    }
}

export async function toggleAbsenceStatus(participantId, dateString, year, month, isCurrentlyAbsent, currentLogId) {
    try {
        if (isCurrentlyAbsent) {
            if (currentLogId) {
                await db.deleteAttendanceLogEntry(currentLogId);
            } else {
                console.warn(`Attempted to mark present (delete log) but no logId provided for P_ID ${participantId} on ${dateString}. Fetching fresh status.`);
                const freshStatus = await getAttendanceStatus(participantId, dateString);
                if (freshStatus.isAbsent && freshStatus.logId) {
                    await db.deleteAttendanceLogEntry(freshStatus.logId);
                } else {
                     console.warn(`No absence record found to delete for P_ID ${participantId} on ${dateString}.`);
                }
            }
            return { isAbsent: false, logId: null };
        } else {
            const newLogEntry = {
                participantId: participantId,
                date: dateString,
                year: year,
                month: month,
                status: 'absent'
            };
            const newLogId = await db.addAttendanceLogEntry(newLogEntry);
            return { isAbsent: true, logId: newLogId };
        }
    } catch (error) {
        console.error(`Error toggling attendance status for P_ID ${participantId} on ${dateString}:`, error);
        throw error;
    }
}
