// components/HabitTracker.js
'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../lib/AuthContext';
import {
  loadHabits, saveHabit as dbSaveHabit,
  deleteHabit as dbDeleteHabit,
  loadCompletions, saveCompletion as dbSaveCompletion,
} from '../lib/db';
import styles from './HabitTracker.module.css';

// ── constants ─────────────────────────────────────────
const COLORS = [
  '#5B7A5F','#7A6EA8','#C97B5A','#5A8FA8','#A87A7A',
  '#7A9B5A','#A86E8F','#5A7AA8','#C2A05A','#8A7A5A',
];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function dk(y, m, d) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function todayKey() {
  const n = new Date();
  return dk(n.getFullYear(), n.getMonth(), n.getDate());
}
function daysInMonth(y, m)  { return new Date(y, m+1, 0).getDate(); }
function firstDay(y, m)     { return new Date(y, m, 1).getDay(); }
function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── streak helpers ────────────────────────────────────
function getStreak(hid, completions) {
  const t = new Date(); let s = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(t); d.setDate(t.getDate() - i);
    const k = dk(d.getFullYear(), d.getMonth(), d.getDate());
    if (completions[k]?.includes(hid)) s++;
    else { if (i === 0) continue; break; }
  }
  return s;
}
function bestStreak(habits, completions) {
  return habits.length ? Math.max(...habits.map(h => getStreak(h.id, completions))) : 0;
}

