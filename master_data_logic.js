import * as db from './db.js';
import { renderMasterDataView, renderMasterDataTable, populateEditForm, closeEditModal } from './master_data_ui.js';

export let currentPage = 1;
export const itemsPerPage = 10;
export let totalPages = 1;
let participantsCache = [];
let selectedParticipantIds = new Set();
let currentCopyTypeFilter = 'all'; // Possible values: 'all', '소복사'

async function loadAndRenderParticipants(forceReloadFromDB = false) {
    try {
        if (forceReloadFromDB || participantsCache.length === 0) {
            participantsCache = await db.getAllParticipants();
        }

        let participantsToRender = participantsCache;
        if (currentCopyTypeFilter === '소복사') {
            participantsToRender = participantsCache.filter(p => p.copyType === '소복사');
        }

        const totalParticipantsCount = participantsToRender.length; // Use participantsToRender
        totalPages = Math.ceil(totalParticipantsCount / itemsPerPage);
        if (totalPages === 0) totalPages = 1;

        if (currentPage > totalPages) {
            currentPage = totalPages;
        }
        if (currentPage < 1) {
            currentPage = 1;
        }

        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const participantsForPage = participantsToRender.slice(startIndex, endIndex); // Use participantsToRender

        renderMasterDataTable(participantsForPage, handleEditAction, handleDeleteAction, handleSelectionChange);
        // UI layer (master_data_ui.js) will call renderPaginationControls by importing currentPage and totalPages
    } catch (error) {
        console.error("Failed to load participants:", error);
        // alert("기준 정보를 불러오는데 실패했습니다."); // UI should handle alerts
        const container = document.getElementById('masterDataTableContainer');
        if(container) container.innerHTML = '<p class="p-4 text-red-500">데이터 로드 실패!</p>';
        // UI should handle clearing/resetting pagination controls
    }
}

async function handleAddParticipant(participant) {
    try {
        // Process phone numbers before saving
        if (participant.studentPhone) {
            participant.studentPhone = participant.studentPhone.replace(/-/g, '');
        }
        if (participant.parentPhone) {
            participant.parentPhone = participant.parentPhone.replace(/-/g, '');
        }
        // Ensure copyType is valid, defaulting to '소복사'
        if (participant.copyType !== '소복사' && participant.copyType !== '대복사') {
            participant.copyType = '소복사';
        }
        await db.addParticipant(participant);
        await loadAndRenderParticipants(true);
        alert('성공적으로 추가되었습니다.');
    } catch (error) {
        console.error("Failed to add participant:", error);
        alert("정보 추가에 실패했습니다.");
    }
}

function handleEditAction(id) {
    const participant = participantsCache.find(p => p.id === id);
    if (participant) {
        populateEditForm(participant);
    }
}

async function handleSaveEditParticipant(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const updatedParticipant = {
        id: parseInt(formData.get('id')),
        name: formData.get('name'),
        gender: formData.get('gender'),
        type: formData.get('type'),
        copyType: formData.get('copyType') || '소복사', // Default to 소복사
        isActive: true // Assuming isActive is always true or handle it in form
    };

    const studentPhoneFromForm = formData.get('studentPhone');
    if (studentPhoneFromForm) {
        updatedParticipant.studentPhone = studentPhoneFromForm.replace(/-/g, '');
    } else {
        updatedParticipant.studentPhone = '';
    }

    const parentPhoneFromForm = formData.get('parentPhone');
    if (parentPhoneFromForm) {
        updatedParticipant.parentPhone = parentPhoneFromForm.replace(/-/g, '');
    } else {
        updatedParticipant.parentPhone = '';
    }

    try {
        await db.updateParticipant(updatedParticipant);
        closeEditModal();
        await loadAndRenderParticipants(true);
        alert('정보가 성공적으로 수정되었습니다.');
    } catch (error) {
        console.error("Failed to update participant:", error);
        alert("정보 수정에 실패했습니다.");
    }
}


async function handleDeleteAction(id) {
    if (confirm("정말로 이 항목을 삭제하시겠습니까?")) {
        try {
            await db.deleteParticipant(id);
            selectedParticipantIds.delete(id); // Remove from selection if it was selected
            await loadAndRenderParticipants(true);
            alert('성공적으로 삭제되었습니다.');
        } catch (error) {
            console.error("Failed to delete participant:", error);
            alert("정보 삭제에 실패했습니다.");
        }
    }
}

