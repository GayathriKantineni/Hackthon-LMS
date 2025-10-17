// Global variables
let currentUser = null;
const API_URL = 'http://localhost:5000/api';

// DOM Elements
document.addEventListener('DOMContentLoaded', () => {
    // Navigation links
    const homeLink = document.getElementById('homeLink');
    const coursesLink = document.getElementById('coursesLink');
    const dashboardLink = document.getElementById('dashboardLink');
    const loginLink = document.getElementById('loginLink');
    const registerLink = document.getElementById('registerLink');
    const exploreBtn = document.getElementById('exploreBtn');
    
    // Sections
    const sections = document.querySelectorAll('.section');
    const homeSection = document.getElementById('homeSection');
    const coursesSection = document.getElementById('coursesSection');
    const dashboardSection = document.getElementById('dashboardSection');
    const loginSection = document.getElementById('loginSection');
    const registerSection = document.getElementById('registerSection');
    const courseDetailSection = document.getElementById('courseDetailSection');
    const createCourseSection = document.getElementById('createCourseSection');
    
    // Initialize Supabase client (frontend) using public config
    const initSupabase = async () => {
        try {
            const res = await fetch('/api/public-config');
            const cfg = await res.json();
            if (cfg && cfg.supabaseUrl && cfg.supabaseKey && window.supabase) {
                window.supabaseClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
            }
        } catch (_) { /* ignore if not configured */ }
    };
    initSupabase();

    // Dashboard elements
    const studentDashboard = document.getElementById('studentDashboard');
    const teacherDashboard = document.getElementById('teacherDashboard');
    const dashboardNotLoggedIn = document.getElementById('dashboardNotLoggedIn');
    
    // Forms
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const createCourseForm = document.getElementById('createCourseForm');
    
    // Other elements
    const userInfo = document.getElementById('userInfo');
    const userName = document.getElementById('userName');
    const logoutBtn = document.getElementById('logoutBtn');
    const goToRegister = document.getElementById('goToRegister');
    const goToLogin = document.getElementById('goToLogin');
    const dashboardLoginBtn = document.getElementById('dashboardLoginBtn');
    const createCourseBtn = document.getElementById('createCourseBtn');
    const cancelCreateCourse = document.getElementById('cancelCreateCourse');
    const courseGrid = document.getElementById('courseGrid');
    const courseSearch = document.getElementById('courseSearch');
    // Attendance elements
    const attendanceCourseSelect = document.getElementById('attendanceCourseSelect');
    const attendanceDate = document.getElementById('attendanceDate');
    const attendanceList = document.getElementById('attendanceList');
    const saveAttendanceBtn = document.getElementById('saveAttendanceBtn');
    
    // Modal elements
    const messageModal = document.getElementById('messageModal');
    const modalMessage = document.getElementById('modalMessage');
    const closeModal = document.querySelector('.close-modal');
    // Profile elements
    const profileBtn = document.getElementById('profileBtn');
    const profileMenu = document.getElementById('profileMenu');
    const userAvatarText = document.getElementById('userAvatarText');
    const profileMenuProfile = document.getElementById('profileMenuProfile');
    const profileMenuDashboard = document.getElementById('profileMenuDashboard');
    const profileMenuLogout = document.getElementById('profileMenuLogout');
    // Notifications elements
    const notifBtn = document.getElementById('notifBtn');
    const notifMenu = document.getElementById('notifMenu');
    const notifList = document.getElementById('notifList');
    const notifBadge = document.getElementById('notifBadge');
    const markAllReadBtn = document.getElementById('markAllReadBtn');
    
    // Check if user is logged in from localStorage
    const checkAuth = () => {
        const storedUser = localStorage.getItem('currentUser');
        if (storedUser) {
            currentUser = JSON.parse(storedUser);
            updateUIForLoggedInUser();
        }
    };

// Student: Attendance summary
    const loadStudentAttendance = async () => {
        if (!currentUser || currentUser.role !== 'student') return;
        try {
            const res = await fetch(`${API_URL}/attendance/student/${currentUser.id}`);
            const summaries = await res.json();
            const container = document.getElementById('studentAttendance');
            if (!container) return;
            container.innerHTML = '';
            if (!Array.isArray(summaries) || summaries.length === 0) {
                container.innerHTML = '<p>No attendance records yet.</p>';
                return;
            }
            summaries.forEach(s => {
                const item = document.createElement('div');
                item.className = 'dashboard-item';
                const pct = (s.percent == null) ? 'N/A' : `${s.percent.toFixed(0)}%`;
                item.innerHTML = `
                    <h4>${s.course_title}</h4>
                    <div class="course-meta">
                        <span><i class="fas fa-user-check"></i> Present: ${s.present} / ${s.total}</span>
                        <span><i class="fas fa-percentage"></i> ${pct}</span>
                    </div>
                `;
                container.appendChild(item);
            });
        } catch (e) {
            showMessage(`Error loading attendance: ${e.message}`);
        }
    };

// Teacher: Attendance UI
    const initTeacherAttendanceUI = async () => {
        if (!currentUser || currentUser.role !== 'teacher') return;
        if (!attendanceCourseSelect || !attendanceList) return;
        try {
            // Load teacher courses
            const resp = await fetch(`${API_URL}/courses`);
            const all = await resp.json();
            const myCourses = all.filter(c => c.teacher_id === currentUser.id || c.teacher === currentUser.name);
            attendanceCourseSelect.innerHTML = '';
            if (myCourses.length === 0) {
                attendanceCourseSelect.innerHTML = '<option value="">No courses</option>';
                attendanceList.innerHTML = '<p>No courses available.</p>';
                return;
            }
            myCourses.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.title;
                attendanceCourseSelect.appendChild(opt);
            });
            // Default date = today
            if (attendanceDate && !attendanceDate.value) {
                const today = new Date();
                const yyyy = today.getFullYear();
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const dd = String(today.getDate()).padStart(2, '0');
                attendanceDate.value = `${yyyy}-${mm}-${dd}`;
            }
            await loadAttendanceListForDate();
        } catch (e) {
            showMessage(`Error initializing attendance: ${e.message}`);
        }
        // Event listeners
        if (attendanceCourseSelect) {
            attendanceCourseSelect.onchange = () => loadAttendanceListForDate();
        }
        if (attendanceDate) {
            attendanceDate.onchange = () => loadAttendanceListForDate();
        }
        if (saveAttendanceBtn) {
            saveAttendanceBtn.onclick = () => saveAttendance();
        }
    };

    const loadAttendanceListForDate = async () => {
        if (!currentUser || currentUser.role !== 'teacher') return;
        const courseId = Number(attendanceCourseSelect && attendanceCourseSelect.value);
        if (!courseId) { attendanceList.innerHTML = '<p>Select a course</p>'; return; }
        const date = attendanceDate && attendanceDate.value;
        try {
            const [studentsRes, marksRes] = await Promise.all([
                fetch(`${API_URL}/course-students/${courseId}`),
                fetch(`${API_URL}/attendance/course/${courseId}?date=${encodeURIComponent(date)}&teacher_id=${currentUser.id}`)
            ]);
            const students = await studentsRes.json();
            const marksWrap = await marksRes.json();
            const marks = (marksWrap && Array.isArray(marksWrap.records)) ? marksWrap.records : [];
            const presentMap = new Map(marks.map(m => [m.student_id, !!m.present]));
            attendanceList.innerHTML = '';
            if (!Array.isArray(students) || students.length === 0) {
                attendanceList.innerHTML = '<p>No enrolled students.</p>';
                return;
            }
            students.forEach(s => {
                const row = document.createElement('div');
                row.className = 'dashboard-item';
                const checked = presentMap.get(s.id) ? 'checked' : '';
                row.innerHTML = `
                    <label style="display:flex;align-items:center;gap:0.75rem;">
                        <input type="checkbox" class="att-present" data-id="${s.id}" ${checked} />
                        <span>${s.name} (${s.email})</span>
                    </label>
                `;
                attendanceList.appendChild(row);
            });
        } catch (e) {
            showMessage(`Error loading attendance list: ${e.message}`);
        }
    };

    const saveAttendance = async () => {
        if (!currentUser || currentUser.role !== 'teacher') return;
        const courseId = Number(attendanceCourseSelect && attendanceCourseSelect.value);
        if (!courseId) { showMessage('Select a course'); return; }
        const date = attendanceDate && attendanceDate.value;
        const checkboxes = attendanceList ? attendanceList.querySelectorAll('.att-present') : [];
        const records = Array.from(checkboxes).map(cb => ({ student_id: Number(cb.getAttribute('data-id')), present: cb.checked }));
        try {
            const res = await fetch(`${API_URL}/attendance/mark`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ teacher_id: currentUser.id, course_id: courseId, date, records })
            });
            const data = await res.json();
            if (res.ok) {
                showMessage('Attendance saved');
            } else {
                showMessage(data.error || 'Failed to save attendance');
            }
        } catch (e) {
            showMessage(`Error: ${e.message}`);
        }
    };
    
    // Profile population and editing
    const populateProfile = async () => {
        const nameEl = document.getElementById('profileName');
        const emailEl = document.getElementById('profileEmail');
        const roleEl = document.getElementById('profileRole');
        const enrolledEl = document.getElementById('profileEnrolled');
        const subsEl = document.getElementById('profileSubmissions');
        const avgEl = document.getElementById('profileAvgGrade');
        const editName = document.getElementById('editName');
        const editEmail = document.getElementById('editEmail');
        const editPassword = document.getElementById('editPassword');
        const profileForm = document.getElementById('profileForm');
        if (!currentUser) return;
        if (nameEl) nameEl.textContent = currentUser.name || '-';
        if (emailEl) emailEl.textContent = currentUser.email || '-';
        if (roleEl) roleEl.textContent = currentUser.role || '-';
        if (editName) editName.value = currentUser.name || '';
        if (editEmail) editEmail.value = currentUser.email || '';
        if (editPassword) editPassword.value = '';
        if (profileForm) {
            profileForm.onsubmit = async (e) => {
                e.preventDefault();
                const payload = {};
                if (editName && editName.value && editName.value !== currentUser.name) payload.name = editName.value.trim();
                if (editEmail && editEmail.value && editEmail.value !== currentUser.email) payload.email = editEmail.value.trim();
                if (editPassword && editPassword.value) payload.password = editPassword.value;
                if (Object.keys(payload).length === 0) { showMessage('No changes to save'); return; }
                try {
                    const res = await fetch(`${API_URL}/user/${currentUser.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    const data = await res.json();
                    if (res.ok) {
                        currentUser = { ...currentUser, ...data };
                        localStorage.setItem('currentUser', JSON.stringify(currentUser));
                        if (nameEl) nameEl.textContent = currentUser.name || '-';
                        if (emailEl) emailEl.textContent = currentUser.email || '-';
                        if (editPassword) editPassword.value = '';
                        // Refresh avatar initials
                        if (userAvatarText) {
                            const initials = (currentUser.name || 'U')
                                .split(' ')
                                .filter(Boolean)
                                .slice(0, 2)
                                .map(p => p.charAt(0).toUpperCase())
                                .join('') || 'U';
                            userAvatarText.textContent = initials;
                        }
                        showMessage('Profile updated');
                    } else {
                        showMessage(data.error || 'Failed to update profile');
                    }
                } catch (err) {
                    showMessage('Error: ' + err.message);
                }
            };
            // Edit toggle behavior
            const editToggleBtn = document.getElementById('editToggleBtn');
            const saveBtn = document.getElementById('saveProfileBtn');
            if (editToggleBtn) {
                editToggleBtn.onclick = () => {
                    const nowEnabled = editName.disabled; // toggle state
                    [editName, editEmail, editPassword].forEach(el => { if (el) el.disabled = !nowEnabled; });
                    if (saveBtn) saveBtn.disabled = !nowEnabled;
                    editToggleBtn.textContent = nowEnabled ? 'Cancel' : 'Edit';
                    if (!nowEnabled && editPassword) editPassword.value = '';
                    if (!nowEnabled && editName) editName.value = currentUser.name || '';
                    if (!nowEnabled && editEmail) editEmail.value = currentUser.email || '';
                };
            }
        }
        // Stats
        try {
            if (currentUser.role === 'student') {
                const er = await fetch(`${API_URL}/my-courses/${currentUser.id}`);
                const courses = await er.json();
                if (enrolledEl) enrolledEl.textContent = Array.isArray(courses) ? courses.length : 0;
                const gr = await fetch(`${API_URL}/grades/student/${currentUser.id}`);
                const grades = await gr.json();
                const submissions = Array.isArray(grades) ? grades.flatMap(g => g.submissions || []) : [];
                if (subsEl) subsEl.textContent = submissions.length;
                const avgs = Array.isArray(grades) ? grades.map(g => g.average).filter(v => v != null) : [];
                const overall = avgs.length ? (avgs.reduce((a,b)=>a+b,0) / avgs.length) : null;
                if (avgEl) avgEl.textContent = overall == null ? 'N/A' : overall.toFixed(1);
            } else {
                if (enrolledEl) enrolledEl.textContent = '-';
                const cr = await fetch(`${API_URL}/courses`);
                const all = await cr.json();
                const mine = Array.isArray(all) ? all.filter(c => c.teacher_id === currentUser.id || c.teacher === currentUser.name) : [];
                let totalSubs = 0;
                for (const c of mine) {
                    const ar = await fetch(`${API_URL}/course/${c.id}/assignments`);
                    const assigns = await ar.json();
                    for (const a of (assigns || [])) {
                        const sr = await fetch(`${API_URL}/assignment/${a.id}/submissions?teacher_id=${currentUser.id}`);
                        const subs = await sr.json();
                        totalSubs += Array.isArray(subs) ? subs.length : 0;
                    }
                }
                if (subsEl) subsEl.textContent = totalSubs;
                if (avgEl) avgEl.textContent = '-';
            }
        } catch (_) {
            // ignore
        }
    };

    // Update UI based on authentication status
    const updateUIForLoggedInUser = () => {
        if (currentUser) {
            loginLink.style.display = 'none';
            registerLink.style.display = 'none';
            userInfo.style.display = 'flex';
            if (userName) userName.textContent = currentUser.name;
            // Set avatar initials
            if (userAvatarText) {
                const initials = (currentUser.name || 'U')
                    .split(' ')
                    .filter(Boolean)
                    .slice(0, 2)
                    .map(p => p.charAt(0).toUpperCase())
                    .join('') || 'U';
                userAvatarText.textContent = initials;
            }
            if (profileMenu) profileMenu.style.display = 'none';
            // Update dashboard visibility
            dashboardNotLoggedIn.style.display = 'none';
            if (currentUser.role === 'student') {
                studentDashboard.style.display = 'grid';
                teacherDashboard.style.display = 'none';
                loadEnrolledCourses();
                loadStudentAssignments();
                loadStudentAttendance();
                loadStudentGrades();
            } else if (currentUser.role === 'teacher') {
                teacherDashboard.style.display = 'grid';
                studentDashboard.style.display = 'none';
                loadTeacherCourses();
                loadTeacherAssignments();
                initTeacherAttendanceUI();
            }
            // Refresh notifications badge
            renderNotifications(false);
        } else {
            loginLink.style.display = 'block';
            registerLink.style.display = 'block';
            userInfo.style.display = 'none';
            dashboardNotLoggedIn.style.display = 'block';
            studentDashboard.style.display = 'none';
            teacherDashboard.style.display = 'none';
            if (profileMenu) profileMenu.style.display = 'none';
        }
    };
    
    // Navigation functions
    const showSection = (sectionToShow) => {
        sections.forEach(section => {
            section.classList.remove('active');
        });
        sectionToShow.classList.add('active');
    };
    
    // Event Listeners for navigation
    homeLink.addEventListener('click', (e) => {
        e.preventDefault();
        showSection(homeSection);
    });
    
    coursesLink.addEventListener('click', (e) => {
        e.preventDefault();
        loadAllCourses();
        showSection(coursesSection);
    });
    
    dashboardLink.addEventListener('click', (e) => {
        e.preventDefault();
        try {
            updateUIForLoggedInUser();
        } catch (err) {
            console.error('Dashboard update error:', err);
        }
        showSection(dashboardSection);
    });
    
    loginLink.addEventListener('click', (e) => {
        e.preventDefault();
        showSection(loginSection);
    });
    
    registerLink.addEventListener('click', (e) => {
        e.preventDefault();
        showSection(registerSection);
    });
    
    exploreBtn.addEventListener('click', () => {
        loadAllCourses();
        showSection(coursesSection);
    });
    
    goToRegister.addEventListener('click', (e) => {
        e.preventDefault();
        showSection(registerSection);
    });
    
    goToLogin.addEventListener('click', (e) => {
        e.preventDefault();
        showSection(loginSection);
    });
    
    dashboardLoginBtn.addEventListener('click', () => {
        showSection(loginSection);
    });
    
    createCourseBtn.addEventListener('click', () => {
        showSection(createCourseSection);
    });
    
    cancelCreateCourse.addEventListener('click', () => {
        createCourseForm.reset();
        showSection(dashboardSection);
    });
    
    // Logout functionality (with confirmation)
    logoutBtn.addEventListener('click', () => {
        const ok = window.confirm('Are you sure you want to logout?');
        if (!ok) return;
        currentUser = null;
        localStorage.removeItem('currentUser');
        updateUIForLoggedInUser();
        // Close any open menus
        if (profileMenu) profileMenu.style.display = 'none';
        const notifMenuEl = document.getElementById('notifMenu');
        if (notifMenuEl) notifMenuEl.style.display = 'none';
        showSection(homeSection);
        showMessage('Logged out successfully');
    });
    
    // Modal functionality
    const showMessage = (message) => {
        modalMessage.textContent = message;
        messageModal.style.display = 'block';
    };
    
    closeModal.addEventListener('click', () => {
        messageModal.style.display = 'none';
    });
    
    window.addEventListener('click', (e) => {
        if (e.target === messageModal) {
            messageModal.style.display = 'none';
        }
    });

    // Notifications: fetch and render
    const fetchNotifications = async () => {
        if (!currentUser) return [];
        try {
            const res = await fetch(`${API_URL}/notifications/${currentUser.id}`);
            const items = await res.json();
            return Array.isArray(items) ? items : [];
        } catch (_) {
            return [];
        }
    };
    const renderNotifications = async (open = false) => {
        const items = await fetchNotifications();
        const unread = items.filter(n => !n.read).length;
        if (notifBadge) {
            if (unread > 0) {
                notifBadge.textContent = String(unread);
                notifBadge.style.display = 'inline-block';
            } else {
                notifBadge.style.display = 'none';
            }
        }
        if (notifList) {
            notifList.innerHTML = '';
            if (items.length === 0) {
                notifList.innerHTML = '<div class="notif-item">No notifications</div>';
            } else {
                items.forEach(n => {
                    const el = document.createElement('div');
                    el.className = 'notif-item' + (n.read ? '' : ' unread');
                    el.innerHTML = `
                        <div class="notif-item-title">${n.title}</div>
                        <div class="notif-item-msg">${n.message}</div>
                    `;
                    notifList.appendChild(el);
                });
            }
        }
        if (open && notifMenu) notifMenu.style.display = 'block';
    };
    if (notifBtn) {
        notifBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (notifMenu.style.display === 'block') {
                notifMenu.style.display = 'none';
            } else {
                await renderNotifications(true);
            }
        });
    }
    if (markAllReadBtn) {
        markAllReadBtn.addEventListener('click', async () => {
            const items = await fetchNotifications();
            const unreadIds = items.filter(n => !n.read).map(n => n.id);
            if (unreadIds.length === 0) return;
            try {
                const res = await fetch(`${API_URL}/notifications/mark-read`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: unreadIds })
                });
                if (res.ok) {
                    await renderNotifications(false);
                }
            } catch {}
        });
    }
    // Close notif menu when clicking outside
    window.addEventListener('click', (e) => {
        const onBtn = notifBtn && notifBtn.contains(e.target);
        const within = notifMenu && notifMenu.contains(e.target);
        if (notifMenu && notifMenu.style.display === 'block' && !onBtn && !within) notifMenu.style.display = 'none';
    });

    // Profile menu interactions
    if (profileBtn) {
        profileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (profileMenu) {
                profileMenu.style.display = profileMenu.style.display === 'none' || profileMenu.style.display === '' ? 'block' : 'none';
            }
        });
    }
    if (profileMenuLogout) {
        profileMenuLogout.addEventListener('click', () => {
            if (logoutBtn) logoutBtn.click();
        });
    }
    if (profileMenuDashboard) {
        profileMenuDashboard.addEventListener('click', () => {
            if (profileMenu) profileMenu.style.display = 'none';
            showSection(dashboardSection);
        });
    }
    if (profileMenuProfile) {
        profileMenuProfile.addEventListener('click', () => {
            if (profileMenu) profileMenu.style.display = 'none';
            showSection(document.getElementById('profileSection'));
            populateProfile();
        });
    }
    // Close profile menu when clicking outside
    window.addEventListener('click', (e) => {
        if (profileMenu && profileMenu.style.display === 'block') {
            const withinMenu = profileMenu.contains(e.target);
            const onBtn = profileBtn && profileBtn.contains(e.target);
            if (!withinMenu && !onBtn) profileMenu.style.display = 'none';
        }
    });
    
    // API Functions
    // Register user
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('registerName').value;
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;
        const role = document.getElementById('registerRole').value;
        
        try {
            const response = await fetch(`${API_URL}/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, email, password, role })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                showMessage('Registration successful! Please log in.');
                registerForm.reset();
                showSection(loginSection);
            } else {
                showMessage(`Registration failed: ${data.error}`);
            }
        } catch (error) {
            showMessage(`Error: ${error.message}`);
        }
    });
    
    // Login user
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        
        try {
            const response = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                currentUser = data.user;
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
                updateUIForLoggedInUser();
                showSection(dashboardSection);
                showMessage('Login successful!');
                loginForm.reset();
            } else {
                showMessage(`Login failed: ${data.error}`);
            }
        } catch (error) {
            showMessage(`Error: ${error.message}`);
        }
    });
    
    // Load all courses
    const loadAllCourses = async () => {
        try {
            const response = await fetch(`${API_URL}/courses`);
            const courses = await response.json();
            
            displayCourses(courses);
        } catch (error) {
            showMessage(`Error loading courses: ${error.message}`);
        }
    };
    
    // Display courses in the course grid
    const displayCourses = (courses) => {
        courseGrid.innerHTML = '';
        
        if (courses.length === 0) {
            courseGrid.innerHTML = '<p>No courses available.</p>';
            return;
        }
        
        courses.forEach(course => {
            const courseCard = document.createElement('div');
            courseCard.className = 'course-card';
            
            courseCard.innerHTML = `
                <div class="course-image">
                    <i class="fas fa-book"></i>
                </div>
                <div class="course-content">
                    <h3>${course.title}</h3>
                    <p>${course.description.substring(0, 100)}${course.description.length > 100 ? '...' : ''}</p>
                    <div class="course-meta">
                        <span><i class="fas fa-clock"></i> ${course.duration}</span>
                        <span><i class="fas fa-user"></i> ${course.teacher}</span>
                    </div>
                    <button class="btn primary-btn view-course-btn" data-id="${course.id}">View Course</button>
                </div>
            `;
            
            courseGrid.appendChild(courseCard);
            
            // Add event listener to the view course button
            const viewCourseBtn = courseCard.querySelector('.view-course-btn');
            viewCourseBtn.addEventListener('click', () => {
                viewCourseDetails(course.id);
            });
        });
    };
    
    // Search courses
    courseSearch.addEventListener('input', () => {
        const searchTerm = courseSearch.value.toLowerCase();
        const courseCards = document.querySelectorAll('.course-card');
        
        courseCards.forEach(card => {
            const title = card.querySelector('h3').textContent.toLowerCase();
            const description = card.querySelector('p').textContent.toLowerCase();
            
            if (title.includes(searchTerm) || description.includes(searchTerm)) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    });
    
    // View course details
    const viewCourseDetails = async (courseId) => {
        try {
            const response = await fetch(`${API_URL}/courses`);
            const courses = await response.json();
            
            const course = courses.find(c => c.id === courseId);
            
            if (!course) {
                showMessage('Course not found');
                return;
            }
            
            const courseDetail = document.getElementById('courseDetail');
            courseDetail.innerHTML = `
                <div class="course-header">
                    <h2>${course.title}</h2>
                    <div class="course-info">
                        <span><i class="fas fa-clock"></i> ${course.duration}</span>
                        <span><i class="fas fa-user"></i> ${course.teacher}</span>
                    </div>
                </div>
                <div class="course-description">
                    <h3>Description</h3>
                    <p>${course.description}</p>
                </div>
                <div class="course-description">
                    <h3>Materials</h3>
                    <div id="materialsList"></div>
                    ${currentUser && currentUser.role === 'teacher' ? `
                    <div class="form-inline" style="margin-top:0.5rem">
                        <input type="file" id="materialFile" />
                        <button class="btn secondary-btn" id="uploadMaterialBtn">Upload Material</button>
                    </div>` : ''}
                </div>
                <div class="course-description">
                    <h3>Discussion</h3>
                    <div id="discussionList"></div>
                    ${currentUser ? `
                    <div class="form-inline" style="margin-top:0.5rem">
                        <textarea id="discussionText" rows="2" placeholder="Share a question or insight..."></textarea>
                        <button class="btn primary-btn" id="postDiscussionBtn">Post</button>
                    </div>` : ''}
                </div>
                <div class="course-actions">
                    ${currentUser && currentUser.role === 'student' ? 
                        `<button class="btn primary-btn" id="enrollBtn" data-id="${course.id}">Enroll Now</button>
                         <button class="btn secondary-btn" id="completeCourseBtn" data-id="${course.id}" style="margin-left:0.5rem">Mark as Completed</button>` : 
                        ''}
                </div>
            `;
            
            showSection(courseDetailSection);
            
            // Add event listener to enroll button if it exists
            const enrollBtn = document.getElementById('enrollBtn');
            if (enrollBtn) {
                enrollBtn.addEventListener('click', () => {
                    enrollInCourse(courseId);
                });
            }

            // Materials: load list and handle upload (teacher)
            const loadMaterials = async () => {
                try {
                    const r = await fetch(`${API_URL}/course/${courseId}/materials`);
                    const items = await r.json();
                    const list = document.getElementById('materialsList');
                    if (!list) return;
                    list.innerHTML = '';
                    if (!Array.isArray(items) || items.length === 0) {
                        list.innerHTML = '<p>No materials yet.</p>';
                        return;
                    }
                    items.forEach(m => {
                        const el = document.createElement('div');
                        el.className = 'dashboard-item';
                        el.innerHTML = `<a href="${m.url}" target="_blank">${m.filename}</a> <span style="color:#6c757d">by ${m.uploader_name}</span>`;
                        list.appendChild(el);
                    });
                } catch (e) { /* ignore */ }
            };
            await loadMaterials();
            const uploadBtn = document.getElementById('uploadMaterialBtn');
            if (uploadBtn && currentUser && currentUser.role === 'teacher') {
                uploadBtn.addEventListener('click', async () => {
                    const fileEl = document.getElementById('materialFile');
                    if (!fileEl || !fileEl.files || fileEl.files.length === 0) {
                        showMessage('Choose a file to upload');
                        return;
                    }
                    const fd = new FormData();
                    fd.append('uploader_id', currentUser.id);
                    fd.append('file', fileEl.files[0]);
                    try {
                        const res = await fetch(`${API_URL}/course/${courseId}/materials`, { method: 'POST', body: fd });
                        const data = await res.json();
                        if (res.ok) {
                            showMessage('Material uploaded');
                            await loadMaterials();
                        } else {
                            showMessage(data.error || 'Upload failed');
                        }
                    } catch (e) { showMessage('Error: ' + e.message); }
                });
            }

            // Discussion: load list and handle post
            const loadDiscussion = async () => {
                try {
                    const r = await fetch(`${API_URL}/course/${courseId}/discussion`);
                    const posts = await r.json();
                    const list = document.getElementById('discussionList');
                    if (!list) return;
                    list.innerHTML = '';
                    if (!Array.isArray(posts) || posts.length === 0) {
                        list.innerHTML = '<p>No discussion yet. Be the first to post!</p>';
                        return;
                    }
                    posts.forEach(p => {
                        const el = document.createElement('div');
                        el.className = 'dashboard-item';
                        const when = new Date(p.created_at).toLocaleString();
                        el.innerHTML = `<strong>${p.user_name}</strong> <span style="color:#6c757d">${when}</span><p>${p.content}</p>`;
                        list.appendChild(el);
                    });
                } catch (e) { /* ignore */ }
            };
            await loadDiscussion();
            const postBtn = document.getElementById('postDiscussionBtn');
            if (postBtn && currentUser) {
                postBtn.addEventListener('click', async () => {
                    const txt = document.getElementById('discussionText');
                    const content = (txt && txt.value || '').trim();
                    if (!content) { showMessage('Enter a message'); return; }
                    try {
                        const res = await fetch(`${API_URL}/course/${courseId}/discussion`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ user_id: currentUser.id, content })
                        });
                        const data = await res.json();
                        if (res.ok) {
                            txt.value = '';
                            await loadDiscussion();
                        } else {
                            showMessage(data.error || 'Post failed');
                        }
                    } catch (e) { showMessage('Error: ' + e.message); }
                });
            }

            // Completion: check status and handle action (students)
            const completeBtn = document.getElementById('completeCourseBtn');
            if (completeBtn && currentUser && currentUser.role === 'student') {
                // Check completion status to set initial state
                try {
                    const cres = await fetch(`${API_URL}/course/${courseId}/completion?student_id=${currentUser.id}`);
                    const cdata = await cres.json();
                    if (cdata && cdata.completed) {
                        completeBtn.textContent = 'Completed';
                        completeBtn.disabled = true;
                    }
                } catch (_) {}
                completeBtn.addEventListener('click', async () => {
                    try {
                        const res = await fetch(`${API_URL}/course/complete`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ student_id: currentUser.id, course_id: courseId })
                        });
                        const data = await res.json();
                        if (res.ok) {
                            showMessage('Course marked as completed');
                            completeBtn.textContent = 'Completed';
                            completeBtn.disabled = true;
                            if (typeof loadStudentGrades === 'function') {
                                loadStudentGrades();
                            }
                        } else {
                            showMessage(data.error || 'Unable to mark as completed');
                        }
                    } catch (e) {
                        showMessage('Error: ' + e.message);
                    }
                });
            }
        } catch (error) {
            showMessage(`Error loading course details: ${error.message}`);
        }
    };
    
    // Create a new course
    createCourseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!currentUser || currentUser.role !== 'teacher') {
            showMessage('Only teachers can create courses');
            return;
        }
        
        const title = document.getElementById('courseTitle').value;
        const description = document.getElementById('courseDescription').value;
        const duration = document.getElementById('courseDuration').value;
        
        try {
            const response = await fetch(`${API_URL}/courses`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    title,
                    description,
                    duration,
                    teacher_id: currentUser.id
                })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                showMessage('Course created successfully!');
                createCourseForm.reset();
                loadTeacherCourses();
                showSection(dashboardSection);
            } else {
                showMessage(`Failed to create course: ${data.error}`);
            }
        } catch (error) {
            showMessage(`Error: ${error.message}`);
        }
    });
    
    // Enroll in a course
    const enrollInCourse = async (courseId) => {
        if (!currentUser) {
            showMessage('Please log in to enroll in courses');
            showSection(loginSection);
            return;
        }
        
        if (currentUser.role !== 'student') {
            showMessage('Only students can enroll in courses');
            return;
        }
        
        try {
            const response = await fetch(`${API_URL}/enroll`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    student_id: currentUser.id,
                    course_id: courseId
                })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                showMessage('Enrolled successfully!');
                loadEnrolledCourses();
                // Immediately open the course details (start the course)
                viewCourseDetails(courseId);
            } else {
                showMessage(`Enrollment failed: ${data.error}`);
            }
        } catch (error) {
            showMessage(`Error: ${error.message}`);
        }
    };
    
    // Load enrolled courses for student
    const loadEnrolledCourses = async () => {
        if (!currentUser || currentUser.role !== 'student') {
            return;
        }
        
        try {
            const response = await fetch(`${API_URL}/my-courses/${currentUser.id}`);
            const courses = await response.json();
            
            const enrolledCourses = document.getElementById('enrolledCourses');
            enrolledCourses.innerHTML = '';
            
            if (courses.length === 0) {
                enrolledCourses.innerHTML = '<p>You are not enrolled in any courses yet.</p>';
                return;
            }
            
            courses.forEach(course => {
                const courseItem = document.createElement('div');
                courseItem.className = 'dashboard-item';
                courseItem.innerHTML = `
                    <h4>${course.title}</h4>
                    <p>${course.description.substring(0, 100)}${course.description.length > 100 ? '...' : ''}</p>
                    <div class="course-meta">
                        <span><i class="fas fa-clock"></i> ${course.duration}</span>
                        <span><i class="fas fa-user"></i> ${course.teacher}</span>
                    </div>
                    <button class="btn secondary-btn view-course-btn" data-id="${course.id}">View Course</button>
                `;
                
                enrolledCourses.appendChild(courseItem);
                
                // Add event listener to the view course button
                const viewCourseBtn = courseItem.querySelector('.view-course-btn');
                viewCourseBtn.addEventListener('click', () => {
                    viewCourseDetails(course.id);
                });
            });
        } catch (error) {
            showMessage(`Error loading enrolled courses: ${error.message}`);
        }
    };
    
    // Removed duplicate loadTeacherCourses definition (enhanced version is declared later)
    
    // View students enrolled in a course
    const viewCourseStudents = async (courseId) => {
        if (!currentUser || currentUser.role !== 'teacher') {
            return;
        }
        
        try {
            const response = await fetch(`${API_URL}/course-students/${courseId}`);
            const students = await response.json();
            
            let message = `<h3>Enrolled Students</h3>`;
            
            if (students.length === 0) {
                message += `<p>No students enrolled in this course yet.</p>`;
            } else {
                message += `<ul>`;
                students.forEach(student => {
                    message += `<li>${student.name} (${student.email})</li>`;
                });
                message += `</ul>`;
            }
            
            modalMessage.innerHTML = message;
            messageModal.style.display = 'block';
        } catch (error) {
            showMessage(`Error loading course students: ${error.message}`);
        }
    };
    
    // Initialize the application
    const init = () => {
        checkAuth();
        showSection(homeSection);
    };
    
    init();
});

