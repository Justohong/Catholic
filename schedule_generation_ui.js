import * as logic from './schedule_generation_logic.js';
import * as db from './db.js';
import * as attendanceLogic from './attendance_logic.js';

let yearInput, monthInput, generateBtn, calendarDisplay, messageDiv, viewExistingScheduleBtn;

const KOREAN_DAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function initScheduleGenerationView(viewElementId) {
    const view = document.getElementById(viewElementId);
    if (!view) return;

    yearInput = view.querySelector('#schedule-year');
    monthInput = view.querySelector('#schedule-month');
    generateBtn = view.querySelector('#generate-schedule-btn');
    viewExistingScheduleBtn = view.querySelector('#view-existing-schedule-btn');
    calendarDisplay = view.querySelector('#schedule-calendar-display');
    messageDiv = view.querySelector('#schedule-generation-message');

    if (!yearInput || !monthInput || !generateBtn || !calendarDisplay || !messageDiv || !viewExistingScheduleBtn) {
        console.error("One or more elements not found in scheduleGenerationView");
        return;
    }

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    yearInput.value = currentYear;
    monthInput.value = currentMonth.toString();

    generateBtn.addEventListener('click', handleGenerateSchedule);
    if (viewExistingScheduleBtn) {
        viewExistingScheduleBtn.addEventListener('click', handleViewExistingSchedule);
    }

    // Check if the "Reset Current Month Schedule" button already exists
    let resetBtn = view.querySelector('#reset-current-month-schedule-btn');
    if (!resetBtn) { // If the button doesn't exist, create it
        resetBtn = document.createElement('button');
        resetBtn.id = 'reset-current-month-schedule-btn';
        // Add event listener only when creating the button
        resetBtn.addEventListener('click', handleResetCurrentMonthSchedule);
    }
    // Update button design (even if it already exists, in case of code updates)
    resetBtn.innerHTML = '<i data-lucide="trash-2" class="h-5 w-5"></i>';
    resetBtn.title = '이번 달 일정 초기화';
    resetBtn.className = 'btn btn-icon btn-warning p-2'; // Adjusted for icon-only button

    // Position the button next to the H2 title
    const sectionTitleH2 = view.querySelector('h2.text-xl.font-semibold');
    if (sectionTitleH2) {
        // Check if the new structure (titleContainer) is already applied
        if (sectionTitleH2.parentNode.id !== 'schedule-title-container') {
            const titleContainer = document.createElement('div');
            titleContainer.id = 'schedule-title-container'; // Add an ID for future reference
            titleContainer.className = 'flex justify-between items-center mb-4';

            // Move H2 into the new container
            sectionTitleH2.parentNode.insertBefore(titleContainer, sectionTitleH2);
            titleContainer.appendChild(sectionTitleH2);

            // If H2 had mb-4, remove it as titleContainer now has it
            sectionTitleH2.classList.remove('mb-4');

            titleContainer.appendChild(resetBtn);
        } else {
            // If titleContainer already exists, ensure resetBtn is inside it (e.g., if button was re-created but container exists)
            if (resetBtn.parentNode !== sectionTitleH2.parentNode) {
                sectionTitleH2.parentNode.appendChild(resetBtn);
            }
        }
    } else {
        // Fallback: if H2 not found, add to generateBtn's parent as before, but this is less ideal
        console.warn("Section title H2 not found. Appending reset button to generateBtn's parent as a fallback.");
        if (generateBtn.parentNode && resetBtn.parentNode !== generateBtn.parentNode) {
             generateBtn.parentNode.appendChild(resetBtn);
        } else if (!generateBtn.parentNode) {
            console.error("Could not find parent node of generateBtn to append reset button.");
        }
    }
    
    lucide.createIcons(); // Ensure all icons are rendered
    loadInitialScheduleForCurrentDate();
}

