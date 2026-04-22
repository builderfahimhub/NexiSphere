import { db } from './firebase';
import { collection, addDoc, query, where, onSnapshot, orderBy, serverTimestamp, limit, doc, deleteDoc, or, and, setDoc, increment, getDoc, getDocs, writeBatch } from 'firebase/firestore';
import { sendNotification } from './notifications';

export interface FeedPost {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  authorPhotoURL?: string;
  authorIsAdmin?: boolean; // New field
  createdAt: any;
  likesCount: number;
  viewsCount?: number;
  mediaURL?: string;
  mediaType?: 'image' | 'video';
  isPinned?: boolean;
  isBoosted?: boolean;
  repostFromId?: string;
  repostFromName?: string;
}

export interface FeedComment {
  id: string;
  postId: string;
  content: string;
  authorId: string;
  authorName: string;
  authorPhotoURL?: string;
  createdAt: any;
}

export interface ChatMessage {
  id: string;
  text?: string;
  mediaURL?: string;
  type: 'text' | 'image' | 'voice' | 'file';
  senderId: string;
  receiverId: string;
  createdAt: any;
  isRead: boolean;
}

export interface Conversation {
  id: string; // usually senderId_receiverId (sorted)
  participants: string[];
  lastMessage?: string;
  lastMessageAt?: any;
  unreadCount: { [userId: string]: number };
  status: 'pending' | 'accepted' | 'declined';
}

const cleanData = (obj: any) => {
  const newObj: any = {};
  Object.keys(obj).forEach(key => {
    if (obj[key] !== undefined) {
      newObj[key] = obj[key];
    }
  });
  return newObj;
};

export const createPost = async (post: Omit<FeedPost, 'id' | 'createdAt' | 'likesCount' | 'viewsCount'>) => {
  const docRef = doc(collection(db, 'posts'));
  const id = docRef.id;
  await setDoc(docRef, cleanData({
    ...post,
    id,
    createdAt: serverTimestamp(),
    likesCount: 0,
    viewsCount: 0
  }));
  return id;
};

export const formatNumber = (num: number): string => {
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return num.toString();
};

export const updatePost = async (postId: string, data: Partial<FeedPost>) => {
  try {
    const docRef = doc(db, 'posts', postId);
    await setDoc(docRef, cleanData(data), { merge: true });
  } catch (err) {
    console.error("Error updating post:", err);
    throw err;
  }
};

export const incrementPostView = async (postId: string) => {
  try {
    const docRef = doc(db, 'posts', postId);
    await setDoc(docRef, { viewsCount: increment(1) }, { merge: true });
  } catch (err) {
    console.error("Error incrementing view:", err);
  }
};

export const deletePost = async (postId: string) => {
  try {
    const docRef = doc(db, 'posts', postId);
    await deleteDoc(docRef);
  } catch (error: any) {
    console.error("deletePost error:", error);
    throw error;
  }
};

export const togglePinPost = async (postId: string, isPinned: boolean) => {
  await setDoc(doc(db, 'posts', postId), { isPinned: !isPinned }, { merge: true });
};

export const toggleBoostPost = async (postId: string, isBoosted: boolean) => {
  await setDoc(doc(db, 'posts', postId), { isBoosted: !isBoosted }, { merge: true });
};

export const createComment = async (comment: Omit<FeedComment, 'id' | 'createdAt'>) => {
  const docRef = doc(collection(db, 'comments'));
  await setDoc(docRef, cleanData({
    ...comment,
    id: docRef.id,
    createdAt: serverTimestamp()
  }));
};

export const getPostById = async (postId: string): Promise<FeedPost | null> => {
  try {
    const docRef = doc(db, 'posts', postId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as FeedPost;
    }
  } catch (err) {
    console.error("Error fetching post by ID:", err);
  }
  return null;
};

export const searchPosts = async (searchTerm: string): Promise<FeedPost[]> => {
  try {
    // Basic prefix search for content if users type specific keywords
    // For full-text search, we normally use Algolia/Elastic, but for internal app search:
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(100));
    const snap = await getDocs(q);
    const results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeedPost));
    
    return results.filter(post => 
      post.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      post.authorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      post.id === searchTerm // Direct ID match for links
    );
  } catch (err) {
    console.error("Error searching posts:", err);
    return [];
  }
};

export const subscribeToComments = (postId: string, callback: (comments: FeedComment[]) => void) => {
  const q = query(collection(db, 'comments'), where('postId', '==', postId), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeedComment)));
  }, (err) => {
    console.error('Snapshot error (subscribeToComments):', err);
  });
};

