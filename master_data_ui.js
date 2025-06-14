import {
    currentPage as logicCurrentPage,
    totalPages as logicTotalPages,
    goToPrevPage,
    goToNextPage
} from './master_data_logic.js';

// Global UI variables for pagination elements
let prevPageBtnEl, nextPageBtnEl, pageInfoSpanEl;

export function renderMasterDataView(containerId, onAdd, onExcelUpload, onDeleteSelected, onDeleteAll) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <h2 class="text-xl font-semibold mb-4 text-sky-700">기준정보 관리</h2>
        
        <div class="mb-6 p-4 border border-slate-200 rounded-lg bg-slate-50">
            <h3 class="text-lg font-medium mb-3 text-sky-600">신규 정보 추가</h3>
            <form id="addParticipantForm" class="space-y-4">
                <div class="form-group">
                    <label for="name" class="text-sm font-medium text-slate-700">이름:</label>
                    <input type="text" id="name" name="name" required class="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-sky-500 focus:ring-sky-500 sm:text-sm py-2 px-3">
                </div>
                <div class="form-group">
                    <label for="gender" class="text-sm font-medium text-slate-700">성별:</label>
                    <select id="gender" name="gender" required class="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-sky-500 focus:ring-sky-500 sm:text-sm py-2 px-3">
                        <option value="남">남</option>
                        <option value="여">여</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="type" class="text-sm font-medium text-slate-700">초중구분:</label>
                    <select id="type" name="type" required class="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-sky-500 focus:ring-sky-500 sm:text-sm py-2 px-3">
                        <option value="초등">초등</option>
                        <option value="중등">중등</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="copyType" class="text-sm font-medium text-slate-700">복사구분:</label>
                    <select id="copyType" name="copyType" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-sky-500 focus:ring-sky-500 sm:text-sm py-2 px-3">
                        <option value="소복사">소복사</option>
                        <option value="대복사">대복사</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="studentPhone" class="text-sm font-medium text-slate-700">학생 연락처:</label>
                    <input type="tel" id="studentPhone" name="studentPhone" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-sky-500 focus:ring-sky-500 sm:text-sm py-2 px-3" placeholder="하이픈 없이 숫자만">
                </div>
                <div class="form-group">
                    <label for="parentPhone" class="text-sm font-medium text-slate-700">부모 연락처:</label>
                    <input type="tel" id="parentPhone" name="parentPhone" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-sky-500 focus:ring-sky-500 sm:text-sm py-2 px-3" placeholder="하이픈 없이 숫자만">
                </div>
                <button type="submit" class="btn btn-primary w-full sm:w-auto">
                    <i data-lucide="user-plus" class="mr-2 h-5 w-5"></i>추가하기
                </button>
            </form>
        </div>

        <div class="mb-6 p-4 border border-slate-200 rounded-lg bg-slate-50">
            <h3 class="text-lg font-medium mb-3 text-sky-600">엑셀로 일괄 업로드</h3>
            <input type="file" id="excelFile" accept="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,.xlsx,.xls" class="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-sky-100 file:text-sky-700 hover:file:bg-sky-200 mb-2">
            <div class="flex">
                <button id="uploadExcelBtn" class="btn btn-primary w-full sm:w-auto">
                    <i data-lucide="file-up" class="mr-2 h-5 w-5"></i>엑셀 업로드
                </button>
                <button id="downloadExcelTemplateBtn" class="btn btn-secondary w-full sm:w-auto ml-2">
                    <i data-lucide="file-spreadsheet" class="mr-2 h-5 w-5"></i>엑셀양식 다운로드
                </button>
            </div>
        </div>
        
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-medium text-sky-600">등록된 정보 목록</h3>
            <div class="flex space-x-2">
                <button id="filterSmallCopyBtn" class="btn btn-secondary">
                    <i data-lucide="users" class="mr-2 h-5 w-5"></i>소복사 관리
                </button>
                <button id="deleteSelectedBtn" class="btn btn-danger" disabled>
                    <i data-lucide="trash-2" class="mr-2 h-5 w-5"></i>선택 항목 삭제
                </button>
                <button id="deleteAllBtn" class="btn btn-danger">
                    <i data-lucide="alert-triangle" class="mr-2 h-5 w-5"></i>전체 삭제
                </button>
            </div>
        </div>
        <div id="masterDataTableContainer" class="overflow-x-auto bg-white rounded-lg shadow">
            <p class="p-4 text-slate-500">데이터를 불러오는 중입니다...</p>
        </div>

        <div id="paginationControlsContainer" class="mt-6 flex justify-center items-center space-x-3 py-2">
            <button id="prevPageBtn" class="btn btn-secondary py-2 px-4 rounded-md shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                <i data-lucide="arrow-left" class="mr-1 h-4 w-4"></i> 이전
            </button>
            <span id="pageInfo" class="text-sm font-medium text-slate-700">Page 1 of 1</span>
            <button id="nextPageBtn" class="btn btn-secondary py-2 px-4 rounded-md shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                다음 <i data-lucide="arrow-right" class="ml-1 h-4 w-4"></i>
            </button>
        </div>

        <!-- Edit Modal -->
        <div id="editParticipantModal" class="modal">
            <div class="modal-content">
                <h3 class="text-lg font-medium mb-4 text-sky-600">정보 수정</h3>
                <form id="editParticipantForm" class="space-y-4">
                    <input type="hidden" id="editParticipantId" name="id">
                    <div class="form-group">
                        <label for="editName" class="text-sm font-medium text-slate-700">이름:</label>
                        <input type="text" id="editName" name="name" required class="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-sky-500 focus:ring-sky-500 sm:text-sm py-2 px-3">
                    </div>
                    <div class="form-group">
                        <label for="editGender" class="text-sm font-medium text-slate-700">성별:</label>
                        <select id="editGender" name="gender" required class="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-sky-500 focus:ring-sky-500 sm:text-sm py-2 px-3">
                            <option value="남">남</option>
                            <option value="여">여</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="editType" class="text-sm font-medium text-slate-700">초중구분:</label>
                        <select id="editType" name="type" required class="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-sky-500 focus:ring-sky-500 sm:text-sm py-2 px-3">
                            <option value="초등">초등</option>
                            <option value="중등">중등</option>
                        </select>
                    </div>
                <div class="form-group">
                    <label for="editCopyType" class="text-sm font-medium text-slate-700">복사구분:</label>
                    <select id="editCopyType" name="copyType" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-sky-500 focus:ring-sky-500 sm:text-sm py-2 px-3">
                        <option value="소복사">소복사</option>
                        <option value="대복사">대복사</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="editStudentPhone" class="text-sm font-medium text-slate-700">학생 연락처:</label>
                    <input type="tel" id="editStudentPhone" name="studentPhone" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-sky-500 focus:ring-sky-500 sm:text-sm py-2 px-3" placeholder="하이픈 없이 숫자만">
                </div>
                <div class="form-group">
                    <label for="editParentPhone" class="text-sm font-medium text-slate-700">부모 연락처:</label>
                    <input type="tel" id="editParentPhone" name="parentPhone" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-sky-500 focus:ring-sky-500 sm:text-sm py-2 px-3" placeholder="하이픈 없이 숫자만">
                </div>
                    <div class="flex justify-end space-x-2">
                        <button type="button" id="cancelEditBtn" class="btn btn-secondary">취소</button>
                        <button type="submit" class="btn btn-primary">
                            <i data-lucide="save" class="mr-2 h-5 w-5"></i>저장하기
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.getElementById('addParticipantForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const participant = Object.fromEntries(formData.entries());
        participant.isActive = true; // Default
        onAdd(participant);
        e.target.reset();
    });

    document.getElementById('uploadExcelBtn').addEventListener('click', () => {
        const fileInput = document.getElementById('excelFile');
        if (fileInput.files.length > 0) {
            onExcelUpload(fileInput.files[0]);
            fileInput.value = ''; // Reset file input
        } else {
            alert('엑셀 파일을 선택해주세요.');
        }
    });
    
    document.getElementById('deleteSelectedBtn').addEventListener('click', onDeleteSelected);
    document.getElementById('deleteAllBtn').addEventListener('click', onDeleteAll);


    document.getElementById('cancelEditBtn').addEventListener('click', () => {
        document.getElementById('editParticipantModal').classList.remove('active');
    });
    document.getElementById('editParticipantModal').addEventListener('click', (e) => {
        if (e.target.id === 'editParticipantModal') { // Click on backdrop
            document.getElementById('editParticipantModal').classList.remove('active');
        }
    });

    lucide.createIcons();

    // Get references to pagination elements and set up listeners
    prevPageBtnEl = document.getElementById('prevPageBtn');
    nextPageBtnEl = document.getElementById('nextPageBtn');
    pageInfoSpanEl = document.getElementById('pageInfo');

    if (prevPageBtnEl) {
        prevPageBtnEl.addEventListener('click', async () => {
            await goToPrevPage();
            // renderMasterDataTable will be called by logic, which then calls renderPaginationControls
        });
    }
    if (nextPageBtnEl) {
        nextPageBtnEl.addEventListener('click', async () => {
            await goToNextPage();
            // renderMasterDataTable will be called by logic, which then calls renderPaginationControls
        });
    }
}

