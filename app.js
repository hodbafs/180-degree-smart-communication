// --- CONFIGURATION ---
const GOOGLE_SCRIPT_API_URL = window.GOOGLE_SCRIPT_API_URL || "";

document.addEventListener('DOMContentLoaded', () => {
    // --- STATE MANAGEMENT ---
    let currentUser = null;
    let activeEvaluation = null; // { targetEmail, role, evaluatorEmail }
    let evaluations = [];


    // --- DOM ELEMENTS ---
    const loginView = document.getElementById('login-view');
    const dashboardView = document.getElementById('dashboard-view');
    const evaluationView = document.getElementById('evaluation-view');
    const adminView = document.getElementById('admin-view');
    const appHeader = document.getElementById('app-header');
    
    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('email-input');
    const emailSuggestions = document.getElementById('email-suggestions');
    const btnLogout = document.getElementById('btn-logout');
    const btnAdminToggle = document.getElementById('btn-admin-toggle');
    const currentUserName = document.getElementById('current-user-name');
    const currentUserRole = document.getElementById('current-user-role');
    const btnBackHeader = document.getElementById('btn-back-header');
    
    const greetingTitle = document.getElementById('greeting-title');
    const selfTaskContainer = document.getElementById('self-task-container');
    const otherTasksContainer = document.getElementById('other-tasks-container');
    const otherTasksCount = document.getElementById('other-tasks-count');
    
    const formTargetTitle = document.getElementById('form-target-title');
    const formMetaTargetName = document.getElementById('form-meta-target-name');
    const formMetaTargetRole = document.getElementById('form-meta-target-role');
    const formMetaProgress = document.getElementById('form-meta-progress');
    const formProgressBarFill = document.getElementById('form-progress-bar-fill');
    const questionsContainer = document.getElementById('questions-container');
    const commentInput = document.getElementById('comment-input');
    
    const btnFormCancel = document.getElementById('btn-form-cancel');
    const btnFormSave = document.getElementById('btn-form-save');
    const btnFormSubmit = document.getElementById('btn-form-submit');
    const evaluationForm = document.getElementById('evaluation-form');
    
    const adminTableBody = document.getElementById('admin-table-body');
    const adminSearch = document.getElementById('admin-search');
    const adminStatusFilter = document.getElementById('admin-status-filter');
    const btnAdminExportRawCsv = document.getElementById('btn-admin-export-raw-csv');
    const btnAdminReset = document.getElementById('btn-admin-reset');
    const btnAdminBack = document.getElementById('btn-admin-back');
    
    const adminStatCompleted = document.getElementById('admin-stat-completed');
    const adminStatTotalTargets = document.getElementById('admin-stat-total-targets');
    const adminStatRate = document.getElementById('admin-stat-rate');
    
    const modalConfirm = document.getElementById('modal-confirm');
    const btnModalCancel = document.getElementById('btn-modal-cancel');
    const btnModalConfirm = document.getElementById('btn-modal-confirm');
    
    const modalAdminPassword = document.getElementById('modal-admin-password');
    const adminPasswordInput = document.getElementById('admin-password-input');
    const btnAdminPassCancel = document.getElementById('btn-admin-pass-cancel');
    const btnAdminPassConfirm = document.getElementById('btn-admin-pass-confirm');
    
    const toastNotification = document.getElementById('toast-notification');
    const toastIcon = document.getElementById('toast-icon');
    const toastMessage = document.getElementById('toast-message');

    // --- 1. DATABASE INITIALIZATION ---
    function initDatabase() {
        const currentVersion = DB.version || '1.0.0';
        const storedVersion = localStorage.getItem('smart_comm_evaluations_db_version');
        const stored = localStorage.getItem('smart_comm_evaluations_db');
        
        if (stored && storedVersion === currentVersion) {
            evaluations = JSON.parse(stored);
            return;
        }

        // Database version mismatch or fresh install: reset/initialize

        // Initialize evaluations database from DB global (db.js)
        evaluations = [];
        DB.participants.forEach(p => {
            // A. Self Evaluation task
            evaluations.push({
                id: `EVAL-${p.id}-SELF`,
                targetName: p.name,
                targetEmail: p.email,
                evaluatorName: p.name,
                evaluatorEmail: p.email,
                role: 'Self',
                answers: {},
                comment: '',
                status: 'Pending', // Pending, In Progress, Completed
                submittedAt: null
            });

            // B. Manager Evaluation task (if manager email exists)
            if (p.manager && p.manager.email) {
                evaluations.push({
                    id: `EVAL-${p.id}-MANAGER`,
                    targetName: p.name,
                    targetEmail: p.email,
                    evaluatorName: p.manager.name,
                    evaluatorEmail: p.manager.email,
                    role: 'Manager',
                    answers: {},
                    comment: '',
                    status: 'Pending',
                    submittedAt: null
                });
            }

            // C. Peer Evaluation tasks
            p.peers.forEach((peer, idx) => {
                evaluations.push({
                    id: `EVAL-${p.id}-PEER-${idx + 1}`,
                    targetName: p.name,
                    targetEmail: p.email,
                    evaluatorName: peer.name,
                    evaluatorEmail: peer.email,
                    role: 'Peer',
                    answers: {},
                    comment: '',
                    status: 'Pending',
                    submittedAt: null
                });
            });
        });

        saveDatabase();
        localStorage.setItem('smart_comm_evaluations_db_version', currentVersion);
    }

    function saveDatabase() {
        localStorage.setItem('smart_comm_evaluations_db', JSON.stringify(evaluations));
    }

    function syncDatabaseWithGoogleSheets() {
        if (!GOOGLE_SCRIPT_API_URL) return;
        
        fetch(GOOGLE_SCRIPT_API_URL)
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success') {
                    let updated = false;

                    // Check for global reset from server
                    const lastResetServer = data.lastReset ? parseInt(data.lastReset) : 0;
                    const lastResetLocal = parseInt(localStorage.getItem('smart_comm_last_reset_seen') || '0');

                    if (lastResetServer > lastResetLocal) {
                        // Global reset detected: reset all local evaluations to Pending
                        evaluations.forEach(ev => {
                            ev.status = 'Pending';
                            ev.answers = {};
                            ev.comment = '';
                            ev.submittedAt = null;
                        });
                        localStorage.setItem('smart_comm_last_reset_seen', lastResetServer.toString());
                        updated = true;
                    }

                    if (data.completed) {
                        data.completed.forEach(item => {
                            const ev = evaluations.find(e => 
                                e.targetEmail.toLowerCase() === item.targetEmail.toLowerCase() &&
                                e.evaluatorEmail.toLowerCase() === item.evaluatorEmail.toLowerCase() &&
                                e.role === item.role
                            );
                            if (ev && ev.status !== 'Completed') {
                                ev.status = 'Completed';
                                ev.submittedAt = ev.submittedAt || new Date().toISOString();
                                updated = true;
                            }
                        });
                    }

                    if (updated) {
                        saveDatabase();
                        // Re-render views if they are active
                        if (dashboardView.style.display !== 'none') {
                            renderDashboard();
                        }
                        if (adminView.style.display !== 'none') {
                            renderAdminPanel();
                        }
                    }
                }
            })
            .catch(err => console.error('Error syncing with Google Sheets:', err));
    }

    // --- 2. NOTIFICATIONS & TOASTS ---
    function showToast(message, type = 'success') {
        toastMessage.textContent = message;
        if (type === 'success') {
            toastIcon.textContent = '✨';
            toastNotification.className = 'notification show success';
        } else if (type === 'error') {
            toastIcon.textContent = '❌';
            toastNotification.className = 'notification show error';
        } else {
            toastIcon.textContent = 'ℹ️';
            toastNotification.className = 'notification show';
        }
        
        setTimeout(() => {
            toastNotification.classList.remove('show');
        }, 3000);
    }

    // --- 3. VIEW ROUTER ---
    function showView(viewName) {
        // Hide all views
        loginView.style.display = 'none';
        dashboardView.style.display = 'none';
        evaluationView.style.display = 'none';
        adminView.style.display = 'none';

        if (viewName === 'login') {
            loginView.style.display = 'flex';
            appHeader.style.display = 'none';
        } else {
            appHeader.style.display = 'flex';
            if (viewName === 'dashboard') {
                dashboardView.style.display = 'block';
                btnBackHeader.style.display = 'none';
                renderDashboard();
            } else if (viewName === 'evaluation') {
                evaluationView.style.display = 'block';
                btnBackHeader.style.display = 'inline-flex';
            } else if (viewName === 'admin') {
                adminView.style.display = 'block';
                btnBackHeader.style.display = 'inline-flex';
                renderAdminPanel();
            }
        }
        window.scrollTo(0, 0);
    }

    // --- 4. AUTHENTICATION & LOGIN WORKFLOW ---
    // Handle Auto-complete email suggestions
    emailInput.addEventListener('input', (e) => {
        const query = e.target.value.trim().toLowerCase();
        if (!query) {
            emailSuggestions.style.display = 'none';
            return;
        }

        // Find unique emails and names in DB.participants, manager emails, peer emails, and admin email
        const usersMap = new Map();
        
        // Add Admin email
        usersMap.set('admin@bafs.co.th', { name: 'BAFS HOD Admin', email: 'admin@bafs.co.th' });

        // Add Participants, Managers, and Peers
        DB.participants.forEach(p => {
            if (p.email) {
                const pEmail = p.email.trim().toLowerCase();
                usersMap.set(pEmail, { name: p.name, email: pEmail });
            }
            if (p.manager && p.manager.email && p.manager.email.trim()) {
                const mgrEmail = p.manager.email.trim().toLowerCase();
                if (!usersMap.has(mgrEmail)) {
                    usersMap.set(mgrEmail, { name: p.manager.name, email: mgrEmail });
                }
            }
            if (p.peers) {
                p.peers.forEach(peer => {
                    if (peer.email && peer.email.trim()) {
                        const peerEmail = peer.email.trim().toLowerCase();
                        if (!usersMap.has(peerEmail)) {
                            usersMap.set(peerEmail, { name: peer.name, email: peerEmail });
                        }
                    }
                });
            }
        });

        const users = Array.from(usersMap.values());
        const filtered = users.filter(u => u.email.includes(query) || u.name.toLowerCase().includes(query)).slice(0, 5);

        if (filtered.length > 0) {
            emailSuggestions.innerHTML = '';
            filtered.forEach(u => {
                const item = document.createElement('div');
                item.className = 'suggestion-item';
                item.innerHTML = `<strong>${u.name}</strong> <span class="email-sub">${u.email}</span>`;
                item.addEventListener('click', () => {
                    emailInput.value = u.email;
                    emailSuggestions.style.display = 'none';
                });
                emailSuggestions.appendChild(item);
            });
            emailSuggestions.style.display = 'block';
        } else {
            emailSuggestions.style.display = 'none';
        }
    });

    // Close suggestions list when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.form-group')) {
            emailSuggestions.style.display = 'none';
        }
    });

    // Form submission
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = emailInput.value.trim().toLowerCase();
        handleLogin(email);
    });

    // Admin login link
    const linkAdminLogin = document.getElementById('link-admin-login');
    if (linkAdminLogin) {
        linkAdminLogin.addEventListener('click', (e) => {
            e.preventDefault();
            handleLogin('admin@bafs.co.th');
        });
    }

    // Quick login buttons
    document.querySelectorAll('.quick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const email = btn.getAttribute('data-email');
            handleLogin(email);
        });
    });

    function handleLogin(email) {
        if (email === 'admin@bafs.co.th') {
            modalAdminPassword.classList.add('show');
            adminPasswordInput.value = '';
            setTimeout(() => {
                adminPasswordInput.focus();
            }, 100);
            return;
        }

        // Search for user in participants
        const participant = DB.participants.find(p => p.email === email);
        
        // Search in managers
        let isManager = false;
        let managerName = '';
        DB.participants.forEach(p => {
            if (p.manager && p.manager.email === email) {
                isManager = true;
                managerName = p.manager.name;
            }
        });

        // Search in peers
        let isPeer = false;
        let peerName = '';
        DB.participants.forEach(p => {
            p.peers.forEach(peer => {
                if (peer.email === email) {
                    isPeer = true;
                    peerName = peer.name;
                }
            });
        });

        if (participant) {
            currentUser = {
                name: participant.name,
                email: email,
                role: 'Participant'
            };
        } else if (isManager) {
            currentUser = {
                name: managerName,
                email: email,
                role: 'Manager'
            };
        } else if (isPeer) {
            currentUser = {
                name: peerName,
                email: email,
                role: 'Peer'
            };
        } else {
            showToast('ไม่พบที่อยู่อีเมลนี้ในระบบการประเมิน', 'error');
            return;
        }

        // Set header badges
        currentUserName.textContent = currentUser.name;
        currentUserRole.textContent = currentUser.role;
        btnAdminToggle.style.display = 'none'; // hide admin panel from normal users

        showToast(`ยินดีต้อนรับ คุณ ${currentUser.name}`, 'success');
        syncDatabaseWithGoogleSheets();
        showView('dashboard');
    }

    btnLogout.addEventListener('click', () => {
        currentUser = null;
        emailInput.value = '';
        showToast('ออกจากระบบเรียบร้อยแล้ว', 'info');
        showView('login');
    });

    btnAdminToggle.addEventListener('click', () => {
        showView('admin');
    });

    btnAdminBack.addEventListener('click', () => {
        showView('dashboard');
    });

    btnBackHeader.addEventListener('click', () => {
        if (evaluationView.style.display === 'block') {
            btnFormCancel.click();
        } else if (adminView.style.display === 'block') {
            btnAdminBack.click();
        }
    });

    function submitAdminPassword() {
        const password = adminPasswordInput.value;
        if (password === 'HOD2026') {
            currentUser = {
                name: 'BAFS HOD Admin',
                email: 'admin@bafs.co.th',
                role: 'Admin'
            };
            btnAdminToggle.style.display = 'inline-flex';
            currentUserName.textContent = currentUser.name;
            currentUserRole.textContent = 'Administrator';
            showToast('เข้าสู่ระบบในฐานะผู้ดูแลระบบสำเร็จ', 'success');
            syncDatabaseWithGoogleSheets();
            modalAdminPassword.classList.remove('show');
            adminPasswordInput.value = '';
            showView('admin');
        } else {
            showToast('รหัสผ่านผู้ดูแลระบบไม่ถูกต้อง!', 'error');
            adminPasswordInput.focus();
            adminPasswordInput.select();
        }
    }

    btnAdminPassConfirm.addEventListener('click', submitAdminPassword);

    adminPasswordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            submitAdminPassword();
        }
    });

    btnAdminPassCancel.addEventListener('click', () => {
        modalAdminPassword.classList.remove('show');
        adminPasswordInput.value = '';
    });

    // --- 5. RENDER USER DASHBOARD ---
    function renderDashboard() {
        if (!currentUser) return;

        greetingTitle.textContent = `สวัสดีครับ คุณ ${currentUser.name}`;
        selfTaskContainer.innerHTML = '';
        otherTasksContainer.innerHTML = '';

        // Find evaluations matching current user as evaluator
        const myTasks = evaluations.filter(ev => ev.evaluatorEmail === currentUser.email);
        
        const selfTasks = myTasks.filter(ev => ev.role === 'Self');
        const otherTasks = myTasks.filter(ev => ev.role !== 'Self');

        otherTasksCount.textContent = `${otherTasks.length} งาน`;

        // Render Self Assessment Task card
        if (selfTasks.length > 0) {
            selfTasks.forEach(task => {
                const card = createTaskCard(task);
                selfTaskContainer.appendChild(card);
            });
        } else {
            selfTaskContainer.innerHTML = `
                <div class="task-item" style="justify-content: center; border-style: dashed; opacity: 0.7;">
                    <p style="color: var(--color-text-muted);">คุณไม่อยู่ในกลุ่มพนักงานที่ต้องทำการประเมินตนเอง (Self)</p>
                </div>`;
        }

        // Render Manager & Peer Tasks cards
        if (otherTasks.length > 0) {
            otherTasks.forEach(task => {
                const card = createTaskCard(task);
                otherTasksContainer.appendChild(card);
            });
        } else {
            otherTasksContainer.innerHTML = `
                <div class="task-item" style="justify-content: center; border-style: dashed; opacity: 0.7;">
                    <p style="color: var(--color-text-muted);">ไม่มีพนักงานท่านอื่นที่คุณได้รับมอบหมายให้เข้าประเมิน</p>
                </div>`;
        }
    }

    function createTaskCard(task) {
        const item = document.createElement('div');
        item.className = 'task-item animate-fade-in';

        const statusClass = task.status === 'Completed' ? 'status-completed' : 'status-pending';
        const statusLabel = task.status === 'Completed' ? 'Complete' : 'Incomplete';
        const roleLabel = task.role === 'Self' ? '🙋 ประเมินตนเอง' : (task.role === 'Manager' ? '💼 หัวหน้างานประเมิน' : '🤝 เพื่อนร่วมงานประเมิน');
        
        // Count answered questions
        const answeredCount = Object.keys(task.answers).length;
        const progressPercent = Math.round((answeredCount / DB.questions.length) * 100);

        item.innerHTML = `
            <div class="task-info">
                <h4>${task.targetName}</h4>
                <p>${roleLabel} • ความคืบหน้า ${answeredCount}/${DB.questions.length} ข้อ (${progressPercent}%)</p>
            </div>
            <div class="task-status">
                <span class="status-indicator ${statusClass}">${statusLabel}</span>
                <button class="btn btn-primary btn-sm" ${task.status === 'Completed' ? 'style="opacity: 0.5; pointer-events: none;"' : ''}>
                    ${task.status === 'Completed' ? 'เสร็จสิ้น' : 'เริ่มทำ'}
                </button>
            </div>
        `;

        // Trigger evaluation form on button click
        const btn = item.querySelector('button');
        btn.addEventListener('click', () => {
            if (task.status !== 'Completed') {
                openEvaluationForm(task);
            }
        });

        return item;
    }

    // --- 6. RENDER EVALUATION FORM ---
    function openEvaluationForm(task) {
        activeEvaluation = task;
        
        formMetaTargetName.textContent = task.targetName;
        formMetaTargetRole.textContent = task.role === 'Self' ? 'ประเมินตนเอง (Self)' : (task.role === 'Manager' ? 'หัวหน้างาน (Direct boss)' : 'เพื่อนร่วมงาน (Peer)');
        
        // Update title text
        formTargetTitle.textContent = `กำลังทำแบบประเมิน: ${task.targetName}`;
        
        commentInput.value = task.comment || '';
        renderQuestions();
        updateFormProgress();
        showView('evaluation');
    }

    function renderQuestions() {
        questionsContainer.innerHTML = '';

        // Group questions by category
        const categories = {};
        DB.questions.forEach(q => {
            if (!categories[q.category]) {
                categories[q.category] = [];
            }
            categories[q.category].push(q);
        });

        // Loop categories and render
        const categoryEmojis = {
            "การฟังอย่างมีประสิทธิภาพ": "👂",
            "ทักษะการสื่อสาร": "🗣️",
            "ทักษะการให้ Feedback": "💬",
            "ทักษะการมอบหมายงานและการมอบอำนาจ": "📋",
            "ทักษะการสร้างแรงจูงใจให้ทีมงาน": "🤝",
            "ทักษะการสอนงาน": "👨‍🏫"
        };

        let catIndex = 1;
        for (const catName in categories) {
            const catCard = document.createElement('div');
            catCard.className = 'category-card animate-fade-in';
            const emoji = categoryEmojis[catName] || "📝";
            catCard.innerHTML = `
                <div class="category-header">
                    <span style="background: var(--color-primary); color: white; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 14px;">${catIndex}</span>
                    ${emoji} ${catName}
                </div>
                <div class="category-body"></div>
            `;
            const body = catCard.querySelector('.category-body');
            
            categories[catName].forEach(q => {
                const qRow = document.createElement('div');
                const savedVal = activeEvaluation.answers[q.id];
                qRow.className = `question-row${savedVal ? ' answered' : ''}`;
                
                // Get active value

                qRow.innerHTML = `
                    <div class="question-text"><span>ข้อ ${q.id}.</span>${q.text}</div>
                    <div class="rating-scale" data-qid="${q.id}">
                        <div class="rating-option">
                            <button type="button" class="rating-btn ${savedVal === '5' ? 'active' : ''}" data-value="5">
                                <span class="rating-badge">05</span>
                                <span class="rating-icon">😃</span>
                            </button>
                            <span class="rating-label">ทำเป็นประจำ</span>
                        </div>
                        <div class="rating-option">
                            <button type="button" class="rating-btn ${savedVal === '4' ? 'active' : ''}" data-value="4">
                                <span class="rating-badge">04</span>
                                <span class="rating-icon">🙂</span>
                            </button>
                            <span class="rating-label">ทำบ่อยครั้ง</span>
                        </div>
                        <div class="rating-option">
                            <button type="button" class="rating-btn ${savedVal === '3' ? 'active' : ''}" data-value="3">
                                <span class="rating-badge">03</span>
                                <span class="rating-icon">😐</span>
                            </button>
                            <span class="rating-label">ทำบางครั้ง</span>
                        </div>
                        <div class="rating-option">
                            <button type="button" class="rating-btn ${savedVal === '2' ? 'active' : ''}" data-value="2">
                                <span class="rating-badge">02</span>
                                <span class="rating-icon">🙁</span>
                            </button>
                            <span class="rating-label">ทำน้อยครั้ง</span>
                        </div>
                        <div class="rating-option">
                            <button type="button" class="rating-btn ${savedVal === '1' ? 'active' : ''}" data-value="1">
                                <span class="rating-badge">01</span>
                                <span class="rating-icon">☹️</span>
                            </button>
                            <span class="rating-label">ไม่เคยทำ</span>
                        </div>
                        <div class="rating-option">
                            <button type="button" class="rating-btn ${savedVal === 'N/A' ? 'active' : ''}" data-value="N/A">
                                <span class="rating-badge">N/A</span>
                                <span class="rating-icon"><span class="na-icon-circle">N/A</span></span>
                            </button>
                            <span class="rating-label">ระบุไม่ได้</span>
                        </div>
                    </div>
                `;

                // Add rating click handlers
                qRow.querySelectorAll('.rating-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const val = btn.getAttribute('data-value');
                        const scale = btn.closest('.rating-scale');
                        const qid = scale.getAttribute('data-qid');
                        
                        // Clear active on siblings
                        scale.querySelectorAll('.rating-btn').forEach(b => b.classList.remove('active'));
                        
                        // Set active
                        btn.classList.add('active');
                        
                        // Save in state
                        activeEvaluation.answers[qid] = val;
                        if (activeEvaluation.status === 'Pending') {
                            activeEvaluation.status = 'In Progress';
                        }
                        
                        qRow.classList.add('answered');
                        updateFormProgress();
                    });
                });

                body.appendChild(qRow);
            });

            questionsContainer.appendChild(catCard);
            catIndex++;
        }
    }

    function updateFormProgress() {
        const total = DB.questions.length;
        const count = Object.keys(activeEvaluation.answers).length;
        formMetaProgress.textContent = `${count}/${total} ข้อ`;
        if (formProgressBarFill) {
            const percent = Math.round((count / total) * 100);
            formProgressBarFill.style.width = `${percent}%`;
        }
    }

    // Cancel form
    btnFormCancel.addEventListener('click', () => {
        activeEvaluation = null;
        showView('dashboard');
    });

    // Save Draft
    btnFormSave.addEventListener('click', () => {
        if (!activeEvaluation) return;
        
        activeEvaluation.comment = commentInput.value;
        saveDatabase();
        showToast('บันทึกร่างข้อมูลเรียบร้อยแล้ว', 'success');
        showView('dashboard');
    });

    // Submit Form (Validation and Modal Trigger)
    evaluationForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        // Validate that all questions are answered
        const total = DB.questions.length;
        const answered = Object.keys(activeEvaluation.answers).length;
        
        if (answered < total) {
            showToast(`คุณตอบคำถามไปเพียง ${answered}/${total} ข้อ กรุณาตอบให้ครบทุกข้อก่อนการส่งผล`, 'error');
            return;
        }

        // Show Confirmation Modal
        modalConfirm.className = 'modal-overlay show';
    });

    // Modal Cancel
    btnModalCancel.addEventListener('click', () => {
        modalConfirm.classList.remove('show');
    });

    // Modal Confirm Submission
    btnModalConfirm.addEventListener('click', () => {
        modalConfirm.classList.remove('show');
        
        activeEvaluation.status = 'Completed';
        activeEvaluation.comment = commentInput.value;
        activeEvaluation.submittedAt = new Date().toISOString();
        
        saveDatabase();
        showToast('ส่งผลการประเมินสำเร็จเรียบร้อยแล้ว', 'success');

        // ส่งข้อมูลไปยัง Google Sheets API หากตั้งค่า URL ไว้
        if (GOOGLE_SCRIPT_API_URL) {
            const payload = {
                targetEmail: activeEvaluation.targetEmail,
                targetName: activeEvaluation.targetName || "",
                evaluatorEmail: activeEvaluation.evaluatorEmail,
                evaluatorName: activeEvaluation.evaluatorName || "",
                role: activeEvaluation.role,
                answers: activeEvaluation.answers,
                comment: activeEvaluation.comment
            };

            showToast('กำลังบันทึกข้อมูลไปยัง Google Sheets...', 'info');

            fetch(GOOGLE_SCRIPT_API_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            })
            .then(() => {
                showToast('บันทึกลง Google Sheets เรียบร้อยแล้ว', 'success');
            })
            .catch(err => {
                console.error('API Error:', err);
                showToast('ส่งข้อมูลไปยัง Google Sheets ล้มเหลว แต่บันทึกในเครื่องแล้ว', 'error');
            });
        }
        
        activeEvaluation = null;
        showView('dashboard');
    });


    // --- 7. ADMIN DASHBOARD PANEL ---
    function renderAdminPanel() {
        // Stats calculations
        const totalTargets = evaluations.length;
        const completedCount = evaluations.filter(ev => ev.status === 'Completed').length;
        const rate = totalTargets > 0 ? Math.round((completedCount / totalTargets) * 100) : 0;

        adminStatTotalTargets.textContent = `${totalTargets} แบบ`;
        adminStatCompleted.textContent = `${completedCount} แบบ`;
        adminStatRate.textContent = `${rate}%`;

        // Reset search/filter inputs when entering admin panel
        adminSearch.value = '';
        adminStatusFilter.value = 'all';

        // Render Table Rows
        filterAdminTable('', 'all');
    }

    // Live search and status filtering in Admin Panel
    function applyAdminFilters() {
        const query = adminSearch.value.trim().toLowerCase();
        const statusVal = adminStatusFilter.value;
        filterAdminTable(query, statusVal);
    }

    adminSearch.addEventListener('input', applyAdminFilters);
    adminStatusFilter.addEventListener('change', applyAdminFilters);

    function filterAdminTable(query = '', statusVal = 'all') {
        adminTableBody.innerHTML = '';
        
        // Loop through 29 participants
        DB.participants.forEach((p, idx) => {
            if (query && !p.name.toLowerCase().includes(query) && !p.email.toLowerCase().includes(query)) {
                return;
            }

            // Find evaluations for this target participant
            const pEvals = evaluations.filter(ev => ev.targetEmail === p.email);
            const totalRequired = pEvals.length;
            const completedRequired = pEvals.filter(ev => ev.status === 'Completed').length;
            const userProgressPercent = Math.round((completedRequired / totalRequired) * 100);

            // Filter by overall status
            const isComplete = userProgressPercent === 100;
            if (statusVal === 'complete' && !isComplete) {
                return;
            }
            if (statusVal === 'incomplete' && isComplete) {
                return;
            }
            
            const selfEval = pEvals.find(ev => ev.role === 'Self');
            const managerEval = pEvals.find(ev => ev.role === 'Manager');
            const peerEvals = pEvals.filter(ev => ev.role === 'Peer');

            const selfStatus = selfEval ? selfEval.status : 'N/A';
            const managerStatus = managerEval ? managerEval.status : 'N/A';

            // Helper for individual cell status with reset button
            function getStatusHtml(evalData, labelName) {
                if (!evalData) return '<span style="font-size: 11px; color: var(--color-text-muted); font-style: italic;">N/A</span>';
                
                const isComp = evalData.status === 'Completed';
                return `
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <span class="status-indicator ${isComp ? 'status-completed' : 'status-pending'}">
                            ${isComp ? 'Complete' : 'Incomplete'}
                        </span>
                        ${isComp ? `
                        <button class="btn-reset-task" data-id="${evalData.id}" title="ลบข้อมูลเฉพาะส่วนนี้" style="background: none; border: none; color: #dc2626; cursor: pointer; font-size: 10px; display: flex; align-items: center; gap: 3px; padding: 2px 0; opacity: 0.7;">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            ล้างข้อมูล
                        </button>` : ''}
                    </div>
                `;
            }

            // Calculate Peer 1, 2, 3 statuses
            const peersHtml = [];
            for (let i = 0; i < 3; i++) {
                const peer = p.peers && p.peers[i];
                if (peer) {
                    const peerEval = peerEvals.find(ev => ev.evaluatorEmail === peer.email);
                    peersHtml.push(`
                        <td>
                            <div style="font-weight: 500;">${peer.name}</div>
                            <div style="font-size: 11px; color: var(--color-text-muted); margin-bottom: 6px; word-break: break-all;">${peer.email}</div>
                            ${getStatusHtml(peerEval, 'Peer')}
                        </td>
                    `);
                } else {
                    peersHtml.push(`
                        <td style="color: var(--color-text-muted); font-style: italic; text-align: center; vertical-align: middle;">-</td>
                    `);
                }
            }

            const row = document.createElement('tr');
            row.innerHTML = `
                <td style="text-align: center; font-weight: 600; vertical-align: middle;">${idx + 1}</td>
                <td>
                    <div style="font-weight: 600; font-size: 15px;">${p.name}</div>
                    <div style="font-size: 11px; color: var(--color-text-muted); margin-bottom: 6px; word-break: break-all;">${p.email}</div>
                    ${getStatusHtml(selfEval, 'Self')}
                </td>
                <td>
                    <div style="font-weight: 500;">${p.manager && p.manager.name ? p.manager.name : '-'}</div>
                    <div style="font-size: 11px; color: var(--color-text-muted); margin-bottom: 6px; word-break: break-all;">${p.manager && p.manager.email ? p.manager.email : '-'}</div>
                    ${p.manager && p.manager.email ? getStatusHtml(managerEval, 'Manager') : `<span style="font-size: 11px; color: var(--color-text-muted); font-style: italic;">ไม่มีระบบประเมิน</span>`}
                </td>
                ${peersHtml[0]}
                ${peersHtml[1]}
                ${peersHtml[2]}
                <td style="text-align: center; vertical-align: middle;">
                    <div class="progress-mini-bar" style="margin-bottom: 4px; width: 100%;">
                        <div class="progress-mini-fill progress-fill-manager" style="width: ${userProgressPercent}%;"></div>
                    </div>
                    <div style="font-size: 13px; font-weight: 700;">${userProgressPercent}%</div>
                    <div style="font-size: 10px; color: var(--color-text-muted);">${completedRequired}/${totalRequired} เสร็จสิ้น</div>
                </td>
                <td style="text-align: center; vertical-align: middle;">
                    <div style="display: flex; flex-direction: column; gap: 8px; align-items: center;">
                        <button class="btn btn-primary btn-sm btn-download-report" data-email="${p.email}" style="padding: 6px 12px; font-size: 11px; border-radius: 6px; background: linear-gradient(135deg, #ffa801 0%, #ff8533 100%); border: none; cursor: pointer; color: white; width: 80px;">
                            📄 PDF
                        </button>
                        <button class="btn btn-secondary btn-sm btn-reset-row" data-email="${p.email}" style="padding: 4px 8px; font-size: 10px; border-radius: 6px; color: #dc2626; border: 1px solid rgba(220, 38, 38, 0.2); background: none; cursor: pointer; width: 80px; display: flex; align-items: center; justify-content: center; gap: 4px;">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            Reset แถว
                        </button>
                    </div>
                </td>
            `;

            // Individual task resets
            row.querySelectorAll('.btn-reset-task').forEach(btn => {
                btn.addEventListener('click', () => {
                    const evalId = btn.getAttribute('data-id');
                    const ev = evaluations.find(e => e.id === evalId);
                    if (ev && confirm(`คุณต้องการล้างข้อมูลที่ ${ev.evaluatorName} ประเมินให้ ${ev.targetName} ใช่หรือไม่?`)) {
                        
                        // Sync with Google Sheets if possible
                        if (GOOGLE_SCRIPT_API_URL) {
                            fetch(GOOGLE_SCRIPT_API_URL, {
                                method: 'POST',
                                mode: 'no-cors',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    action: 'reset_task',
                                    targetEmail: ev.targetEmail,
                                    evaluatorEmail: ev.evaluatorEmail,
                                    role: ev.role
                                })
                            });
                        }

                        ev.status = 'Pending';
                        ev.answers = {};
                        ev.comment = '';
                        ev.submittedAt = null;
                        saveDatabase();
                        renderAdminPanel();
                        showToast('ล้างข้อมูลการประเมินรายบุคคลเรียบร้อยแล้ว', 'info');
                    }
                });
            });

            // Whole row reset
            row.querySelector('.btn-reset-row').addEventListener('click', () => {
                const email = p.email;
                if (confirm(`คุณต้องการลบข้อมูลการประเมินทั้งหมด (ทั้ง Self, Manager, Peer) ของคุณ ${p.name} ใช่หรือไม่?`)) {
                    
                    // Sync with Google Sheets if possible
                    if (GOOGLE_SCRIPT_API_URL) {
                        fetch(GOOGLE_SCRIPT_API_URL, {
                            method: 'POST',
                            mode: 'no-cors',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                action: 'reset_row',
                                targetEmail: email
                            })
                        });
                    }

                    evaluations.forEach(ev => {
                        if (ev.targetEmail.trim().toLowerCase() === email.trim().toLowerCase()) {
                            ev.status = 'Pending';
                            ev.answers = {};
                            ev.comment = '';
                            ev.submittedAt = null;
                        }
                    });
                    saveDatabase();
                    renderAdminPanel();
                    showToast(`ล้างข้อมูลพนักงาน ${p.name} ทั้งแถวเรียบร้อยแล้ว`, 'info');
                }
            });

            const btnReport = row.querySelector('.btn-download-report');
            btnReport.addEventListener('click', () => {
                generatePDFReport(p.email);
            });

            adminTableBody.appendChild(row);
        });
    }



    // Export raw data responses to CSV
    btnAdminExportRawCsv.addEventListener('click', () => {
        let csvContent = "\uFEFF"; // UTF-8 BOM for Thai characters in Excel
        
        // Headers: Who evaluated whom and detailed scores
        let headerRow = "ผู้ประเมิน,อีเมลผู้ประเมิน,บทบาทผู้ประเมิน,ผู้ถูกประเมิน,อีเมลผู้ถูกประเมิน,สถานะการประเมิน";
        for (let i = 1; i <= DB.questions.length; i++) {
            headerRow += `,ข้อที่ ${i}`;
        }
        headerRow += ",ความคิดเห็นเพิ่มเติม,วันที่ส่งประเมิน\n";
        csvContent += headerRow;
        
        // Rows
        evaluations.forEach(ev => {
            // Translate role to Thai
            let roleThai = ev.role;
            if (ev.role === 'Self') {
                roleThai = 'ตนเอง';
            } else if (ev.role === 'Manager') {
                roleThai = 'หัวหน้างาน';
            } else if (ev.role === 'Peer') {
                roleThai = 'เพื่อนร่วมงาน';
            }
            
            // Translate status to Thai
            let statusThai = ev.status === 'Completed' ? 'Complete' : 'Incomplete';
            
            // Row metadata
            let row = `"${ev.evaluatorName}","${ev.evaluatorEmail}","${roleThai}","${ev.targetName}","${ev.targetEmail}","${statusThai}"`;
            
            // Scores (1-19)
            for (let i = 1; i <= DB.questions.length; i++) {
                let score = "";
                if (ev.status === 'Completed') {
                    score = ev.answers[i] !== undefined ? ev.answers[i] : "";
                }
                row += `,"${score}"`;
            }
            
            // Escape comment
            let commentEscaped = ev.comment ? ev.comment.replace(/"/g, '""').replace(/\r?\n/g, ' ') : '';
            row += `,"${commentEscaped}"`;
            
            // Date
            let dateStr = ev.submittedAt ? ev.submittedAt : '-';
            row += `,"${dateStr}"`;
            
            csvContent += row + "\n";
        });
        
        // Trigger download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', '180_Smart_Communication_Raw_Data.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showToast('ส่งออกข้อมูลดิบ (.csv) เรียบร้อยแล้ว สามารถนำไปเปิดใน Excel ได้ทันที', 'success');
    });

    function generatePDFReport(targetEmail) {
        const cleanEmail = targetEmail.trim().toLowerCase();
        const p = DB.participants.find(x => x.email.trim().toLowerCase() === cleanEmail);
        if (!p) {
            showToast("ไม่พบข้อมูลผู้เข้าร่วมประเมิน", "error");
            return;
        }

        const pEvals = evaluations.filter(ev => ev.targetEmail.trim().toLowerCase() === cleanEmail);
        const selfEval = pEvals.find(ev => ev.role === 'Self');
        const managerEval = pEvals.find(ev => ev.role === 'Manager');
        const peerEvals = pEvals.filter(ev => ev.role === 'Peer');
        const feedbackEvals = pEvals.filter(ev => ev.role !== 'Self' && ev.status === 'Completed');

        // Helper to get question average from completed feedback evaluations
        function getQuestionAverage(qId, evalsList) {
            let sum = 0;
            let count = 0;
            evalsList.forEach(ev => {
                const val = ev.answers[qId];
                if (val !== undefined && val !== null && val !== "N/A" && val !== "") {
                    sum += Number(val);
                    count++;
                }
            });
            return count > 0 ? (sum / count) : null;
        }

        // Competency to Questions Map
        const categoriesMap = {
            "การฟังอย่างมีประสิทธิภาพ": {
                desc: "ฟังอย่างตั้งใจ ไม่ขัดจังหวะ จับประเด็นสำคัญและทำความเข้าใจความรู้สึกผู้พูด",
                qIds: [1, 2, 3]
            },
            "ทักษะการสื่อสาร": {
                desc: "สื่อสารตรงประเด็น เป็นขั้นตอน สร้างบรรยากาศเป็นกันเองและเปิดกว้างในการพูดคุย",
                qIds: [4, 5, 6, 7]
            },
            "ทักษะการให้ Feedback": {
                desc: "ให้ข้อมูลสะท้อนกลับเพื่อการพัฒนาอย่างชัดเจน ตรงเวลา และเป็นประโยชน์ต่อทีมงาน",
                qIds: [8, 9, 10]
            },
            "ทักษะการมอบหมายงานและการมอบอำนาจ": {
                desc: "สื่อสารรายละเอียดของงานอย่างครบถ้วน มอบหมายงานเหมาะสม และสนับสนุนติดตามผลอย่างเป็นระบบ",
                qIds: [11, 12, 13]
            },
            "ทักษะการสร้างแรงจูงใจให้ทีมงาน": {
                desc: "แสดงทัศนคติเชิงบวก สร้างบรรยากาศที่กระตุ้นแรงจูงใจ และเห็นคุณค่าความตั้งใจของทีมงาน",
                qIds: [14, 15, 16]
            },
            "ทักษะการสอนงาน": {
                desc: "ถ่ายทอดความรู้อย่างเข้าใจง่าย ปรับเปลี่ยนสไตล์การสอนให้สอดคล้องกับพนักงานแต่ละบุคคล",
                qIds: [17, 18, 19]
            }
        };

        // Calculations
        let overallSelfSum = 0, overallSelfCount = 0;
        let overallFbSum = 0, overallFbCount = 0;
        
        for (let i = 1; i <= 19; i++) {
            const sVal = selfEval && selfEval.status === 'Completed' ? selfEval.answers[i] : null;
            if (sVal !== undefined && sVal !== null && sVal !== "N/A" && sVal !== "") {
                overallSelfSum += Number(sVal);
                overallSelfCount++;
            }
            const fVal = getQuestionAverage(i, feedbackEvals);
            if (fVal !== null) {
                overallFbSum += fVal;
                overallFbCount++;
            }
        }
        const overallSelfScore = overallSelfCount > 0 ? (overallSelfSum / overallSelfCount) : null;
        const overallFbScore = overallFbCount > 0 ? (overallFbSum / overallFbCount) : null;

        // Categories HTML Builder (6 Categories in a 2-Column Grid of Horizontal Bars)
        let barsHtml = '<div class="competency-grid">';
        const categoryScores = [];

        for (const catName in categoriesMap) {
            const catInfo = categoriesMap[catName];
            const qIds = catInfo.qIds;
            
            // Calculate Self Category Score
            let selfSum = 0, selfCount = 0;
            qIds.forEach(qId => {
                const val = selfEval && selfEval.status === 'Completed' ? selfEval.answers[qId] : null;
                if (val !== undefined && val !== null && val !== "N/A" && val !== "") {
                    selfSum += Number(val);
                    selfCount++;
                }
            });
            const selfCatScore = selfCount > 0 ? (selfSum / selfCount) : null;

            // Calculate Feedback Category Score
            let fbSum = 0, fbCount = 0;
            qIds.forEach(qId => {
                const val = getQuestionAverage(qId, feedbackEvals);
                if (val !== null) {
                    fbSum += val;
                    fbCount++;
                }
            });
            const fbCatScore = fbCount > 0 ? (fbSum / fbCount) : null;

            categoryScores.push({ name: catName, selfScore: selfCatScore, feedbackScore: fbCatScore });

            const selfPct = selfCatScore ? (selfCatScore / 5) * 100 : 0;
            const fbPct = fbCatScore ? (fbCatScore / 5) * 100 : 0;

            // Get sub-topic questions for this category
            const qListHtml = qIds.map(id => {
                const q = DB.questions.find(q => q.id === id);
                return q ? `<li class="comp-question-item">${q.text}</li>` : '';
            }).join('');

            barsHtml += `
                <div class="competency-item">
                    <div class="competency-name">${catName}</div>
                    <ul class="comp-questions">
                        ${qListHtml}
                    </ul>
                    <div class="bar-group">
                        <div class="bar-row">
                            <span class="bar-tag">Self</span>
                            <div class="bar-track"><div class="bar-fill self-gradient" style="width: ${selfPct}%"></div></div>
                            <span class="bar-score">${selfCatScore ? selfCatScore.toFixed(2) : 'N/A'}</span>
                        </div>
                        <div class="bar-row">
                            <span class="bar-tag">Feedbk</span>
                            <div class="bar-track"><div class="bar-fill feedback-gradient" style="width: ${fbPct}%"></div></div>
                            <span class="bar-score">${fbCatScore ? fbCatScore.toFixed(2) : 'N/A'}</span>
                        </div>
                    </div>
                </div>
            `;
        }
        barsHtml += '</div>';

        // Calculate Strengths and Opportunities lists
        const strengthsList = [];
        const opportunitiesList = [];

        categoryScores.forEach(cat => {
            if (cat.feedbackScore !== null) {
                if (cat.feedbackScore >= 4.0) strengthsList.push(cat);
                else opportunitiesList.push(cat);
            }
        });
        
        strengthsList.sort((a, b) => b.feedbackScore - a.feedbackScore);
        opportunitiesList.sort((a, b) => a.feedbackScore - b.feedbackScore);

        let strengthsHtml = strengthsList.length > 0 ? strengthsList.map(item => `
            <div class="info-list-item">
                <span class="info-item-text">${item.name}</span>
                <span class="info-item-score-circle circle-green">${item.feedbackScore.toFixed(2)}</span>
            </div>`).join('') : `<div class="no-items-text">ไม่มีทักษะที่สูงกว่า 4.00</div>`;

        let opportunitiesHtml = opportunitiesList.length > 0 ? opportunitiesList.map(item => `
            <div class="info-list-item">
                <span class="info-item-text">${item.name}</span>
                <span class="info-item-score-circle circle-pink">${item.feedbackScore.toFixed(2)}</span>
            </div>`).join('') : `<div class="no-items-text">ไม่มีทักษะที่ต่ำกว่า 4.00</div>`;

        // Comments consolidation
        const selfComment = selfEval && selfEval.status === 'Completed' && selfEval.comment ? selfEval.comment : "";
        const managerComment = managerEval && managerEval.status === 'Completed' && managerEval.comment ? managerEval.comment : "";
        const peerComments = peerEvals.filter(ev => ev.status === 'Completed' && ev.comment).map(ev => ev.comment);

        let commentsHtml = `<div class="comments-grid">`;
        if (selfComment) commentsHtml += `
            <div class="comment-card comment-card-self">
                <div class="comment-card-header">ความเห็นตนเอง</div>
                <div class="comment-card-body">${selfComment}</div>
            </div>`;
        if (managerComment) commentsHtml += `
            <div class="comment-card comment-card-manager">
                <div class="comment-card-header">ความเห็นหัวหน้างาน</div>
                <div class="comment-card-body">${managerComment}</div>
            </div>`;
        if (peerComments.length > 0) commentsHtml += `
            <div class="comment-card comment-card-peer" style="grid-column: span ${ (selfComment || managerComment) ? 1 : 3 };">
                <div class="comment-card-header">ความเห็นเพื่อนร่วมงาน</div>
                <div class="comment-card-body">${peerComments.join(" | ")}</div>
            </div>`;
        commentsHtml += `</div>`;

        if (!selfComment && !managerComment && peerComments.length === 0) {
            commentsHtml = `<div class="no-items-text" style="text-align: center;">- ไม่มีข้อเสนอแนะเพิ่มเติม -</div>`;
        }

        const printWindow = window.open("", "_blank");
        printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="th">
        <head>
            <meta charset="UTF-8">
            <title>รายงานผล 180 องศา - ${p.name}</title>
            <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700;800&family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                @page { size: A4; margin: 0.8cm 1.0cm; }
                body { font-family: 'Sarabun', sans-serif; color: #1e293b; background: #fff; line-height: 1.3; font-size: 10px; }
                .header { text-align: center; padding: 15px; margin-bottom: 12px; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-radius: 12px; border: 1px solid #e2e8f0; position: relative; }
                .header::after { content: ""; position: absolute; top: 0; right: 0; width: 100px; height: 100px; background: radial-gradient(circle, #cbd5e1 1px, transparent 1px); background-size: 8px 8px; opacity: 0.2; }
                .header h1 { font-size: 18px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }
                .info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 10px 0; padding: 8px; background: #fff; border-radius: 8px; }
                .info-item { display: flex; flex-direction: column; font-size: 9px; }
                .info-item span { color: #64748b; font-weight: 700; text-transform: uppercase; font-size: 7px; margin-bottom: 2px; }
                .metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
                .metric-card { padding: 10px 15px; border-radius: 10px; color: #fff; }
                .metric-card-self { background: linear-gradient(135deg, #ff9f43, #ff6b6b); }
                .metric-card-feedback { background: linear-gradient(135deg, #4b6cb7, #182848); }
                .metric-title { font-size: 8px; font-weight: 700; text-transform: uppercase; opacity: 0.9; }
                .metric-value { font-size: 18px; font-weight: 800; }
                .section-title { font-size: 11px; font-weight: 800; color: #0f172a; margin: 15px 0 10px; border-bottom: 1.5px solid #f1f5f9; padding-bottom: 4px; display: flex; align-items: center; gap: 8px; }
                .competency-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 25px; row-gap: 10px; }
                .competency-item { margin-bottom: 2px; }
                .competency-name { font-size: 9.5px; font-weight: 700; color: #334155; margin-bottom: 4px; }
                .comp-questions { margin-top: 4px; padding-left: 12px; margin-bottom: 8px; list-style-type: disc; }
                .comp-question-item { font-size: 8px; color: #64748b; line-height: 1.2; margin-bottom: 2px; }
                .bar-group { display: flex; flex-direction: column; gap: 4px; }
                .bar-row { display: flex; align-items: center; gap: 8px; }
                .bar-tag { font-size: 6.5px; font-weight: 800; color: #94a3b8; width: 30px; text-transform: uppercase; }
                .bar-track { flex: 1; height: 8px; background: #f1f5f9; border-radius: 10px; overflow: hidden; }
                .bar-fill { height: 100%; border-radius: 10px; }
                .self-gradient { background: linear-gradient(90deg, #ff9f43, #ff6b6b); }
                .feedback-gradient { background: linear-gradient(90deg, #4b6cb7, #182848); }
                .bar-score { font-size: 8.5px; font-weight: 800; color: #475569; width: 22px; text-align: right; }
                .infographics-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
                .info-column { background: #fff; border: 1px solid #f1f5f9; border-radius: 10px; padding: 12px; }
                .info-col-title { font-size: 10px; font-weight: 800; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
                .info-list { display: flex; flex-direction: column; gap: 5px; }
                .info-list-item { background: #f8fafc; padding: 5px 10px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; }
                .info-item-text { font-weight: 600; font-size: 9px; color: #475569; }
                .info-item-score-circle { width: 22px; height: 22px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 800; color: #fff; }
                .circle-green { background: #10b981; }
                .circle-pink { background: #ef4444; }
                .comments-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
                .comment-card { border-radius: 10px; padding: 10px; border-left: 4px solid #e2e8f0; background: #f8fafc; }
                .comment-card-self { border-left-color: #ff9f43; }
                .comment-card-manager { border-left-color: #4b6cb7; }
                .comment-card-peer { border-left-color: #10b981; }
                .comment-card-header { font-size: 7px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
                .comment-card-body { font-size: 8.5px; font-style: italic; color: #334155; line-height: 1.4; }
                @media print { body { -webkit-print-color-adjust: exact; } }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>รายงานผลการประเมินการสื่อสาร 180 องศา</h1>
                <div class="info-grid">
                    <div class="info-item"><span>ผู้รับการประเมิน</span><strong>${p.name}</strong></div>
                    <div class="info-item"><span>อีเมล</span><strong>${p.email}</strong></div>
                    <div class="info-item"><span>วันที่ประเมิน</span><strong>${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</strong></div>
                </div>
                <div class="metrics">
                    <div class="metric-card metric-card-self">
                        <div class="metric-title">คะแนนตนเองเฉลี่ยรวม</div>
                        <div class="metric-value">${overallSelfScore ? overallSelfScore.toFixed(2) : '0.00'}</div>
                    </div>
                    <div class="metric-card metric-card-feedback">
                        <div class="metric-title">คะแนนป้อนกลับเฉลี่ยรวม</div>
                        <div class="metric-value">${overallFbScore ? overallFbScore.toFixed(2) : '0.00'}</div>
                    </div>
                </div>
            </div>
            
            <div class="section-title">สรุปคะแนนรายสมรรถนะ (Competency Score Breakdown)</div>
            ${barsHtml}
            
            <div class="section-title">วิเคราะห์จุดแข็งและโอกาสพัฒนา (Strengths & Opportunities)</div>
            <div class="infographics-grid">
                <div class="info-column">
                    <div class="info-col-title">🎯 จุดแข็งเด่นชัด</div>
                    <div class="info-list">${strengthsHtml}</div>
                </div>
                <div class="info-column">
                    <div class="info-col-title">🧭 โอกาสในการพัฒนา</div>
                    <div class="info-list">${opportunitiesHtml}</div>
                </div>
            </div>
            
            <div class="section-title">ความคิดเห็นและข้อเสนอแนะเพิ่มเติม (Additional Feedback)</div>
            ${commentsHtml}
            
            <script>
                window.onload = function() {
                    setTimeout(function() { window.print(); }, 500);
                }
            </script>
        </body>
        </html>
        `);
        printWindow.document.close();
    }

    // Reset Database back to blank
    btnAdminReset.addEventListener('click', async () => {
        if (confirm('คุณต้องการลบข้อมูลคะแนนดิบที่บันทึกและตอบกลับทั้งหมดเพื่อรีเซ็ตระบบเป็นค่าเริ่มต้นใหม่ใช่หรือไม่? (ข้อมูลนี้จะไม่สามารถกู้คืนได้)')) {
            
            // 1. Reset on Google Sheets if URL exists
            if (GOOGLE_SCRIPT_API_URL) {
                try {
                    showToast('กำลังรีเซ็ตข้อมูลบนระบบออนไลน์...', 'info');
                    fetch(GOOGLE_SCRIPT_API_URL, {
                        method: 'POST',
                        mode: 'no-cors',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ action: 'reset' })
                    });
                } catch (error) {
                    console.error('Reset online error:', error);
                }
            }

            localStorage.removeItem('smart_comm_evaluations_db');
            initDatabase();
            renderAdminPanel();
            showToast('ระบบได้รับการรีเซ็ตเป็นค่าเริ่มต้นเรียบร้อยแล้ว', 'info');
        }
    });

    // --- 8. INITIAL STARTUP ---
    initDatabase();
    syncDatabaseWithGoogleSheets();
    showView('login');
});
