import { db } from './firebase';
import { collection, addDoc, query, where, onSnapshot, orderBy, serverTimestamp, doc, setDoc, deleteDoc, getDoc, getDocs, increment } from 'firebase/firestore';
import { sendNotification } from './notifications';

export interface UserProfile {
  uid: string;
  displayName: string;
  username: string;
  bio?: string;
  photoURL?: string;
  address?: string;
  location?: string;
  email?: string;
  privacyEmail?: boolean;
  isAdmin?: boolean;
  followersCount: number;
  followingCount: number;
}

export const getProfile = async (uid: string): Promise<UserProfile | null> => {
  const docRef = doc(db, 'users', uid);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data() as UserProfile;
  }
  return null;
};

export const updateProfile = async (uid: string, data: Partial<UserProfile>) => {
  const docRef = doc(db, 'users', uid);
  await setDoc(docRef, data, { merge: true });
};

export const followUser = async (followerId: string, followerName: string, followingId: string, followingName: string) => {
  const followId = `${followerId}_${followingId}`;
  await setDoc(doc(db, 'followers', followId), {
    followerId,
    followingId,
    createdAt: serverTimestamp()
  });

  // Update counts using increment
  const followerRef = doc(db, 'users', followerId);
  const followingRef = doc(db, 'users', followingId);
  
  await Promise.all([
    setDoc(followerRef, { followingCount: increment(1) }, { merge: true }),
    setDoc(followingRef, { followersCount: increment(1) }, { merge: true })
  ]);

  await sendNotification({
    userId: followingId,
    type: 'follow',
    fromId: followerId,
    fromName: followerName,
    text: `${followerName} started following you`
  });
};

export const unfollowUser = async (followerId: string, followingId: string) => {
  const followId = `${followerId}_${followingId}`;
  await deleteDoc(doc(db, 'followers', followId));

  // Update counts using increment
  const followerRef = doc(db, 'users', followerId);
  const followingRef = doc(db, 'users', followingId);
  
  await Promise.all([
    setDoc(followerRef, { followingCount: increment(-1) }, { merge: true }),
    setDoc(followingRef, { followersCount: increment(-1) }, { merge: true })
  ]);
};

export const isFollowing = async (followerId: string, followingId: string): Promise<boolean> => {
  const followId = `${followerId}_${followingId}`;
  const docRef = doc(db, 'followers', followId);
  const docSnap = await getDoc(docRef);
  return docSnap.exists();
};

export const getFollowers = async (userId: string): Promise<string[]> => {
  const q = query(collection(db, 'followers'), where('followingId', '==', userId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data().followerId);
};

export const getFollowing = async (userId: string): Promise<string[]> => {
  const q = query(collection(db, 'followers'), where('followerId', '==', userId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data().followingId);
};

export const getProfilesByIds = async (uids: string[]): Promise<UserProfile[]> => {
  if (!uids || uids.length === 0) return [];
  // Firestore 'in' queries are limited to 10 items, handle chunks
  const chunks = [];
  for (let i = 0; i < uids.length; i += 10) {
    chunks.push(uids.slice(i, i + 10));
  }
  const results: UserProfile[] = [];
  for (const chunk of chunks) {
    const q = query(collection(db, 'users'), where('uid', 'in', chunk));
    const snap = await getDocs(q);
    snap.docs.forEach(doc => results.push(doc.data() as UserProfile));
  }
  return results;
};

export const searchProfiles = async (searchTerm: string): Promise<UserProfile[]> => {
  const q = query(
    collection(db, 'users'),
    where('displayName', '>=', searchTerm),
    where('displayName', '<=', searchTerm + '\uf8ff')
  );
  const snapshot = await getDocs(q);
  const results = snapshot.docs.map(doc => doc.data() as UserProfile);
  
  // Also search by username if results are low
  if (results.length < 3) {
    const qv2 = query(
      collection(db, 'users'),
      where('username', '>=', searchTerm.toLowerCase()),
      where('username', '<=', searchTerm.toLowerCase() + '\uf8ff')
    );
    const snapv2 = await getDocs(qv2);
    const resultv2 = snapv2.docs.map(doc => doc.data() as UserProfile);
    
    // Combine and unique
    const combined = [...results];
    resultv2.forEach(r => {
      if (!combined.some(c => c.uid === r.uid)) combined.push(r);
    });
    return combined;
  }
  
  return results;
};
