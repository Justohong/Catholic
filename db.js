// For testing purposes
let MOCK_PARTICIPANTS = null;
let MOCK_PREV_ASSIGNMENTS = null; // Should be Map<participantId, Map<categoryKey, count>>
let MOCK_PREV_ABSENTEES = null; // Should be Array<participantId>

export function __setMockData(participants, prevAssignments, prevAbsentees) {
    console.log("Setting mock DB data for test.");
    MOCK_PARTICIPANTS = participants ? JSON.parse(JSON.stringify(participants)) : null;
    if (prevAssignments) {
        MOCK_PREV_ASSIGNMENTS = new Map();
        // Ensure prevAssignments is a Map<participantId, Map<categoryKey, count>>
        // If it's passed as an array of [pId, MapData], convert appropriately
        // For simplicity, assume it's already a Map of Maps from the test setup.
        for (const [pId, catMapData] of prevAssignments.entries()) {
            MOCK_PREV_ASSIGNMENTS.set(pId, new Map(catMapData));
        }
    } else {
        MOCK_PREV_ASSIGNMENTS = null;
    }
    MOCK_PREV_ABSENTEES = prevAbsentees ? JSON.parse(JSON.stringify(prevAbsentees)) : null;
}

export function __clearMockData() {
    console.log("Clearing mock DB data.");
    MOCK_PARTICIPANTS = null;
    MOCK_PREV_ASSIGNMENTS = null;
    MOCK_PREV_ABSENTEES = null;
}

const DB_NAME = 'SchedulePWA_DB';
const DB_VERSION = 5; // Incremented DB version
const PARTICIPANTS_STORE_NAME = 'participants';
const SCHEDULES_STORE_NAME = 'schedules';
const SCHEDULE_CONFIRMATIONS_STORE_NAME = 'scheduleConfirmations'; // New store name
const ATTENDANCE_LOG_STORE_NAME = 'attendanceLog';
const SCHEDULE_STATE_STORE_NAME = 'scheduleState';
const MONTHLY_ASSIGNMENT_COUNTS_STORE_NAME = 'monthlyAssignmentCounts';

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
                const store = tempDb.createObjectStore(PARTICIPANTS_STORE_NAME, { keyPath: 'id', autoIncrement: true });
                store.createIndex('name', 'name', { unique: false });
                store.createIndex('type', 'type', { unique: false });
            }
            if (!tempDb.objectStoreNames.contains(SCHEDULES_STORE_NAME)) {
                const store = tempDb.createObjectStore(SCHEDULES_STORE_NAME, { keyPath: ['year', 'month'] });
                store.createIndex('yearMonth', ['year', 'month'], { unique: true });
            }
            if (!tempDb.objectStoreNames.contains(ATTENDANCE_LOG_STORE_NAME)) {
                const store = tempDb.createObjectStore(ATTENDANCE_LOG_STORE_NAME, { keyPath: 'id', autoIncrement: true });
                store.createIndex('participantMonth', ['participantId', 'year', 'month'], { unique: false });
                store.createIndex('date', 'date', { unique: false });
                store.createIndex('yearMonthStatus', ['year', 'month', 'status'], { unique: false });
            }
            if (!tempDb.objectStoreNames.contains(SCHEDULE_STATE_STORE_NAME)) {
                tempDb.createObjectStore(SCHEDULE_STATE_STORE_NAME, { keyPath: 'category' });
            }
            if (!tempDb.objectStoreNames.contains(MONTHLY_ASSIGNMENT_COUNTS_STORE_NAME)) {
                const store = tempDb.createObjectStore(MONTHLY_ASSIGNMENT_COUNTS_STORE_NAME, { keyPath: ['year', 'month', 'participantId', 'categoryKey'] });
                store.createIndex('yearMonthIndex', ['year', 'month'], { unique: false });
                store.createIndex('participantMonthIndex', ['participantId', 'year', 'month'], { unique: false });
            }
            // Add scheduleConfirmations store if it doesn't exist
            if (!tempDb.objectStoreNames.contains(SCHEDULE_CONFIRMATIONS_STORE_NAME)) {
                tempDb.createObjectStore(SCHEDULE_CONFIRMATIONS_STORE_NAME, { keyPath: ['year', 'month'] });
            }
        };
    });
}

export async function setScheduleConfirmation(year, month, status) {
    const db = await openDB();
    const tx = db.transaction(SCHEDULE_CONFIRMATIONS_STORE_NAME, 'readwrite');
    const store = tx.objectStore(SCHEDULE_CONFIRMATIONS_STORE_NAME);

    try {
        // Perform the put operation. This is queued within the transaction.
        store.put({ year, month, confirmed: status });

        // Wait for the transaction to complete successfully.
        // If any operation within the transaction (like the put) fails,
        // tx.done will reject.
        await tx.done;

        console.log(`DB.setScheduleConfirmation: SUCCESS for ${year}-${month} to ${status}.`);
        return true; // Indicate success
    } catch (error) {
        console.error(`DB.setScheduleConfirmation: FAILURE for ${year}-${month} to ${status}. Error:`, error);
        throw new Error(`Failed to set schedule confirmation: ${error.message || error}`);
    }
}

