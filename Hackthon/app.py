from flask import Flask, request, jsonify, session, send_from_directory
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
import os
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()
app = Flask(__name__, static_folder='.', static_url_path='')
app.config['SECRET_KEY'] = 'your-secret-key'
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///lms.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), 'uploads')
CORS(app)

db = SQLAlchemy(app)

# Models
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    role = db.Column(db.String(10), nullable=False)  # 'student' or 'teacher'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Course(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=False)
    duration = db.Column(db.String(50), nullable=False)
    teacher_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    teacher = db.relationship('User', backref='courses')
    
class Enrollment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False)
    enrolled_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    student = db.relationship('User', backref='enrollments')
    course = db.relationship('Course', backref='enrollments')

class Assignment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=False)
    due_date = db.Column(db.DateTime, nullable=False)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    course = db.relationship('Course', backref='assignments')

class Submission(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.Text, nullable=False)
    student_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    assignment_id = db.Column(db.Integer, db.ForeignKey('assignment.id'), nullable=False)
    submitted_at = db.Column(db.DateTime, default=datetime.utcnow)
    grade = db.Column(db.Float, nullable=True)
    feedback = db.Column(db.Text, nullable=True)
    
    student = db.relationship('User', backref='submissions')
    assignment = db.relationship('Assignment', backref='submissions')

class Attendance(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False)
    date = db.Column(db.Date, nullable=False)
    present = db.Column(db.Boolean, default=False, nullable=False)
    marked_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    student = db.relationship('User', backref='attendance_records')
    course = db.relationship('Course', backref='attendance_records')

