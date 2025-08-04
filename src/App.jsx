import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, setDoc, setLogLevel, serverTimestamp, query, orderBy, limit, getDocs, enableIndexedDbPersistence } from 'firebase/firestore';
import { Plus, Edit, Trash2, X, AlertTriangle, CheckCircle, Minus, Info, User, Calendar, Upload, ChevronDown, BookOpen, Download, Bell, TrendingDown, Wifi, WifiOff } from 'lucide-react';

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_API_KEY,
  authDomain: import.meta.env.VITE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_APP_ID
};
const appId = 'default-attendance-app';

// --- Initialize Firebase ---
let app;
let auth;
let db;

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    enableIndexedDbPersistence(db).catch((err) => {
        if (err.code === 'failed-precondition') {
            console.warn("Multiple tabs open, persistence can only be enabled in one tab at a time.");
        } else if (err.code === 'unimplemented') {
            console.warn("The current browser does not support all of the features required to enable persistence.");
        }
    });
} catch (e) {
    console.error("Firebase initialization error:", e);
}

// --- PWA Status Component ---
const PWAStatus = () => {
    const [status, setStatus] = useState({ online: navigator.onLine, message: '' });

    useEffect(() => {
        const goOnline = () => setStatus({ online: true, message: 'You are back online.' });
        const goOffline = () => setStatus({ online: false, message: 'You are offline. Changes will be saved locally.' });

        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);
        
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
             setStatus({ online: navigator.onLine, message: 'App is ready for offline use.' });
        }

        return () => {
            window.removeEventListener('online', goOnline);
            window.removeEventListener('offline', goOffline);
        };
    }, []);
    
     useEffect(() => {
        if (status.message) {
            const timer = setTimeout(() => setStatus(prev => ({ ...prev, message: '' })), 3000);
            return () => clearTimeout(timer);
        }
    }, [status.message]);


    if (!status.message) return null;

    return (
        <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg shadow-lg text-white flex items-center gap-2 transition-opacity duration-300 ${status.online ? 'bg-green-600' : 'bg-gray-600'}`}>
            {status.online ? <Wifi size={16} /> : <WifiOff size={16} />}
            <span className="text-sm">{status.message}</span>
        </div>
    );
};


// --- Main App Component ---
export default function App() {
    const [user, setUser] = useState(null);
    const [loadingAuth, setLoadingAuth] = useState(true);

    useEffect(() => {
        if (!auth) {
            setLoadingAuth(false);
            return;
        };
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
            } else {
                try {
                    await signInAnonymously(auth);
                } catch (error) {
                    console.error("Authentication error:", error);
                }
            }
            setLoadingAuth(false);
        });
        return () => unsubscribe();
    }, []);

    return (
        <div className="bg-gray-900 min-h-screen font-sans text-white">
            {loadingAuth ? (
                 <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div></div>
            ) : (
                <div className="container mx-auto max-w-5xl p-4">
                    {user ? <Dashboard userId={user.uid} /> : <p className="text-center">Authenticating...</p>}
                </div>
            )}
            <PWAStatus />
        </div>
    );
}


// --- Header Component ---
const Header = ({ onEditProfile, onTimetableClick, userName, hasTimetable }) => (
    <header className="mb-6 pb-4 border-b border-gray-700 flex flex-col md:flex-row items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
            <img 
                src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcScHAyGmrOU6jKruuXh2Tc69HUF9-XZ9poo0A&s" 
                alt="MDI Gurgaon Logo" 
                className="h-16 md:h-20 w-auto" 
                onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/200x80/1f2937/ffffff?text=Logo'; }}
            />
            <div>
                <h1 className="text-3xl md:text-4xl font-bold text-blue-400 text-center md:text-left">Attendance Tracker</h1>
                <div className="flex items-center justify-center md:justify-start gap-2 mt-1">
                    <p className="text-gray-300 text-lg">Welcome, {userName || 'Student'}!</p>
                    <button onClick={onEditProfile} className="text-gray-400 hover:text-blue-400 transition-colors"><Edit size={18} /></button>
                </div>
            </div>
        </div>
        <button 
            onClick={onTimetableClick} 
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-lg transition-all transform hover:scale-105 w-full md:w-auto justify-center"
        >
            {hasTimetable ? <Calendar size={20} /> : <Plus size={20} />}
            {hasTimetable ? 'View Timetable' : 'Add Timetable'}
        </button>
    </header>
);

// --- Dashboard Component ---
const Dashboard = ({ userId }) => {
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState({ name: '', timetableUrl: '' });
    const [isAddModalOpen, setAddModalOpen] = useState(false);
    const [isEditProfileModalOpen, setEditProfileModalOpen] = useState(false);
    const [profileModalMode, setProfileModalMode] = useState('profile');
    const [isTimetableModalOpen, setTimetableModalOpen] = useState(false);
    const [alertInfo, setAlertInfo] = useState({ isOpen: false, message: '' });
    const [initialProfileCheckDone, setInitialProfileCheckDone] = useState(false);
    const [openCourseId, setOpenCourseId] = useState(null);

    useEffect(() => {
        if (!userId) return;

        const profileDocRef = doc(db, `artifacts/${appId}/users/${userId}/profile`, 'info');
        const unsubscribeProfile = onSnapshot(profileDocRef, (docSnap) => {
            const data = docSnap.exists() ? docSnap.data() : { name: null, timetableUrl: null };
            setProfile({ name: data.name || '', timetableUrl: data.timetableUrl || '' });

            if (!initialProfileCheckDone) {
                if (!data.name) {
                    setProfileModalMode('profile');
                    setEditProfileModalOpen(true); 
                }
                setInitialProfileCheckDone(true);
            }
        });

        const coursesCollectionPath = `artifacts/${appId}/users/${userId}/courses`;
        const unsubscribeCourses = onSnapshot(collection(db, coursesCollectionPath), (snapshot) => {
            setCourses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        }, (error) => {
            console.error("Error fetching courses:", error);
            setLoading(false);
        });

        return () => {
            unsubscribeProfile();
            unsubscribeCourses();
        };
    }, [userId, initialProfileCheckDone]);

    const addCourse = async (course) => {
        try {
            const newCourseRef = await addDoc(collection(db, `artifacts/${appId}/users/${userId}/courses`), course);
            setAddModalOpen(false);
            setOpenCourseId(newCourseRef.id);
        } catch (error) { console.error("Error adding course:", error); }
    };

    const saveProfile = async (newName, timetableBase64) => {
        if (!auth.currentUser) {
            setAlertInfo({ isOpen: true, message: "Authentication error. Please refresh and try again." });
            return;
        }
        
        const profileDocRef = doc(db, `artifacts/${appId}/users/${auth.currentUser.uid}/profile`, 'info');
        
        try {
            await setDoc(profileDocRef, { name: newName.trim(), timetableUrl: timetableBase64 }, { merge: true });
            setEditProfileModalOpen(false);
        } catch (error) { 
            console.error("Error saving profile:", error); 
            setAlertInfo({isOpen: true, message: "Failed to save profile."});
        }
    };

    const handleTimetableClick = () => {
        if (profile.timetableUrl) {
            setTimetableModalOpen(true);
        } else {
            setProfileModalMode('timetable');
            setEditProfileModalOpen(true);
        }
    };
    
    const handleEditProfileClick = () => {
        setProfileModalMode('profile');
        setEditProfileModalOpen(true);
    };

    const handleChangeTimetable = () => {
        setTimetableModalOpen(false);
        setProfileModalMode('timetable');
        setEditProfileModalOpen(true);
    };

    const handleToggleCourse = (courseId) => {
        setOpenCourseId(prevOpenId => (prevOpenId === courseId ? null : courseId));
    };
    
    const exportAllData = async () => {
        let csvContent = "Course Name,Date,Status\n";
        for (const course of courses) {
            const logCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/courses/${course.id}/log`);
            const q = query(logCollectionRef, orderBy('timestamp', 'asc'));
            const logSnapshot = await getDocs(q);
            logSnapshot.forEach(logDoc => {
                const logData = logDoc.data();
                const date = logData.timestamp ? new Date(logData.timestamp.seconds * 1000).toLocaleString() : 'N/A';
                csvContent += `"${course.name}","${date}","${logData.status}"\n`;
            });
        }

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", "all_attendance_data.csv");
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    return (
        <>
            <Header 
                onEditProfile={handleEditProfileClick}
                onTimetableClick={handleTimetableClick}
                userName={profile.name}
                hasTimetable={!!profile.timetableUrl}
            />
            <main>
                <SmartReminders courses={courses} userId={userId} />
                <TodaysClasses courses={courses} />
                <div className="flex justify-center items-center gap-4 mb-6">
                    <button onClick={() => setAddModalOpen(true)} className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg shadow-lg transition-transform transform hover:scale-105">
                        <Plus size={20} /> Add New Course
                    </button>
                    <button onClick={exportAllData} className="flex items-center gap-2 px-6 py-3 bg-gray-600 hover:bg-gray-700 rounded-lg shadow-lg transition-transform transform hover:scale-105">
                        <Download size={20} /> Export All Data
                    </button>
                </div>

                {loading ? <p className="text-center text-gray-400">Loading courses...</p> : courses.length === 0 ? (
                    <div className="text-center bg-gray-800 p-8 rounded-lg">
                        <h3 className="text-xl font-semibold">No courses yet!</h3>
                        <p className="text-gray-400 mt-2">Click "Add New Course" to get started.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {courses.map(course => <CourseAccordion key={course.id} course={course} userId={userId} setAlertInfo={setAlertInfo} isOpen={openCourseId === course.id} onToggle={() => handleToggleCourse(course.id)} />)}
                    </div>
                )}

                {isAddModalOpen && <AddCourseModal onClose={() => setAddModalOpen(false)} onAddCourse={addCourse} />}
                {isEditProfileModalOpen && <EditProfileModal mode={profileModalMode} currentProfile={profile} onSave={saveProfile} onClose={() => setEditProfileModalOpen(false)} />}
                {isTimetableModalOpen && <TimetableModal timetableUrl={profile.timetableUrl} onClose={() => setTimetableModalOpen(false)} onChangeTimetable={handleChangeTimetable} />}
                {alertInfo.isOpen && <AlertModal message={alertInfo.message} onClose={() => setAlertInfo({ isOpen: false, message: '' })} />}
            </main>
        </>
    );
};

