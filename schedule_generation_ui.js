import { generateSchedule } from './schedule_generation_logic.js';
import * as db from './db.js';
import * as inspectionLogic from './inspection_logic.js'; // Added import

const calendarView = document.getElementById('calendarView');
const monthYearDisplay = document.getElementById('monthYearDisplay');
const prevMonthButton = document.getElementById('prevMonth');
const nextMonthButton = document.getElementById('nextMonth');
const loadingIndicator = document.getElementById('loadingIndicator');
const generateButton = document.getElementById('generateButton');
const yearInput = document.getElementById('yearInput'); // Assuming this ID exists for year input
const monthInput = document.getElementById('monthInput'); // Assuming this ID exists for month input


let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;
let participantsMap = new Map();

// Inspection Modal Elements
let inspectionModal, closeInspectionModalBtnTop, closeInspectionModalBtnBottom, inspectionModalMessageDiv, inspectionTableHeaderRow, inspectionTableBody;
let inspectionModalListenersAttached = false;

function handleModalOutsideClick(event) {
    if (inspectionModal && event.target === inspectionModal) {
        closeScheduleInspectionModal();
    }
}

export function closeScheduleInspectionModal() {
    if (inspectionModal) {
        inspectionModal.classList.remove('active');
        inspectionModal.classList.add('hidden'); // Make sure it's hidden
    }
}