class DiscussionPost(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    course = db.relationship('Course', backref='discussion_posts')
    user = db.relationship('User')

class Material(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False)
    uploader_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    filename = db.Column(db.String(255), nullable=False)
    url = db.Column(db.String(512), nullable=False)
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    course = db.relationship('Course', backref='materials')
    uploader = db.relationship('User')

class Notification(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    title = db.Column(db.String(120), nullable=False)
    message = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    read = db.Column(db.Boolean, default=False)
    
    user = db.relationship('User')

def notify(user_ids, title, message):
    if not isinstance(user_ids, (list, tuple, set)):
        user_ids = [user_ids]
    for uid in user_ids:
        db.session.add(Notification(user_id=uid, title=title, message=message))
    db.session.commit()

# Routes
@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    
    # Check if user already exists
    existing_user = User.query.filter_by(email=data['email']).first()
    if existing_user:
        return jsonify({'error': 'Email already registered'}), 400
    
    # Create new user
    hashed_password = generate_password_hash(data['password'])
    new_user = User(
        name=data['name'],
        email=data['email'],
        password=hashed_password,
        role=data['role']
    )
    
    db.session.add(new_user)
    db.session.commit()
    
    return jsonify({'message': 'User registered successfully'}), 201

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    
    user = User.query.filter_by(email=data['email']).first()
    
    if not user or not check_password_hash(user.password, data['password']):
        return jsonify({'error': 'Invalid credentials'}), 401
    
    session['user_id'] = user.id
    
    return jsonify({
        'message': 'Login successful',
        'user': {
            'id': user.id,
            'name': user.name,
            'email': user.email,
            'role': user.role
        }
    }), 200

@app.route('/api/courses', methods=['GET'])
def get_courses():
    courses = Course.query.all()
    course_list = []
    for course in courses:
        course_list.append({
            'id': course.id,
            'title': course.title,
            'description': course.description,
            'duration': course.duration,
            'teacher': course.teacher.name,
            'teacher_id': course.teacher_id
        })
    return jsonify(course_list), 200

@app.route('/api/courses', methods=['POST'])
def create_course():
    data = request.json
    # Validate teacher
    teacher = User.query.get(data['teacher_id'])
    if not teacher or teacher.role != 'teacher':
        return jsonify({'error': 'Invalid teacher ID or role'}), 400
    new_course = Course(
        title=data['title'],
        description=data['description'],
        duration=data['duration'],
        teacher_id=teacher.id
    )
    db.session.add(new_course)
    db.session.commit()
    return jsonify({'message': 'Course created successfully', 'course_id': new_course.id}), 201

@app.route('/api/enroll', methods=['POST'])
def enroll_course():
    data = request.json
    # Validate student
    student = User.query.get(data['student_id'])
    if not student or student.role != 'student':
        return jsonify({'error': 'Invalid student ID or role'}), 400
    # Validate course
    course = Course.query.get(data['course_id'])
    if not course:
        return jsonify({'error': 'Course not found'}), 404
    # Check if already enrolled
    existing_enrollment = Enrollment.query.filter_by(
        student_id=student.id,
        course_id=course.id
    ).first()
    if existing_enrollment:
        return jsonify({'error': 'Already enrolled in this course'}), 400
    new_enrollment = Enrollment(student_id=student.id, course_id=course.id)
    db.session.add(new_enrollment)
    db.session.commit()
    return jsonify({'message': 'Enrolled successfully'}), 201

@app.route('/api/my-courses/<int:student_id>', methods=['GET'])
def get_enrolled_courses(student_id):
    enrollments = Enrollment.query.filter_by(student_id=student_id).all()
    courses = []
    
    for enrollment in enrollments:
        course = enrollment.course
        courses.append({
            'id': course.id,
            'title': course.title,
            'description': course.description,
            'duration': course.duration,
            'teacher': course.teacher.name
        })
    
    return jsonify(courses), 200

@app.route('/api/course-students/<int:course_id>', methods=['GET'])
def get_course_students(course_id):
    enrollments = Enrollment.query.filter_by(course_id=course_id).all()
    students = []
    
    for enrollment in enrollments:
        student = enrollment.student
        students.append({
            'id': student.id,
            'name': student.name,
            'email': student.email
        })
    
    return jsonify(students), 200

@app.route('/api/teacher-courses/<int:teacher_id>', methods=['GET'])
def get_teacher_courses(teacher_id):
    # Validate teacher
    teacher = User.query.get(teacher_id)
    if not teacher or teacher.role != 'teacher':
        return jsonify({'error': 'Invalid teacher ID or role'}), 400
    courses = Course.query.filter_by(teacher_id=teacher_id).all()
    course_list = []
    for course in courses:
        course_list.append({
            'id': course.id,
            'title': course.title,
            'description': course.description,
            'duration': course.duration,
        })
    return jsonify(course_list), 200

@app.route('/api/course/<int:course_id>', methods=['GET'])
def get_course_detail(course_id):
    course = Course.query.get(course_id)
    if not course:
        return jsonify({'error': 'Course not found'}), 404
    return jsonify({
        'id': course.id,
        'title': course.title,
        'description': course.description,
        'duration': course.duration,
        'teacher': course.teacher.name,
        'teacher_id': course.teacher_id
    }), 200

# Course Completion
@app.route('/api/course/complete', methods=['POST'])
def complete_course():
    data = request.json or {}
    student_id = data.get('student_id', None)
    course_id = data.get('course_id', None)
    if not all([student_id, course_id]):
        return jsonify({'error': 'Missing required fields'}), 400

    student = User.query.get(student_id)
    if not student or student.role != 'student':
        return jsonify({'error': 'Invalid student ID or role'}), 400

    course = Course.query.get(course_id)
    if not course:
        return jsonify({'error': 'Course not found'}), 404

    enrollment = Enrollment.query.filter_by(student_id=student.id, course_id=course.id).first()
    if not enrollment:
        return jsonify({'error': 'Student is not enrolled in this course'}), 403

    # Ensure a 'Course Completion' assignment exists for this course
    completion_assignment = Assignment.query.filter_by(course_id=course.id, title='Course Completion').first()
    if not completion_assignment:
        completion_assignment = Assignment(
            title='Course Completion',
            description='Auto-generated assignment to record course completion.',
            due_date=datetime.utcnow(),
            course_id=course.id
        )
        db.session.add(completion_assignment)
        db.session.commit()

    existing = Submission.query.filter_by(student_id=student.id, assignment_id=completion_assignment.id).first()
    if existing:
        return jsonify({'message': 'Already completed', 'submission_id': existing.id}), 200

    submission = Submission(
        content='Completed',
        student_id=student.id,
        assignment_id=completion_assignment.id,
        grade=100.0,
        feedback='Course completed'
    )
    db.session.add(submission)
    db.session.commit()

    return jsonify({'message': 'Course marked as completed', 'submission_id': submission.id}), 201

@app.route('/api/course/<int:course_id>/completion', methods=['GET'])
def get_course_completion(course_id):
    student_id = request.args.get('student_id', type=int)
    course = Course.query.get(course_id)
    if not course:
        return jsonify({'error': 'Course not found'}), 404
    if not student_id:
        return jsonify({'completed': False}), 200
    student = User.query.get(student_id)
    if not student or student.role != 'student':
        return jsonify({'error': 'Invalid student ID or role'}), 400
    completion_assignment = Assignment.query.filter_by(course_id=course.id, title='Course Completion').first()
    if not completion_assignment:
        return jsonify({'completed': False}), 200
    existing = Submission.query.filter_by(student_id=student.id, assignment_id=completion_assignment.id).first()
    return jsonify({'completed': existing is not None}), 200

# Assignment & Submission APIs
@app.route('/api/assignments', methods=['POST'])
def create_assignment():
    data = request.json
    title = data.get('title')
    description = data.get('description')
    due_date_str = data.get('due_date')
    course_id = data.get('course_id')
    teacher_id = data.get('teacher_id')

    if not all([title, description, due_date_str, course_id, teacher_id]):
        return jsonify({'error': 'Missing required fields'}), 400

    teacher = User.query.get(teacher_id)
    if not teacher or teacher.role != 'teacher':
        return jsonify({'error': 'Invalid teacher ID or role'}), 400

    course = Course.query.get(course_id)
    if not course:
        return jsonify({'error': 'Course not found'}), 404

    if course.teacher_id != teacher.id:
        return jsonify({'error': 'Teacher does not own this course'}), 403

    try:
        due_date = datetime.fromisoformat(due_date_str)
    except Exception:
        return jsonify({'error': 'Invalid due_date format. Use ISO 8601 (e.g., 2025-01-31 or 2025-01-31T23:59:00)'}), 400

    assignment = Assignment(
        title=title,
        description=description,
        due_date=due_date,
        course_id=course.id
    )
    db.session.add(assignment)
    db.session.commit()
    # Notify enrolled students
    enrolled = Enrollment.query.filter_by(course_id=course_id).all()
    student_ids = [e.student_id for e in enrolled]
    if student_ids:
        notify(student_ids, 'New Assignment', f"{title} has been posted in {assignment.course.title}")

    return jsonify({'message': 'Assignment created', 'assignment_id': assignment.id}), 201

@app.route('/api/course/<int:course_id>/assignments', methods=['GET'])
def get_course_assignments(course_id):
    course = Course.query.get(course_id)
    if not course:
        return jsonify({'error': 'Course not found'}), 404

    assignments = Assignment.query.filter_by(course_id=course.id).order_by(Assignment.due_date.asc()).all()
    result = []
    for a in assignments:
        result.append({
            'id': a.id,
            'title': a.title,
            'description': a.description,
            'due_date': a.due_date.isoformat(),
            'course_id': a.course_id
        })
    return jsonify(result), 200

# Discussion APIs
@app.route('/api/course/<int:course_id>/discussion', methods=['GET'])
def get_discussion(course_id):
    posts = DiscussionPost.query.filter_by(course_id=course_id).order_by(DiscussionPost.created_at.asc()).all()
    return jsonify([
        {
            'id': p.id,
            'user_id': p.user_id,
            'user_name': p.user.name,
            'content': p.content,
            'created_at': p.created_at.isoformat()
        } for p in posts
    ]), 200

@app.route('/api/course/<int:course_id>/discussion', methods=['POST'])
def post_discussion(course_id):
    data = request.json or {}
    user_id = data.get('user_id')
    content = data.get('content', '').strip()
    if not all([user_id, content]):
        return jsonify({'error': 'Missing required fields'}), 400
    course = Course.query.get(course_id)
    if not course:
        return jsonify({'error': 'Course not found'}), 404
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    post = DiscussionPost(course_id=course_id, user_id=user_id, content=content)
    db.session.add(post)
    db.session.commit()
    # Notify course members (enrolled students and teacher) except poster
    enrolled = Enrollment.query.filter_by(course_id=course_id).all()
    recipient_ids = {e.student_id for e in enrolled}
    recipient_ids.add(course.teacher_id)
    if user_id in recipient_ids:
        recipient_ids.remove(user_id)
    if recipient_ids:
        notify(list(recipient_ids), 'New Discussion Post', f"{user.name} posted in {course.title}.")
    return jsonify({'message': 'Posted', 'id': post.id}), 201

# Materials APIs
@app.route('/api/course/<int:course_id>/materials', methods=['GET'])
def list_materials(course_id):
    mats = Material.query.filter_by(course_id=course_id).order_by(Material.uploaded_at.desc()).all()
    return jsonify([
        {
            'id': m.id,
            'filename': m.filename,
            'url': m.url,
            'uploaded_at': m.uploaded_at.isoformat(),
            'uploader_id': m.uploader_id,
            'uploader_name': m.uploader.name
        } for m in mats
    ]), 200

@app.route('/api/course/<int:course_id>/materials', methods=['POST'])
def upload_material(course_id):
    uploader_id = request.form.get('uploader_id', type=int)
    file = request.files.get('file')
    if not all([uploader_id, file]):
        return jsonify({'error': 'Missing required fields'}), 400
    user = User.query.get(uploader_id)
    if not user:
        return jsonify({'error': 'Invalid uploader'}), 400
    course = Course.query.get(course_id)
    if not course:
        return jsonify({'error': 'Course not found'}), 404
    # Only teacher can upload materials for now
    if user.role != 'teacher' or user.id != course.teacher_id:
        return jsonify({'error': 'Only course teacher can upload materials'}), 403
    # Save file
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    subdir = os.path.join(app.config['UPLOAD_FOLDER'], f"materials", f"course_{course.id}")
    os.makedirs(subdir, exist_ok=True)
    filename = secure_filename(file.filename or 'material')
    path = os.path.join(subdir, filename)
    file.save(path)
    rel = os.path.relpath(path, os.path.dirname(__file__))
    public_url = f"/{rel.replace('\\', '/')}"
    m = Material(course_id=course.id, uploader_id=user.id, filename=filename, url=public_url)
    db.session.add(m)
    db.session.commit()
    # Notify enrolled students
    enrolled = Enrollment.query.filter_by(course_id=course.id).all()
    student_ids = [e.student_id for e in enrolled]
    if student_ids:
        notify(student_ids, 'New Material', f"New material uploaded in {course.title}: {filename}")
    return jsonify({'message': 'Uploaded', 'id': m.id, 'url': public_url}), 201

# Notifications APIs
@app.route('/api/notifications/<int:user_id>', methods=['GET'])
def get_notifications(user_id):
    notifs = Notification.query.filter_by(user_id=user_id).order_by(Notification.created_at.desc()).all()
    return jsonify([
        {
            'id': n.id,
            'title': n.title,
            'message': n.message,
            'created_at': n.created_at.isoformat(),
            'read': n.read
        } for n in notifs
    ]), 200

@app.route('/api/notifications/mark-read', methods=['POST'])
def mark_notifications_read():
    data = request.json or {}
    ids = data.get('ids', [])
    if not isinstance(ids, list) or not ids:
        return jsonify({'error': 'ids required'}), 400
    Notification.query.filter(Notification.id.in_(ids)).update({Notification.read: True}, synchronize_session=False)
    db.session.commit()
    return jsonify({'message': 'Marked read'}), 200

# Public config for frontend (safe: anon key only)
@app.route('/api/public-config', methods=['GET'])
def public_config():
    return jsonify({
        'supabaseUrl': os.getenv('SUPABASE_URL', ''),
        'supabaseKey': os.getenv('SUPABASE_ANON_KEY', '')
    }), 200

@app.route('/api/user/<int:user_id>', methods=['PUT'])
def update_user(user_id):
    data = request.json or {}
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    # Optional fields
    new_name = data.get('name')
    new_email = data.get('email')
    new_password = data.get('password')

    if new_email and new_email != user.email:
        exists = User.query.filter_by(email=new_email).first()
        if exists:
            return jsonify({'error': 'Email already in use'}), 400
        user.email = new_email
    if new_name:
        user.name = new_name
    if new_password:
        user.password = generate_password_hash(new_password)
    db.session.commit()
    return jsonify({'id': user.id, 'name': user.name, 'email': user.email, 'role': user.role}), 200

@app.route('/api/grades/student/<int:student_id>', methods=['GET'])
def get_student_grades(student_id):
    student = User.query.get(student_id)
    if not student or student.role != 'student':
        return jsonify({'error': 'Invalid student ID or role'}), 400

    # Fetch all submissions for the student
    subs = Submission.query.filter_by(student_id=student.id).order_by(Submission.submitted_at.desc()).all()
    if not subs:
        return jsonify([]), 200

    # Group by course via the assignment relation
    courses = {}
    for s in subs:
        course = s.assignment.course
        if not course:
            continue
        bucket = courses.setdefault(course.id, {
            'course_id': course.id,
            'course_title': course.title,
            'grades': [],
            'submissions': []
        })
        # Collect numeric grades only for averaging
        if s.grade is not None:
            bucket['grades'].append(float(s.grade))
        bucket['submissions'].append({
            'submission_id': s.id,
            'assignment_id': s.assignment_id,
            'assignment_title': s.assignment.title,
            'submitted_at': s.submitted_at.isoformat(),
            'grade': s.grade,
            'feedback': s.feedback,
            'content': s.content
        })

    result = []
    for _, v in courses.items():
        grades = v['grades']
        avg = (sum(grades) / len(grades)) if grades else None
        result.append({
            'course_id': v['course_id'],
            'course_title': v['course_title'],
            'average': avg,
            'count': len(grades),
            'submissions': v['submissions']
        })

    return jsonify(result), 200

@app.route('/api/submission/<int:submission_id>/grade', methods=['POST'])
def grade_submission(submission_id):
    data = request.json or {}
    teacher_id = data.get('teacher_id')
    grade = data.get('grade')
    feedback = data.get('feedback')

    if teacher_id is None:
        return jsonify({'error': 'teacher_id is required'}), 400

    sub = Submission.query.get(submission_id)
    if not sub:
        return jsonify({'error': 'Submission not found'}), 404

    teacher = User.query.get(teacher_id)
    if not teacher or teacher.role != 'teacher':
        return jsonify({'error': 'Invalid teacher ID or role'}), 400

    # Validate teacher owns the course of the assignment
    if sub.assignment.course.teacher_id != teacher.id:
        return jsonify({'error': 'Unauthorized'}), 403

    # Grade can be null to clear
    if grade is not None:
        try:
            sub.grade = float(grade)
        except Exception:
            return jsonify({'error': 'Invalid grade'}), 400
    sub.feedback = feedback

    db.session.commit()
    # Notify student
    notify(sub.student_id, 'Assignment Graded', f"Your assignment '{sub.assignment.title}' has been graded.")
    return jsonify({'message': 'Submission graded', 'submission_id': sub.id, 'grade': sub.grade, 'feedback': sub.feedback}), 200

# Attendance APIs
@app.route('/api/attendance/mark', methods=['POST'])
def mark_attendance():
    data = request.json
    teacher_id = data.get('teacher_id')
    course_id = data.get('course_id')
    date_str = data.get('date')  # YYYY-MM-DD
    records = data.get('records', [])  # [{student_id, present}]

    if not all([teacher_id, course_id]) or not isinstance(records, list):
        return jsonify({'error': 'Missing required fields'}), 400

    teacher = User.query.get(teacher_id)
    if not teacher or teacher.role != 'teacher':
        return jsonify({'error': 'Invalid teacher ID or role'}), 400

    course = Course.query.get(course_id)
    if not course:
        return jsonify({'error': 'Course not found'}), 404
    if course.teacher_id != teacher.id:
        return jsonify({'error': 'Teacher does not own this course'}), 403

    try:
        target_date = datetime.strptime(date_str, '%Y-%m-%d').date() if date_str else datetime.utcnow().date()
    except Exception:
        return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400

    # Only students enrolled can be marked
    enrolled_ids = {en.student_id for en in Enrollment.query.filter_by(course_id=course.id).all()}
    upserted = 0
    for r in records:
        sid = r.get('student_id')
        present = bool(r.get('present'))
        if sid not in enrolled_ids:
            continue
        rec = Attendance.query.filter_by(student_id=sid, course_id=course.id, date=target_date).first()
        if rec:
            rec.present = present
        else:
            rec = Attendance(student_id=sid, course_id=course.id, date=target_date, present=present)
            db.session.add(rec)
        upserted += 1
    db.session.commit()

    return jsonify({'message': 'Attendance saved', 'updated': upserted, 'date': target_date.isoformat()}), 200

@app.route('/api/attendance/course/<int:course_id>', methods=['GET'])
def get_course_attendance(course_id):
    date_str = request.args.get('date')  # YYYY-MM-DD
    teacher_id = request.args.get('teacher_id', type=int)
    course = Course.query.get(course_id)
    if not course:
        return jsonify({'error': 'Course not found'}), 404
    if teacher_id:
        teacher = User.query.get(teacher_id)
        if not teacher or teacher.role != 'teacher' or teacher.id != course.teacher_id:
            return jsonify({'error': 'Unauthorized'}), 403
    try:
        target_date = datetime.strptime(date_str, '%Y-%m-%d').date() if date_str else datetime.utcnow().date()
    except Exception:
        return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400

    records = Attendance.query.filter_by(course_id=course.id, date=target_date).all()
    result = [{'student_id': r.student_id, 'student_name': r.student.name, 'present': r.present} for r in records]
    return jsonify({'course_id': course.id, 'date': target_date.isoformat(), 'records': result}), 200

@app.route('/api/attendance/student/<int:student_id>', methods=['GET'])
def get_student_attendance_summary(student_id):
    student = User.query.get(student_id)
    if not student or student.role != 'student':
        return jsonify({'error': 'Invalid student ID or role'}), 400
    # For each enrolled course, compute summary
    enrollments = Enrollment.query.filter_by(student_id=student.id).all()
    summaries = []
    for en in enrollments:
        total = Attendance.query.filter_by(student_id=student.id, course_id=en.course_id).count()
        present = Attendance.query.filter_by(student_id=student.id, course_id=en.course_id, present=True).count()
        percent = (present / total * 100.0) if total > 0 else None
        summaries.append({
            'course_id': en.course_id,
            'course_title': en.course.title,
            'present': present,
            'total': total,
            'percent': percent
        })
    return jsonify(summaries), 200

@app.route('/api/student/<int:student_id>/assignments', methods=['GET'])
def get_student_assignments(student_id):
    student = User.query.get(student_id)
    if not student or student.role != 'student':
        return jsonify({'error': 'Invalid student ID or role'}), 400

    enrollments = Enrollment.query.filter_by(student_id=student.id).all()
    course_ids = [en.course_id for en in enrollments]
    if not course_ids:
        return jsonify([]), 200

    assignments = Assignment.query.filter(Assignment.course_id.in_(course_ids)).order_by(Assignment.due_date.asc()).all()

    result = []
    for a in assignments:
        existing_submission = Submission.query.filter_by(student_id=student.id, assignment_id=a.id).first()
        result.append({
            'id': a.id,
            'title': a.title,
            'description': a.description,
            'due_date': a.due_date.isoformat(),
            'course_id': a.course_id,
            'submitted': existing_submission is not None,
            'submission_id': existing_submission.id if existing_submission else None
        })
    return jsonify(result), 200

@app.route('/api/submit', methods=['POST'])
def submit_assignment():
    data = request.json
    student_id = data.get('student_id')
    assignment_id = data.get('assignment_id')
    content = (data.get('content') or '').strip()

    if not all([student_id, assignment_id, content]):
        return jsonify({'error': 'Missing required fields'}), 400

    student = User.query.get(student_id)
    if not student or student.role != 'student':
        return jsonify({'error': 'Invalid student ID or role'}), 400

    assignment = Assignment.query.get(assignment_id)
    if not assignment:
        return jsonify({'error': 'Assignment not found'}), 404

    # Ensure student is enrolled in the assignment's course
    enrollment = Enrollment.query.filter_by(student_id=student.id, course_id=assignment.course_id).first()
    if not enrollment:
        return jsonify({'error': 'Student is not enrolled in this course'}), 403

    # Prevent duplicate submission
    existing = Submission.query.filter_by(student_id=student.id, assignment_id=assignment.id).first()
    if existing:
        return jsonify({'error': 'Assignment already submitted'}), 400

    submission = Submission(content=content, student_id=student.id, assignment_id=assignment.id)
    db.session.add(submission)
    db.session.commit()

    return jsonify({'message': 'Submission successful', 'submission_id': submission.id}), 201

@app.route('/api/submit-file', methods=['POST'])
def submit_assignment_file():
    student_id = request.form.get('student_id', type=int)
    assignment_id = request.form.get('assignment_id', type=int)
    file = request.files.get('file')

    if not all([student_id, assignment_id, file]):
        return jsonify({'error': 'Missing required fields'}), 400

    student = User.query.get(student_id)
    if not student or student.role != 'student':
        return jsonify({'error': 'Invalid student ID or role'}), 400

    assignment = Assignment.query.get(assignment_id)
    if not assignment:
        return jsonify({'error': 'Assignment not found'}), 404

    enrollment = Enrollment.query.filter_by(student_id=student.id, course_id=assignment.course_id).first()
    if not enrollment:
        return jsonify({'error': 'Student is not enrolled in this course'}), 403

    existing = Submission.query.filter_by(student_id=student.id, assignment_id=assignment.id).first()
    if existing:
        return jsonify({'error': 'Assignment already submitted'}), 400

    # Save file
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    subdir = os.path.join(app.config['UPLOAD_FOLDER'], f"assignment_{assignment.id}", f"student_{student.id}")
    os.makedirs(subdir, exist_ok=True)
    filename = secure_filename(file.filename or f"submission_{student.id}_{assignment.id}")
    path = os.path.join(subdir, filename)
    file.save(path)

    # Public URL (served by static route from project root)
    rel_dir = os.path.relpath(path, os.path.dirname(__file__))
    public_url = f"/{rel_dir.replace('\\', '/')}"

    submission = Submission(content=public_url, student_id=student.id, assignment_id=assignment.id)
    db.session.add(submission)
    db.session.commit()

    return jsonify({'message': 'Submission successful', 'submission_id': submission.id, 'file_url': public_url}), 201

@app.route('/api/assignment/<int:assignment_id>/submissions', methods=['GET'])
def get_assignment_submissions(assignment_id):
    assignment = Assignment.query.get(assignment_id)
    if not assignment:
        return jsonify({'error': 'Assignment not found'}), 404

    # Optional: validate teacher ownership via query param
    teacher_id = request.args.get('teacher_id', type=int)
    if teacher_id:
        teacher = User.query.get(teacher_id)
        if not teacher or teacher.role != 'teacher' or assignment.course.teacher_id != teacher.id:
            return jsonify({'error': 'Unauthorized'}), 403

    subs = Submission.query.filter_by(assignment_id=assignment.id).order_by(Submission.submitted_at.desc()).all()
    result = []
    for s in subs:
        result.append({
            'id': s.id,
            'content': s.content,
            'student_id': s.student_id,
            'student_name': s.student.name,
            'submitted_at': s.submitted_at.isoformat(),
            'grade': s.grade,
            'feedback': s.feedback
        })
    return jsonify(result), 200

# Serve frontend files
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        existing_teacher = User.query.filter_by(role='teacher').first()
        if not existing_teacher:
            teacher = User(name='Demo Teacher', email='teacher@example.com', password=generate_password_hash('password'), role='teacher')
            db.session.add(teacher)
            db.session.commit()
            existing_teacher = teacher
        if Course.query.count() == 0 and existing_teacher:
            courses = [
                Course(title='Python Basics', description='Learn Python fundamentals: variables, loops, functions, and modules.', duration='6 weeks', teacher_id=existing_teacher.id),
                Course(title='Web Development 101', description='Intro to HTML, CSS, JavaScript, and building responsive web pages.', duration='8 weeks', teacher_id=existing_teacher.id),
                Course(title='Data Science Intro', description='Foundations of data analysis, visualization, and basic machine learning.', duration='10 weeks', teacher_id=existing_teacher.id)
            ]
            db.session.add_all(courses)
            db.session.commit()
    app.run(debug=True)