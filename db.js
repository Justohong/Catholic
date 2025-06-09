const DB_NAME = 'SchedulePWA_DB';
const DB_VERSION = 4; // Updated DB version
const PARTICIPANTS_STORE_NAME = 'participants';
const SCHEDULES_STORE_NAME = 'schedules';
const ATTENDANCE_LOG_STORE_NAME = 'attendanceLog';
const SCHEDULE_STATE_STORE_NAME = 'scheduleState';
const MONTHLY_ASSIGNMENT_COUNTS_STORE_NAME = 'monthlyAssignmentCounts'; // Added constant

let db;

export function openDB() {
    return new Promise((resolve, reject) => {
        if (db) {
            resolve(db);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error('Database error:', event.target.error);
            reject('Database error: ' + event.target.error);
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const tempDb = event.target.result;
            if (!tempDb.objectStoreNames.contains(PARTICIPANTS_STORE_NAME)) {
                const objectStore = tempDb.createObjectStore(PARTICIPANTS_STORE_NAME, { keyPath: 'id', autoIncrement: true });
                objectStore.createIndex('name', 'name', { unique: false });
                objectStore.createIndex('type', 'type', { unique: false }); 
            }
            if (!tempDb.objectStoreNames.contains(SCHEDULES_STORE_NAME)) {
                const scheduleStore = tempDb.createObjectStore(SCHEDULES_STORE_NAME, { keyPath: ['year', 'month'] });
                scheduleStore.createIndex('yearMonth', ['year', 'month'], { unique: true });
            }
            if (!tempDb.objectStoreNames.contains(ATTENDANCE_LOG_STORE_NAME)) {
                const attendanceStore = tempDb.createObjectStore(ATTENDANCE_LOG_STORE_NAME, { keyPath: 'id', autoIncrement: true });
                attendanceStore.createIndex('participantMonth', ['participantId', 'year', 'month'], { unique: false });
                attendanceStore.createIndex('date', 'date', { unique: false });
                attendanceStore.createIndex('yearMonthStatus', ['year', 'month', 'status'], { unique: false });
            }
            if (!tempDb.objectStoreNames.contains(SCHEDULE_STATE_STORE_NAME)) {
                tempDb.createObjectStore(SCHEDULE_STATE_STORE_NAME, { keyPath: 'category' });
            }
            // Schema for MONTHLY_ASSIGNMENT_COUNTS_STORE_NAME
            if (!tempDb.objectStoreNames.contains(MONTHLY_ASSIGNMENT_COUNTS_STORE_NAME)) {
                const store = tempDb.createObjectStore(MONTHLY_ASSIGNMENT_COUNTS_STORE_NAME, { keyPath: ['year', 'month', 'participantId', 'categoryKey'] });
                store.createIndex('yearMonthIndex', ['year', 'month'], { unique: false });
                store.createIndex('participantMonthIndex', ['participantId', 'year', 'month'], { unique: false });
            }
        };
    });
}

