import * as logic from './schedule_generation_logic.js';
import * as db from './db.js';
import * as attendanceLogic from './attendance_logic.js';
import * as inspectionLogic from './inspection_logic.js'; // 새로 추가

let yearInput, monthInput, generateBtn, calendarDisplay, messageDiv, viewExistingScheduleBtn;
// Inspection Modal related variables
let inspectionModal, closeInspectionModalBtnTop, closeInspectionModalBtnBottom, inspectionModalMessageDiv, inspectionTableHeaderRow, inspectionTableBody;
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

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    yearInput.value = currentYear;
    monthInput.value = currentMonth.toString();

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
        currentInspectBtn.removeEventListener('click', openScheduleInspectionModal);
        currentInspectBtn.addEventListener('click', openScheduleInspectionModal);
    }

    lucide.createIcons();
    loadInitialScheduleForCurrentDate();
}

async function handleViewExistingSchedule() {
    const year = parseInt(yearInput.value);
    const month = parseInt(monthInput.value);
    if (!year || year < 2000 || year > 2100) { displayMessage('조회할 유효한 년도를 입력하세요 (2000-2100).', 'error'); return; }
    if (!month || month < 1 || month > 12) { displayMessage('조회할 유효한 월을 선택하세요.', 'error'); return; }
    displayMessage('기존 일정을 불러오는 중...', 'info');
    calendarDisplay.innerHTML = '';
    try {
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

async function openScheduleInspectionModal() {
    const year = parseInt(yearInput.value);
    const month = parseInt(monthInput.value);
    if (!year || !month) { alert("점검할 일정을 위해 년도와 월을 먼저 선택하거나 생성해주세요."); return; }
    if (!inspectionModal || !inspectionModalMessageDiv || !inspectionTableBody || !inspectionTableHeaderRow) {
        console.error("Inspection modal elements not found."); alert("점검 모달의 구성 요소를 찾을 수 없습니다."); return;
    }
    inspectionModalMessageDiv.textContent = '배정 현황 데이터 분석 중...';
    inspectionModalMessageDiv.className = 'my-2 text-sm text-blue-600';
    inspectionTableBody.innerHTML = ''; inspectionTableHeaderRow.innerHTML = '';
    inspectionModal.classList.add('active');
    try {
        const result = await inspectionLogic.analyzeScheduleForInspection(year, month);
        if (result.error) {
            inspectionModalMessageDiv.textContent = result.error;
            inspectionModalMessageDiv.className = 'my-2 text-sm text-red-600'; return;
        }
        if (result.message) {
             inspectionModalMessageDiv.textContent = result.message;
             inspectionModalMessageDiv.className = 'my-2 text-sm text-slate-600';
        } else {
             inspectionModalMessageDiv.textContent = '';
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

// --- START OF NEW/REPLACED renderInspectionTable FUNCTION ---
function renderInspectionTable(analysisData, uniqueCategoryKeys) { // uniqueCategoryKeys is now ['새벽', '1차랜덤', '2차랜덤']
    if (!inspectionModal || !inspectionModalMessageDiv || !inspectionTableBody || !inspectionTableHeaderRow) {
        console.error("Inspection modal table elements not found for rendering.");
        if (inspectionModalMessageDiv) {
            inspectionModalMessageDiv.textContent = '오류: 점검 모달의 테이블 구성 요소를 찾을 수 없습니다.';
            inspectionModalMessageDiv.className = 'my-2 text-sm text-red-600';
        }
        return;
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
// --- END OF NEW renderInspectionTable FUNCTION ---

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
