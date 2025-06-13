import * as logic from './schedule_generation_logic.js';
import * as db from './db.js';
import * as attendanceLogic from './attendance_logic.js';
import * as inspectionLogic from './inspection_logic.js'; // 새로 추가

let yearInput, monthInput, generateBtn, calendarDisplay, messageDiv, viewExistingScheduleBtn;
// Inspection Modal related variables
let inspectionModal, closeInspectionModalBtnTop, closeInspectionModalBtnBottom, inspectionModalMessageDiv, inspectionTableHeaderRow, inspectionTableBody;

const SCHEDULE_YEAR_KEY = 'selectedScheduleYear';
const SCHEDULE_MONTH_KEY = 'selectedScheduleMonth';
let inspectionModalListenersAttached = false; // Prevents duplicate listener attachment

const KOREAN_DAYS = ['일', '월', '화', '수', '목', '금', '토'];

// CATEGORY_DISPLAY_NAMES is used by the old renderInspectionTable,
// but the new one uses fixed headers. So, this can be removed if no other function uses it.
// For now, keeping it to minimize unrelated changes.
const CATEGORY_DISPLAY_NAMES = {
    'elementary_6am': '초등6시',
    'elementary_random': '초등랜덤',
    'middle_7am': '중등7시',
    'middle_random': '중등랜덤',
    'elementary_random_fallback': '초등랜덤(F)',
    'middle_random_fallback': '중등랜덤(F)'
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

    const storedYear = sessionStorage.getItem(SCHEDULE_YEAR_KEY);
    const storedMonth = sessionStorage.getItem(SCHEDULE_MONTH_KEY);

    if (storedYear && storedMonth) {
        yearInput.value = storedYear;
        monthInput.value = storedMonth;
        loadScheduleDataForInputs(); // Call the new function to load data
    } else {
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;
        yearInput.value = currentYear;
        monthInput.value = currentMonth.toString();
        // If you want to load the current month's schedule by default when nothing is stored:
        // loadScheduleDataForInputs();
    }

    generateBtn.addEventListener('click', handleGenerateSchedule);
    if (viewExistingScheduleBtn) {
        viewExistingScheduleBtn.addEventListener('click', handleViewExistingSchedule);
    }

    let resetBtn = view.querySelector('#reset-current-month-schedule-btn');
    if (!resetBtn) {
        resetBtn = document.createElement('button');
        resetBtn.id = 'reset-current-month-schedule-btn';
        resetBtn.addEventListener('click', handleResetCurrentMonthSchedule);
    }
    resetBtn.innerHTML = '<i data-lucide="trash-2" class="h-5 w-5"></i>';
    resetBtn.title = '이번 달 일정 초기화';
    resetBtn.className = 'btn btn-icon btn-warning p-2';

    const sectionTitleH2 = view.querySelector('h2.text-xl.font-semibold');
    if (sectionTitleH2) {
        let titleWrapper = sectionTitleH2.parentNode;
        if (titleWrapper.id !== 'schedule-title-container') {
            const newTitleWrapper = document.createElement('div');
            newTitleWrapper.id = 'schedule-title-container';
            newTitleWrapper.className = 'flex justify-between items-center mb-4';
            sectionTitleH2.parentNode.insertBefore(newTitleWrapper, sectionTitleH2);
            newTitleWrapper.appendChild(sectionTitleH2);
            sectionTitleH2.classList.remove('mb-4');
            titleWrapper = newTitleWrapper;
        }

        let actionButtonsWrapper = titleWrapper.querySelector('.action-buttons-wrapper');
        if (!actionButtonsWrapper) {
            actionButtonsWrapper = document.createElement('div');
            actionButtonsWrapper.className = 'action-buttons-wrapper flex items-center space-x-2';
            titleWrapper.appendChild(actionButtonsWrapper);
        }

        // Ensure Excel download button is removed (as per previous subtask)
        let downloadExcelBtn = view.querySelector('#download-schedule-excel-btn');
        if (downloadExcelBtn && downloadExcelBtn.parentNode === actionButtonsWrapper) {
            actionButtonsWrapper.removeChild(downloadExcelBtn);
        }


        let inspectScheduleBtn = view.querySelector('#inspect-schedule-btn');
        if (!inspectScheduleBtn) {
            inspectScheduleBtn = document.createElement('button');
            inspectScheduleBtn.id = 'inspect-schedule-btn';
        }
        inspectScheduleBtn.innerHTML = '<i data-lucide="clipboard-list" class="h-5 w-5"></i>';
        inspectScheduleBtn.title = '월별 배정 현황 점검';
        inspectScheduleBtn.className = 'btn btn-icon text-slate-700 hover:text-sky-600 hover:bg-slate-100 p-2';

        if (inspectScheduleBtn.parentNode !== actionButtonsWrapper || actionButtonsWrapper.firstChild !== inspectScheduleBtn) {
             if(inspectScheduleBtn.parentNode === actionButtonsWrapper) actionButtonsWrapper.removeChild(inspectScheduleBtn);
             actionButtonsWrapper.insertBefore(inspectScheduleBtn, actionButtonsWrapper.firstChild);
        }

        if (resetBtn.parentNode !== actionButtonsWrapper) {
            actionButtonsWrapper.appendChild(resetBtn);
        } else {
            actionButtonsWrapper.appendChild(resetBtn); // Ensure it's last if already there
        }

    } else {
        console.warn("Section title H2 not found. Appending action buttons to generateBtn's parent as a fallback.");
        const fallbackContainer = generateBtn.parentNode;
        if (fallbackContainer) {
            // Ensure Excel button is removed from fallback too
            let downloadExcelBtnFallback = view.querySelector('#download-schedule-excel-btn');
            if (downloadExcelBtnFallback && downloadExcelBtnFallback.parentNode === fallbackContainer) {
                 fallbackContainer.removeChild(downloadExcelBtnFallback);
            }
            resetBtn.className = 'btn btn-icon btn-warning p-2 ml-2';
            if (resetBtn.parentNode !== fallbackContainer) fallbackContainer.appendChild(resetBtn);
        } else {
            console.error("Fallback container (generateBtn.parentNode) not found.");
        }
    }

    if (!inspectionModalListenersAttached) {
        inspectionModal = document.getElementById('scheduleInspectionModal');
        closeInspectionModalBtnTop = document.getElementById('closeInspectionModalBtn');
        closeInspectionModalBtnBottom = document.getElementById('closeInspectionModalBtnBottom');
        inspectionModalMessageDiv = document.getElementById('inspectionModalMessage');
        inspectionTableHeaderRow = document.getElementById('inspection-table-header-row');
        inspectionTableBody = document.getElementById('inspection-table-body');

        if (inspectionModal) {
            if (closeInspectionModalBtnTop) closeInspectionModalBtnTop.addEventListener('click', closeScheduleInspectionModal);
            if (closeInspectionModalBtnBottom) closeInspectionModalBtnBottom.addEventListener('click', closeScheduleInspectionModal);
            inspectionModal.addEventListener('click', (event) => {
                if (event.target === inspectionModal) closeScheduleInspectionModal();
            });
        }
        inspectionModalListenersAttached = true;
    }

    let currentInspectBtn = view.querySelector('#inspect-schedule-btn');
    if (currentInspectBtn) {
        // Remove listener for the (new) openScheduleInspectionModal to avoid direct calls without params
        currentInspectBtn.removeEventListener('click', openScheduleInspectionModal);
        // Add the correct handler
        currentInspectBtn.removeEventListener('click', handleInspectScheduleButtonClick); // Remove first to be safe
        currentInspectBtn.addEventListener('click', handleInspectScheduleButtonClick);
    }

    lucide.createIcons();
}

