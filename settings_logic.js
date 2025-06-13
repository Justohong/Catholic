// settings_logic.js
import * as db from './db.js';

export async function handleExportAllData() {
    try {
        console.log("Starting data export from settings_logic.js...");

        const participants = await db.getAllParticipants();
        const schedules = await db.getAllSchedules();
        const attendanceLogs = await db.getAllAttendanceLogs();
        const scheduleStates = await db.getAllScheduleStates();
        const monthlyAssignmentCounts = await db.getAllMonthlyAssignmentCounts();

        const allData = {
            dbVersion: 4, // Current DB version (as per last db.js update)
            exportDate: new Date().toISOString(),
            data: {
                participants,
                schedules,
                attendanceLogs,
                scheduleStates,
                monthlyAssignmentCounts
            }
        };

        const jsonString = JSON.stringify(allData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const timestamp = new Date().toISOString().replace(/[.:T]/g, '-').slice(0, -5);
        const filename = `Catholic_backup_${timestamp}.json`;

        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = filename;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        URL.revokeObjectURL(url);
        console.log("Data export successful.");
        return { success: true };

    } catch (error) {
        console.error('Data export failed:', error);
        return { success: false, error: error.message || 'Unknown error' };
    }
}

export async function handleImportAllData(file) {
    if (!file) {
        return { success: false, error: '파일이 선택되지 않았습니다.' };
    }

    try {
        console.log(`Starting data import from file: ${file.name}`);
        const fileContent = await file.text();
        const jsonData = JSON.parse(fileContent);

        if (!jsonData || typeof jsonData.dbVersion !== 'number' || typeof jsonData.data !== 'object') {
            throw new Error('유효하지 않은 백업 파일 형식입니다. (기본 구조 오류)');
        }

        // Directly compare with 4, as db.DB_VERSION might not be exported or accessible easily
        if (jsonData.dbVersion !== 4) {
            console.warn(`Importing data from a different DB version. Expected: 4, File: ${jsonData.dbVersion}. Proceeding with caution.`);
            // Consider adding a more user-facing warning or confirmation step here if versions mismatch significantly.
        }

        const {
            participants,
            schedules,
            attendanceLogs,
            scheduleStates, // Keep for now, even if scheduleIndices are not used by generation logic
            monthlyAssignmentCounts
        } = jsonData.data;

        if (!Array.isArray(participants) || !Array.isArray(schedules) ||
            !Array.isArray(attendanceLogs) || !Array.isArray(monthlyAssignmentCounts) ||
            !Array.isArray(scheduleStates) ) { // Ensure scheduleStates is also checked
            throw new Error('유효하지 않은 백업 파일 형식입니다. (데이터 배열 누락 또는 형식 오류)');
        }

        if (!confirm('정말로 현재 모든 데이터를 삭제하고 이 파일의 내용으로 복원하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
            console.log('Data import cancelled by user.');
            return { success: false, error: '사용자에 의해 취소됨', userCancelled: true };
        }

        console.log('Clearing existing data...');
        await db.deleteAllParticipants();
        await db.clearAllSchedules();
        await db.clearAllAttendanceLogs();
        await db.clearAllMonthlyAssignmentCounts();
        await db.resetAllScheduleState(); // Clears the scheduleState store
        console.log('All existing data cleared.');

        console.log('Importing new data...');
        // Using direct store names as strings, assuming db.js constants are not exported for this use.
        await Promise.all([
            db.bulkPutStoreData('participants', participants),
            db.bulkPutStoreData('schedules', schedules),
            db.bulkPutStoreData('attendanceLog', attendanceLogs),
            db.bulkPutStoreData('scheduleState', scheduleStates || []),
            db.bulkPutStoreData('monthlyAssignmentCounts', monthlyAssignmentCounts)
        ]);
        console.log('New data imported successfully.');

        return { success: true };

    } catch (error) {
        console.error('Data import failed:', error);
        return { success: false, error: error.message || '알 수 없는 오류 발생' };
    }
}
