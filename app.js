// App State
let namelistData = null;
let questionsData = null;
let responsesData = [];
let currentUser = null;
let currentTask = null;

// DOM Elements
const loaderScreen = document.getElementById('loader-screen');
const loginScreen = document.getElementById('login-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const assessmentScreen = document.getElementById('assessment-screen');
const successOverlay = document.getElementById('success-overlay');

const loginForm = document.getElementById('login-form');
const userEmailInput = document.getElementById('user-email-input');
const emailDropdown = document.getElementById('email-dropdown');

const currentUserName = document.getElementById('current-user-name');
const currentUserEmail = document.getElementById('current-user-email');
const logoutBtn = document.getElementById('logout-btn');

const progressCircleBar = document.getElementById('progress-circle-bar');
const progressTextPercent = document.getElementById('progress-text-percent');
const progressCount = document.getElementById('progress-count');
const pendingBadge = document.getElementById('pending-badge');
const taskGrid = document.getElementById('task-grid');

const backToDashboardBtn = document.getElementById('back-to-dashboard-btn');
const assessmentRoleBadge = document.getElementById('assessment-role-badge');
const assessmentTargetName = document.getElementById('assessment-target-name');
const answersProgressText = document.getElementById('answers-progress-text');
const answersProgressBar = document.getElementById('answers-progress-bar');
const assessmentForm = document.getElementById('assessment-form');
const questionsContainer = document.getElementById('questions-container');
const cancelAssessmentBtn = document.getElementById('cancel-assessment-btn');
const successCloseBtn = document.getElementById('success-close-btn');

// Fetch Initial Data
async function initApp() {
    try {
        const [namelistRes, questionsRes, responsesRes] = await Promise.all([
            fetch('/api/namelist'),
            fetch('/api/questions'),
            fetch('/api/responses')
        ]);

        namelistData = await namelistRes.json();
        questionsData = await questionsRes.json();
        responsesData = await responsesRes.json();

        setupEmailDropdown();
        
        // Check local storage for session
        const savedEmail = localStorage.getItem('assessor_email');
        if (savedEmail) {
            login(savedEmail);
        } else {
            showScreen(loginScreen);
        }
    } catch (err) {
        console.error('Failed to initialize data:', err);
        alert('เกิดข้อผิดพลาดในการโหลดข้อมูลระบบ กรุณาตรวจสอบว่าเซิร์ฟเวอร์กำลังทำงานอยู่');
    }
}

// Show specific screen with transition
function showScreen(screen) {
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
    });
    screen.classList.add('active');
}

// Setup searchable dropdown for login email input
function setupEmailDropdown() {
    // Get unique assessors from namelist
    const assessorsMap = new Map();
    // Index 0 is headers in our parsed JSON, so start at 1
    for (let i = 1; i < namelistData.rows.length; i++) {
        const r = namelistData.rows[i];
        // F is Assessor Email, E is Assessor Name
        if (r.F && r.E) {
            assessorsMap.set(r.F.toLowerCase().trim(), r.E.trim());
        }
    }

    const uniqueAssessors = Array.from(assessorsMap.entries()).map(([email, name]) => ({ email, name }));

    // Show dropdown list on focus
    userEmailInput.addEventListener('focus', () => {
        filterDropdown(uniqueAssessors);
    });

    // Close dropdown on click outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.select-search-container')) {
            emailDropdown.classList.remove('active');
        }
    });

    // Filter list on keyup
    userEmailInput.addEventListener('keyup', () => {
        filterDropdown(uniqueAssessors);
    });
}

function filterDropdown(list) {
    const val = userEmailInput.value.toLowerCase().trim();
    const filtered = list.filter(item => 
        item.email.includes(val) || item.name.toLowerCase().includes(val)
    );

    emailDropdown.innerHTML = '';
    if (filtered.length > 0) {
        filtered.forEach(item => {
            const div = document.createElement('div');
            div.className = 'dropdown-item';
            div.innerHTML = `<strong>${item.name}</strong><span class="dropdown-email">${item.email}</span>`;
            div.addEventListener('click', () => {
                userEmailInput.value = item.email;
                emailDropdown.classList.remove('active');
            });
            emailDropdown.appendChild(div);
        });
        emailDropdown.classList.add('active');
    } else {
        emailDropdown.classList.remove('active');
    }
}

// Login logic
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = userEmailInput.value.toLowerCase().trim();
    login(email);
});

