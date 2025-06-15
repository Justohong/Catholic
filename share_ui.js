import * as shareLogic from './share_logic.js';
import * as db from './db.js';
import { openScheduleInspectionModal, closeScheduleInspectionModal } from './schedule_generation_ui.js';

let currentYear, currentMonth;
let currentScheduleData = null;
let allParticipants = [];

const SHARE_YEAR_KEY = 'selectedShareYear';
const SHARE_MONTH_KEY = 'selectedShareMonth';

const daysOfWeekKorConcise = ['일', '월', '화', '수', '목', '금', '토'];

const yearInput = document.getElementById('share-year');
const monthInput = document.getElementById('share-month');
const viewScheduleBtn = document.getElementById('view-share-schedule-btn');
// const downloadBtn = document.getElementById('download-schedule-img-btn'); // Removed
const calendarContainer = document.getElementById('share-calendar-container');
const messageDiv = document.getElementById('share-message');

// New button for Excel Export - REMOVED
// const downloadExcelBtn = document.createElement('button');
// downloadExcelBtn.id = 'download-schedule-excel-btn';
// downloadExcelBtn.innerHTML = '<i data-lucide="download" class="mr-2 h-4 w-4"></i>엑셀';
// downloadExcelBtn.className = 'btn btn-secondary w-full sm:flex-1 py-2 px-4 inline-flex items-center justify-center';

const modal = document.getElementById('editAssignmentModal');
const modalTitle = document.getElementById('editModalTitle');
const modalCurrentAssignmentsDiv = document.getElementById('editModalCurrentAssignments');
const modalParticipantSelect = document.getElementById('editModalParticipantSelect');
const modalGenderFilter = document.getElementById('editModalGenderFilter');
const modalCloseBtn = document.getElementById('editModalCloseBtn');
const modalSaveBtn = document.getElementById('editModalSaveBtn');
const modalMessageDiv = document.getElementById('editModalMessage');

let editContext = null; 
let confirmScheduleBtn;


