import { db } from './firebase';
import { collection, query, where, onSnapshot, orderBy, serverTimestamp, updateDoc, doc, limit, setDoc } from 'firebase/firestore';

export type NotificationType = 'message' | 'follow';

export interface SocialNotification {
  id: string;
  userId: string;
  type: NotificationType;
  fromId: string;
  fromName: string;
  text: string;
  createdAt: any;
  isRead: boolean;
}

export const sendNotification = async (notification: Omit<SocialNotification, 'id' | 'createdAt' | 'isRead'>) => {
  try {
    const docRef = doc(collection(db, 'notifications'));
    await setDoc(docRef, {
      ...notification,
      id: docRef.id,
      createdAt: serverTimestamp(),
      isRead: false,
    });
  } catch (error) {
    console.error("Error sending notification:", error);
  }
};

export const subscribeToNotifications = (userId: string, callback: (notifications: SocialNotification[]) => void) => {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    limit(20)
  );

  return onSnapshot(q, (snapshot) => {
    const notifications = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as SocialNotification[];
    
    // Sort client-side by createdAt desc to avoid composite index requirement
    const sorted = [...notifications].sort((a, b) => {
      const timeA = a.createdAt?.toMillis?.() || 0;
      const timeB = b.createdAt?.toMillis?.() || 0;
      return timeB - timeA;
    });
    
    callback(sorted);
  }, (err) => {
    console.error('Snapshot error (subscribeToNotifications):', err);
  });
};

export const markNotificationAsRead = async (notificationId: string) => {
  const docRef = doc(db, 'notifications', notificationId);
  await updateDoc(docRef, { isRead: true });
};
