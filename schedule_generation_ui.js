import * as logic from './schedule_generation_logic.js';
import * as db from './db.js';
import * as attendanceLogic from './attendance_logic.js';
import * as inspectionLogic from './inspection_logic.js'; // 새로 추가

let yearInput, monthInput, generateBtn, calendarDisplay, messageDiv, viewExistingScheduleBtn;
// Inspection Modal related variables
let inspectionModal, closeInspectionModalBtnTop, closeInspectionModalBtnBottom, inspectionModalMessageDiv, inspectionTableHeaderRow, inspectionTableBody;
let inspectionModalListenersAttached = false; // Prevents duplicate listener attachment

const KOREAN_DAYS = ['일', '월', '화', '수', '목', '금', '토'];

const CATEGORY_DISPLAY_NAMES = {
    'elementary_6am': '초등6시',
    'elementary_random': '초등랜덤',
    'middle_7am': '중등7시',
    'middle_random': '중등랜덤',
    'elementary_random_fallback': '초등랜덤(F)',
    'middle_random_fallback': '중등랜덤(F)'
    // Add other categoryKey mappings as needed
};

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
    // Update resetBtn design (even if it already exists, in case of code updates)
    resetBtn.innerHTML = '<i data-lucide="trash-2" class="h-5 w-5"></i>';
    resetBtn.title = '이번 달 일정 초기화';
    resetBtn.className = 'btn btn-icon btn-warning p-2'; // ml-2 will be handled by space-x-2 on wrapper

    // Position the buttons next to the H2 title
    const sectionTitleH2 = view.querySelector('h2.text-xl.font-semibold');
    if (sectionTitleH2) {
        let titleWrapper = sectionTitleH2.parentNode;
        // Ensure titleWrapper is the flex container, or create it
        if (titleWrapper.id !== 'schedule-title-container') {
            const newTitleWrapper = document.createElement('div');
            newTitleWrapper.id = 'schedule-title-container';
            newTitleWrapper.className = 'flex justify-between items-center mb-4';
            sectionTitleH2.parentNode.insertBefore(newTitleWrapper, sectionTitleH2);
            newTitleWrapper.appendChild(sectionTitleH2);
            sectionTitleH2.classList.remove('mb-4'); // Remove margin from h2 as wrapper has it
            titleWrapper = newTitleWrapper;
        }

        // Create or find action buttons wrapper
        let actionButtonsWrapper = titleWrapper.querySelector('.action-buttons-wrapper');
        if (!actionButtonsWrapper) {
            actionButtonsWrapper = document.createElement('div');
            actionButtonsWrapper.className = 'action-buttons-wrapper flex items-center space-x-2';
            titleWrapper.appendChild(actionButtonsWrapper);
        }

        // Inspect Schedule Button
        let inspectScheduleBtn = view.querySelector('#inspect-schedule-btn');
        if (!inspectScheduleBtn) {
            inspectScheduleBtn = document.createElement('button');
            inspectScheduleBtn.id = 'inspect-schedule-btn';
        }
        inspectScheduleBtn.innerHTML = '<i data-lucide="clipboard-list" class="h-5 w-5"></i>';
        inspectScheduleBtn.title = '월별 배정 현황 점검';
        inspectScheduleBtn.className = 'btn btn-icon text-slate-700 hover:text-sky-600 hover:bg-slate-100 p-2'; // Restyled

        // Append Inspect button
        actionButtonsWrapper.appendChild(inspectScheduleBtn);

        // Ensure Reset button is last
        if (resetBtn.parentNode !== actionButtonsWrapper) {
            actionButtonsWrapper.appendChild(resetBtn);
        } else { // If resetBtn was already there, ensure it's last by re-appending
            actionButtonsWrapper.appendChild(resetBtn);
        }

    } else {
        // Fallback logic if H2 is not found
        console.warn("Section title H2 not found. Appending action buttons to generateBtn's parent as a fallback.");
        const fallbackContainer = generateBtn.parentNode;
        if (fallbackContainer) {
            // Reset Button (Fallback)
            // resetBtn should already be defined
            resetBtn.className = 'btn btn-icon btn-warning p-2 ml-2'; // Add margin if in fallback container

            // Append in order: existing buttons, then reset
            if (resetBtn.parentNode !== fallbackContainer) fallbackContainer.appendChild(resetBtn);
        } else {
            console.error("Fallback container (generateBtn.parentNode) not found.");
        }
    }

    // Modal elements and listeners (ensure this block runs only once)
    if (!inspectionModalListenersAttached) {
        inspectionModal = document.getElementById('scheduleInspectionModal');
        closeInspectionModalBtnTop = document.getElementById('closeInspectionModalBtn');
        closeInspectionModalBtnBottom = document.getElementById('closeInspectionModalBtnBottom');
        inspectionModalMessageDiv = document.getElementById('inspectionModalMessage');
        inspectionTableHeaderRow = document.getElementById('inspection-table-header-row');
        inspectionTableBody = document.getElementById('inspection-table-body');

        if (inspectionModal) {
            if (closeInspectionModalBtnTop) {
                closeInspectionModalBtnTop.addEventListener('click', closeScheduleInspectionModal);
            }
            if (closeInspectionModalBtnBottom) {
                closeInspectionModalBtnBottom.addEventListener('click', closeScheduleInspectionModal);
            }
            // Close modal on background click
            inspectionModal.addEventListener('click', (event) => {
                if (event.target === inspectionModal) {
                    closeScheduleInspectionModal();
                }
            });
        }
        inspectionModalListenersAttached = true;
    }

    // Attach listener to inspectScheduleBtn (always re-attach if button might be recreated)
    // First, find the button again in the current view context, as it might have been recreated
    let currentInspectBtn = view.querySelector('#inspect-schedule-btn');
    if (currentInspectBtn) { // Check if button exists in the DOM
        currentInspectBtn.removeEventListener('click', openScheduleInspectionModal); // Remove old listener
        currentInspectBtn.addEventListener('click', openScheduleInspectionModal); // Add new listener
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

async function openScheduleInspectionModal() {
    const year = parseInt(yearInput.value);
    const month = parseInt(monthInput.value);

    if (!year || !month) {
        alert("점검할 일정을 위해 년도와 월을 먼저 선택하거나 생성해주세요.");
        return;
    }

    if (!inspectionModal || !inspectionModalMessageDiv || !inspectionTableBody || !inspectionTableHeaderRow) {
        console.error("Inspection modal elements not found. Ensure they are correctly ID'd in HTML and obtained in init.");
        alert("점검 모달의 구성 요소를 찾을 수 없습니다. 페이지를 새로고침하거나 관리자에게 문의하세요.");
        return;
    }

    inspectionModalMessageDiv.textContent = '배정 현황 데이터 분석 중...';
    inspectionModalMessageDiv.className = 'my-2 text-sm text-blue-600'; // Reset to blue
    inspectionTableBody.innerHTML = ''; // Clear previous content
    inspectionTableHeaderRow.innerHTML = ''; // Clear previous header

    inspectionModal.classList.add('active'); // Show modal

    try {
        const result = await inspectionLogic.analyzeScheduleForInspection(year, month);

        if (result.error) {
            inspectionModalMessageDiv.textContent = result.error;
            inspectionModalMessageDiv.className = 'my-2 text-sm text-red-600';
            return; // Stop further processing if there's a fundamental error (e.g., no participants)
        }

        if (result.message) { // For informational messages like "no schedule found"
             inspectionModalMessageDiv.textContent = result.message;
             inspectionModalMessageDiv.className = 'my-2 text-sm text-slate-600'; // Default info color
        } else {
             inspectionModalMessageDiv.textContent = ''; // Clear message if analysis was successful without specific messages
        }

        // Call renderInspectionTable with the analysis data
        renderInspectionTable(result.analysis, result.uniqueCategoryKeys);

        // Set a final message if analysis was successful and data was rendered
        if (result.analysis && result.analysis.length > 0 && !result.message && !result.error) {
            inspectionModalMessageDiv.textContent = `${year}년 ${month}월 배정 현황 (총 배정 많은 순). 붉은색 숫자는 결석자 우선 배정 횟수입니다.`;
            inspectionModalMessageDiv.className = 'my-2 text-sm text-slate-600'; // Default info color
        } else if (!result.message && !result.error && (!result.analysis || result.analysis.length === 0)) {
            // This case handles when analysis runs but returns empty data without specific message (e.g. no participants assigned)
            // renderInspectionTable would have already shown "표시할 배정 분석 데이터가 없습니다."
            // So, we might not need to set inspectionModalMessageDiv.textContent here again,
            // or ensure renderInspectionTable's message is consistent.
            // For now, let renderInspectionTable handle the "no data to display" message.
            // If result.message was already set (e.g. "no schedule"), that message will persist.
        }

    } catch (error) {
        console.error("Error during schedule inspection analysis:", error);
        inspectionModalMessageDiv.textContent = `분석 중 오류 발생: ${error.message}`;
        inspectionModalMessageDiv.className = 'my-2 text-sm text-red-600'; // Show error in red
    }
}

function renderInspectionTable(analysisData, uniqueCategoryKeys) {
    if (!inspectionModal || !inspectionModalMessageDiv || !inspectionTableBody || !inspectionTableHeaderRow) {
        console.error("Inspection modal table elements not found for rendering.");
        // Optionally, display an alert or a more prominent error to the user if this happens.
        if (inspectionModalMessageDiv) { // Check if message div itself exists
            inspectionModalMessageDiv.textContent = '오류: 점검 모달의 테이블 구성 요소를 찾을 수 없습니다.';
            inspectionModalMessageDiv.className = 'my-2 text-sm text-red-600';
        }
        return;
    }

    // Clear previous table content
    inspectionTableHeaderRow.innerHTML = '';
    inspectionTableBody.innerHTML = '';

    if (!analysisData || analysisData.length === 0) {
        // If a message wasn't already set by openScheduleInspectionModal (e.g., "No schedule found")
        // then set a specific message for no analysis data.
        if (!inspectionModalMessageDiv.textContent || inspectionModalMessageDiv.className.includes('text-blue-600')) {
             inspectionModalMessageDiv.textContent = '표시할 배정 분석 데이터가 없습니다.';
             inspectionModalMessageDiv.className = 'my-2 text-sm text-slate-500';
        }
        return;
    }

    // 1. Create Table Header
    const headerCellClasses = 'px-2 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider';
    const thName = document.createElement('th');
    thName.className = headerCellClasses;
    thName.textContent = '참가자';
    inspectionTableHeaderRow.appendChild(thName);

    const thTotal = document.createElement('th');
    thTotal.className = `${headerCellClasses} text-center`;
    thTotal.textContent = '총 배정';
    inspectionTableHeaderRow.appendChild(thTotal);

    const sortedCategoryKeys = [...uniqueCategoryKeys].sort();

    sortedCategoryKeys.forEach(key => {
        const thCat = document.createElement('th');
        thCat.className = `${headerCellClasses} text-center`;
        thCat.textContent = CATEGORY_DISPLAY_NAMES[key] || key;
        inspectionTableHeaderRow.appendChild(thCat);
    });

    // 2. Create Table Body
    analysisData.forEach(participantAnalysis => {
        const tr = inspectionTableBody.insertRow();

        const tdName = tr.insertCell();
        tdName.className = 'px-2 py-2 whitespace-nowrap text-sm text-slate-800 font-medium';
        tdName.textContent = participantAnalysis.participantName;

        const tdTotal = tr.insertCell();
        tdTotal.className = 'px-2 py-2 whitespace-nowrap text-sm text-slate-600 text-center';
        tdTotal.textContent = participantAnalysis.totalAssignments;

        sortedCategoryKeys.forEach(key => {
            const tdCat = tr.insertCell();
            tdCat.className = 'px-2 py-2 whitespace-nowrap text-sm text-slate-600 text-center';
            const categoryData = participantAnalysis.assignmentsByCategory.get(key);

            if (categoryData && categoryData.count > 0) {
                if (categoryData.fixedCount > 0) {
                    tdCat.innerHTML = `${categoryData.count} (<span class="text-red-500 font-bold">${categoryData.fixedCount}</span>)`;
                } else {
                    tdCat.textContent = categoryData.count;
                }
            } else {
                tdCat.textContent = '0';
            }
        });
    });

    // Ensure Lucide icons are processed if any were added dynamically within the table (not typical for this table structure though)
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function closeScheduleInspectionModal() {
    if (inspectionModal) {
        inspectionModal.classList.remove('active');
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

async function handleDownloadScheduleExcel() {
    const year = parseInt(yearInput.value);
    const month = parseInt(monthInput.value);

    if (!year || !month) {
        displayMessage('엑셀 다운로드를 위해 년도와 월을 선택해주세요.', 'error');
        return;
    }

    displayMessage('엑셀 파일 생성 중...', 'info');

    try {
        const scheduleObject = await db.getSchedule(year, month);
        if (!scheduleObject || !scheduleObject.data || scheduleObject.data.length === 0) {
            displayMessage('다운로드할 생성된 일정이 없습니다.', 'info');
            return;
        }

        const participants = await db.getAllParticipants();
        const participantsMap = new Map();
        participants.forEach(p => participantsMap.set(p.id, p.name));

        const excelData = [];
        // 헤더 추가
        excelData.push(['날짜', '요일', '시간', '구분', '배정인원1', '배정인원2', '고정여부1', '고정여부2']);

        // KOREAN_DAYS 배열은 이미 파일 상단에 정의되어 있음
        // const KOREAN_DAYS_FOR_EXCEL = ['일', '월', '화', '수', '목', '금', '토'];


        scheduleObject.data.forEach(daySchedule => {
            const dateObj = new Date(daySchedule.date);
            const dayOfWeekExcel = KOREAN_DAYS[dateObj.getDay()]; // Use KOREAN_DAYS from file scope

            if (daySchedule.timeSlots && daySchedule.timeSlots.length > 0) {
                daySchedule.timeSlots.forEach(slot => {
                    const assignedName1 = slot.assigned && slot.assigned[0] ? (participantsMap.get(slot.assigned[0]) || `ID:${slot.assigned[0]}`) : '';
                    const assignedName2 = slot.assigned && slot.assigned[1] ? (participantsMap.get(slot.assigned[1]) || `ID:${slot.assigned[1]}`) : '';
                    // isFixedStatus가 정의되지 않았거나, 배열이 아니거나, 해당 인덱스가 없는 경우 고려
                    const isFixed1 = slot.isFixedStatus && Array.isArray(slot.isFixedStatus) && slot.isFixedStatus[0] ? '고정' : '';
                    const isFixed2 = slot.isFixedStatus && Array.isArray(slot.isFixedStatus) && slot.isFixedStatus[1] ? '고정' : '';

                    excelData.push([
                        daySchedule.date, // Use original date string from data
                        dayOfWeekExcel,
                        slot.time,
                        slot.type === 'elementary' ? '초등' : (slot.type === 'middle' ? '중등' : slot.type),
                        assignedName1,
                        assignedName2,
                        isFixed1,
                        isFixed2
                    ]);
                });
            } else {
                // excelData.push([daySchedule.date, dayOfWeekExcel, '', '', '', '', '', '']); // Add empty row for days with no slots
            }
        });

        if (excelData.length <= 1) { // Header only
             displayMessage('엑셀로 내보낼 배정 내용이 없습니다.', 'info');
            return;
        }

        const worksheet = XLSX.utils.aoa_to_sheet(excelData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, `${year}년 ${month}월`);

        XLSX.writeFile(workbook, `일정_${year}년_${String(month).padStart(2, '0')}월.xlsx`);
        displayMessage('엑셀 파일이 성공적으로 다운로드되었습니다.', 'success');

    } catch (error) {
        console.error('Excel download failed:', error);
        displayMessage(`엑셀 다운로드 실패: ${error.message}`, 'error');
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
        const resultObject = await logic.generateSchedule(year, month); // NEW: Renamed variable

        // Optional: console.log('Assignment Summary:', resultObject.assignmentSummary); // For debugging or future use

        renderCalendar(year, month, resultObject.schedule); // NEW: Use resultObject.schedule
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
    // min-w-full removed, width: 100% will be handled by style.css
    table.className = 'divide-y divide-slate-200 border border-slate-200';

    const thead = document.createElement('thead');
    thead.className = 'bg-slate-50';
    const headerRow = document.createElement('tr');
    KOREAN_DAYS.forEach(day => {
        const th = document.createElement('th');
        // px-3 changed to px-2 for less horizontal padding
        th.className = 'px-2 py-1 text-center text-xs font-medium text-slate-500 uppercase tracking-wider';
        th.style.width = `${100 / 7}%`; // Distribute width equally
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

    if (confirm(`${year}년 ${month}월의 모든 생성된 일정, 기록된 결석 현황, 그리고 순차 배정 시작점을 정말로 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) {
        try {
            messageDiv.textContent = '일정, 결석 기록, 순차 배정 시작점 초기화 중...';
            messageDiv.className = 'text-blue-600 p-2 rounded-md bg-blue-50';

            await db.saveSchedule(year, month, []); // Clear the schedule

            let attendanceClearedCount = 0;
            try {
                const clearAbsenceResult = await attendanceLogic.clearAllAbsencesInView(year, month, null); // Clear all absences for the month
                if (clearAbsenceResult.success) {
                    attendanceClearedCount = clearAbsenceResult.countCleared;
                } else {
                    console.warn('Failed to clear absences during schedule reset.', clearAbsenceResult.error);
                }
            } catch (attError) {
                console.error('Error clearing attendance records during schedule reset:', attError);
            }

            try {
                await db.resetAllScheduleState(); // Reset schedule indices
                console.log('Schedule indices have been reset.');
            } catch (stateError) {
                console.error('Error resetting schedule indices during full reset:', stateError);
                // Optionally, append a warning to the success message or show a separate partial error message
                messageDiv.textContent += ' (순차 배정 시작점 초기화 실패)';
            }

            renderCalendar(year, month, null); // Re-render the calendar, which will show as empty
            displayMessage(`${year}년 ${month}월 일정, ${attendanceClearedCount}건의 결석 기록, 및 순차 배정 시작점이 성공적으로 초기화되었습니다.`, 'success');
        } catch (error) {
            console.error('Error resetting schedule:', error);
            messageDiv.textContent = `일정 초기화 중 주요 오류 발생: ${error.message || '알 수 없는 오류'}`;
            messageDiv.className = 'text-red-600 p-2 rounded-md bg-red-50';
        }
    }
}