function handleSelectionChange() {
    selectedParticipantIds.clear();
    const checkboxes = document.querySelectorAll('#masterDataTableContainer .row-checkbox:checked');
    checkboxes.forEach(cb => selectedParticipantIds.add(parseInt(cb.dataset.id)));
    
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    if (deleteSelectedBtn) {
        deleteSelectedBtn.disabled = selectedParticipantIds.size === 0;
    }


    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    if(selectAllCheckbox) {
        const allRowCheckboxes = document.querySelectorAll('#masterDataTableContainer .row-checkbox');
        if (allRowCheckboxes.length > 0 && selectedParticipantIds.size === allRowCheckboxes.length) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else if (selectedParticipantIds.size > 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        }
    }
}

async function handleDeleteSelected() {
    if (selectedParticipantIds.size === 0) {
        alert("삭제할 항목을 선택해주세요.");
        return;
    }
    if (confirm(`선택된 ${selectedParticipantIds.size}개 항목을 정말로 삭제하시겠습니까?`)) {
        try {
            await db.deleteMultipleParticipants(Array.from(selectedParticipantIds));
            selectedParticipantIds.clear();
            await loadAndRenderParticipants(true);
            alert('선택된 항목이 성공적으로 삭제되었습니다.');
        } catch (error) {
            console.error("Failed to delete selected participants:", error);
            alert("선택 항목 삭제에 실패했습니다.");
        }
    }
}

async function handleDeleteAllParticipants() {
    if (confirm("정말로 모든 기준정보 데이터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
        try {
            await db.deleteAllParticipants();
            participantsCache = []; // Clear cache
            selectedParticipantIds.clear(); // Clear selection
            currentPage = 1; // Reset to first page
            await loadAndRenderParticipants(true); // Force reload and re-render
            alert('모든 기준정보가 성공적으로 삭제되었습니다.');
        } catch (error) {
            console.error("Failed to delete all participants:", error);
            alert("전체 정보 삭제에 실패했습니다: " + error.message);
        }
    }
}

function handleExcelUpload(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            if (jsonData.length < 2) { // Header + at least one data row
                alert("엑셀 파일에 데이터가 없거나 형식이 올바르지 않습니다.");
                return;
            }


            const header = jsonData[0].map(h => h.trim());
            const nameIndex = header.indexOf('이름');
            const genderIndex = header.indexOf('성별');
            const typeIndex = header.indexOf('초중구분');
            const copyTypeIndex = header.indexOf('복사구분'); // 복사구분
            const studentPhoneIndex = header.indexOf('학생 연락처'); // Corrected typo
            const parentPhoneIndex = header.indexOf('부모 연락처');

            console.log("Excel Headers:", header);
            console.log("Student Phone Index:", studentPhoneIndex);
            console.log("Parent Phone Index:", parentPhoneIndex);

            if (nameIndex === -1 || genderIndex === -1 || typeIndex === -1) {
                alert("엑셀 파일 헤더가 올바르지 않습니다. '이름', '성별', '초중구분' 헤더는 필수입니다. '학생 연락처', '부모 연락처' 헤더도 확인해주세요.");
                return;
            }
            
            let newParticipantsCount = 0;
            for (let i = 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                console.log(`Processing Excel Row ${i}:`, row);
                if (studentPhoneIndex !== -1) {
                    console.log(`Raw Student Phone Cell (Row ${i}):`, row[studentPhoneIndex]);
                }
                if (parentPhoneIndex !== -1) {
                    console.log(`Raw Parent Phone Cell (Row ${i}):`, row[parentPhoneIndex]);
                }

                if (row.length === 0 || row.every(cell => cell === null || cell === undefined || cell.toString().trim() === '')) continue; // Skip empty rows

                const name = row[nameIndex] ? row[nameIndex].toString().trim() : null;
                const gender = row[genderIndex] ? row[genderIndex].toString().trim() : null;
                const type = row[typeIndex] ? row[typeIndex].toString().trim() : null;

                let copyTypeExcel = '소복사'; // Default to 소복사
                if (copyTypeIndex !== -1 && row[copyTypeIndex]) {
                    const rawCopyType = row[copyTypeIndex].toString().trim();
                    if (rawCopyType === '대복사') { // Only explicitly set if '대복사'
                        copyTypeExcel = '대복사';
                    }
                    // Any other value (including empty or '소복사' itself) defaults/remains '소복사'
                }

                let studentPhone = null;
                if (studentPhoneIndex !== -1 && row[studentPhoneIndex]) {
                    studentPhone = row[studentPhoneIndex].toString().trim().replace(/-/g, '');
                }

                let parentPhone = null;
                if (parentPhoneIndex !== -1 && row[parentPhoneIndex]) {
                    parentPhone = row[parentPhoneIndex].toString().trim().replace(/-/g, '');
                }
                console.log(`Processed (Row ${i}) - Student: ${studentPhone}, Parent: ${parentPhone}`);

                if (!name || !gender || !type) {
                    console.warn(`Skipping row ${i+1} due to missing data:`, row);
                    continue;
                }
                

                if (!['남', '여'].includes(gender)) {
                    console.warn(`Skipping row ${i+1} due to invalid gender: ${gender}`);
                    continue;
                }
                if (!['초등', '중등'].includes(type)) {
                     console.warn(`Skipping row ${i+1} due to invalid type: ${type}`);
                    continue;
                }

                const participantData = {
                    name,
                    gender,
                    type,
                    copyType: copyTypeExcel, // Use the processed copyTypeExcel
                    studentPhone: studentPhone || '',
                    parentPhone: parentPhone || '',
                    isActive: true
                };
                console.log(`Data to be added for Row ${i}:`, participantData);
                await db.addParticipant(participantData);
                newParticipantsCount++;
            }
            
            await loadAndRenderParticipants(true);
            alert(`${newParticipantsCount}명의 정보가 엑셀 파일로부터 성공적으로 추가되었습니다.`);

        } catch (error) {
            console.error("Excel processing error:", error);
            alert("엑셀 파일 처리 중 오류가 발생했습니다. 파일 형식을 확인해주세요.");
        }
    };
    reader.onerror = (error) => {
        console.error("File reading error:", error);
        alert("파일을 읽는 중 오류가 발생했습니다.");
    };
    reader.readAsArrayBuffer(file);
}

