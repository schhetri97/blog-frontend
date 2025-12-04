import React, { useState, useEffect } from 'react';
import './App.css';
import { 
  MessageSquare, User, PlusCircle, LogOut, FileImage, 
  Youtube, FileText, Send, Camera, ArrowLeft, Loader, AlertTriangle, Edit2, Check, X
} from 'lucide-react';

import { Amplify } from 'aws-amplify';
import { signIn, signUp, confirmSignUp, signOut, getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';
import { uploadData, getUrl } from 'aws-amplify/storage';

// --- 1. AWS CONFIGURATION ---
const CONFIG = {
  region: "us-east-1",
  userPoolId: "us-east-1_H0an9OqvV", 
  userPoolClientId: "3ra797d8odf24l9jlbuc6h04o0",
  identityPoolId: "us-east-1:6b3db9ae-94b3-40f1-b6f9-4527fdefcfeb",
  bucketName: "blog-media-assets", 
  apiUrl: "https://ha7fh2cfyc.execute-api.us-east-1.amazonaws.com/dev" 
};

// --- 2. AMPLIFY CONFIGURATION ---
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: CONFIG.userPoolId,
      userPoolClientId: CONFIG.userPoolClientId,
      identityPoolId: CONFIG.identityPoolId,
      allowGuestAccess: true
    }
  },
  Storage: {
    S3: {
      bucket: CONFIG.bucketName,
      region: CONFIG.region,
    }
  }
});

