import * as React from 'react';
import { auth, getGoogleProvider, db } from './lib/firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { UserProfile, getProfile, updateProfile, followUser, unfollowUser, isFollowing, searchProfiles, getFollowers, getFollowing, getProfilesByIds } from './lib/social';
import { FeedPost, createPost, subscribeToPosts, createComment, subscribeToComments, deletePost, updatePost, togglePinPost, FeedComment, incrementPostView } from './lib/feed';
import { SocialNotification, subscribeToNotifications, markNotificationAsRead } from './lib/notifications';
import { ChatMessage, sendMessage, subscribeToMessages } from './lib/feed';
import { User as UserIcon, Home, MessageSquare, Bell, Settings, LogOut, Plus, Search, Heart, Share2, Send, CheckCircle2, MapPin, Mail, MoreHorizontal, Image as ImageIcon, ArrowLeft, Trash2, ShieldCheck, MessageCircle, Pin, Sparkles, Filter, History, Eye, Repeat, Edit } from 'lucide-react';
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
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { useTheme } from 'next-themes';
import { uploadMedia } from './lib/storage';

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
  const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = React.useState('');
  
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
          } else {
            console.log('Profile found:', p);
            if (isDefaultAdmin && !p.isAdmin) {
              console.log('Auto-booting admin status...');
              await updateProfile(user.uid, { isAdmin: true });
              p = { ...p, isAdmin: true };
            }
          }
          setProfile(p);
          
          // Setup realtime listener for profile to update followers/following accurately
          unsubProfile = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
            if (docSnap.exists()) {
              setProfile(docSnap.data() as UserProfile);
            }
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
    if (!user) return;
    const unsubPosts = subscribeToPosts(setPosts);
    const unsubNotifs = subscribeToNotifications(user.uid, setNotifications);
    return () => {
      unsubPosts();
      unsubNotifs();
    };
  }, [user]);

  React.useEffect(() => {
    if (!user || !selectedChatUser) return;
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
      await createPost({
        content: newPostContent,
        authorId: profile.uid,
        authorName: profile.displayName,
        authorPhotoURL: profile.photoURL,
        authorIsAdmin: !!profile.isAdmin,
        mediaURL: newPostMediaURL || undefined
      });
      setNewPostContent('');
      setNewPostMediaURL('');
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
    if (!user || !selectedChatUser || !newMessage.trim()) return;
    try {
      await sendMessage({
        text: newMessage,
        senderId: user.uid,
        receiverId: selectedChatUser
      }, profile?.displayName || 'Someone');
      setNewMessage('');
    } catch (e) {
      toast.error('Failed to send message.');
    }
  };

  const handleSearch = async (val: string) => {
    setSearchQuery(val);
    if (val.length > 2) {
      const results = await searchProfiles(val);
      setSearchResults(results);
    } else {
      setSearchResults([]);
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
                          <div className="relative rounded-xl overflow-hidden border border-bento-border bg-bento-bg group">
                            <img 
                              src={newPostMediaURL} 
                              alt="Upload preview" 
                              className="w-full h-auto max-h-[300px] object-cover"
                              referrerPolicy="no-referrer"
                            />
                            <Button 
                              variant="destructive" 
                              size="icon" 
                              onClick={() => {
                                setNewPostMediaURL('');
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
                          <p className="text-xs text-bento-text-sub text-center py-4">Recent conversations will appear here.</p>
                          {/* We could potentially fetch some message previews here */}
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
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 h-5 w-5" />
                  <Input 
                    placeholder="Search people by username" 
                    className="pl-12 py-6 rounded-2xl bg-white border-zinc-200"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                  />
                </div>

                {searchResults.length > 0 && (
                  <div className="grid grid-cols-1 gap-3">
                    {searchResults.map(result => (
                      <Card 
                        key={result.uid} 
                        className="rounded-2xl border-bento-border p-4 flex items-center justify-between cursor-pointer hover:bg-zinc-50 transition-colors bg-white shadow-sm"
                        onClick={() => navigateTo('visit-profile', result.uid)}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 border border-zinc-100">
                            <AvatarImage src={result.photoURL} />
                            <AvatarFallback className="font-bold">{result.displayName[0]}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-bold text-sm text-bento-text-main">{result.displayName}</p>
                            <p className="text-[10px] uppercase font-bold text-bento-text-sub">@{result.username}</p>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" className="rounded-xl text-bento-accent hover:text-blue-600 hover:bg-blue-50">View Profile</Button>
                      </Card>
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
                className="h-[calc(100vh-140px)] flex flex-col"
              >
                <div className="flex gap-4 h-full">
                  {!selectedChatUser ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 bg-white border border-bento-border rounded-[24px]">
                      <div className="h-16 w-16 bg-bento-bg rounded-full flex items-center justify-center">
                        <MessageSquare className="text-bento-accent h-8 w-8" />
                      </div>
                      <div className="space-y-1 px-4 text-bento-text-main">
                        <h3 className="font-bold text-xl">Select a message</h3>
                        <p className="text-bento-text-sub text-sm">Choose from your existing conversations or start a new one.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col bg-white rounded-[24px] border border-bento-border overflow-hidden shadow-sm">
                      <div className="p-5 border-b border-bento-bg flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 border border-bento-border">
                            <AvatarFallback>?</AvatarFallback>
                          </Avatar>
                          <h3 className="font-bold text-bento-text-main">Chatting with User</h3>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => setSelectedChatUser(null)} className="rounded-xl"><LogOut className="h-4 w-4" /></Button>
                      </div>
                      <ScrollArea className="flex-1 p-5 bg-zinc-50/20">
                        <div className="space-y-4">
                          {chatMessages.map(m => (
                            <div key={m.id} className={`flex ${m.senderId === user.uid ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[75%] rounded-[18px] px-4 py-2.5 text-sm font-medium shadow-sm transition-transform hover:scale-[1.01] ${
                                m.senderId === user.uid 
                                  ? 'bg-bento-accent text-white rounded-tr-none' 
                                  : 'bg-white border border-bento-border text-bento-text-main rounded-tl-none'
                              }`}>
                                {m.text}
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                      <div className="p-5 bg-white border-t border-bento-bg flex gap-3">
                        <Input 
                          placeholder="Type a message..." 
                          className="rounded-xl bg-bento-bg border-none focus:ring-1 focus:ring-bento-accent"
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                        />
                        <Button onClick={handleSendMessage} size="icon" className="rounded-xl bg-bento-accent hover:bg-blue-600 text-white shadow-md shadow-blue-500/10"><Send className="h-4 w-4" /></Button>
                      </div>
                    </div>
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
                  <ShieldCheck className="h-12 w-12 text-amber-500" />
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
                                <Button 
                                  variant="destructive" 
                                  size="sm" 
                                  className="rounded-xl h-8 text-[10px] font-bold uppercase tracking-widest gap-2"
                                  onClick={() => handleDeletePost(post.id)}
                                >
                                  <Plus className="h-3 w-3 rotate-45" /> Remove Post
                                </Button>
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
                          {(viewedProfile.isAdmin || viewedProfile.uid === 'T_r_u_s_t_e_d_A_d_m_i_n' || viewedProfile.email?.toLowerCase() === 'ahfahimsylhet@gmail.com') && (
                            <Badge variant="default" className="bg-amber-500 hover:bg-amber-600 font-bold border-none text-white text-[10px]">ADMIN</Badge>
                          )}
                        </h2>
                        <p className="text-bento-text-sub font-medium">@{viewedProfile.username}</p>
                      </div>
                      <div className="flex gap-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="rounded-xl border border-bento-border">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
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
                        <span className="font-extrabold">{viewedProfile.followersCount || 0}</span> <span className="text-bento-text-sub">Followers</span>
                      </button>
                      <button 
                        onClick={() => openFollowModal(viewedProfile.uid, 'Following')}
                        className="hover:bg-zinc-100 dark:hover:bg-zinc-800 px-3 py-1.5 rounded-xl transition-all text-left text-sm cursor-pointer"
                      >
                        <span className="font-extrabold">{viewedProfile.followingCount || 0}</span> <span className="text-bento-text-sub">Following</span>
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
                          {(profile?.isAdmin || isUserAdmin) && <Badge variant="default" className="bg-amber-500 hover:bg-amber-600 font-bold border-none text-white text-[10px]">ADMIN</Badge>}
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
                        <span className="font-extrabold">{profile?.followersCount || 0}</span> <span className="text-bento-text-sub">Followers</span>
                      </button>
                      <button 
                        onClick={() => profile && openFollowModal(profile.uid, 'Following')}
                        className="hover:bg-zinc-100 dark:hover:bg-zinc-800 px-3 py-1.5 rounded-xl transition-all text-left text-sm cursor-pointer"
                      >
                        <span className="font-extrabold">{profile?.followingCount || 0}</span> <span className="text-bento-text-sub">Following</span>
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
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-8"
              >
                <div className="flex justify-between items-center">
                  <h2 className="text-3xl font-bold text-bento-text-main">Settings</h2>
                  <Button 
                    className="rounded-xl px-10 bg-bento-accent text-white hover:bg-blue-600 shadow-md shadow-blue-500/10 font-bold h-12"
                    onClick={handleUpdateProfile}
                  >
                    Save All Changes
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <section className="space-y-6 bg-white dark:bg-bento-card border border-bento-border rounded-[24px] p-8 shadow-sm">
                    <h3 className="font-bold text-bento-text-sub uppercase text-[10px] tracking-widest border-b border-bento-bg dark:border-zinc-800 pb-2 flex items-center gap-2">
                       <UserIcon className="h-3 w-3" /> Profile Configuration
                    </h3>
                    <div className="space-y-5">
                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase tracking-wider text-bento-text-sub">Full Name</label>
                          <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="rounded-xl bg-bento-bg dark:bg-zinc-800 border-none h-12 dark:text-white" placeholder="Your name" />
                        </div>
                        <div className="space-y-4">
                          <label className="text-xs font-bold uppercase tracking-wider text-bento-text-sub">Profile Picture</label>
                          <div className="flex items-center gap-4">
                            <Avatar className="h-20 w-20 border-2 border-bento-border shadow-md">
                              <AvatarImage src={editPhoto} />
                              <AvatarFallback className="text-xl font-bold">{editName[0] || 'U'}</AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col gap-2">
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="rounded-xl font-bold h-10 px-6 border-bento-border hover:bg-zinc-50 dark:hover:bg-zinc-800"
                                onClick={() => profileFileInputRef.current?.click()}
                                disabled={isUploadingProfile}
                              >
                                {isUploadingProfile ? 'Uploading...' : 'Change Photo'}
                              </Button>
                              <p className="text-[10px] text-zinc-400 font-medium">Clear, square photos work best.</p>
                            </div>
                            <input 
                              type="file" 
                              ref={profileFileInputRef} 
                              className="hidden" 
                              accept="image/*" 
                              onChange={handleProfileFileChange} 
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-bento-text-sub">Manual Photo URL</label>
                            <Input value={editPhoto} onChange={(e) => setEditPhoto(e.target.value)} className="rounded-xl bg-bento-bg dark:bg-zinc-800 border-none h-12 dark:text-white" placeholder="https://image-url.com" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase tracking-wider text-bento-text-sub">Bio</label>
                          <textarea 
                            className="w-full rounded-xl border-none bg-bento-bg dark:bg-zinc-800 p-4 min-h-[120px] text-sm focus:ring-1 focus:ring-bento-accent dark:text-white" 
                            placeholder="Tell the world about yourself..." 
                            value={editBio}
                            onChange={(e) => setEditBio(e.target.value)}
                          />
                        </div>
                    </div>
                  </section>

                  <div className="space-y-8">
                    <section className="space-y-6 bg-white dark:bg-bento-card border border-bento-border rounded-[24px] p-8 shadow-sm">
                      <h3 className="font-bold text-bento-text-sub uppercase text-[10px] tracking-widest border-b border-bento-bg dark:border-zinc-800 pb-2 flex items-center gap-2">
                         <Search className="h-3 w-3" /> Contact & Location
                      </h3>
                      <div className="space-y-5">
                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-bento-text-sub">Address</label>
                            <Input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} className="rounded-xl bg-bento-bg dark:bg-zinc-800 border-none h-12 dark:text-white" placeholder="Street, Apartment" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-bento-text-sub">Location</label>
                            <Input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} className="rounded-xl bg-bento-bg dark:bg-zinc-800 border-none h-12 dark:text-white" placeholder="City, Country" />
                          </div>
                      </div>
                    </section>

                    {isUserAdmin && (
                      <section className="space-y-4 bg-white dark:bg-zinc-900 border border-amber-200 dark:border-amber-900/50 rounded-[24px] p-8 shadow-sm">
                        <h3 className="font-bold text-amber-600 dark:text-amber-400 uppercase text-[10px] tracking-widest border-b border-amber-100 dark:border-amber-900/30 pb-2 flex items-center gap-2">
                           <ShieldCheck className="h-3 w-3" /> Master Admin Controls
                        </h3>
                        <div className="flex items-center justify-between">
                          <div>
                             <p className="font-bold text-bento-text-main dark:text-white">Admin Privileges</p>
                             <p className="text-[10px] text-bento-text-sub font-semibold">Toggle administrative dashboard access.</p>
                          </div>
                          <Button 
                            variant={profile?.isAdmin ? "destructive" : "default"}
                            size="sm" 
                            className={`rounded-xl font-bold h-10 px-6 ${!profile?.isAdmin ? 'bg-amber-500 hover:bg-amber-600 border-none' : ''}`}
                            onClick={toggleAdminMode}
                          >
                             {profile?.isAdmin ? 'Disable Access' : 'Enable Access'}
                          </Button>
                        </div>
                      </section>
                    )}
                  </div>
                </div>

                <section className="space-y-4">
                   <h3 className="font-bold text-bento-text-sub uppercase text-[10px] tracking-widest pl-2">Privacy Settings</h3>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center justify-between p-6 bg-white border border-bento-border rounded-[24px] shadow-sm">
                         <div>
                            <p className="font-bold text-bento-text-main">Show Email on Profile</p>
                            <p className="text-[10px] text-bento-text-sub font-semibold">Make your gmail address visible to others.</p>
                         </div>
                         <button 
                          onClick={() => setPrivacyEmail(!privacyEmail)}
                          className={`h-6 w-11 rounded-full transition-colors relative ${privacyEmail ? 'bg-bento-accent' : 'bg-zinc-200'}`}
                         >
                            <div className={`absolute top-1 h-4 w-4 bg-white rounded-full transition-all ${privacyEmail ? 'right-1' : 'left-1'}`} />
                         </button>
                      </div>
                      <div className="flex items-center justify-between p-6 bg-white border border-bento-border rounded-[24px] shadow-sm">
                         <div>
                            <p className="font-bold text-bento-text-main">Account Visibility</p>
                            <p className="text-[10px] text-bento-text-sub font-semibold">Public accounts are visible to everyone.</p>
                         </div>
                         <div className="h-6 w-11 bg-bento-accent rounded-full opacity-50 cursor-not-allowed relative">
                            <div className="absolute top-1 right-1 h-4 w-4 bg-white rounded-full" />
                         </div>
                      </div>
                   </div>
                </section>

                <Button variant="ghost" className="w-full justify-start text-red-600 p-6 rounded-[24px] hover:bg-red-50 border border-transparent hover:border-red-100 transition-all" onClick={handleLogout}>
                   <LogOut className="h-5 w-5 mr-3" />
                   <span className="font-bold uppercase tracking-wider text-xs">Sign Out</span>
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </main>

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
    const shareData = {
      title: 'NexiSphere Post',
      text: post.content,
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        toast.success('Shared successfully');
      } else {
        await navigator.clipboard.writeText(window.location.href);
        toast.success('Link copied to clipboard');
      }
    } catch (err) {
      toast.error('Could not share');
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
                    <DropdownMenuItem 
                      onClick={handleTogglePin}
                      className="text-xs font-bold uppercase tracking-widest p-3 rounded-xl cursor-pointer text-bento-accent"
                    >
                      <Pin className="h-4 w-4 mr-2" />
                      {post.isPinned ? 'Unpin Post' : 'Pin to Top'}
                    </DropdownMenuItem>
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
            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
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
                  <img 
                    src={post.mediaURL} 
                    alt="Post content" 
                    className="w-full h-full object-cover"
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                    referrerPolicy="no-referrer"
                  />
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
                  <span className="text-xs font-bold">{localLikesCount}</span>
                </button>
                <button 
                  onClick={() => setShowComments(!showComments)}
                  className={`flex items-center gap-1.5 transition-colors ${showComments ? 'text-bento-accent' : 'text-bento-text-sub hover:text-bento-accent'}`}
                >
                  <MessageCircle className="h-5 w-5" />
                  <span className="text-xs font-bold">{comments.length > 0 ? comments.length : ''}</span>
                </button>
                <div className="flex items-center gap-1.5 text-bento-text-sub">
                  <Eye className="h-5 w-5" />
                  <span className="text-xs font-bold">{post.viewsCount || 0}</span>
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
