// app/page.js
'use client';
import { useAuth } from '../lib/AuthContext';
import LoginScreen  from '../components/LoginScreen';
import HabitTracker from '../components/HabitTracker';
import styles from './page.module.css';

export default function Home() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className={styles.splash}>
        <div className={styles.splashLogo}>habit<span>.</span></div>
      </div>
    );
  }

  return user ? <HabitTracker /> : <LoginScreen />;
}