function renderPaginationControls(currentPage, totalPages) {
    // Query elements every time in case the view was re-rendered (e.g. by error)
    // This is a bit redundant if elements are stable from renderMasterDataView, but safer.
    const pageInfo = document.getElementById('pageInfo');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');

    if (!pageInfo || !prevBtn || !nextBtn) {
        // console.warn("Pagination control elements not found during renderPaginationControls.");
        return;
    }

    pageInfo.textContent = `페이지 ${currentPage} / ${totalPages}`;

    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages || totalPages === 0;
}


export function renderMasterDataTable(participants, onEdit, onDelete, onSelectionChange) {
    const container = document.getElementById('masterDataTableContainer');
    if (!container) return;

    if (participants.length === 0) {
        container.innerHTML = '<p class="p-4 text-slate-500">등록된 정보가 없습니다. 위 양식을 통해 추가하거나 엑셀 파일을 업로드해주세요.</p>';
        const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
        if (deleteSelectedBtn) deleteSelectedBtn.disabled = true;
        // Still render pagination even if no participants, to show "Page 1 of 1" or "Page 1 of 0" (logic ensures totalPages >=1)
        renderPaginationControls(logicCurrentPage, logicTotalPages);
        return;
    }

    const tableHTML = `
        <table class="min-w-full divide-y divide-slate-200">
            <thead class="bg-slate-50">
                <tr>
                    <th scope="col" class="p-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        <input type="checkbox" id="selectAllCheckbox" title="전체 선택">
                    </th>
                    <th scope="col" class="p-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">이름</th>
                    <th scope="col" class="p-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">성별</th>
                    <th scope="col" class="p-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">초중구분</th>
                    <th scope="col" class="p-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">복사구분</th>
                    <th scope="col" class="p-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">학생 연락처</th>
                    <th scope="col" class="p-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">부모 연락처</th>
                    <th scope="col" class="p-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">작업</th>
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-slate-200">
                ${participants.map(p => `
                    <tr data-id="${p.id}">
                        <td class="p-3 whitespace-nowrap">
                            <input type="checkbox" class="row-checkbox" data-id="${p.id}">
                        </td>
                        <td class="p-3 whitespace-nowrap text-sm text-slate-700">${p.name}</td>
                        <td class="p-3 whitespace-nowrap text-sm text-slate-700">${p.gender}</td>
                        <td class="p-3 whitespace-nowrap text-sm text-slate-700">${p.type}</td>
                        <td class="p-3 whitespace-nowrap text-sm text-slate-700">${p.copyType || '-'}</td>
                        <td class="p-3 whitespace-nowrap text-sm text-slate-700">${p.studentPhone || '-'}</td>
                        <td class="p-3 whitespace-nowrap text-sm text-slate-700">${p.parentPhone || '-'}</td>
                        <td class="p-3 whitespace-nowrap text-sm font-medium space-x-2">
                            <button class="edit-btn text-sky-600 hover:text-sky-800" data-id="${p.id}" title="수정">
                                <i data-lucide="edit" class="h-5 w-5"></i>
                            </button>
                            <button class="delete-btn text-red-600 hover:text-red-800" data-id="${p.id}" title="삭제">
                                <i data-lucide="trash-2" class="h-5 w-5"></i>
                            </button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    container.innerHTML = tableHTML;


    container.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => onEdit(parseInt(btn.dataset.id))));
    container.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', () => onDelete(parseInt(btn.dataset.id))));
    
    const rowCheckboxes = container.querySelectorAll('.row-checkbox');
    const selectAllCheckbox = container.querySelector('#selectAllCheckbox');

    rowCheckboxes.forEach(checkbox => checkbox.addEventListener('change', onSelectionChange));
    if(selectAllCheckbox) {
      selectAllCheckbox.addEventListener('change', (e) => {
          rowCheckboxes.forEach(cb => cb.checked = e.target.checked);
          onSelectionChange(); // Trigger selection change to update delete button state
      });
    }
    onSelectionChange(); // Initial check for delete button state
    lucide.createIcons();
    renderPaginationControls(logicCurrentPage, logicTotalPages);
}

export function populateEditForm(participant) {
    document.getElementById('editParticipantId').value = participant.id;
    document.getElementById('editName').value = participant.name;
    document.getElementById('editGender').value = participant.gender;
    document.getElementById('editType').value = participant.type;
    document.getElementById('editCopyType').value = participant.copyType || '소복사';
    document.getElementById('editStudentPhone').value = participant.studentPhone || '';
    document.getElementById('editParentPhone').value = participant.parentPhone || '';
    document.getElementById('editParticipantModal').classList.add('active');
}

export function closeEditModal() {
    document.getElementById('editParticipantModal').classList.remove('active');
}
