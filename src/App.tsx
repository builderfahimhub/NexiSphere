import * as React from 'react';
import { auth, getGoogleProvider, db } from './lib/firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { deleteDoc, doc, getDoc, setDoc, onSnapshot, collection, serverTimestamp } from 'firebase/firestore';
import { UserProfile, getProfile, updateProfile, followUser, unfollowUser, isFollowing, searchProfiles, getFollowers, getFollowing, getProfilesByIds } from './lib/social';
import { FeedPost, createPost, subscribeToPosts, createComment, subscribeToComments, deletePost, updatePost, togglePinPost, toggleBoostPost, getPostById, searchPosts, FeedComment, incrementPostView, Conversation, subscribeToConversations, markMessagesAsRead, updateConversationStatus, formatNumber } from './lib/feed';
import { SocialNotification, subscribeToNotifications, markNotificationAsRead } from './lib/notifications';
import { ChatMessage, sendMessage, subscribeToMessages } from './lib/feed';
import { User as UserIcon, Home, MessageSquare, Bell, Settings, LogOut, Plus, Search, Heart, Share2, Send, CheckCircle2, MapPin, Mail, MoreHorizontal, Image as ImageIcon, ArrowLeft, Trash2, ShieldCheck, MessageCircle, Pin, Sparkles, Filter, History, Eye, Repeat, Edit, Mic, Paperclip, Check, CheckCheck, Compass, Zap, Moon, Sun, Lock, Shield, UserX, HelpCircle, Phone, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast, Toaster } from 'sonner';
import { formatDistanceToNow, format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { useTheme } from 'next-themes';
import { uploadMedia } from './lib/storage';

const ConversationItem = ({ conv, userId, selectedChatUser, onSelect }: { conv: Conversation, userId: string, selectedChatUser: string | null, onSelect: (id: string) => void }) => {
  const otherId = conv.participants.find(p => p !== userId);
  const [otherProfile, setOtherProfile] = React.useState<UserProfile | null>(null);
  const unread = conv.unreadCount[userId] || 0;

  React.useEffect(() => {
    if (otherId) {
      getProfile(otherId).then(setOtherProfile);
    }
  }, [otherId]);

  if (!otherId) return null;

  return (
    <div 
      onClick={() => onSelect(otherId)}
      className={`p-4 rounded-[20px] cursor-pointer transition-all flex items-center gap-3 border border-transparent ${selectedChatUser === otherId ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 shadow-sm' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'}`}
    >
      <div className="relative">
        <Avatar className="h-12 w-12 border-2 border-white dark:border-zinc-800 shadow-sm">
          <AvatarImage src={otherProfile?.photoURL} />
          <AvatarFallback className="font-bold bg-zinc-100">{otherProfile?.displayName?.[0] || '?'}</AvatarFallback>
        </Avatar>
        <div className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 border-2 border-white dark:border-zinc-800 rounded-full" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center">
          <p className="font-bold text-sm truncate dark:text-white">{otherProfile?.displayName || 'Loading...'}</p>
          {conv.lastMessageAt && (
            <span className="text-[9px] text-zinc-400 font-bold uppercase">{formatDistanceToNow(conv.lastMessageAt.toDate(), { addSuffix: false })}</span>
          )}
        </div>
        <p className={`text-xs truncate ${unread > 0 ? 'text-zinc-900 dark:text-zinc-100 font-bold' : 'text-zinc-500 font-medium'}`}>{conv.lastMessage}</p>
      </div>
      {unread > 0 && (
        <div className="h-5 w-5 bg-bento-accent rounded-full flex items-center justify-center text-[10px] text-white font-bold ring-4 ring-white dark:ring-zinc-900 shadow-lg">
          {unread}
        </div>
      )}
    </div>
  );
};

export default function App() {
  const { theme, setTheme } = useTheme();
  const [user, setUser] = React.useState<FirebaseUser | null>(null);
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [posts, setPosts] = React.useState<FeedPost[]>([]);
  const [notifications, setNotifications] = React.useState<SocialNotification[]>([]);
  const [activeTab, setActiveTab] = React.useState('home');
  const [loading, setLoading] = React.useState(true);
  const [newPostContent, setNewPostContent] = React.useState('');
  const [newPostMediaURL, setNewPostMediaURL] = React.useState('');
  const [newPostMediaType, setNewPostMediaType] = React.useState<'image' | 'video' | ''>('');
  const [showMediaInput, setShowMediaInput] = React.useState(false);
  const [tabHistory, setTabHistory] = React.useState<string[]>(['home']);
  
  // File Upload State
  const [isUploading, setIsUploading] = React.useState(false);
  const [isUploadingProfile, setIsUploadingProfile] = React.useState(false); // New state
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const profileFileInputRef = React.useRef<HTMLInputElement>(null); // New ref

  // Settings Form State
  const [editName, setEditName] = React.useState('');
  const [editBio, setEditBio] = React.useState('');
  const [editPhoto, setEditPhoto] = React.useState('');
  const [editAddress, setEditAddress] = React.useState('');
  const [editLocation, setEditLocation] = React.useState('');
  const [editEmail, setEditEmail] = React.useState('');
  const [privacyEmail, setPrivacyEmail] = React.useState(false);
  
  // Profile Navigation State
  const [viewedProfile, setViewedProfile] = React.useState<UserProfile | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<UserProfile[]>([]);
  const [searchPostResults, setSearchPostResults] = React.useState<FeedPost[]>([]);
  const [exploreTab, setExploreTab] = React.useState<'users' | 'posts'>('users');

  // Follow Modal State
  const [followModalOpen, setFollowModalOpen] = React.useState(false);
  const [followModalType, setFollowModalType] = React.useState<'Followers' | 'Following'>('Followers');
  const [followModalProfiles, setFollowModalProfiles] = React.useState<UserProfile[]>([]);
  const [followModalLoading, setFollowModalLoading] = React.useState(false);

  const openFollowModal = async (userId: string, type: 'Followers' | 'Following') => {
    setFollowModalType(type);
    setFollowModalOpen(true);
    setFollowModalLoading(true);
    try {
      const uids = type === 'Followers' ? await getFollowers(userId) : await getFollowing(userId);
      const profiles = await getProfilesByIds(uids);
      setFollowModalProfiles(profiles);
    } catch (e) {
      toast.error('Could not load list');
    } finally {
      setFollowModalLoading(false);
    }
  };

  // Messaging State
  const [selectedChatUser, setSelectedChatUser] = React.useState<string | null>(null);
  const [selectedChatUserProfile, setSelectedChatUserProfile] = React.useState<UserProfile | null>(null);
  const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = React.useState('');
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [isRecording, setIsRecording] = React.useState(false);
  const mediaFileInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploadingMedia, setIsUploadingMedia] = React.useState(false);
  
  // Chatbot State
  const [chatbotMessages, setChatbotMessages] = React.useState<{role: 'user' | 'model', parts: {text: string}[]}[]>([
    { 
      role: 'model', 
      parts: [{ text: "Hello! I'm your NexiSphere AI Assistant. 🤖 How can I help you build your sphere today? I can help with platform tips, creative ideas, or just chat!" }] 
    }
  ]);
  const [chatbotInput, setChatbotInput] = React.useState('');
  const [isBotLoading, setIsBotLoading] = React.useState(false);
  const [isChatbotOpen, setIsChatbotOpen] = React.useState(false);
  const chatEndRef = React.useRef<HTMLDivElement>(null);
  
  React.useEffect(() => {
    if (isChatbotOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatbotMessages, isChatbotOpen]);

  const handleSendChatbotMessage = async () => {
    if (!chatbotInput.trim() || isBotLoading) return;
    
    const userMsg = chatbotInput.trim();
    setChatbotInput('');
    const newHistory = [...chatbotMessages, { role: 'user', parts: [{ text: userMsg }] }];
    // @ts-ignore
    setChatbotMessages(newHistory);
    setIsBotLoading(true);

    try {
      const { getGeminiResponse } = await import('./services/geminiService');
      // @ts-ignore
      const response = await getGeminiResponse(userMsg, chatbotMessages);
      // @ts-ignore
      setChatbotMessages([...newHistory, { role: 'model', parts: [{ text: response }] }]);
    } catch (e) {
      toast.error("AI is unreachable right now.");
    } finally {
      setIsBotLoading(false);
    }
  };

  const addSamplePosts = async () => {
    if (!user || !profile) {
      toast.error("Sign in first!");
      return;
    }

    const createSeedData = async () => {
      // 1. Create a set of "Verified Pioneers" to build community trust
      const pioneers = [
        { uid: 'nexi_official', name: 'NexiSphere Official', photo: 'https://picsum.photos/seed/nexi/200', bio: 'Connecting the world, one block at a time.' },
        { uid: 'tech_guru', name: 'Elite Coder', photo: 'https://picsum.photos/seed/tech/200', bio: 'I code in my sleep.' },
        { uid: 'nature_lover', name: 'Green Soul', photo: 'https://picsum.photos/seed/green/200', bio: 'Nature is my home.' },
        { uid: 'photography_pro', name: 'Lens Master', photo: 'https://picsum.photos/seed/camera/200', bio: 'Capturing moments you can feel.' },
        { uid: 'crypto_knight', name: 'DeFi Dave', photo: 'https://picsum.photos/seed/crypto/200', bio: 'Blockchain is my oxygen.' },
        { uid: 'travel_bug', name: 'Wanderlust Will', photo: 'https://picsum.photos/seed/travel/200', bio: 'Exploring every corner of the globe.' },
        { uid: 'foodie_finest', name: 'Chef Sofia', photo: 'https://picsum.photos/seed/food/200', bio: 'Turning ingredients into magic.' },
        { uid: 'fitness_inspire', name: 'Coach Marcus', photo: 'https://picsum.photos/seed/gym/200', bio: 'Your health is your greatest wealth.' }
      ];

      // Ensure Pioneer profiles exist (simplified)
      for (const p of pioneers) {
        await setDoc(doc(db, 'users', p.uid), {
          uid: p.uid,
          displayName: p.name,
          username: p.uid,
          photoURL: p.photo,
          bio: p.bio,
          isAdmin: p.uid === 'aura_official',
          followersCount: Math.floor(Math.random() * 8000) + 1500,
          followingCount: Math.floor(Math.random() * 800) + 200,
          createdAt: new Date().toISOString()
        }, { merge: true });
      }

      const postData = [
        { 
          content: "🚀 BOOST YOUR REACH! If you need to boost your post to the top of everyone's feed, contact us at fahimzzhasan0@gmail.com for SEO promotion details.", 
          authorId: pioneers[0].uid, 
          authorName: pioneers[0].name, 
          authorPhotoURL: pioneers[0].photo, 
          authorIsAdmin: true, 
          mediaURL: "https://picsum.photos/seed/rocket_seo/1200/800", 
          type: "text" as const,
          isBoosted: true 
        },
        { content: "Welcome to NexiSphere! 🚀 A truly decentralized and open social network built for freedom.", authorId: pioneers[0].uid, authorName: pioneers[0].name, authorPhotoURL: pioneers[0].photo, authorIsAdmin: true, mediaURL: "", type: "text" as const },
        { content: "Just deployed our new AI Chatbot! Try it out and tell us what you think. 🤖 #NexiSphere #AI", authorId: pioneers[0].uid, authorName: pioneers[0].name, authorPhotoURL: pioneers[0].photo, authorIsAdmin: true, mediaURL: "https://picsum.photos/seed/robot/1200/800", type: "text" as const },
        { content: "Coffee and Code – the perfect morning ritual. ☕️💻 Check out my latest project on GitHub!", authorId: pioneers[1].uid, authorName: pioneers[1].name, authorPhotoURL: pioneers[1].photo, authorIsAdmin: false, mediaURL: "https://picsum.photos/seed/workspace/1200/800", type: "text" as const },
        { content: "The beauty of the Pacific Northwest is unmatched. 🌲🌊 Happy Sunday everyone!", authorId: pioneers[2].uid, authorName: pioneers[2].name, authorPhotoURL: pioneers[2].photo, authorIsAdmin: false, mediaURL: "https://picsum.photos/seed/wood/1200/900", type: "text" as const },
        { content: "Sunset at the Golden Gate Bridge was breathtaking tonight. 🌉✨", authorId: pioneers[3].uid, authorName: pioneers[3].name, authorPhotoURL: pioneers[3].photo, authorIsAdmin: false, mediaURL: "https://picsum.photos/seed/sunset/1200/800", type: "text" as const },
        { content: "Web3 is not just a trend, it is a paradigm shift. Don't be late! ⛓️💎", authorId: pioneers[4].uid, authorName: pioneers[4].name, authorPhotoURL: pioneers[4].photo, authorIsAdmin: false, mediaURL: "https://picsum.photos/seed/matrix/1200/800", type: "text" as const },
        { content: "Started learning Rust today. The memory safety features are mind-blowing! 🦀 #programming", authorId: pioneers[1].uid, authorName: pioneers[1].name, authorPhotoURL: pioneers[1].photo, authorIsAdmin: false, mediaURL: "", type: "text" as const },
        { content: "Morning hike to the mountain peak. Nothing clears the mind like fresh air. 🥾⛰️", authorId: pioneers[2].uid, authorName: pioneers[2].name, authorPhotoURL: pioneers[2].photo, authorIsAdmin: false, mediaURL: "https://picsum.photos/seed/mountain/1200/800", type: "text" as const },
        { content: "My macro lens arrived! Look at the detail on this bee. 🐝📸", authorId: pioneers[3].uid, authorName: pioneers[3].name, authorPhotoURL: pioneers[3].photo, authorIsAdmin: false, mediaURL: "https://picsum.photos/seed/bee/1200/800", type: "text" as const },
        { content: "Bitcoin is testing major resistance levels again. Strap in! 🚀🌕", authorId: pioneers[4].uid, authorName: pioneers[4].name, authorPhotoURL: pioneers[4].photo, authorIsAdmin: false, mediaURL: "", type: "text" as const },
        { content: "Check out this minimalist setup. Clean desk, clean mind. 💻🪴", authorId: pioneers[1].uid, authorName: pioneers[1].name, authorPhotoURL: pioneers[1].photo, authorIsAdmin: false, mediaURL: "https://picsum.photos/seed/desk/1200/800", type: "text" as const },
        { content: "Anyone else attending the Nexi Developers Conference next week? Let's connect! 🤝", authorId: pioneers[0].uid, authorName: pioneers[0].name, authorPhotoURL: pioneers[0].photo, authorIsAdmin: true, mediaURL: "", type: "text" as const },
        { content: "Wildflowers in bloom! Nature's palette is the best palette. 🌸🎨", authorId: pioneers[2].uid, authorName: pioneers[2].name, authorPhotoURL: pioneers[2].photo, authorIsAdmin: false, mediaURL: "https://picsum.photos/seed/flower/1200/800", type: "text" as const },
        { content: "Just landed in Santorini! The blue domes against the Aegean Sea are even more beautiful in person. 🇬🇷💙", authorId: pioneers[5].uid, authorName: pioneers[5].name, authorPhotoURL: pioneers[5].photo, authorIsAdmin: false, mediaURL: "https://picsum.photos/seed/santorini/1200/800", type: "text" as const },
        { content: "Making my signature sourdough bread today. The starter is perfectly bubbly! 🍞✨", authorId: pioneers[6].uid, authorName: pioneers[6].name, authorPhotoURL: pioneers[6].photo, authorIsAdmin: false, mediaURL: "https://picsum.photos/seed/bread/1200/800", type: "text" as const },
        { content: "Early morning HIIT session done. Consistency is the key to progress! 🦾🔥", authorId: pioneers[7].uid, authorName: pioneers[7].name, authorPhotoURL: pioneers[7].photo, authorIsAdmin: false, mediaURL: "https://picsum.photos/seed/gym_session/1200/800", type: "text" as const },
        { content: "Walking through the kyoto bamboo forest feels like being in another world. 🎋🇯🇵", authorId: pioneers[5].uid, authorName: pioneers[5].name, authorPhotoURL: pioneers[5].photo, authorIsAdmin: false, mediaURL: "https://picsum.photos/seed/bamboo/1200/800", type: "text" as const },
        { content: "Pasta carbonara – no cream, just egg yolks, pecorino, guanciale, and black pepper. The Roman way! 🍝🇮🇹", authorId: pioneers[6].uid, authorName: pioneers[6].name, authorPhotoURL: pioneers[6].photo, authorIsAdmin: false, mediaURL: "https://picsum.photos/seed/pasta/1200/800", type: "text" as const },
        { content: "New personal record on deadlifts today! 200kg feels light(er). 🏋️‍♂️💪", authorId: pioneers[7].uid, authorName: pioneers[7].name, authorPhotoURL: pioneers[7].photo, authorIsAdmin: false, mediaURL: "", type: "text" as const },
        { content: "The Northern Lights were absolutely dancing tonight in Iceland. Nature's light show! 🌌🇮🇸", authorId: pioneers[5].uid, authorName: pioneers[5].name, authorPhotoURL: pioneers[5].photo, authorIsAdmin: false, mediaURL: "https://picsum.photos/seed/aurora/1200/800", type: "text" as const },
        { content: "Fresh farmers market finds! There's nothing like seasonal produce. 🍎🥕🌽", authorId: pioneers[6].uid, authorName: pioneers[6].name, authorPhotoURL: pioneers[6].photo, authorIsAdmin: false, mediaURL: "https://picsum.photos/seed/market/1200/800", type: "text" as const },
        { content: "Recovery is just as important as the workout. Stretching and hydration today. 🧘‍♂️💧", authorId: pioneers[7].uid, authorName: pioneers[7].name, authorPhotoURL: pioneers[7].photo, authorIsAdmin: false, mediaURL: "", type: "text" as const },
        { content: "Check out this AI-generated art piece I made based on NexiSphere's vision. 🎨🤖", authorId: pioneers[0].uid, authorName: pioneers[0].name, authorPhotoURL: pioneers[0].photo, authorIsAdmin: true, mediaURL: "https://picsum.photos/seed/abstract/1200/800", type: "text" as const },
        { content: "The beauty of nature in a single flower. 🌸✨ #Nature #Stability", authorId: pioneers[2].uid, authorName: pioneers[2].name, authorPhotoURL: pioneers[2].photo, authorIsAdmin: false, mediaURL: "https://www.w3schools.com/html/mov_bbb.mp4", mediaType: "video" as const, type: "text" as const },
        { content: "Big Buck Bunny – a classic animation test. 🐰🥕 #Animation #HD", authorId: pioneers[5].uid, authorName: pioneers[5].name, authorPhotoURL: pioneers[5].photo, authorIsAdmin: false, mediaURL: "https://www.w3schools.com/html/movie.mp4", mediaType: "video" as const, type: "text" as const },
        { content: "Check out this quick clip of a horse running. 🐎💨 #Nature #Motion", authorId: pioneers[3].uid, authorName: pioneers[3].name, authorPhotoURL: pioneers[3].photo, authorIsAdmin: false, mediaURL: "https://www.w3schools.com/html/horse.mp4", mediaType: "video" as const, type: "text" as const },
        // User's own posts for familiarity - removed from loop and handled deterministically below
      ];

      for (const data of postData) {
        // Create the post
        const postRef = doc(collection(db, 'posts'));
        const postId = postRef.id;
        await setDoc(postRef, {
          ...data,
          id: postId,
          createdAt: serverTimestamp(),
          likesCount: Math.floor(Math.random() * 50) + 10,
          viewsCount: Math.floor(Math.random() * 500) + 100,
          isBoosted: data.isBoosted || false
        });

        // Add 2-3 sample comments per post for "Social Proof"
        const commentPool = [
          "This looks incredible! So glad to be here.",
          "NexiSphere is the future. 🚀",
          "Love the design and speed. Well done!",
          "Great photo! What camera did you use?",
          "Happy for you! Keep up the great work.",
          "Absolutely agree. #CommunityFirst",
          "Wow, I need that coffee right now. ☕️"
        ];

        const shuffle = (array: any[]) => [...array].sort(() => Math.random() - 0.5);
        const selectedComments = shuffle(commentPool).slice(0, 3);

        for (const text of selectedComments) {
          const cPioneer = pioneers[Math.floor(Math.random() * pioneers.length)];
          await createComment({
            postId,
            content: text,
            authorId: cPioneer.uid,
            authorName: cPioneer.name,
            authorPhotoURL: cPioneer.photo
          });
        }
      }

      // 2. NEW: Create "Welcome" conversations with ALL Pioneers for the Admin
      const welcomeMessages = pioneers.map((p, idx) => ({
        from: p,
        text: idx === 0 
          ? `Hi ${profile.displayName}! I'm Nexi, your main community guide. 🌐`
          : idx === 1 
          ? `Hey! Loved your vision for NexiSphere. Let's build together. 🚀`
          : `Hello from ${p.name}! Ready to explore?`,
        type: 'text' as const
      }));

      for (const msg of welcomeMessages) {
        // Create conversation
        const convId = [user.uid, msg.from.uid].sort().join('_');
        const convRef = doc(db, 'conversations', convId);
        
        await setDoc(convRef, {
          id: convId,
          participants: [user.uid, msg.from.uid],
          lastMessage: msg.text,
          lastMessageAt: serverTimestamp(),
          unreadCount: { [user.uid]: 1, [msg.from.uid]: 0 },
          status: 'accepted'
        }, { merge: true });

        // Add initial message
        const msgRef = doc(collection(db, 'messages'));
        await setDoc(msgRef, {
          id: msgRef.id,
          text: msg.text,
          senderId: msg.from.uid,
          receiverId: user.uid,
          createdAt: serverTimestamp(),
          isRead: false,
          type: msg.type
        });
      }

      // 3. SPECIAL BOOST: Grant the requester (Admin) 100k followers and 20k likes on their posts
      if (user.email === 'ahfahimsylhet@gmail.com') {
        const adminEmail = 'ahfahimsylhet@gmail.com';
        console.log(`[Admin Boost] Granting 100k followers and 20k likes to ${adminEmail}`);

        // Boost Profile in DB
        const userRef = doc(db, 'users', user.uid);
        await setDoc(userRef, {
          followersCount: 10000,
          isAdmin: true,
          bio: profile?.bio || "Global Admin & Founder of NexiSphere. 🌐 Building the future of social freedom."
        }, { merge: true });

        // Update local profile state immediately
        const updatedProfile = { 
          ...profile, 
          uid: user.uid,
          followersCount: 10000, 
          isAdmin: true,
          displayName: profile?.displayName || user.displayName || 'Admin'
        } as UserProfile;
        setProfile(updatedProfile);

        // Boost existing posts of this user with likes and COMMENTS
        const userPosts = posts.filter(p => p.authorId === user.uid);
        console.log(`[Admin Boost] Boosting ${userPosts.length} posts...`);
        
        // 3b. CREATE/RESTORE MAIN PINNED POST (Deterministic)
        const adminPostId = `pinned_admin_${user.uid}`;
        console.log(`[Admin Boost] Ensuring deterministic pinned post: ${adminPostId}`);
        await setDoc(doc(db, 'posts', adminPostId), {
           id: adminPostId,
           content: "Hello NexiSphere family! ✋ Truly excited to finally share my journey with you all. This platform is more than just an app; it's a global movement for digital freedom. Let's build the future together! 🚀 #Founder #Web3 #NextGen",
           authorId: user.uid,
           authorName: profile?.displayName || user.displayName || 'Admin',
           authorPhotoURL: profile?.photoURL || user.photoURL,
           authorIsAdmin: true,
           mediaURL: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?bg=white&auto=format&fit=crop&q=80&w=1200", 
           type: "text",
           isPinned: true,
           createdAt: serverTimestamp(),
           likesCount: 5000,
           viewsCount: 15000,
           repostsCount: 400
        }, { merge: true });

        // Add specific comments to THIS pinned post
        const numPinnedComments = 5;
        const pinnedPioneers = pioneers.slice(0, 5);
        const pinnedTexts = [
          "So inspiring to see the face behind the vision! 💎",
          "Leading from the front! Love this post.",
          "NexiSphere is definitely in good hands. 🚀",
          "Powerful words. Let's build!",
          "Great photo, Admin! The vibe is unmatched. 🔥"
        ];
        
        for (let i = 0; i < pinnedTexts.length; i++) {
          await createComment({
            postId: adminPostId,
            content: pinnedTexts[i],
            authorId: pinnedPioneers[i].uid,
            authorName: pinnedPioneers[i].name,
            authorPhotoURL: pinnedPioneers[i].photo
          });
        }

        const commentPool = [
          "This looks incredible! So glad to be here.",
          "NexiSphere is where creative energies collide. 🚀",
          "Love the design and speed. Well done!",
          "Great photo! What camera did you use?",
          "Happy for you! Keep up the great work.",
          "Absolutely agree. #CommunityFirst",
          "Wow, I need that coffee right now. ☕️",
          "This vision is exactly what we need today. 🌐",
          "Always inspiring to see your updates!",
          "NexiSphere really feels like a home for freedom. 🔥",
          "Can't wait to see what you build next!",
          "Keep pushing the boundaries! 🦾",
          "This is iconic. 👑"
        ];

        for (const post of userPosts) {
          // Update stats
          await setDoc(doc(db, 'posts', post.id), {
            likesCount: 4000,
            viewsCount: 12000,
            repostsCount: 300,
            isPinned: true // Pin for all dashboards
          }, { merge: true });

          // Add 3-5 random comments from pioneers
          const numComments = Math.floor(Math.random() * 3) + 3;
          for (let i = 0; i < numComments; i++) {
            const pioneer = pioneers[Math.floor(Math.random() * pioneers.length)];
            const text = commentPool[Math.floor(Math.random() * commentPool.length)];
            await createComment({
              postId: post.id,
              content: text,
              authorId: pioneer.uid,
              authorName: pioneer.name,
              authorPhotoURL: pioneer.photo
            });
          }
        }
      }

      // 4. COMMUNITY ACTIVITY: Add comments to a few "Other" posts to make the newsfeed busy
      const otherPosts = posts.filter(p => p.authorId !== user.uid).slice(0, 10);
      const communityFeedbacks = [
        "Love seeing the activity here! 📈",
        "Great post! Thanks for sharing.",
        "NexiSphere community is the best. 🤝",
        "Interesting perspective. I'll have to think about this!",
        "Stunning visuals. 🌈",
        "Which pioneer is this? Love their content!",
        "Definitely sharing this one. 🔁"
      ];

      for (const post of otherPosts) {
        const numToComment = Math.floor(Math.random() * 2) + 1;
        for (let i = 0; i < numToComment; i++) {
          const pioneer = pioneers[Math.floor(Math.random() * pioneers.length)];
          const feedback = communityFeedbacks[Math.floor(Math.random() * communityFeedbacks.length)];
          await createComment({
            postId: post.id,
            content: feedback,
            authorId: pioneer.uid,
            authorName: pioneer.name,
            authorPhotoURL: pioneer.photo
          });
        }
      }

      // 5. Generate some "Followers" documents (ONLY Followers, NO Following)
      if (user.email === 'ahfahimsylhet@gmail.com') {
        const samplePioneers = pioneers.slice(0, 8);
        for (const p of samplePioneers) {
          // They follow you
          const followerId = `${p.uid}_${user.uid}`;
          await setDoc(doc(db, 'followers', followerId), {
            id: followerId,
            followerId: p.uid,
            followingId: user.uid,
            createdAt: serverTimestamp()
          }, { merge: true });
        }
        
        // Final State Refresh for Admin: 10k Followers, 0 Following
        await setDoc(doc(db, 'users', user.uid), {
          followersCount: 10000,
          followingCount: 0,
          isAdmin: true
        }, { merge: true });
        
        // Clean up any existing follows the user might have (if they existed before)
        // Note: Real cleanup would require a query/delete, but for seeding we just reset the count
      }
    };

    toast.promise(createSeedData(), {
      loading: 'Populating community feed...',
      success: 'News feed updated with active community posts!',
      error: 'Failed to fully seed feed.'
    });
  };

  // Admin Search State
  const [adminSearchQuery, setAdminSearchQuery] = React.useState('');

  React.useEffect(() => {
    let unsubProfile: () => void;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        setUser(user);
        if (user) {
          console.log('User detected:', user.email);
          let p = await getProfile(user.uid);
          const isDefaultAdmin = user.email?.toLowerCase() === 'ahfahimsylhet@gmail.com';
          
          if (!p) {
            console.log('No profile found, creating one...');
            p = {
              uid: user.uid,
              displayName: user.displayName || 'Anonymous',
              username: user.email?.split('@')[0] || user.uid.slice(0, 8),
              photoURL: user.photoURL || '',
              followersCount: 0,
              followingCount: 0,
              isAdmin: isDefaultAdmin
            };
            await setDoc(doc(db, 'users', user.uid), p);
            if (isDefaultAdmin) {
              setTimeout(() => addSamplePosts(), 1500);
            }
          } else {
            console.log('Profile found:', p);
            if (isDefaultAdmin) {
              // Ensure existing admin gets updated with all new features and pioneers
              setTimeout(() => addSamplePosts(), 1000);
              if (!p.isAdmin) {
                console.log('Auto-booting admin status...');
                await updateProfile(user.uid, { isAdmin: true });
                p = { ...p, isAdmin: true };
              }
            }
          }
          setProfile(p);
          
          // Setup realtime listener for profile to update followers/following accurately
          unsubProfile = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
            if (docSnap.exists()) {
              setProfile(docSnap.data() as UserProfile);
            }
          }, (err) => {
            console.error('Snapshot error (unsubProfile):', err);
          });
        } else {
          setProfile(null);
          if (unsubProfile) unsubProfile();
        }
      } catch (e: any) {
        console.error('Auth State Error:', e);
        toast.error('Failed to load user profile.');
      } finally {
        setLoading(false);
      }
    });
    return () => {
      unsubscribe();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  React.useEffect(() => {
    if (profile) {
      setEditName(profile.displayName || '');
      setEditBio(profile.bio || '');
      setEditPhoto(profile.photoURL || '');
      setEditAddress(profile.address || '');
      setEditLocation(profile.location || '');
      setEditEmail(profile.email || user?.email || '');
      setPrivacyEmail(profile.privacyEmail || false);
    }
  }, [profile, user]);

  React.useEffect(() => {
    if (!user || user.isAnonymous) return; // Only subscribe for authenticated, verified users
    const unsubPosts = subscribeToPosts(setPosts);
    const unsubNotifs = subscribeToNotifications(user.uid, setNotifications);
    return () => {
      unsubPosts();
      unsubNotifs();
    };
  }, [user]);

  React.useEffect(() => {
    if (!user || user.isAnonymous) return;
    const unsubConversations = subscribeToConversations(user.uid, setConversations);
    return () => unsubConversations();
  }, [user]);

  React.useEffect(() => {
    if (selectedChatUser) {
      getProfile(selectedChatUser).then(setSelectedChatUserProfile);
    } else {
      setSelectedChatUserProfile(null);
    }
  }, [selectedChatUser]);

  React.useEffect(() => {
    if (!user || !selectedChatUser) return;
    
    // Mark messages as read when joining chat
    markMessagesAsRead(user.uid, selectedChatUser);
    
    const unsubMessages = subscribeToMessages(user.uid, selectedChatUser, setChatMessages);
    return () => unsubMessages();
  }, [user, selectedChatUser]);

  const handleLogin = async () => {
    try {
      console.log('Starting Google Login...');
      await signInWithPopup(auth, getGoogleProvider());
      toast.success('Logged in successfully!');
    } catch (error: any) {
      console.error('Login Error:', error);
      toast.error(`Login failed: ${error.message || 'Unknown error'}`);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    toast.info('Logged out.');
  };

  let unsubViewedProfile: any = null;

  const navigateTo = (tab: string, profileUid?: string) => {
    console.log(`Attempting navigation to: ${tab}${profileUid ? ` for profile ${profileUid}` : ''}`);
    if (profileUid) {
      if (unsubViewedProfile) unsubViewedProfile();
      
      getProfile(profileUid).then(p => {
        if (p) {
          setViewedProfile(p);
          setActiveTab('visit-profile');
          setTabHistory(prev => [...prev, 'visit-profile']);
          
          unsubViewedProfile = onSnapshot(doc(db, 'users', p.uid), (docSnap) => {
            if (docSnap.exists()) {
              setViewedProfile(docSnap.data() as UserProfile);
            }
          }, (err) => {
            console.error('Snapshot error (unsubViewedProfile):', err);
          });
        }
      });
      return;
    }
    setTabHistory(prev => [...prev, tab]);
    setActiveTab(tab);
  };

  const handleBack = () => {
    if (tabHistory.length > 1) {
      const newHistory = [...tabHistory];
      newHistory.pop();
      const lastTab = newHistory[newHistory.length - 1];
      setTabHistory(newHistory);
      setActiveTab(lastTab);
    }
  };

  const handleCreatePost = async () => {
    if (!profile || (!newPostContent.trim() && !newPostMediaURL)) return;
    try {
      const postId = await createPost({
        content: newPostContent,
        authorId: profile.uid,
        authorName: profile.displayName,
        authorPhotoURL: profile.photoURL,
        authorIsAdmin: !!profile.isAdmin,
        mediaURL: newPostMediaURL || undefined,
        mediaType: newPostMediaType as any
      });

      // AUTO-ENGAGEMENT for Admin
      if (user?.email === 'ahfahimsylhet@gmail.com') {
        const adminEmail = 'ahfahimsylhet@gmail.com';
        console.log(`[Auto-Engagement] Boosting new post ${postId} for ${adminEmail}`);
        
        // Add Likes
        await updatePost(postId, { likesCount: 4000, viewsCount: 15000 });

        // Add 5 random comments from pioneers
        const adminComments = [
          "This is revolutionary! 🚀",
          "Exactly what I was thinking. Well said!",
          "NexiSphere is moving fast. Love this.",
          "Great insights on the new updates, Admin!",
          "Supporting the vision! 💎⛓️"
        ];
        
        const pioneers = ['nexi_official', 'tech_guru', 'nature_lover', 'photography_pro', 'crypto_knight'];
        const pioneerNames = ['NexiSphere Official', 'Elite Coder', 'Green Soul', 'Lens Master', 'DeFi Dave'];

        for (let i = 0; i < adminComments.length; i++) {
          await createComment({
            postId,
            content: adminComments[i],
            authorId: pioneers[i],
            authorName: pioneerNames[i]
          });
        }
      }

      setNewPostContent('');
      setNewPostMediaURL('');
      setNewPostMediaType('');
      setShowMediaInput(false);
      toast.success('Posted!');
    } catch (e: any) {
      console.error('Post Creation Error:', e);
      toast.error(`Failed to post: ${e.message || 'Unknown error'}`);
    }
  };

  const toggleAdminMode = async () => {
    if (!profile) return;
    try {
      await updateProfile(profile.uid, { isAdmin: !profile.isAdmin });
      toast.success(profile.isAdmin ? 'Admin mode disabled' : 'Admin mode enabled');
    } catch (err: any) {
      console.error("Toggle Admin Error:", err);
      toast.error('Failed to update admin status.');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const MAX_SIZE = 200 * 1024 * 1024; 
    if (file.size > MAX_SIZE) {
      toast.error("File is too large! (Limit 200MB)");
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgress(0);
      toast.info("Uploading media...");

      // Base64 Compression for Images (Bypasses Firebase Storage to fix 0% hang)
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
          const img = new Image();
          img.src = event.target?.result as string;
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1200;
            const MAX_HEIGHT = 1200;
            let { width, height } = img;
            if (width > height) {
              if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
            } else {
              if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
            
            // Check size (Firestore limit is ~1MB)
            if (compressedBase64.length > 1000000) {
                 toast.error("Image too complex! Cannot compress under 1MB limit for quick-upload.");
                 setIsUploading(false);
                 return;
            }

            setNewPostMediaURL(compressedBase64);
            setNewPostMediaType('image');
            setShowMediaInput(true);
            setUploadProgress(100);
            toast.success("Image processed and ready!");
            setIsUploading(false);
          };
        };
        return; // Early return for images
      }

      // For videos or non-images, fallback to normal storage
      const path = `posts/${user.uid}/${Date.now()}_${file.name}`;
      const url = await uploadMedia(file, path, (progress) => {
        setUploadProgress(Math.round(progress));
      });

      setNewPostMediaURL(url);
      setNewPostMediaType(file.type.startsWith('video/') ? 'video' : 'image');
      setShowMediaInput(true);
      toast.success("Media uploaded and ready!");
    } catch (err: any) {
      if (err.message === "Upload timed out after 5 minutes.") {
          toast.error("Upload failed: Ensure Firebase Storage is enabled in your project.");
      } else {
          toast.error("Failed to upload media.");
      }
      console.error(err);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleSendMessage = async () => {
    if (!user || !profile || !selectedChatUser || !newMessage.trim()) return;
    try {
      const msg = newMessage;
      setNewMessage('');
      await sendMessage({
        text: msg,
        senderId: user.uid,
        receiverId: selectedChatUser,
        type: 'text'
      }, profile.displayName);
    } catch (e: any) {
      toast.error('Failed to send message');
    }
  };

  const handleMediaMessage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !profile || !selectedChatUser) return;

    try {
      setIsUploadingMedia(true);
      toast.info('Uploading media...');
      const type = file.type.startsWith('image/') ? 'image' : 'file';
      const url = await uploadMedia(file, `messages/${user.uid}/${Date.now()}_${file.name}`);
      
      await sendMessage({
        mediaURL: url,
        text: `Sent a ${type}`,
        senderId: user.uid,
        receiverId: selectedChatUser,
        type: type as any
      }, profile.displayName);
      
      toast.success('Media sent!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to upload media');
    } finally {
      setIsUploadingMedia(false);
      if (mediaFileInputRef.current) mediaFileInputRef.current.value = '';
    }
  };

  const handleSearch = async (val: string) => {
    let term = val.trim();
    
    // Auto-detect if user is pasting a post link
    if (term.includes('post=')) {
      term = term.split('post=')[1].split('&')[0];
      setExploreTab('posts');
    }

    setSearchQuery(val);
    
    if (term.length > 2) {
      if (exploreTab === 'users' && !val.includes('post=')) {
        const results = await searchProfiles(term);
        setSearchResults(results);
      } else {
        const results = await searchPosts(term);
        setSearchPostResults(results);
      }
    } else {
      setSearchResults([]);
      setSearchPostResults([]);
    }
  };

  const handleDeletePost = async (postId: string) => {
    // Replaced window.confirm with toast-based action for better iframe compatibility
    toast('Are you sure you want to remove this post?', {
      action: {
        label: 'Remove',
        onClick: async () => {
          try {
            await deletePost(postId);
            toast.info('Post removed by admin.');
          } catch (e) {
            toast.error('Moderation failed.');
          }
        },
      },
    });
  };

  const handleToggleBoostPost = async (postId: string, currentStatus: boolean) => {
    try {
      await toggleBoostPost(postId, currentStatus);
      toast.success(currentStatus ? 'SEO Campaign stopped' : 'SEO Campaign launched! This post is now boosted.');
    } catch (e: any) {
      toast.error(`Boost failed: ${e.message}`);
    }
  };

  const handleProfileFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Profile picture must be under 5MB");
      return;
    }

    try {
      setIsUploadingProfile(true);
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = async () => {
          const canvas = document.createElement('canvas');
          const SIZE = 400;
          canvas.width = SIZE;
          canvas.height = SIZE;
          const ctx = canvas.getContext('2d');
          
          // Center crop
          const minDim = Math.min(img.width, img.height);
          const startX = (img.width - minDim) / 2;
          const startY = (img.height - minDim) / 2;
          
          ctx?.drawImage(img, startX, startY, minDim, minDim, 0, 0, SIZE, SIZE);
          const base64 = canvas.toDataURL('image/jpeg', 0.8);
          setEditPhoto(base64);
          setIsUploadingProfile(false);
          toast.success("Profile photo uploaded! (Click Save to apply)");
        };
      };
    } catch (err) {
      console.error(err);
      toast.error("Upload failed");
      setIsUploadingProfile(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!user || !profile) {
      toast.error("Profile not loaded. Please wait.");
      return;
    }
    try {
      const updatedData: Partial<UserProfile> = {
        displayName: editName,
        bio: editBio,
        photoURL: editPhoto,
        address: editAddress,
        location: editLocation,
        email: editEmail,
        privacyEmail: privacyEmail
      };
      await updateProfile(user.uid, updatedData);
      setProfile({ ...profile, ...updatedData });
      toast.success('Profile updated successfully!');
    } catch (e: any) {
      console.error('Update Profile Error:', e);
      toast.error(`Failed to update profile: ${e.message || 'Unknown error'}`);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-50 font-sans text-zinc-900 leading-tight tracking-tight">
        <motion.div 
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="text-2xl font-bold"
        >
          NexiSphere
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-zinc-900 text-white font-sans overflow-hidden">
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="h-full w-full bg-[radial-gradient(circle_at_50%_50%,#3b82f6,transparent)]" />
        </div>
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="z-10 text-center space-y-10 px-6 max-w-lg"
        >
          <div className="space-y-4">
            <motion.div
              initial={{ rotate: -10 }}
              animate={{ rotate: 0 }}
              className="inline-block bg-blue-600 text-white px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest mb-4"
            >
              The Next Evolution
            </motion.div>
            <h1 className="text-7xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-zinc-500">
              NexiSphere
            </h1>
            <p className="text-zinc-400 text-xl font-medium tracking-tight">
              Connect, share, and express yourself in a seamless social sphere.
            </p>
          </div>
          
          <div className="space-y-4 pt-6">
            <Button 
              onClick={handleLogin} 
              size="lg" 
              className="w-full rounded-2xl h-16 text-lg font-black bg-white text-black hover:bg-zinc-200 shadow-2xl shadow-white/10 transition-all flex items-center justify-center gap-3 cursor-pointer"
            >
              <Sparkles className="h-5 w-5 text-blue-600" />
              Sign in with Google
            </Button>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em]">
              Instant Registration • Secure • No Password Required
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  const unreadCount = notifications.filter(n => !n.isRead).length;
  const handleDeleteAccount = async () => {
    if (!user) return;
    
    toast('DANGER: This will permanently delete your profile and activity. Are you sure?', {
      action: {
        label: 'DELETE FOREVER',
        onClick: async () => {
          try {
            // 1. Delete Firestore User Document
            await deleteDoc(doc(db, 'users', user.uid));
            
            // 2. Sign Out (Auth deletion is complex on client side, so we "pseudo-delete" the profile)
            await signOut(auth);
            toast.success('Account metadata has been wiped.');
          } catch (e: any) {
            console.error('Account Deletion Error:', e);
            toast.error(`Deletion failed: ${e.message}`);
          }
        },
      },
      duration: 10000,
    });
  };

  const isUserAdmin = user?.email?.toLowerCase() === 'ahfahimsylhet@gmail.com';

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans text-bento-text-main dark:text-zinc-100 leading-tight tracking-tight transition-colors duration-500 overflow-x-hidden">
      <Toaster position="top-center" richColors />
      
      {/* Background Animated Blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            x: [0, 100, 0],
            y: [0, 50, 0]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-blue-500/10 blur-[120px] rounded-full" 
        />
        <motion.div 
          animate={{ 
            scale: [1, 1.3, 1],
            x: [0, -150, 0],
            y: [0, -80, 0]
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-[10%] -right-[10%] w-[45%] h-[45%] bg-indigo-500/10 blur-[130px] rounded-full" 
        />
      </div>

      <div className="relative z-10 max-w-[1440px] mx-auto min-h-screen flex">
        {user && (
          <>
            <aside className="fixed left-0 top-0 h-full w-20 md:w-64 border-r border-zinc-200/50 dark:border-zinc-800/50 bg-white/40 dark:bg-black/40 backdrop-blur-3xl z-40 p-5 hidden sm:flex flex-col">
            <div className="mb-10 flex items-center gap-4 px-3 group cursor-pointer" onClick={() => navigateTo('home')}>
              <div className="h-11 w-11 bg-bento-accent rounded-[14px] flex items-center justify-center shadow-2xl shadow-blue-500/40 group-hover:rotate-12 transition-all duration-500">
                <Sparkles className="text-white h-6 w-6" />
              </div>
              <span className="font-black text-2xl hidden md:block dark:text-white tracking-tighter uppercase group-hover:text-bento-accent transition-colors">NexiSphere</span>
            </div>
        
          <nav className="flex-1 space-y-1">
            <SidebarItem icon={<Home />} label="Dashboard" active={activeTab === 'home'} onClick={() => navigateTo('home')} />
            <SidebarItem icon={<Search />} label="Explore" active={activeTab === 'explore'} onClick={() => navigateTo('explore')} />
            <SidebarItem icon={<Bell />} label="Alerts" active={activeTab === 'notifs'} onClick={() => navigateTo('notifs')} badge={unreadCount > 0 ? unreadCount : undefined} />
            <SidebarItem icon={<MessageSquare />} label="Messages" active={activeTab === 'messages'} onClick={() => navigateTo('messages')} />
            <SidebarItem icon={<UserIcon />} label="Profile" active={activeTab === 'profile'} onClick={() => navigateTo('profile')} />
            {isUserAdmin && (
              <SidebarItem icon={<ShieldCheck className="text-amber-500" />} label="Admin" active={activeTab === 'admin'} onClick={() => navigateTo('admin')} />
            )}
            <SidebarItem icon={<Settings />} label="Settings" active={activeTab === 'settings'} onClick={() => navigateTo('settings')} />
          </nav>

        <div className="pt-6 border-t border-zinc-200/50 dark:border-zinc-800/50">
          <DropdownMenu>
            <DropdownMenuTrigger className="w-full flex items-center gap-3 justify-start p-3 rounded-[20px] hover:bg-white dark:hover:bg-zinc-800 transition-all duration-300 cursor-pointer outline-none hover:shadow-sm">
              <Avatar className="h-10 w-10 border-2 border-white dark:border-zinc-800 shadow-md">
                <AvatarImage src={profile?.photoURL} />
                <AvatarFallback className="font-bold">{profile?.displayName?.[0]}</AvatarFallback>
              </Avatar>
              <div className="text-left hidden md:block overflow-hidden">
                <p className="text-sm font-black truncate text-bento-text-main dark:text-white uppercase tracking-tighter">{profile?.displayName}</p>
                <div className="flex items-center gap-1">
                  <p className="text-[10px] text-zinc-400 font-bold truncate">@{profile?.username}</p>
                </div>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-2xl shadow-2xl border-bento-border p-2 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl">
              <DropdownMenuItem onClick={handleLogout} className="text-red-500 font-bold uppercase tracking-widest text-[10px] focus:text-red-600 cursor-pointer p-3 rounded-xl">
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main Content */}
      <main className="sm:ml-20 md:ml-64 min-h-screen pb-20 sm:pb-0">
        <div className="mx-auto px-4 py-8 max-w-[1200px]">
          {tabHistory.length > 1 && (
            <Button variant="ghost" onClick={handleBack} className="mb-6 rounded-xl hover:bg-zinc-100 group">
              <ArrowLeft className="h-4 w-4 mr-2 transition-transform group-hover:-translate-x-1" />
              <span className="font-bold text-xs uppercase tracking-wider">Back</span>
            </Button>
          )}
          
          <AnimatePresence mode="wait">
            {activeTab === 'home' && (
              <motion.div 
                key="home"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-1 lg:grid-cols-[240px_1fr_300px] gap-4"
              >
                {/* Column 1: Profile & Settings (Desktop) */}
                <div className="space-y-4 hidden lg:block">
                  <section className="bg-white dark:bg-bento-card border border-bento-border rounded-[24px] p-6 text-center shadow-sm">
                    <div className="relative mb-4 flex justify-center">
                      <Avatar className="h-20 w-20 border-3 border-bento-accent">
                        <AvatarImage src={profile?.photoURL} />
                        <AvatarFallback className="text-xl dark:text-white">{profile?.displayName?.[0]}</AvatarFallback>
                      </Avatar>
                    </div>
                    <h2 className="font-bold text-lg dark:text-white">{profile?.displayName}</h2>
                    <p className="text-xs text-bento-text-sub mb-4">@{profile?.username}</p>
                    <div className="grid grid-cols-2 border-t border-bento-border pt-4 mt-2">
                       <div>
                          <p className="font-bold text-lg dark:text-white">{profile?.followersCount || 0}</p>
                          <p className="text-[10px] uppercase font-bold text-bento-text-sub">Followers</p>
                       </div>
                       <div>
                          <p className="font-bold text-lg dark:text-white">{profile?.followingCount || 0}</p>
                          <p className="text-[10px] uppercase font-bold text-bento-text-sub">Following</p>
                       </div>
                    </div>
                    <Button variant="default" className="w-full mt-4 rounded-xl bg-bento-accent hover:bg-blue-600" onClick={() => setActiveTab('profile')}>View Profile</Button>
                    <Button 
                      variant="outline" 
                      className="w-full mt-2 rounded-xl border-bento-accent text-bento-accent hover:bg-blue-50 flex items-center justify-center gap-2" 
                      onClick={() => setIsChatbotOpen(true)}
                    >
                      <Sparkles className="h-4 w-4" />
                      Chat with AI
                    </Button>
                  </section>

                  <section className="bg-white dark:bg-bento-card border border-bento-border rounded-[24px] p-6 shadow-sm">
                    <h3 className="text-[11px] font-bold uppercase tracking-widest text-bento-text-sub mb-4">Settings</h3>
                    <div className="space-y-3">
                       <div className="flex justify-between items-center text-sm">
                          <span className="dark:text-zinc-400 font-medium">Dark Mode</span>
                          <button 
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                            className={`h-6 w-11 rounded-full relative transition-colors duration-200 focus:outline-none ${theme === 'dark' ? 'bg-bento-accent' : 'bg-zinc-200'}`}
                          >
                            <div className={`absolute top-1 h-4 w-4 bg-white rounded-full transition-all duration-200 ${theme === 'dark' ? 'left-6' : 'left-1'}`} />
                          </button>
                       </div>
                       <div className="flex justify-between items-center text-sm">
                          <span className="dark:text-zinc-400 font-medium">Privacy</span>
                          <div className="h-5 w-10 bg-zinc-400 dark:bg-zinc-700 rounded-full relative"><div className="absolute right-0.5 top-0.5 h-4 w-4 bg-white rounded-full transition-all" /></div>
                       </div>
                       <div className="flex justify-between items-center text-sm">
                          <span className="dark:text-zinc-400 font-medium">Notifications</span>
                          <div className="h-5 w-10 bg-zinc-400 dark:bg-zinc-700 rounded-full relative"><div className="absolute right-0.5 top-0.5 h-4 w-4 bg-white rounded-full transition-all" /></div>
                       </div>
                       <Button variant="ghost" className="w-full justify-start text-red-600 px-0 mt-2 hover:bg-transparent" onClick={handleLogout}>Log Out</Button>
                    </div>
                  </section>
                </div>

                {/* Column 2: Feed & Action */}
                <div className="space-y-4">
                  {user?.email === 'ahfahimsylhet@gmail.com' && (
                    <Button 
                      onClick={addSamplePosts} 
                      className="w-full rounded-2xl bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-200 font-bold py-3 transition-all shadow-sm"
                    >
                      <Zap className="h-4 w-4 mr-2" />
                      Admin: Refresh & Fix Video Samples
                    </Button>
                  )}
                  <div className="lg:hidden block mb-4">
                    <h2 className="text-2xl font-bold">Main Feed</h2>
                  </div>

                  <Card className="rounded-[24px] border-bento-border shadow-sm overflow-hidden p-6 bg-white dark:bg-bento-card">
                    <div className="flex gap-4">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={profile?.photoURL} />
                        <AvatarFallback>{profile?.displayName?.[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 space-y-3">
                        <textarea
                          placeholder="What's on your mind?"
                          className="w-full bg-bento-bg dark:bg-zinc-800 border-none focus:ring-0 rounded-xl p-3 min-h-[60px] text-sm resize-none dark:text-white"
                          value={newPostContent}
                          onChange={(e) => setNewPostContent(e.target.value)}
                        />
                        
                        {/* Hidden File Input */}
                        <input 
                          type="file" 
                          ref={fileInputRef} 
                          className="hidden" 
                          accept="image/*,video/*"
                          onChange={handleFileChange}
                        />

                        {/* Upload Progress Bar */}
                        {isUploading && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] font-bold text-bento-text-sub uppercase tracking-widest">
                              <span>Uploading...</span>
                              <span>{uploadProgress}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                              <motion.div 
                                className="h-full bg-bento-accent"
                                initial={{ width: 0 }}
                                animate={{ width: `${uploadProgress}%` }}
                                transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                              />
                            </div>
                          </div>
                        )}

                        {showMediaInput && newPostMediaURL && (
                          <div className="relative rounded-xl overflow-hidden border border-bento-border bg-bento-bg group flex items-center justify-center bg-black min-h-[100px]">
                            {newPostMediaType === 'video' ? (
                                <video 
                                  key={newPostMediaURL}
                                  controls 
                                  playsInline 
                                  preload="auto"
                                  className="w-full aspect-video block bg-black" 
                                >
                                  <source src={newPostMediaURL} type="video/mp4" />
                                </video>
                            ) : (
                                <img 
                                  src={newPostMediaURL} 
                                  alt="Upload preview" 
                                  className="w-full h-auto max-h-[300px] object-cover"
                                  referrerPolicy="no-referrer"
                                />
                            )}
                            <Button 
                              variant="destructive" 
                              size="icon" 
                              onClick={() => {
                                setNewPostMediaURL('');
                                setNewPostMediaType('');
                                setShowMediaInput(false);
                              }} 
                              className="absolute top-2 right-2 h-8 w-8 rounded-full shadow-lg"
                            >
                              <Plus className="h-4 w-4 rotate-45" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between items-center mt-4">
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="ghost" 
                          className={`rounded-xl gap-2 font-bold text-xs uppercase tracking-wider ${showMediaInput ? 'text-bento-accent' : 'text-bento-text-sub'}`}
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploading}
                        >
                          <ImageIcon className="h-4 w-4" />
                          {isUploading ? 'Uploading...' : 'Media'}
                        </Button>
                      </div>
                      <Button onClick={handleCreatePost} disabled={!newPostContent.trim() && !newPostMediaURL} className="rounded-xl px-8 font-bold bg-bento-accent hover:bg-blue-600">Post</Button>
                    </div>
                  </Card>

                  <div className="space-y-6">
                    {posts.map((post) => {
                      const postProps: PostCardProps = { 
                        post, 
                        userId: user.uid, 
                        userProfile: profile,
                        isAdmin: isUserAdmin,
                        onVisitProfile: (uid) => navigateTo('visit-profile', uid),
                        onChat: () => {
                          setSelectedChatUser(post.authorId);
                          setActiveTab('messages');
                        } 
                      };
                      return <PostCard key={post.id} {...postProps} />;
                    })}

                    {posts.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-20 px-6 text-center space-y-4 bg-white dark:bg-bento-card border border-bento-border rounded-[24px]">
                        <div className="h-16 w-16 bg-zinc-50 dark:bg-zinc-800 rounded-3xl flex items-center justify-center text-bento-accent">
                          <Compass className="h-8 w-8" />
                        </div>
                        <div className="space-y-1">
                          <h3 className="text-xl font-bold dark:text-white">Feed is Quiet</h3>
                          <p className="text-sm text-bento-text-sub max-w-xs">Be the first to share your thoughts or generate some sample content to see how it looks!</p>
                        </div>
                        <Button 
                          onClick={addSamplePosts} 
                          variant="outline" 
                          className="rounded-xl font-bold bg-bento-bg hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 border-none px-8"
                        >
                          <Zap className="h-4 w-4 mr-2 text-amber-500" />
                          Seed My Timeline
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Actions sub-grid (Desktop) */}
                  <div className="hidden lg:grid grid-cols-2 gap-4 pt-4">
                     <div className="bg-bento-accent text-white rounded-[24px] p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-blue-600 transition-colors" onClick={() => (document.querySelector('textarea') as any)?.focus()}>
                        <Plus className="h-8 w-8 mb-1" />
                        <span className="font-bold">New Post</span>
                     </div>
                     <div className="bg-white border border-bento-border rounded-[24px] p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-50 transition-colors" onClick={() => setActiveTab('explore')}>
                        <Search className="h-8 w-8 mb-1 text-bento-accent" />
                        <span className="font-bold">Discover</span>
                        <p className="text-[10px] text-bento-text-sub">Trends for you</p>
                     </div>
                  </div>
                </div>

                {/* Column 3: Messages & Notifications (Desktop) */}
                <div className="space-y-4 hidden lg:block">
                  <section className="bg-white border border-bento-border rounded-[24px] p-6 shadow-sm overflow-hidden flex flex-col h-[380px]">
                    <div className="flex justify-between items-center mb-4">
                       <h3 className="text-[11px] font-bold uppercase tracking-widest text-bento-text-sub">Messages</h3>
                       <span className="text-bento-accent text-[11px] font-bold cursor-pointer" onClick={() => setActiveTab('messages')}>See All</span>
                    </div>
                    <ScrollArea className="flex-1">
                       <div className="space-y-4 pr-3">
                          {conversations.slice(0, 4).map(conv => (
                            <ConversationItem 
                              key={conv.id} 
                              conv={conv} 
                              userId={user?.uid || ''} 
                              selectedChatUser={selectedChatUser} 
                              onSelect={(uid) => {
                                setSelectedChatUser(uid);
                                setActiveTab('messages');
                              }} 
                            />
                          ))}
                          {conversations.length === 0 && (
                            <p className="text-xs text-bento-text-sub text-center py-4">Recent conversations will appear here.</p>
                          )}
                       </div>
                    </ScrollArea>
                  </section>

                  <section className="bg-white border border-bento-border rounded-[24px] p-6 shadow-sm overflow-hidden flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                       <h3 className="text-[11px] font-bold uppercase tracking-widest text-bento-text-sub">Notifications</h3>
                       <Badge variant="secondary" className="bg-bento-bg text-bento-accent border-none">{unreadCount} New</Badge>
                    </div>
                    <div className="space-y-3">
                       {notifications.slice(0, 3).map((n) => {
                          const notifProps: NotificationItemProps = { notification: n, onRead: () => markNotificationAsRead(n.id) };
                          return <NotificationItem key={n.id} {...notifProps} />;
                       })}
                       {notifications.length === 0 && <p className="text-xs text-bento-text-sub py-4 text-center">No new alerts.</p>}
                       <Button variant="ghost" className="w-full text-xs text-bento-accent hover:bg-transparent" onClick={() => setActiveTab('notifs')}>View All Alerts</Button>
                    </div>
                  </section>
                </div>
              </motion.div>
            )}

            {activeTab === 'explore' && (
              <motion.div 
                key="explore"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                <div className="flex items-center gap-2 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-2xl w-fit">
                  <Button 
                    variant={exploreTab === 'users' ? 'default' : 'ghost'} 
                    size="sm" 
                    onClick={() => {
                      setExploreTab('users');
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                    className={`rounded-xl px-6 font-bold uppercase tracking-widest text-[10px] ${exploreTab === 'users' ? 'bg-bento-accent hover:bg-blue-600' : 'text-zinc-500'}`}
                  >
                    People
                  </Button>
                  <Button 
                    variant={exploreTab === 'posts' ? 'default' : 'ghost'} 
                    size="sm" 
                    onClick={() => {
                      setExploreTab('posts');
                      setSearchQuery('');
                      setSearchPostResults([]);
                    }}
                    className={`rounded-xl px-6 font-bold uppercase tracking-widest text-[10px] ${exploreTab === 'posts' ? 'bg-bento-accent hover:bg-blue-600' : 'text-zinc-500'}`}
                  >
                    Posts
                  </Button>
                </div>

                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 h-5 w-5" />
                  <Input 
                    placeholder={exploreTab === 'users' ? "Search people by name or username..." : "Search posts or paste post link/ID..."}
                    className="pl-12 py-6 rounded-2xl bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 dark:text-white"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                  />
                </div>

                {exploreTab === 'users' && searchResults.length > 0 && (
                  <div className="grid grid-cols-1 gap-3">
                    {searchResults.map(result => (
                      <Card 
                        key={result.uid} 
                        className="rounded-2xl border-bento-border p-4 flex items-center justify-between cursor-pointer hover:bg-zinc-50 transition-colors bg-white dark:bg-bento-card shadow-sm"
                        onClick={() => navigateTo('visit-profile', result.uid)}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 border border-zinc-100 dark:border-zinc-800">
                            <AvatarImage src={result.photoURL} />
                            <AvatarFallback className="font-bold dark:text-white">{result.displayName[0]}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-bold text-sm text-bento-text-main dark:text-white">{result.displayName}</p>
                            <p className="text-[10px] uppercase font-bold text-bento-text-sub">@{result.username}</p>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" className="rounded-xl text-bento-accent hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-zinc-800">View Profile</Button>
                      </Card>
                    ))}
                  </div>
                )}

                {exploreTab === 'posts' && searchPostResults.length > 0 && (
                  <div className="space-y-4">
                    {searchPostResults.map(post => (
                      <PostCard 
                        key={post.id} 
                        post={post} 
                        userId={user.uid} 
                        userProfile={profile} 
                        isAdmin={isUserAdmin}
                        onVisitProfile={(uid) => navigateTo('visit-profile', uid)}
                        onChat={() => {
                          setSelectedChatUser(post.authorId);
                          setActiveTab('messages');
                        }}
                      />
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <Card className="rounded-[24px] border-bento-border p-6 cursor-pointer hover:bg-zinc-50 transition-colors bg-white">
                      <p className="text-[10px] font-bold text-bento-text-sub uppercase tracking-widest mb-1">Trending</p>
                      <p className="font-bold text-xl text-bento-text-main">#NexiSphere</p>
                      <p className="text-xs text-bento-text-sub">1.2k posts</p>
                   </Card>
                   <Card className="rounded-[24px] border-bento-border p-6 cursor-pointer hover:bg-zinc-50 transition-colors bg-white">
                      <p className="text-[10px] font-bold text-bento-text-sub uppercase tracking-widest mb-1">Trending</p>
                      <p className="font-bold text-xl text-bento-text-main">#Web3</p>
                      <p className="text-xs text-bento-text-sub">856 posts</p>
                   </Card>
                </div>
              </motion.div>
            )}

            {activeTab === 'notifs' && (
              <motion.div 
                key="notifs"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-center">
                  <h2 className="text-3xl font-bold text-bento-text-main">Notifications</h2>
                  <Button variant="ghost" className="text-xs text-bento-accent">Mark all read</Button>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {notifications.map((n) => {
                    const notifProps: NotificationItemProps = { notification: n, onRead: () => markNotificationAsRead(n.id) };
                    return <NotificationItem key={n.id} {...notifProps} />;
                  })}
                  {notifications.length === 0 && (
                    <div className="bg-white border border-bento-border rounded-[24px] p-12 text-center text-bento-text-sub font-medium">
                      All caught up!
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'messages' && (
              <motion.div 
                key="messages"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-[calc(100vh-140px)] flex bg-white dark:bg-bento-card border border-bento-border rounded-[24px] overflow-hidden shadow-sm"
              >
                {/* Conversations Sidebar */}
                <div className={`w-full md:w-80 border-r border-bento-bg dark:border-zinc-800 flex flex-col ${selectedChatUser ? 'hidden md:flex' : 'flex'}`}>
                  <div className="p-6 border-b border-bento-bg dark:border-zinc-800 flex items-center justify-between">
                    <h2 className="text-xl font-bold dark:text-white">Messages</h2>
                    <Button
                      variant="ghost" 
                      size="icon" 
                      className="rounded-xl h-10 w-10 bg-blue-50 dark:bg-blue-900/20 text-bento-accent"
                      onClick={() => setIsChatbotOpen(true)}
                    >
                      <Sparkles className="h-4 w-4" />
                    </Button>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="p-2 space-y-1">
                      {user && conversations.map(conv => (
                        <ConversationItem 
                          key={conv.id} 
                          conv={conv} 
                          userId={user.uid} 
                          selectedChatUser={selectedChatUser} 
                          onSelect={setSelectedChatUser} 
                        />
                      ))}
                      {conversations.length === 0 && (
                        <div className="p-8 text-center text-zinc-400 text-xs font-bold uppercase tracking-widest leading-loose">
                          No active chats.<br/>Visit a profile to start messaging!
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>

                {/* Chat Window */}
                <div className={`flex-1 flex flex-col bg-zinc-50/10 ${!selectedChatUser ? 'hidden md:flex' : 'flex'}`}>
                  {!selectedChatUser ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 p-8">
                       <div className="h-20 w-20 bg-blue-50 dark:bg-zinc-800 rounded-3xl flex items-center justify-center rotate-3">
                          <MessageSquare className="h-10 w-10 text-bento-accent" />
                       </div>
                       <div className="space-y-2">
                          <h3 className="text-2xl font-black tracking-tight dark:text-white">Your Social Inbox</h3>
                          <p className="text-zinc-500 max-w-xs mx-auto text-sm">Select a conversation from the left or browse profiles to start a new thread.</p>
                          <Button 
                            onClick={addSamplePosts} 
                            variant="outline" 
                            className="mt-6 rounded-xl font-bold bg-white/50 backdrop-blur"
                          >
                            <Plus className="h-4 w-4 mr-2" /> Add My First Posts
                          </Button>
                       </div>
                    </div>
                  ) : (
                    <>
                      {/* Chat Header */}
                      <div className="p-4 border-b border-bento-bg dark:border-zinc-800 bg-white dark:bg-bento-card flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSelectedChatUser(null)}>
                            <ArrowLeft className="h-5 w-5" />
                          </Button>
                          <Avatar className="h-10 w-10 border border-bento-border">
                            <AvatarImage src={selectedChatUserProfile?.photoURL} />
                            <AvatarFallback className="font-bold">{selectedChatUserProfile?.displayName?.[0] || 'U'}</AvatarFallback>
                          </Avatar>
                          <div>
                             <h4 className="font-bold text-sm dark:text-white">{selectedChatUserProfile?.displayName || 'Loading...'}</h4>
                             <p className="text-[9px] text-green-500 font-bold uppercase tracking-widest">Active Now</p>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="rounded-xl"><MoreHorizontal className="h-5 w-5 text-zinc-400" /></Button>
                      </div>

                      {/* Message Request Banner */}
                      {conversations.find(c => c.id.includes(selectedChatUser))?.status === 'pending' && 
                       conversations.find(c => c.id.includes(selectedChatUser))?.participants[0] !== user.uid && (
                        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-900/30 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Sparkles className="h-5 w-5 text-bento-accent" />
                            <p className="text-xs font-bold text-blue-900 dark:text-blue-100">This is a message request. Want to chat?</p>
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="h-8 rounded-lg text-[10px] font-bold uppercase text-red-600 hover:bg-red-50"
                              onClick={() => {
                                const conv = conversations.find(c => c.id.includes(selectedChatUser));
                                if (conv) updateConversationStatus(conv.id, 'declined');
                              }}
                            >
                              Decline
                            </Button>
                            <Button 
                              size="sm" 
                              className="h-8 rounded-lg text-[10px] font-bold uppercase bg-bento-accent text-white"
                              onClick={() => {
                                const conv = conversations.find(c => c.id.includes(selectedChatUser));
                                if (conv) updateConversationStatus(conv.id, 'accepted');
                              }}
                            >
                              Accept
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Chat Messages */}
                      <ScrollArea className="flex-1 p-6">
                        <div className="space-y-6">
                          {chatMessages.map((m, idx) => {
                            const isMe = m.senderId === user.uid;
                            const showDate = idx === 0 || (m.createdAt && chatMessages[idx-1].createdAt && 
                              m.createdAt.toDate().getTime() - chatMessages[idx-1].createdAt.toDate().getTime() > 1000 * 60 * 30);
                            
                            return (
                              <div key={m.id} className="space-y-2">
                                {showDate && m.createdAt && (
                                  <div className="flex justify-center my-4">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-3 py-1 rounded-full">{formatDistanceToNow(m.createdAt.toDate(), { addSuffix: true })}</span>
                                  </div>
                                )}
                                <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                  <div className={`group relative max-w-[80%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                    <div className={`px-4 py-3 rounded-2xl text-sm font-medium shadow-sm transition-all hover:shadow-md ${
                                      isMe 
                                        ? 'bg-bento-accent text-white rounded-tr-none' 
                                        : 'bg-white dark:bg-zinc-800 border border-bento-border dark:border-zinc-700 text-bento-text-main dark:text-white rounded-tl-none'
                                    }`}>
                                      {m.type === 'text' && <p className="leading-relaxed">{m.text}</p>}
                                      {m.type === 'image' && m.mediaURL && (
                                        <div className="rounded-xl overflow-hidden cursor-pointer">
                                          <img src={m.mediaURL} alt="Message attachment" className="max-w-full h-auto max-h-64 object-cover" />
                                        </div>
                                      )}
                                      {m.type === 'voice' && m.mediaURL && (
                                        <div className="flex items-center gap-3">
                                          <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center">
                                            <Mic className="h-4 w-4" />
                                          </div>
                                          <audio controls src={m.mediaURL} className="h-8 w-48" />
                                        </div>
                                      )}
                                      {m.type === 'file' && m.mediaURL && (
                                        <a href={m.mediaURL} target="_blank" rel="noreferrer" className="flex items-center gap-2 underline">
                                          <Paperclip className="h-4 w-4" /> File Attached
                                        </a>
                                      )}
                                    </div>
                                    {isMe && (
                                      <div className="flex items-center gap-1 mt-1 px-1">
                                        {m.isRead ? (
                                          <CheckCheck className="h-3 w-3 text-blue-500" />
                                        ) : (
                                          <Check className="h-3 w-3 text-zinc-400" />
                                        )}
                                        <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-tighter">
                                          {m.createdAt ? format(m.createdAt.toDate(), 'HH:mm') : '...'}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>

                      {/* Chat Input */}
                      <div className="p-6 bg-white dark:bg-bento-card border-t border-bento-bg dark:border-zinc-800 space-y-4">
                        <div className="flex items-center gap-3">
                          <input 
                            type="file" 
                            ref={mediaFileInputRef} 
                            className="hidden" 
                            onChange={handleMediaMessage}
                            accept="image/*,audio/*,application/pdf"
                          />
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="rounded-xl h-12 w-12 hover:bg-zinc-100 bg-zinc-50 dark:bg-zinc-900 text-zinc-500 transition-all active:scale-95 disabled:opacity-50"
                            onClick={() => mediaFileInputRef.current?.click()}
                            disabled={isUploadingMedia}
                          >
                            <Paperclip className="h-5 w-5" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className={`rounded-xl h-12 w-12 transition-all active:scale-95 ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-zinc-50 dark:bg-zinc-900 text-zinc-500'}`}
                            onMouseDown={() => { setIsRecording(true); toast.info("Hold to record (simulated)"); }}
                            onMouseUp={() => setIsRecording(false)}
                          >
                            <Mic className="h-5 w-5" />
                          </Button>
                          <div className="flex-1 relative flex items-center">
                             <Input 
                               placeholder="Type your message..." 
                               className="rounded-2xl h-12 bg-bento-bg dark:bg-zinc-900 border-none pr-12 text-sm font-medium dark:text-white"
                               value={newMessage}
                               onChange={(e) => setNewMessage(e.target.value)}
                               onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                             />
                             <Button 
                               onClick={handleSendMessage} 
                               size="icon" 
                               className="absolute right-1.5 h-9 w-9 rounded-xl bg-bento-accent hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20 active:scale-90 transition-all"
                             >
                               <Send className="h-4 w-4" />
                             </Button>
                          </div>
                        </div>
                        {isUploadingMedia && (
                          <div className="h-1 bg-zinc-100 rounded-full overflow-hidden">
                            <motion.div 
                              className="h-full bg-bento-accent" 
                              initial={{ width: 0 }}
                              animate={{ width: "100%" }}
                              transition={{ duration: 2, repeat: Infinity }}
                            />
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'admin' && isUserAdmin && (
              <motion.div 
                key="admin"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-center bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 p-6 rounded-[24px]">
                  <div>
                    <h2 className="text-3xl font-bold text-amber-900 dark:text-amber-200 border-none">Admin Control Center</h2>
                    <p className="text-amber-700 dark:text-amber-400 font-medium">Moderating {posts.length} active posts</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button 
                      onClick={addSamplePosts} 
                      className="bg-amber-100 hover:bg-amber-200 text-amber-900 border-none rounded-xl font-bold h-12 px-6 flex items-center gap-2"
                    >
                      <Plus className="h-4 w-4" /> Seed Community Content
                    </Button>
                    <ShieldCheck className="h-12 w-12 text-amber-500" />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  <div className="bg-white dark:bg-bento-card border border-bento-border dark:border-zinc-800 rounded-[24px] overflow-hidden">
                    <div className="p-6 border-b border-bento-bg dark:border-zinc-800 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                      <h3 className="font-bold flex items-center gap-2 dark:text-white">
                        <History className="h-4 w-4" /> Global Feed Moderation
                      </h3>
                      <div className="flex items-center gap-2">
                        <div className="relative w-full sm:w-64">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                          <Input 
                            placeholder="Search by content or author..."
                            className="pl-9 h-9 rounded-xl bg-bento-bg dark:bg-zinc-900 border-none w-full text-xs"
                            value={adminSearchQuery}
                            onChange={(e) => setAdminSearchQuery(e.target.value)}
                          />
                        </div>
                        <Badge variant="outline" className="hidden sm:flex text-amber-600 border-amber-200 dark:border-amber-900/50 dark:text-amber-400">Restricted Content Only</Badge>
                      </div>
                    </div>
                    <ScrollArea className="h-[600px] p-6">
                      <div className="space-y-6">
                        {posts.filter(post => {
                          if (!adminSearchQuery.trim()) return true;
                          const query = adminSearchQuery.toLowerCase();
                          return post.authorName.toLowerCase().includes(query) || post.content.toLowerCase().includes(query);
                        }).map(post => (
                          <div key={post.id} className="flex gap-4 p-4 rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-800/50 border border-transparent hover:border-zinc-100 dark:hover:border-zinc-700 transition-all">
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={post.authorPhotoURL} />
                              <AvatarFallback className="dark:text-white">{post.authorName[0]}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 space-y-2">
                              <div className="flex justify-between items-center">
                                <div>
                                  <p className="font-bold text-sm dark:text-white">{post.authorName}</p>
                                  <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                                    {post.createdAt ? formatDistanceToNow(post.createdAt.toDate(), { addSuffix: true }) : 'N/A'}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className={`rounded-xl h-8 text-[10px] font-bold uppercase tracking-widest gap-2 ${post.isBoosted ? 'bg-amber-100 text-amber-600 border-amber-200 hover:bg-amber-200' : 'hover:bg-amber-50'}`}
                                    onClick={() => handleToggleBoostPost(post.id, !!post.isBoosted)}
                                  >
                                    <Zap className={`h-3 w-3 ${post.isBoosted ? 'fill-amber-500 text-amber-500' : ''}`} /> 
                                    {post.isBoosted ? 'Cancel SEO' : 'SEO Boost'}
                                  </Button>
                                  <Button 
                                    variant="destructive" 
                                    size="sm" 
                                    className="rounded-xl h-8 text-[10px] font-bold uppercase tracking-widest gap-2"
                                    onClick={() => handleDeletePost(post.id)}
                                  >
                                    <Plus className="h-3 w-3 rotate-45" /> Remove Post
                                  </Button>
                                </div>
                              </div>
                              <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-xl border border-zinc-100 dark:border-zinc-700 italic">
                                "{post.content}"
                              </p>
                              {post.mediaURL && (
                                <p className="text-[10px] text-blue-500 font-bold">Media: {post.mediaURL.slice(0, 40)}...</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'visit-profile' && viewedProfile && (
              <motion.div 
                key="visit-profile"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                <div className="flex items-center gap-4 mb-4">
                  <Button variant="ghost" onClick={handleBack} className="rounded-xl h-10 w-10 p-0">
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                  <h2 className="text-xl font-bold">Profile</h2>
                </div>

                <div className="relative h-32 bg-zinc-200 dark:bg-zinc-800 rounded-[24px] overflow-hidden mb-12">
                   <div className="absolute -bottom-10 left-6">
                      <Avatar className="h-24 w-24 border-4 border-white dark:border-zinc-900 shadow-lg">
                        <AvatarImage src={viewedProfile.photoURL} />
                        <AvatarFallback className="text-2xl">{viewedProfile.displayName?.[0]}</AvatarFallback>
                      </Avatar>
                   </div>
                </div>

                <div className="px-2 space-y-4">
                   <div className="flex justify-between items-start">
                      <div>
                        <h2 className="text-3xl font-bold text-bento-text-main dark:text-white flex items-center gap-2">
                          {viewedProfile.displayName}
                          {(viewedProfile.isAdmin || viewedProfile.email?.toLowerCase() === 'ahfahimsylhet@gmail.com') && (
                            <div className="flex items-center gap-1">
                               <Badge variant="default" className="bg-amber-500 hover:bg-amber-600 font-bold border-none text-white text-[10px]">ADMIN</Badge>
                               <Badge variant="outline" className="text-blue-500 border-blue-500 text-[8px] font-black tracking-tighter">VERIFIED</Badge>
                            </div>
                          )}
                        </h2>
                        <p className="text-bento-text-sub font-medium">@{viewedProfile.username}</p>
                      </div>
                      <div className="flex gap-2">
                         {user && user.uid !== viewedProfile.uid && (
                           <Button 
                            onClick={() => {
                              setSelectedChatUser(viewedProfile.uid);
                              setActiveTab('messages');
                            }}
                            className="rounded-xl bg-white border border-bento-border text-bento-text-main font-bold flex items-center gap-2 hover:bg-zinc-50"
                           >
                             <MessageSquare className="h-4 w-4" />
                             Message
                           </Button>
                         )}
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button variant="ghost" size="icon" className="rounded-xl border border-bento-border">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end" className="rounded-2xl shadow-xl w-48">
                            <DropdownMenuItem className="p-3 text-xs font-bold cursor-pointer" onClick={() => {
                              const url = `${window.location.origin}/profile/${viewedProfile.uid}`;
                              navigator.clipboard.writeText(url);
                              toast.success("Profile link copied!");
                            }}>
                              <Share2 className="mr-2 h-4 w-4" /> Share Profile
                            </DropdownMenuItem>
                            {user && user.uid !== viewedProfile.uid && (
                              <DropdownMenuItem className="p-3 text-xs font-bold cursor-pointer text-red-500 hover:text-red-600 focus:text-red-500" onClick={() => {
                                toast.success("User reported to admins.");
                              }}>
                                Report {viewedProfile.displayName}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {user && user.uid !== viewedProfile.uid && (
                          <FollowButton 
                            followerId={user.uid} 
                            followerName={profile?.displayName || ''}
                            followingId={viewedProfile.uid} 
                            followingName={viewedProfile.displayName}
                            onUpdate={() => getProfile(viewedProfile.uid).then(p => p && setViewedProfile(p))}
                          />
                        )}
                      </div>
                   </div>
                   <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed text-sm">{viewedProfile.bio || 'No bio yet.'}</p>
                   
                   <div className="flex flex-wrap gap-4 text-xs text-bento-text-sub font-medium">
                      {viewedProfile.location && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          <span>{viewedProfile.location}</span>
                        </div>
                      )}
                      {viewedProfile.privacyEmail && viewedProfile.email && (
                        <div className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          <span>{viewedProfile.email}</span>
                        </div>
                      )}
                   </div>

                   <div className="flex gap-2 items-center">
                      <button 
                        onClick={() => openFollowModal(viewedProfile.uid, 'Followers')}
                        className="hover:bg-zinc-100 dark:hover:bg-zinc-800 px-3 py-1.5 -ml-3 rounded-xl transition-all text-left text-sm cursor-pointer"
                      >
                        <span className="font-extrabold">{formatNumber(viewedProfile.followersCount || 0)}</span> <span className="text-bento-text-sub">Followers</span>
                      </button>
                      <button 
                        onClick={() => openFollowModal(viewedProfile.uid, 'Following')}
                        className="hover:bg-zinc-100 dark:hover:bg-zinc-800 px-3 py-1.5 rounded-xl transition-all text-left text-sm cursor-pointer"
                      >
                        <span className="font-extrabold">{formatNumber(viewedProfile.followingCount || 0)}</span> <span className="text-bento-text-sub">Following</span>
                      </button>
                   </div>
                </div>

                <Separator className="my-10" />
                
                <div className="grid grid-cols-1 gap-6">
                  <h3 className="font-extrabold text-2xl tracking-tighter">Posts</h3>
                  {posts.filter(p => p.authorId === viewedProfile.uid).map(post => {
                    const postProps: PostCardProps = { 
                      post, 
                      userId: user?.uid || '',
                      userProfile: profile,
                      isAdmin: isUserAdmin,
                      onVisitProfile: (uid) => navigateTo('visit-profile', uid),
                      onChat: () => {
                        setSelectedChatUser(post.authorId);
                        setActiveTab('messages');
                      }
                    };
                    return <PostCard key={post.id} {...postProps} />;
                  })}
                  {posts.filter(p => p.authorId === viewedProfile.uid).length === 0 && (
                    <div className="bg-white border border-bento-border rounded-[24px] p-12 text-center text-bento-text-sub">
                      No posts yet.
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'profile' && (
              <motion.div 
                key="profile"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                <div className="relative h-32 bg-zinc-200 dark:bg-zinc-800 rounded-[24px] overflow-hidden mb-12">
                   <div className="absolute -bottom-10 left-6">
                      <Avatar className="h-24 w-24 border-4 border-white dark:border-zinc-900 shadow-lg">
                        <AvatarImage src={profile?.photoURL} />
                        <AvatarFallback className="text-2xl dark:text-white">{profile?.displayName?.[0]}</AvatarFallback>
                      </Avatar>
                   </div>
                </div>
                <div className="px-2 space-y-4">
                   <div className="flex justify-between items-start">
                      <div>
                        <h2 className="text-3xl font-bold text-bento-text-main dark:text-white flex items-center gap-2">
                          {profile?.displayName}
                          {(profile?.isAdmin || isUserAdmin) && (
                             <div className="flex items-center gap-1">
                                <Badge variant="default" className="bg-amber-500 hover:bg-amber-600 font-bold border-none text-white text-[10px]">ADMIN</Badge>
                                <Badge variant="outline" className="text-blue-500 border-blue-500 text-[8px] font-black tracking-tighter">VERIFIED PIONEER</Badge>
                             </div>
                          )}
                        </h2>
                        <p className="text-bento-text-sub font-medium">@{profile?.username}</p>
                      </div>
                      <Button variant="outline" className="rounded-xl px-6 border-bento-border dark:border-zinc-800 dark:text-white dark:hover:bg-zinc-800" onClick={() => setActiveTab('settings')}>Edit Profile</Button>
                   </div>
                   <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed text-sm">{profile?.bio || 'Passionate builder connecting through code.'}</p>
                   
                   <div className="flex flex-wrap gap-4 text-xs text-bento-text-sub font-medium">
                      {profile?.location && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          <span>{profile.location}</span>
                        </div>
                      )}
                      {profile?.address && (
                        <div className="flex items-center gap-1">
                          <Search className="h-3 w-3" />
                          <span>{profile.address}</span>
                        </div>
                      )}
                      {profile?.privacyEmail && profile?.email && (
                        <div className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          <span>{profile.email}</span>
                        </div>
                      )}
                   </div>

                   <div className="flex gap-2 items-center">
                      <button 
                        onClick={() => profile && openFollowModal(profile.uid, 'Followers')}
                        className="hover:bg-zinc-100 dark:hover:bg-zinc-800 px-3 py-1.5 -ml-3 rounded-xl transition-all text-left text-sm cursor-pointer"
                      >
                        <span className="font-extrabold">{formatNumber(profile?.followersCount || 0)}</span> <span className="text-bento-text-sub">Followers</span>
                      </button>
                      <button 
                        onClick={() => profile && openFollowModal(profile.uid, 'Following')}
                        className="hover:bg-zinc-100 dark:hover:bg-zinc-800 px-3 py-1.5 rounded-xl transition-all text-left text-sm cursor-pointer"
                      >
                        <span className="font-extrabold">{formatNumber(profile?.followingCount || 0)}</span> <span className="text-bento-text-sub">Following</span>
                      </button>
                   </div>
                   <div className="pt-2">
                     <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Project Reference: 287502457007</p>
                   </div>
                </div>
                <Separator className="my-10" />
                <div className="grid grid-cols-1 gap-6">
                  <h3 className="font-extrabold text-2xl tracking-tighter">Your Activity</h3>
                  {posts.filter(p => p.authorId === user.uid).map(post => {
                    const postProps: PostCardProps = { 
                      post, 
                      userId: user.uid,
                      userProfile: profile,
                      isAdmin: isUserAdmin,
                      onVisitProfile: (uid) => navigateTo('visit-profile', uid)
                    };
                    return <PostCard key={post.id} {...postProps} />;
                  })}
                </div>
              </motion.div>
            )}

            {activeTab === 'settings' && (
              <motion.div 
                key="settings"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-4 pb-24"
              >
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                  <div>
                    <h2 className="text-3xl font-black text-zinc-900 dark:text-white uppercase tracking-tighter">Settings</h2>
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Manage your NexiSphere account</p>
                  </div>
                  <Button 
                    className="w-full sm:w-auto rounded-2xl px-10 bg-bento-accent text-white hover:bg-blue-600 shadow-xl shadow-blue-500/20 font-black uppercase tracking-widest text-[10px] h-12"
                    onClick={handleUpdateProfile}
                  >
                    Save Configuration
                  </Button>
                </div>
                
                <Tabs defaultValue="account" className="w-full">
                  <TabsList className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-2xl p-1 h-auto flex flex-wrap gap-1 mb-8">
                    <TabsTrigger value="account" className="flex-1 rounded-xl py-3 font-bold uppercase tracking-widest text-[10px] data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700 data-[state=active]:shadow-sm transition-all">
                      <UserIcon className="h-3 w-3 mr-2" /> Account
                    </TabsTrigger>
                    <TabsTrigger value="preferences" className="flex-1 rounded-xl py-3 font-bold uppercase tracking-widest text-[10px] data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700 data-[state=active]:shadow-sm transition-all">
                      <Zap className="h-3 w-3 mr-2" /> Preferences
                    </TabsTrigger>
                    <TabsTrigger value="security" className="flex-1 rounded-xl py-3 font-bold uppercase tracking-widest text-[10px] data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700 data-[state=active]:shadow-sm transition-all">
                      <Lock className="h-3 w-3 mr-2" /> Security
                    </TabsTrigger>
                    <TabsTrigger value="support" className="flex-1 rounded-xl py-3 font-bold uppercase tracking-widest text-[10px] data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700 data-[state=active]:shadow-sm transition-all">
                      <HelpCircle className="h-3 w-3 mr-2" /> Support
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="account" className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <Card className="rounded-[32px] border-bento-border bg-white dark:bg-zinc-900 overflow-hidden">
                        <CardHeader>
                          <CardTitle className="text-sm font-black uppercase tracking-widest text-zinc-400">Identity Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                          <div className="space-y-4">
                            <div className="flex items-center gap-6 p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-3xl border border-zinc-100 dark:border-zinc-800">
                              <Avatar className="h-20 w-100 min-w-20 border-4 border-white dark:border-zinc-800 shadow-xl">
                                <AvatarImage src={editPhoto} />
                                <AvatarFallback className="text-2xl font-black">{editName[0] || 'U'}</AvatarFallback>
                              </Avatar>
                              <div className="flex-1 space-y-2">
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="w-full rounded-xl font-bold h-10 border-zinc-200 dark:border-zinc-700 dark:text-white"
                                  onClick={() => profileFileInputRef.current?.click()}
                                  disabled={isUploadingProfile}
                                >
                                  {isUploadingProfile ? 'Uploading...' : 'Upload Avatar'}
                                </Button>
                                <p className="text-[9px] text-zinc-400 font-bold uppercase text-center">SVG, PNG, JPG (MAX. 800x800px)</p>
                                <input type="file" ref={profileFileInputRef} className="hidden" accept="image/*" onChange={handleProfileFileChange} />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-1">Visible Name</label>
                              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="rounded-2xl bg-zinc-50 dark:bg-zinc-800 border-none h-12 dark:text-white ring-offset-zinc-900 focus-visible:ring-bento-accent" placeholder="Display Name" />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-1">Sphere Bio</label>
                              <textarea 
                                className="w-full rounded-2xl border-none bg-zinc-50 dark:bg-zinc-800 p-4 min-h-[120px] text-sm focus:ring-1 focus:ring-bento-accent dark:text-white transition-all outline-none" 
                                placeholder="Tell your story..." 
                                value={editBio}
                                onChange={(e) => setEditBio(e.target.value)}
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="rounded-[32px] border-bento-border bg-white dark:bg-zinc-900 overflow-hidden">
                        <CardHeader>
                          <CardTitle className="text-sm font-black uppercase tracking-widest text-zinc-400">Context & Presence</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                           <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-1 flex items-center gap-2 font-black uppercase tracking-widest text-zinc-400 ml-1">
                                <MapPin className="h-3 w-3" /> Geographical Location
                              </label>
                              <Input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} className="rounded-2xl bg-zinc-50 dark:bg-zinc-800 border-none h-12 dark:text-white" placeholder="City, Country" />
                           </div>
                           <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-1 flex items-center gap-2 font-black uppercase tracking-widest text-zinc-400 ml-1">
                                <Globe className="h-3 w-3" /> Digital Address / Website
                              </label>
                              <Input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} className="rounded-2xl bg-zinc-50 dark:bg-zinc-800 border-none h-12 dark:text-white" placeholder="https://example.com" />
                           </div>
                           <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-1 flex items-center gap-2 font-black uppercase tracking-widest text-zinc-400 ml-1">
                                <Mail className="h-3 w-3" /> Contact Email
                              </label>
                              <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="rounded-2xl bg-zinc-50 dark:bg-zinc-800 border-none h-12 dark:text-white" placeholder="email@address.com" />
                           </div>
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>

                  <TabsContent value="preferences" className="space-y-6">
                    <Card className="rounded-[32px] border-bento-border bg-white dark:bg-zinc-900">
                      <CardHeader>
                        <CardTitle className="text-sm font-black uppercase tracking-widest text-zinc-400">Visual Experience</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-[24px]">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 bg-zinc-100 dark:bg-zinc-700 rounded-xl flex items-center justify-center text-zinc-500">
                              <Moon className="h-5 w-5" />
                            </div>
                            <div>
                               <p className="font-bold text-sm dark:text-white">Dark Mode</p>
                               <p className="text-[10px] text-zinc-500 font-bold uppercase">Reduce eye strain at night</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                            className={`h-7 w-12 rounded-full transition-all relative ${theme === 'dark' ? 'bg-bento-accent' : 'bg-zinc-300'}`}
                          >
                            <div className={`absolute top-1 h-5 w-5 bg-white rounded-full transition-all shadow-md ${theme === 'dark' ? 'right-1' : 'left-1'}`} />
                          </button>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-[24px]">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 bg-zinc-100 dark:bg-zinc-700 rounded-xl flex items-center justify-center text-zinc-500">
                              <Bell className="h-5 w-5" />
                            </div>
                            <div>
                               <p className="font-bold text-sm dark:text-white">Push Notifications</p>
                               <p className="text-[10px] text-zinc-500 font-bold uppercase">Real-time alerts for interactions</p>
                            </div>
                          </div>
                          <button className="h-7 w-12 rounded-full bg-bento-accent relative">
                            <div className="absolute top-1 right-1 h-5 w-5 bg-white rounded-full" />
                          </button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="rounded-[32px] border-bento-border bg-white dark:bg-zinc-900 border-amber-200 dark:border-amber-900/40">
                      <CardHeader>
                        <CardTitle className="text-sm font-black uppercase tracking-widest text-amber-500">Administrative Configuration</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {isUserAdmin ? (
                          <div className="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-900/10 rounded-[24px]">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center text-amber-600">
                                <ShieldCheck className="h-5 w-5" />
                              </div>
                              <div>
                                 <p className="font-bold text-sm text-zinc-900 dark:text-white">Toggle Admin Mode</p>
                                 <p className="text-[10px] text-amber-600 font-bold uppercase">Override platform constraints (ADMIN ONLY)</p>
                              </div>
                            </div>
                            <Button 
                              size="sm" 
                              onClick={toggleAdminMode}
                              className={`rounded-xl font-black uppercase tracking-widest text-[9px] px-6 ${profile?.isAdmin ? 'bg-zinc-900 text-white' : 'bg-amber-500 text-white'}`}
                            >
                              {profile?.isAdmin ? 'DEACTIVATE' : 'ACTIVATE'}
                            </Button>
                          </div>
                        ) : (
                          <p className="text-xs font-bold text-zinc-400 p-4 bg-zinc-50 dark:bg-zinc-800 rounded-2xl italic text-center uppercase tracking-widest">Global admin privileges not found for this identity.</p>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="security" className="space-y-6">
                    <Card className="rounded-[32px] border-bento-border bg-white dark:bg-zinc-900">
                      <CardHeader>
                        <CardTitle className="text-sm font-black uppercase tracking-widest text-zinc-400">Security & Access</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-[24px] border border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                           <div className="flex items-center gap-3">
                              <div className="h-10 w-10 bg-green-50 dark:bg-green-900/20 rounded-xl flex items-center justify-center text-green-500">
                                 <Phone className="h-5 w-5" />
                              </div>
                              <div>
                                 <p className="font-bold text-sm dark:text-white">Active Session</p>
                                 <p className="text-[10px] text-zinc-500 font-bold uppercase">This Device • Online Now</p>
                              </div>
                           </div>
                           <Badge variant="outline" className="text-green-500 border-green-500 text-[8px] font-black tracking-widest">SECURE</Badge>
                        </div>

                        <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-[24px] border border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                           <div className="flex items-center gap-3">
                              <div className="h-10 w-10 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-center text-blue-500">
                                 <History className="h-5 w-5" />
                              </div>
                              <div>
                                 <p className="font-bold text-sm dark:text-white">Download Your Data</p>
                                 <p className="text-[10px] text-zinc-500 font-bold uppercase">Get a copy of your sphere activity</p>
                              </div>
                           </div>
                           <Button 
                            variant="ghost" 
                            size="sm" 
                            className="rounded-xl font-black uppercase tracking-widest text-[9px] text-bento-accent"
                            onClick={() => toast.info('Data export package is being generated. Check your email soon.')}
                           >
                            REQUEST
                           </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="rounded-[32px] border-bento-border bg-white dark:bg-zinc-900">
                      <CardHeader>
                        <CardTitle className="text-sm font-black uppercase tracking-widest text-zinc-400">Data Visibility</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-[24px]">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 bg-zinc-100 dark:bg-zinc-700 rounded-xl flex items-center justify-center text-zinc-500">
                                <Eye className="h-5 w-5" />
                              </div>
                              <div>
                                 <p className="font-bold text-sm dark:text-white">Public Profile Email</p>
                                 <p className="text-[10px] text-zinc-500 font-bold uppercase">Others can see your gmail address</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => setPrivacyEmail(!privacyEmail)}
                              className={`h-7 w-12 rounded-full transition-all relative ${privacyEmail ? 'bg-bento-accent' : 'bg-zinc-300'}`}
                            >
                              <div className={`absolute top-1 h-5 w-5 bg-white rounded-full transition-all ${privacyEmail ? 'right-1' : 'left-1'}`} />
                            </button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="rounded-[32px] border border-red-100 dark:border-red-900 bg-white dark:bg-zinc-900">
                      <CardHeader>
                        <CardTitle className="text-sm font-black uppercase tracking-widest text-red-500">Danger Zone</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="p-4 bg-red-50 dark:bg-red-900/10 rounded-[24px] border border-red-100 dark:border-red-900/30">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center text-red-600">
                                <UserX className="h-5 w-5" />
                              </div>
                              <div>
                                 <p className="font-bold text-sm text-red-700 dark:text-red-400">Permanently Delete</p>
                                 <p className="text-[10px] text-red-600/70 font-bold uppercase">Irreversible operation</p>
                              </div>
                            </div>
                            <Button 
                              variant="destructive" 
                              size="sm" 
                              onClick={handleDeleteAccount}
                              className="rounded-xl font-black uppercase tracking-widest text-[9px] px-6 bg-red-600 hover:bg-red-700"
                            >
                              Destroy Profile
                            </Button>
                          </div>
                          <p className="text-[10px] text-red-600/50 leading-tight font-bold italic">
                            Wait! Deleting your account will remove all your posts, interactions, and profile metadata from the sphere. This cannot be undone.
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="support" className="space-y-6">
                    <Card className="rounded-[32px] border-bento-border bg-white dark:bg-zinc-900 text-center py-12 px-6">
                      <CardHeader className="p-0 mb-6">
                         <div className="mx-auto h-20 w-20 bg-blue-50 dark:bg-blue-900/20 rounded-[28px] flex items-center justify-center text-bento-accent mb-4 ring-8 ring-blue-50/50">
                            <HelpCircle className="h-10 w-10" />
                         </div>
                         <CardTitle className="text-2xl font-black uppercase tracking-tighter dark:text-white">NexiSphere Support</CardTitle>
                         <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">We are here to help you build</p>
                      </CardHeader>
                      <CardContent className="space-y-10 max-w-md mx-auto">
                         <div className="grid grid-cols-1 gap-4">
                            <div className="p-6 bg-zinc-50 dark:bg-zinc-800 rounded-[28px] border border-zinc-100 dark:border-zinc-700 hover:scale-[1.02] transition-transform">
                               <Mail className="h-5 w-5 text-bento-accent mx-auto mb-3" />
                               <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Official Inquiry</p>
                               <p className="font-bold text-sm dark:text-white">fahimzzhasan0@gmail.com</p>
                               <p className="text-[9px] text-zinc-500 font-bold mt-2 uppercase tracking-widest">Average response: 24h</p>
                            </div>
                            <div className="p-6 bg-zinc-50 dark:bg-zinc-800 rounded-[28px] border border-zinc-100 dark:border-zinc-700 hover:scale-[1.02] transition-transform">
                               <Shield className="h-5 w-5 text-green-500 mx-auto mb-3" />
                               <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Safety & Security</p>
                               <p className="font-bold text-sm dark:text-white">Report Content or Abuse</p>
                               <Button variant="link" className="text-[10px] h-auto p-0 font-black text-bento-accent uppercase tracking-widest">Safety Portal</Button>
                            </div>
                         </div>
                         
                         <div className="pt-6 border-t border-zinc-100 dark:border-zinc-800">
                            <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-[0.2em] mb-4">Sphere Infrastructure</p>
                            <div className="flex justify-center gap-4">
                               <div className="flex flex-col items-center">
                                  <span className="text-xs font-black dark:text-white">Nexi-2.5</span>
                                  <span className="text-[8px] text-zinc-500 font-black uppercase">Engine</span>
                               </div>
                               <div className="w-[1px] h-4 bg-zinc-200 dark:bg-zinc-800 self-center" />
                               <div className="flex flex-col items-center">
                                  <span className="text-xs font-black dark:text-white">Stable</span>
                                  <span className="text-[8px] text-zinc-500 font-black uppercase">Status</span>
                               </div>
                               <div className="w-[1px] h-4 bg-zinc-200 dark:bg-zinc-800 self-center" />
                               <div className="flex flex-col items-center">
                                  <span className="text-xs font-black dark:text-white">v2.1.0-build</span>
                                  <span className="text-[8px] text-zinc-500 font-black uppercase">Version</span>
                               </div>
                            </div>
                         </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </main>

      {/* Floating Chatbot UI */}
      <div className="fixed bottom-24 right-6 sm:bottom-10 sm:right-10 z-[60]">
        <AnimatePresence>
          {isChatbotOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20 }}
              className="w-[350px] sm:w-[400px] h-[500px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[32px] shadow-2xl overflow-hidden flex flex-col mb-6"
            >
              <div className="p-5 bg-bento-accent flex justify-between items-center">
                <div className="flex items-center gap-3 text-white">
                  <div className="h-10 w-10 bg-white/20 rounded-2xl flex items-center justify-center">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm uppercase tracking-widest">Nexi Bot</h3>
                    <p className="text-[10px] font-bold text-white/70">AI Assistant Online</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => setIsChatbotOpen(false)}>
                  <MoreHorizontal className="h-5 w-5" />
                </Button>
              </div>

              <ScrollArea className="flex-1 p-5">
                <div className="space-y-4">
                  {chatbotMessages.length === 0 && (
                    <div className="text-center py-10 space-y-4">
                      <div className="h-16 w-16 bg-blue-50 dark:bg-zinc-800 rounded-3xl flex items-center justify-center mx-auto opacity-50">
                        <MessageCircle className="h-8 w-8 text-bento-accent" />
                      </div>
                      <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest leading-loose">
                        How can I assist you in the sphere today?
                      </p>
                    </div>
                  )}
                  {chatbotMessages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm font-medium ${
                        m.role === 'user' 
                          ? 'bg-bento-accent text-white rounded-tr-none' 
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-tl-none'
                      }`}>
                        {m.parts[0].text}
                      </div>
                    </div>
                  ))}
                  {isBotLoading && (
                    <div className="flex justify-start">
                      <div className="bg-zinc-100 dark:bg-zinc-800 px-4 py-3 rounded-2xl rounded-tl-none flex gap-1 items-center">
                        <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" />
                        <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                        <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              </ScrollArea>

              <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                <div className="relative">
                  <Input 
                    value={chatbotInput}
                    onChange={(e) => setChatbotInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendChatbotMessage()}
                    placeholder="Ask Nexi Bot..."
                    className="pr-12 py-6 rounded-2xl border-none bg-white dark:bg-zinc-800 shadow-sm"
                  />
                  <Button 
                    size="icon" 
                    disabled={isBotLoading || !chatbotInput.trim()}
                    onClick={handleSendChatbotMessage}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-xl bg-bento-accent hover:bg-blue-600"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsChatbotOpen(!isChatbotOpen)}
          className={`h-16 w-16 rounded-[24px] shadow-2xl flex items-center justify-center transition-all ${
            isChatbotOpen ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900' : 'bg-bento-accent text-white'
          }`}
        >
          {isChatbotOpen ? <MoreHorizontal className="h-8 w-8" /> : <Sparkles className="h-8 w-8" />}
          {chatbotMessages.length > 0 && !isChatbotOpen && (
            <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 rounded-full border-4 border-white dark:border-zinc-950" />
          )}
        </motion.button>
      </div>

      {/* Mobile Nav */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white dark:bg-black/60 backdrop-blur-xl border-t border-zinc-200/50 dark:border-zinc-800/50 px-6 sm:hidden flex items-center justify-between z-50">
        <NavIconButton icon={<Home />} active={activeTab === 'home'} onClick={() => navigateTo('home')} />
        <NavIconButton icon={<Filter />} active={activeTab === 'explore'} onClick={() => navigateTo('explore')} />
        <NavIconButton icon={<Bell />} active={activeTab === 'notifs'} onClick={() => navigateTo('notifs')} dot={unreadCount > 0} />
        <NavIconButton icon={<MessageSquare />} active={activeTab === 'messages'} onClick={() => navigateTo('messages')} />
        {isUserAdmin && (
          <NavIconButton icon={<ShieldCheck className="text-amber-500" />} active={activeTab === 'admin'} onClick={() => navigateTo('admin')} />
        )}
        <NavIconButton icon={<UserIcon />} active={activeTab === 'profile'} onClick={() => navigateTo('profile')} />
        <NavIconButton icon={<Settings />} active={activeTab === 'settings'} onClick={() => navigateTo('settings')} />
      </nav>

      <Dialog open={followModalOpen} onOpenChange={setFollowModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl p-0 overflow-hidden border-none shadow-2xl">
          <DialogHeader className="p-6 border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 border-none">
            <DialogTitle className="text-xl font-bold dark:text-white">{followModalType}</DialogTitle>
          </DialogHeader>
          <div className="bg-zinc-50 dark:bg-black p-0 m-0">
            <ScrollArea className="h-[400px]">
              {followModalLoading ? (
                <div className="p-8 text-center text-zinc-400 font-bold uppercase tracking-widest text-xs">Loading...</div>
              ) : followModalProfiles.length === 0 ? (
                <div className="p-8 text-center text-zinc-400 font-bold uppercase tracking-widest text-xs">No {followModalType.toLowerCase()} found.</div>
              ) : (
                <div className="p-4 space-y-2">
                  {followModalProfiles.map(p => (
                    <div 
                      key={p.uid} 
                      className="flex items-center gap-3 p-3 bg-white dark:bg-zinc-900 rounded-2xl hover:shadow-md transition-shadow cursor-pointer border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700"
                      onClick={() => {
                        setFollowModalOpen(false);
                        navigateTo('visit-profile', p.uid);
                      }}
                    >
                      <Avatar className="h-12 w-12 border border-zinc-200 dark:border-zinc-800 shadow-sm">
                        <AvatarImage src={p.photoURL} />
                        <AvatarFallback className="dark:text-white">{p.displayName[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 overflow-hidden" onClick={() => {
                        setFollowModalOpen(false);
                        navigateTo('visit-profile', p.uid);
                      }}>
                        <p className="font-bold text-bento-text-main dark:text-white truncate hover:underline">{p.displayName}</p>
                        <p className="text-xs text-bento-text-sub font-medium truncate">@{p.username}</p>
                      </div>
                      {user && user.uid !== p.uid && profile && (
                        <FollowButton
                          followerId={user.uid}
                          followerName={profile.displayName}
                          followingId={p.uid}
                          followingName={p.displayName}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
        </>
      )}
      </div>
    </div>
  );
}

function SidebarItem({ icon, label, active, onClick, badge }: { icon: React.ReactNode, label: string, active?: boolean, onClick: () => void, badge?: number }) {
  return (
    <button 
      onClick={onClick} 
      className={`w-full flex items-center gap-4 px-4 py-4 rounded-[22px] transition-all duration-500 group relative ${
        active 
          ? 'bg-bento-accent text-white shadow-2xl shadow-blue-500/40 font-black' 
          : 'text-zinc-500 hover:bg-white/80 dark:hover:bg-zinc-800/80 hover:text-bento-accent'
      }`}
    >
      <div className={`transition-transform duration-500 ${active ? 'scale-110' : 'group-hover:scale-110 group-hover:rotate-6'}`}>
        {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement, { className: 'h-6 w-6' }) : null}
      </div>
      <span className="hidden md:block text-sm font-extrabold tracking-wide">{label}</span>
      {badge !== undefined && (
        <span className="ml-auto h-5 w-5 rounded-full bg-red-500 text-[10px] flex items-center justify-center text-white ring-2 ring-white dark:ring-zinc-900 font-black transition-transform group-hover:scale-110">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
      {active && (
        <motion.div 
          layoutId="sidebar-active"
          className="absolute inset-0 bg-bento-accent rounded-[22px] -z-10 shadow-lg shadow-blue-500/40"
          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
        />
      )}
    </button>
  );
}

function NavIconButton({ icon, active, onClick, dot }: { icon: React.ReactNode, active: boolean, onClick: () => void, dot?: boolean }) {
  return (
    <button onClick={onClick} className={`relative p-3 rounded-xl transition-colors ${active ? 'bg-bento-accent text-white' : 'text-bento-text-sub'}`}>
      {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement, { className: 'h-6 w-6' }) : null}
      {dot && <span className="absolute top-2 right-2 h-2.5 w-2.5 bg-red-500 rounded-full border-2 border-white" />}
    </button>
  );
}

function FollowButton({ followerId, followerName, followingId, followingName, onUpdate }: { followerId: string, followerName: string, followingId: string, followingName: string, onUpdate?: () => void }) {
  const [following, setFollowing] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    isFollowing(followerId, followingId).then((res) => {
      setFollowing(res);
      setLoading(false);
    });
  }, [followerId, followingId]);

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setLoading(true);
      if (following) {
        await unfollowUser(followerId, followingId);
        toast.info(`Unfollowed ${followingName}`);
        setFollowing(false);
      } else {
        await followUser(followerId, followerName, followingId, followingName);
        toast.success(`Following ${followingName}!`);
        setFollowing(true);
      }
      onUpdate?.();
    } catch (err) {
      toast.error("Failed to update follow status.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Button variant="ghost" disabled className="rounded-xl px-4 h-9">...</Button>;

  return (
    <Button 
      variant={following ? "outline" : "default"}
      size="sm"
      className={`rounded-xl px-6 h-9 font-bold transition-all ${!following ? 'bg-bento-accent hover:bg-blue-600' : ''}`}
      onClick={handleToggle}
    >
      {following ? 'Following' : 'Follow'}
    </Button>
  );
}

interface PostCardProps {
  post: FeedPost;
  userId: string;
  userProfile: UserProfile | null;
  isAdmin: boolean;
  onChat?: () => void;
  onVisitProfile: (uid: string) => void;
  key?: React.Key;
}

function PostCard({ post, userId, userProfile, isAdmin, onChat, onVisitProfile }: PostCardProps) {
  const [following, setFollowing] = React.useState(false);
  const [liked, setLiked] = React.useState(false);
  const [localLikesCount, setLocalLikesCount] = React.useState(post.likesCount || 0);
  const [comments, setComments] = React.useState<FeedComment[]>([]);
  const [showComments, setShowComments] = React.useState(false);
  const [newComment, setNewComment] = React.useState('');
  const [isEditing, setIsEditing] = React.useState(false);
  const [editContent, setEditContent] = React.useState(post.content);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [showRepostConfirm, setShowRepostConfirm] = React.useState(false);
  const isMyPost = post.authorId === userId;

  React.useEffect(() => {
    // Only count views once per session per post
    const viewedKey = `viewed_${post.id}`;
    if (!sessionStorage.getItem(viewedKey)) {
      sessionStorage.setItem(viewedKey, 'true');
      incrementPostView(post.id);
    }
  }, [post.id]);

  React.useEffect(() => {
    if (isMyPost) return;
    isFollowing(userId, post.authorId).then(setFollowing);
  }, [userId, post.authorId, isMyPost]);

  React.useEffect(() => {
    if (showComments) {
      const unsub = subscribeToComments(post.id, setComments);
      return () => unsub();
    }
  }, [post.id, showComments]);

  const handleFollow = async () => {
    try {
      if (following) {
        await unfollowUser(userId, post.authorId);
        setFollowing(false);
        toast.info('Unfollowed');
      } else {
        const followerName = userProfile?.displayName || 'Social User';
        await followUser(userId, followerName, post.authorId, post.authorName);
        setFollowing(true);
        toast.success(`Following ${post.authorName}!`);
      }
    } catch (err) {
      console.error('Follow Error:', err);
      toast.error('Failed to update follow status.');
    }
  };

  const handleTogglePin = async () => {
    try {
      await togglePinPost(post.id, !!post.isPinned);
      toast.success(post.isPinned ? 'Unpinned post' : 'Pinned post to top');
    } catch (e) {
      toast.error('Failed to update pin status.');
    }
  };

  const handleToggleBoost = async () => {
    try {
      await toggleBoostPost(post.id, !!post.isBoosted);
      toast.success(post.isBoosted ? 'Removed from SEO Boost' : 'SEO Boosted! This post is now promoted.');
    } catch (e) {
      toast.error('Failed to update SEO boost status.');
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    try {
      const profileToUse = userProfile || await getProfile(userId);
      await createComment({
        postId: post.id,
        content: newComment,
        authorId: userId,
        authorName: profileToUse?.displayName || 'Someone',
        authorPhotoURL: profileToUse?.photoURL
      });
      setNewComment('');
    } catch (e: any) {
      console.error('Comment Error:', e);
      toast.error(`Failed to add comment: ${e.message || 'Unknown error'}`);
    }
  };

  const handleSaveEdit = async () => {
    if (!editContent.trim()) return;
    try {
      await updatePost(post.id, { content: editContent });
      setIsEditing(false);
      toast.success('Post updated successfully!');
    } catch (e: any) {
      console.error('Edit Error:', e);
      toast.error(`Failed to update post: ${e.message || 'Unknown error'}`);
    }
  };

  const handleDelete = async () => {
    try {
      await deletePost(post.id);
      setShowDeleteConfirm(false);
      toast.info('Post deleted permanently.');
    } catch (e: any) {
      console.error('Delete Error:', e);
      toast.error(`Delete failed: ${e.message || 'Unknown error'}`);
    }
  };

  const handleToggleLike = () => {
    if (liked) {
      setLocalLikesCount(prev => prev - 1);
      setLiked(false);
    } else {
      setLocalLikesCount(prev => prev + 1);
      setLiked(true);
      toast.success('Liked!');
    }
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'NexiSphere Post',
          text: post.content,
          url: `${window.location.origin}${window.location.pathname}?post=${post.id}`
        });
        toast.success('Shared successfully');
      } else {
        await navigator.clipboard.writeText(post.id);
        toast.success('Post ID copied! Search for this code in Explore to find this post.');
      }
    } catch (err) {
      console.error('Share error:', err);
    }
  };

  const handleRepost = async () => {
    try {
      const profileToUse = userProfile || await getProfile(userId);
      if (!profileToUse) return;
      
      await createPost({
        content: post.content,
        authorId: profileToUse.uid,
        authorName: profileToUse.displayName,
        authorPhotoURL: profileToUse.photoURL,
        authorIsAdmin: !!profileToUse.isAdmin,
        mediaURL: post.mediaURL,
        mediaType: post.mediaType,
        repostFromId: post.authorId,
        repostFromName: post.authorName
      });
      setShowRepostConfirm(false);
      toast.success('Successfully reposted to your timeline!');
    } catch (err: any) {
      console.error('Repost Error:', err);
      toast.error(`Failed to repost: ${err.message || 'Unknown error'}`);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} layout>
      <Card className={`rounded-[28px] border-bento-border overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 bg-white/80 dark:bg-bento-card/80 backdrop-blur-md ${post.isPinned ? 'border-2 border-bento-accent ring-4 ring-bento-accent/5' : ''}`}>
        {post.repostFromName && (
          <div className="px-5 pt-4 pb-0 flex items-center gap-2 text-xs font-bold text-zinc-400">
            <Repeat className="h-3 w-3" />
            <span>Reposted from {post.repostFromName}</span>
          </div>
        )}
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 p-5">
          <div className="relative cursor-pointer" onClick={() => onVisitProfile(post.authorId)}>
            <Avatar className="h-11 w-11 border-2 border-bento-border shadow-sm">
              <AvatarImage src={post.authorPhotoURL} />
              <AvatarFallback className="dark:text-white bg-zinc-100 dark:bg-zinc-800 font-bold">{post.authorName[0]}</AvatarFallback>
            </Avatar>
            {post.isPinned && (
              <div className="absolute -top-1 -right-1 bg-bento-accent text-white p-1 rounded-full shadow-lg border-2 border-white dark:border-zinc-800">
                <Pin className="h-3 w-3" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 group cursor-pointer" onClick={() => onVisitProfile(post.authorId)}>
                <span className="font-extrabold truncate text-bento-text-main dark:text-white text-base group-hover:text-bento-accent transition-colors">{post.authorName}</span>
                {post.authorIsAdmin && (
                  <Badge variant="default" className="bg-amber-500 hover:bg-amber-600 font-bold border-none text-white text-[9px] h-4">ADMIN</Badge>
                )}
                <CheckCircle2 className="h-3.5 w-3.5 text-bento-accent fill-bento-accent" />
              </div>
              
              <DropdownMenu>
                <DropdownMenuTrigger className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition-all hover:text-zinc-600">
                  <MoreHorizontal className="h-5 w-5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-2xl border-bento-border p-2 min-w-[160px] shadow-2xl backdrop-blur-xl bg-white/90 dark:bg-zinc-900/90">
                  <DropdownMenuItem className="text-xs font-bold uppercase tracking-widest p-3 rounded-xl cursor-pointer" onClick={() => {
                              const url = `${window.location.origin}/profile/${post.authorId}`;
                              navigator.clipboard.writeText(url);
                              toast.success("Profile link copied!");
                            }}>Copy Link</DropdownMenuItem>
                  {!isMyPost && <DropdownMenuItem className="text-xs font-bold uppercase tracking-widest p-3 rounded-xl cursor-pointer text-red-500 focus:text-red-500 hover:text-red-600" onClick={() => {
                                toast.success("Post reported to admins.");
                              }}>Report</DropdownMenuItem>}
                  
                  {isAdmin && (
                    <>
                      <DropdownMenuItem 
                        onClick={handleTogglePin}
                        className="text-xs font-bold uppercase tracking-widest p-3 rounded-xl cursor-pointer text-bento-accent"
                      >
                        <Pin className="h-4 w-4 mr-2" />
                        {post.isPinned ? 'Unpin Post' : 'Pin to Top'}
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={handleToggleBoost}
                        className="text-xs font-bold uppercase tracking-widest p-3 rounded-xl cursor-pointer text-amber-500"
                      >
                        <Zap className="h-4 w-4 mr-2" />
                        {post.isBoosted ? 'Cancel SEO Boost' : 'Toggle SEO Boost'}
                      </DropdownMenuItem>
                    </>
                  )}

                  {(isMyPost || isAdmin) && (
                    <>
                      {isMyPost && (
                        <DropdownMenuItem 
                          onClick={() => setIsEditing(true)}
                          className="text-xs font-bold uppercase tracking-widest p-3 rounded-xl cursor-pointer text-zinc-600 dark:text-zinc-400"
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Post
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem 
                        onClick={() => setShowDeleteConfirm(true)}
                        className="text-xs font-bold uppercase tracking-widest p-3 rounded-xl cursor-pointer text-red-500 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/20"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Post
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest flex items-center gap-2">
              {post.isBoosted && <span className="text-amber-500 flex items-center gap-1 border border-amber-200 bg-amber-50 px-1.5 py-0.5 rounded-md"><Zap className="h-2.5 w-2.5 fill-amber-500" /> PROMOTED</span>}
              {post.isPinned && <span className="text-bento-accent mr-2">Featured</span>}
              {post.createdAt ? formatDistanceToNow(post.createdAt.toDate(), { addSuffix: true }) : 'Just now'}
            </p>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-0 space-y-4 text-left">
          {!isEditing ? (
            <>
              <p className="text-bento-text-main dark:text-zinc-100 leading-relaxed font-normal text-sm whitespace-pre-wrap">{post.content}</p>
              {post.mediaURL && (
                <div className="rounded-2xl overflow-hidden border border-bento-bg dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 max-h-[400px]">
                  {post.mediaType === 'video' || (post.mediaURL.toLowerCase().includes('.mp4') || post.mediaURL.toLowerCase().includes('.mov') || post.mediaURL.toLowerCase().includes('video')) ? (
                    <video 
                      key={post.mediaURL}
                      controls 
                      playsInline
                      preload="auto"
                      className="w-full aspect-video bg-black block"
                      style={{ maxHeight: '400px' }}
                    >
                      <source src={post.mediaURL} type="video/mp4" />
                      Your browser does not support the video tag.
                    </video>
                  ) : (
                    <img 
                      src={post.mediaURL} 
                      alt="Post content" 
                      className="w-full h-full object-cover"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                      referrerPolicy="no-referrer"
                    />
                  )}
                </div>
              )}
              {!isMyPost && !following && (
                <Button variant="default" size="sm" className="w-full rounded-xl bg-bento-accent/10 text-bento-accent hover:bg-bento-accent hover:text-white font-bold transition-all" onClick={handleFollow}>
                  Follow {post.authorName}
                </Button>
              )}
            </>
          ) : (
            <div className="space-y-4 pt-2">
              <textarea 
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full min-h-[100px] p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border-none transition-all focus:ring-2 focus:ring-bento-accent dark:text-white"
                placeholder="Edit your post..."
              />
              <div className="flex justify-end gap-3">
                <Button variant="ghost" className="rounded-xl font-bold" onClick={() => { setIsEditing(false); setEditContent(post.content); }}>Cancel</Button>
                <Button className="rounded-xl bg-bento-accent text-white font-bold px-6" onClick={handleSaveEdit}>Save</Button>
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="px-5 py-3 border-t border-bento-bg flex flex-col bg-zinc-50/10">
           <div className="flex items-center justify-between w-full mb-1">
              <div className="flex items-center gap-6">
                <button 
                  onClick={handleToggleLike}
                  className={`flex items-center gap-1.5 transition-colors ${liked ? 'text-red-500 scale-110' : 'text-bento-text-sub hover:text-red-500'}`}
                >
                  <Heart className={`h-5 w-5 ${liked ? 'fill-current' : ''}`} />
                  <span className="text-xs font-bold">{formatNumber(localLikesCount)}</span>
                </button>
                <button 
                  onClick={() => setShowComments(!showComments)}
                  className={`flex items-center gap-1.5 transition-colors ${showComments ? 'text-bento-accent' : 'text-bento-text-sub hover:text-bento-accent'}`}
                >
                  <MessageCircle className="h-5 w-5" />
                  <span className="text-xs font-bold">{comments.length > 0 ? formatNumber(comments.length) : ''}</span>
                </button>
                {!isAdmin && !isMyPost && (
                  <button 
                    onClick={() => {
                      setSelectedChatUser(post.authorId);
                      setActiveTab('messages');
                    }}
                    title="Direct Message"
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-bento-accent hover:bg-blue-100 transition-all font-bold text-[10px] uppercase tracking-tighter"
                  >
                    <Send className="h-3 w-3" />
                    <span>DM</span>
                  </button>
                )}
                <div className="flex items-center gap-1.5 text-bento-text-sub">
                  <Eye className="h-5 w-5" />
                  <span className="text-xs font-bold">{formatNumber(post.viewsCount || 0)}</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setShowRepostConfirm(true)}
                  className="flex items-center gap-1.5 text-bento-text-sub hover:text-green-500 transition-colors"
                >
                  <Repeat className="h-4 w-4" />
                </button>
                <button 
                  onClick={handleShare}
                  className="flex items-center gap-1.5 text-bento-text-sub hover:text-bento-accent transition-colors"
                >
                  <Share2 className="h-4 w-4" />
                </button>
              </div>

              {/* Post Action Dialogs */}
              <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <DialogContent className="rounded-3xl border-none shadow-2xl backdrop-blur-xl bg-white/90 dark:bg-zinc-900/90 sm:max-w-[400px]">
                  <DialogHeader>
                    <div className="h-12 w-12 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center mb-4">
                      <Trash2 className="h-6 w-6 text-red-600" />
                    </div>
                    <DialogTitle className="text-2xl font-black text-zinc-900 dark:text-white">Delete post?</DialogTitle>
                    <DialogDescription className="text-zinc-500 dark:text-zinc-400 font-medium text-base pt-2 leading-relaxed">
                      This action cannot be undone. This post will be permanently removed from NexiSphere.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter className="flex flex-row gap-3 mt-6">
                    <Button variant="ghost" className="flex-1 rounded-2xl h-12 font-bold cursor-pointer" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                    <Button className="flex-1 rounded-2xl h-12 font-bold bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20 cursor-pointer" onClick={handleDelete}>Delete</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={showRepostConfirm} onOpenChange={setShowRepostConfirm}>
                <DialogContent className="rounded-3xl border-none shadow-2xl backdrop-blur-xl bg-white/90 dark:bg-zinc-900/90 sm:max-w-[400px]">
                  <DialogHeader>
                    <div className="h-12 w-12 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-4">
                      <Repeat className="h-6 w-6 text-bento-accent" />
                    </div>
                    <DialogTitle className="text-2xl font-black text-zinc-900 dark:text-white">Repost this?</DialogTitle>
                    <DialogDescription className="text-zinc-500 dark:text-zinc-400 font-medium text-base pt-2 leading-relaxed">
                      Share this post with your followers on your own profile timeline.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter className="flex flex-row gap-3 mt-6">
                    <Button variant="ghost" className="flex-1 rounded-2xl h-12 font-bold cursor-pointer" onClick={() => setShowRepostConfirm(false)}>Cancel</Button>
                    <Button className="flex-1 rounded-2xl h-12 font-bold bg-bento-accent hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20 cursor-pointer" onClick={handleRepost}>Repost Now</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

           {showComments && (
             <div className="w-full mt-4 space-y-4 border-t border-bento-bg pt-4 animate-in fade-in slide-in-from-top-2 duration-300">
               <div className="flex gap-3">
                 <Avatar className="h-8 w-8">
                   <AvatarImage src={userProfile?.photoURL} />
                   <AvatarFallback className="text-[10px]">{userProfile?.displayName ? userProfile.displayName[0] : 'U'}</AvatarFallback>
                 </Avatar>
                 <div className="flex-1 flex gap-2">
                   <Input 
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                    placeholder="Write a comment..." 
                    className="rounded-xl bg-white border-bento-border h-10 text-xs" 
                   />
                   <Button onClick={handleAddComment} size="icon" className="h-10 w-10 rounded-xl bg-bento-accent hover:bg-blue-600"><Send className="h-3 w-3 text-white" /></Button>
                 </div>
               </div>
               
               <div className="space-y-4">
                 {comments.map(comment => (
                   <div key={comment.id} className="flex gap-3">
                     <Avatar className="h-7 w-7">
                       <AvatarImage src={comment.authorPhotoURL} />
                       <AvatarFallback className="text-[10px]">{comment.authorName[0]}</AvatarFallback>
                     </Avatar>
                     <div className="flex-1 bg-white p-3 rounded-2xl rounded-tl-none border border-zinc-100 shadow-sm">
                       <div className="flex justify-between items-center mb-1">
                         <span className="font-bold text-[11px]">{comment.authorName}</span>
                         <span className="text-[9px] text-zinc-400 font-medium uppercase tracking-wider">
                           {comment.createdAt ? formatDistanceToNow(comment.createdAt.toDate(), { addSuffix: true }) : 'Now'}
                         </span>
                       </div>
                       <p className="text-xs text-bento-text-main leading-snug">{comment.content}</p>
                     </div>
                   </div>
                 ))}
                 {comments.length === 0 && (
                   <div className="text-center py-4">
                     <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">No comments yet. Be the first!</p>
                   </div>
                 )}
               </div>
             </div>
           )}
        </CardFooter>
      </Card>
    </motion.div>
  );
}

interface NotificationItemProps {
  notification: SocialNotification;
  onRead: () => void;
  key?: React.Key;
}

function NotificationItem({ notification, onRead }: NotificationItemProps) {
  return (
    <Card 
      onClick={onRead}
      className={`rounded-2xl border-bento-border shadow-sm cursor-pointer transition-colors ${notification.isRead ? 'bg-zinc-50/50 opacity-60' : 'bg-white hover:bg-zinc-50'}`}
    >
      <div className="p-4 flex items-center gap-4">
        <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
          notification.type === 'message' ? 'bg-blue-100 text-bento-accent' : 'bg-purple-100 text-purple-600'
        }`}>
          {notification.type === 'message' ? <MessageSquare className="h-5 w-5" /> : <UserIcon className="h-5 w-5" />}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-bento-text-main">{notification.text}</p>
          <p className="text-[10px] uppercase font-bold text-bento-text-sub">
            {notification.createdAt ? formatDistanceToNow(notification.createdAt.toDate(), { addSuffix: true }) : 'Just now'}
          </p>
        </div>
        {!notification.isRead && <div className="h-2 w-2 bg-bento-accent rounded-full" />}
      </div>
    </Card>
  );
}
