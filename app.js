import { initMasterDataModule } from './master_data_logic.js';
import { initScheduleGenerationView } from './schedule_generation_ui.js';
import { initAttendanceView } from './attendance_ui.js';
import { initShareView } from './share_ui.js';
import { initSettingsView } from './settings_ui.js'; // New import

document.addEventListener('DOMContentLoaded', () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js')
            .then((registration) => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            })
            .catch((error) => {
                console.log('ServiceWorker registration failed: ', error);
            });
    }

    lucide.createIcons();

    const navLinks = document.querySelectorAll('.nav-link');
    const views = document.querySelectorAll('.app-view');
    const mainContent = document.getElementById('main-content');

    function switchView(viewId) {
        views.forEach(view => {
            if (view.id === viewId) {
                view.classList.remove('hidden');
            } else {
                view.classList.add('hidden');
            }
        });

        navLinks.forEach(link => {
            if (link.dataset.view === viewId) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
        
        mainContent.scrollTop = 0; 
        window.scrollTo(0,0);

        if (viewId === 'masterDataView') {
            initMasterDataModule('masterDataView');
        } else if (viewId === 'scheduleGenerationView') {
            initScheduleGenerationView('scheduleGenerationView');
        } else if (viewId === 'attendanceView') {
            initAttendanceView('attendanceView');
        } else if (viewId === 'shareView') {
            initShareView('shareView');
        } else if (viewId === 'settingsView') {
            initSettingsView('settingsView'); // New view initialization
        }
    }

    navLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const viewId = link.dataset.view;
            const currentHash = window.location.hash;
            const targetHash = link.getAttribute('href');
            
            switchView(viewId);
            
            if (currentHash !== targetHash) {
                 history.pushState({ view: viewId }, '', targetHash);
            }
        });
    });
    
    window.addEventListener('popstate', (event) => {
        if (event.state && event.state.view) {
            switchView(event.state.view);
        } else {
            const hash = window.location.hash.substring(1);
            let viewToLoad = 'masterDataView'; 
            navLinks.forEach(navLink => {
                if (navLink.getAttribute('href') === `#${hash}`) {
                    viewToLoad = navLink.dataset.view;
                }
            });
            switchView(viewToLoad);
        }
    });

    const initialHash = window.location.hash.substring(1);
    let initialViewId = 'masterDataView'; 
    let initialHref = '#master-data';

    if (initialHash) {
        const activeLink = document.querySelector(`.nav-link[href="#${initialHash}"]`);
        if (activeLink) {
            initialViewId = activeLink.dataset.view;
            initialHref = activeLink.getAttribute('href');
        } else {
             const defaultLink = document.querySelector('.nav-link[data-view="masterDataView"]');
             if(defaultLink) initialHref = defaultLink.getAttribute('href');
        }
    } else {
        const defaultLink = document.querySelector('.nav-link[data-view="masterDataView"]');
        if(defaultLink) initialHref = defaultLink.getAttribute('href');
    }
    
    switchView(initialViewId);
    history.replaceState({ view: initialViewId }, '', initialHref);

});