// --- SmartReminders Component ---
const SmartReminders = ({ courses, userId }) => {
    const [reminders, setReminders] = useState([]);

    useEffect(() => {
        const calculateReminders = async () => {
            const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
            const currentDay = days[new Date().getDay()];
            const coursesToday = courses.filter(course => 
                course.schedule && course.schedule.days && course.schedule.days.includes(currentDay)
            );

            const newReminders = [];

            for (const course of coursesToday) {
                const logCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/courses/${course.id}/log`);
                const logSnapshot = await getDocs(logCollectionRef);
                const missed = logSnapshot.docs.filter(doc => doc.data().status === 'absent').length;
                
                const total = course.totalSessions || 1;
                const maxMissable = Math.floor(total * 0.2);
                const bunksLeft = maxMissable - missed;

                if (bunksLeft <= 1) {
                    newReminders.push({ ...course, bunksLeft });
                }
            }
            setReminders(newReminders);
        };

        if (courses.length > 0 && userId) {
            calculateReminders();
        }
    }, [courses, userId]);

    if (reminders.length === 0) return null;

    return (
        <div className="bg-yellow-900/50 border border-yellow-500 rounded-xl p-4 mb-6">
            <h3 className="text-xl font-bold text-center text-yellow-300 mb-3 flex items-center justify-center gap-2">
                <Bell size={20} /> Smart Reminders
            </h3>
            <div className="space-y-2">
                {reminders.map(course => (
                    <div key={course.id} className="bg-yellow-800/50 p-3 rounded-lg text-center">
                        <p className="font-semibold text-yellow-200">
                            Don't miss <span className="font-bold">{course.name}</span> today at {course.schedule.time || 'class'}!
                        </p>
                        <p className="text-sm text-yellow-300">
                            You only have <span className="font-bold">{course.bunksLeft >= 0 ? course.bunksLeft : 0}</span> bunk(s) left.
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
};


// --- TodaysClasses Component ---
const TodaysClasses = ({ courses }) => {
    const [today, setToday] = useState('');
    const [todaysCourses, setTodaysCourses] = useState([]);

    useEffect(() => {
        const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const now = new Date();
        const currentDay = days[now.getDay()];
        setToday(currentDay);

        const scheduledToday = courses.filter(course => 
            course.schedule && course.schedule.days && course.schedule.days.includes(currentDay)
        ).sort((a, b) => {
            const timeA = a.schedule.time || "00:00";
            const timeB = b.schedule.time || "00:00";
            return timeA.localeCompare(timeB);
        });
        setTodaysCourses(scheduledToday);
    }, [courses]);

    if(todaysCourses.length === 0) return null;

    return (
        <div className="bg-gray-800 rounded-xl p-4 mb-6">
            <h3 className="text-xl font-bold text-center text-blue-300 mb-3">Today's Schedule ({today})</h3>
            <div className="space-y-2">
                {todaysCourses.map(course => (
                    <div key={course.id} className="bg-gray-900 p-3 rounded-lg flex justify-between items-center">
                        <span className="font-semibold">{course.name}</span>
                        <span className="text-sm text-gray-400">{course.schedule.time || 'No time set'}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};


// --- CourseAccordion Component ---
const CourseAccordion = ({ course, userId, setAlertInfo, isOpen, onToggle }) => {
    const [isEditModalOpen, setEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
    const [isLogModalOpen, setLogModalOpen] = useState(false);
    const [attendanceLog, setAttendanceLog] = useState([]);
    const [notes, setNotes] = useState(course.notes || '');
    const [expectedGrade, setExpectedGrade] = useState('A+');

    const attended = attendanceLog.filter(entry => entry.status === 'present').length;
    const missed = attendanceLog.filter(entry => entry.status === 'absent').length;

    const total = course.totalSessions || 1;
    const totalAttended = attended + missed;
    const attendancePercentage = totalAttended > 0 ? Math.round((attended / totalAttended) * 100) : 0;
    const sessionsLeft = total - totalAttended;

    const maxMissable = Math.floor(total * 0.2);
    const bunksLeft = maxMissable - missed;

    const gradeDrops = missed > 4 ? missed - 4 : 0;
    const grades = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F'];
    
    const calculateFinalGrade = () => {
        if (missed >= 10) return 'I';
        const startIndex = grades.indexOf(expectedGrade);
        if (startIndex === -1) return 'N/A';
        const finalIndex = Math.min(startIndex + gradeDrops, grades.length - 1);
        return grades[finalIndex];
    };
    const finalGrade = calculateFinalGrade();

    useEffect(() => {
        const logCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/courses/${course.id}/log`);
        const q = query(logCollectionRef, orderBy('timestamp', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setAttendanceLog(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, [userId, course.id]);

     useEffect(() => {
        const handler = setTimeout(() => {
            if (notes !== (course.notes || '')) {
                const courseDocRef = doc(db, `artifacts/${appId}/users/${userId}/courses`, course.id);
                updateDoc(courseDocRef, { notes: notes });
            }
        }, 1000);

        return () => {
            clearTimeout(handler);
        };
    }, [notes, course.notes, userId, course.id]);

    const getProgressBarColor = () => {
        if (attendancePercentage >= 80) return 'bg-green-500';
        if (attendancePercentage >= 60) return 'bg-yellow-500';
        return 'bg-red-500';
    };

    const handleAttendance = async (type) => {
        if (sessionsLeft <= 0) {
            setAlertInfo({ isOpen: true, message: "All sessions are accounted for. Edit the course to increase total sessions if needed." });
            return;
        }
        const logCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/courses/${course.id}/log`);
        await addDoc(logCollectionRef, { status: type, timestamp: serverTimestamp() });
    };

    const handleUndo = async (type) => {
        const logCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/courses/${course.id}/log`);
        const q = query(logCollectionRef, orderBy('timestamp', 'desc'), limit(1));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const lastLogDoc = querySnapshot.docs[0];
            if (lastLogDoc.data().status === type) {
                await deleteDoc(lastLogDoc.ref);
            } else {
                setAlertInfo({isOpen: true, message: `No recent '${type}' entry to undo.`});
            }
        }
    };

    const updateCourse = async (updatedCourse) => {
        const courseDocRef = doc(db, `artifacts/${appId}/users/${userId}/courses`, course.id);
        await updateDoc(courseDocRef, updatedCourse);
        setEditModalOpen(false);
    };

    const deleteCourse = async () => {
        const courseDocRef = doc(db, `artifacts/${appId}/users/${userId}/courses`, course.id);
        await deleteDoc(courseDocRef);
        setDeleteModalOpen(false);
    };
    
    const exportLog = () => {
        let csvContent = "Date,Status\n";
        attendanceLog.slice().reverse().forEach(entry => {
            const date = entry.timestamp ? new Date(entry.timestamp.seconds * 1000).toLocaleString() : 'N/A';
            csvContent += `"${date}","${entry.status}"\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `${course.name}_attendance_log.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    return (
        <div className="bg-gray-800 rounded-xl shadow-lg transition-all duration-300 border-2 border-transparent hover:border-blue-500">
            <div className="flex justify-between items-center p-4 cursor-pointer" onClick={onToggle}>
                <h3 className="text-xl font-bold text-gray-100">{course.name}</h3>
                <div className="flex items-center gap-4">
                     <span className={`text-lg font-bold ${getProgressBarColor().replace('bg-', 'text-')}`}>{totalAttended > 0 ? `${attendancePercentage}%` : 'N/A'}</span>
                    <ChevronDown className={`transform transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                </div>
            </div>
            <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isOpen ? 'max-h-[1000px]' : 'max-h-0'}`}>
                <div className="p-5 border-t border-gray-700">
                    {course.professorName && (
                        <div className="flex items-center gap-2 text-sm text-gray-400 mb-3">
                            <User size={14} />
                            <span>{course.professorName}</span>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-gray-300 mb-4">
                        <div className="flex justify-between"><span>Total Sessions:</span> <span className="font-semibold">{total}</span></div>
                        <div className="flex justify-between"><span>Attended:</span> <span className="font-semibold text-green-400">{attended}</span></div>
                        <div className="flex justify-between"><span>Missed:</span> <span className="font-semibold text-red-400">{missed}</span></div>
                        <div className="flex justify-between"><span>Sessions Left:</span> <span className="font-semibold">{sessionsLeft < 0 ? 0 : sessionsLeft}</span></div>
                    </div>
                     <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-gray-900 p-3 rounded-lg text-center flex flex-col justify-center">
                            <h4 className="font-bold text-sm text-blue-300 mb-2">Bunk Meter</h4>
                            <div className="flex items-baseline justify-center">
                                <span className="text-3xl font-bold">{bunksLeft >= 0 ? bunksLeft : 0}</span>
                                <span className="ml-2 text-xs text-gray-400">classes left</span>
                            </div>
                        </div>
                        <div className="bg-gray-900 p-3 rounded-lg text-center flex flex-col justify-between">
                            <h4 className="font-bold text-sm text-red-300 flex items-center justify-center gap-1"><TrendingDown size={14}/> Grade Drop</h4>
                            <div className="flex justify-around items-baseline mt-1">
                                <div className="text-center">
                                    <label className="block text-xs text-gray-400">Expected</label>
                                    <select value={expectedGrade} onChange={(e) => setExpectedGrade(e.target.value)} className="bg-gray-700 text-white rounded-md px-1 py-0.5 text-center font-bold text-lg focus:outline-none focus:ring-2 focus:ring-red-400">
                                        {grades.map(g => <option key={g} value={g}>{g}</option>)}
                                    </select>
                                </div>
                                <div className="text-center">
                                    <label className="block text-xs text-gray-400">Projected</label>
                                    <p className="text-lg font-bold text-red-400">{finalGrade}</p>
                                </div>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">({gradeDrops} drop{gradeDrops !== 1 ? 's' : ''} applied)</p>
                        </div>
                    </div>
                    <div className="mb-4">
                        <div className="w-full bg-gray-700 rounded-full h-2.5">
                            <div className={`${getProgressBarColor()} h-2.5 rounded-full`} style={{ width: `${totalAttended > 0 ? attendancePercentage : 0}%` }}></div>
                        </div>
                         {attendancePercentage < 80 && totalAttended > 0 && (
                            <div className="flex items-center text-yellow-400 text-xs mt-2">
                                <AlertTriangle size={14} className="mr-1"/>
                                Attendance is below 80%!
                            </div>
                        )}
                    </div>
                     <div className="mb-4">
                        <label className="block text-gray-300 text-sm font-bold mb-2">Notes</label>
                        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add notes, deadlines, etc..." className="w-full h-24 p-2 bg-gray-900 rounded-md text-white border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
                    </div>
                    <div>
                        <div className="flex gap-2 mb-2">
                            <button onClick={() => handleAttendance('present')} disabled={sessionsLeft <= 0} className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors"><CheckCircle size={16} /> Present</button>
                            <button onClick={() => handleAttendance('absent')} disabled={sessionsLeft <= 0} className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors"><X size={16} /> Absent</button>
                        </div>
                         <div className="flex gap-2">
                            <button onClick={() => handleUndo('present')} disabled={attended <= 0} className="w-1/2 flex items-center justify-center gap-1 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 py-1 px-2 rounded-md transition-colors"><Minus size={12} /> Undo Present</button>
                            <button onClick={() => handleUndo('absent')} disabled={missed <= 0} className="w-1/2 flex items-center justify-center gap-1 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 py-1 px-2 rounded-md transition-colors"><Minus size={12} /> Undo Absent</button>
                        </div>
                    </div>
                     <div className="flex justify-between items-center mt-4">
                         <button onClick={() => setLogModalOpen(true)} className="flex items-center gap-2 text-sm text-blue-400 hover:underline">
                            <BookOpen size={16} /> View Log
                        </button>
                        <div className="flex justify-end gap-2">
                            <button onClick={exportLog} className="text-gray-400 hover:text-green-400 p-2"><Download size={18} /></button>
                            <button onClick={() => setEditModalOpen(true)} className="text-gray-400 hover:text-blue-400 p-2"><Edit size={18} /></button>
                            <button onClick={() => setDeleteModalOpen(true)} className="text-gray-400 hover:text-red-400 p-2"><Trash2 size={18} /></button>
                        </div>
                    </div>
                </div>
            </div>
            {isEditModalOpen && <EditCourseModal course={course} onClose={() => setEditModalOpen(false)} onUpdateCourse={updateCourse} />}
            {isDeleteModalOpen && <DeleteConfirmationModal courseName={course.name} onClose={() => setDeleteModalOpen(false)} onDelete={deleteCourse} />}
            {isLogModalOpen && <AttendanceLogModal log={attendanceLog} courseId={course.id} userId={userId} onClose={() => setLogModalOpen(false)} />}
        </div>
    );
};


// --- Modal Components ---
const Modal = ({ children, onClose, size = 'max-w-md' }) => (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
        <div className={`bg-gray-800 rounded-lg shadow-xl w-full ${size} m-auto relative p-6 border border-gray-700`}>
            <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-white z-10"><X size={24} /></button>
            {children}
        </div>
    </div>
);

const EditProfileModal = ({ mode, currentProfile, onSave, onClose }) => {
    const [name, setName] = useState(currentProfile.name || '');
    const [timetableBase64, setTimetableBase64] = useState(currentProfile.timetableUrl || '');
    const isInitialSetup = !currentProfile.name;

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setTimetableBase64(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleRemoveImage = () => {
        setTimetableBase64('');
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const nameToSave = (mode === 'profile' || isInitialSetup) ? name : currentProfile.name;
        const timetableToSave = (mode === 'timetable' || isInitialSetup) ? timetableBase64 : currentProfile.timetableUrl;
        
        if (isInitialSetup && !nameToSave.trim()) {
            alert("Please enter your name to set up your profile.");
            return;
        }
        
        onSave(nameToSave, timetableToSave);
    };

    return (
        <Modal onClose={onClose}>
            <h2 className="text-2xl font-bold mb-6 text-white">
                {isInitialSetup ? 'Welcome! Set up your profile' : mode === 'profile' ? 'Edit Your Name' : 'Update Timetable'}
            </h2>
            <form onSubmit={handleSubmit}>
                {(mode === 'profile' || isInitialSetup) && (
                    <div className="mb-4">
                        <label htmlFor="userName" className="block text-gray-300 text-sm font-bold mb-2">Name</label>
                        <input type="text" id="userName" value={name} onChange={(e) => setName(e.target.value)} className="shadow appearance-none border border-gray-600 rounded w-full py-2 px-3 bg-gray-700 text-white leading-tight focus:outline-none focus:shadow-outline focus:border-blue-500" required autoFocus/>
                    </div>
                )}
                {(mode === 'timetable' || isInitialSetup) && (
                    <div className="mb-4">
                        <label className="block text-gray-300 text-sm font-bold mb-2">Timetable Image</label>
                        {timetableBase64 ? (
                            <div className="mt-2 text-center">
                                <img src={timetableBase64} alt="Timetable preview" className="max-w-full max-h-60 mx-auto rounded-md mb-2"/>
                                <button type="button" onClick={handleRemoveImage} className="text-sm text-red-400 hover:text-red-300">Remove Image</button>
                            </div>
                        ) : (
                            <label htmlFor="timetableUpload" className="w-full flex items-center justify-center px-4 py-3 bg-gray-700 text-gray-300 rounded-lg cursor-pointer hover:bg-gray-600 hover:text-white transition-colors">
                                <Upload size={20} className="mr-2"/>
                                <span>Choose an image...</span>
                            </label>
                        )}
                        <input type="file" id="timetableUpload" accept="image/*" onChange={handleFileChange} className="hidden"/>
                    </div>
                )}
                <div className="flex items-center justify-end gap-3 mt-6">
                    <button type="button" onClick={onClose} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">Cancel</button>
                    <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">Save</button>
                </div>
            </form>
        </Modal>
    );
};

const TimetableModal = ({ timetableUrl, onClose, onChangeTimetable }) => (
    <Modal onClose={onClose} size="max-w-3xl">
        <h2 className="text-2xl font-bold mb-4 text-white">Your Timetable</h2>
        <div className="bg-gray-900 p-2 rounded-lg">
            <img src={timetableUrl} alt="Class Timetable" className="max-w-full max-h-[75vh] mx-auto rounded-md" />
        </div>
        <div className="flex justify-center mt-4">
            <button 
                onClick={onChangeTimetable}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg shadow-lg transition-all transform hover:scale-105"
            >
                <Edit size={18} />
                Change Timetable
            </button>
        </div>
    </Modal>
);

const AddCourseModal = ({ onClose, onAddCourse }) => {
    const [name, setName] = useState('');
    const [professorName, setProfessorName] = useState('');
    const [totalSessions, setTotalSessions] = useState('');
    const [schedule, setSchedule] = useState({ days: [], time: '' });
    const [error, setError] = useState('');

    const handleDayChange = (day) => {
        setSchedule(prev => {
            const newDays = prev.days.includes(day)
                ? prev.days.filter(d => d !== day)
                : [...prev.days, day];
            return { ...prev, days: newDays };
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!name.trim() || !totalSessions || parseInt(totalSessions, 10) <= 0) {
            setError("Please enter a valid course name and a positive number for total sessions.");
            return;
        }
        setError('');
        onAddCourse({ name: name.trim(), professorName: professorName.trim(), totalSessions: parseInt(totalSessions, 10), notes: '', schedule });
    };

    const daysOfWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

    return (
        <Modal onClose={onClose}>
            <h2 className="text-2xl font-bold mb-4 text-white">Add New Course</h2>
            <form onSubmit={handleSubmit}>
                <div className="mb-4">
                    <label htmlFor="courseName" className="block text-gray-300 text-sm font-bold mb-2">Course Name</label>
                    <input type="text" id="courseName" value={name} onChange={(e) => setName(e.target.value)} className="shadow appearance-none border border-gray-600 rounded w-full py-2 px-3 bg-gray-700 text-white leading-tight focus:outline-none focus:shadow-outline focus:border-blue-500" required />
                </div>
                <div className="mb-4">
                    <label htmlFor="professorName" className="block text-gray-300 text-sm font-bold mb-2">Professor Name (Optional)</label>
                    <input type="text" id="professorName" value={professorName} onChange={(e) => setProfessorName(e.target.value)} className="shadow appearance-none border border-gray-600 rounded w-full py-2 px-3 bg-gray-700 text-white leading-tight focus:outline-none focus:shadow-outline focus:border-blue-500" />
                </div>
                <div className="mb-4">
                    <label htmlFor="totalSessions" className="block text-gray-300 text-sm font-bold mb-2">Total Number of Sessions</label>
                    <input type="number" id="totalSessions" value={totalSessions} onChange={(e) => setTotalSessions(e.target.value)} className="shadow appearance-none border border-gray-600 rounded w-full py-2 px-3 bg-gray-700 text-white leading-tight focus:outline-none focus:shadow-outline focus:border-blue-500" required min="1" />
                </div>
                <div className="mb-4">
                    <label className="block text-gray-300 text-sm font-bold mb-2">Class Schedule (Optional)</label>
                    <div className="flex flex-wrap gap-2 mb-2">
                        {daysOfWeek.map(day => (
                            <button key={day} type="button" onClick={() => handleDayChange(day)} className={`px-3 py-1 text-sm rounded-full ${schedule.days.includes(day) ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}>
                                {day.substring(0,3)}
                            </button>
                        ))}
                    </div>
                     <label htmlFor="classTime" className="block text-gray-300 text-sm font-bold mb-2">Time</label>
                    <input type="time" id="classTime" value={schedule.time} onChange={(e) => setSchedule(prev => ({...prev, time: e.target.value}))} className="shadow appearance-none border border-gray-600 rounded w-full py-2 px-3 bg-gray-700 text-white leading-tight focus:outline-none focus:shadow-outline focus:border-blue-500" />
                </div>
                {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
                <div className="flex items-center justify-end gap-3">
                    <button type="button" onClick={onClose} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">Cancel</button>
                    <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">Add Course</button>
                </div>
            </form>
        </Modal>
    );
};

const EditCourseModal = ({ course, onClose, onUpdateCourse }) => {
    const [name, setName] = useState(course.name);
    const [professorName, setProfessorName] = useState(course.professorName || '');
    const [totalSessions, setTotalSessions] = useState(course.totalSessions);
    const [schedule, setSchedule] = useState(course.schedule || { days: [], time: '' });
    const [error, setError] = useState('');

    const handleDayChange = (day) => {
        setSchedule(prev => {
            const newDays = prev.days.includes(day)
                ? prev.days.filter(d => d !== day)
                : [...prev.days, day];
            return { ...prev, days: newDays };
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const attendedTotal = course.attendedSessions + course.missedSessions;
        if (parseInt(totalSessions, 10) < attendedTotal) {
            setError(`Total sessions cannot be less than the number of sessions already recorded (${attendedTotal}).`);
            return;
        }
        setError('');
        onUpdateCourse({ ...course, name, professorName, totalSessions: parseInt(totalSessions, 10), schedule });
    };
    
    const daysOfWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

    return (
        <Modal onClose={onClose}>
            <h2 className="text-2xl font-bold mb-4 text-white">Edit Course</h2>
            <form onSubmit={handleSubmit}>
                <div className="mb-4">
                    <label htmlFor="editCourseName" className="block text-gray-300 text-sm font-bold mb-2">Course Name</label>
                    <input type="text" id="editCourseName" value={name} onChange={(e) => setName(e.target.value)} className="shadow appearance-none border border-gray-600 rounded w-full py-2 px-3 bg-gray-700 text-white leading-tight focus:outline-none focus:shadow-outline focus:border-blue-500" required />
                </div>
                <div className="mb-4">
                    <label htmlFor="editProfessorName" className="block text-gray-300 text-sm font-bold mb-2">Professor Name (Optional)</label>
                    <input type="text" id="editProfessorName" value={professorName} onChange={(e) => setProfessorName(e.target.value)} className="shadow appearance-none border border-gray-600 rounded w-full py-2 px-3 bg-gray-700 text-white leading-tight focus:outline-none focus:shadow-outline focus:border-blue-500" />
                </div>
                <div className="mb-4">
                    <label htmlFor="editTotalSessions" className="block text-gray-300 text-sm font-bold mb-2">Total Number of Sessions</label>
                    <input type="number" id="editTotalSessions" value={totalSessions} onChange={(e) => setTotalSessions(e.target.value)} className="shadow appearance-none border border-gray-600 rounded w-full py-2 px-3 bg-gray-700 text-white leading-tight focus:outline-none focus:shadow-outline focus:border-blue-500" required min="1" />
                </div>
                <div className="mb-6">
                    <label className="block text-gray-300 text-sm font-bold mb-2">Class Schedule (Optional)</label>
                    <div className="flex flex-wrap gap-2 mb-2">
                        {daysOfWeek.map(day => (
                            <button key={day} type="button" onClick={() => handleDayChange(day)} className={`px-3 py-1 text-sm rounded-full ${schedule.days.includes(day) ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}>
                                {day.substring(0,3)}
                            </button>
                        ))}
                    </div>
                     <label htmlFor="editClassTime" className="block text-gray-300 text-sm font-bold mb-2">Time</label>
                    <input type="time" id="editClassTime" value={schedule.time} onChange={(e) => setSchedule(prev => ({...prev, time: e.target.value}))} className="shadow appearance-none border border-gray-600 rounded w-full py-2 px-3 bg-gray-700 text-white leading-tight focus:outline-none focus:shadow-outline focus:border-blue-500" />
                </div>
                {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
                <div className="flex items-center justify-end gap-3">
                    <button type="button" onClick={onClose} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">Cancel</button>
                    <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">Save Changes</button>
                </div>
            </form>
        </Modal>
    );
};

const DeleteConfirmationModal = ({ courseName, onClose, onDelete }) => (
    <Modal onClose={onClose}>
        <div className="text-center">
            <AlertTriangle className="mx-auto mb-4 text-red-500" size={48} />
            <h3 className="mb-2 text-xl font-bold text-white">Are you sure?</h3>
            <p className="text-gray-400 mb-6">Do you really want to delete <span className="font-semibold text-red-400">"{courseName}"</span>? This action cannot be undone.</p>
            <div className="flex justify-center gap-4">
                <button onClick={onClose} className="px-6 py-2 font-semibold text-white bg-gray-600 hover:bg-gray-700 rounded-lg">Cancel</button>
                <button onClick={onDelete} className="px-6 py-2 font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg">Delete</button>
            </div>
        </div>
    </Modal>
);

const AlertModal = ({ message, onClose }) => (
    <Modal onClose={onClose}>
        <div className="text-center">
            <Info className="mx-auto mb-4 text-blue-400" size={48} />
            <h3 className="mb-2 text-xl font-bold text-white">Information</h3>
            <p className="text-gray-300 mb-6">{message}</p>
            <div className="flex justify-center">
                <button onClick={onClose} className="px-8 py-2 font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg">OK</button>
            </div>
        </div>
    </Modal>
);

const AttendanceLogModal = ({ log, courseId, userId, onClose }) => {
    const handleDelete = async (logId) => {
        const logDocRef = doc(db, `artifacts/${appId}/users/${userId}/courses/${courseId}/log`, logId);
        await deleteDoc(logDocRef);
    };

    return (
        <Modal onClose={onClose} size="max-w-lg">
            <h2 className="text-2xl font-bold mb-4 text-white">Attendance Log</h2>
            <div className="max-h-96 overflow-y-auto space-y-2 pr-2">
                {log.length > 0 ? log.map(entry => (
                    <div key={entry.id} className="flex justify-between items-center bg-gray-900 p-3 rounded-lg">
                        <div>
                            <span className={`font-bold ${entry.status === 'present' ? 'text-green-400' : 'text-red-400'}`}>
                                {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                            </span>
                            <p className="text-xs text-gray-400">
                                {entry.timestamp ? new Date(entry.timestamp.seconds * 1000).toLocaleString() : 'Just now'}
                            </p>
                        </div>
                        <button onClick={() => handleDelete(entry.id)} className="p-1 text-gray-500 hover:text-red-400">
                            <Trash2 size={16} />
                        </button>
                    </div>
                )) : (
                    <p className="text-gray-400 text-center py-4">No attendance records yet.</p>
                )}
            </div>
        </Modal>
    );
};
