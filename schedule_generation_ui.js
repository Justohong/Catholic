import { generateSchedule } from './schedule_generation_logic.js';
import * as db from './db.js';

const calendarView = document.getElementById('calendarView');
const monthYearDisplay = document.getElementById('monthYearDisplay');
const prevMonthButton = document.getElementById('prevMonth');
const nextMonthButton = document.getElementById('nextMonth');
const loadingIndicator = document.getElementById('loadingIndicator');
const generateButton = document.getElementById('generateButton');

let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;
let participantsMap = new Map(); // To store participant details for easy lookup

async function initializeParticipantsMap() {
    const participants = await db.getAllParticipants();
    participants.forEach(p => participantsMap.set(p.id, p));
}


async function renderCalendar(year, month) {
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');
    monthYearDisplay.textContent = `${year}년 ${month}월`;
    calendarView.innerHTML = ''; // Clear previous view

    if (participantsMap.size === 0) {
        await initializeParticipantsMap();
    }

    const scheduleData = await db.getSchedule(year, month);

    if (!scheduleData || scheduleData.length === 0) {
        calendarView.innerHTML = '<p class="text-center col-span-7 py-4">이 달의 스케줄 정보가 없습니다. 스케줄을 생성해주세요.</p>';
        if (loadingIndicator) loadingIndicator.classList.add('hidden');
        return;
    }

    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayOfMonth = new Date(year, month - 1, 1).getDay(); // 0 (Sun) - 6 (Sat)

    // Add day headers
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    dayNames.forEach(name => {
        const dayHeader = document.createElement('div');
        dayHeader.classList.add('font-semibold', 'text-center', 'py-2', 'border', 'bg-gray-100');
        dayHeader.textContent = name;
        calendarView.appendChild(dayHeader);
    });

    // Add empty cells for days before the first of the month
    for (let i = 0; i < firstDayOfMonth; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.classList.add('border', 'min-h-[100px]', 'md:min-h-[120px]');
        calendarView.appendChild(emptyCell);
    }

    // Add cells for each day of the month
    for (let day = 1; day <= daysInMonth; day++) {
        const dayCell = document.createElement('div');
        dayCell.classList.add('border', 'p-1', 'text-xs', 'min-h-[100px]', 'md:min-h-[120px]', 'relative');

        const dayNumber = document.createElement('span');
        dayNumber.classList.add('font-semibold', 'absolute', 'top-1', 'left-1');
        dayNumber.textContent = day;
        dayCell.appendChild(dayNumber);

        const daySchedule = scheduleData.find(d => {
            const scheduleDate = new Date(d.date + 'T00:00:00'); // Ensure local timezone interpretation
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
                timeSpan.textContent = `${slot.time} (${slot.type === 'elementary' ? '초' : '중'}) `;
                slotDiv.appendChild(timeSpan);

                if (slot.assignedParticipantDetails && slot.assignedParticipantDetails.length > 0) {
                    slot.assignedParticipantDetails.forEach((participantDetail, index) => {
                        if (participantDetail.name === '미배정') {
                            const nameSpan = document.createElement('span');
                            nameSpan.textContent = '미배정';
                            nameSpan.classList.add('text-gray-500');
                            slotDiv.appendChild(nameSpan);
                        } else {
                            const nameSpan = document.createElement('span');
                            nameSpan.textContent = participantDetail.name;

                            // Apply styling based on flags
                            if (participantDetail.isPrevMonthAbsentee) {
                                nameSpan.classList.add('font-bold', 'text-red-600');
                            } else if (participantDetail.isFixed) {
                                nameSpan.classList.add('font-bold', 'text-orange-600');
                            }

                            const participantFromMap = participantsMap.get(participantDetail.id);
                            if (participantFromMap && participantFromMap.copyType === '소복사') {
                                if (!participantDetail.isPrevMonthAbsentee) { // Red for absentee takes precedence
                                    nameSpan.classList.add('text-blue-600'); // Keep font-semibold if also fixed, or add if not
                                    if(!participantDetail.isFixed) nameSpan.classList.add('font-semibold');
                                } else {
                                     // Could add a specific style for "absentee and soboksa", e.g. underline red
                                }
                            }
                            slotDiv.appendChild(nameSpan);
                        }
                        if (index < slot.assignedParticipantDetails.length - 1 && participantDetail.name !== '미배정') {
                            const separator = document.createElement('span');
                            separator.textContent = ', ';
                            slotDiv.appendChild(separator);
                        }
                    });
                } else if (slot.assigned && slot.assigned.length > 0) { // Fallback for older data structure if needed
                    slot.assigned.forEach((id, index) => {
                        const participant = participantsMap.get(id);
                        const nameSpan = document.createElement('span');
                        nameSpan.textContent = participant ? participant.name : `ID:${id}`;
                        // Default styling for older data
                        slotDiv.appendChild(nameSpan);
                        if (index < slot.assigned.length - 1) {
                            const separator = document.createElement('span');
                            separator.textContent = ', ';
                            slotDiv.appendChild(separator);
                        }
                    });
                } else {
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
        console.log(`UI: Generating schedule for ${currentYear}-${currentMonth}`);
        const result = await generateSchedule(currentYear, currentMonth);
        console.log('Schedule generation complete. Result:', result);
        await renderCalendar(currentYear, currentMonth);
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

prevMonthButton.addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 1) {
        currentMonth = 12;
        currentYear--;
    }
    renderCalendar(currentYear, currentMonth);
});

nextMonthButton.addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
    }
    renderCalendar(currentYear, currentMonth);
});

generateButton.addEventListener('click', handleGenerateSchedule);

// Initial render
document.addEventListener('DOMContentLoaded', async () => {
    await initializeParticipantsMap(); // Initialize map on load
    renderCalendar(currentYear, currentMonth);
});

// Settings Modal & Form (from settings_ui.js, adapted)
const settingsModal = document.getElementById('settingsModal');
const openSettingsButton = document.getElementById('openSettingsButton');
const closeSettingsButton = document.getElementById('closeSettingsButton');
const settingsForm = document.getElementById('settingsForm');
const vacationStartDateInput = document.getElementById('vacationStartDate');
const vacationEndDateInput = document.getElementById('vacationEndDate');

if (openSettingsButton && settingsModal && closeSettingsButton) {
    openSettingsButton.addEventListener('click', () => settingsModal.classList.remove('hidden'));
    closeSettingsButton.addEventListener('click', () => settingsModal.classList.add('hidden'));
    window.addEventListener('click', (event) => {
        if (event.target === settingsModal) {
            settingsModal.classList.add('hidden');
        }
    });
}

if (settingsForm) {
    // Load saved settings
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
        if (settingsModal) settingsModal.classList.add('hidden');
        // Optionally, re-render or re-generate schedule if settings change affects current view
        renderCalendar(currentYear, currentMonth);
    });
}