// --- 3. STORAGE HELPER ---
// Helper function to get signed URLs that works for both authenticated and guest users
const getSignedUrl = async (key) => {
  // Clean the key - remove any 'public/' prefix that might be stored in the database
  const cleanKey = key.replace(/^public\//, '');
  
  try {
    // First try guest access (works for unauthenticated users with blog-guest-role)
    // Amplify will automatically prefix with 'public/' for guest access level
    console.log(`Attempting guest access for key: ${cleanKey} (will be accessed as public/${cleanKey} in S3)`);
    const result = await getUrl({ 
      key: cleanKey, 
      options: { accessLevel: 'guest' } 
    });
    console.log(`Successfully got signed URL for key: ${cleanKey}`, result);
    // Convert URL object to string if needed (Amplify v6 returns URL object)
    const urlString = result.url instanceof URL ? result.url.href : (typeof result.url === 'string' ? result.url : String(result.url));
    console.log(`Converted URL to string: ${urlString}`);
    return urlString;
  } catch (guestError) {
    console.error(`Guest access failed for key: ${cleanKey}`, {
      error: guestError,
      message: guestError.message,
      name: guestError.name,
      stack: guestError.stack
    });
    throw new Error(`Failed to get signed URL: ${guestError.message || guestError}`);
  }
};

// --- 4. API HELPER ---
const apiCall = async (endpoint, method = 'GET', body = null) => {
  if (CONFIG.apiUrl.includes("YOUR_API_INVOKE_URL")) {
    console.log(`[Mock API Call] ${method} ${endpoint}`, body);
    if (endpoint === '/posts' && method === 'GET') {
      return [
        { 
          postId: '1', title: 'Welcome to the Preview', content: 'Configure the CONFIG object to connect to your backend.', 
          postType: 'text', timestamp: new Date().toISOString() 
        }
      ];
    }
    return {};
  }

  const headers = { 'Content-Type': 'application/json' };
  
  try {
    const session = await fetchAuthSession();
    if (session.tokens?.idToken) {
      headers['Authorization'] = session.tokens.idToken.toString();
    }
  } catch (e) {
    // User not logged in
  }

  try {
    const response = await fetch(`${CONFIG.apiUrl}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${response.status} - ${errorText}`);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  } catch (err) {
    console.error("API Call Failed:", err);
    throw err;
  }
};

// --- 5. COMPONENTS ---
const Navbar = ({ user, setView, handleLogout }) => (
  <nav className="w-full bg-slate-900 text-white p-4 shadow-lg sticky top-0 z-50">
    <div className="max-w-7xl mx-auto flex justify-between items-center">
      <div 
        className="text-xl font-bold cursor-pointer flex items-center gap-2" 
        onClick={() => setView('home')}
      >
        <span className="text-blue-400">λ</span> ServerlessBlog
      </div>
      <div className="flex gap-4 items-center">
        {user ? (
          <>
            <button 
              onClick={() => setView('create')} 
              className="flex items-center gap-2 hover:text-blue-300 transition"
            >
              <PlusCircle size={20} /> <span className="hidden sm:inline">New Post</span>
            </button>
            <button 
              onClick={() => setView('profile')} 
              className="flex items-center gap-2 hover:text-blue-300 transition"
            >
              <User size={20} /> <span className="hidden sm:inline">Profile</span>
            </button>
            <button 
              onClick={handleLogout} 
              className="flex items-center gap-2 hover:text-red-400 transition"
            >
              <LogOut size={20} />
            </button>
          </>
        ) : (
          <button 
            onClick={() => setView('login')} 
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-full font-medium transition"
          >
            Sign In
          </button>
        )}
      </div>
    </div>
  </nav>
);

// Helper component for author overlay (for images/videos)
const AuthorOverlay = ({ authorUsername, authorProfilePictureKey }) => {
  const [authorProfilePictureUrl, setAuthorProfilePictureUrl] = useState(null);

  useEffect(() => {
    if (authorProfilePictureKey) {
      getSignedUrl(authorProfilePictureKey)
      .then(url => setAuthorProfilePictureUrl(url))
      .catch(e => console.error("Error fetching author profile picture:", e));
    }
  }, [authorProfilePictureKey]);

  // Debug logging
  useEffect(() => {
    console.log('AuthorOverlay - authorUsername:', authorUsername, 'authorProfilePictureKey:', authorProfilePictureKey);
  }, [authorUsername, authorProfilePictureKey]);

  if (!authorUsername) {
    console.log('AuthorOverlay - Not rendering because authorUsername is missing');
    return null;
  }

  console.log('AuthorOverlay - Rendering with username:', authorUsername);

  return (
    <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5 text-white z-10">
      {authorProfilePictureUrl ? (
        <img 
          src={authorProfilePictureUrl} 
          alt={authorUsername}
          className="w-6 h-6 rounded-full object-cover border border-white/30"
        />
      ) : (
        <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
          <User size={14} className="text-white" />
        </div>
      )}
      <span className="text-sm font-medium">{authorUsername}</span>
    </div>
  );
};

// Helper component for inline author info (for text posts)
const AuthorInfoInline = ({ authorUsername, authorProfilePictureKey }) => {
  const [authorProfilePictureUrl, setAuthorProfilePictureUrl] = useState(null);

  useEffect(() => {
    if (authorProfilePictureKey) {
      getSignedUrl(authorProfilePictureKey)
      .then(url => setAuthorProfilePictureUrl(url))
      .catch(e => console.error("Error fetching author profile picture:", e));
    }
  }, [authorProfilePictureKey]);

  if (!authorUsername) return null;

  return (
    <div className="flex items-center gap-2">
      {authorProfilePictureUrl ? (
        <img 
          src={authorProfilePictureUrl} 
          alt={authorUsername}
          className="w-6 h-6 rounded-full object-cover border border-gray-200"
        />
      ) : (
        <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
          <User size={14} className="text-gray-500" />
        </div>
      )}
      <span className="text-sm font-medium text-gray-700">{authorUsername}</span>
    </div>
  );
};

// Helper component for comment items
const CommentItem = ({ comment, authorUsername, authorProfilePictureKey }) => {
  const [authorProfilePictureUrl, setAuthorProfilePictureUrl] = useState(null);

  useEffect(() => {
    if (authorProfilePictureKey) {
      getSignedUrl(authorProfilePictureKey)
      .then(url => setAuthorProfilePictureUrl(url))
      .catch(e => console.error("Error fetching comment author profile picture:", e));
    }
  }, [authorProfilePictureKey]);

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm">
      <div className="flex items-start gap-3 mb-2">
        {authorProfilePictureUrl ? (
          <img 
            src={authorProfilePictureUrl} 
            alt={authorUsername}
            className="w-8 h-8 rounded-full object-cover border border-gray-200 flex-shrink-0"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
            <User size={18} className="text-gray-500" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start mb-1">
            <span className="font-semibold text-slate-800">{authorUsername}</span>
            <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{new Date(comment.timestamp).toLocaleString()}</span>
          </div>
          <p className="text-gray-700 whitespace-pre-wrap">{comment.text}</p>
        </div>
      </div>
    </div>
  );
};

const PostCard = ({ post, onClick }) => {
  const [signedImageUrl, setSignedImageUrl] = useState(null);
  const [imageLoading, setImageLoading] = useState(true);

  // Extract author info from post (support multiple possible field names)
  // The backend now provides author information directly in the post response
  // Prioritize preferred_username over username
  const authorUsername = post.author?.preferred_username || post.authorUsername || post.author?.username || post.username;
  const authorProfilePictureKey = post.authorProfilePictureKey || post.author?.profile_picture_key || post.author?.['custom:profile_picture_key'] || post.author?.profile_picture_key;
  
  // Debug logging
  useEffect(() => {
    if (post.postId) {
      console.log('PostCard - Post ID:', post.postId);
      console.log('PostCard - Author Username:', authorUsername);
      console.log('PostCard - Author Profile Picture Key:', authorProfilePictureKey);
      console.log('PostCard - Post object:', {
        authorUsername: post.authorUsername,
        author: post.author,
        authorProfilePictureKey: post.authorProfilePictureKey,
        fullPost: post
      });
    }
  }, [post.postId, authorUsername, authorProfilePictureKey]);

  // Generate signed URL for private images
  useEffect(() => {
    if (post.postType === 'image' && post.mediaData?.imageUrl) {
      // Reset state when post changes
      setSignedImageUrl(null);
      setImageLoading(true);
      
      // If it's already a full URL, use it directly
      if (post.mediaData.imageUrl.startsWith('http')) {
        setSignedImageUrl(post.mediaData.imageUrl);
        setImageLoading(false);
      } else {
        // It's a key, generate signed URL
        const key = post.mediaData.imageUrl.replace('public/', ''); // Remove prefix if present
        getSignedUrl(key)
        .then(url => {
          console.log('Setting signed URL in state for post:', post.postId, 'URL:', url);
          setSignedImageUrl(url);
          setImageLoading(false);
        })
        .catch(e => {
          console.error("Error fetching post image signed URL for post:", post.postId, e);
          setImageLoading(false);
          setSignedImageUrl(null);
        });
      }
    } else {
      setImageLoading(false);
    }
  }, [post.postType, post.mediaData?.imageUrl, post.postId]);

  let mediaPreview = null;
  if (post.postType === 'image' && post.mediaData?.imageUrl) {
    mediaPreview = (
      <div className="h-48 overflow-hidden bg-gray-100 relative">
        {imageLoading ? (
          <div className="w-full h-full flex items-center justify-center bg-gray-200">
            <Loader className="animate-spin text-gray-400" size={24} />
          </div>
        ) : signedImageUrl ? (
          <>
            <img 
              src={signedImageUrl} 
              alt={post.title} 
              className="w-full h-full object-cover" 
              onLoad={() => {
                console.log('Image loaded successfully:', signedImageUrl);
              }}
              onError={(e) => {
                console.error('Image failed to load:', signedImageUrl, e);
                setImageLoading(false);
                setSignedImageUrl(null);
              }}
            />
            <AuthorOverlay 
              authorUsername={authorUsername}
              authorProfilePictureKey={authorProfilePictureKey}
            />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-200 text-gray-400 text-sm">
            Image unavailable
          </div>
        )}
      </div>
    );
  } else if (post.postType === 'video') {
    mediaPreview = (
      <div className="h-48 bg-gray-900 flex items-center justify-center text-white relative">
        <Youtube size={48} className="opacity-80" />
        <AuthorOverlay 
          authorUsername={authorUsername}
          authorProfilePictureKey={authorProfilePictureKey}
        />
      </div>
    );
  }

  return (
    <div 
      onClick={() => onClick(post.postId)} 
      className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition cursor-pointer mb-6"
    >
      {mediaPreview}
      <div className="p-5">
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
          <span className="bg-gray-100 px-2 py-1 rounded uppercase tracking-wider font-semibold">
            {post.postType || 'TEXT'}
          </span>
          <span>• {post.timestamp ? new Date(post.timestamp).toLocaleDateString() : 'Just now'}</span>
        </div>
        {authorUsername && (
          <div className="mb-3">
            <AuthorInfoInline 
              authorUsername={authorUsername}
              authorProfilePictureKey={authorProfilePictureKey}
            />
          </div>
        )}
        <h3 className="text-xl font-bold text-gray-900 mb-2">{post.title}</h3>
        <p className="text-gray-600 line-clamp-3">{post.content}</p>
      </div>
    </div>
  );
};

// --- 5. MAIN APP COMPONENT ---
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('home');
  const [posts, setPosts] = useState([]);
  const [activePost, setActivePost] = useState(null);
  const [activeComments, setActiveComments] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkAuth();
    fetchPosts();
  }, []);

  async function checkAuth() {
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    } catch (err) {
      setUser(null);
    }
  }

  async function fetchPosts() {
    setLoading(true);
    try {
      const data = await apiCall('/posts');
      const sorted = (Array.isArray(data) ? data : []).sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
      );
      setPosts(sorted);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await signOut();
    setUser(null);
    setView('home');
  }

  async function fetchComments(postId) {
    try {
      const data = await apiCall(`/posts/${postId}/comments`);
      setActiveComments(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    }
  }

  // 1. HOME VIEW
  const HomeView = () => (
    <div className="max-w-6xl mx-auto p-4">
      {(CONFIG.apiUrl.includes("YOUR_API_INVOKE_URL") || CONFIG.bucketName.includes("your-blog")) && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex gap-3 text-yellow-800 text-sm">
          <AlertTriangle className="flex-shrink-0" size={20} />
          <div>
            <strong>Configuration Needed:</strong> Update the CONFIG object with your API Gateway URL and S3 bucket name.
          </div>
        </div>
      )}

      <div className="mb-8 text-center py-10 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">A fully "serverless" platform powered by AWS Lambda </h1>
        <p className="text-slate-600">Group members: Saurav, Bhargavi, Vignesh, Shuvani</p>
      </div>
      
      {loading ? (
        <div className="flex justify-center p-10"><Loader className="animate-spin text-blue-600" /></div>
      ) : posts.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-gray-500 mb-4">No posts yet. Be the first to write one!</p>
          {user && (
            <button onClick={() => setView('create')} className="text-blue-600 font-semibold hover:underline">
              Create a Post
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {posts.map(post => (
            <PostCard 
              key={post.postId} 
              post={post} 
              onClick={(id) => {
                const selected = posts.find(p => p.postId === id);
                setActivePost(selected);
                fetchComments(id);
                setView('post');
              }} 
            />
          ))}
        </div>
      )}
    </div>
  );

  // 2. CREATE POST VIEW
  const CreatePostView = () => {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [type, setType] = useState('text');
    const [file, setFile] = useState(null);
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit() {
      if (!title || !content) return;
      
      setSubmitting(true);
      
      try {
        let imageUrl = null;
        let youtubeId = null;

        if (type === 'image' && file) {
          const uniqueKey = `posts/${Date.now()}-${file.name}`;
          await uploadData({
            key: uniqueKey,
            data: file,
            options: { accessLevel: 'guest' }
          }).result;
          // For private buckets, this URL won't work directly. 
          // We store the key so the frontend can generate a signed URL later.
          imageUrl = `public/${uniqueKey}`; 
        }

        if (type === 'video' && youtubeUrl) {
          const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
          const match = youtubeUrl.match(regExp);
          youtubeId = (match && match[2].length === 11) ? match[2] : null;
          if (!youtubeId) throw new Error("Invalid YouTube URL");
        }

        const body = {
          title,
          content,
          postType: type,
          mediaData: {
            imageUrl: imageUrl || undefined,
            youtubeId: youtubeId || undefined,
          }
        };

        await apiCall('/posts', 'POST', body);
        await fetchPosts();
        setView('home');
      } catch (err) {
        console.error("Error creating post:", err);
        alert("Error creating post: " + err.message);
      } finally {
        setSubmitting(false);
      }
    }

    return (
      <div className="max-w-4xl mx-auto p-4">
        <h2 className="text-2xl font-bold mb-6">Create New Post</h2>
        <div className="space-y-6">
          
          <div className="flex gap-4 mb-4">
            {['text', 'image', 'video'].map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`flex-1 py-3 rounded-lg border flex items-center justify-center gap-2 capitalize
                  ${type === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {t === 'text' && <FileText size={18} />}
                {t === 'image' && <FileImage size={18} />}
                {t === 'video' && <Youtube size={18} />}
                {t}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input 
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
              value={title} 
              onChange={e => setTitle(e.target.value)} 
              placeholder="Enter an engaging title"
            />
          </div>

          {type === 'image' && (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <input 
                type="file" 
                accept="image/*" 
                onChange={e => setFile(e.target.files[0])} 
                className="hidden" 
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer text-blue-600 hover:underline">
                {file ? file.name : "Click to upload an image"}
              </label>
            </div>
          )}

          {type === 'video' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">YouTube URL</label>
              <input 
                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                value={youtubeUrl} 
                onChange={e => setYoutubeUrl(e.target.value)} 
                placeholder="https://www.youtube.com/watch?v=..."
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Caption / Content</label>
            <textarea 
              rows={4}
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
              value={content} 
              onChange={e => setContent(e.target.value)} 
              placeholder="What's on your mind?"
            />
          </div>

          <button 
            onClick={handleSubmit}
            disabled={submitting || !title || !content}
            className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold hover:bg-slate-800 disabled:opacity-50 flex justify-center items-center gap-2"
          >
            {submitting ? (<><Loader size={20} className="animate-spin" /> Publishing...</>) : 'Publish Post'}
          </button>
          
          <button onClick={() => setView('home')} className="w-full text-gray-500 text-sm">Cancel</button>
        </div>
      </div>
    );
  };

  // 3. POST DETAIL VIEW
  const PostDetailView = () => {
    const [commentText, setCommentText] = useState('');
    const [signedImageUrl, setSignedImageUrl] = useState(null);
    const [authorProfilePictureUrl, setAuthorProfilePictureUrl] = useState(null);
    
    // Extract author info from post (support multiple possible field names)
    // The backend now provides author information directly in the post response
    // Prioritize preferred_username over username
    const authorUsername = activePost?.author?.preferred_username || activePost?.authorUsername || activePost?.author?.username || activePost?.username;
    const authorProfilePictureKey = activePost?.authorProfilePictureKey || activePost?.author?.profile_picture_key || activePost?.author?.['custom:profile_picture_key'] || activePost?.author?.profile_picture_key;
    
    useEffect(() => {
        // If the post has a private image key, fetch the signed URL
        if (activePost?.postType === 'image' && activePost.mediaData?.imageUrl && !activePost.mediaData.imageUrl.startsWith('http')) {
            const key = activePost.mediaData.imageUrl.replace('public/', ''); // Remove prefix if present
            getSignedUrl(key)
            .then(url => setSignedImageUrl(url))
            .catch(e => console.error("Error fetching post image", e));
        } else if (activePost?.mediaData?.imageUrl) {
            setSignedImageUrl(activePost.mediaData.imageUrl);
        }
    }, [activePost]);

    // Fetch author profile picture
    useEffect(() => {
      if (authorProfilePictureKey) {
        getSignedUrl(authorProfilePictureKey)
        .then(url => setAuthorProfilePictureUrl(url))
        .catch(e => console.error("Error fetching author profile picture:", e));
      }
    }, [authorProfilePictureKey]);

    if (!activePost) return null;

    async function handlePostComment() {
      if (!commentText.trim()) return;
      
      try {
        await apiCall(`/posts/${activePost.postId}/comments`, 'POST', { text: commentText });
        setCommentText('');
        fetchComments(activePost.postId);
      } catch (err) {
        console.error("Failed to post comment:", err);
        alert("Failed to post comment. Ensure you are logged in.");
      }
    }

    return (
      <div className="max-w-6xl mx-auto p-4">
        <button onClick={() => setView('home')} className="flex items-center text-gray-500 mb-4 hover:text-blue-600">
          <ArrowLeft size={18} className="mr-1" /> Back to Feed
        </button>

        <article className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-8">
          {activePost.postType === 'image' && signedImageUrl && (
            <div className="relative">
              <img src={signedImageUrl} alt={activePost.title} className="w-full max-h-[500px] object-contain bg-black" />
              {authorUsername && (
                <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5 text-white">
                  {authorProfilePictureUrl ? (
                    <img 
                      src={authorProfilePictureUrl} 
                      alt={authorUsername}
                      className="w-7 h-7 rounded-full object-cover border border-white/30"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                      <User size={16} className="text-white" />
                    </div>
                  )}
                  <span className="text-sm font-medium">{authorUsername}</span>
                </div>
              )}
            </div>
          )}
          {activePost.postType === 'video' && activePost.mediaData?.youtubeId && (
            <div className="aspect-video w-full relative">
              <iframe 
                className="w-full h-full"
                src={`https://www.youtube.com/embed/${activePost.mediaData.youtubeId}`} 
                title="YouTube video player" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                allowFullScreen
              ></iframe>
              {authorUsername && (
                <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5 text-white z-10">
                  {authorProfilePictureUrl ? (
                    <img 
                      src={authorProfilePictureUrl} 
                      alt={authorUsername}
                      className="w-7 h-7 rounded-full object-cover border border-white/30"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                      <User size={16} className="text-white" />
                    </div>
                  )}
                  <span className="text-sm font-medium">{authorUsername}</span>
                </div>
              )}
            </div>
          )}

          <div className="p-8">
            {authorUsername && (activePost.postType === 'text' || !activePost.postType) && (
              <div className="flex items-center gap-2 mb-4">
                {authorProfilePictureUrl ? (
                  <img 
                    src={authorProfilePictureUrl} 
                    alt={authorUsername}
                    className="w-8 h-8 rounded-full object-cover border border-gray-200"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                    <User size={18} className="text-gray-500" />
                  </div>
                )}
                <span className="text-base font-medium text-gray-700">{authorUsername}</span>
              </div>
            )}
            <h1 className="text-3xl font-bold text-gray-900 mb-4">{activePost.title}</h1>
            <p className="text-lg text-gray-700 leading-relaxed whitespace-pre-wrap">{activePost.content}</p>
            <div className="mt-6 pt-6 border-t text-sm text-gray-500">
              Posted on {activePost.timestamp ? new Date(activePost.timestamp).toLocaleString() : 'Recently'}
            </div>
          </div>
        </article>

        <section className="bg-slate-50 rounded-xl p-6">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
            <MessageSquare size={20} /> Comments
          </h3>
          
          <div className="space-y-4 mb-8">
            {activeComments.length === 0 ? (
              <p className="text-gray-500 italic">No comments yet.</p>
            ) : (
              activeComments.map(c => {
                // Extract author info from comment (prioritize preferred_username)
                const commentAuthorUsername = c.author?.preferred_username || c.authorUsername || c.author?.username || c.username || 'Anonymous';
                const commentAuthorProfilePictureKey = c.authorProfilePictureKey || c.author?.profile_picture_key;
                
                return (
                  <CommentItem 
                    key={c.commentId}
                    comment={c}
                    authorUsername={commentAuthorUsername}
                    authorProfilePictureKey={commentAuthorProfilePictureKey}
                  />
                );
              })
            )}
          </div>

          {user ? (
            <div className="flex gap-2">
              <input
                className="flex-1 p-3 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Write a comment..."
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handlePostComment()}
              />
              <button onClick={handlePostComment} className="bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700">
                <Send size={20} />
              </button>
            </div>
          ) : (
            <div className="text-center p-4 bg-blue-100 rounded-lg text-blue-800">
              Please <button onClick={() => setView('login')} className="underline font-bold">sign in</button> to comment.
            </div>
          )}
        </section>
      </div>
    );
  };

  // 4. PROFILE VIEW
  const ProfileView = () => {
    const [uploading, setUploading] = useState(false);
    const [isEditingUsername, setIsEditingUsername] = useState(false);
    const [preferredUsername, setPreferredUsername] = useState(user?.username || '');
    const [savingUsername, setSavingUsername] = useState(false);
    const [profilePreferredUsername, setProfilePreferredUsername] = useState(user?.username || '');
    // State for the resolved signed URL of the profile picture
    const [profilePictureUrl, setProfilePictureUrl] = useState(null);

    // Fetch profile data on mount
    useEffect(() => {
      async function fetchProfile() {
        let profile = null;
        let pictureKey = null;
        
        // Try to fetch from API first
        try {
          profile = await apiCall('/profile', 'GET');
          console.log('Profile data from API:', profile);
          
          // Handle Username from API
          if (profile?.preferred_username) {
            setProfilePreferredUsername(profile.preferred_username);
            setPreferredUsername(profile.preferred_username);
          } else if (profile?.preferredUsername) {
            setProfilePreferredUsername(profile.preferredUsername);
            setPreferredUsername(profile.preferredUsername);
          } else if (profile?.username) {
            setProfilePreferredUsername(profile.username);
            setPreferredUsername(profile.username);
          }

          // Try to get profile picture key from API response
          pictureKey = profile?.['custom:profile_picture_key'] || 
                      profile?.profile_picture_key ||
                      profile?.attributes?.['custom:profile_picture_key'] ||
                      profile?.attributes?.profile_picture_key;
        } catch (err) {
          console.warn("Failed to fetch profile from API (CORS or server error):", err.message);
          // Continue to try Cognito fallback below
        }

        // Fallback: Try to get profile picture key from Cognito user attributes directly
        if (!pictureKey && user?.attributes) {
          pictureKey = user.attributes['custom:profile_picture_key'] || 
                      user.attributes.profile_picture_key;
          console.log('Using profile picture key from Cognito user attributes:', pictureKey);
        }

        // If we still don't have a preferred username from API, use Cognito username as fallback
        if (!profile && user?.username) {
          setProfilePreferredUsername(user.username);
          setPreferredUsername(user.username);
        }

        // Generate signed URL for profile picture if we have a key
        if (pictureKey) {
          try {
            const url = await getSignedUrl(pictureKey);
            console.log('Signed URL generated:', url);
            setProfilePictureUrl(url);
          } catch (urlErr) {
            console.error("Error signing profile URL:", urlErr);
          }
        } else {
          console.log('No profile picture key found');
        }
      }
      
      if (user) {
        fetchProfile();
      }
    }, [user]);

    async function handleAvatarUpload(e) {
      const file = e.target.files[0];
      if (!file) return;
      setUploading(true);

      try {
        const fileExtension = file.name.split('.').pop();
        // Define the S3 Key
        const key = `profiles/${user.userId}/avatar.${fileExtension}`;
        
        // Upload to S3 (using 'guest' access level)
        await uploadData({
          key,
          data: file,
          options: { accessLevel: 'guest' }
        }).result;

        // Get the new signed URL for immediate display (do this first so user sees the image)
        const url = await getSignedUrl(key);
        setProfilePictureUrl(url);

        // Try to update the backend with the KEY (non-blocking - if it fails, image still shows)
        try {
          await apiCall('/profile', 'PUT', { profile_picture_key: key });
          alert("Profile picture updated successfully!");
        } catch (apiErr) {
          console.warn("Profile picture uploaded to S3, but failed to update backend:", apiErr);
          // Still show success since the image is uploaded and visible
          alert("Profile picture uploaded! (Note: Backend update failed - image may not persist after refresh. Please check CORS configuration.)");
        }
      } catch (err) {
        console.error("Upload failed:", err);
        // Check if it's an S3 upload error or API error
        if (err.message?.includes('Failed to fetch') || err.message?.includes('CORS')) {
          alert("Upload failed: CORS error. The image may have uploaded to S3, but couldn't update the backend. Please check your API Gateway CORS configuration.");
        } else {
          alert("Upload failed: " + err.message);
        }
      } finally {
        setUploading(false);
      }
    }

    async function handleUsernameSave() {
      if (!preferredUsername.trim()) {
        alert("Preferred username cannot be empty");
        return;
      }
      
      if (preferredUsername === profilePreferredUsername) {
        setIsEditingUsername(false);
        return;
      }

      setSavingUsername(true);
      try {
        await apiCall('/profile', 'PUT', { preferredUsername: preferredUsername.trim() });
        setProfilePreferredUsername(preferredUsername.trim());
        setIsEditingUsername(false);
        alert("Preferred username updated successfully!");
      } catch (err) {
        console.error("Failed to update preferred username:", err);
        alert("Failed to update preferred username: " + err.message);
        setPreferredUsername(profilePreferredUsername); // Revert on error
      } finally {
        setSavingUsername(false);
      }
    }

    function handleUsernameCancel() {
      setPreferredUsername(profilePreferredUsername);
      setIsEditingUsername(false);
    }

    return (
      <div className="max-w-2xl mx-auto p-6 bg-white mt-10 rounded-xl shadow-lg text-center">
        <h2 className="text-2xl font-bold mb-6">Your Profile</h2>
        <div className="relative inline-block mb-6 group">
          <div className="w-32 h-32 rounded-full bg-gray-200 overflow-hidden mx-auto border-4 border-white shadow-md flex items-center justify-center">
            {profilePictureUrl ? (
                <img src={profilePictureUrl} alt="Profile" className="w-full h-full object-cover" />
            ) : (
                <User size={64} className="w-full h-full p-6 text-gray-400" />
            )}
          </div>
          <label className="absolute bottom-0 right-0 bg-blue-600 text-white p-2 rounded-full cursor-pointer hover:bg-blue-700 transition shadow-sm">
            {uploading ? <Loader size={16} className="animate-spin" /> : <Camera size={16} />}
            <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={uploading} />
          </label>
        </div>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Preferred Username</label>
          {isEditingUsername ? (
            <div className="flex items-center justify-center gap-2">
              <input
                type="text"
                value={preferredUsername}
                onChange={(e) => setPreferredUsername(e.target.value)}
                className="text-lg font-medium text-gray-900 border border-blue-500 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={savingUsername}
                autoFocus
                placeholder="Enter preferred username"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') handleUsernameSave();
                  if (e.key === 'Escape') handleUsernameCancel();
                }}
              />
              <button
                onClick={handleUsernameSave}
                disabled={savingUsername}
                className="text-green-600 hover:text-green-700 p-1 disabled:opacity-50"
              >
                {savingUsername ? <Loader size={18} className="animate-spin" /> : <Check size={18} />}
              </button>
              <button
                onClick={handleUsernameCancel}
                disabled={savingUsername}
                className="text-red-600 hover:text-red-700 p-1 disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <p className="text-lg font-medium text-gray-900">{profilePreferredUsername}</p>
              <button
                onClick={() => setIsEditingUsername(true)}
                className="text-blue-600 hover:text-blue-700 p-1"
                title="Edit preferred username"
              >
                <Edit2 size={18} />
              </button>
            </div>
          )}
        </div>
        
        <p className="text-gray-500 mb-6">{user?.signInDetails?.loginId}</p>
        <button onClick={() => setView('home')} className="text-blue-600 hover:underline">Back to Home</button>
      </div>
    );
  };

  // 5. AUTH VIEW
  const AuthView = ({ isRegister }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');
    const [step, setStep] = useState(isRegister ? 'register' : 'login');

    async function handleAuth() {
      try {
        if (step === 'login') {
          await signIn({ username: email, password });
          checkAuth();
          setView('home');
        } else if (step === 'register') {
          // FIX: Use UUID for username to support email alias
          const uniqueUsername = crypto.randomUUID();
          await signUp({ 
            username: uniqueUsername, 
            password, 
            options: { userAttributes: { email } } 
          });
          // Store username for confirmation step
          localStorage.setItem('pendingUsername', uniqueUsername);
          setStep('confirm');
        } else if (step === 'confirm') {
          const pendingUsername = localStorage.getItem('pendingUsername') || email;
          await confirmSignUp({ username: pendingUsername, confirmationCode: code });
          localStorage.removeItem('pendingUsername');
          setStep('login');
          alert("Account confirmed! Please log in.");
        }
      } catch (err) {
        console.error("Auth Error:", err);
        alert("Auth Error: " + err.message);
      }
    }

    return (
      <div className="max-w-lg mx-auto mt-20 p-8 bg-white rounded-2xl shadow-xl">
        <h2 className="text-3xl font-bold mb-6 text-center text-slate-800">
          {step === 'login' ? 'Welcome Back' : step === 'register' ? 'Create Account' : 'Confirm Email'}
        </h2>
        
        <div className="space-y-4">
          {step !== 'confirm' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input 
                  type="email"
                  className="w-full p-3 border rounded-lg outline-none focus:border-blue-500"
                  value={email} onChange={e => setEmail(e.target.value)} 
                  onKeyPress={e => e.key === 'Enter' && handleAuth()}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input 
                  type="password"
                  className="w-full p-3 border rounded-lg outline-none focus:border-blue-500"
                  value={password} onChange={e => setPassword(e.target.value)} 
                  onKeyPress={e => e.key === 'Enter' && handleAuth()}
                />
              </div>
            </>
          )}

          {step === 'confirm' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirmation Code</label>
              <input 
                type="text"
                className="w-full p-3 border rounded-lg outline-none focus:border-blue-500"
                value={code} onChange={e => setCode(e.target.value)} 
                placeholder="Check your email"
                onKeyPress={e => e.key === 'Enter' && handleAuth()}
              />
            </div>
          )}

          <button onClick={handleAuth} className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition">
            {step === 'login' ? 'Sign In' : step === 'register' ? 'Sign Up' : 'Verify'}
          </button>
        </div>

        <div className="mt-6 text-center text-sm text-gray-600">
          {step === 'login' ? (
            <p>Don't have an account? <button onClick={() => setStep('register')} className="text-blue-600 font-bold">Sign Up</button></p>
          ) : (
            <p>Already have an account? <button onClick={() => setStep('login')} className="text-blue-600 font-bold">Log In</button></p>
          )}
        </div>
        <button onClick={() => setView('home')} className="block w-full text-center mt-4 text-gray-400 text-sm hover:text-gray-600">Cancel</button>
      </div>
    );
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 font-sans text-slate-900 m-0 p-0">
      <Navbar user={user} setView={setView} handleLogout={handleLogout} />
      
      <main className="w-full pb-20 m-0 p-0">
        {view === 'home' && <HomeView />}
        {view === 'create' && (user ? <CreatePostView /> : <AuthView />)}
        {view === 'post' && <PostDetailView />}
        {view === 'profile' && (user ? <ProfileView /> : <AuthView />)}
        {view === 'login' && <AuthView isRegister={false} />}
        {view === 'register' && <AuthView isRegister={true} />}
      </main>
    </div>
  );
}