export async function initShareView() {
    const storedYearString = sessionStorage.getItem(SHARE_YEAR_KEY);
    const storedMonthString = sessionStorage.getItem(SHARE_MONTH_KEY);

    if (storedYearString && storedMonthString) {
        currentYear = parseInt(storedYearString);
        currentMonth = parseInt(storedMonthString);
        yearInput.value = currentYear;
        monthInput.value = currentMonth;
    } else {
        const today = new Date();
        currentYear = today.getFullYear();
        currentMonth = today.getMonth() + 1;
        yearInput.value = currentYear;
        monthInput.value = currentMonth;
    }

    allParticipants = await db.getAllParticipants();

    // Update View Schedule button classes
    if (viewScheduleBtn) {
        viewScheduleBtn.classList.remove('sm:w-auto'); // Keep this adjustment
        viewScheduleBtn.classList.add('sm:flex-1');    // Keep this adjustment
    }

    viewScheduleBtn.addEventListener('click', async () => {
        const year = parseInt(yearInput.value);
        const month = parseInt(monthInput.value);
        if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
            messageDiv.textContent = '유효한 년도와 월을 입력해주세요.';
            messageDiv.className = 'my-2 text-red-500';
            return;
        }
        currentYear = year;
        currentMonth = month;
        sessionStorage.setItem(SHARE_YEAR_KEY, year.toString());
        sessionStorage.setItem(SHARE_MONTH_KEY, month.toString());
        await loadAndRenderCalendar(currentYear, currentMonth);
        await updateConfirmButtonState(currentYear, currentMonth); // Added call
    });

    // Create the New Consolidated Download Button
    const downloadAllSharedBtn = document.createElement('button');
    downloadAllSharedBtn.id = 'download-all-shared-btn';
    downloadAllSharedBtn.innerHTML = '<i data-lucide="download" class="mr-2 h-4 w-4"></i>다운로드';
    downloadAllSharedBtn.className = 'btn btn-secondary w-full sm:flex-1 py-2 px-4 inline-flex items-center justify-center';

    downloadAllSharedBtn.addEventListener('click', async () => {
        await handleDownload();
        await handleExportExcel();
    });

    // A. Element Initialization and Management
    // 1. inspectShareScheduleBtn (Button)
    let inspectBtn = document.getElementById('inspect-share-schedule-btn');
    if (inspectBtn && inspectBtn.parentNode) {
        inspectBtn.parentNode.removeChild(inspectBtn); // Remove from DOM if exists
    }
    // Always re-create it
    inspectBtn = document.createElement('button');
    inspectBtn.id = 'inspect-share-schedule-btn';
    inspectBtn.innerHTML = '<i data-lucide="clipboard-list" class="h-5 w-5"></i>';
    inspectBtn.title = '월별 배정 현황 점검';
    inspectBtn.className = 'btn btn-icon text-slate-700 hover:text-sky-600 hover:bg-slate-100 p-2';

    inspectBtn.addEventListener('click', () => {
        const yearStr = yearInput.value;
        const monthStr = monthInput.value;
        if (!yearStr || !monthStr) {
            messageDiv.textContent = '점검을 위해 년도와 월을 선택해주세요.';
            messageDiv.className = 'my-2 text-red-500';
            return;
        }
        const year = parseInt(yearStr);
        const month = parseInt(monthStr);
        if (isNaN(year) || isNaN(month) || year < 2000 || year > 2100 || month < 1 || month > 12) {
            messageDiv.textContent = '유효한 년도(2000-2100)와 월(1-12)을 입력해주세요.';
            messageDiv.className = 'my-2 text-red-500';
            return;
        }
        openScheduleInspectionModal(year, month);
    });

    // 2. iconButtonsWrapper (as iconWrapper)
    let iconWrapper = document.getElementById('share-view-icon-wrapper');
    if (!iconWrapper) {
        iconWrapper = document.createElement('div');
        iconWrapper.id = 'share-view-icon-wrapper';
    } else {
        iconWrapper.innerHTML = ''; // Clear contents if it exists
    }
    // Set essential styles for internal layout
    iconWrapper.style.display = 'flex';
    iconWrapper.style.alignItems = 'center';
    iconWrapper.style.gap = '0.5rem';
    // Append the fresh inspectBtn
    iconWrapper.appendChild(inspectBtn);

    // B. Title Line and Icon Placement Logic
    const titleElement = document.querySelector('#shareView h2');
    const mainControlsArea = document.querySelector('#shareView > div.space-y-4');

    if (titleElement && titleElement.parentNode) {
        console.log('H2 title found. Placing icon on title line.');

        let titleBar = document.getElementById('share-view-title-bar');
        if (!titleBar) {
            titleBar = document.createElement('div');
            titleBar.id = 'share-view-title-bar';
            titleElement.parentNode.insertBefore(titleBar, titleElement);
            titleBar.appendChild(titleElement);
        } else {
            if (titleBar.firstChild !== titleElement) {
                // Ensure H2 is the first child if titleBar already exists.
                titleBar.prepend(titleElement);
            }
            // Remove any other DIV children from titleBar that are not titleElement or iconWrapper
            Array.from(titleBar.children).forEach(child => {
                if (child !== titleElement && child !== iconWrapper && child.tagName === 'DIV') {
                    child.remove();
                }
            });
        }

        // Style titleBar
        titleBar.style.display = 'flex';
        titleBar.style.justifyContent = 'space-between';
        titleBar.style.alignItems = 'center';

        // Handle margin from H2
        if (titleElement.classList.contains('mb-4')) {
            titleBar.style.marginBottom = '1rem';
            titleElement.classList.remove('mb-4');
        } else if (titleElement.style.marginBottom && titleElement.style.marginBottom !== '0px') {
            titleBar.style.marginBottom = titleElement.style.marginBottom;
            titleElement.style.marginBottom = '';
        } else {
            // If titleBar itself doesn't have a bottom margin from a class, set it.
            // Check existing style to avoid overriding a class-based margin.
            if (!getComputedStyle(titleBar).marginBottom || getComputedStyle(titleBar).marginBottom === '0px') {
                 titleBar.style.marginBottom = '1rem';
            }
        }

        // Append the definitive iconWrapper to titleBar
        titleBar.appendChild(iconWrapper);

        // Reset iconWrapper styles for this context
        iconWrapper.style.width = '';
        iconWrapper.style.justifyContent = ''; // or 'flex-start'
        iconWrapper.style.marginBottom = '';

    } else {
        console.error('Share view H2 title not found. Placing icon in fallback position.');
        // Style iconWrapper for fallback (full-width bar, icons right)
        iconWrapper.style.width = '100%';
        iconWrapper.style.justifyContent = 'flex-end';
        iconWrapper.style.marginBottom = '0.75rem';

        // Place iconWrapper before mainControlsArea or other fallback
        if (iconWrapper.parentNode) iconWrapper.parentNode.removeChild(iconWrapper); // Detach first

        if (mainControlsArea && mainControlsArea.parentNode) {
            mainControlsArea.parentNode.insertBefore(iconWrapper, mainControlsArea);
        } else if (document.getElementById('shareView')) {
            document.getElementById('shareView').prepend(iconWrapper);
        } else {
            document.body.prepend(iconWrapper);
        }
    }
    // Note: The downloadBtn remains separate.

    modalCloseBtn.addEventListener('click', closeEditModal);
    modalSaveBtn.addEventListener('click', handleSaveAssignment);
    modalGenderFilter.addEventListener('change', populateParticipantSelect);

    // Define a specific class for the button group wrapper for easy removal
    const buttonGroupWrapperClass = 'share-action-buttons-wrapper';

    const mainGridDiv = (yearInput && yearInput.parentNode && yearInput.parentNode.parentNode) ? yearInput.parentNode.parentNode : null;

    if (mainGridDiv) {
        // Remove any existing button group wrapper to prevent duplication
        const existingButtonGroup = mainGridDiv.querySelector('.' + buttonGroupWrapperClass);
        if (existingButtonGroup) {
            existingButtonGroup.remove();
        }
    }

    // Create the new button group wrapper
    const buttonGroupWrapper = document.createElement('div');
    buttonGroupWrapper.className = `flex flex-col sm:flex-row gap-2 items-stretch sm:items-end w-full sm:col-span-2 ${buttonGroupWrapperClass}`;

    // Detach buttons from any previous parent (this also handles if they were in an old wrapper)
    if (viewScheduleBtn.parentNode) viewScheduleBtn.parentNode.removeChild(viewScheduleBtn);
    // downloadBtn and downloadExcelBtn are no longer initialized, so no need to detach.

    buttonGroupWrapper.innerHTML = ''; // Clear it first
    // Create the '일정확정' button
    confirmScheduleBtn = document.createElement('button');
    confirmScheduleBtn.id = 'confirm-schedule-btn';
    // Initial text will be set by `updateConfirmButtonState`
    confirmScheduleBtn.className = 'btn btn-primary w-full sm:flex-1 py-2 px-4 inline-flex items-center justify-center';

    confirmScheduleBtn.addEventListener('click', handleConfirmScheduleClick);

    // Append buttons to the new wrapper
    buttonGroupWrapper.appendChild(viewScheduleBtn);
    buttonGroupWrapper.appendChild(confirmScheduleBtn); // Add the new confirm button
    buttonGroupWrapper.appendChild(downloadAllSharedBtn);

    // Append the new wrapper to the main grid
    if (mainGridDiv) {
        mainGridDiv.appendChild(buttonGroupWrapper);
    } else {
        console.error("Share UI: Could not find the parent grid container (mainGridDiv) to append button group. Button group might not be placed correctly.");
        // Fallback logic from previous attempt (might need review based on actual stable DOM)
        // const controlsContainer = document.querySelector('#shareView > div.flex.flex-col.sm\\:flex-row.gap-4.mb-4');
        // if (controlsContainer) {
        //     controlsContainer.appendChild(buttonGroupWrapper);
        //     console.warn("Share UI: Appended button group to fallback container (DEPRECATED PATTERN - CHECK DOM).");
        // } else {
        //     if(yearInput && yearInput.parentNode) { // Simplest fallback: append near year input
        //         yearInput.parentNode.appendChild(buttonGroupWrapper);
        //         console.warn("Share UI: Appended button group to yearInput's parent as final fallback.");
        //     }
        // }
    }

    await loadAndRenderCalendar(currentYear, currentMonth);
    await updateConfirmButtonState(currentYear, currentMonth); // Added call
    lucide.createIcons(); // Ensure icons are processed after any innerHTML changes.
}

