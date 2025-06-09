// settings_ui.js
import * as settingsLogic from './settings_logic.js';

async function handleExportAllData_UI_Wrapper() {
    const exportButton = document.getElementById('export-all-data-btn');
    const messageArea = document.getElementById('settings-message-area');

    if(exportButton) exportButton.disabled = true;
    if(messageArea) {
        messageArea.textContent = '데이터 내보내는 중...';
        messageArea.className = 'mt-2 text-sm text-blue-600';
    }

    try {
        const result = await settingsLogic.handleExportAllData();
        if (result.success) {
            if(messageArea) messageArea.textContent = '데이터 내보내기 완료! 다운로드가 시작됩니다.';
        } else {
            throw new Error(result.error || '알 수 없는 내보내기 오류');
        }
    } catch (error) {
        console.error("UI: Data export failed:", error);
        if(messageArea) messageArea.textContent = `오류: 데이터 내보내기 실패 (${error.message})`;
        alert(`데이터 내보내기 실패: ${error.message}`);
    } finally {
        if(exportButton) exportButton.disabled = false;
    }
}

export function initSettingsView(containerId) {
    const viewElement = document.getElementById(containerId);
    if (!viewElement) {
        console.error(`Settings view container #${containerId} not found.`);
        return;
    }

    let h2Title = viewElement.querySelector('h2.text-xl.font-semibold.text-sky-700');
    if (!h2Title || h2Title.textContent !== '설정') {
        if (h2Title) h2Title.remove();
        h2Title = document.createElement('h2');
        h2Title.className = 'text-xl font-semibold mb-4 text-sky-700';
        h2Title.textContent = '설정';
        viewElement.prepend(h2Title);
    }

    let dataManagementSection = viewElement.querySelector('#data-management-section');
    if (!dataManagementSection) {
        dataManagementSection = document.createElement('div');
        dataManagementSection.id = 'data-management-section';
        dataManagementSection.className = 'mt-6';

        dataManagementSection.innerHTML = `
            <h3 class="text-lg font-medium mb-3 text-sky-600">데이터 관리</h3>
            <div class="p-4 border border-slate-200 rounded-lg bg-slate-50 space-y-4">
                <div>
                    <p class="text-sm font-medium text-slate-700 mb-1">데이터 내보내기</p>
                    <button id="export-all-data-btn" class="btn btn-primary">
                        <i data-lucide="download-cloud" class="mr-2 h-5 w-5"></i>데이터 전체 내보내기 (백업)
                    </button>
                    <p class="text-xs text-slate-500 mt-1">모든 애플리케이션 데이터(기준정보, 일정, 출석기록, 월별 통계 등)를 하나의 JSON 파일로 다운로드합니다.</p>
                </div>
                <div>
                    <p class="text-sm font-medium text-slate-700 mt-4 mb-1">데이터 가져오기 (복원)</p>
                    <input type="file" id="import-file-input" accept=".json" class="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-3 file:rounded-md file:border file:border-slate-300 file:text-sm file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer">
                    <div id="selected-import-file-info" class="text-xs text-slate-500 mt-1"></div>
                    <button id="import-all-data-btn" class="btn btn-danger mt-2 w-full sm:w-auto" disabled>
                        <i data-lucide="upload-cloud" class="mr-2 h-5 w-5"></i>선택한 파일로 전체 데이터 복원
                    </button>
                    <p class="text-xs text-slate-500 mt-1">주의: 현재 모든 데이터가 선택한 파일의 내용으로 대체됩니다. 이 작업은 되돌릴 수 없습니다.</p>
                </div>
                <div id="settings-message-area" class="mt-2 text-sm"></div>
            </div>
        `;

        if (h2Title.nextSibling) {
            viewElement.insertBefore(dataManagementSection, h2Title.nextSibling);
        } else {
            viewElement.appendChild(dataManagementSection);
        }
    }

    const exportButton = viewElement.querySelector('#export-all-data-btn');
    if (exportButton) {
        exportButton.removeEventListener('click', handleExportAllData_UI_Wrapper);
        exportButton.addEventListener('click', handleExportAllData_UI_Wrapper);
    }

    const importFileInput = viewElement.querySelector('#import-file-input');
    const importButton = viewElement.querySelector('#import-all-data-btn');
    const selectedFileInfoDiv = viewElement.querySelector('#selected-import-file-info');

    if (importFileInput && importButton && selectedFileInfoDiv) {
        importFileInput.removeEventListener('change', handleImportFileSelect);
        importFileInput.addEventListener('change', handleImportFileSelect);

        importButton.removeEventListener('click', handleImportAllData_UI_Wrapper); // Changed from _UI_Temp
        importButton.addEventListener('click', handleImportAllData_UI_Wrapper); // Changed from _UI_Temp
    }

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function handleImportFileSelect(event) {
    const importButton = document.getElementById('import-all-data-btn');
    const selectedFileInfoDiv = document.getElementById('selected-import-file-info');

    if (!importButton || !selectedFileInfoDiv) return;

    if (event.target.files && event.target.files.length > 0) {
        const file = event.target.files[0];
        selectedFileInfoDiv.textContent = `선택된 파일: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`;
        importButton.disabled = false;
    } else {
        selectedFileInfoDiv.textContent = '';
        importButton.disabled = true;
    }
}

async function handleImportAllData_UI_Wrapper() { // Renamed from _UI_Temp
    const importFileInput = document.getElementById('import-file-input');
    const importButton = document.getElementById('import-all-data-btn');
    const messageArea = document.getElementById('settings-message-area');
    const selectedFileInfoDiv = document.getElementById('selected-import-file-info');

    if (importFileInput.files.length === 0) {
        if(messageArea) messageArea.textContent = '복원할 파일을 먼저 선택해주세요.';
        if(messageArea) messageArea.className = 'mt-2 text-sm text-red-600';
        return;
    }
    const file = importFileInput.files[0];

    if(importButton) importButton.disabled = true;
    if(messageArea) {
        messageArea.textContent = `'${file.name}' 파일 데이터 복원 중...`;
        messageArea.className = 'mt-2 text-sm text-blue-600';
    }

    try {
        // settingsLogic.handleImportAllData handles its own confirm dialog
        const result = await settingsLogic.handleImportAllData(file);

        if (result.success) {
            if(messageArea) messageArea.textContent = '데이터 복원 완료! 앱을 새로고침하여 변경사항을 확인하세요.';
            if(messageArea) messageArea.className = 'mt-2 text-sm text-green-600';
            alert('데이터 복원이 완료되었습니다. 애플리케이션을 새로고침합니다.');
            window.location.reload();
        } else {
            if (result.userCancelled) {
                if(messageArea) messageArea.textContent = '데이터 복원이 사용자에 의해 취소되었습니다.';
                if(messageArea) messageArea.className = 'mt-2 text-sm text-slate-600';
            } else {
                throw new Error(result.error || '알 수 없는 가져오기 오류');
            }
        }
    } catch (error) {
        console.error("UI: Data import failed:", error);
        if(messageArea) messageArea.textContent = `오류: 데이터 가져오기 실패 (${error.message})`;
        if(messageArea) messageArea.className = 'mt-2 text-sm text-red-600';
        // alert is now handled by settingsLogic for failure cases, or here if needed.
        // The logic layer currently doesn't alert on its own error, so UI should.
        alert(`데이터 가져오기 실패: ${error.message}`);
    } finally {
        if(importButton) importButton.disabled = false;
        importFileInput.value = '';
        if(selectedFileInfoDiv) selectedFileInfoDiv.textContent = '';
    }
}