async function handleViewExistingSchedule() {
    const year = parseInt(yearInput.value);
    const month = parseInt(monthInput.value);

    if (!year || year < 2000 || year > 2100) {
        displayMessage('조회할 유효한 년도를 입력하세요 (2000-2100).', 'error');
        return;
    }
    if (!month || month < 1 || month > 12) {
        displayMessage('조회할 유효한 월을 선택하세요.', 'error');
        return;
    }

    displayMessage('기존 일정을 불러오는 중...', 'info');
    calendarDisplay.innerHTML = ''; // Clear previous calendar display

    try {
        const scheduleObject = await db.getSchedule(year, month); // scheduleObject can be {data: [...]} or null
        if (scheduleObject && scheduleObject.data && scheduleObject.data.length > 0) {
            renderCalendar(year, month, scheduleObject.data); // Pass the array
            displayMessage(`기존 ${year}년 ${month}월 일정을 불러왔습니다.`, 'info');
        } else {
            renderCalendar(year, month, null); // Render empty calendar
            displayMessage('저장된 기존 일정이 없습니다. 새로 생성할 수 있습니다.', 'info');
        }
    } catch (error) {
        console.error("Failed to load existing schedule:", error);
        renderCalendar(year, month, null); // Render empty calendar on error
        displayMessage('기존 일정 로드 중 오류 발생.', 'error');
    }
    if (typeof lucide !== 'undefined') { // Ensure icons in the message or calendar are rendered
        lucide.createIcons();
    }
}

async function loadInitialScheduleForCurrentDate() {
    const year = parseInt(yearInput.value);
    const month = parseInt(monthInput.value);
    if (year && month) {
        try {
            const scheduleObject = await db.getSchedule(year, month);
            if (scheduleObject && scheduleObject.data) { // Check for the object and its data property
                renderCalendar(year, month, scheduleObject.data); // Pass the actual array
                displayMessage('기존 생성된 일정을 불러왔습니다.', 'info');
            } else {
                renderCalendar(year, month, null); 
                // Optionally, differentiate message if scheduleObject exists but scheduleObject.data is missing/empty
                // For now, this message is fine.
                displayMessage('선택한 년/월의 저장된 일정이 없거나 비어있습니다. 새로 생성하세요.', 'info');
            }
        } catch (error) {
            console.error("Failed to load initial schedule:", error);
            renderCalendar(year, month, null);
            displayMessage('일정 로드 중 오류 발생.', 'error');
        }
    }
}


async function handleGenerateSchedule() {
    const year = parseInt(yearInput.value);
    const month = parseInt(monthInput.value);

    if (!year || year < 2000 || year > 2100) {
        displayMessage('유효한 년도를 입력하세요 (2000-2100).', 'error');
        return;
    }
    if (!month || month < 1 || month > 12) {
        displayMessage('유효한 월을 선택하세요.', 'error');
        return;
    }

    generateBtn.disabled = true;
    generateBtn.innerHTML = '<i data-lucide="loader-2" class="animate-spin mr-2 h-4 w-4"></i> 생성 중...';
    lucide.createIcons(); 
    displayMessage('일정을 생성 중입니다...', 'info');

    try {
        const scheduleData = await logic.generateSchedule(year, month);
        renderCalendar(year, month, scheduleData);
        displayMessage('일정이 성공적으로 생성되었습니다.', 'success');
    } catch (error) {
        console.error("Schedule generation failed:", error);
        displayMessage(`일정 생성 실패: ${error.message}`, 'error');
        renderCalendar(year, month, null); // Clear or show empty calendar
    } finally {
        generateBtn.disabled = false;
        generateBtn.innerHTML = '<i data-lucide="calendar-plus" class="mr-2 h-4 w-4"></i>일정 생성';
        lucide.createIcons();
    }
}