async function handleConfirmScheduleClick() {
    if (!currentYear || !currentMonth) {
        messageDiv.textContent = '년도와 월을 먼저 선택해주세요.';
        messageDiv.className = 'my-2 text-red-500';
        return;
    }

    confirmScheduleBtn.disabled = true; // Disable during operation

    const isConfirmed = await shareLogic.isScheduleConfirmed(currentYear, currentMonth);

    if (isConfirmed) {
        // Currently '확정해제', so call cancel
        const result = await shareLogic.cancelScheduleConfirmation(currentYear, currentMonth);
        if (result.success) {
            messageDiv.textContent = `${currentYear}년 ${currentMonth}월 일정 확정이 해제되었습니다.`;
            messageDiv.className = 'my-2 text-green-600';
        } else {
            messageDiv.textContent = `확정 해제 실패: ${result.error}`;
            messageDiv.className = 'my-2 text-red-500';
        }
    } else {
        // Currently '일정확정', so call confirm
        const result = await shareLogic.confirmSchedule(currentYear, currentMonth);
        if (result.success) {
            messageDiv.textContent = `${currentYear}년 ${currentMonth}월 일정이 확정되었습니다.`;
            messageDiv.className = 'my-2 text-green-600';
        } else {
            messageDiv.textContent = `일정 확정 실패: ${result.error}`;
            messageDiv.className = 'my-2 text-red-500';
        }
    }
    await updateConfirmButtonState(currentYear, currentMonth);
    confirmScheduleBtn.disabled = false;
    lucide.createIcons(); // If button icon changes
}

async function updateConfirmButtonState(year, month) {
    if (!confirmScheduleBtn || !year || !month) return;

    const isConfirmed = await shareLogic.isScheduleConfirmed(year, month);
    if (isConfirmed) {
        confirmScheduleBtn.innerHTML = '<i data-lucide="unlock" class="mr-2 h-4 w-4"></i>확정해제';
        confirmScheduleBtn.classList.remove('btn-primary');
        confirmScheduleBtn.classList.add('btn-warning'); // Or another appropriate class for "cancel"
    } else {
        confirmScheduleBtn.innerHTML = '<i data-lucide="lock" class="mr-2 h-4 w-4"></i>일정확정';
        confirmScheduleBtn.classList.remove('btn-warning');
        confirmScheduleBtn.classList.add('btn-primary');
    }
    lucide.createIcons(); // To render new icons if any
}