// Student: Load assignments and allow submission
    const loadStudentAssignments = async () => {
        if (!currentUser || currentUser.role !== 'student') return;
        try {
            const resp = await fetch(`${API_URL}/student/${currentUser.id}/assignments`);
            const assignments = await resp.json();
            const container = document.getElementById('studentAssignments');
            container.innerHTML = '';
            if (!Array.isArray(assignments) || assignments.length === 0) {
                container.innerHTML = '<p>No assignments yet.</p>';
                return;
            }
            assignments.forEach(a => {
                const item = document.createElement('div');
                item.className = 'dashboard-item';
                const due = new Date(a.due_date).toLocaleString();
                item.innerHTML = `
                    <h4>${a.title}</h4>
                    <p>${a.description.length > 120 ? a.description.substring(0,120) + '...' : a.description}</p>
                    <div class="course-meta"><span><i class="fas fa-calendar"></i> Due: ${due}</span></div>
                    ${a.submitted ? '<p class="success-text">Submitted</p>' : `
                    <div class="form-inline">
                        <textarea class="assignment-content" rows="3" placeholder="Enter your answer or a link"></textarea>
                        <button class="btn primary-btn submit-assignment-btn" data-id="${a.id}">Submit</button>
                    </div>
                    <div class="form-inline" style="margin-top:0.5rem">
                        <input type="file" class="assignment-file" />
                        <button class="btn secondary-btn upload-assignment-btn" data-id="${a.id}">Upload</button>
                    </div>`}
                `;
                container.appendChild(item);
                const submitBtn = item.querySelector('.submit-assignment-btn');
                if (submitBtn) {
                    submitBtn.addEventListener('click', async () => {
                        const contentEl = item.querySelector('.assignment-content');
                        const content = contentEl.value.trim();
                        if (!content) { showMessage('Please enter content'); return; }
                        try {
                            const res = await fetch(`${API_URL}/submit`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ student_id: currentUser.id, assignment_id: a.id, content })
                            });
                            const data = await res.json();
                            if (res.ok) {
                                showMessage('Submission successful');
                                loadStudentAssignments();
                            } else {
                                showMessage(data.error || 'Submission failed');
                            }
                        } catch (err) {
                            showMessage('Error: ' + err.message);
                        }
                    });
                }
                const uploadBtn = item.querySelector('.upload-assignment-btn');
                if (uploadBtn) {
                    uploadBtn.addEventListener('click', async () => {
                        const fileInput = item.querySelector('.assignment-file');
                        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
                            showMessage('Please choose a file to upload');
                            return;
                        }
                        const fd = new FormData();
                        fd.append('student_id', currentUser.id);
                        fd.append('assignment_id', a.id);
                        fd.append('file', fileInput.files[0]);
                        try {
                            const res = await fetch(`${API_URL}/submit-file`, {
                                method: 'POST',
                                body: fd
                            });
                            const data = await res.json();
                            if (res.ok) {
                                showMessage('File uploaded successfully');
                                loadStudentAssignments();
                            } else {
                                showMessage(data.error || 'Upload failed');
                            }
                        } catch (err) {
                            showMessage('Error: ' + err.message);
                        }
                    });
                }
            });
        } catch (error) {
            showMessage(`Error loading assignments: ${error.message}`);
        }
    };