export function renderInspectionTable(analysisData, uniqueCategoryKeys) {
    if (!inspectionTableBody || !inspectionTableHeaderRow) {
        // Attempt to re-fetch if not initialized, though ideally they are fetched once.
        inspectionTableBody = document.getElementById('inspection-table-body');
        inspectionTableHeaderRow = document.getElementById('inspection-table-header-row');
        if (!inspectionTableBody || !inspectionTableHeaderRow) {
             console.error("Cannot render inspection table, body or header not found.");
             return;
        }
    }
    inspectionTableHeaderRow.innerHTML = '';
    inspectionTableBody.innerHTML = '';

    if (!analysisData || analysisData.length === 0) {
        if(inspectionModalMessageDiv) inspectionModalMessageDiv.textContent = '표시할 배정 분석 데이터가 없습니다.';
        if(inspectionModalMessageDiv) inspectionModalMessageDiv.className = 'my-2 text-sm text-slate-500';
        return;
    }

    const headerCellClasses = 'px-2 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider';
    // Using provided header titles
    const headerTitles = ['초중구분', '이름', '총 배정', '새벽', '1차랜덤', '2차랜덤'];


    headerTitles.forEach(title => {
        const th = document.createElement('th');
        th.className = headerCellClasses;
        if (['총 배정', '새벽', '1차랜덤', '2차랜덤'].includes(title)) {
            th.classList.add('text-center');
        }
        th.textContent = title;
        inspectionTableHeaderRow.appendChild(th);
    });

    analysisData.forEach(participantAnalysis => {
        const tr = inspectionTableBody.insertRow();
        if (getEnglishParticipantType(participantAnalysis.participantType) === 'middle') { // Use helper for consistency
            tr.style.backgroundColor = '#f1f5f9'; // slate-100
        }
        const tdType = tr.insertCell();
        tdType.className = 'px-2 py-2 whitespace-nowrap text-sm text-slate-800';
        tdType.textContent = participantAnalysis.participantType; // This is already 초등/중등 from inspection_logic
        const tdName = tr.insertCell();
        tdName.className = 'px-2 py-2 whitespace-nowrap text-sm text-slate-800 font-medium';
        tdName.textContent = participantAnalysis.participantName;
        const tdTotal = tr.insertCell();
        tdTotal.className = 'px-2 py-2 whitespace-nowrap text-sm text-slate-600 text-center';
        tdTotal.textContent = participantAnalysis.totalAssignments;

        ['새벽', '1차랜덤', '2차랜덤'].forEach(aggKey => {
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
    if (typeof lucide !== 'undefined') lucide.createIcons();
}


export async function openScheduleInspectionModal(year, month) {
    // Ensure elements are fetched (idempotent check)
    if (!inspectionModal) {
        inspectionModal = document.getElementById('scheduleInspectionModal');
        closeInspectionModalBtnTop = document.getElementById('closeInspectionModalBtn');
        closeInspectionModalBtnBottom = document.getElementById('closeInspectionModalBtnBottom');
        inspectionModalMessageDiv = document.getElementById('inspectionModalMessage');
        inspectionTableHeaderRow = document.getElementById('inspection-table-header-row');
        inspectionTableBody = document.getElementById('inspection-table-body');
    }

    if (inspectionModal && !inspectionModalListenersAttached) {
        if (closeInspectionModalBtnTop) closeInspectionModalBtnTop.addEventListener('click', closeScheduleInspectionModal);
        if (closeInspectionModalBtnBottom) closeInspectionModalBtnBottom.addEventListener('click', closeScheduleInspectionModal);

        inspectionModal.removeEventListener('click', handleModalOutsideClick);
        inspectionModal.addEventListener('click', handleModalOutsideClick);
        inspectionModalListenersAttached = true;
    }

    if (!inspectionModal || !inspectionModalMessageDiv || !inspectionTableBody || !inspectionTableHeaderRow) {
        console.error("Inspection modal elements not found.");
        alert("점검 모달의 구성 요소를 찾을 수 없습니다.");
        return;
    }

    inspectionModalMessageDiv.textContent = '배정 현황 데이터 분석 중...';
    inspectionModalMessageDiv.className = 'my-2 text-sm text-blue-600';
    inspectionTableBody.innerHTML = '';
    inspectionTableHeaderRow.innerHTML = '';
    inspectionModal.classList.remove('hidden'); // Make it visible
    inspectionModal.classList.add('active');

    try {
        const result = await inspectionLogic.analyzeScheduleForInspection(year, month);
        if (result.error) {
            inspectionModalMessageDiv.textContent = result.error;
            inspectionModalMessageDiv.className = 'my-2 text-sm text-red-600';
            return;
        }
        inspectionModalMessageDiv.textContent = result.message || `${year}년 ${month}월 배정 현황`;
        if (!result.message && result.analysis && result.analysis.length > 0) {
             inspectionModalMessageDiv.textContent = `${year}년 ${month}월 배정 현황 (총 배정 많은 순). 붉은색 숫자는 결석자 우선 배정 횟수입니다.`;
        }
        inspectionModalMessageDiv.className = 'my-2 text-sm text-slate-600';
        renderInspectionTable(result.analysis, result.uniqueCategoryKeys);
    } catch (error) {
        console.error("Error during schedule inspection analysis:", error);
        inspectionModalMessageDiv.textContent = `분석 중 오류 발생: ${error.message}`;
        inspectionModalMessageDiv.className = 'my-2 text-sm text-red-600';
    }
}

async function handleInspectScheduleButtonClick() {
    if (!yearInput || !monthInput) {
        console.error("Year or Month input not found for inspect button.");
        alert("년도 또는 월 입력 필드를 찾을 수 없습니다. 페이지 상단에서 년/월을 선택해주세요.");
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
    await openScheduleInspectionModal(year, month);
}


async function initializeParticipantsMap() {
    const participants = await db.getAllParticipants();
    participantsMap.clear(); // Clear before repopulating
    participants.forEach(p => participantsMap.set(p.id, p));
}

// Helper to convert Korean type to English for logic consistency
function getEnglishParticipantType(participantType) {
    if (participantType === '초등') return 'elementary';
    if (participantType === '중등') return 'middle';
    return participantType;
}


async function renderCalendar(year, month) {
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');
    monthYearDisplay.textContent = `${year}년 ${month}월`;
    calendarView.innerHTML = '';

    if (participantsMap.size === 0) {
        await initializeParticipantsMap();
    }

    const scheduleData = await db.getSchedule(year, month);

    if (!scheduleData || scheduleData.data?.length === 0) { // scheduleData from DB is {year, month, data: []}
        calendarView.innerHTML = '<p class="text-center col-span-7 py-4">이 달의 스케줄 정보가 없습니다. 스케줄을 생성해주세요.</p>';
        if (loadingIndicator) loadingIndicator.classList.add('hidden');
        return;
    }

    const actualScheduleDays = scheduleData.data; // Use the 'data' property

    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayOfMonth = new Date(year, month - 1, 1).getDay();

    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    dayNames.forEach(name => {
        const dayHeader = document.createElement('div');
        dayHeader.classList.add('font-semibold', 'text-center', 'py-2', 'border', 'bg-gray-100');
        dayHeader.textContent = name;
        calendarView.appendChild(dayHeader);
    });

    for (let i = 0; i < firstDayOfMonth; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.classList.add('border', 'min-h-[100px]', 'md:min-h-[120px]');
        calendarView.appendChild(emptyCell);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dayCell = document.createElement('div');
        dayCell.classList.add('border', 'p-1', 'text-xs', 'min-h-[100px]', 'md:min-h-[120px]', 'relative');

        const dayNumber = document.createElement('span');
        dayNumber.classList.add('font-semibold', 'absolute', 'top-1', 'left-1');
        dayNumber.textContent = day;
        dayCell.appendChild(dayNumber);

        const daySchedule = actualScheduleDays.find(d => {
            const scheduleDate = new Date(d.date + 'T00:00:00');
            return scheduleDate.getDate() === day && scheduleDate.getMonth() === month - 1 && scheduleDate.getFullYear() === year;
        });

        const slotsContainer = document.createElement('div');
        slotsContainer.classList.add('mt-5', 'space-y-1');

        if (daySchedule && daySchedule.timeSlots) {
            daySchedule.timeSlots.forEach(slot => {
                const slotDiv = document.createElement('div');
                slotDiv.classList.add('bg-gray-50', 'p-0.5', 'rounded', 'text-[10px]', 'md:text-xs');

                const timeSpan = document.createElement('span');
                timeSpan.classList.add('font-medium', 'text-gray-700');
                const slotTypeKorean = getEnglishParticipantType(slot.type) === 'elementary' ? '초' : '중';
                timeSpan.textContent = `${slot.time} (${slotTypeKorean}) `;
                slotDiv.appendChild(timeSpan);

                if (slot.assignedParticipantDetails && slot.assignedParticipantDetails.length > 0) {
                    slot.assignedParticipantDetails.forEach((participantDetail, index) => {
                        if (!participantDetail || participantDetail.name === '미배정' || !participantDetail.id) { // Check for placeholder or invalid detail
                            const nameSpan = document.createElement('span');
                            nameSpan.textContent = '미배정';
                            nameSpan.classList.add('text-gray-500');
                            slotDiv.appendChild(nameSpan);
                        } else {
                            const nameSpan = document.createElement('span');
                            nameSpan.textContent = participantDetail.name;

                            if (participantDetail.isPrevMonthAbsentee) {
                                nameSpan.classList.add('font-bold', 'text-red-600');
                            } else if (participantDetail.isFixed) {
                                nameSpan.classList.add('font-bold', 'text-orange-600');
                            }

                            const participantFromMap = participantsMap.get(participantDetail.id);
                            if (participantFromMap && participantFromMap.copyType === '소복사') {
                                if (!participantDetail.isPrevMonthAbsentee) {
                                    nameSpan.classList.add('text-blue-600');
                                    if(!participantDetail.isFixed) nameSpan.classList.add('font-semibold');
                                }
                            }
                            slotDiv.appendChild(nameSpan);
                        }
                        if (index < slot.assignedParticipantDetails.length - 1 && participantDetail && participantDetail.name !== '미배정') {
                            const separator = document.createElement('span');
                            separator.textContent = ', ';
                            slotDiv.appendChild(separator);
                        }
                    });
                } else { // Fallback or if no assignedParticipantDetails
                    const nameSpan = document.createElement('span');
                    nameSpan.textContent = '미배정';
                    nameSpan.classList.add('text-gray-500');
                    slotDiv.appendChild(nameSpan);
                }
                slotsContainer.appendChild(slotDiv);
            });
        }
        dayCell.appendChild(slotsContainer);
        calendarView.appendChild(dayCell);
    }
    if (loadingIndicator) loadingIndicator.classList.add('hidden');
}

async function handleGenerateSchedule() {
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');
    generateButton.disabled = true;
    generateButton.classList.add('opacity-50');
    try {
        // console.log(`UI: Generating schedule for ${currentYear}-${currentMonth}`);
        const result = await generateSchedule(currentYear, currentMonth);
        // console.log('Schedule generation complete. Result:', result);
        await renderCalendar(currentYear, currentMonth); // Re-render after generation
        alert('스케줄이 성공적으로 생성되었습니다!');
    } catch (error) {
        console.error('스케줄 생성 중 오류 발생:', error);
        alert(`스케줄 생성 중 오류 발생: ${error.message}`);
    } finally {
        if (loadingIndicator) loadingIndicator.classList.add('hidden');
        generateButton.disabled = false;
        generateButton.classList.remove('opacity-50');
    }
}

export function initScheduleGenerationView(viewElementId = 'schedule-generation-view') {
    const view = document.getElementById(viewElementId);
    if (!view) {
        console.warn(`${viewElementId} not found. Skipping schedule generation view initialization.`);
        return;
    }

    // Assuming yearInput and monthInput are already global or fetched at the top
    // If not, fetch them here:
    // yearInput = view.querySelector('#yearInput') || yearInput;
    // monthInput = view.querySelector('#monthInput') || monthInput;

    if(yearInput) yearInput.value = currentYear;
    if(monthInput) monthInput.value = currentMonth;

    // Fetch modal elements here, as they are part of this view's UI
    inspectionModal = document.getElementById('scheduleInspectionModal');
    closeInspectionModalBtnTop = document.getElementById('closeInspectionModalBtn');
    closeInspectionModalBtnBottom = document.getElementById('closeInspectionModalBtnBottom');
    inspectionModalMessageDiv = document.getElementById('inspectionModalMessage');
    inspectionTableHeaderRow = document.getElementById('inspection-table-header-row');
    inspectionTableBody = document.getElementById('inspection-table-body');

    if (!inspectionModalListenersAttached) { // Ensure listeners are attached only once
        if (inspectionModal) {
            if (closeInspectionModalBtnTop) closeInspectionModalBtnTop.addEventListener('click', closeScheduleInspectionModal);
            if (closeInspectionModalBtnBottom) closeInspectionModalBtnBottom.addEventListener('click', closeScheduleInspectionModal);
            inspectionModal.removeEventListener('click', handleModalOutsideClick); // Remove first
            inspectionModal.addEventListener('click', handleModalOutsideClick);
            inspectionModalListenersAttached = true;
        }
    }

    const inspectScheduleBtn = view.querySelector('#inspect-schedule-btn');
    if (inspectScheduleBtn) {
         inspectScheduleBtn.removeEventListener('click', handleInspectScheduleButtonClick); // Prevent multiple listeners
         inspectScheduleBtn.addEventListener('click', handleInspectScheduleButtonClick);
    } else {
        console.warn('#inspect-schedule-btn not found in the view.');
    }
    // Other initializations for schedule_generation_ui can go here
}


// Event Listeners (assuming these are unique and not re-declared elsewhere)
if (prevMonthButton) {
    prevMonthButton.addEventListener('click', () => {
        currentMonth--;
        if (currentMonth < 1) {
            currentMonth = 12;
            currentYear--;
        }
        if(yearInput) yearInput.value = currentYear;
        if(monthInput) monthInput.value = currentMonth;
        renderCalendar(currentYear, currentMonth);
    });
}

if (nextMonthButton) {
    nextMonthButton.addEventListener('click', () => {
        currentMonth++;
        if (currentMonth > 12) {
            currentMonth = 1;
            currentYear++;
        }
        if(yearInput) yearInput.value = currentYear;
        if(monthInput) monthInput.value = currentMonth;
        renderCalendar(currentYear, currentMonth);
    });
}

if (generateButton) {
    generateButton.addEventListener('click', handleGenerateSchedule);
}

// Initial render
document.addEventListener('DOMContentLoaded', async () => {
    await initializeParticipantsMap();
    // If yearInput and monthInput are part of the main page, not specific to a view:
    if(yearInput) yearInput.value = currentYear;
    if(monthInput) monthInput.value = currentMonth;

    renderCalendar(currentYear, currentMonth);

    // Settings Modal specific listeners (should be fine here if settings button is global)
    const settingsModalElement = document.getElementById('settingsModal');
    const openSettingsButton = document.getElementById('openSettingsButton');
    const closeSettingsButton = document.getElementById('closeSettingsButton'); // Assuming this is unique to settings
    const settingsForm = document.getElementById('settingsForm');
    const vacationStartDateInput = document.getElementById('vacationStartDate');
    const vacationEndDateInput = document.getElementById('vacationEndDate');

    if (openSettingsButton && settingsModalElement && closeSettingsButton) {
        openSettingsButton.addEventListener('click', () => settingsModalElement.classList.remove('hidden'));
        closeSettingsButton.addEventListener('click', () => settingsModalElement.classList.add('hidden'));
        window.addEventListener('click', (event) => {
            if (event.target === settingsModalElement) {
                settingsModalElement.classList.add('hidden');
            }
        });
    }

    if (settingsForm && vacationStartDateInput && vacationEndDateInput) {
        const savedVacationStart = sessionStorage.getItem('vacationStartDate');
        const savedVacationEnd = sessionStorage.getItem('vacationEndDate');
        if (savedVacationStart) vacationStartDateInput.value = savedVacationStart;
        if (savedVacationEnd) vacationEndDateInput.value = savedVacationEnd;

        settingsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const vacationStart = vacationStartDateInput.value;
            const vacationEnd = vacationEndDateInput.value;

            if (vacationStart && vacationEnd && new Date(vacationStart) > new Date(vacationEnd)) {
                alert('방학 시작일은 종료일보다 이전이어야 합니다.');
                return;
            }
            sessionStorage.setItem('vacationStartDate', vacationStart);
            sessionStorage.setItem('vacationEndDate', vacationEnd);
            alert('설정이 저장되었습니다.');
            if (settingsModalElement) settingsModalElement.classList.add('hidden');
            renderCalendar(currentYear, currentMonth);
        });
    }
});