export const sendMessage = async (message: Omit<ChatMessage, 'id' | 'createdAt' | 'isRead'>, senderName: string) => {
  const docRef = doc(collection(db, 'messages'));
  const msgData = {
    ...message,
    id: docRef.id,
    createdAt: serverTimestamp(),
    isRead: false
  };
  await setDoc(docRef, cleanData(msgData));

  // Update or create conversation
  const convId = [message.senderId, message.receiverId].sort().join('_');
  const convRef = doc(db, 'conversations', convId);
  const convSnap = await getDoc(convRef);
  
  if (!convSnap.exists()) {
    await setDoc(convRef, {
      id: convId,
      participants: [message.senderId, message.receiverId],
      lastMessage: message.text || (message.type === 'image' ? 'Sent an image' : message.type === 'voice' ? 'Sent a voice message' : 'Sent a file'),
      lastMessageAt: serverTimestamp(),
      unreadCount: { [message.receiverId]: 1, [message.senderId]: 0 },
      status: 'pending' // Initial status is pending until accepted or if they follow each other (handled by app)
    });
  } else {
    const data = convSnap.data() as Conversation;
    await setDoc(convRef, {
      lastMessage: message.text || (message.type === 'image' ? 'Sent an image' : message.type === 'voice' ? 'Sent a voice message' : 'Sent a file'),
      lastMessageAt: serverTimestamp(),
      [`unreadCount.${message.receiverId}`]: (data.unreadCount[message.receiverId] || 0) + 1
    }, { merge: true });
  }

  await sendNotification({
    userId: message.receiverId,
    type: 'message',
    fromId: message.senderId,
    fromName: senderName,
    text: `New message from ${senderName}`
  });
};

export const subscribeToConversations = (userId: string, callback: (conversations: Conversation[]) => void) => {
  console.log(`[Feed Service] INIT: Subscribing to conversations for userId: ${userId}`);
  
  if (!userId) {
    console.warn("[Feed Service] userId is missing. Aborting subscription.");
    return () => {};
  }

  // Create a minimal query to avoid any potential permission issues with complex filters
  const conversationsRef = collection(db, 'conversations');
  const q = query(
    conversationsRef,
    where('participants', 'array-contains', userId)
  );

  let isSubscribed = true;

  const unsubscribe = onSnapshot(q, (snapshot) => {
    if (!isSubscribed) return;
    
    console.log(`[Feed Service] SYNC: Fetched ${snapshot.size} conversations`);
    const convs = snapshot.docs.map(doc => {
      const data = doc.data();
      return { id: doc.id, ...data } as Conversation;
    });

    const sorted = [...convs].sort((a, b) => {
      const timeA = a.lastMessageAt?.toMillis?.() || 
                    (a.lastMessageAt?.seconds ? a.lastMessageAt.seconds * 1000 : 0);
      const timeB = b.lastMessageAt?.toMillis?.() || 
                    (b.lastMessageAt?.seconds ? b.lastMessageAt.seconds * 1000 : 0);
      return timeB - timeA;
    });
    
    callback(sorted);
  }, (err) => {
    if (!isSubscribed) return;
    
    console.error('[Feed Service] CRITICAL ERROR:', err.message, err.code, err.name);
    
    if (err.code === 'permission-denied') {
      console.error("[Feed Service] PERMISSION DENIED! Rule check failed for userId:", userId);
    }
  });

  return () => {
    isSubscribed = false;
    unsubscribe();
  };
};

export const markMessagesAsRead = async (userId: string, otherId: string) => {
  const convId = [userId, otherId].sort().join('_');
  const convRef = doc(db, 'conversations', convId);
  
  // Reset unread count for current user
  try {
    await setDoc(convRef, {
      [`unreadCount.${userId}`]: 0
    }, { merge: true });
  } catch (e) {
    console.error("markMessagesAsRead count error:", e);
  }

  // Mark individual messages as read (limit to prevent too many writes if many unread)
  const q = query(
    collection(db, 'messages'),
    where('receiverId', '==', userId),
    where('senderId', '==', otherId),
    where('isRead', '==', false)
  );
  
  try {
    const snap = await getDocs(q);
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach(d => {
      batch.update(d.ref, { isRead: true });
    });
    await batch.commit();
  } catch (e) {
    console.error("markMessagesAsRead batch error:", e);
  }
};

export const updateConversationStatus = async (convId: string, status: 'accepted' | 'declined') => {
  await setDoc(doc(db, 'conversations', convId), { status }, { merge: true });
};

export const subscribeToPosts = (callback: (posts: FeedPost[]) => void) => {
  const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(50));
  return onSnapshot(q, (snapshot) => {
    const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeedPost));
    // Sort boosted then pinned posts to the top
    const sortedPosts = [...posts].sort((a, b) => {
      // First priority: Boosted (SEO)
      if (a.isBoosted && !b.isBoosted) return -1;
      if (!a.isBoosted && b.isBoosted) return 1;
      
      // Second priority: Pinned
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      
      return 0; // Maintain relative order (descending createdAt from query)
    });
    callback(sortedPosts);
  }, (err) => {
    console.error('Snapshot error (subscribeToPosts):', err);
  });
};

export const subscribeToMessages = (userId: string, otherId: string, callback: (messages: ChatMessage[]) => void) => {
  // Use simple query and sort client-side to avoid index requirements
  const q = query(
    collection(db, 'messages'),
    or(
      and(where('senderId', '==', userId), where('receiverId', '==', otherId)),
      and(where('senderId', '==', otherId), where('receiverId', '==', userId))
    )
  );

  return onSnapshot(q, (snapshot) => {
    const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
    // Sort client-side by createdAt asc
    const sorted = [...msgs].sort((a, b) => {
      const timeA = a.createdAt?.toMillis?.() || 0;
      const timeB = b.createdAt?.toMillis?.() || 0;
      return timeA - timeB;
    });
    callback(sorted);
  }, (err) => {
    console.error('Snapshot error (subscribeToMessages):', err);
  });
};