function login(email) {
    // Find tasks for this email
    const tasks = [];
    let name = '';

    for (let i = 1; i < namelistData.rows.length; i++) {
        const r = namelistData.rows[i];
        if (r.F && r.F.toLowerCase().trim() === email) {
            name = r.E; // Assessor Name
            tasks.push({
                targetNo: r.A,
                targetName: r.B,
                targetEmail: r.C,
                role: r.D,
                status: checkTaskStatus(email, r.A, r.D)
            });
        }
    }

    if (tasks.length === 0) {
        alert('ไม่พบอีเมลนี้ในระบบผู้ประเมิน กรุณาตรวจสอบอีเมลอีกครั้ง');
        return;
    }

    currentUser = { email, name, tasks };
    localStorage.setItem('assessor_email', email);

    // Render dashboard details
    currentUserName.innerText = currentUser.name;
    currentUserEmail.innerText = currentUser.email;

    renderDashboard();
    showScreen(dashboardScreen);
}

// Check status of a task against loaded responses
function checkTaskStatus(assessorEmail, targetNo, role) {
    const found = responsesData.find(res => 
        res.assessorEmail.toLowerCase().trim() === assessorEmail.toLowerCase().trim() && 
        res.targetNo.toString() === targetNo.toString() &&
        res.role === role
    );
    return found ? 'Completed' : 'Pending';
}

// Render Dashboard Screen
function renderDashboard() {
    // Refresh task statuses
    currentUser.tasks.forEach(t => {
        t.status = checkTaskStatus(currentUser.email, t.targetNo, t.role);
    });

    const total = currentUser.tasks.length;
    const completed = currentUser.tasks.filter(t => t.status === 'Completed').length;
    const pending = total - completed;

    // Update progress numbers
    progressCount.innerText = `${completed} / ${total}`;
    pendingBadge.innerText = `รอดำเนินการ ${pending} งาน`;

    // Update Progress Ring (SVG Circle)
    const radius = 34;
    const circumference = 2 * Math.PI * radius;
    progressCircleBar.style.strokeDasharray = `${circumference} ${circumference}`;
    
    const percent = total > 0 ? (completed / total) : 0;
    const offset = circumference - (percent * circumference);
    progressCircleBar.style.strokeDashoffset = offset;
    progressTextPercent.innerText = `${Math.round(percent * 100)}%`;

    // Render Cards
    taskGrid.innerHTML = '';
    currentUser.tasks.forEach(task => {
        const card = document.createElement('div');
        card.className = 'task-card';

        const isCompleted = task.status === 'Completed';
        const roleClass = task.role.toLowerCase().startsWith('self') ? 'self' : 'peer';

        card.innerHTML = `
            <div class="task-card-header">
                <span class="task-badge-role ${roleClass}">${task.role}</span>
                <span class="task-badge-status ${isCompleted ? 'status-completed' : 'status-pending'}">
                    ${isCompleted ? '✓ เสร็จสิ้น' : '● รอดำเนินการ'}
                </span>
            </div>
            <div class="task-card-body">
                <h4>${task.targetName}</h4>
                <span class="sub-text">${task.targetEmail}</span>
            </div>
            <div class="task-card-footer">
                <button class="btn btn-sm ${isCompleted ? 'btn-outline' : 'btn-primary'}">
                    ${isCompleted ? 'แก้ไขผลประเมิน' : 'เริ่มทำแบบประเมิน'}
                </button>
            </div>
        `;

        card.querySelector('button').addEventListener('click', () => {
            startAssessment(task);
        });

        taskGrid.appendChild(card);
    });
}

// Logout logic
logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('assessor_email');
    currentUser = null;
    currentTask = null;
    userEmailInput.value = '';
    showScreen(loginScreen);
});