// ─────────────────────────────────────────────────────
export default function HabitTracker() {
  const { user, logout } = useAuth();
  const [habits,      setHabits]      = useState([]);
  const [completions, setCompletions] = useState({});
  const [viewYear,    setViewYear]    = useState(() => new Date().getFullYear());
  const [viewMonth,   setViewMonth]   = useState(() => new Date().getMonth());
  const [loading,     setLoading]     = useState(true);

  // modals
  const [dayModal,    setDayModal]    = useState(null); // date number
  const [addOpen,     setAddOpen]     = useState(false);
  const [habitName,   setHabitName]   = useState('');
  const [selColor,    setSelColor]    = useState(COLORS[0]);

  // toast
  const [toast,       setToast]       = useState('');
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
      if (nm < 0)  { setViewYear(y => y - 1); return 11; }
      return nm;
    });
  };

  // ── stats ──────────────────────────────────────────
  const tk   = todayKey();
  const done = completions[tk]?.length || 0;
  const tot  = habits.length;
  const pct  = tot ? Math.round(done / tot * 100) : 0;
  const circ = 125.66;
  const offset = circ - circ * pct / 100;

  const dayCounts = [0,0,0,0,0,0,0];
  Object.keys(completions).forEach(k => {
    const [y,mo,d] = k.split('-').map(Number);
    const day = new Date(y, mo-1, d).getDay();
    dayCounts[day] += completions[k].length;
  });
  const maxVal = Math.max(...dayCounts);
  const bestDayIdx = maxVal > 0 ? dayCounts.indexOf(maxVal) : -1;

  let monthTotal = 0;
  for (let d = 1; d <= daysInMonth(viewYear, viewMonth); d++) {
    const k = dk(viewYear, viewMonth, d);
    if (completions[k]) monthTotal += completions[k].length;
  }

  // ── toggle habit on a day ─────────────────────────
  const toggleHabit = useCallback(async (hid, dateKey) => {
    setCompletions(prev => {
      const ids = [...(prev[dateKey] || [])];
      const idx = ids.indexOf(hid);
      if (idx === -1) ids.push(hid); else ids.splice(idx, 1);
      const next = { ...prev, [dateKey]: ids };
      if (!ids.length) delete next[dateKey];
      dbSaveCompletion(user.uid, dateKey, ids);
      return next;
    });
  }, [user]);

  // ── add habit ─────────────────────────────────────
  const saveHabit = async () => {
    const name = habitName.trim();
    if (!name) { showToast('Please enter a habit name'); return; }
    const h = { id: Date.now().toString(), name, color: selColor, order: habits.length };
    setHabits(prev => [...prev, h]);
    await dbSaveHabit(user.uid, h);
    setAddOpen(false);
    setHabitName('');
    showToast('Habit added ✓');
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

  const today   = new Date();
  const isCurMo = viewYear === today.getFullYear() && viewMonth === today.getMonth();
  const todD    = today.getDate();
  const maxD    = isCurMo ? todD : daysInMonth(viewYear, viewMonth);

  return (
    <>
      {/* ── APP ── */}
      <div className={styles.app}>

        {/* HEADER */}
        <header className={styles.header}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
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
            <button className={styles.btnAdd} onClick={() => { setHabitName(''); setSelColor(COLORS[0]); setAddOpen(true); }}>
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
                  <div className={styles.statValue}>{done}/{tot}</div>
                  <div className={styles.statSub}>
                    {(tot - done) > 0 ? `${tot - done} left to complete` : 'all done today!'}
                  </div>
                </div>
                <div className={styles.ringWrap}>
                  <svg className={styles.ringSvg} viewBox="0 0 48 48" width="48" height="48">
                    <circle className={styles.ringBg}   cx="24" cy="24" r="20" />
                    <circle className={styles.ringFill} cx="24" cy="24" r="20"
                      strokeDasharray={circ} strokeDashoffset={offset} />
                  </svg>
                  <div className={styles.ringText}>{pct}%</div>
                </div>
              </div>

              <div className={styles.statCard}>
                <div>
                  <div className={styles.statLabel}>Most Productive</div>
                  <div className={styles.statValue}>{bestDayIdx !== -1 ? DAYS[bestDayIdx] : '—'}</div>
                  <div className={styles.statSub}>best day of week</div>
                </div>
                <div className={styles.statIcon}>📈</div>
              </div>

              <div className={styles.statCard}>
                <div>
                  <div className={styles.statLabel}>Best Streak</div>
                  <div className={styles.statValue}>{bestStreak(habits, completions)}</div>
                  <div className={styles.statSub}>days in a row</div>
                </div>
                <div className={styles.statIcon}>🔥</div>
              </div>

              <div className={styles.statCard}>
                <div>
                  <div className={styles.statLabel}>This Month</div>
                  <div className={styles.statValue}>{monthTotal}</div>
                  <div className={styles.statSub}>completions in {MONTHS[viewMonth].slice(0,3)}</div>
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
                      <div className={styles.habitStreak}>🔥 {getStreak(h.id, completions)} day streak</div>
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
                  <div style={{ color:'var(--text3)', fontSize:13 }}>No habits yet.</div>
                ) : habits.map(h => {
                  let c = 0;
                  for (let d = 1; d <= maxD; d++) {
                    const k = dk(viewYear, viewMonth, d);
                    if (completions[k]?.includes(h.id)) c++;
                  }
                  const p = maxD ? Math.round(c / maxD * 100) : 0;
                  return (
                    <div key={h.id}>
                      <div className={styles.progressHeader}>
                        <div className={styles.progressName}>
                          <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:h.color, flexShrink:0 }} />
                          {h.name}
                        </div>
                        <div className={styles.progressPct}>{p}%</div>
                      </div>
                      <div className={styles.progressBarBg}>
                        <div className={styles.progressBarFill} style={{ width:`${p}%`, background:h.color }} />
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
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d =>
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
                  const done = completions[k] || [];
                  const future   = isCurMo ? d > todD : new Date(viewYear, viewMonth, d) > today;
                  const isToday  = isCurMo && d === todD;
                  const allDone  = habits.length > 0 && done.length === habits.length;
                  return (
                    <div
                      key={d}
                      className={[
                        styles.calDay,
                        isToday   ? styles.calToday   : '',
                        future    ? styles.calFuture  : '',
                        allDone && !future ? styles.calAllDone : '',
                      ].join(' ')}
                      onClick={() => !future && setDayModal(d)}
                    >
                      <div className={styles.dayNum}>{d}</div>
                      <div className={styles.dayDots}>
                        {done.map(hid => {
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
                const checked = completions[dateKey]?.includes(h.id);
                return (
                  <div
                    key={h.id}
                    className={`${styles.modalHabit} ${checked ? styles.checked : ''}`}
                    style={checked ? { background:`${h.color}18`, borderColor:`${h.color}55` } : {}}
                    onClick={() => toggleHabit(h.id, dateKey)}
                  >
                    <div className={styles.modalHabitLeft}>
                      <div className={styles.habitDot} style={{ background: h.color }} />
                      <div className={styles.modalHabitName}>{h.name}</div>
                    </div>
                    <div className={styles.checkmark}
                      style={checked ? { background:h.color, borderColor:h.color, color:'white' } : {}}>
                      {checked ? '✓' : ''}
                    </div>
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
            <div className={styles.formActions}>
              <button className={styles.btnCancel} onClick={() => setAddOpen(false)}>Cancel</button>
              <button className={styles.btnSave}   onClick={saveHabit}>Add Habit</button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOAST ── */}
      <div className={`${styles.toast} ${toast ? styles.toastShow : ''}`}>{toast}</div>
    </>
  );
}