export async function goToPrevPage() {
    if (currentPage > 1) {
        currentPage--;
        await loadAndRenderParticipants();
    }
}

export async function goToNextPage() {
    if (currentPage < totalPages) {
        currentPage++;
        await loadAndRenderParticipants();
    }
}

export function initMasterDataModule(containerId) {
    renderMasterDataView(containerId, handleAddParticipant, handleExcelUpload, handleDeleteSelected, handleDeleteAllParticipants);
    const editForm = document.getElementById('editParticipantForm');
    if(editForm) {
        editForm.addEventListener('submit', handleSaveEditParticipant);
    }
    loadAndRenderParticipants();

    // Add listener for the new Excel template download button
    const downloadTemplateBtn = document.getElementById('downloadExcelTemplateBtn');
    if (downloadTemplateBtn) {
        downloadTemplateBtn.addEventListener('click', handleDownloadExcelTemplate);
    }

    const filterSmallCopyButton = document.getElementById('filterSmallCopyBtn');
    if (filterSmallCopyButton) {
        filterSmallCopyButton.addEventListener('click', toggleSmallCopyFilter);
    }
}

// Function to handle Excel template download
function handleDownloadExcelTemplate() {
    const headers = ["이름", "성별", "초중구분", "복사구분", "학생 연락처", "부모 연락처"];
    const worksheet = XLSX.utils.aoa_to_sheet([headers]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "양식");
    XLSX.writeFile(workbook, "기준정보_업로드_양식.xlsx");
}

// Function to toggle 소복사 filter
async function toggleSmallCopyFilter() {
    const filterBtn = document.getElementById('filterSmallCopyBtn');
    if (currentCopyTypeFilter === '소복사') {
        currentCopyTypeFilter = 'all';
        if (filterBtn) {
            filterBtn.classList.remove('btn-sky-600', 'text-white');
            filterBtn.classList.add('btn-secondary');
            filterBtn.innerHTML = '<i data-lucide="users" class="mr-2 h-5 w-5"></i>소복사 관리';
        }
    } else {
        currentCopyTypeFilter = '소복사';
        if (filterBtn) {
            filterBtn.classList.remove('btn-secondary');
            filterBtn.classList.add('btn-sky-600', 'text-white');
            filterBtn.innerHTML = '<i data-lucide="user-check" class="mr-2 h-5 w-5"></i>전체 보기';
        }
    }
    if (typeof lucide !== 'undefined') {
         lucide.createIcons();
    }
    currentPage = 1;
    await loadAndRenderParticipants(false);
}