async function handleExportExcel() {
    if (!currentScheduleData || !currentScheduleData.data || currentScheduleData.data.length === 0) {
        messageDiv.textContent = '엑셀로 내보낼 일정이 없습니다. 먼저 일정을 조회해주세요.';
        messageDiv.className = 'my-2 text-red-500';
        return;
    }
    messageDiv.textContent = 'Excel 파일 생성 중...';
    messageDiv.className = 'my-2 text-slate-600';

    try {
        const KOREAN_DAYS_SHORT = ['일', '월', '화', '수', '목', '금', '토'];
        const participantsMap = new Map(allParticipants.map(p => [p.id, p]));
        const excelDataRows = [];

        currentScheduleData.data.forEach(daySchedule => {
            const dateStr = daySchedule.date;
            const dayOfWeek = KOREAN_DAYS_SHORT[new Date(dateStr).getDay()];
            daySchedule.timeSlots.forEach(slot => {
                const timeStr = slot.time;
                const typeStr = slot.type === 'elementary' ? '초등' : slot.type === 'middle' ? '중등' : slot.type;

                let person1Name = '미배정';
                let person2Name = '미배정';

                if (slot.assigned && slot.assigned.length > 0) {
                    person1Name = participantsMap.get(slot.assigned[0])?.name || `ID:${slot.assigned[0]}`;
                    if (slot.assigned.length > 1) {
                        person2Name = participantsMap.get(slot.assigned[1])?.name || `ID:${slot.assigned[1]}`;
                    } else {
                        // If only one person is assigned, P2 should be empty, not "미배정"
                        person2Name = '';
                    }
                }
                // If slot.assigned is empty or undefined, both remain '미배정'

                excelDataRows.push({
                    "년월일": dateStr,
                    "요일": dayOfWeek,
                    "시간": timeStr,
                    "구분": typeStr,
                    "배정인원1": person1Name,
                    "배정인원2": person2Name
                });
            });
        });

        const ws = XLSX.utils.json_to_sheet(excelDataRows, { skipHeader: true });

        const headerRow = ["년월일", "요일", "시간", "구분", "배정인원1", "배정인원2"];
        XLSX.utils.sheet_add_aoa(ws, [headerRow], { origin: "A1" });

        const cols = [
            { wch: 12 }, // 년월일
            { wch: 5 },  // 요일
            { wch: 8 },  // 시간
            { wch: 8 },  // 구분
            { wch: 15 }, // 배정인원1
            { wch: 15 }  // 배정인원2
        ];
        ws['!cols'] = cols;

        const saturdayStyle = { fill: { fgColor: { rgb: "ADD8E6" } } }; // Light Blue
        const sundayStyle = { fill: { fgColor: { rgb: "FFCCCB" } } };   // Light Red
        const fillEven = { fgColor: { rgb: "F0F0F0" } };

        excelDataRows.forEach((rowData, index) => {
            const rowIndexInSheet = index + 2;
            const dateStrForRow = rowData["년월일"];
            const dayOfWeekNumeric = new Date(dateStrForRow).getDay();

            let rowStyle = null;
            if (dayOfWeekNumeric === 0) { // Sunday
                rowStyle = sundayStyle;
            } else if (dayOfWeekNumeric === 6) { // Saturday
                rowStyle = saturdayStyle;
            } else {
                if (index % 2 === 1) {
                    rowStyle = fillEven;
                }
            }

            if (rowStyle) {
                ['A', 'B', 'C', 'D', 'E', 'F'].forEach(colLetter => {
                    const cellRef = colLetter + rowIndexInSheet;
                    if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };
                    ws[cellRef].s = rowStyle;
                });
            }
        });

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "월별일정");

        const fileName = `${currentYear}_${String(currentMonth).padStart(2, '0')}_일정.xlsx`;
        XLSX.writeFile(wb, fileName);

        messageDiv.textContent = 'Excel 파일 다운로드 성공!';
        messageDiv.className = 'my-2 text-green-600';

    } catch (error) {
        console.error('Failed to export Excel:', error);
        messageDiv.textContent = 'Excel 파일 생성 중 오류가 발생했습니다. ' + error.message;
        messageDiv.className = 'my-2 text-red-500';
    }
}

async function loadAndRenderCalendar(year, month) {
    messageDiv.textContent = '일정을 불러오는 중...';
    messageDiv.className = 'my-2 text-slate-600';
    try {
        currentScheduleData = await shareLogic.getScheduleForMonth(year, month);
        if (!currentScheduleData || !currentScheduleData.data || currentScheduleData.data.length === 0) {
            calendarContainer.innerHTML = '';
            messageDiv.textContent = '해당 월의 생성된 일정이 없습니다.';
            messageDiv.className = 'my-2 text-orange-500';
            currentScheduleData = null; 
        } else {
            renderShareCalendar(year, month, currentScheduleData.data, allParticipants);
            messageDiv.textContent = `${year}년 ${month}월 일정`;
            messageDiv.className = 'my-2 text-green-600';
        }
    } catch (error) {
        console.error('Error loading or rendering schedule:', error);
        messageDiv.textContent = '일정 로딩 중 오류가 발생했습니다.';
        messageDiv.className = 'my-2 text-red-500';
        calendarContainer.innerHTML = '<p class="text-red-500">일정 로딩 중 오류가 발생했습니다. 콘솔을 확인해주세요.</p>';
        currentScheduleData = null;
    }
}

