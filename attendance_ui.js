import * as attendanceLogic from './attendance_logic.js';
import * as db from './db.js';

let attendanceFilterToggle;
let currentAttendanceFilter = 'all'; // Possible values: 'all', 'absent'
let currentAttendanceViewMode = 'daily'; // 'daily' or 'monthly'
let isAttendanceViewInitialized = false;
let allParticipantsMap = new Map()

const viewContainerId = 'attendanceView';
let yearSelect, monthSelect, daySelect, loadButton;
let dateDisplayDiv, listContainerDiv, messageDiv;

export async function initAttendanceView(containerId) {
    try {
        const participants = await db.getAllParticipants();
        allParticipantsMap.clear(); // Clear previous data
        participants.forEach(p => allParticipantsMap.set(p.id, p));
    } catch (error) {
        console.error("Failed to load all participants for attendance view:", error);
        allParticipantsMap.clear(); // Ensure map is empty on error
    }

    currentAttendanceFilter = 'all';
    currentAttendanceViewMode = 'daily'; // Default view mode

    const viewElement = document.getElementById(containerId || viewContainerId);
    if (!viewElement) {
        console.error(`Attendance view container #${containerId || viewContainerId} not found.`);
        return;
    }

    yearSelect = viewElement.querySelector('#attendance-year');
    monthSelect = viewElement.querySelector('#attendance-month');
    daySelect = viewElement.querySelector('#attendance-day');
    loadButton = viewElement.querySelector('#view-attendance-btn');
    attendanceFilterToggle = viewElement.querySelector('#attendance-filter-toggle-btn'); // Added this line
    if (loadButton) {
        loadButton.innerHTML = '<i data-lucide="calendar-days" class="mr-2 h-4 w-4"></i>월별 현황';
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
    dateDisplayDiv = viewElement.querySelector('#attendance-date-display');
    listContainerDiv = viewElement.querySelector('#attendance-list-container');
    messageDiv = viewElement.querySelector('#attendance-message');

    if (!yearSelect || !monthSelect || !daySelect || !loadButton || !dateDisplayDiv || !listContainerDiv || !messageDiv) {
        console.error('Required elements within attendance view not found.');
        return;
    }

    const today = new Date();
    yearSelect.value = today.getFullYear();
    monthSelect.value = today.getMonth() + 1;

    populateDaySelect(today.getFullYear(), today.getMonth() + 1);
    // populateDaySelect must be called before setting daySelect.value if month changes
    populateDaySelect(parseInt(yearSelect.value), parseInt(monthSelect.value));
    daySelect.value = today.getDate();

    // Update button texts based on initial state
    updateAttendanceFilterButtonText();
    if (loadButton) {
        if (currentAttendanceViewMode === 'daily') {
            loadButton.innerHTML = '<i data-lucide="calendar-days" class="mr-2 h-4 w-4"></i>월별 현황';
        } else { // Should not happen on init as mode is set to daily, but for completeness
            loadButton.innerHTML = '<i data-lucide="calendar-day" class="mr-2 h-4 w-4"></i>일자별 현황';
        }
        if (typeof lucide !== 'undefined') { lucide.createIcons(); }
    }

    if (!isAttendanceViewInitialized) {
        // Add event listeners ONLY ONCE
        if (yearSelect) {
            yearSelect.addEventListener('change', () => {
                const year = parseInt(yearSelect.value);
                const month = parseInt(monthSelect.value);
                populateDaySelect(year, month);
                const day = parseInt(daySelect.value);
                loadAndRenderSingleDayAttendance(year, month, day);
            });
        }
        if (monthSelect) {
            monthSelect.addEventListener('change', () => {
                const year = parseInt(yearSelect.value);
                const month = parseInt(monthSelect.value);
                populateDaySelect(year, month);
                const day = parseInt(daySelect.value);
                loadAndRenderSingleDayAttendance(year, month, day);
            });
        }
        if (daySelect) {
            daySelect.addEventListener('change', () => {
                const year = parseInt(yearSelect.value);
                const month = parseInt(monthSelect.value);
                const day = parseInt(daySelect.value);
                loadAndRenderSingleDayAttendance(year, month, day);
            });
        }
        if (loadButton) {
            loadButton.addEventListener('click', () => {
                if (currentAttendanceViewMode === 'daily') {
                    handleLoadAttendanceForSelectedMonth();
                } else {
                    const year = parseInt(yearSelect.value);
                    const month = parseInt(monthSelect.value);
                    const day = parseInt(daySelect.value);
                    if (year && month && day) {
                        loadAndRenderSingleDayAttendance(year, month, day);
                    } else {
                        const todayForFallback = new Date(); // new instance
                        loadAndRenderSingleDayAttendance(todayForFallback.getFullYear(), todayForFallback.getMonth() + 1, todayForFallback.getDate());
                    }
                }
            });
        }
        if (attendanceFilterToggle) {
             attendanceFilterToggle.addEventListener('click', handleToggleAttendanceFilter);
        } else {
             console.warn('#attendance-filter-toggle-btn not found. Ensure it is added to index.html.');
        }

        if (listContainerDiv) {
            listContainerDiv.addEventListener('click', (event) => {
                const callStudentButton = event.target.closest('.btn-call-student');
                if (callStudentButton) {
                    event.stopPropagation();
                    const participantId = parseInt(callStudentButton.dataset.participantId, 10);
                    const participant = allParticipantsMap.get(participantId);

                    if (participant && participant.studentPhone) {
                        const phoneNumber = participant.studentPhone.trim();
                        if (phoneNumber) {
                            window.location.href = 'tel:' + phoneNumber;
                        } else {
                            alert('해당 학생의 연락처 정보가 없습니다.');
                        }
                    } else {
                        alert('해당 학생의 연락처를 찾을 수 없거나 정보가 없습니다.');
                    }
                }

                const callParentButton = event.target.closest('.btn-call-parent');
                if (callParentButton) {
                    event.stopPropagation();
                    const participantId = parseInt(callParentButton.dataset.participantId, 10);
                    const participant = allParticipantsMap.get(participantId);

                    if (participant && participant.parentPhone) {
                        const phoneNumber = participant.parentPhone.trim();
                        if (phoneNumber) {
                            window.location.href = 'tel:' + phoneNumber;
                        } else {
                            alert('해당 참가자의 부모 연락처 정보가 없습니다.');
                        }
                    } else {
                        alert('해당 참가자의 부모 연락처를 찾을 수 없거나 정보가 없습니다.');
                    }
                }
            });
        }

        isAttendanceViewInitialized = true;
    }

    // "Reset All Absences" button logic
    const sectionTitleH2 = viewElement.querySelector('h2.text-xl.font-semibold.text-sky-700'); // Targets "월별 출석현황" or "일일 출석현황"
    let resetAllAbsencesBtn = viewElement.querySelector('#reset-all-absences-btn');

    if (!resetAllAbsencesBtn) {
        resetAllAbsencesBtn = document.createElement('button');
        resetAllAbsencesBtn.id = 'reset-all-absences-btn';
        // Listener attached below, after ensuring it's in DOM
    }

    resetAllAbsencesBtn.title = '현재 보기의 모든 결석을 출석으로 변경';
    resetAllAbsencesBtn.innerHTML = '<i data-lucide="trash-2" class="h-5 w-5"></i>';
    resetAllAbsencesBtn.className = 'btn btn-icon btn-warning p-2';

    if (sectionTitleH2) {
        let titleContainer = viewElement.querySelector('#attendance-title-container');
        if (!titleContainer) {
            titleContainer = document.createElement('div');
            titleContainer.id = 'attendance-title-container';
            titleContainer.className = 'flex justify-between items-center';

            if (sectionTitleH2.classList.contains('mb-4')) {
                sectionTitleH2.classList.remove('mb-4');
                titleContainer.classList.add('mb-4'); // Apply margin to the new container
            }

            sectionTitleH2.parentNode.insertBefore(titleContainer, sectionTitleH2);
            titleContainer.appendChild(sectionTitleH2);
        }

        // Ensure button is appended to the titleContainer
        if (resetAllAbsencesBtn.parentNode !== titleContainer) {
            titleContainer.appendChild(resetAllAbsencesBtn);
        }
    } else {
        console.error('Attendance view H2 title not found. Cannot position reset all absences button next to title.');
        // Fallback: If H2 is not found, try to append it to a less ideal, but defined location
        // For example, near the filter toggle, if that exists.
        // This part should be robust or clearly log that the primary position failed.
        // For now, if H2 is missing, the button might not be added or added to viewElement directly if no other anchor.
        // To avoid errors, only append if a known parent exists or log an error.
        if (attendanceFilterToggle && attendanceFilterToggle.parentNode) {
            if(resetAllAbsencesBtn.parentNode) resetAllAbsencesBtn.parentNode.removeChild(resetAllAbsencesBtn); // Remove if already elsewhere
            attendanceFilterToggle.parentNode.insertBefore(resetAllAbsencesBtn, attendanceFilterToggle.nextSibling);
            resetAllAbsencesBtn.classList.add('ml-2');
             console.warn('Fallback: Reset all absences button placed next to filter toggle.');
        } else {
            console.error('Fallback location for resetAllAbsencesBtn also not found.');
        }
    }

    // Ensure event listener is correctly attached, removing any old ones first.
    // This should be done after the button is potentially (re)parented.
    if (resetAllAbsencesBtn && resetAllAbsencesBtn.isConnected) { // Check if button is part of the document
        resetAllAbsencesBtn.removeEventListener('click', handleResetAllAbsences);
        resetAllAbsencesBtn.addEventListener('click', handleResetAllAbsences);
    }

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // Initial data load - this should run every time the view is shown.
    loadAndRenderSingleDayAttendance(parseInt(yearSelect.value), parseInt(monthSelect.value), parseInt(daySelect.value));
}

function populateDaySelect(year, month) {
    if (!daySelect) return; // Should not happen if init is correct

    const currentDayValue = parseInt(daySelect.value); // Preserve current day if valid
    daySelect.innerHTML = ''; // Clear existing options

    if (!year || !month) { // If year or month is not set, don't populate days
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '일';
        daySelect.appendChild(defaultOption);
        return;
    }

    const daysInMonth = new Date(year, month, 0).getDate(); // month is 1-based

    for (let i = 1; i <= daysInMonth; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        daySelect.appendChild(option);
    }

    // Try to restore previous valid day or set to 1
    if (currentDayValue && currentDayValue <= daysInMonth) {
        daySelect.value = currentDayValue;
    } else if (daysInMonth > 0) {
        // If today's date is in the current month/year, select it, otherwise select 1.
        // This part will be refined in the next step when setting initial values.
        // For now, just setting to 1 if currentDayValue is invalid.
        daySelect.value = '1';
    }
}

function handleToggleAttendanceFilter() {
    if (currentAttendanceFilter === 'all') {
        currentAttendanceFilter = 'absent';
    } else {
        currentAttendanceFilter = 'all';
    }
    updateAttendanceFilterButtonText();
    // Re-load and render attendance data based on the new filter
    // This assumes yearSelect and monthSelect have current values
    if (yearSelect.value && monthSelect.value) {
        loadAndRenderMonthlyAttendance(parseInt(yearSelect.value), parseInt(monthSelect.value));
    }
}

function updateAttendanceFilterButtonText() {
    if (attendanceFilterToggle) {
        if (currentAttendanceFilter === 'all') {
            attendanceFilterToggle.textContent = '결석만 보기';
            // Optional: Add classes for styling if needed
            // attendanceFilterToggle.className = 'btn btn-secondary ...';
        } else {
            attendanceFilterToggle.textContent = '전체 보기';
            // Optional: Add classes for styling
            // attendanceFilterToggle.className = 'btn btn-info ...';
        }
    }
}

function handleLoadAttendanceForSelectedMonth() {
    const year = parseInt(yearSelect.value);
    const month = parseInt(monthSelect.value);

    if (!year || !month) {
        messageDiv.textContent = '년도와 월을 선택해주세요.';
        listContainerDiv.innerHTML = '';
        dateDisplayDiv.textContent = '';
        return;
    }
    loadAndRenderMonthlyAttendance(year, month);
}

function getDayOfWeekKorean(dateString) {
    const date = new Date(dateString);
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return days[date.getDay()];
}

async function loadAndRenderMonthlyAttendance(year, month) {
    currentAttendanceViewMode = 'monthly';
    if (loadButton) {
        loadButton.innerHTML = '<i data-lucide="calendar" class="mr-2 h-4 w-4"></i>일자별 현황'; // Changed icon name
        if (typeof lucide !== 'undefined') { lucide.createIcons(); }
    }
    console.log('Loading attendance with filter:', currentAttendanceFilter);
    dateDisplayDiv.textContent = `${year}년 ${month}월 출석 현황`;
    listContainerDiv.innerHTML = '';
    messageDiv.textContent = '월별 일정 로딩 중...';

    try {
        const scheduleForMonth = await db.getSchedule(year, month);
        
        if (!scheduleForMonth || !scheduleForMonth.data || scheduleForMonth.data.length === 0) {
            messageDiv.textContent = '해당 월의 일정이 없습니다.';
            return;
        }

        const sortedScheduleData = scheduleForMonth.data.sort((a, b) => new Date(a.date) - new Date(b.date));
        messageDiv.textContent = ''; 
        let itemsRendered = 0;

        for (const daySchedule of sortedScheduleData) {
            if (!daySchedule.timeSlots || daySchedule.timeSlots.length === 0) continue;

            const validTimeSlots = daySchedule.timeSlots.filter(slot => slot.assigned && slot.assigned.length > 0);
            if (validTimeSlots.length === 0) continue;

            validTimeSlots.sort((a, b) => a.time.localeCompare(b.time));

            const dateGroupDiv = document.createElement('div');
            dateGroupDiv.className = 'date-group mb-8 p-5 bg-slate-100 rounded-xl shadow-lg';
            
            const dateHeader = document.createElement('h3');
            const dayOfWeek = getDayOfWeekKorean(daySchedule.date);
            dateHeader.className = 'text-xl font-bold text-sky-800 border-b-2 border-sky-300 pb-3 mb-5';
            dateHeader.textContent = `${daySchedule.date} (${dayOfWeek}요일)`;
            dateGroupDiv.appendChild(dateHeader);

            let absenteesFoundForThisDay = false;

            for (const slot of validTimeSlots) {
                const timeSlotGroupDiv = document.createElement('div');
                timeSlotGroupDiv.className = 'time-slot-group mb-5 p-4 bg-white rounded-lg shadow-md';

                const timeSlotHeader = document.createElement('h4');
                timeSlotHeader.className = 'text-lg font-semibold text-slate-700 mb-3';
                timeSlotHeader.textContent = `${slot.time} - ${slot.type}`;
                timeSlotGroupDiv.appendChild(timeSlotHeader);

                for (let i = 0; i < slot.assigned.length; i++) {
                    const participantId = slot.assigned[i];
                    const participantName = slot.assignedNames[i] || `ID:${participantId}`;
                    
                    const attendanceStatus = await attendanceLogic.getAttendanceStatus(participantId, daySchedule.date);

                    if (currentAttendanceFilter === 'absent' && !attendanceStatus.isAbsent) {
                        continue;
                    }

                    if (currentAttendanceFilter === 'absent' /* && attendanceStatus.isAbsent is implied */) {
                        absenteesFoundForThisDay = true;
                    }
                    
                    const slotIdentifier = `${slot.time.replace(':', '')}-${slot.type.replace(/\\s+/g, '-').replace(':', '')}`;
                    const participantDivId = `attendance-participant-${daySchedule.date}-${participantId}-${slotIdentifier}`;

                    const participantDiv = document.createElement('div');
                    participantDiv.id = participantDivId;
                    participantDiv.className = `participant-item flex justify-between items-center py-2.5 px-4 rounded-lg shadow-sm mb-2 border ${attendanceStatus.isAbsent ? 'border-l-4 border-l-red-500 bg-red-50 border-red-200' : 'border-l-4 border-l-green-500 bg-green-50 border-green-200'}`;
                    if (slot.isFixedStatus && typeof slot.isFixedStatus[i] !== 'undefined') {
                        participantDiv.dataset.isFixed = slot.isFixedStatus[i];
                    } else {
                        participantDiv.dataset.isFixed = 'false'; // Default if not defined
                    }
                    
                    const participantInfoDiv = document.createElement('div');
                    participantInfoDiv.className = 'flex-grow mr-2';

                    let fixedIndicatorHTML = '';
                    if (slot.isFixedStatus && slot.isFixedStatus[i] === true) {
                        fixedIndicatorHTML = `<span class="font-semibold text-xs text-rose-600 ml-2">(고정)</span>`;
                    }
                    participantInfoDiv.innerHTML = `<p class="font-medium text-slate-800 text-sm sm:text-base">${participantName}${fixedIndicatorHTML}</p>`;

                    const button = document.createElement('button');
                    button.dataset.participantId = participantId;
                    button.dataset.dateString = daySchedule.date;
                    const dateObj = new Date(daySchedule.date);
                    button.dataset.year = dateObj.getFullYear();
                    button.dataset.month = dateObj.getMonth() + 1;
                    button.dataset.logId = attendanceStatus.logId || '';
                    button.dataset.isAbsent = attendanceStatus.isAbsent;
                    button.dataset.itemDivId = participantDivId; 
                    
                    updateButtonAppearance(button, attendanceStatus.isAbsent);
                    button.addEventListener('click', handleToggleAbsence);
                    
                    participantDiv.appendChild(participantInfoDiv);
                    participantDiv.appendChild(button);

                    // Create and add Student Call Button
                    const studentCallButton = document.createElement('button');
                    studentCallButton.className = 'btn btn-call-student bg-blue-500 hover:bg-blue-600 text-white py-1 px-3 text-xs sm:text-sm rounded whitespace-nowrap ml-2';
                    studentCallButton.innerHTML = '<i data-lucide="phone" class="h-3 w-3 mr-1"></i>학생';
                    studentCallButton.dataset.participantId = participantId;
                    participantDiv.appendChild(studentCallButton);

                    // Check conditions for Parent Call Button
                    if (slot.isFixedStatus && slot.isFixedStatus[i] === true && attendanceStatus.isAbsent === true) {
                        const parentCallButton = document.createElement('button');
                        parentCallButton.className = 'btn btn-call-parent bg-orange-500 hover:bg-orange-600 text-white py-1 px-3 text-xs sm:text-sm rounded whitespace-nowrap ml-2';
                        parentCallButton.innerHTML = '<i data-lucide="phone-outgoing" class="h-3 w-3 mr-1"></i>부모';
                        parentCallButton.dataset.participantId = participantId;
                        participantDiv.appendChild(parentCallButton);
                    }

                    timeSlotGroupDiv.appendChild(participantDiv);
                    itemsRendered++; // Count only rendered items
                }
                // Only add timeSlotGroup if it actually has participant items after filtering
                if (timeSlotGroupDiv.querySelectorAll('.participant-item').length > 0) {
                    dateGroupDiv.appendChild(timeSlotGroupDiv);
                }
            }

            // New condition for appending dateGroupDiv:
            if (currentAttendanceFilter === 'all') {
                // In 'Show All' mode, append if there are any participant items rendered for this day
                if (dateGroupDiv.querySelectorAll('.participant-item').length > 0) {
                    listContainerDiv.appendChild(dateGroupDiv);
                }
            } else { // currentAttendanceFilter === 'absent'
                // In 'Show Absences Only' mode, only append if absentees were actually found and rendered for this day
                // and the dateGroupDiv actually contains participant items (absentees).
                if (absenteesFoundForThisDay && dateGroupDiv.querySelectorAll('.participant-item').length > 0) {
                    listContainerDiv.appendChild(dateGroupDiv);
                }
            }
        }

        if (itemsRendered === 0) {
            if (currentAttendanceFilter === 'absent') {
                messageDiv.textContent = '해당 월에 기록된 불참 인원이 없습니다.';
            } else {
                messageDiv.textContent = '해당 월에 배정된 인원이 없거나, 일정이 없습니다.';
            }
        }

    } catch (error) {
        console.error("Error rendering monthly attendance:", error);
        listContainerDiv.innerHTML = '';
        messageDiv.textContent = '월별 출석 현황을 불러오는 중 오류가 발생했습니다.';
    }
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

async function handleResetAllAbsences() {
    const year = parseInt(yearSelect.value);
    const month = parseInt(monthSelect.value);
    let day = null;
    let periodString = `${year}년 ${month}월`;

    if (currentAttendanceViewMode === 'daily') {
        if (!daySelect.value) { // Check if daySelect has a value
            alert('일별 보기 모드에서는 날짜를 선택해야 합니다.');
            return;
        }
        day = parseInt(daySelect.value);
        if (isNaN(day)) {
            alert('유효한 날짜를 선택해주세요.');
            return;
        }
        periodString += ` ${day}일`;
    }

    if (confirm(`정말로 ${periodString}의 모든 결석 기록을 출석으로 변경하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) {
        try {
            messageDiv.textContent = '일괄 출석 처리 중...';
            messageDiv.className = 'text-blue-600 p-2 rounded-md bg-blue-50'; // Added some bg/padding

            const result = await attendanceLogic.clearAllAbsencesInView(year, month, day);

            if (result.success) {
                messageDiv.textContent = `${periodString}의 ${result.countCleared}건의 결석 기록이 삭제되었습니다 (출석으로 처리됨).`;
                messageDiv.className = 'text-green-600 p-2 rounded-md bg-green-50';
                // Refresh the current view
                if (currentAttendanceViewMode === 'daily') {
                    loadAndRenderSingleDayAttendance(year, month, day);
                } else {
                    loadAndRenderMonthlyAttendance(year, month);
                }
            } else {
                throw result.error || new Error('일괄 출석 처리 중 알 수 없는 오류 발생');
            }
        } catch (error) {
            console.error('Error resetting all absences:', error);
            messageDiv.textContent = `오류: ${error.message || '일괄 처리 중 오류가 발생했습니다.'}`;
            messageDiv.className = 'text-red-600 p-2 rounded-md bg-red-50';
        }
    }
}

function updateButtonAppearance(button, isAbsent) {
    button.textContent = isAbsent ? '출석' : '결석';
    button.className = `btn btn-attendance-toggle py-1 px-3 text-xs sm:text-sm rounded whitespace-nowrap ${
        isAbsent 
        ? 'bg-green-500 hover:bg-green-600 text-white' 
        : 'bg-yellow-500 hover:bg-yellow-600 text-white'
    }`;
}

async function handleToggleAbsence(event) {
    const button = event.currentTarget;
    const participantId = parseInt(button.dataset.participantId, 10);
    const dateString = button.dataset.dateString;
    const eventYear = parseInt(button.dataset.year, 10);
    const eventMonth = parseInt(button.dataset.month, 10);
    const currentLogId = button.dataset.logId ? parseInt(button.dataset.logId, 10) : null;
    const currentIsAbsent = button.dataset.isAbsent === 'true';
    const itemDivId = button.dataset.itemDivId;

    try {
        button.disabled = true;
        button.textContent = '처리 중...';

        const newStatus = await attendanceLogic.toggleAbsenceStatus(participantId, dateString, eventYear, eventMonth, currentIsAbsent, currentLogId);

        // Update button state regardless
        button.dataset.isAbsent = newStatus.isAbsent;
        button.dataset.logId = newStatus.logId || '';
        updateButtonAppearance(button, newStatus.isAbsent);

        const participantDiv = document.getElementById(itemDivId);
        if (participantDiv) {
            const isFixedAssignment = participantDiv.dataset.isFixed === 'true';
            let parentCallButton = participantDiv.querySelector('.btn-call-parent');

            if (isFixedAssignment && newStatus.isAbsent) {
                if (!parentCallButton) {
                    parentCallButton = document.createElement('button');
                    parentCallButton.className = 'btn btn-call-parent bg-orange-500 hover:bg-orange-600 text-white py-1 px-3 text-xs sm:text-sm rounded whitespace-nowrap ml-2';
                    parentCallButton.innerHTML = '<i data-lucide="phone-outgoing" class="h-3 w-3 mr-1"></i>부모';
                    parentCallButton.dataset.participantId = participantId.toString();

                    const studentCallBtn = participantDiv.querySelector('.btn-call-student');
                    if (studentCallBtn && studentCallBtn.nextSibling) {
                        participantDiv.insertBefore(parentCallButton, studentCallBtn.nextSibling);
                    } else if (studentCallBtn) {
                        participantDiv.appendChild(parentCallButton);
                    } else {
                         const attendanceToggleBtn = participantDiv.querySelector('.btn-attendance-toggle');
                         if (attendanceToggleBtn) {
                            participantDiv.appendChild(parentCallButton);
                         } else {
                            participantDiv.appendChild(parentCallButton);
                         }
                    }
                    if (typeof lucide !== 'undefined') {
                        lucide.createIcons();
                    }
                }
            } else {
                if (parentCallButton) {
                    parentCallButton.remove();
                }
            }
        }

        if (currentAttendanceViewMode === 'daily') {
            loadAndRenderSingleDayAttendance(parseInt(yearSelect.value), parseInt(monthSelect.value), parseInt(daySelect.value));
        } else { // monthly view
            if (currentAttendanceFilter === 'absent') {
                loadAndRenderMonthlyAttendance(parseInt(yearSelect.value), parseInt(monthSelect.value));
            } else {
                 // For 'all' filter in monthly view, the specific item's background was already updated by updateButtonAppearance
                 // and the parent call button by the logic above. No full re-render needed.
                 // However, if we don't re-render the specific participantDiv's class for background based on newStatus.isAbsent here,
                 // it won't update if currentAttendanceFilter is 'all'.
                 // The existing code was:
                 // const participantDivToUpdate = document.getElementById(itemDivId);
                 // if (participantDivToUpdate) {
                 //    participantDivToUpdate.className = `... based on newStatus.isAbsent ...`;
                 // }
                 // This is needed if we don't do a full monthly re-render.
                 const participantDivToUpdate = document.getElementById(itemDivId);
                 if (participantDivToUpdate) {
                    participantDivToUpdate.className = `participant-item flex justify-between items-center py-2.5 px-4 rounded-lg shadow-sm mb-2 border ${newStatus.isAbsent ? 'border-l-4 border-l-red-500 bg-red-50 border-red-200' : 'border-l-4 border-l-green-500 bg-green-50 border-green-200'}`;
                 }
            }
        }

    } catch (error) {
        console.error("Error toggling absence status:", error);
        alert('출석 상태 변경 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
        updateButtonAppearance(button, currentIsAbsent); 
    } finally {
        button.disabled = false;
    }
}

async function loadAndRenderSingleDayAttendance(year, month, day) {
    currentAttendanceViewMode = 'daily';
    if (loadButton) {
        loadButton.innerHTML = '<i data-lucide="calendar-days" class="mr-2 h-4 w-4"></i>월별 현황';
        if (typeof lucide !== 'undefined') { lucide.createIcons(); }
    }
    if (!year || !month || !day) {
        listContainerDiv.innerHTML = '';
        messageDiv.textContent = '날짜를 올바르게 선택해주세요.';
        dateDisplayDiv.textContent = '출석 현황';
        return;
    }

    dateDisplayDiv.textContent = `${year}년 ${month}월 ${day}일 출석 현황`;
    listContainerDiv.innerHTML = '';
    messageDiv.textContent = '일정 로딩 중...';

    try {
        const scheduleObject = await db.getSchedule(year, month);
        let daySchedule = null;

        if (scheduleObject && scheduleObject.data) {
            const dateStringToFind = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            daySchedule = scheduleObject.data.find(d => d.date === dateStringToFind);
        }

        if (!daySchedule || !daySchedule.timeSlots || daySchedule.timeSlots.length === 0) {
            messageDiv.textContent = '선택한 날짜에 예정된 일정이 없거나 배정된 인원이 없습니다.';
            return;
        }

        const validTimeSlots = daySchedule.timeSlots.filter(slot => slot.assigned && slot.assigned.length > 0);
        if (validTimeSlots.length === 0) {
            messageDiv.textContent = '선택한 날짜에 배정된 인원이 없습니다.';
            return;
        }

        messageDiv.textContent = '';

        const dateGroupDiv = document.createElement('div');
        dateGroupDiv.className = 'date-group mb-8 p-5 bg-slate-100 rounded-xl shadow-lg';

        validTimeSlots.sort((a, b) => a.time.localeCompare(b.time));

        for (const slot of validTimeSlots) {
            const timeSlotGroupDiv = document.createElement('div');
            timeSlotGroupDiv.className = 'time-slot-group mb-5 p-4 bg-white rounded-lg shadow-md';

            const timeSlotHeader = document.createElement('h4');
            timeSlotHeader.className = 'text-lg font-semibold text-slate-700 mb-3';
            timeSlotHeader.textContent = `${slot.time} - ${slot.type}`;
            timeSlotGroupDiv.appendChild(timeSlotHeader);

            for (let i = 0; i < slot.assigned.length; i++) {
                const participantId = slot.assigned[i];
                const participantName = (slot.assignedNames && slot.assignedNames[i]) ? slot.assignedNames[i] : `ID:${participantId}`;

                const attendanceStatus = await attendanceLogic.getAttendanceStatus(participantId, daySchedule.date);

                const slotIdentifier = `${slot.time.replace(':', '')}-${slot.type.replace(/\s+/g, '-').replace(':', '')}`;
                const participantDivId = `attendance-participant-${daySchedule.date}-${participantId}-${slotIdentifier}`;

                const participantDiv = document.createElement('div');
                participantDiv.id = participantDivId;
                participantDiv.className = `participant-item flex justify-between items-center py-2.5 px-4 rounded-lg shadow-sm mb-2 border ${attendanceStatus.isAbsent ? 'border-l-4 border-l-red-500 bg-red-50 border-red-200' : 'border-l-4 border-l-green-500 bg-green-50 border-green-200'}`;
                if (slot.isFixedStatus && typeof slot.isFixedStatus[i] !== 'undefined') {
                    participantDiv.dataset.isFixed = slot.isFixedStatus[i];
                } else {
                    participantDiv.dataset.isFixed = 'false'; // Default if not defined
                }

                const participantInfoDiv = document.createElement('div');
                participantInfoDiv.className = 'flex-grow mr-2';

                let fixedIndicatorHTML = '';
                    if (slot.isFixedStatus && slot.isFixedStatus[i] === true) {
                    fixedIndicatorHTML = `<span class="font-semibold text-xs text-rose-600 ml-2">(고정)</span>`;
                }
                participantInfoDiv.innerHTML = `<p class="font-medium text-slate-800 text-sm sm:text-base">${participantName}${fixedIndicatorHTML}</p>`;

                const button = document.createElement('button');
                button.dataset.participantId = participantId;
                button.dataset.dateString = daySchedule.date;
                const dateObj = new Date(daySchedule.date);
                button.dataset.year = dateObj.getFullYear();
                button.dataset.month = dateObj.getMonth() + 1;
                button.dataset.logId = attendanceStatus.logId || '';
                button.dataset.isAbsent = attendanceStatus.isAbsent;
                button.dataset.itemDivId = participantDivId;

                updateButtonAppearance(button, attendanceStatus.isAbsent);
                button.addEventListener('click', handleToggleAbsence);

                participantDiv.appendChild(participantInfoDiv);
                participantDiv.appendChild(button);

                // Create and add Student Call Button
                const studentCallButton = document.createElement('button');
                studentCallButton.className = 'btn btn-call-student bg-blue-500 hover:bg-blue-600 text-white py-1 px-3 text-xs sm:text-sm rounded whitespace-nowrap ml-2';
                studentCallButton.innerHTML = '<i data-lucide="phone" class="h-3 w-3 mr-1"></i>학생';
                studentCallButton.dataset.participantId = participantId;
                participantDiv.appendChild(studentCallButton);

                // Check conditions for Parent Call Button
                if (slot.isFixedStatus && slot.isFixedStatus[i] === true && attendanceStatus.isAbsent === true) {
                    const parentCallButton = document.createElement('button');
                    parentCallButton.className = 'btn btn-call-parent bg-orange-500 hover:bg-orange-600 text-white py-1 px-3 text-xs sm:text-sm rounded whitespace-nowrap ml-2';
                    parentCallButton.innerHTML = '<i data-lucide="phone-outgoing" class="h-3 w-3 mr-1"></i>부모';
                    parentCallButton.dataset.participantId = participantId;
                    participantDiv.appendChild(parentCallButton);
                }

                timeSlotGroupDiv.appendChild(participantDiv);
            }
             if (timeSlotGroupDiv.querySelectorAll('.participant-item').length > 0) {
                dateGroupDiv.appendChild(timeSlotGroupDiv);
            }
        }
        if (dateGroupDiv.querySelectorAll('.time-slot-group').length > 0) {
            listContainerDiv.appendChild(dateGroupDiv);
        } else {
             messageDiv.textContent = '선택한 날짜에 배정된 인원이 있는 일정이 없습니다.';
        }

    } catch (error) {
        console.error("Error rendering single day attendance:", error);
        listContainerDiv.innerHTML = '';
        messageDiv.textContent = '단일 출석 현황 로딩 중 오류 발생.';
    }
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}
