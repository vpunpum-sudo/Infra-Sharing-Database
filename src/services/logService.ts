import { db, auth } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';

export const logActivity = async (action: string, description: string, metadata?: any) => {
  const user = auth.currentUser;
  if (!user) return;

  try {
    const userAgent = navigator.userAgent;
    const path = window.location.pathname;
    const screenResolution = `${window.screen.width}x${window.screen.height}`;
    const language = navigator.language;

    await addDoc(collection(db, 'logs'), {
      id: uuidv4(),
      userId: user.uid,
      userEmail: user.email || 'unknown',
      action,
      description,
      timestamp: new Date().toISOString(),
      metadata: metadata || {},
      userAgent,
      path,
      screenResolution,
      language
    });
  } catch (error) {
    console.error('Error logging activity:', error);
  }
};
