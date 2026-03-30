// components/HabitTracker.js
'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../lib/AuthContext';
import {
  loadHabits, saveHabit as dbSaveHabit,
  deleteHabit as dbDeleteHabit,
  loadCompletions, saveCompletion as dbSaveCompletion,
} from '../lib/db';
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
  const [goalCount, setGoalCount] = useState(1);
  const [isSaving, setIsSaving] = useState(false);

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
        } catch(e) { return false; }
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
        dbSaveHabit(user.uid, updatedHabit);
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
      const subtasks = isGoal
        ? Array.from({ length: Math.min(100, Math.max(1, parseInt(goalCount) || 0)) }).map((_, i) => ({
          id: `${timestamp}-${i}`,
          name: `${i + 1}`,
          completed: false,
          completedDate: null
        }))
        : [];

      const h = {
        id: timestamp.toString(),
        name,
        color: selColor,
        order: habits.length,
        isGoal,
        subtasks
      };

      setHabits(prev => [...prev, h]);
      await dbSaveHabit(user.uid, h);
      setAddOpen(false);
      setHabitName('');
      setIsGoal(false);
      setGoalCount(1);
      showToast('Habit added ✓');
    } catch (err) {
      showToast('Error saving habit');
    } finally {
      setIsSaving(false);
    }
  };

  // ── delete habit ──────────────────────────────────
  const deleteHabit = async (id, e) => {
    e.stopPropagation();
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className={styles.logo}>habit<span>.</span></div>
            <div className={styles.userBadge}>
              <img src={user.photoURL} alt="" className={styles.avatar} referrerPolicy="no-referrer" />
              <span>{user.displayName?.split(' ')[0]}</span>
            </div>
          </div>
          <div className={styles.headerRight}>
            <div className={styles.monthNav}>
              <button onClick={() => changeMonth(-1)}>‹</button>
              <span className={styles.monthLabel}>{MONTHS[viewMonth]} {viewYear}</span>
              <button onClick={() => changeMonth(1)}>›</button>
            </div>
            <button className={styles.btnAdd} onClick={() => {
              setHabitName('');
              setSelColor(COLORS[0]);
              setIsGoal(false);
              setGoalCount(1);
              setAddOpen(true);
            }}>
              + New Habit
            </button>
            <button className={styles.btnLogout} onClick={logout} title="Sign out">↩</button>
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
                <div className={styles.statIcon}>📈</div>
              </div>

              <div className={styles.statCard}>
                <div>
                  <div className={styles.statLabel}>Best Streak</div>
                  <div className={styles.statValue}>{stats.bStreak}</div>
                  <div className={styles.statSub}>days in a row</div>
                </div>
                <div className={styles.statIcon}>🔥</div>
              </div>

              <div className={styles.statCard}>
                <div>
                  <div className={styles.statLabel}>This Month</div>
                  <div className={styles.statValue}>{stats.mTotal}</div>
                  <div className={styles.statSub}>completions in {MONTHS[viewMonth].slice(0, 3)}</div>
                </div>
                <div className={styles.statIcon}>📅</div>
              </div>
            </div>

            {/* habits list */}
            <div className={styles.habitsSection}>
              <div className={styles.sectionTitle}>My Habits</div>
              <div className={styles.habitsList}>
                {!habits.length ? (
                  <div className={styles.emptyHabits}>
                    <div className={styles.emptyBig}>🌱</div>
                    No habits yet.<br />Add one to get started!
                  </div>
                ) : habits.map(h => (
                  <div key={h.id} className={styles.habitItem}>
                    <div className={styles.habitDot} style={{ background: h.color }} />
                    <div className={styles.habitInfo}>
                      <div className={styles.habitName}>{h.name}</div>
                      <div className={styles.habitStreak}>🔥 {getStreak(h.id, completions, habits)} day streak</div>

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
                    <div className={styles.habitActions}>
                      <button className={styles.actionBtn} onClick={e => deleteHabit(h.id, e)}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div className={styles.rightPanel}>

            {/* progress bars */}
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
                    for (let d = 1; d <= maxD; d++) {
                      const k = dk(viewYear, viewMonth, d);
                      if (completions[k]?.includes(h.id)) c++;
                    }
                    p = maxD ? Math.round(c / maxD * 100) : 0;
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

            {/* calendar */}
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
          </div>
        </div>
      </div>

      {/* ── DAY MODAL ── */}
      {dayModal !== null && (
        <div className={`${styles.modalOverlay} ${styles.open}`} onClick={e => e.target === e.currentTarget && setDayModal(null)}>
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
                        {h.subtasks.map(s => (
                          <div
                            key={s.id}
                            className={`${styles.subtaskItem} ${s.completed ? styles.subtaskDone : ''}`}
                            onClick={() => toggleSubtask(h.id, s.id, dateKey)}
                            style={{
                              ...(s.completed && s.completedDate === dateKey ? { border: `1px solid ${h.color}` } : {}),
                              ...(s.completed && s.completedDate !== dateKey ? { opacity: 0.6, cursor: 'default' } : {})
                            }}
                            title={s.completed && s.completedDate !== dateKey ? `Completed on ${s.completedDate}` : ''}
                          >
                            <span>{s.name}</span>
                            <div className={styles.subtaskCheck}>
                              {s.completed ? (s.completedDate !== dateKey ? '🔒' : '✓') : ''}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── ADD HABIT MODAL ── */}
      {addOpen && (
        <div className={`${styles.addModalOverlay} ${styles.open}`} onClick={e => e.target === e.currentTarget && setAddOpen(false)}>
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
            <div className={styles.formActions}>
              <button className={styles.btnCancel} onClick={() => !isSaving && setAddOpen(false)}>Cancel</button>
              <button className={styles.btnSave} onClick={saveHabit} disabled={isSaving}>
                {isSaving ? 'Adding...' : 'Add Habit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOAST ── */}
      <div className={`${styles.toast} ${toast ? styles.toastShow : ''}`}>{toast}</div>
    </>
  );
}
