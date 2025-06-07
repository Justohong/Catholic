const DB_NAME = 'SchedulePWA_DB';
const DB_VERSION = 3; // Version remains 2 as no schema changes, only helper functions added
const PARTICIPANTS_STORE_NAME = 'participants';
const SCHEDULES_STORE_NAME = 'schedules';
const ATTENDANCE_LOG_STORE_NAME = 'attendanceLog';
const SCHEDULE_STATE_STORE_NAME = 'scheduleState';

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
        request.onsuccess = () => resolve(request.result);
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
        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject(event.target.error);
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

export async function getSchedule(year, month) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([SCHEDULES_STORE_NAME], 'readonly');
        const store = transaction.objectStore(SCHEDULES_STORE_NAME);
        const request = store.get([year, month]);
        request.onsuccess = () => resolve(request.result ? request.result : null); // Return full object or null
        request.onerror = (event) => reject(event.target.error);
    });
}


export async function addAttendanceLogEntry(entry) { // { participantId, date, year, month, status }
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([ATTENDANCE_LOG_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(ATTENDANCE_LOG_STORE_NAME);
        const request = store.add(entry);
        request.onsuccess = () => resolve(request.result); // request.result is the key of the new record
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