// Teacher: Add create-assignment action to course cards
    const loadTeacherCourses = async () => {
        if (!currentUser || currentUser.role !== 'teacher') {
            return;
        }
        try {
            const response = await fetch(`${API_URL}/courses`);
            const allCourses = await response.json();
            const teacherCourses = allCourses.filter(course => course.teacher_id === currentUser.id || course.teacher === currentUser.name);
            const teacherCoursesElement = document.getElementById('teacherCourses');
            teacherCoursesElement.innerHTML = '';
            if (teacherCourses.length === 0) {
                teacherCoursesElement.innerHTML = '<p>You have not created any courses yet.</p>';
                return;
            }
            teacherCourses.forEach(course => {
                const courseItem = document.createElement('div');
                courseItem.className = 'dashboard-item';
                courseItem.innerHTML = `
                    <h4>${course.title}</h4>
                    <p>${course.description.substring(0, 100)}${course.description.length > 100 ? '...' : ''}</p>
                    <div class="course-meta">
                        <span><i class="fas fa-clock"></i> ${course.duration}</span>
                    </div>
                    <div class="course-actions">
                        <button class="btn secondary-btn view-course-btn" data-id="${course.id}">View Course</button>
                        <button class="btn secondary-btn view-students-btn" data-id="${course.id}">View Students</button>
                        <button class="btn secondary-btn create-assignment-btn" data-id="${course.id}">Create Assignment</button>
                    </div>
                `;
                teacherCoursesElement.appendChild(courseItem);
                const viewCourseBtn = courseItem.querySelector('.view-course-btn');
                viewCourseBtn.addEventListener('click', () => {
                    viewCourseDetails(course.id);
                });
                const viewStudentsBtn = courseItem.querySelector('.view-students-btn');
                viewStudentsBtn.addEventListener('click', () => {
                    viewCourseStudents(course.id);
                });
                const createAssignmentBtn = courseItem.querySelector('.create-assignment-btn');
                createAssignmentBtn.addEventListener('click', async () => {
                    const title = prompt('Assignment title');
                    if (!title) return;
                    const description = prompt('Assignment description');
                    if (!description) return;
                    const due = prompt('Due date (YYYY-MM-DD or ISO 8601)');
                    if (!due) return;
                    try {
                        const res = await fetch(`${API_URL}/assignments`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ title, description, due_date: due, course_id: course.id, teacher_id: currentUser.id })
                        });
                        const data = await res.json();
                        if (res.ok) {
                            showMessage('Assignment created');
                            loadTeacherAssignments();
                        } else {
                            showMessage(data.error || 'Failed to create assignment');
                        }
                    } catch (err) {
                        showMessage('Error: ' + err.message);
                    }
                });
            });
        } catch (error) {
            showMessage(`Error loading teacher courses: ${error.message}`);
        }
    };

