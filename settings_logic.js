// settings_logic.js
import * as db from './db.js';

export async function handleExportAllData() {
    try {
        console.log("Starting data export from settings_logic.js...");
        // UI should ideally show a loading/progress state here

        const participants = await db.getAllParticipants();
        const schedules = await db.getAllSchedules();
        const attendanceLogs = await db.getAllAttendanceLogs();
        const scheduleStates = await db.getAllScheduleStates();
        const monthlyAssignmentCounts = await db.getAllMonthlyAssignmentCounts();

        const allData = {
            dbVersion: 4, // Current DB version
            exportDate: new Date().toISOString(),
            data: {
                participants,
                schedules,
                attendanceLogs,
                scheduleStates,
                monthlyAssignmentCounts
            }
        };

        // scheduleState 스토어가 더 이상 사용되지 않는다면(scheduleIndices 제거로 인해),
        // allData.data.scheduleStates 라인과 위의 getAllScheduleStates() 호출을 제거합니다.
        // 현재 schedule_generation_logic.js에서 scheduleIndices가 제거되었으므로,
        // scheduleStates는 빈 배열이거나, 더 이상 의미 없는 데이터를 포함할 수 있습니다.
        // 데이터 복원 시 이 부분을 어떻게 처리할지 정책이 필요합니다.
        // 이번 내보내기에서는 일단 포함합니다.

        const jsonString = JSON.stringify(allData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const timestamp = new Date().toISOString().replace(/[.:T]/g, '-').slice(0, -5); // Improved timestamp for filename
        const filename = `sungdang_backup_${timestamp}.json`;

        const downloadLink = document.createElement('a'); // Corrected variable name
        downloadLink.href = url;
        downloadLink.download = filename;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        URL.revokeObjectURL(url);
        console.log("Data export successful.");
        // UI feedback (like alert or message area update) is better handled in settings_ui.js
        // For now, this function focuses on the logic.
        // alert('모든 데이터가 성공적으로 내보내졌습니다!'); // Moved to UI wrapper

        return { success: true }; // Return a status

    } catch (error) {
        console.error('Data export failed:', error);
        // alert(`데이터 내보내기 실패: ${error.message}`); // Moved to UI wrapper
        // throw error; // Re-throw or return error status
        return { success: false, error: error.message || 'Unknown error' };
    }
}