export async function getScheduleConfirmation(year, month) {
    const db = await openDB();
    const tx = db.transaction(SCHEDULE_CONFIRMATIONS_STORE_NAME, 'readonly');
    const store = tx.objectStore(SCHEDULE_CONFIRMATIONS_STORE_NAME);

    try {
        const record = await store.get([year, month]); // Assuming this await works (e.g. 'idb' lib)
        await tx.done;
        // console.log(`DB.getScheduleConfirmation: Read for ${year}-${month}. Record:`, record);
        return record ? record.confirmed : false;
    } catch (error) {
        console.error(`DB.getScheduleConfirmation: Error for ${year}-${month}:`, error);
        // Re-throw so upstream knows the read failed.
        throw new Error(`Database error while getting schedule confirmation: ${error.message || error}`);
    }
}

export async function removeScheduleConfirmation(year, month) {
    const db = await openDB();
    const tx = db.transaction(SCHEDULE_CONFIRMATIONS_STORE_NAME, 'readwrite');
    const store = tx.objectStore(SCHEDULE_CONFIRMATIONS_STORE_NAME);

    try {
        store.delete([year, month]); // Queue delete
        await tx.done; // Wait for transaction
        console.log(`DB.removeScheduleConfirmation: SUCCESS for ${year}-${month}.`);
        return true;
    } catch (error) {
        console.error(`DB.removeScheduleConfirmation: FAILURE for ${year}-${month}. Error:`, error);
        throw new Error(`Failed to remove schedule confirmation: ${error.message || error}`);
    }
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
    if (MOCK_PARTICIPANTS) {
        console.log("DB MOCK: getAllParticipants called");
        return Promise.resolve(JSON.parse(JSON.stringify(MOCK_PARTICIPANTS))); // Deep copy
    }
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
        let deleteCount = 0;
        if (ids.length === 0) {
            resolve();
            return;
        }
        ids.forEach(id => {
            const request = store.delete(id);
            request.onsuccess = () => {
                deleteCount++;
                if (deleteCount === ids.length) resolve();
            };
            request.onerror = (event) => reject(event.target.error);
        });
        transaction.oncomplete = () => resolve();
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
    if (MOCK_PARTICIPANTS) { // Using MOCK_PARTICIPANTS as a proxy for "test mode"
        console.log("DB MOCK: saveSchedule called with", year, month, JSON.parse(JSON.stringify(scheduleData)).length, "days");
        return Promise.resolve();
    }
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

export async function clearAllSchedules() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([SCHEDULES_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(SCHEDULES_STORE_NAME);
        const request = store.clear();
        request.onsuccess = () => {
            console.log('All schedules cleared.');
            resolve();
        };
        request.onerror = (event) => {
            console.error('Error clearing schedules:', event.target.error);
            reject(event.target.error);
        };
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

export async function clearAllAttendanceLogs() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([ATTENDANCE_LOG_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(ATTENDANCE_LOG_STORE_NAME);
        const request = store.clear();
        request.onsuccess = () => {
            console.log('All attendance logs cleared.');
            resolve();
        };
        request.onerror = (event) => {
            console.error('Error clearing attendance logs:', event.target.error);
            reject(event.target.error);
        };
    });
}

export async function getAbsenteesForMonth(year, month) {
    if (MOCK_PREV_ABSENTEES) {
        console.log("DB MOCK: getAbsenteesForMonth called for", year, month);
        return Promise.resolve(JSON.parse(JSON.stringify(MOCK_PREV_ABSENTEES))); // Deep copy
    }
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([ATTENDANCE_LOG_STORE_NAME], 'readonly');
        const store = transaction.objectStore(ATTENDANCE_LOG_STORE_NAME);
        const index = store.index('yearMonthStatus');
        const request = index.getAll(IDBKeyRange.only([year, month, 'absent']));
        request.onsuccess = () => {
            const absenteesMap = new Map(); 
            (request.result || []).forEach(record => {
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
            const records = request.result || [];
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

export async function clearAllMonthlyAssignmentCounts() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([MONTHLY_ASSIGNMENT_COUNTS_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(MONTHLY_ASSIGNMENT_COUNTS_STORE_NAME);
        const request = store.clear();
        request.onsuccess = () => {
            console.log('All monthly assignment counts cleared.');
            resolve();
        };
        request.onerror = (event) => {
            console.error('Error clearing monthly assignment counts:', event.target.error);
            reject(event.target.error);
        };
    });
}

export async function saveMonthlyAssignmentCounts(year, month, assignmentData) {
    if (MOCK_PARTICIPANTS) { // Using MOCK_PARTICIPANTS as a proxy for "test mode"
        console.log("DB MOCK: saveMonthlyAssignmentCounts called with", year, month, JSON.parse(JSON.stringify(assignmentData)));
        return Promise.resolve();
    }
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([MONTHLY_ASSIGNMENT_COUNTS_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(MONTHLY_ASSIGNMENT_COUNTS_STORE_NAME);

        const keysToDelete = [];
        const cursorRequest = store.index("yearMonthIndex").openKeyCursor(IDBKeyRange.only([year, month]));

        cursorRequest.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                // For a store with a composite keyPath like ['year', 'month', 'participantId', 'categoryKey'],
                // cursor.primaryKey will be that composite array.
                keysToDelete.push(cursor.primaryKey);
                cursor.continue();
            } else {
                // All keys for the month collected, proceed to delete then put.
                deleteOldAndPutNew();
            }
        };
        cursorRequest.onerror = (event) => {
            console.error("Error collecting keys for old assignment counts:", event.target.error);
            reject(event.target.error);
        };

        function deleteOldAndPutNew() {
            let deleteOperations = keysToDelete.map(primaryKey => {
                return new Promise((res, rej) => {
                    const deleteRequest = store.delete(primaryKey);
                    deleteRequest.onsuccess = () => res();
                    deleteRequest.onerror = (e) => rej(e.target.error);
                });
            });

            Promise.all(deleteOperations)
                .then(() => {
                    console.log(`Deleted ${keysToDelete.length} old assignment count entries for ${year}-${month}.`);
                    putNewData();
                })
                .catch(error => {
                    console.error("Error in deleting old assignment counts during bulk save:", error);
                    reject(error);
                });
        }

        function putNewData() {
            if (!assignmentData || assignmentData.length === 0) {
                resolve();
                return;
            }
            const putOperations = assignmentData.map(item => {
                return new Promise((res, rej) => {
                    const fullRecord = { year, month, participantId: item.participantId, categoryKey: item.categoryKey, count: item.count };
                    const request = store.put(fullRecord);
                    request.onsuccess = () => res();
                    request.onerror = (e) => rej(e.target.error);
                });
            });
            Promise.all(putOperations)
                .then(() => resolve())
                .catch(error => {
                    console.error('Error saving new assignment counts:', error);
                    reject(error);
                });
        }
        // If keysToDelete was initially empty (no old data for the month)
        if (keysToDelete.length === 0 && !cursorRequest.transaction) { // A bit of a heuristic, ideally check if cursor logic completed
             // This check might be problematic. The cursor onsuccess will call putNewData if keysToDelete is empty.
        }
    });
}

export async function getPreviousMonthAssignmentCounts(currentYear, currentMonth) {
    if (MOCK_PREV_ASSIGNMENTS) {
        console.log("DB MOCK: getPreviousMonthAssignmentCounts called for", currentYear, currentMonth);
        // Deep copy the map structure
        const clonedMap = new Map();
        for (const [pId, catMap] of MOCK_PREV_ASSIGNMENTS.entries()) {
            clonedMap.set(pId, new Map(catMap));
        }
        return Promise.resolve(clonedMap);
    }
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

export async function bulkPutStoreData(storeName, itemsArray) {
    if (!itemsArray || itemsArray.length === 0) {
        return Promise.resolve();
    }
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        let itemsPut = 0;
        let errored = false;

        itemsArray.forEach(item => {
            if (errored) return; // Stop processing if an error already occurred
            const request = store.put(item);
            request.onsuccess = () => {
                itemsPut++;
                if (itemsPut === itemsArray.length && !errored) {
                    console.log(`Successfully put ${itemsPut} items into ${storeName}.`);
                    resolve();
                }
            };
            request.onerror = (event) => {
                if (errored) return;
                errored = true;
                console.error(`Error putting item into ${storeName}:`, event.target.error, item);
                transaction.abort(); // Abort the transaction on first error
                reject(event.target.error);
            };
        });

        transaction.oncomplete = () => {
            // This will only be called if all individual put operations' onsuccess were called
            // AND no explicit transaction.abort() or unhandled errors occurred.
            // If resolve() was already called by the counter, this is fine.
            if (!errored) { // Ensure resolve wasn't called due to an error then success after abort
                 console.log(`Transaction for bulk put to ${storeName} completed.`);
                 // If itemsPut counter didn't resolve (e.g. itemsArray was empty but caught by initial check)
                 // we might need a resolve() here, but the initial check handles empty itemsArray.
                 // If all items succeeded, itemsPut counter should have resolved it.
            }
        };
        transaction.onerror = (event) => {
            if (!errored) { // Only reject if not already rejected by an item's onerror
                console.error(`Transaction error during bulk put to ${storeName}:`, event.target.error);
                reject(event.target.error);
            }
        };
    });
}
