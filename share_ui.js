import * as shareLogic from './share_logic.js';
import * as db from './db.js';

let currentYear, currentMonth;
let currentScheduleData = null;
let allParticipants = [];

const daysOfWeekKorConcise = ['일', '월', '화', '수', '목', '금', '토'];

const yearInput = document.getElementById('share-year');
const monthInput = document.getElementById('share-month');
const viewScheduleBtn = document.getElementById('view-share-schedule-btn');
const downloadBtn = document.getElementById('download-schedule-img-btn');
const calendarContainer = document.getElementById('share-calendar-container');
const messageDiv = document.getElementById('share-message');

const modal = document.getElementById('editAssignmentModal');
const modalTitle = document.getElementById('editModalTitle');
const modalCurrentAssignmentsDiv = document.getElementById('editModalCurrentAssignments');
const modalParticipantSelect = document.getElementById('editModalParticipantSelect');
const modalGenderFilter = document.getElementById('editModalGenderFilter');
const modalCloseBtn = document.getElementById('editModalCloseBtn');
const modalSaveBtn = document.getElementById('editModalSaveBtn');
const modalMessageDiv = document.getElementById('editModalMessage');

let editContext = null; 


export async function initShareView() {
    const today = new Date();
    currentYear = today.getFullYear();
    currentMonth = today.getMonth() + 1;

    yearInput.value = currentYear;
    monthInput.value = currentMonth;

    allParticipants = await db.getAllParticipants();

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
        await loadAndRenderCalendar(currentYear, currentMonth);
    });

    downloadBtn.addEventListener('click', handleDownload);

    modalCloseBtn.addEventListener('click', closeEditModal);
    modalSaveBtn.addEventListener('click', handleSaveAssignment);
    modalGenderFilter.addEventListener('change', populateParticipantSelect);


    await loadAndRenderCalendar(currentYear, currentMonth);
    lucide.createIcons();
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
    for (let i = 0; i < 6; i++) { 
        const row = tbody.insertRow();
        for (let j = 0; j < 7; j++) {
            const cell = row.insertCell();
            // Base cell styles
            cell.style.border = '1px solid #e2e8f0'; // slate-200
            cell.style.padding = '0.375rem'; // p-1.5 (6px)
            cell.style.verticalAlign = 'top';
            cell.style.height = '10rem'; // h-40 (160px)
            cell.style.fontSize = '0.75rem'; // text-xs (12px)
            cell.style.position = 'relative';
            cell.style.boxSizing = 'border-box';
            cell.innerHTML = ''; // Clear cell content

            if (i === 0 && j < firstDayOfWeek) {
                cell.style.backgroundColor = '#f8fafc'; /* slate-50 */
            } else if (date > totalDaysInMonth) {
                cell.style.backgroundColor = '#f8fafc'; /* slate-50 */
            } else {
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
                    dayNumberDiv.style.color = '#0284c7'; // sky-600
                    dayNumberDiv.style.backgroundColor = '#e0f2fe'; // sky-100
                    dayNumberDiv.style.borderRadius = '9999px'; // rounded-full
                    dayNumberDiv.style.width = '1.5rem'; // w-6
                    dayNumberDiv.style.height = '1.5rem'; // h-6
                    dayNumberDiv.style.display = 'flex';
                    dayNumberDiv.style.alignItems = 'center';
                    dayNumberDiv.style.justifyContent = 'center';
                    dayNumberDiv.style.marginLeft = 'auto';
                    dayNumberDiv.style.fontWeight = '700'; // font-bold
                    dayNumberDiv.style.lineHeight = '1'; // leading-none
                    dayNumberDiv.style.padding = '0px'; // Reset padding
                    dayNumberDiv.classList.add('today-number-highlight'); // 식별용 클래스 추가

                    cell.style.borderColor = '#7dd3fc'; // sky-300
                    cell.style.borderWidth = '2px';
                    cell.style.borderStyle = 'solid';
                    cell.classList.add('today-cell-highlight'); // 식별용 클래스 추가
                }

                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
                const daySchedule = scheduleDays.find(d => d.date === dateStr);

                if (daySchedule && daySchedule.timeSlots) {
                    daySchedule.timeSlots.forEach((slot, slotIndex) => {
                        const slotDiv = document.createElement('div');
                        slotDiv.dataset.slotType = slot.type;
                        slotDiv.setAttribute('data-debug', slot.type + '-APPLIED');

                        slotDiv.style.padding = '0.375rem';
                        slotDiv.style.marginTop = '0.25rem';
                        slotDiv.style.marginBottom = '0.25rem';
                        slotDiv.style.borderRadius = '0.5rem';
                        slotDiv.style.textAlign = 'left';
                        slotDiv.style.fontSize = '11px';
                        slotDiv.style.lineHeight = '1.375';
                        slotDiv.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
                        slotDiv.style.border = '1px solid #d1d5db';
                        slotDiv.style.backgroundColor = '#f3f4f6';
                        slotDiv.style.color = '#374151';
                        slotDiv.style.boxSizing = 'border-box';
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
                                        nameSpan.style.fontWeight = '800';
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
                date++;
            }
        }
        if (date > totalDaysInMonth && i < 5) { 
            // This condition seems to be for breaking early if remaining rows are empty,
            // but it's currently an empty block. It might be okay to leave as is or remove.
            // For now, preserving its structure.
        }
    }
    calendarContainer.appendChild(table);
}

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
            scale: 2, // 고화질 이미지를 위해 스케일 2로 설정
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false, // 디버그 로깅 비활성화
            onclone: (documentClone) => {
                // 복제된 문서 본문의 스타일 설정
                documentClone.body.style.width = 'auto';
                documentClone.body.style.height = 'auto';
                documentClone.body.style.overflow = 'visible';
                documentClone.body.style.margin = '0';
                documentClone.body.style.padding = '0';

                // 복제된 달력 컨테이너 스타일 설정
                const clonedCalendarContainer = documentClone.getElementById('share-calendar-container');
                if (clonedCalendarContainer) {
                    // 컨테이너 크기와 위치 조정
                    clonedCalendarContainer.style.position = 'absolute';
                    clonedCalendarContainer.style.left = '0px';
                    clonedCalendarContainer.style.top = '0px';
                    clonedCalendarContainer.style.width = 'auto';
                    clonedCalendarContainer.style.height = 'auto';
                    clonedCalendarContainer.style.overflow = 'visible';
                    clonedCalendarContainer.style.margin = '0';
                    clonedCalendarContainer.style.padding = '0';
                }

                // '오늘' 강조 스타일 제거 로직 추가
                const todayCellClones = documentClone.querySelectorAll('.today-cell-highlight');
                todayCellClones.forEach(cellClone => {
                    cellClone.style.borderColor = '#e2e8f0'; // 기본 slate-200 색상
                    cellClone.style.borderWidth = '1px';   // 기본 테두리 두께
                    // cellClone.style.borderStyle = 'solid'; // 이미 solid일 것이므로 생략 가능
                });

                const todayNumberClones = documentClone.querySelectorAll('.today-number-highlight');
                todayNumberClones.forEach(numDivClone => {
                    numDivClone.style.color = '#64748b'; // 기본 slate-500 색상 (날짜 숫자)
                    numDivClone.style.backgroundColor = 'transparent'; // 배경 없음
                    numDivClone.style.borderRadius = ''; // 원형 배경 제거
                    numDivClone.style.width = 'auto'; // 자동 너비
                    numDivClone.style.height = 'auto'; // 자동 높이
                    numDivClone.style.display = 'block'; // flex 해제, 기본 block으로
                    numDivClone.style.textAlign = 'right'; // 원래 정렬 유지
                    numDivClone.style.marginLeft = ''; // 자동 마진 해제
                    numDivClone.style.fontWeight = '600'; // 기본 font-semibold
                    numDivClone.style.lineHeight = '';    // 기본값 사용
                    numDivClone.style.padding = ''; // 기본 패딩 사용
                    // numDivClone.style.paddingRight = '0.25rem'; // 원래 있던 패딩 유지 가능
                    // numDivClone.style.paddingLeft = '0.25rem';
                });
            }
        });

        const newCanvas = document.createElement('canvas');
        const titleBarHeight = Math.max(60, originalCanvas.width * 0.05); // 제목 표시줄 높이
        newCanvas.width = originalCanvas.width;
        newCanvas.height = originalCanvas.height + titleBarHeight;
        
        const ctx = newCanvas.getContext('2d');

        // 배경 색상 설정
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, newCanvas.width, newCanvas.height);
        
        // 원본 캔버스 그리기
        ctx.drawImage(originalCanvas, 0, titleBarHeight);
        
        // 제목 표시줄 그리기
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, newCanvas.width, titleBarHeight);

        // 제목 텍스트 설정
        const titleText = `${currentYear}년 ${currentMonth}월`;
        const fontSize = Math.max(20, Math.min(originalCanvas.width * 0.03, 32));
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillStyle = '#334155'; // slate-700
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const textX = newCanvas.width / 2;
        const textY = titleBarHeight / 2;
        
        ctx.fillText(titleText, textX, textY);

        // 이미지 다운로드
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
        const pType = pData?.type; // '초등' or '중등'
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
            if (slotData?.fixed) { // Check if this slot is a 'fixed' slot
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
                        await loadAndRenderCalendar(currentYear, currentMonth); // Refresh calendar
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


    modalGenderFilter.value = 'all'; // Reset filter
    populateParticipantSelect();
    modal.classList.add('active');
}

async function populateParticipantSelect() {
    if (!editContext) return;
    const { date, slotType, originalAssignments, participantIdToEdit } = editContext;
    const genderFilter = modalGenderFilter.value;




    
    const availableParticipants = await shareLogic.getAvailableParticipantsForSlot(
        date,
        slotType, // This is crucial: '초등' or '중등' from the slot characteristics
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
        
        option.innerHTML = `${p.name} (<span class="${typeColorClass}">${p.type}</span>, ${p.gender})`;
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
        await loadAndRenderCalendar(currentYear, currentMonth); // Refresh calendar
        messageDiv.textContent = '일정 변경 저장 완료.';
        messageDiv.className = 'my-2 text-green-600';
    } catch (error) {
        console.error("Failed to save assignment:", error);
        modalMessageDiv.textContent = `저장 실패: ${error.message}`;
    }
}