// Start assessment form
function startAssessment(task) {
    currentTask = task;
    
    // Set UI header details
    assessmentRoleBadge.innerText = task.role;
    assessmentRoleBadge.className = 'badge ' + (task.role.toLowerCase().startsWith('self') ? 'badge-success' : 'badge-info');
    assessmentTargetName.innerText = task.targetName;

    // Load existing response if any
    const existing = responsesData.find(res => 
        res.assessorEmail.toLowerCase().trim() === currentUser.email.toLowerCase().trim() && 
        res.targetNo.toString() === task.targetNo.toString() &&
        res.role === task.role
    );

    const savedAnswers = existing ? existing.answers : {};

    // Group questions by category (หมวด)
    // Map headers from questionsData
    // Row 1 is header, actual questions start at index 2 (Row 3)
    const categoriesMap = new Map();
    for (let i = 2; i < questionsData.rows.length; i++) {
        const q = questionsData.rows[i];
        if (!q.B) continue; // Skip if no category
        
        if (!categoriesMap.has(q.B)) {
            categoriesMap.set(q.B, []);
        }
        categoriesMap.get(q.B).push({
            id: q.A,
            text: q.C
        });
    }

    // Render Categories & Questions
    questionsContainer.innerHTML = '';
    let qIdx = 1;

    categoriesMap.forEach((questions, categoryName) => {
        const catBlock = document.createElement('div');
        catBlock.className = 'category-block';
        catBlock.innerHTML = `<h3 class="category-title">📁 ${categoryName}</h3>`;

        questions.forEach(q => {
            const qItem = document.createElement('div');
            qItem.className = 'question-item';

            const selectedVal = savedAnswers[q.id] || '';

            qItem.innerHTML = `
                <div class="question-text">
                    <span class="question-number">${q.id}.</span>
                    <span>${q.text}</span>
                </div>
                <div class="rating-options">
                    ${[5, 4, 3, 2, 1, 'N/A'].map(val => {
                        const isChecked = selectedVal.toString() === val.toString() ? 'checked' : '';
                        const chipClass = val === 'N/A' ? 'cna' : `c${val}`;
                        const labelText = val === 'N/A' ? 'ระบุไม่ได้' : val;
                        const scoreDesc = val === 5 ? 'ประจำ' : val === 1 ? 'ไม่เคยเลย' : '';
                        
                        return `
                            <label class="rating-label">
                                <input type="radio" name="q_${q.id}" value="${val}" ${isChecked} required>
                                <span class="rating-chip ${chipClass}">${val}</span>
                                <span class="rating-text">${scoreDesc || labelText}</span>
                            </label>
                        `;
                    }).join('')}
                </div>
            `;

            catBlock.appendChild(qItem);
            qIdx++;
        });

        questionsContainer.appendChild(catBlock);
    });

    // Set up radio change event listeners for progress tracking
    setupProgressTracking();
    showScreen(assessmentScreen);
}

// Track answers progress dynamically
function setupProgressTracking() {
    const totalQuestions = 19;
    
    function updateProgress() {
        const checkedCount = questionsContainer.querySelectorAll('input[type="radio"]:checked').length;
        answersProgressText.innerText = `ตอบแล้ว ${checkedCount} / ${totalQuestions} ข้อ`;
        
        const percent = (checkedCount / totalQuestions) * 100;
        answersProgressBar.style.width = `${percent}%`;
    }

    questionsContainer.querySelectorAll('input[type="radio"]').forEach(radio => {
        radio.addEventListener('change', updateProgress);
    });

    // Initial update
    updateProgress();
}

// Submit assessment
assessmentForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Collect answers
    const answers = {};
    let allAnswered = true;

    // Check all 19 questions
    for (let q = 1; q <= 19; q++) {
        const checkedRadio = questionsContainer.querySelector(`input[name="q_${q}"]:checked`);
        if (checkedRadio) {
            answers[q.toString()] = checkedRadio.value;
        } else {
            allAnswered = false;
            break;
        }
    }

    if (!allAnswered) {
        alert('กรุณาตอบคำถามให้ครบถ้วนทั้ง 19 ข้อก่อนส่งผลประเมิน');
        return;
    }

    // Submit payload
    const payload = {
        assessorEmail: currentUser.email,
        targetNo: currentTask.targetNo,
        role: currentTask.role,
        answers: answers
    };

    try {
        loaderScreen.classList.add('active'); // Show spinner overlay

        const res = await fetch('/api/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            // Re-fetch all responses to sync
            const responsesRes = await fetch('/api/responses');
            responsesData = await responsesRes.json();

            loaderScreen.classList.remove('active');
            
            // Show Success Overlay
            successOverlay.classList.add('active');
        } else {
            loaderScreen.classList.remove('active');
            alert('ไม่สามารถส่งข้อมูลได้ กรุณาลองอีกครั้งในภายหลัง');
        }
    } catch (err) {
        loaderScreen.classList.remove('active');
        console.error('Error submitting assessment:', err);
        alert('เกิดข้อผิดพลาดในการส่งข้อมูลประเมิน กรุณาติดต่อผู้ดูแลระบบ');
    }
});

// Close success overlay and return to dashboard
successCloseBtn.addEventListener('click', () => {
    successOverlay.classList.remove('active');
    renderDashboard();
    showScreen(dashboardScreen);
});

// Cancel assessment
cancelAssessmentBtn.addEventListener('click', () => {
    if (confirm('คุณต้องการยกเลิกการทำแบบประเมินนี้ใช่หรือไม่? ข้อมูลที่ตอบไปยังไม่ได้บันทึก')) {
        showScreen(dashboardScreen);
    }
});

backToDashboardBtn.addEventListener('click', () => {
    showScreen(dashboardScreen);
});

// Initialize on page load
window.addEventListener('DOMContentLoaded', initApp);