export async function addParticipant(participant) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([PARTICIPANTS_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(PARTICIPANTS_STORE_NAME);
        const request = store.add(participant);
        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function getAllParticipants() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([PARTICIPANTS_STORE_NAME], 'readonly');
        const store = transaction.objectStore(PARTICIPANTS_STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function getParticipant(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([PARTICIPANTS_STORE_NAME], 'readonly');
        const store = transaction.objectStore(PARTICIPANTS_STORE_NAME);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function updateParticipant(participant) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([PARTICIPANTS_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(PARTICIPANTS_STORE_NAME);
        const request = store.put(participant);
        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function deleteParticipant(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([PARTICIPANTS_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(PARTICIPANTS_STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function deleteMultipleParticipants(ids) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([PARTICIPANTS_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(PARTICIPANTS_STORE_NAME);
        let deletePromises = ids.map(id => {
            return new Promise((res, rej) => {
                const request = store.delete(id);
                request.onsuccess = () => res();
                request.onerror = (event) => rej(event.target.error);
            });
        });
        Promise.all(deletePromises)
            .then(() => resolve())
            .catch(error => reject(error));
        transaction.oncomplete = () => resolve(); // Resolve after all delete operations in transaction are done
        transaction.onerror = (event) => reject(event.target.error);
    });
}

export async function deleteAllParticipants() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([PARTICIPANTS_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(PARTICIPANTS_STORE_NAME);
        const request = store.clear();
        request.onsuccess = () => {
            console.log('All participants deleted successfully.');
            resolve();
        };
        request.onerror = (event) => {
            console.error('Error deleting all participants:', event.target.error);
            reject(event.target.error);
        };
    });
}

export async function saveSchedule(year, month, scheduleData) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([SCHEDULES_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(SCHEDULES_STORE_NAME);
        const request = store.put({ year, month, data: scheduleData });
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function getAllSchedules() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([SCHEDULES_STORE_NAME], 'readonly');
        const store = transaction.objectStore(SCHEDULES_STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function getSchedule(year, month) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([SCHEDULES_STORE_NAME], 'readonly');
        const store = transaction.objectStore(SCHEDULES_STORE_NAME);
        const request = store.get([year, month]);
        request.onsuccess = () => resolve(request.result ? request.result : null);
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function addAttendanceLogEntry(entry) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([ATTENDANCE_LOG_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(ATTENDANCE_LOG_STORE_NAME);
        const request = store.add(entry);
        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function getAllAttendanceLogs() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([ATTENDANCE_LOG_STORE_NAME], 'readonly');
        const store = transaction.objectStore(ATTENDANCE_LOG_STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function getAbsenteesForMonth(year, month) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([ATTENDANCE_LOG_STORE_NAME], 'readonly');
        const store = transaction.objectStore(ATTENDANCE_LOG_STORE_NAME);
        const index = store.index('yearMonthStatus');
        const request = index.getAll(IDBKeyRange.only([year, month, 'absent']));
        
        request.onsuccess = () => {
            const absenteesMap = new Map(); 
            request.result.forEach(record => {
                absenteesMap.set(record.participantId, (absenteesMap.get(record.participantId) || 0) + 1);
            });
            resolve(Array.from(absenteesMap.keys())); 
        };
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function getAttendanceLogForParticipantDate(participantId, dateString) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([ATTENDANCE_LOG_STORE_NAME], 'readonly');
        const store = transaction.objectStore(ATTENDANCE_LOG_STORE_NAME);
        const index = store.index('date'); 
        const request = index.getAll(IDBKeyRange.only(dateString));
        
        request.onsuccess = () => {
            const records = request.result;
            const specificRecord = records.find(r => r.participantId === participantId && r.status === 'absent');
            resolve(specificRecord || null);
        };
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function deleteAttendanceLogEntry(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([ATTENDANCE_LOG_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(ATTENDANCE_LOG_STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function clearAbsencesForPeriod(year, month, day = null) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([ATTENDANCE_LOG_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(ATTENDANCE_LOG_STORE_NAME);

        let query;
        if (day) {
            const dateIndex = store.index('date');
            const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            query = dateIndex.openCursor(IDBKeyRange.only(dateString));
        } else {
            const yearMonthStatusIndex = store.index('yearMonthStatus');
            query = yearMonthStatusIndex.openCursor(IDBKeyRange.only([year, month, 'absent']));
        }

        let deleteCount = 0;
        query.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                if (day) {
                    if (cursor.value.status === 'absent') {
                        store.delete(cursor.primaryKey);
                        deleteCount++;
                    }
                } else {
                    store.delete(cursor.primaryKey);
                    deleteCount++;
                }
                cursor.continue();
            } else {
                console.log(`Cleared ${deleteCount} absence logs for ${year}-${month}${day ? '-' + String(day).padStart(2,'0') : ''}.`);
                resolve(deleteCount);
            }
        };
        query.onerror = (event) => {
            console.error('Error clearing absences:', event.target.error);
            reject(event.target.error);
        };
    });
}

export async function getAllScheduleStates() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([SCHEDULE_STATE_STORE_NAME], 'readonly');
        const store = transaction.objectStore(SCHEDULE_STATE_STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function getScheduleState(category) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([SCHEDULE_STATE_STORE_NAME], 'readonly');
        const store = transaction.objectStore(SCHEDULE_STATE_STORE_NAME);
        const request = store.get(category);
        request.onsuccess = () => resolve(request.result ? request.result.value : undefined);
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function saveScheduleState(category, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([SCHEDULE_STATE_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(SCHEDULE_STATE_STORE_NAME);
        const request = store.put({ category, value });
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function resetAllScheduleState() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([SCHEDULE_STATE_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(SCHEDULE_STATE_STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => {
            console.log('All schedule states have been reset.');
            resolve();
        };
        request.onerror = (event) => {
            console.error('Error resetting schedule states:', event.target.error);
            reject(event.target.error);
        };
    });
}

export async function getAllMonthlyAssignmentCounts() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([MONTHLY_ASSIGNMENT_COUNTS_STORE_NAME], 'readonly');
        const store = transaction.objectStore(MONTHLY_ASSIGNMENT_COUNTS_STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function saveMonthlyAssignmentCounts(year, month, assignmentData) {
    const db = await openDB();
    return new Promise(async (resolve, reject) => {
        const transaction = db.transaction([MONTHLY_ASSIGNMENT_COUNTS_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(MONTHLY_ASSIGNMENT_COUNTS_STORE_NAME);

        const deleteCursorRequest = store.index('yearMonthIndex').openCursor(IDBKeyRange.only([year, month]));
        let deleteCount = 0;

        deleteCursorRequest.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                store.delete(cursor.primaryKey);
                deleteCount++;
                cursor.continue();
            } else {
                // All old records for the month are deleted
                console.log(`Deleted ${deleteCount} old assignment count entries for ${year}-${month}.`);
                putNewData();
            }
        };
        deleteCursorRequest.onerror = (event) => {
            console.error('Error deleting old assignment counts:', event.target.error);
            reject(event.target.error);
        };

        function putNewData() {
            if (assignmentData.length === 0) {
                resolve();
                return;
            }
            let putCounter = 0;
            assignmentData.forEach(item => {
                const fullRecord = { year, month, participantId: item.participantId, categoryKey: item.categoryKey, count: item.count };
                const request = store.put(fullRecord);
                request.onsuccess = () => {
                    putCounter++;
                    if (putCounter === assignmentData.length) {
                        resolve();
                    }
                };
                request.onerror = (event) => {
                    // Don't reject outer promise on single put error, but log it
                    console.error('Error putting assignment count item:', event.target.error, fullRecord);
                    putCounter++; // Still count it to allow Promise.all like behavior
                     if (putCounter === assignmentData.length) {
                        // If all attempts are done, resolve, but errors have been logged.
                        // Or, one could choose to reject here if any put fails.
                        resolve();
                    }
                };
            });
        }
        // Transaction handlers
        transaction.oncomplete = () => {
            console.log(`Transaction saveMonthlyAssignmentCounts for ${year}-${month} completed.`);
            // Resolve is handled by individual put operations success or final cursor step
        };
        transaction.onerror = (event) => {
            console.error('Transaction error in saveMonthlyAssignmentCounts:', event.target.error);
            reject(event.target.error);
        };
    });
}

export async function getPreviousMonthAssignmentCounts(currentYear, currentMonth) {
    let prevYear = currentYear;
    let prevMonth = currentMonth - 1;
    if (prevMonth === 0) {
        prevMonth = 12;
        prevYear--;
    }
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([MONTHLY_ASSIGNMENT_COUNTS_STORE_NAME], 'readonly');
        const store = transaction.objectStore(MONTHLY_ASSIGNMENT_COUNTS_STORE_NAME);
        const index = store.index('yearMonthIndex');
        const request = index.getAll(IDBKeyRange.only([prevYear, prevMonth]));
        request.onsuccess = () => {
            const results = request.result || [];
            const countsMap = new Map();
            results.forEach(record => {
                if (!countsMap.has(record.participantId)) {
                    countsMap.set(record.participantId, new Map());
                }
                countsMap.get(record.participantId).set(record.categoryKey, record.count);
            });
            resolve(countsMap);
        };
        request.onerror = (event) => {
            console.error('Error fetching previous month assignment counts:', event.target.error);
            reject(event.target.error);
        };
    });
}
