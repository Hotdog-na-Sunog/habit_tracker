// components/HabitTracker.js
'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../lib/AuthContext';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  loadHabits, saveHabit as dbSaveHabit,
  deleteHabit as dbDeleteHabit,
  loadCompletions, saveCompletion as dbSaveCompletion,
} from '../lib/db';
import {
  Pencil, Trash2, TrendingUp, Flame,
  Calendar, LogOut, ChevronLeft, ChevronRight, Leaf,
  AlertCircle, CheckCircle2, FileText, Check, Plus
} from 'lucide-react';
import styles from './HabitTracker.module.css';

// ── constants ─────────────────────────────────────────
const COLORS = [
  '#5B7A5F', '#7A6EA8', '#C97B5A', '#5A8FA8', '#A87A7A',
  '#7A9B5A', '#A86E8F', '#5A7AA8', '#C2A05A', '#8A7A5A',
];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function dk(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function todayKey() {
  const n = new Date();
  return dk(n.getFullYear(), n.getMonth(), n.getDate());
}
function fmtDate(dateKey) {
  if (!dateKey) return '';
  const [y, m, d] = dateKey.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function firstDay(y, m) { return new Date(y, m, 1).getDay(); }
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── streak helpers ────────────────────────────────────
function getStreak(hid, completions, habits) {
  const h = habits.find(x => x.id === hid);
  if (!h) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let s = 0;

  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const k = dk(d.getFullYear(), d.getMonth(), d.getDate());

    const isDoneOnDay = h.isGoal
      ? h.subtasks.some(st => st.completed && st.completedDate === k)
      : (completions[k] || []).includes(hid);

    if (isDoneOnDay) {
      s++;
    } else {
      // If we miss today, keep checking yesterday. If we miss yesterday too, break.
      if (i === 0) continue;
      break;
    }
  }
  return s;
}
function bestStreak(habits, completions) {
  if (!habits.length) return 0;
  const streaks = habits.map(h => getStreak(h.id, completions, habits));
  return Math.max(...streaks);
}

// ─────────────────────────────────────────────────────
export default function HabitTracker() {
  const { user, logout } = useAuth();
  const [habits, setHabits] = useState([]);
  const [completions, setCompletions] = useState({});
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [loading, setLoading] = useState(true);

  // modals
  const [dayModal, setDayModal] = useState(null); // date number
  const [addOpen, setAddOpen] = useState(false);
  const [habitName, setHabitName] = useState('');
  const [selColor, setSelColor] = useState(COLORS[0]);
  const [isGoal, setIsGoal] = useState(false);
  const [editingHabit, setEditingHabit] = useState(null);
  const [goalCount, setGoalCount] = useState(1);
  const [isSaving, setIsSaving] = useState(false);

  // review modal (for goal reduction)
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewData, setReviewData] = useState(null); // { habit, newSize, subtasks }

  // mastery audit & management hub
  const [auditHabit, setAuditHabit] = useState(null);
  const [hubTab, setHubTab] = useState('audit'); // 'audit' | 'settings'
  const [isDeleting, setIsDeleting] = useState(false);

  // categories
  const [categories, setCategories] = useState(['Mindset', 'Health', 'Career', 'Routine', 'Other']);
  const [selCategory, setSelCategory] = useState('Other');
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  // notes (for standard habits)
  const [dayNotes, setDayNotes] = useState({}); // { date_habitId: 'note' }

  // toast
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  }, []);

  // ── load data ──────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [h, c] = await Promise.all([
        loadHabits(user.uid),
        loadCompletions(user.uid),
      ]);
      setHabits(h);
      setCompletions(c);
      // check for categories
      const catSnap = await getDoc(doc(db, 'users', user.uid, 'settings', 'categories'));
      if (catSnap.exists()) {
        setCategories(catSnap.data().list || ['Mindset', 'Health', 'Career', 'Routine', 'Other']);
      }
      const notesSnap = await getDoc(doc(db, 'users', user.uid, 'settings', 'dayNotes'));
      if (notesSnap.exists()) {
        setDayNotes(notesSnap.data().notes || {});
      }
      setLoading(false);
    })();
  }, [user]);

  // ── month nav ──────────────────────────────────────
  const changeMonth = (dir) => {
    setViewMonth(m => {
      let nm = m + dir;
      if (nm > 11) { setViewYear(y => y + 1); return 0; }
      if (nm < 0) { setViewYear(y => y - 1); return 11; }
      return nm;
    });
  };

  // ── stats calculation ──────────────────────────────
  const stats = useMemo(() => {
    const tk = todayKey();

    // A habit is "today's work" if it's either not finished, OR it was finished TODAY.
    const activeHabitsToday = habits.filter(h => {
      if (!h.isGoal) return true; // Regular habits always count
      const isFinished = h.subtasks.every(s => s.completed);
      const doneToday = h.subtasks.some(s => s.completed && s.completedDate === tk);
      return !isFinished || doneToday;
    });

    const regDoneToday = (completions[tk] || []).filter(hid => {
      const h = habits.find(x => x.id === hid);
      return h && !h.isGoal;
    }).length;

    const goalDoneTodayList = habits.filter(h =>
      h.isGoal && h.subtasks.some(s => s.completed && s.completedDate === tk)
    );
    const goldDoneToday = goalDoneTodayList.length;

    const tDone = regDoneToday + goldDoneToday;
    const tTotal = activeHabitsToday.length;
    const tPct = tTotal ? Math.round(tDone / tTotal * 100) : 0;

    // MONTH TOTAL
    let mTotal = 0;
    for (let d = 1; d <= daysInMonth(viewYear, viewMonth); d++) {
      const k = dk(viewYear, viewMonth, d);
      if (completions[k]) {
        const activeRegIds = completions[k].filter(hid => {
          const h = habits.find(x => x.id === hid);
          return h && !h.isGoal;
        });
        mTotal += activeRegIds.length;
      }
    }
    habits.filter(h => h.isGoal).forEach(h => {
      const gDoneThisMo = h.subtasks.filter(s => {
        if (!s.completed || !s.completedDate) return false;
        try {
          const [y, m] = s.completedDate.split('-').map(Number);
          return y === viewYear && (m - 1) === viewMonth;
        } catch (e) { return false; }
      }).length;
      mTotal += gDoneThisMo;
    });

    // PRODUCTIVE DAY & STREAK
    const dCounts = [0, 0, 0, 0, 0, 0, 0];
    Object.keys(completions).forEach(k => {
      const [y, m, dayNum] = k.split('-').map(Number);
      if (!isNaN(y) && !isNaN(m)) {
        const dIdx = new Date(y, m - 1, dayNum).getDay();
        const activeReg = completions[k].filter(hid => {
          const h = habits.find(x => x.id === hid);
          return h && !h.isGoal;
        });
        dCounts[dIdx] += activeReg.length;
      }
    });
    habits.filter(h => h.isGoal).forEach(h => {
      h.subtasks.forEach(s => {
        if (s.completed && s.completedDate) {
          const [y, m, dayNum] = s.completedDate.split('-').map(Number);
          if (!isNaN(y) && !isNaN(m)) {
            const dIdx = new Date(y, m - 1, dayNum).getDay();
            dCounts[dIdx]++;
          }
        }
      });
    });
    const maxV = Math.max(...dCounts);
    const bDayIdx = maxV > 0 ? dCounts.indexOf(maxV) : -1;

    return {
      tDone, tTotal, tPct,
      mTotal,
      bDayIdx,
      circ: 125.66,
      offset: 125.66 - (125.66 * tPct) / 100,
      bStreak: bestStreak(habits, completions)
    };
  }, [habits, completions, viewYear, viewMonth]);

  // ── toggle habit on a day ─────────────────────────
  const toggleHabit = useCallback(async (hid, dateKey) => {
    const habit = habits.find(h => h.id === hid);
    if (habit?.isGoal) return; // goals handled by toggleSubtask

    setCompletions(prev => {
      const ids = [...(prev[dateKey] || [])];
      const idx = ids.indexOf(hid);
      if (idx === -1) ids.push(hid); else ids.splice(idx, 1);
      const next = { ...prev, [dateKey]: ids };
      if (!ids.length) delete next[dateKey];
      dbSaveCompletion(user.uid, dateKey, ids);
      return next;
    });
  }, [user, habits]);

  const toggleSubtask = async (hid, sid, dateKey) => {
    let updatedHabit = null;
    const nextHabits = habits.map(h => {
      if (h.id === hid) {
        const subtasks = h.subtasks.map(s => {
          if (s.id === sid) {
            // NEW RULE: You can only uncheck a subtask if you are on the same day it was checked
            if (s.completed && s.completedDate !== dateKey) {
              showToast(`This was completed on ${s.completedDate}. Switch to that day to uncheck it.`);
              return s;
            }
            const nowDone = !s.completed;
            return { ...s, completed: nowDone, completedDate: nowDone ? dateKey : null };
          }
          return s;
        });
        updatedHabit = { ...h, subtasks };
        return updatedHabit;
      }
      return h;
    });

    if (updatedHabit) {
      setHabits(nextHabits);
      dbSaveHabit(user.uid, updatedHabit);
    }
  };

  const openEdit = (habit) => {
    setEditingHabit(habit);
    setHabitName(habit.name);
    setSelColor(habit.color);
    setIsGoal(habit.isGoal || false);
    setGoalCount(habit.isGoal ? habit.subtasks.length : 1);
    setSelCategory(habit.category || 'Other');
    // When editing from the Hub, we don't open a separate modal anymore
  };

  const openHub = (habit) => {
    setAuditHabit(habit);
    setHubTab('audit');
    openEdit(habit); // Prepare editing states
  };

  const updateSubtaskData = async (hid, sid, fields) => {
    let updatedHabit = null;
    const nextHabits = habits.map(h => {
      if (h.id === hid) {
        const subtasks = h.subtasks.map(s => {
          if (s.id === sid) return { ...s, ...fields };
          return s;
        });
        updatedHabit = { ...h, subtasks };
        return updatedHabit;
      }
      return h;
    });

    if (updatedHabit) {
      setHabits(nextHabits);
      dbSaveHabit(user.uid, updatedHabit);
    }
  };

  // ── add habit ─────────────────────────────────────
  const saveHabit = async () => {
    if (isSaving) return;
    const name = habitName.trim();
    if (!name) { showToast('Please enter a habit name'); return; }

    setIsSaving(true);
    try {
      const timestamp = Date.now();

      if (editingHabit) {
        const h = { ...editingHabit, name, color: selColor, isGoal, category: selCategory };
        if (isGoal) {

          const currentSubtasks = editingHabit.subtasks || [];
          const newSize = Math.min(100, Math.max(1, parseInt(goalCount) || 0));
          const completedSubtasks = currentSubtasks.filter(s => s.completed);

          // SAFETY CHECK: If reducing goal below existing completions, trigger review
          if (newSize < completedSubtasks.length && !reviewOpen) {
            setReviewData({
              habit: editingHabit,
              newSize,
              subtasks: JSON.parse(JSON.stringify(currentSubtasks)) // clones
            });
            setReviewOpen(true);
            setAuditHabit(null);
            setIsSaving(false);
            return;
          }

          if (reviewOpen) {
            // If we are coming from the review modal, use the adjusted subtasks
            // and truncate to the target size
            h.subtasks = reviewData.subtasks.slice(0, newSize);
          } else {
            // Normal update (increase or non-destructive decrease)
            if (newSize > currentSubtasks.length) {
              const toAdd = newSize - currentSubtasks.length;
              const added = Array.from({ length: toAdd }).map((_, i) => ({
                id: `${timestamp}-edit-${i}`,
                name: `${currentSubtasks.length + i + 1}`,
                completed: false,
                completedDate: null,
                score: null,
                scoreTotal: null
              }));
              h.subtasks = [...currentSubtasks, ...added];
            } else {
              h.subtasks = currentSubtasks.slice(0, newSize);
            }
          }
        } else {
          h.subtasks = [];
        }

        setHabits(prev => prev.map(x => x.id === h.id ? h : x));
        await dbSaveHabit(user.uid, h);
        showToast('Habit updated ✓');
      } else {
        const subtasks = isGoal
          ? Array.from({ length: Math.min(100, Math.max(1, parseInt(goalCount) || 0)) }).map((_, i) => ({
            id: `${timestamp}-${i}`,
            name: `${i + 1}`,
            completed: false,
            completedDate: null,
            score: null,
            scoreTotal: null
          }))
          : [];

        const h = {
          id: timestamp.toString(),
          name,
          color: selColor,
          order: habits.length,
          isGoal,
          category: selCategory,
          subtasks
        };

        setHabits(prev => [...prev, h]);
        await dbSaveHabit(user.uid, h);
        showToast('Habit added ✓');
      }

      setAddOpen(false);
      setAuditHabit(null);
      setReviewOpen(false);
      setReviewData(null);
      setEditingHabit(null);
      setHabitName('');
      setIsGoal(false);
      setGoalCount(1);
    } catch (err) {
      showToast('Error saving habit');
    } finally {
      setIsSaving(false);
    }
  };

  // ── delete habit ──────────────────────────────────
  const deleteHabit = async (id, e) => {
    if (e) e.stopPropagation();
    setHabits(prev => prev.filter(h => h.id !== id));
    setCompletions(prev => {
      const next = {};
      Object.keys(prev).forEach(k => {
        const ids = prev[k].filter(hid => hid !== id);
        if (ids.length) next[k] = ids;
        dbSaveCompletion(user.uid, k, ids);
      });
      return next;
    });
    await dbDeleteHabit(user.uid, id);
    showToast('Habit removed');
  };

  // ─────────────────────────────────────────────────
  if (loading) return (
    <div className={styles.loadingScreen}>
      <div className={styles.loadingLogo}>habit<span>.</span></div>
      <div className={styles.loadingSub}>syncing your data…</div>
    </div>
  );

  const today = new Date();
  const isCurMo = viewYear === today.getFullYear() && viewMonth === today.getMonth();
  const todD = today.getDate();
  const maxD = isCurMo ? todD : daysInMonth(viewYear, viewMonth);

  return (
    <>
      {/* ── APP ── */}
      <div className={styles.app}>

        {/* HEADER */}
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.logo}>habit<span>.</span></div>
            <div className={styles.userBadge}>
              <img src={user.photoURL} alt="" className={styles.avatar} referrerPolicy="no-referrer" />
              <span>{user.displayName?.split(' ')[0]}</span>
            </div>
          </div>
          <div className={styles.headerRight}>
            <div className={styles.monthNav}>
              <button onClick={() => changeMonth(-1)}><ChevronLeft size={20} /></button>
              <span className={styles.monthLabel}>{MONTHS[viewMonth]} {viewYear}</span>
              <button onClick={() => changeMonth(1)}><ChevronRight size={20} /></button>
            </div>
            <button className={styles.btnAdd} onClick={() => {
              setEditingHabit(null);
              setHabitName('');
              setSelColor(COLORS[0]);
              setIsGoal(false);
              setGoalCount(1);
              setAddOpen(true);
            }}>
              <Plus size={18} /> <span>New Habit</span>
            </button>
            <button className={styles.btnLogout} onClick={logout} title="Sign out">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {/* BODY */}
        <div className={styles.body}>

          {/* LEFT */}
          <div className={styles.leftPanel}>
            <div className={styles.statsRow}>

              {/* today progress ring */}
              <div className={`${styles.statCard} ${styles.accentCard}`}>
                <div>
                  <div className={styles.statLabel}>Today's Progress</div>
                  <div className={styles.statValue}>{stats.tDone}/{stats.tTotal}</div>
                  <div className={styles.statSub}>
                    {(stats.tTotal - stats.tDone) > 0 ? `${stats.tTotal - stats.tDone} left to complete` : 'all done today!'}
                  </div>
                </div>
                <div className={styles.ringWrap}>
                  <svg className={styles.ringSvg} viewBox="0 0 48 48" width="48" height="48">
                    <circle className={styles.ringBg} cx="24" cy="24" r="20" />
                    <circle className={styles.ringFill} cx="24" cy="24" r="20"
                      strokeDasharray={stats.circ} strokeDashoffset={stats.offset} />
                  </svg>
                  <div className={styles.ringText}>{stats.tPct}%</div>
                </div>
              </div>

              <div className={styles.statCard}>
                <div>
                  <div className={styles.statLabel}>Most Productive</div>
                  <div className={styles.statValue}>{stats.bDayIdx !== -1 ? DAYS[stats.bDayIdx] : '—'}</div>
                  <div className={styles.statSub}>best day of week</div>
                </div>
                <div className={styles.statIcon}><TrendingUp size={24} /></div>
              </div>

              <div className={styles.statCard}>
                <div>
                  <div className={styles.statLabel}>Best Streak</div>
                  <div className={styles.statValue}>{stats.bStreak}</div>
                  <div className={styles.statSub}>days in a row</div>
                </div>
                <div className={styles.statIcon}><Flame size={24} /></div>
              </div>

              <div className={styles.statCard}>
                <div>
                  <div className={styles.statLabel}>This Month</div>
                  <div className={styles.statValue}>{stats.mTotal}</div>
                  <div className={styles.statSub}>completions in {MONTHS[viewMonth].slice(0, 3)}</div>
                </div>
                <div className={styles.statIcon}><Calendar size={24} /></div>
              </div>
            </div>

            {/* habits list */}
            <div className={styles.habitsSection}>
              <div className={styles.habitsHeader}>
                <div className={styles.sectionTitle}>My Habits</div>
                <div className={styles.masteryLegend}>
                  <div className={styles.legendItem}><div className={`${styles.legendDot} ${styles.masteryHigh}`} /> Exceptional</div>
                  <div className={styles.legendItem}><div className={`${styles.legendDot} ${styles.masteryMid}`} /> Steady</div>
                  <div className={styles.legendItem}><div className={`${styles.legendDot} ${styles.masteryLow}`} /> Needs Attention</div>
                </div>
              </div>
              <div className={styles.habitsList}>
                {!habits.length ? (
                  <div className={styles.emptyHabits}>
                    <div className={styles.emptyBig}><Leaf size={48} strokeWidth={1} style={{ opacity: 0.5 }} /></div>
                    No habits yet.<br />Add one to get started!
                  </div>
                ) : (() => {
                  const grouped = habits.reduce((acc, h) => {
                    const cat = h.category || 'Other';
                    if (!acc[cat]) acc[cat] = [];
                    acc[cat].push(h);
                    return acc;
                  }, {});

                  const sortedCats = Object.keys(grouped).sort((a, b) => {
                    const idxA = categories.indexOf(a);
                    const idxB = categories.indexOf(b);
                    if (idxA === -1 && idxB === -1) return a.localeCompare(b);
                    if (idxA === -1) return 1;
                    if (idxB === -1) return -1;
                    return idxA - idxB;
                  });

                  return sortedCats.map(cat => (
                    <div key={cat} style={{ marginBottom: 20 }}>
                      <div className={styles.categoryHeader}>
                        <div className={styles.categoryBadge} />
                        {cat}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        {grouped[cat].map(h => (
                          <div
                            key={h.id}
                            className={`${styles.habitItem} ${styles.clickableHabit}`}
                            onClick={() => openHub(h)}
                            title="Click to manage habit"
                          >
                            <div className={styles.habitDot} style={{ background: h.color }} />
                            <div className={styles.habitInfo}>
                              <div className={styles.habitName}>{h.name}</div>
                              <div className={styles.habitStreak}>
                                <Flame size={12} fill="currentColor" /> {getStreak(h.id, completions, habits)} day streak
                              </div>

                              {h.isGoal && (() => {
                                const scored = h.subtasks.filter(s => s.completed && s.score != null && s.scoreTotal > 0);
                                if (!scored.length) return null;

                                const totalEarned = scored.reduce((acc, s) => acc + Math.min(s.score, s.scoreTotal), 0);
                                const totalPossible = scored.reduce((acc, s) => acc + s.scoreTotal, 0);
                                const avg = Math.round((totalEarned / totalPossible) * 100);

                                let levelClass = styles.masteryLow;
                                if (avg >= 80) levelClass = styles.masteryHigh;
                                else if (avg >= 50) levelClass = styles.masteryMid;

                                return (
                                  <div className={`${styles.masteryBadge} ${levelClass}`}>
                                    Mastery: {avg}%
                                  </div>
                                );
                              })()}

                              {h.isGoal && h.subtasks.length > 0 && (
                                <div className={styles.habitGoalProgress}>
                                  <div className={styles.goalProgressText}>
                                    <span>Progress</span>
                                    <span>{h.subtasks.filter(s => s.completed).length} / {h.subtasks.length}</span>
                                  </div>
                                  <div className={styles.goalProgressBarBg}>
                                    {(() => {
                                      const done = h.subtasks.filter(s => s.completed).length;
                                      const pct = h.subtasks.length ? Math.round((done / h.subtasks.length) * 100) : 0;
                                      return (
                                        <div
                                          className={styles.goalProgressBarFill}
                                          data-pct={pct}
                                          data-done={done}
                                          data-tot={h.subtasks.length}
                                          style={{
                                            width: `${pct}%`,
                                            background: h.color
                                          }}
                                        />
                                      );
                                    })()}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>

          {/* CALENDAR */}
          <div className={styles.calendarSection}>
            <div className={styles.sectionTitle}>Calendar</div>
            <div className={styles.weekdays}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d =>
                <div key={d} className={styles.weekday}>{d}</div>
              )}
            </div>
            <div className={styles.calGrid}>
              {Array.from({ length: firstDay(viewYear, viewMonth) }).map((_, i) =>
                <div key={`e${i}`} className={`${styles.calDay} ${styles.empty}`} />
              )}
              {Array.from({ length: daysInMonth(viewYear, viewMonth) }).map((_, i) => {
                const d = i + 1;
                const k = dk(viewYear, viewMonth, d);
                const regularDone = (completions[k] || []).filter(hid => {
                  const h = habits.find(x => x.id === hid);
                  return h && !h.isGoal;
                });
                const goalsDone = habits.filter(h =>
                  h.isGoal && h.subtasks.some(s => s.completed && s.completedDate === k)
                );
                const activeIDs = [...regularDone, ...goalsDone.map(g => g.id)];

                const future = isCurMo ? d > todD : new Date(viewYear, viewMonth, d) > today;
                const isToday = isCurMo && d === todD;
                const allDone = habits.length > 0 && activeIDs.length === habits.length;
                return (
                  <div
                    key={d}
                    className={[
                      styles.calDay,
                      isToday ? styles.calToday : '',
                      future ? styles.calFuture : '',
                      allDone && !future ? styles.calAllDone : '',
                    ].join(' ')}
                    onClick={() => !future && setDayModal(d)}
                  >
                    <div className={styles.dayNum}>{d}</div>
                    <div className={styles.dayDots}>
                      {activeIDs.map(hid => {
                        const h = habits.find(x => x.id === hid);
                        return h ? <div key={hid} className={styles.dayDot} style={{ background: h.color }} /> : null;
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* HEATMAP */}
          <Heatmap habits={habits} completions={completions} dk={dk} />

          {/* PROGRESS */}
          <div className={styles.progressSection}>
            <div className={styles.sectionTitle}>Monthly Progress</div>
            <div className={styles.progressGrid}>
              {!habits.length ? (
                <div style={{ color: 'var(--text3)', fontSize: 13 }}>No habits yet.</div>
              ) : habits.map(h => {
                let p = 0;
                if (h.isGoal && h.subtasks.length > 0) {
                  const done = h.subtasks.filter(s => s.completed).length;
                  p = Math.round((done / h.subtasks.length) * 100);
                } else {
                  let c = 0;
                  // Only count days since the habit was created
                  const createdAt = new Date(Number(h.id));
                  const monthStart = new Date(viewYear, viewMonth, 1);
                  const startDay = (createdAt > monthStart) ? createdAt.getDate() : 1;
                  let activeDays = 0;
                  for (let d = startDay; d <= maxD; d++) {
                    const k = dk(viewYear, viewMonth, d);
                    activeDays++;
                    if (completions[k]?.includes(h.id)) c++;
                  }
                  p = activeDays ? Math.round(c / activeDays * 100) : 0;
                }
                return (
                  <div key={h.id}>
                    <div className={styles.progressHeader}>
                      <div className={styles.progressName}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: h.color, flexShrink: 0 }} />
                        {h.name}
                      </div>
                      <div className={styles.progressPct}>{p}%</div>
                    </div>
                    <div className={styles.progressBarBg}>
                      <div className={styles.progressBarFill} style={{ width: `${p}%`, background: h.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── DAY MODAL ── */}
      {dayModal !== null && (
        <div className={`${styles.modalOverlay} ${styles.open}`}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                {DAYS[new Date(viewYear, viewMonth, dayModal).getDay()]}
              </div>
              <button className={styles.modalClose} onClick={() => setDayModal(null)}>✕</button>
            </div>
            <div className={styles.modalDate}>{MONTHS[viewMonth]} {dayModal}, {viewYear}</div>
            <div className={styles.modalHabits}>
              {!habits.length ? (
                <div className={styles.modalEmpty}>No habits yet. Add some first!</div>
              ) : habits.map(h => {
                const dateKey = dk(viewYear, viewMonth, dayModal);
                const checked = h.isGoal
                  ? h.subtasks.some(s => s.completed && s.completedDate === dateKey)
                  : (completions[dateKey] || []).includes(h.id);
                return (
                  <div key={h.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div
                      className={`${styles.modalHabit} ${checked ? styles.checked : ''}`}
                      style={checked ? { background: `${h.color}18`, borderColor: `${h.color}55` } : {}}
                      onClick={() => !h.isGoal && toggleHabit(h.id, dateKey)}
                    >
                      <div className={styles.modalHabitLeft}>
                        <div className={styles.habitDot} style={{ background: h.color }} />
                        <div className={styles.modalHabitName}>{h.name}</div>
                      </div>
                      {!h.isGoal && (
                        <div className={styles.checkmark}
                          style={checked ? { background: h.color, borderColor: h.color, color: 'white' } : {}}>
                          {checked ? '✓' : ''}
                        </div>
                      )}
                    </div>

                    {h.isGoal && (
                      <div className={styles.subtaskList}>
                        {h.subtasks.map(s => {
                          const isDone = s.completed && s.completedDate === dateKey;
                          return (
                            <div
                              key={s.id}
                              className={`${styles.subtaskItem} ${isDone ? styles.subtaskDone : ''}`}
                              onClick={() => toggleSubtask(h.id, s.id, dateKey)}
                              style={{
                                ...(isDone ? { border: `1px solid ${h.color}` } : {}),
                                ...(s.completed && s.completedDate !== dateKey ? { opacity: 0.6, cursor: 'default' } : {}),
                                display: 'flex', flexDirection: 'column'
                              }}
                              title={s.completed && s.completedDate !== dateKey ? `Completed on ${s.completedDate}` : ''}
                            >
                              <div className={styles.subtaskItemLeft} style={{ width: '100%' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                  <span className={styles.subtaskName} style={{ fontSize: 13 }}>{s.name}</span>
                                  <div className={styles.subtaskCheck}>
                                    {s.completed ? (s.completedDate !== dateKey ? '🔒' : '✓') : ''}
                                  </div>
                                </div>

                                {isDone && (() => {
                                  const isOver = s.score != null && s.scoreTotal != null && s.score > s.scoreTotal;
                                  return (
                                    <div className={styles.reflectionRow} onClick={e => e.stopPropagation()}>
                                      <div className={styles.refInputWrap}>
                                        <FileText size={10} color="var(--text3)" />
                                        <input
                                          type="text"
                                          placeholder="Add reflection..."
                                          className={styles.subtaskNoteInput}
                                          value={s.note || ''}
                                          onChange={(e) => updateSubtaskData(h.id, s.id, { note: e.target.value })}
                                        />
                                      </div>
                                      <div className={styles.scoreRowCompact} style={isOver ? { borderColor: '#ef4444', borderWidth: 1.5, borderStyle: 'solid' } : {}}>
                                        <input
                                          type="number"
                                          className={styles.scoreInputSmall}
                                          style={isOver ? { color: '#ef4444' } : {}}
                                          value={s.score ?? ''}
                                          placeholder="0"
                                          onChange={e => {
                                            let val = parseFloat(e.target.value);
                                            if (isNaN(val)) val = null;
                                            updateSubtaskData(h.id, s.id, { score: val });
                                          }}
                                          onBlur={() => {
                                            if (s.score != null && s.scoreTotal != null && s.score > s.scoreTotal) {
                                              updateSubtaskData(h.id, s.id, { score: s.scoreTotal });
                                            }
                                          }}
                                        />
                                        <span className={styles.scoreSlash}>/</span>
                                        <input
                                          type="number"
                                          className={styles.scoreInputSmall}
                                          value={s.scoreTotal ?? ''}
                                          placeholder="100"
                                          onChange={e => {
                                            let val = parseFloat(e.target.value);
                                            if (isNaN(val)) val = null;
                                            updateSubtaskData(h.id, s.id, { scoreTotal: val });
                                          }}
                                          onBlur={() => {
                                            if (s.score != null && s.scoreTotal != null && s.score > s.scoreTotal) {
                                              updateSubtaskData(h.id, s.id, { score: s.scoreTotal });
                                            }
                                          }}
                                        />
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {!h.isGoal && checked && (
                      <div className={styles.reflectionRow} onClick={e => e.stopPropagation()} style={{ padding: '6px 14px', marginTop: 10 }}>
                        <div className={styles.refInputWrap}>
                          <FileText size={11} color="var(--text3)" />
                          <input
                            type="text"
                            placeholder="Daily reflection..."
                            className={styles.subtaskNoteInput}
                            value={dayNotes[`${dateKey}_${h.id}`] || ''}
                            onChange={async (e) => {
                              const val = e.target.value;
                              const nid = `${dateKey}_${h.id}`;
                              const updated = { ...dayNotes, [nid]: val };
                              setDayNotes(updated);
                              await setDoc(doc(db, 'users', user.uid, 'settings', 'dayNotes'), { notes: updated });
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── ADD HABIT MODAL (New Only) ── */}
      {addOpen && !editingHabit && (
        <div className={`${styles.addModalOverlay} ${styles.open}`}>
          <div className={styles.addModal}>
            <h2 className={styles.addTitle}>New Habit</h2>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Habit Name</label>
              <input
                className={styles.formInput}
                placeholder="e.g. Morning run, Read 20 pages…"
                maxLength={40}
                value={habitName}
                onChange={e => setHabitName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveHabit()}
                autoFocus
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Color</label>
              <div className={styles.colorPicker}>
                {COLORS.map(c => (
                  <div key={c} className={`${styles.colorSwatch} ${c === selColor ? styles.selected : ''}`}
                    style={{ background: c }} onClick={() => setSelColor(c)} />
                ))}
              </div>
            </div>

            <label className={styles.goalToggle}>
              <input type="checkbox" checked={isGoal} onChange={e => setIsGoal(e.target.checked)} />
              <span>Goal-based habit</span>
            </label>

            {isGoal && (
              <div className={styles.formGroup} style={{ marginTop: -5 }}>
                <label className={styles.formLabel}>GOAL (Number of tasks/modules)</label>
                <input
                  type="number"
                  className={styles.autoInput}
                  value={goalCount}
                  min="1"
                  max="100"
                  onChange={e => setGoalCount(e.target.value)}
                />
              </div>
            )}

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Category</label>
              <div className={styles.chipGrid}>
                {categories.map(c => (
                  <div
                    key={c}
                    className={`${styles.categoryChip} ${selCategory === c ? styles.chipActive : ''}`}
                    onClick={() => {
                      setSelCategory(c);
                      setIsAddingCategory(false);
                    }}
                  >
                    {c}
                  </div>
                ))}
                <div
                  className={`${styles.categoryChip} ${styles.chipPlus}`}
                  onClick={() => setIsAddingCategory(true)}
                >
                  <Plus size={14} /> Add New
                </div>
              </div>
            </div>

            {isAddingCategory && (
              <div className={styles.formGroup} style={{ background: 'var(--surface2)', padding: 12, borderRadius: 12, marginTop: -5, animation: 'fadeIn .2s' }}>
                <label className={styles.formLabel}>New Category Name</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    className={styles.formInput}
                    style={{ flex: 1, height: 38 }}
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="e.g. Learning"
                    autoFocus
                  />
                  <button
                    className={styles.btnAdd}
                    style={{ padding: '0 15px', height: 38 }}
                    onClick={async () => {
                      if (!newCatName.trim()) return;
                      const updated = [...categories, newCatName.trim()];
                      setCategories(updated);
                      setSelCategory(newCatName.trim());
                      setIsAddingCategory(false);
                      setNewCatName('');
                      await setDoc(doc(db, 'users', user.uid, 'settings', 'categories'), { list: updated });
                    }}
                  >
                    Add
                  </button>
                  <button onClick={() => setIsAddingCategory(false)} style={{ color: 'var(--text3)', background: 'none', border: 'none', fontSize: 13, cursor: 'pointer' }}>✕</button>
                </div>
              </div>
            )}

            <div className={styles.formActions}>
              <button className={styles.btnCancel} onClick={() => !isSaving && setAddOpen(false)}>Cancel</button>
              <button className={styles.btnSave} onClick={saveHabit} disabled={isSaving}>
                {isSaving ? (editingHabit ? 'Saving...' : 'Adding...') : (editingHabit ? 'Save Changes' : 'Add Habit')}
              </button>
            </div>
          </div>
        </div>
      )}

      {reviewOpen && reviewData && (() => {
        const completedCount = reviewData.subtasks.filter(s => s.completed).length;
        const excess = completedCount - reviewData.newSize;
        const isMet = excess <= 0;
        const isSurplus = excess < 0;

        return (
          <div className={`${styles.modalOverlay} ${styles.open}`} style={{ zIndex: 300 }}>
            <div className={styles.modal} style={{ maxWidth: 420 }}>
              <div className={styles.modalHeader}>
                <div className={styles.modalTitle}>Goal Capacity Sync</div>
                <button className={styles.modalClose} onClick={() => { setReviewOpen(false); setIsSaving(false); }}>✕</button>
              </div>

              <div className={styles.syncStatus} style={{
                background: isMet ? (isSurplus ? '#FEFCE8' : '#F0FDF4') : '#FFF7ED',
                border: `1.5px solid ${isMet ? (isSurplus ? '#FEF08A' : '#BBF7D0') : '#FFEDD5'}`,
                padding: '12px 14px', borderRadius: 12, display: 'flex', gap: 10, marginBottom: 18
              }}>
                {isMet ? (isSurplus ? <AlertCircle size={18} color="#A16207" /> : <CheckCircle2 size={18} color="#16A34A" />) : <AlertCircle size={18} color="#EA580C" />}
                <div style={{ fontSize: 12.5, lineHeight: 1.4, color: isMet ? (isSurplus ? '#854D0E' : '#15803D') : '#9A3412' }}>
                  {isMet ? (
                    isSurplus ? (
                      <><strong>Surplus Removal:</strong> You are removing <strong>{Math.abs(excess)}</strong> more module(s) than required by the new goal.</>
                    ) : (
                      <><strong>Capacity Met:</strong> Your remaining history is perfectly aligned with the new goal limit.</>
                    )
                  ) : (
                    <><strong>Sync Conflict:</strong> Please remove <strong>{excess}</strong> more completion(s) to align with the new capacity.</>
                  )}
                </div>
              </div>

              <div className={styles.modalHabits} style={{ maxHeight: 280 }}>
                {reviewData.subtasks.filter(s => s.completed).map(s => (
                  <div
                    key={s.id}
                    className={`${styles.modalHabit} ${styles.checked}`}
                    style={{ background: `${selColor}12`, borderColor: selColor }}
                    onClick={() => {
                      const nextSubtasks = reviewData.subtasks.map(x =>
                        x.id === s.id ? { ...x, completed: false, completedDate: null } : x
                      );
                      const nextCount = nextSubtasks.filter(x => x.completed).length;
                      setReviewData({ ...reviewData, subtasks: nextSubtasks });
                      showToast(`Item removed. ${nextCount} remaining.`);
                    }}
                  >
                    <div className={styles.modalHabitLeft}>
                      <div className={styles.habitDot} style={{ background: selColor }} />
                      <div className={styles.modalHabitName}>Module {s.name}</div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>{s.completedDate}</div>
                    <div className={styles.checkmark} style={{ background: selColor, borderColor: selColor, color: 'white' }}>✓</div>
                  </div>
                ))}
              </div>

              <div className={styles.formActions} style={{ marginTop: 24 }}>
                <button className={styles.btnCancel} onClick={() => { setReviewOpen(false); setIsSaving(false); }}>Cancel</button>
                <button
                  className={styles.btnSave}
                  disabled={!isMet}
                  style={{ background: isMet ? '#1C1C1A' : 'var(--border)', opacity: 1 }}
                  onClick={saveHabit}
                >
                  Confirm & Sync
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── UNIFIED MANAGEMENT HUB ── */}
      {auditHabit && (
        <div className={`${styles.modalOverlay} ${styles.open}`} style={{ zIndex: 400 }}>
          <div className={styles.modal} style={{ maxWidth: 450, position: 'relative' }}>
            {/* Header with Close */}
            {!isDeleting && <button className={styles.modalClose} style={{ top: 20, right: 20 }} onClick={() => setAuditHabit(null)}>✕</button>}

            {/* Tab Switcher */}
            <div className={styles.hubTabs}>
              <button
                className={`${styles.hubTab} ${hubTab === 'audit' ? styles.hubTabActive : ''}`}
                onClick={() => setHubTab('audit')}
              >
                <TrendingUp size={14} /> Performance
              </button>
              <button
                className={`${styles.hubTab} ${hubTab === 'settings' ? styles.hubTabActive : ''}`}
                onClick={() => setHubTab('settings')}
              >
                <Pencil size={14} /> Settings
              </button>
            </div>

            {/* TAB: AUDIT LOG */}
            {hubTab === 'audit' && (
              <>
                <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', fontFamily: 'Lexend' }}>{auditHabit.name}</div>
                    <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>{auditHabit.category || 'Global'} • Habit Lab Audit</div>
                  </div>
                  {auditHabit.isGoal && (() => {
                    const scored = auditHabit.subtasks.filter(s => s.completed && s.score != null);
                    if (!scored.length) return null;
                    const totalEarned = scored.reduce((acc, s) => acc + Math.min(s.score, s.scoreTotal), 0);
                    const totalPossible = scored.reduce((acc, s) => acc + s.scoreTotal, 0);
                    const avg = Math.round((totalEarned / totalPossible) * 100);
                    return (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>{avg}%</div>
                        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text3)', marginTop: 4 }}>Current Mastery</div>
                      </div>
                    );
                  })()}
                </div>

                {/* Performance Analytics Dashboard */}
                {auditHabit.isGoal && (
                  <div className={styles.trendSection} style={{ border: 'none', background: 'linear-gradient(145deg, var(--surface2), var(--surface))', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <div className={styles.trendHeader}>30-Day Accuracy Insight</div>
                      {(() => {
                        const history = auditHabit.subtasks
                          .filter(s => s.completed && s.score != null)
                          .sort((a, b) => new Date(a.completedDate) - new Date(b.completedDate))
                          .slice(-30);
                        if (history.length < 5) return null;

                        const recent = history.slice(-5);
                        const prev = history.slice(-10, -5);
                        if (!prev.length) return null;

                        const recentAvg = recent.reduce((acc, s) => acc + (s.score / s.scoreTotal), 0) / 5;
                        const prevAvg = prev.reduce((acc, s) => acc + (s.score / s.scoreTotal), 0) / 5;
                        const diff = Math.round((recentAvg - prevAvg) * 100);

                        return (
                          <div style={{ fontSize: 11, fontWeight: 700, color: diff >= 0 ? '#16A34A' : '#DC2626', background: diff >= 0 ? '#DCFCE7' : '#FEE2E2', padding: '4px 8px', borderRadius: 6 }}>
                            {diff >= 0 ? '↑' : '↓'} {Math.abs(diff)}% vs prev.
                          </div>
                        );
                      })()}
                    </div>

                    <div className={styles.sparklineCont}>
                      {(() => {
                        const history = auditHabit.subtasks
                          .filter(s => s.completed && s.score != null)
                          .sort((a, b) => new Date(a.completedDate) - new Date(b.completedDate))
                          .slice(-30);

                        if (history.length < 2) return <div className={styles.modalEmpty} style={{ padding: 0, opacity: 0.5 }}>Accumulating more data points...</div>;

                        const width = 400;
                        const height = 80;
                        const points = history.map((s, i) => {
                          const x = (i / (history.length - 1)) * width;
                          const acc = (Math.min(s.score, s.scoreTotal) / s.scoreTotal);
                          const y = height - (acc * (height - 10)) - 5;
                          return `${x},${y}`;
                        }).join(' ');

                        return (
                          <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.05))' }}>
                            <defs>
                              <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
                                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                              </linearGradient>
                            </defs>
                            <path
                              d={`M 0,${height} ${points.split(' ').map((p, i) => (i === 0 ? 'L ' + p : 'L ' + p)).join(' ')} L ${width},${height} Z`}
                              fill="url(#trendGrad)"
                            />
                            <polyline
                              fill="none"
                              stroke="var(--accent)"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              points={points}
                            />
                            {/* Marker for last point */}
                            {(() => {
                              const last = points.split(' ').pop().split(',');
                              return <circle cx={last[0]} cy={last[1]} r="4" fill="var(--accent)" stroke="white" strokeWidth="2" />;
                            })()}
                          </svg>
                        );
                      })()}
                    </div>
                  </div>
                )}

                <div className={styles.auditList}>
                  <div className={styles.auditHeader}>
                    <div>Module</div>
                    <div style={{ textAlign: 'center' }}>Score</div>
                    <div style={{ textAlign: 'right' }}>Accuracy</div>
                  </div>
                  {auditHabit.isGoal ? (
                    auditHabit.subtasks
                      .filter(s => s.completed)
                      .sort((a, b) => new Date(a.completedDate) - new Date(b.completedDate))
                      .map(s => {
                        const acc = s.scoreTotal > 0 ? Math.round((Math.min(s.score || 0, s.scoreTotal) / s.scoreTotal) * 100) : null;
                        let levelClass = styles.masteryLow;
                        if (acc === null) levelClass = '';
                        else if (acc >= 80) levelClass = styles.masteryHigh;
                        else if (acc >= 50) levelClass = styles.masteryMid;

                        return (
                          <div key={s.id} className={styles.auditRow} style={{ alignItems: 'flex-start', paddingTop: 14, paddingBottom: 14 }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>Module {s.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}>{fmtDate(s.completedDate)}</div>
                              {s.note && (
                                <div className={styles.auditNote}>
                                  <FileText size={10} style={{ marginTop: 2 }} />
                                  "{s.note}"
                                </div>
                              )}
                            </div>
                            <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 500, fontFamily: 'Lexend' }}>
                              {s.score !== null ? s.score : '—'} <span style={{ color: 'var(--text3)', fontSize: 12 }}>/</span> {s.scoreTotal || '—'}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              {acc !== null ? (
                                <span className={`${styles.masteryBadge} ${levelClass}`} style={{ marginTop: 0 }}>
                                  {acc}%
                                </span>
                              ) : (
                                <span style={{ fontSize: 11, color: 'var(--text3)' }}>N/A</span>
                              )}
                            </div>
                          </div>
                        );
                      })
                  ) : (
                    Object.keys(completions)
                      .filter(dateKey => completions[dateKey].includes(auditHabit.id))
                      .sort((a, b) => new Date(a) - new Date(b))
                      .map(dateKey => {
                        const note = dayNotes[`${dateKey}_${auditHabit.id}`];
                        return (
                          <div key={dateKey} className={styles.auditRow} style={{ alignItems: 'flex-start', paddingTop: 14, paddingBottom: 14 }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>Completed</div>
                              <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}>{fmtDate(dateKey)}</div>
                              {note && (
                                <div className={styles.auditNote}>
                                  <FileText size={10} style={{ marginTop: 2 }} />
                                  "{note}"
                                </div>
                              )}
                            </div>
                            <div style={{ textAlign: 'center', opacity: 0.5 }}>—</div>
                            <div style={{ textAlign: 'right', opacity: 0.5 }}>—</div>
                          </div>
                        );
                      })
                  )}
                  {auditHabit.isGoal ? (
                    !auditHabit.subtasks.some(s => s.completed && s.score != null) && (
                      <div className={styles.modalEmpty}>No scores recorded yet for this habit.</div>
                    )
                  ) : (
                    !Object.keys(completions).some(dateKey => completions[dateKey].includes(auditHabit.id)) && (
                      <div className={styles.modalEmpty}>No completion history found.</div>
                    )
                  )}
                </div>
                <button className={styles.btnSave} style={{ width: '100%', marginTop: 20 }} onClick={() => setAuditHabit(null)}>Close Hub</button>
              </>
            )}

            {/* TAB: SETTINGS */}
            {hubTab === 'settings' && (
              <div style={{ animation: 'fadeIn .2s' }}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Habit Name</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={habitName}
                    onChange={(e) => setHabitName(e.target.value)}
                    placeholder="e.g. Morning Jogging"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Theme color</label>
                  <div className={styles.colorPicker}>
                    {COLORS.map(c => (
                      <div
                        key={c}
                        className={`${styles.colorSwatch} ${selColor === c ? styles.selected : ''}`}
                        style={{ background: c }}
                        onClick={() => setSelColor(c)}
                      />
                    ))}
                  </div>
                </div>

                {isGoal && (
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Daily Modules Goal <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(e.g. 5 chapters)</span></label>
                    <input
                      type="number"
                      className={styles.formInput}
                      value={goalCount}
                      onChange={(e) => setGoalCount(parseInt(e.target.value) || 1)}
                      min="1"
                      max="20"
                    />
                  </div>
                )}

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Category</label>
                  <div className={styles.chipGrid}>
                    {categories.map(c => (
                      <div
                        key={c}
                        className={`${styles.categoryChip} ${selCategory === c ? styles.chipActive : ''}`}
                        onClick={() => {
                          setSelCategory(c);
                          setIsAddingCategory(false);
                        }}
                      >
                        {c}
                      </div>
                    ))}
                    <div
                      className={`${styles.categoryChip} ${styles.chipPlus}`}
                      onClick={() => setIsAddingCategory(true)}
                    >
                      <Plus size={14} /> Add New
                    </div>
                  </div>
                </div>

                {isAddingCategory && (
                  <div className={styles.formGroup} style={{ background: 'var(--surface2)', padding: 12, borderRadius: 12, animation: 'fadeIn .2s' }}>
                    <label className={styles.formLabel}>New Category Name</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="text"
                        className={styles.formInput}
                        style={{ flex: 1, height: 38 }}
                        value={newCatName}
                        onChange={(e) => setNewCatName(e.target.value)}
                        placeholder="e.g. Growth"
                        autoFocus
                      />
                      <button
                        className={styles.btnAdd}
                        style={{ padding: '0 15px', height: 38 }}
                        onClick={async () => {
                          if (!newCatName.trim()) return;
                          const updated = [...categories, newCatName.trim()];
                          setCategories(updated);
                          setSelCategory(newCatName.trim());
                          setIsAddingCategory(false);
                          setNewCatName('');
                          await setDoc(doc(db, 'users', user.uid, 'settings', 'categories'), { list: updated });
                        }}
                      >
                        Add
                      </button>
                      <button onClick={() => setIsAddingCategory(false)} style={{ color: 'var(--text3)', background: 'none', border: 'none', fontSize: 13, cursor: 'pointer' }}>✕</button>
                    </div>
                  </div>
                )}

                <div className={styles.formActions} style={{ marginTop: 24, flexDirection: 'column', gap: 12 }}>
                  <button
                    className={styles.btnSave}
                    style={{ width: '100%' }}
                    onClick={saveHabit}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving...' : 'Update Settings'}
                  </button>
                  <button
                    className={styles.btnCancel}
                    style={{ width: '100%', background: 'none', border: '1px solid var(--border)', color: '#ef4444' }}
                    onClick={() => setIsDeleting(true)}
                  >
                    Delete Habit
                  </button>
                </div>
              </div>
            )}

            {/* DELETE CONFIRMATION OVERLAY */}
            {isDeleting && (
              <div className={styles.confirmOverlay}>
                <div className={styles.confirmBox}>
                  <AlertCircle size={40} color="#ef4444" style={{ marginBottom: 12 }} />
                  <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Permanent Deletion?</div>
                  <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 20 }}>
                    This action cannot be undone. You will lose all streaks and mastery data for <strong>{auditHabit.name}</strong>.
                  </div>
                  <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                    <button className={styles.btnCancel} style={{ flex: 1 }} onClick={() => setIsDeleting(false)}>Cancel</button>
                    <button
                      className={styles.btnSave}
                      style={{ flex: 1, background: '#ef4444' }}
                      onClick={() => {
                        deleteHabit(auditHabit.id);
                        setIsDeleting(false);
                        setAuditHabit(null);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TOAST ── */}
      <div className={`${styles.toast} ${toast ? styles.toastShow : ''}`}>{toast}</div>
    </>
  );
}
// ── heatmap component ────────────────────────────────
function Heatmap({ habits, completions, dk }) {
  const data = useMemo(() => {
    const list = [];
    const now = new Date();
    // 365 days ago to today
    for (let i = 364; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const k = dk(d.getFullYear(), d.getMonth(), d.getDate());
      
      const regDoneCount = (completions[k] || []).filter(hid => {
        const h = habits.find(x => x.id === hid);
        return h && !h.isGoal;
      }).length;

      const goalsDoneCount = habits.filter(h =>
        h.isGoal && h.subtasks.some(s => s.completed && s.completedDate === k)
      ).length;

      const totalDone = regDoneCount + goalsDoneCount;
      const totalPossible = habits.filter(h => Number(h.id) <= d.getTime()).length;
      
      let level = 0;
      if (totalPossible > 0) {
        const pct = totalDone / totalPossible;
        if (pct === 0) level = 0;
        else if (pct <= 0.25) level = 1;
        else if (pct <= 0.5) level = 2;
        else if (pct <= 0.75) level = 3;
        else level = 4;
      }

      list.push({ date: k, count: totalDone, possible: totalPossible, level });
    }
    return list;
  }, [habits, completions, dk]);

  // Group by weeks
  const weeks = [];
  let currentWeek = [];
  
  // To align weeks correctly (GitHub style: columns of weeks), 
  // we need to pad the beginning so the first day matches its day of week
  const now = new Date();
  const firstDate = new Date(now);
  firstDate.setDate(now.getDate() - 364);
  const firstDayOfWeek = firstDate.getDay();
  
  for (let i = 0; i < firstDayOfWeek; i++) {
    currentWeek.push(null);
  }

  data.forEach(d => {
    currentWeek.push(d);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  });
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null);
    weeks.push(currentWeek);
  }

  const totalAnnualValue = useMemo(() => {
    return data.reduce((acc, d) => acc + d.count, 0);
  }, [data]);

  return (
    <div className={styles.heatmapSection}>
      <div className={styles.sectionTitle} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
        <TrendingUp size={14} /> Activity Insight
        <div className={styles.heatmapStat}>
          {totalAnnualValue} completions • past 365 days
        </div>
      </div>
      <div className={styles.heatmapWrapper}>
        <div className={styles.heatmapLabels}>
          <span>Mon</span>
          <span>Wed</span>
          <span>Fri</span>
        </div>
        <div className={styles.heatmapScroll}>
          <div className={styles.heatmapGrid}>
            {weeks.map((week, wi) => (
              <div key={wi} className={styles.heatmapWeek}>
                {week.map((day, di) => (
                  <div
                    key={di}
                    className={`${styles.heatmapDay} ${day ? styles[`level${day.level}`] : styles.heatmapEmpty}`}
                    title={day ? `${day.date}: ${day.count}/${day.possible} completed` : ''}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className={styles.heatmapLegend}>
        <span>Less</span>
        <div className={`${styles.heatmapDay} ${styles.level0}`} />
        <div className={`${styles.heatmapDay} ${styles.level1}`} />
        <div className={`${styles.heatmapDay} ${styles.level2}`} />
        <div className={`${styles.heatmapDay} ${styles.level3}`} />
        <div className={`${styles.heatmapDay} ${styles.level4}`} />
        <span>More</span>
      </div>
    </div>
  );
}