// Teacher: Load assignments across teacher courses and view submissions
    const loadTeacherAssignments = async () => {
        if (!currentUser || currentUser.role !== 'teacher') return;
        try {
            const resp = await fetch(`${API_URL}/courses`);
            const allCourses = await resp.json();
            const teacherCourses = allCourses.filter(c => c.teacher_id === currentUser.id || c.teacher === currentUser.name);
            const container = document.getElementById('teacherAssignments');
            container.innerHTML = '';
            if (teacherCourses.length === 0) {
                container.innerHTML = '<p>You have not created any courses yet.</p>';
                return;
            }
            const results = await Promise.all(teacherCourses.map(async (c) => {
                try {
                    const r = await fetch(`${API_URL}/course/${c.id}/assignments`);
                    const list = await r.json();
                    return { course: c, assignments: Array.isArray(list) ? list : [] };
                } catch (_) {
                    return { course: c, assignments: [] };
                }
            }));
            let count = 0;
            results.forEach(({ course, assignments }) => {
                assignments.forEach(a => {
                    count++;
                    const item = document.createElement('div');
                    item.className = 'dashboard-item';
                    const due = new Date(a.due_date).toLocaleString();
                    item.innerHTML = `
                        <h4>${a.title} <span style="font-weight:400;color:#6c757d">(${course.title})</span></h4>
                        <p>${a.description.length > 120 ? a.description.substring(0,120) + '...' : a.description}</p>
                        <div class="course-meta"><span><i class="fas fa-calendar"></i> Due: ${due}</span></div>
                        <div class="course-actions">
                            <button class="btn secondary-btn view-submissions-btn" data-id="${a.id}">View Submissions</button>
                        </div>
                    `;
                    container.appendChild(item);
                    const btn = item.querySelector('.view-submissions-btn');
                    btn.addEventListener('click', () => loadAssignmentSubmissions(a.id));
                });
            });
            if (count === 0) {
                container.innerHTML = '<p>No assignments created yet.</p>';
            }
        } catch (e) {
            showMessage(`Error loading assignments: ${e.message}`);
        }
    };

    const loadAssignmentSubmissions = async (assignmentId) => {
        if (!currentUser || currentUser.role !== 'teacher') return;
        try {
            const res = await fetch(`${API_URL}/assignment/${assignmentId}/submissions?teacher_id=${currentUser.id}`);
            const subs = await res.json();
            const container = document.getElementById('studentSubmissions');
            container.innerHTML = '';
            if (!Array.isArray(subs) || subs.length === 0) {
                container.innerHTML = '<p>No submissions yet.</p>';
                return;
            }
            subs.forEach(s => {
                const item = document.createElement('div');
                item.className = 'dashboard-item';
                const when = new Date(s.submitted_at).toLocaleString();
                item.innerHTML = `
                    <h4>${s.student_name}</h4>
                    <p>${s.content && s.content.startsWith('/') ? `<a href="${s.content}" target="_blank">View uploaded file</a>` : (s.content && s.content.length > 200 ? s.content.substring(0,200) + '...' : (s.content || ''))}</p>
                    <div class="course-meta">
                        <span><i class="fas fa-clock"></i> ${when}</span>
                        ${'grade' in s && s.grade != null ? `<span><i class="fas fa-star"></i> Grade: ${s.grade}</span>` : ''}
                    </div>
                    ${s.feedback ? `<p>Feedback: ${s.feedback}</p>` : ''}
                    <div class="form-inline" style="margin-top:0.5rem">
                        <input type="number" step="0.1" min="0" max="100" class="grade-input" placeholder="Grade" value="${s.grade ?? ''}" style="width:120px" />
                        <input type="text" class="feedback-input" placeholder="Feedback" value="${s.feedback ? s.feedback.replace(/"/g, '&quot;') : ''}" style="flex:1" />
                        <button class="btn secondary-btn save-grade-btn" data-id="${s.id}">Save</button>
                    </div>
                `;
                container.appendChild(item);
                const saveBtn = item.querySelector('.save-grade-btn');
                saveBtn.addEventListener('click', async () => {
                    const gradeVal = item.querySelector('.grade-input').value;
                    const feedbackVal = item.querySelector('.feedback-input').value;
                    try {
                        const gres = await fetch(`${API_URL}/submission/${s.id}/grade`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ teacher_id: currentUser.id, grade: gradeVal !== '' ? Number(gradeVal) : null, feedback: feedbackVal })
                        });
                        const gdata = await gres.json();
                        if (gres.ok) {
                            showMessage('Saved grade');
                            loadAssignmentSubmissions(assignmentId);
                        } else {
                            showMessage(gdata.error || 'Failed to save grade');
                        }
                    } catch (e) {
                        showMessage('Error: ' + e.message);
                    }
                });
            });
        } catch (e) {
            showMessage(`Error loading submissions: ${e.message}`);
        }
    };