function renderCalendar(year, month, scheduleData) {
    calendarDisplay.innerHTML = ''; 
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayOfMonth = new Date(year, month - 1, 1).getDay(); // 0 (Sun) - 6 (Sat)

    const table = document.createElement('table');
    table.className = 'min-w-full divide-y divide-slate-200 border border-slate-200';

    const thead = document.createElement('thead');
    thead.className = 'bg-slate-50';
    const headerRow = document.createElement('tr');
    KOREAN_DAYS.forEach(day => {
        const th = document.createElement('th');
        th.className = 'px-3 py-1 text-center text-xs font-medium text-slate-500 uppercase tracking-wider';
        th.textContent = day;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    tbody.className = 'bg-white divide-y divide-slate-200';
    
    let date = 1;
    for (let i = 0; i < 6; i++) { // Max 6 weeks
        const weekRow = document.createElement('tr');
        let cellsInWeek = 0;
        for (let j = 0; j < 7; j++) {
            const cell = document.createElement('td');
            cell.className = 'px-2 py-2 align-top h-24 sm:h-32 text-xs';
            if (i === 0 && j < firstDayOfMonth) {
                cell.classList.add('other-month');
            } else if (date > daysInMonth) {
                cell.classList.add('other-month');
            } else {
                const currentDateObj = new Date(year, month - 1, date);
                if (j === 0 || j === 6) cell.classList.add('weekend'); // Sunday or Saturday

                const dayNumber = document.createElement('div');
                dayNumber.className = 'calendar-day-number font-semibold text-slate-700';
                dayNumber.textContent = date;
                cell.appendChild(dayNumber);

                const assignmentsForDate = scheduleData?.find(d => d.date === `${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`);
                if (assignmentsForDate && assignmentsForDate.timeSlots) {
                    assignmentsForDate.timeSlots.forEach(slot => {
                        const entryDiv = document.createElement('div');
                        entryDiv.className = 'schedule-entry p-1 my-0.5 rounded bg-sky-100 border border-sky-200 text-sky-800'; // Reverted to original common style
                        const timeStrong = document.createElement('strong');
                        timeStrong.textContent = `${slot.time} (${slot.type === 'elementary' ? '초' : '중'}): `;
                        entryDiv.appendChild(timeStrong);
                        
                        // Iterate through assigned participants to style names individually
                        slot.assigned.forEach((participantId, index) => {
                            const nameSpan = document.createElement('span');
                            nameSpan.textContent = slot.assignedNames[index] || `ID:${participantId}`; // Get name

                            if (slot.isFixedStatus && slot.isFixedStatus[index] === true) {
                                nameSpan.classList.add('font-bold', 'text-red-600'); // Apply red color if fixed
                            }
                            // Add comma and space if not the last name, unless only one name
                            if (slot.assigned.length > 1 && index < slot.assigned.length - 1) {
                                nameSpan.textContent += ', ';
                            }
                            entryDiv.appendChild(nameSpan);
                        });
                        cell.appendChild(entryDiv);
                    });
                }
                date++;
                cellsInWeek++;
            }
            weekRow.appendChild(cell);
        }
        if (cellsInWeek > 0 || i === 0) { // Add week if it has real days or it's the first potential week
             tbody.appendChild(weekRow);
        }
        if(date > daysInMonth && cellsInWeek === 0) break; // Optimization for months that fit in less than 6 weeks
    }

    table.appendChild(tbody);
    calendarDisplay.appendChild(table);
}

function displayMessage(message, type = 'info') {
    messageDiv.textContent = message;
    messageDiv.className = 'p-3 rounded-md text-sm ';
    switch (type) {
        case 'success':
            messageDiv.classList.add('bg-green-100', 'text-green-700');
            break;
        case 'error':
            messageDiv.classList.add('bg-red-100', 'text-red-700');
            break;
        case 'info':
        default:
            messageDiv.classList.add('bg-sky-100', 'text-sky-700');
            break;
    }
}

async function handleResetCurrentMonthSchedule() {
    const year = parseInt(yearInput.value);
    const month = parseInt(monthInput.value);

    if (!year || year < 2000 || year > 2100) {
        displayMessage('유효한 년도를 입력하세요 (2000-2100).', 'error');
        return;
    }
    if (!month || month < 1 || month > 12) {
        displayMessage('유효한 월을 선택하세요.', 'error');
        return;
    }

    if (confirm(`${year}년 ${month}월의 모든 생성된 일정과 기록된 결석 현황을 정말로 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) {
        try {
            messageDiv.textContent = '일정 및 결석 기록 초기화 중...';
            messageDiv.className = 'text-blue-600 p-2 rounded-md bg-blue-50';

            await db.saveSchedule(year, month, []); // Clear the schedule

            let attendanceClearedCount = 0;
            try {
                const clearAbsenceResult = await attendanceLogic.clearAllAbsencesInView(year, month, null); // Clear all absences for the month
                if (clearAbsenceResult.success) {
                    attendanceClearedCount = clearAbsenceResult.countCleared;
                } else {
                    console.warn('Failed to clear absences during schedule reset.', clearAbsenceResult.error);
                    // Optionally notify user of partial success here
                }
            } catch (attError) {
                console.error('Error clearing attendance records during schedule reset:', attError);
                // Optionally notify user of additional error here
            }

            renderCalendar(year, month, null); // Re-render the calendar, which will show as empty
            displayMessage(`${year}년 ${month}월 일정 (및 ${attendanceClearedCount}건의 결석 기록)이 성공적으로 초기화되었습니다.`, 'success');
        } catch (error) {
            console.error('Error resetting schedule:', error);
            messageDiv.textContent = `일정 초기화 중 오류 발생: ${error.message || '알 수 없는 오류'}`;
            messageDiv.className = 'text-red-600 p-2 rounded-md bg-red-50';
        }
    }
}