async function loadScheduleDataForInputs() {
    const year = parseInt(yearInput.value);
    const month = parseInt(monthInput.value);

    if (!year || year < 2000 || year > 2100 || !month || month < 1 || month > 12) {
        calendarDisplay.innerHTML = ''; // Clear previous calendar
        // No error message on initial silent load
        return;
    }

    calendarDisplay.innerHTML = ''; // Clear previous calendar
    try {
        const scheduleObject = await db.getSchedule(year, month);
        if (scheduleObject && scheduleObject.data && scheduleObject.data.length > 0) {
            renderCalendar(year, month, scheduleObject.data);
        } else {
            renderCalendar(year, month, null); // Render empty calendar for the selected period
        }
    } catch (error) {
        console.error("Failed to load schedule for inputs:", error);
        renderCalendar(year, month, null); // Render empty calendar on error
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// New handler for the "Inspect Schedule" button click in the UI
async function handleInspectScheduleButtonClick() {
    if (!yearInput || !monthInput) {
        console.error("Year or Month input not found for inspect button. Ensure yearInput and monthInput are initialized.");
        alert("년도 또는 월 입력 필드를 찾을 수 없습니다. 페이지 UI요소를 확인해주세요.");
        return;
    }
    const yearStr = yearInput.value;
    const monthStr = monthInput.value;

    if (!yearStr || !monthStr) {
        alert("점검을 위해 년도와 월을 입력해주세요.");
        return;
    }
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);

    if (isNaN(year) || isNaN(month) || year < 2000 || year > 2100 || month < 1 || month > 12) {
        alert("유효한 년도(2000-2100)와 월(1-12)을 입력해주세요.");
        return;
    }
    // Call the new, parameterized and exported function
    await openScheduleInspectionModal(year, month);
    loadInitialScheduleForCurrentDate();
}

// Helper function for modal outside click, to be used with removeEventListener
function handleModalOutsideClick(event) {
    if (event.target === inspectionModal) {
        closeScheduleInspectionModal();
    }
}

// New exported function that accepts year and month
export async function openScheduleInspectionModal(year, month) {
    // Initialize DOM elements if not already done (e.g., if called before initScheduleGenerationView or from another module)
    if (!inspectionModal) {
        inspectionModal = document.getElementById('scheduleInspectionModal');
        closeInspectionModalBtnTop = document.getElementById('closeInspectionModalBtn');
        closeInspectionModalBtnBottom = document.getElementById('closeInspectionModalBtnBottom');
        inspectionModalMessageDiv = document.getElementById('inspectionModalMessage');
        inspectionTableHeaderRow = document.getElementById('inspection-table-header-row');
        inspectionTableBody = document.getElementById('inspection-table-body');
    }

    // Attach listeners if not already attached.
    // This ensures that if this function is called standalone, the modal still works.
    if (inspectionModal && !inspectionModalListenersAttached) {
        if (closeInspectionModalBtnTop) {
            // Remove existing listener before adding to prevent duplicates if any previous attachment attempt failed partially
            closeInspectionModalBtnTop.removeEventListener('click', closeScheduleInspectionModal);
            closeInspectionModalBtnTop.addEventListener('click', closeScheduleInspectionModal);
        }
        if (closeInspectionModalBtnBottom) {
            closeInspectionModalBtnBottom.removeEventListener('click', closeScheduleInspectionModal);
            closeInspectionModalBtnBottom.addEventListener('click', closeScheduleInspectionModal);
        }
        // Use a named function for the outside click handler to allow for proper removal
        inspectionModal.removeEventListener('click', handleModalOutsideClick);
        inspectionModal.addEventListener('click', handleModalOutsideClick);
        inspectionModalListenersAttached = true; // Set the flag after attaching
    }

    // Validate year and month parameters
    if (!year || !month || typeof year !== 'number' || typeof month !== 'number') {
        alert("점검할 년도와 월이 올바르게 전달되지 않았습니다. (예: 2023, 12)");
        console.error("openScheduleInspectionModal: Invalid year or month parameters", { year, month });
        return;
    }

    // Ensure critical modal elements are now available after attempting to fetch them
    if (!inspectionModal || !inspectionModalMessageDiv || !inspectionTableBody || !inspectionTableHeaderRow) {
        console.error("Inspection modal elements not found even after attempting to initialize.");
        alert("점검 모달의 중요 구성 요소를 찾을 수 없습니다. 페이지가 완전히 로드되었는지 확인하거나 다시 시도해주세요.");
        return;
    }

    inspectionModalMessageDiv.textContent = '배정 현황 데이터 분석 중...';
    inspectionModalMessageDiv.className = 'my-2 text-sm text-blue-600';
    inspectionTableBody.innerHTML = '';
    inspectionTableHeaderRow.innerHTML = '';
    inspectionModal.classList.add('active');

    try {
        const result = await inspectionLogic.analyzeScheduleForInspection(year, month); // Uses year, month parameters
        if (result.error) {
            inspectionModalMessageDiv.textContent = result.error;
            inspectionModalMessageDiv.className = 'my-2 text-sm text-red-600';
            return;
        }
        if (result.message) {
            inspectionModalMessageDiv.textContent = result.message;
            inspectionModalMessageDiv.className = 'my-2 text-sm text-slate-600';
        } else {
            inspectionModalMessageDiv.textContent = ''; // Clear previous messages if no new message
        }
        renderInspectionTable(result.analysis, result.uniqueCategoryKeys);
        if (result.analysis && result.analysis.length > 0 && !result.message && !result.error) {
            inspectionModalMessageDiv.textContent = `${year}년 ${month}월 배정 현황 (총 배정 많은 순). 붉은색 숫자는 결석자 우선 배정 횟수입니다.`;
            inspectionModalMessageDiv.className = 'my-2 text-sm text-slate-600';
        }
    } catch (error) {
        console.error("Error during schedule inspection analysis:", error);
        inspectionModalMessageDiv.textContent = `분석 중 오류 발생: ${error.message}`;
        inspectionModalMessageDiv.className = 'my-2 text-sm text-red-600';
    }
}


async function handleViewExistingSchedule() {
    const year = parseInt(yearInput.value);
    const month = parseInt(monthInput.value);
    if (!year || year < 2000 || year > 2100) { displayMessage('조회할 유효한 년도를 입력하세요 (2000-2100).', 'error'); return; }
    if (!month || month < 1 || month > 12) { displayMessage('조회할 유효한 월을 선택하세요.', 'error'); return; }
    displayMessage('기존 일정을 불러오는 중...', 'info');
    calendarDisplay.innerHTML = '';
    try {
        // Store the year and month that was just viewed/attempted
        sessionStorage.setItem(SCHEDULE_YEAR_KEY, year.toString());
        sessionStorage.setItem(SCHEDULE_MONTH_KEY, month.toString());
        const scheduleObject = await db.getSchedule(year, month);
        if (scheduleObject && scheduleObject.data && scheduleObject.data.length > 0) {
            renderCalendar(year, month, scheduleObject.data);
            displayMessage(`기존 ${year}년 ${month}월 일정을 불러왔습니다.`, 'info');
        } else {
            renderCalendar(year, month, null);
            displayMessage('저장된 기존 일정이 없습니다. 새로 생성할 수 있습니다.', 'info');
        }
    } catch (error) {
        console.error("Failed to load existing schedule:", error);
        renderCalendar(year, month, null);
        displayMessage('기존 일정 로드 중 오류 발생.', 'error');
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// The old openScheduleInspectionModal function is removed.
// The button click will be handled by handleInspectScheduleButtonClick

// --- START OF MODIFIED renderInspectionTable FUNCTION ---
export function renderInspectionTable(analysisData, uniqueCategoryKeys) { // Added export
    // Defensive check for modal elements, try to get them if not available.
    if (!inspectionModal || !inspectionTableBody || !inspectionTableHeaderRow) {
        inspectionModal = document.getElementById('scheduleInspectionModal');
        inspectionTableBody = document.getElementById('inspection-table-body');
        inspectionTableHeaderRow = document.getElementById('inspection-table-header-row');
        // messageDiv might also need to be fetched if used for errors here
        if (!inspectionModalMessageDiv) {
             inspectionModalMessageDiv = document.getElementById('inspectionModalMessage');
        }

        if (!inspectionModal || !inspectionTableBody || !inspectionTableHeaderRow) {
            console.error("Inspection modal table elements not found for rendering even after re-fetch.");
            if (inspectionModalMessageDiv) { // Check if messageDiv was fetched successfully
                inspectionModalMessageDiv.textContent = '오류: 점검 모달의 테이블 구성 요소를 찾을 수 없습니다.';
                inspectionModalMessageDiv.className = 'my-2 text-sm text-red-600';
            }
            return;
        }
    }

    inspectionTableHeaderRow.innerHTML = '';
    inspectionTableBody.innerHTML = '';

    if (!analysisData || analysisData.length === 0) {
        if (!inspectionModalMessageDiv.textContent || inspectionModalMessageDiv.className.includes('text-blue-600')) {
             inspectionModalMessageDiv.textContent = '표시할 배정 분석 데이터가 없습니다.';
             inspectionModalMessageDiv.className = 'my-2 text-sm text-slate-500';
        }
        return;
    }

    // 1. Create Table Header
    const headerCellClasses = 'px-2 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider';
    const headerTitles = ['초중구분', '이름', '총 배정', '새벽', '1차랜덤', '2차랜덤']; // New fixed headers

    headerTitles.forEach(title => {
        const th = document.createElement('th');
        th.className = headerCellClasses;
        if (['총 배정', '새벽', '1차랜덤', '2차랜덤'].includes(title)) {
            th.classList.add('text-center');
        }
        th.textContent = title;
        inspectionTableHeaderRow.appendChild(th);
    });

    // 2. Create Table Body
    analysisData.forEach(participantAnalysis => {
        const tr = inspectionTableBody.insertRow();

        // --- Add the new conditional styling here ---
        if (participantAnalysis.participantType === '중등') {
            tr.style.backgroundColor = '#f1f5f9'; // This is Tailwind's slate-100 color
        } else {
            tr.style.backgroundColor = ''; // Ensures '초등' rows use default (e.g., white)
        }
        // --- End of new conditional styling ---

        // '초중구분' Cell
        const tdType = tr.insertCell();
        tdType.className = 'px-2 py-2 whitespace-nowrap text-sm text-slate-800';
        tdType.textContent = participantAnalysis.participantType;

        // '이름' Cell
        const tdName = tr.insertCell();
        tdName.className = 'px-2 py-2 whitespace-nowrap text-sm text-slate-800 font-medium';
        tdName.textContent = participantAnalysis.participantName;

        // '총 배정' Cell
        const tdTotal = tr.insertCell();
        tdTotal.className = 'px-2 py-2 whitespace-nowrap text-sm text-slate-600 text-center';
        tdTotal.textContent = participantAnalysis.totalAssignments;

        // Aggregated Category Cells ('새벽', '1차랜덤', '2차랜덤')
        const aggregatedKeysToDisplay = ['새벽', '1차랜덤', '2차랜덤'];

        aggregatedKeysToDisplay.forEach(aggKey => {
            const tdAgg = tr.insertCell();
            tdAgg.className = 'px-2 py-2 whitespace-nowrap text-sm text-slate-600 text-center';
            const categoryData = participantAnalysis.aggregatedByCategory ? participantAnalysis.aggregatedByCategory.get(aggKey) : null;

            if (categoryData && categoryData.count > 0) {
                if (categoryData.fixedCount > 0) {
                    tdAgg.innerHTML = `${categoryData.count} (<span class="text-red-500 font-bold">${categoryData.fixedCount}</span>)`;
                } else {
                    tdAgg.textContent = categoryData.count;
                }
            } else {
                tdAgg.textContent = '0';
            }
        });
    });

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}
// --- END OF MODIFIED renderInspectionTable FUNCTION ---

export function closeScheduleInspectionModal() { // Added export
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
            if (scheduleObject && scheduleObject.data) {
                renderCalendar(year, month, scheduleObject.data);
                displayMessage('기존 생성된 일정을 불러왔습니다.', 'info');
            } else {
                renderCalendar(year, month, null);
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
    if (!year || !month) { displayMessage('엑셀 다운로드를 위해 년도와 월을 선택해주세요.', 'error'); return; }
    displayMessage('엑셀 파일 생성 중...', 'info');
    try {
        const scheduleObject = await db.getSchedule(year, month);
        if (!scheduleObject || !scheduleObject.data || scheduleObject.data.length === 0) {
            displayMessage('다운로드할 생성된 일정이 없습니다.', 'info'); return;
        }
        const participants = await db.getAllParticipants();
        const participantsMap = new Map();
        participants.forEach(p => participantsMap.set(p.id, p.name));
        const excelData = [];
        excelData.push(['날짜', '요일', '시간', '구분', '배정인원1', '배정인원2', '고정여부1', '고정여부2']);
        scheduleObject.data.forEach(daySchedule => {
            const dateObj = new Date(daySchedule.date);
            const dayOfWeekExcel = KOREAN_DAYS[dateObj.getDay()];
            if (daySchedule.timeSlots && daySchedule.timeSlots.length > 0) {
                daySchedule.timeSlots.forEach(slot => {
                    const assignedName1 = slot.assigned && slot.assigned[0] ? (participantsMap.get(slot.assigned[0]) || `ID:${slot.assigned[0]}`) : '';
                    const assignedName2 = slot.assigned && slot.assigned[1] ? (participantsMap.get(slot.assigned[1]) || `ID:${slot.assigned[1]}`) : '';
                    const isFixed1 = slot.isFixedStatus && Array.isArray(slot.isFixedStatus) && slot.isFixedStatus[0] ? '고정' : '';
                    const isFixed2 = slot.isFixedStatus && Array.isArray(slot.isFixedStatus) && slot.isFixedStatus[1] ? '고정' : '';
                    excelData.push([
                        daySchedule.date, dayOfWeekExcel, slot.time,
                        slot.type === 'elementary' ? '초등' : (slot.type === 'middle' ? '중등' : slot.type),
                        assignedName1, assignedName2, isFixed1, isFixed2
                    ]);
                });
            }
        });
        if (excelData.length <= 1) { displayMessage('엑셀로 내보낼 배정 내용이 없습니다.', 'info'); return; }
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
    if (!year || year < 2000 || year > 2100) { displayMessage('유효한 년도를 입력하세요 (2000-2100).', 'error'); return; }
    if (!month || month < 1 || month > 12) { displayMessage('유효한 월을 선택하세요.', 'error'); return; }
    generateBtn.disabled = true;
    generateBtn.innerHTML = '<i data-lucide="loader-2" class="animate-spin mr-2 h-4 w-4"></i> 생성 중...';
    lucide.createIcons();
    displayMessage('일정을 생성 중입니다...', 'info');
    try {
        const resultObject = await logic.generateSchedule(year, month);
        renderCalendar(year, month, resultObject.schedule);
        sessionStorage.setItem(SCHEDULE_YEAR_KEY, year.toString());
        sessionStorage.setItem(SCHEDULE_MONTH_KEY, month.toString());
        displayMessage('일정이 성공적으로 생성되었습니다.', 'success');
    } catch (error) {
        console.error("Schedule generation failed:", error);
        displayMessage(`일정 생성 실패: ${error.message}`, 'error');
        renderCalendar(year, month, null);
    } finally {
        generateBtn.disabled = false;
        generateBtn.innerHTML = '<i data-lucide="calendar-plus" class="mr-2 h-4 w-4"></i>일정 생성';
        lucide.createIcons();
    }
}

function renderCalendar(year, month, scheduleData) {
    calendarDisplay.innerHTML = '';
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayOfMonth = new Date(year, month - 1, 1).getDay();
    const table = document.createElement('table');
    table.className = 'divide-y divide-slate-200 border border-slate-200';
    const thead = document.createElement('thead');
    thead.className = 'bg-slate-50';
    const headerRow = document.createElement('tr');
    KOREAN_DAYS.forEach(day => {
        const th = document.createElement('th');
        th.className = 'px-2 py-1 text-center text-xs font-medium text-slate-500 uppercase tracking-wider';
        th.style.width = `${100 / 7}%`;
        th.textContent = day;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    tbody.className = 'bg-white divide-y divide-slate-200';
    let date = 1;
    for (let i = 0; i < 6; i++) {
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
                if (j === 0 || j === 6) cell.classList.add('weekend');
                const dayNumber = document.createElement('div');
                dayNumber.className = 'calendar-day-number font-semibold text-slate-700';
                dayNumber.textContent = date;
                cell.appendChild(dayNumber);
                const assignmentsForDate = scheduleData?.find(d => d.date === `${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`);
                if (assignmentsForDate && assignmentsForDate.timeSlots) {
                    assignmentsForDate.timeSlots.forEach(slot => {
                        const entryDiv = document.createElement('div');
                        entryDiv.className = 'schedule-entry p-1 my-0.5 rounded bg-sky-100 border border-sky-200 text-sky-800';
                        const timeStrong = document.createElement('strong');
                        timeStrong.textContent = `${slot.time} (${slot.type === 'elementary' ? '초' : '중'}): `;
                        entryDiv.appendChild(timeStrong);
                        slot.assigned.forEach((participantId, index) => {
                            const nameSpan = document.createElement('span');
                            nameSpan.textContent = slot.assignedNames[index] || `ID:${participantId}`;
                            if (slot.isFixedStatus && slot.isFixedStatus[index] === true) {
                                nameSpan.classList.add('font-bold', 'text-red-600');
                            }
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
        if (cellsInWeek > 0 || i === 0) {
             tbody.appendChild(weekRow);
        }
        if(date > daysInMonth && cellsInWeek === 0) break;
    }
    table.appendChild(tbody);
    calendarDisplay.appendChild(table);
}

function displayMessage(message, type = 'info') {
    messageDiv.textContent = message;
    messageDiv.className = 'p-3 rounded-md text-sm ';
    switch (type) {
        case 'success': messageDiv.classList.add('bg-green-100', 'text-green-700'); break;
        case 'error': messageDiv.classList.add('bg-red-100', 'text-red-700'); break;
        case 'info': default: messageDiv.classList.add('bg-sky-100', 'text-sky-700'); break;
    }
}

async function handleResetCurrentMonthSchedule() {
    const year = parseInt(yearInput.value);
    const month = parseInt(monthInput.value);
    if (!year || year < 2000 || year > 2100) { displayMessage('유효한 년도를 입력하세요 (2000-2100).', 'error'); return; }
    if (!month || month < 1 || month > 12) { displayMessage('유효한 월을 선택하세요.', 'error'); return; }
    if (confirm(`${year}년 ${month}월의 모든 생성된 일정, 기록된 결석 현황, 그리고 순차 배정 시작점을 정말로 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) {
        try {
            messageDiv.textContent = '일정, 결석 기록, 순차 배정 시작점 초기화 중...';
            messageDiv.className = 'text-blue-600 p-2 rounded-md bg-blue-50';
            await db.saveSchedule(year, month, []);
            let attendanceClearedCount = 0;
            try {
                const clearAbsenceResult = await attendanceLogic.clearAllAbsencesInView(year, month, null);
                if (clearAbsenceResult.success) attendanceClearedCount = clearAbsenceResult.countCleared;
                else console.warn('Failed to clear absences during schedule reset.', clearAbsenceResult.error);
            } catch (attError) { console.error('Error clearing attendance records during schedule reset:', attError); }
            try {
                await db.resetAllScheduleState();
                console.log('Schedule indices have been reset.');
            } catch (stateError) {
                console.error('Error resetting schedule indices during full reset:', stateError);
                messageDiv.textContent += ' (순차 배정 시작점 초기화 실패)';
            }
            renderCalendar(year, month, null);
            displayMessage(`${year}년 ${month}월 일정, ${attendanceClearedCount}건의 결석 기록, 및 순차 배정 시작점이 성공적으로 초기화되었습니다.`, 'success');
        } catch (error) {
            console.error('Error resetting schedule:', error);
            messageDiv.textContent = `일정 초기화 중 주요 오류 발생: ${error.message || '알 수 없는 오류'}`;
            messageDiv.className = 'text-red-600 p-2 rounded-md bg-red-50';
        }
    }
}