function renderShareCalendar(year, month, scheduleDays, participantsList) {
    const participantsMap = new Map(participantsList.map(p => [p.id, p]));
    calendarContainer.innerHTML = ''; 

    const firstDayOfMonth = new Date(year, month - 1, 1);
    const lastDayOfMonth = new Date(year, month, 0);
    const firstDayOfWeek = firstDayOfMonth.getDay(); 
    const totalDaysInMonth = lastDayOfMonth.getDate();

    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.tableLayout = 'fixed';
    table.style.border = '1px solid #cbd5e1'; // Equivalent to border-slate-300

    const header = table.createTHead();
    const headerRow = header.insertRow();
    headerRow.style.backgroundColor = '#f8fafc'; // bg-slate-50

    daysOfWeekKorConcise.forEach(dayName => {
        const th = document.createElement('th');
        th.style.padding = '0.5rem'; // p-2
        th.style.border = '1px solid #cbd5e1'; // border-slate-300
        th.style.color = '#64748b'; // text-slate-500
        th.style.fontWeight = '600'; // font-semibold
        th.style.fontSize = '0.875rem'; // text-sm
        th.style.textAlign = 'center';
        th.style.position = 'sticky';
        th.style.top = '0';
        th.style.zIndex = '10';
        th.style.backgroundColor = '#f1f5f9'; // bg-slate-100
        th.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)'; // shadow-sm
        th.style.width = `${100 / 7}%`;
        th.textContent = dayName;
        headerRow.appendChild(th);
    });

    const tbody = table.createTBody();
    let date = 1;
    let allDatesRendered = false;

    for (let i = 0; i < 6; i++) { // Loop for up to 6 weeks
        if (allDatesRendered) break; // If all dates are done, no need for more weeks.

        const row = document.createElement('tr'); // Create row, but don't append to tbody yet
        let cellsForThisRow = [];
        let rowContainsActualDate = false;

        for (let j = 0; j < 7; j++) { // Loop for days in the week
            const cell = document.createElement('td');
            // Apply base cell styles (border, padding, etc.)
            cell.style.border = '1px solid #e2e8f0'; /* slate-200 */
            cell.style.padding = '0.375rem'; /* p-1.5 */
            cell.style.verticalAlign = 'top';
            cell.style.height = '10rem'; /* h-40 */
            cell.style.fontSize = '0.75rem'; /* text-xs */
            cell.style.position = 'relative';
            cell.style.boxSizing = 'border-box';
            cell.innerHTML = '';

            if (i === 0 && j < firstDayOfWeek) { // Previous month
                cell.style.backgroundColor = '#f8fafc';
            } else if (date > totalDaysInMonth) { // Next month
                cell.style.backgroundColor = '#f8fafc';
                allDatesRendered = true; // Mark that we've passed the end of the month
            } else { // Current month
                rowContainsActualDate = true;
                // Default weekday background
                cell.style.backgroundColor = '#ffffff'; // White
                // Apply weekend background if applicable
                if (j === 0 || j === 6) { // Weekends (Sunday or Saturday)
                    cell.style.backgroundColor = '#fffbeb'; /* amber-50 */
                }

                const dayNumberDiv = document.createElement('div');
                dayNumberDiv.style.textAlign = 'right';
                dayNumberDiv.style.fontSize = '0.875rem'; // text-sm
                dayNumberDiv.style.fontWeight = '600'; // font-semibold
                dayNumberDiv.style.color = '#64748b'; // slate-500
                dayNumberDiv.style.marginBottom = '0.25rem'; // mb-1
                dayNumberDiv.style.paddingRight = '0.25rem';
                dayNumberDiv.style.paddingLeft = '0.25rem';
                dayNumberDiv.textContent = date;
                
                const today = new Date();
                const isCurrentDayToday = (year === today.getFullYear() && month - 1 === today.getMonth() && date === today.getDate());
                
                cell.appendChild(dayNumberDiv);

                if (isCurrentDayToday) {
                    // dayNumberDiv.style.color = '#0284c7'; // sky-600
                    // dayNumberDiv.style.backgroundColor = '#e0f2fe'; // sky-100
                    // dayNumberDiv.style.borderRadius = '9999px'; // rounded-full
                    // dayNumberDiv.style.width = '1.5rem'; // w-6
                    // dayNumberDiv.style.height = '1.5rem'; // h-6
                    // dayNumberDiv.style.display = 'flex';
                    // dayNumberDiv.style.alignItems = 'center';
                    // dayNumberDiv.style.justifyContent = 'center';
                    // dayNumberDiv.style.marginLeft = 'auto';
                    // dayNumberDiv.style.fontWeight = '700'; // font-bold
                    // dayNumberDiv.style.lineHeight = '1'; // leading-none
                    // dayNumberDiv.style.padding = '0px'; // Reset padding
                    // dayNumberDiv.classList.add('today-number-highlight'); // 식별용 클래스 추가

                    // cell.style.borderColor = '#7dd3fc'; // sky-300
                    // cell.style.borderWidth = '2px';
                    // cell.style.borderStyle = 'solid';
                    // cell.classList.add('today-cell-highlight'); // 식별용 클래스 추가
                }

                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`; // Still needed for schedule lookup
                const daySchedule = scheduleDays.find(d => d.date === dateStr); // Use the generated dateStr

                if (daySchedule && daySchedule.timeSlots) {
                    daySchedule.timeSlots.forEach((slot, slotIndex) => {
                        const slotDiv = document.createElement('div');
                        slotDiv.dataset.slotType = slot.type;
                        slotDiv.setAttribute('data-debug', slot.type + '-APPLIED');

                        slotDiv.style.padding = '0.375rem';
                        slotDiv.style.marginTop = '0.25rem';
                        slotDiv.style.marginBottom = '0.25rem';
                        slotDiv.style.borderRadius = '0.5rem';
                        slotDiv.style.textAlign = 'center';
                        slotDiv.style.fontSize = '11px';
                        slotDiv.style.lineHeight = '1.375';
                        slotDiv.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
                        slotDiv.style.border = '1px solid #d1d5db'; // Default border
                        slotDiv.style.backgroundColor = '#f3f4f6'; // Default background (slate-100)
                        slotDiv.style.color = '#374151'; // Default text color (slate-700)
                        slotDiv.style.boxSizing = 'border-box';

                        // Conditional styling based on slot.type
                        if (slot.type === 'elementary') {
                            slotDiv.style.backgroundColor = '#e0f2fe'; // sky-100
                            slotDiv.style.borderColor = '#bae6fd'; // sky-200
                            // slotDiv.style.color = '#0c4a6e'; // sky-800 or sky-900 if needed for contrast
                        } else if (slot.type === 'middle') {
                            slotDiv.style.backgroundColor = '#dcfce7'; // emerald-100
                            slotDiv.style.borderColor = '#a7f3d0'; // emerald-200
                            // slotDiv.style.color = '#065f46'; // emerald-800 or emerald-900 if needed for contrast
                        }
                        // If neither, it keeps the default slate-100 background and slate-300 border
                        slotDiv.style.width = '100%';
                        slotDiv.style.overflow = 'hidden';
                        slotDiv.style.display = 'block';
                        slotDiv.style.position = 'relative';

                        const timeSpan = document.createElement('span');
                        timeSpan.style.fontWeight = '700';
                        timeSpan.style.display = 'block';
                        timeSpan.style.color = '#475569';
                        timeSpan.style.marginBottom = '0.125rem';
                        timeSpan.style.fontSize = '10px';
                        timeSpan.style.textTransform = 'uppercase';
                        timeSpan.style.letterSpacing = '0.05em';
                        timeSpan.textContent = slot.time;
                        slotDiv.appendChild(timeSpan);

                        if (slot.assigned && slot.assigned.length > 0) {
                            slot.assigned.forEach((participantId, index) => {
                                const participant = participantsMap.get(participantId);
                                const nameSpan = document.createElement('span');
                                nameSpan.style.display = 'block';
                                nameSpan.style.cursor = 'pointer';
                                nameSpan.style.fontSize = '12px';
                                nameSpan.style.color = 'inherit';

                                if (participant) {
                                    nameSpan.textContent = participant.name;
                                    // Text color will be inherited from slotDiv.style.color
                                    if (slot.isFixedStatus && slot.isFixedStatus[index] === true) {
                                        // nameSpan.style.fontWeight = '800'; // Removed as per request
                                    }
                                } else {
                                    nameSpan.textContent = `ID:${participantId}`;
                                    nameSpan.style.color = '#64748b';
                                    nameSpan.style.fontStyle = 'italic';
                                }
                                
                                nameSpan.addEventListener('click', (e) => {
                                    e.stopPropagation();
                                    openEditModal(dateStr, slot.time, slot.type, participantId, slot.assigned, participantsMap);
                                });
                                slotDiv.appendChild(nameSpan);
                            });
                        } else {
                            const noAssignmentSpan = document.createElement('span');
                            noAssignmentSpan.style.color = '#94a3b8';
                            noAssignmentSpan.style.fontStyle = 'italic';
                            noAssignmentSpan.style.fontSize = '10px';
                            noAssignmentSpan.style.paddingTop = '0.5rem';
                            noAssignmentSpan.style.paddingBottom = '0.5rem';
                            noAssignmentSpan.style.textAlign = 'center';
                            noAssignmentSpan.style.display = 'block';
                            noAssignmentSpan.textContent = '미배정';
                            slotDiv.appendChild(noAssignmentSpan);
                        }
                        cell.appendChild(slotDiv);
                    });
                }
                // IMPORTANT: date is incremented only if it's a valid day of the current month
                date++;
            }
            cellsForThisRow.push(cell);
        }

        // Only append the row to the table if it contains any actual dates from the current month.
        if (rowContainsActualDate) {
            cellsForThisRow.forEach(cellContent => row.appendChild(cellContent));
            tbody.appendChild(row);
        }

        // If all dates for the month have been processed and this current row didn't add any new dates,
        // then we can stop adding more rows. (This break is now handled by `allDatesRendered` at the start of the outer loop)
    }
    calendarContainer.appendChild(table);
}

// The renderInspectionTable function from schedule_generation_ui.js is not needed here.
// It's managed by schedule_generation_ui.js when openScheduleInspectionModal is called.
// Removing the duplicated function.

async function handleDownload() {
    if (!currentScheduleData) {
        messageDiv.textContent = '다운로드할 일정이 없습니다. 먼저 일정을 조회해주세요.';
        messageDiv.className = 'my-2 text-red-500';
        return;
    }
    messageDiv.textContent = '이미지 생성 중...';
    messageDiv.className = 'my-2 text-slate-600';

    try {
        const calendarElement = document.getElementById('share-calendar-container');
        
        const originalCanvas = await html2canvas(calendarElement, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false,
            onclone: (documentClone) => {
                documentClone.body.style.width = 'auto';
                documentClone.body.style.height = 'auto';
                documentClone.body.style.overflow = 'visible';
                documentClone.body.style.margin = '0';
                documentClone.body.style.padding = '0';

                const clonedCalendarContainer = documentClone.getElementById('share-calendar-container');
                if (clonedCalendarContainer) {
                    clonedCalendarContainer.style.position = 'absolute';
                    clonedCalendarContainer.style.left = '0px';
                    clonedCalendarContainer.style.top = '0px';
                    clonedCalendarContainer.style.width = 'auto';
                    clonedCalendarContainer.style.height = 'auto';
                    clonedCalendarContainer.style.overflow = 'visible';
                    clonedCalendarContainer.style.margin = '0';
                    clonedCalendarContainer.style.padding = '0';
                }

                const todayCellClones = documentClone.querySelectorAll('.today-cell-highlight');
                todayCellClones.forEach(cellClone => {
                    cellClone.style.borderColor = '#e2e8f0';
                    cellClone.style.borderWidth = '1px';
                });

                const todayNumberClones = documentClone.querySelectorAll('.today-number-highlight');
                todayNumberClones.forEach(numDivClone => {
                    numDivClone.style.color = '#64748b';
                    numDivClone.style.backgroundColor = 'transparent';
                    numDivClone.style.borderRadius = '';
                    numDivClone.style.width = 'auto';
                    numDivClone.style.height = 'auto';
                    numDivClone.style.display = 'block';
                    numDivClone.style.textAlign = 'right';
                    numDivClone.style.marginLeft = '';
                    numDivClone.style.fontWeight = '600';
                    numDivClone.style.lineHeight = '';
                    numDivClone.style.padding = '';
                });
            }
        });

        const newCanvas = document.createElement('canvas');
        const titleBarHeight = Math.max(60, originalCanvas.width * 0.05);
        newCanvas.width = originalCanvas.width;
        newCanvas.height = originalCanvas.height + titleBarHeight;
        
        const ctx = newCanvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, newCanvas.width, newCanvas.height);
        ctx.drawImage(originalCanvas, 0, titleBarHeight);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, newCanvas.width, titleBarHeight);

        const titleText = `${currentYear}년 ${currentMonth}월`;
        const fontSize = Math.max(20, Math.min(originalCanvas.width * 0.03, 32));
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillStyle = '#334155';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const textX = newCanvas.width / 2;
        const textY = titleBarHeight / 2;
        ctx.fillText(titleText, textX, textY);

        const image = newCanvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `${currentYear}_${String(currentMonth).padStart(2, '0')}_일정.png`;
        link.href = image;
        link.click();
        messageDiv.textContent = '이미지 다운로드 성공!';
        messageDiv.className = 'my-2 text-green-600';
    } catch (err) {
        console.error('Failed to download image:', err);
        messageDiv.textContent = '이미지 다운로드 실패.';
        messageDiv.className = 'my-2 text-red-500';
    }
}

function openEditModal(date, time, slotType, participantIdToEdit, originalAssignments, participantsMap) {
    editContext = { date, time, slotType, participantIdToEdit, originalAssignments: [...originalAssignments] };
    modalMessageDiv.textContent = '';
    const participantToEditText = participantsMap.get(participantIdToEdit)?.name || `ID:${participantIdToEdit}`;
    modalTitle.textContent = `${date} ${time} (${participantToEditText}) 일정 수정`;
    
    modalCurrentAssignmentsDiv.innerHTML = '';
    const currentAssignmentsLabel = document.createElement('p');
    currentAssignmentsLabel.className = 'text-sm text-slate-600 mb-1 font-medium';
    currentAssignmentsLabel.textContent = '현재 배정:';
    modalCurrentAssignmentsDiv.appendChild(currentAssignmentsLabel);

    originalAssignments.forEach(pid => {
        const pData = participantsMap.get(pid);
        const pName = pData?.name || `ID:${pid}`;
        const pType = pData?.type;
        const pDiv = document.createElement('div');
        pDiv.className = 'flex justify-between items-center bg-slate-100 p-2 rounded mb-1';
        
        const nameTypeSpan = document.createElement('span');
        nameTypeSpan.textContent = pName;

        if (pType === '초등') {
            nameTypeSpan.classList.add('text-sky-700');
        } else if (pType === '중등') {
            nameTypeSpan.classList.add('text-emerald-700');
        } else {
            nameTypeSpan.classList.add('text-slate-700');
        }

        if ((time === '06:00' || time === '07:00') && currentScheduleData) {
            const dayData = currentScheduleData.data.find(d => d.date === date);
            const slotData = dayData?.timeSlots.find(s => s.time === time);
            if (slotData?.fixed) {
                 nameTypeSpan.classList.add('font-extrabold');
            }
        }
        pDiv.appendChild(nameTypeSpan);

        if (pid === participantIdToEdit) {
            const unassignBtn = document.createElement('button');
            unassignBtn.className = 'btn btn-danger btn-sm py-1 px-2 text-xs';
            unassignBtn.innerHTML = '<i data-lucide="user-minus" class="h-3 w-3 mr-1"></i>배정 해제';
            unassignBtn.onclick = async () => {
                if (confirm(`${pName}님을 이 시간에서 배정 해제하시겠습니까?`)) {
                    try {
                        await shareLogic.unassignParticipant(currentYear, currentMonth, date, time, participantIdToEdit);
                        closeEditModal();
                        await loadAndRenderCalendar(currentYear, currentMonth);
                         messageDiv.textContent = `${pName}님 배정 해제 완료.`;
                         messageDiv.className = 'my-2 text-green-600';
                    } catch (error) {
                        console.error("Failed to unassign participant:", error);
                        modalMessageDiv.textContent = `해제 실패: ${error.message}`;
                    }
                }
            };
            pDiv.appendChild(unassignBtn);
        }
        modalCurrentAssignmentsDiv.appendChild(pDiv);
    });
    lucide.createIcons();


    modalGenderFilter.value = 'all';
    populateParticipantSelect();
    modal.classList.add('active');
}

async function populateParticipantSelect() {
    if (!editContext) return;
    const { date, slotType, originalAssignments, participantIdToEdit } = editContext;
    const genderFilter = modalGenderFilter.value;
    
    const availableParticipants = await shareLogic.getAvailableParticipantsForSlot(
        date,
        slotType,
        originalAssignments.filter(id => id !== participantIdToEdit), 
        genderFilter,
        allParticipants,
        currentScheduleData.data 
    );
    
    modalParticipantSelect.innerHTML = '<option value="">변경할 인원 선택...</option>';
    availableParticipants.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        let typeColorClass = '';
        if (p.type === '초등') typeColorClass = 'text-sky-700';
        else if (p.type === '중등') typeColorClass = 'text-emerald-700';
        
        option.innerHTML = `${p.name} (<span class="${typeColorClass}">${p.type}</span>, ${p.gender}, ${p.copyType})`;
        modalParticipantSelect.appendChild(option);
    });
}

function closeEditModal() {
    modal.classList.remove('active');
    editContext = null;
}

async function handleSaveAssignment() {
    if (!editContext) return;
    modalMessageDiv.textContent = '';

    const newParticipantId = parseInt(modalParticipantSelect.value);
    if (!newParticipantId) {
        modalMessageDiv.textContent = '변경할 인원을 선택해주세요.';
        return;
    }

    const { date, time, participantIdToEdit, originalAssignments } = editContext;
    
    if (originalAssignments.includes(newParticipantId) && newParticipantId !== participantIdToEdit) {
        modalMessageDiv.textContent = '선택한 인원은 이미 이 시간대에 다른 역할로 배정되어 있습니다.';
        return;
    }

    try {
        await shareLogic.replaceParticipant(currentYear, currentMonth, date, time, participantIdToEdit, newParticipantId);
        closeEditModal();
        await loadAndRenderCalendar(currentYear, currentMonth);
        await updateConfirmButtonState(currentYear, currentMonth); // Added
        messageDiv.textContent = '일정 변경 저장 완료.';
        messageDiv.className = 'my-2 text-green-600';
    } catch (error) {
        console.error("Failed to save assignment:", error);
        modalMessageDiv.textContent = `저장 실패: ${error.message}`;
    }
}
