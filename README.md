# WhatsApp Clone Backend

A complete, production-ready backend for **CHATTERBOX, a WhatsApp clone application built with Node.js, Express, MongoDB, and Socket.IO.

## 🚀 Features

- **User Authentication**: Register, login, JWT tokens
- **Real-time Messaging**: Socket.IO for live chat
- **Private & Group Chats**: Create and manage conversations
- **Message Management**: Send, edit, delete messages
- **Media Posting**: Upload images, videos, audio, documents
- **Voice & Video Calling**: WebRTC-based calling system
- **User Profiles**: Update status, search users
- **Security**: Rate limiting, input validation, CORS
- **MongoDB Integration**: Your existing Atlas connection

## ✅ What's New (Updated)

- **Google Sign-In support** via `POST /api/auth/google`. If a user first signs up with the default password `abc123` and phone `+12377773233`, the backend flags the account as a Google/Firebase signup and allows passwordless Google logins using email.
- **Account deletion** with `DELETE /api/users/me` (permanent).
- **Full user info return**: user responses now include full profile details including the hashed `password` and `phoneNumber` as requested.
- **Email-based password reset**: `POST /api/auth/forgot-password` sends a 6-digit code to email; `POST /api/auth/reset-password` resets using `{ email, code, password }`.
- **Phone verification**: `POST /api/users/phone/verify/send-code` sends a 6-digit code to email; verify via `POST /api/users/phone/verify`.
- **Friends API mounted** under `/api/friends` (request/accept/reject/list/requests).
- **Voicenotes API mounted** under `/api/voicenotes`.
- **Swagger bearer auth** added to all protected endpoints. Click Authorize and use `Bearer <JWT>`.
- **Socket.IO auth** now validates JWT in the `authenticate` event.
- **Config cleanup**: use `MONGODB_URI`; default port is `50001`.

## 🛠️ Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Real-time**: Socket.IO
- **Authentication**: JWT
- **File Uploads**: Multer
- **Calling**: WebRTC signaling
- **Validation**: Express-validator
- **Security**: Helmet, CORS, Rate limiting

## 📋 Prerequisites

- Node.js (v16 or higher)
- MongoDB Atlas account (already configured)
- npm or yarn

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Setup
- Your `.env` can include:
  - `PORT=50001`
  - `MONGODB_URI=your_mongodb_connection_uri`
  - `JWT_SECRET=your_jwt_secret`
  - `FRONTEND_URL=http://localhost:3007`
  - SMTP for real emails (required for forgot password and phone verification):
    - `SMTP_HOST=...`
    - `SMTP_PORT=587`
    - `SMTP_SECURE=false`  # true for 465
    - `SMTP_USER=...`
    - `SMTP_PASS=...`
    - `MAIL_FROM=Your App <no-reply@yourapp.com>`

### 3. Start the Server
```bash
# Development mode
npm run dev

# Production mode
npm start
```

### 4. Test the API
```bash
npm test
```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh` - Refresh token
- `POST /api/auth/google` - **Login/register via Google** (email-based, no password)
- `POST /api/auth/forgot-password` - **Send 6-digit reset code to email**
- `POST /api/auth/reset-password` - **Reset password with `{ email, code, password }`**

#### Google Sign-In flow
- Use Firebase on the frontend to verify Google identity and obtain the user email.
- Call `POST /api/auth/google` with `{ email, username?, profilePicture? }`.
- If the user exists (by email), a JWT is returned without asking for a password.
- If the user does not exist, the backend auto-creates the user with defaults and returns a JWT.

### Users
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update profile
- `GET /api/users/search?query=username` - Search users
- `GET /api/users/online` - Get online users
- `DELETE /api/users/me` - **Permanently delete your account**
- `POST /api/users/phone/verify/send-code` - **Send phone verification code to email**
- `POST /api/users/phone/verify` - **Verify phone with `{ code }`**

### Chats
- `GET /api/chats` - Get user's chats
- `GET /api/chats/search?query=searchterm` - **Search through chats**
- `POST /api/chats` - Create new chat
- `GET /api/chats/:chatId` - Get specific chat
- `POST /api/chats/:chatId/read` - Mark chat as read

### Messages & Media Posting
- `GET /api/messages/:chatId` - Get chat messages
- `POST /api/messages/:chatId` - Send text/structured message
- `POST /api/messages/:chatId/upload-image` - **Post image to chat**
- `POST /api/messages/:chatId/upload-video` - **Post video to chat**
- `POST /api/messages/:chatId/upload-audio` - **Post audio to chat**
- `POST /api/messages/:chatId/upload-document` - **Post document to chat**
- `PUT /api/messages/:messageId` - Edit message
- `DELETE /api/messages/:messageId` - Delete message

### Friends
- `POST /api/friends/request` - Send friend request `{ receiverId }`
- `POST /api/friends/accept` - Accept friend request `{ requestId }`
- `POST /api/friends/reject` - Reject friend request `{ requestId }`
- `GET /api/friends` - Get accepted friends
- `GET /api/friends/requests` - Get pending friend requests (no payload)

ReceiverId explained: `receiverId` is the target user’s MongoDB `_id`, created when the user registered. Obtain it from `GET /api/users`, `GET /api/users/search`, or existing chat participants.

### 🎥 Voice & Video Calling
- `POST /api/calls/initiate` - **Start a voice or video call**
- `POST /api/calls/:callId/answer` - **Answer incoming call**
- `POST /api/calls/:callId/reject` - **Reject incoming call**
- `POST /api/calls/:callId/end` - **End active call**
- `GET /api/calls/history` - **Get call history**
- `GET /api/calls/missed` - **Get missed calls**
- `GET /api/calls/:callId` - **Get call details**
- `PUT /api/calls/:callId/settings` - **Update call settings**
- `DELETE /api/calls/:callId` - **Delete call record**

### Voicenotes
- `POST /api/voicenotes` - Upload a voice note (multipart)
- `GET /api/voicenotes/:filename` - Download a voice note

## 🔐 Swagger Bearer Auth
- Open `/api-docs` in your browser.
- Click the "Authorize" button.
- Enter: `Bearer <your_jwt_token>`.
- All protected endpoints (users/chats/messages/calls/friends) require the token to test successfully.

## 🔌 Sockets: Auth + Events
- Connect to Socket.IO and emit `authenticate`:
```js
socket.emit('authenticate', { userId, token }); // token = JWT from backend
```
- The server verifies the JWT, joins the user to their chat rooms, and enables:
  - `send_message`, `message_delivered`, `message_read`, `typing_start/typing_stop`
  - Call signaling: `initiate_call`, `answer_call`, `reject_call`, `end_call`, `webrtc_*`

## 💬 Message Status Icons

### **📤 Message Delivery Status (Like WhatsApp):**

#### **1. 📤 Single Check (✓) - Message Sent**
- **When**: Message successfully sent to server
- **Color**: Gray
- **Meaning**: "I sent the message"

#### **2. 📤 Double Check (✓✓) - Message Delivered**
- **When**: Message received by recipient's device
- **Color**: Gray
- **Meaning**: "Message delivered to their phone"

#### **3. 🔵 Blue Double Check (✓✓) - Message Read**
- **When**: Recipient opened and read the message
- **Color**: Blue
- **Meaning**: "They saw my message"

#### **4. ⏳ Clock Icon (⏰) - Message Sending**
- **When**: Message is being sent
- **Color**: Gray
- **Meaning**: "Still sending..."

### **📱 Online Status Indicators:**

#### **🟢 Green Dot - Online**
- **When**: User is currently active
- **Meaning**: "Available to chat right now"

#### **🔴 Red Dot - Offline**
- **When**: User is not connected
- **Meaning**: "Not available"

#### **⏰ Last Seen - Recent Activity**
- **When**: User was last online
- **Examples**: "2 minutes ago", "1 hour ago", "Yesterday"

### **⌨️ Typing Indicators:**

#### **"John is typing..."**
- **When**: User is actively typing
- **Duration**: Shows while typing, disappears after 3 seconds of inactivity
- **Real-time**: Updates instantly

### **🔍 How It Works:**

```javascript
// 1. Message Sent
socket.emit('send_message', { chatId, content });
// → Shows single check (✓)

// 2. Message Delivered
socket.on('message_delivered', (data) => {
  // → Shows double check (✓✓)
});

// 3. Message Read
socket.on('message_read', (data) => {
  // → Shows blue double check (✓✓)
});

// 4. Typing Indicator
socket.on('user_typing', (data) => {
  // → Shows "John is typing..."
});
```

### **📊 Status Tracking in Database:**
```javascript
// Message model tracks:
{
  status: 'sent' | 'delivered' | 'read',
  deliveredTo: [{ user, deliveredAt }],
  readBy: [{ user, readAt }]
}
```

## 🔍 Chat Search Features

### **Search Capabilities:**
- **📱 Participant Names** - Find chats by contact names
- **🏷️ Group Names** - Search group chat titles
- **💬 Message Content** - Find chats with specific text
- **📁 Media Files** - Search by file names in messages
- **📝 Group Descriptions** - Find groups by description

### **Search Parameters:**
- **`query`** (required) - Search term to look for
- **`type`** (optional) - Filter by 'private' or 'group' chats
- **`limit`** (optional) - Maximum results (default: 20)

### **Search Examples:**
```bash
# Search all chats for "john"
GET /api/chats/search?query=john

# Search only private chats for "work"
GET /api/chats/search?query=work&type=private

# Search group chats for "project"
GET /api/chats/search?query=project&type=group

# Limit results to 10
GET /api/chats/search?query=meeting&limit=10
```

### **Smart Relevance Scoring:**
- **Exact matches** get highest priority
- **Partial matches** are ranked by relevance
- **Recent activity** boosts search results
- **Multiple criteria** are combined for best results

### **Frontend Usage Example:**
```javascript
// Search for chats containing "john"
const searchChats = async (searchTerm, type = null) => {
  try {
    let url = `/api/chats/search?query=${encodeURIComponent(searchTerm)}`;
    if (type) url += `&type=${type}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const result = await response.json();
    if (result.success) {
      console.log(`Found ${result.resultsCount} chats for "${searchTerm}"`);
      return result.data;
    }
  } catch (error) {
    console.error('Search failed:', error);
  }
};

// Usage
searchChats('john'); // Search all chats
searchChats('work', 'private'); // Search private chats only
```

### **Message Status Icons Implementation:**
```javascript
// React component example
const MessageStatus = ({ message, isOwnMessage }) => {
  if (!isOwnMessage) return null;

  const getStatusIcon = () => {
    switch (message.status) {
      case 'sending':
        return <span className="status-sending">⏰</span>;
      case 'sent':
        return <span className="status-sent">✓</span>;
      case 'delivered':
        return <span className="status-delivered">✓✓</span>;
      case 'read':
        return <span className="status-read">✓✓</span>;
      default:
        return <span className="status-sending">⏰</span>;
    }
  };

  return (
    <div className="message-status">
      {getStatusIcon()}
      {message.status === 'read' && (
        <span className="read-time">
          {new Date(message.readBy[0]?.readAt).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
};

// CSS for status colors
.status-sent { color: #8e8e8e; }      /* Gray */
.status-delivered { color: #8e8e8e; }  /* Gray */
.status-read { color: #34b7f1; }       /* Blue */
.status-sending { color: #8e8e8e; }    /* Gray */
```

## 📞 Calling Features

### **Call Types:**
1. **🎵 Voice Calls** - Audio-only communication
2. **📹 Video Calls** - Audio + video communication

### **Call Flow:**
1. **Initiate** → Caller starts call
2. **Ringing** → Receiver gets notification
3. **Answer/Reject** → Receiver responds
4. **Connected** → Call is active
5. **End** → Either party ends call

### **Call Settings:**
- **Mute Audio** - Turn off microphone
- **Mute Video** - Turn off camera
- **Record Call** - Enable/disable recording

### **WebRTC Signaling (Socket.IO):**
- `initiate_call`, `incoming_call`, `call_answered`, `call_rejected`, `call_ended`
- `webrtc_offer`, `webrtc_answer`, `webrtc_ice_candidate`

## 📁 Media Posting Capabilities

### **What Users Can Post:**

#### 1. **Images** 📷
- **Endpoint**: `POST /api/messages/:chatId/upload-image`
- **Form Field**: `image`
- **Supported Formats**: JPEG, PNG, GIF, WebP
- **Max Size**: 5MB
- **Usage**: Share photos, memes, screenshots

#### 2. **Videos** 🎥
- **Endpoint**: `POST /api/messages/:chatId/upload-video`
- **Form Field**: `video`
- **Supported Formats**: MP4, AVI, MOV, WMV
- **Max Size**: 50MB
- **Usage**: Share video clips, recordings

#### 3. **Audio** 🎵
- **Endpoint**: `POST /api/messages/:chatId/upload-audio`
- **Form Field**: `audio`
- **Supported Formats**: MP3, WAV, M4A
- **Max Size**: 10MB
- **Usage**: Voice messages, music clips

#### 4. **Documents** 📄
- **Endpoint**: `POST /api/messages/:chatId/upload-document`
- **Form Field**: `document`
- **Supported Formats**: PDF, Word, Text files
- **Max Size**: 20MB
- **Usage**: Share files, reports, notes

### **Example Usage:**

#### **Post an Image:**
```javascript
const formData = new FormData();
formData.append('image', imageFile);
formData.append('replyTo', messageId); // optional

fetch('/api/messages/chatId/upload-image', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});
```

#### **Post a Video:**
```javascript
const formData = new FormData();
formData.append('video', videoFile);

fetch('/api/messages/chatId/upload-video', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});
```

## 🔌 Socket.IO Events

### Client to Server
- `authenticate` - Authenticate user
- `join_chat` - Join chat room
- `leave_chat` - Leave chat room
- `send_message` - Send message
- `typing_start/stop` - Typing indicators
- `mark_read` - Mark messages as read

#### **Calling Events:**
- `initiate_call` - Start a call
- `incoming_call` - Receive call notification
- `answer_call` - Accept incoming call
- `reject_call` - Decline incoming call
- `call_answered` - Call was accepted
- `call_rejected` - Call was declined
- `call_connected` - Call is active
- `call_ended` - Call finished
- `webrtc_offer` - WebRTC offer
- `webrtc_answer` - WebRTC answer
- `webrtc_ice_candidate` - WebRTC ICE candidates
- `update_call_settings` - Change call options

#### **Message Status Events:**
- `message_delivered` - Message delivered to recipient
- `message_read` - Message read by recipient
- `mark_read` - Mark messages as read

### Server to Client
- `new_message` - New message received
- `message_sent` - Message sent confirmation
- `user_online/offline` - User status changes
- `user_typing` - Typing indicators
- `messages_read` - Read receipts

#### **Calling Notifications:**
- `incoming_call` - Call notification
- `call_answered` - Call accepted
- `call_rejected` - Call declined
- `call_connected` - Call active
- `call_ended` - Call finished
- `call_settings_updated` - Settings changed

#### **Message Status Notifications:**
- `message_delivered` - Message delivered confirmation
- `message_read` - Read receipt notification
- `messages_read` - Multiple messages marked as read

## 🗄️ Database Models

### User
- Username, email, password
- Profile picture, status
- Online status, last seen
- Contacts, blocked users

### Chat
- Type (private/group)
- Participants with roles
- Last message, unread counts
- Settings and metadata

### Message
- Content and type (text, image, video, audio, document)
- Sender and chat reference
- Reply and forward support
- Read receipts, reactions
- Media file information

### Call
- Caller and receiver
- Type (voice/video)
- Status (initiating, ringing, answered, ended, missed, rejected)
- Duration and timing
- WebRTC signaling data
- Call quality metrics
- Settings (mute, record)

## 🔒 Security Features

- JWT authentication with refresh tokens
- Password hashing with bcrypt
- Input validation and sanitization
- Rate limiting (100 requests per 15 minutes)
- CORS configuration
- Helmet security headers
- File type validation
- File size limits

## 📁 Project Structure

```
node_quickstart/
├── models/           # Database models
├── routes/           # API route handlers
├── middleware/       # Custom middleware
├── socket/           # Socket.IO handlers
│   ├── socketHandler.js    # Main messaging handler
│   └── callHandler.js      # Calling functionality
├── uploads/          # Media file storage
├── test/             # Test files
├── server.js         # Main server file
├── package.json      # Dependencies
└── .env              # Environment variables
```

## 🧪 Testing

Run the test suite:
```bash
npm test
```

Tests cover:
- Health check endpoint
- User registration and login
- Protected route access

## 🚀 Deployment

### Environment Variables
Make sure these are set in production:
- `NODE_ENV=production`
- `MONGODB_URI` (your Atlas connection)
- `JWT_SECRET` (strong secret key)

### PM2 (Recommended)
```bash
npm install -g pm2
pm2 start server.js --name "whatsapp-backend"
pm2 startup
pm2 save
```

### Docker
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

## 🔮 Next Steps

1. **Frontend Integration**: Connect your React/Vue/Angular frontend
2. **Cloud Storage**: Integrate with AWS S3 or Cloudinary
3. **Push Notifications**: Integrate with FCM/APNS
4. **End-to-End Encryption**: Add message encryption
5. **Voice/Video Calls**: Integrate WebRTC

## 🆘 Support

The backend is now **fully deployable** and includes:
- ✅ Complete API endpoints
- ✅ Real-time messaging
- ✅ User authentication
- ✅ **Media posting capabilities**
- ✅ Database models
- ✅ Security features
- ✅ Error handling
- ✅ Input validation
- ✅ File upload handling

## 🌟 **Complete Feature Set:**

### **Messaging:**
- **💬 Text messages** (unlimited)
- **📷 Images** (5MB max)
- **🎥 Videos** (50MB max) 
- **🎵 Audio** (10MB max)
- **📄 Documents** (20MB max)

### **Calling:**
- **🎵 Voice Calls** - High-quality audio
- **📹 Video Calls** - HD video + audio
- **📞 Call Management** - Accept, reject, end
- **📋 Call History** - Track all calls
- **⚙️ Call Settings** - Mute, record options

### **Real-time Features:**
- **🔌 Live Messaging** - Instant delivery
- **📱 Online Status** - See who's available
- **⌨️ Typing Indicators** - Know when someone's typing
- **👁️ Read Receipts** - Message status tracking
- **📤 Delivery Status** - Track message delivery
- **📞 Call Notifications** - Real-time call alerts
- **🔍 Smart Search** - Find chats instantly

All media files are stored locally in the `uploads/` directory and served statically. For production, consider using cloud storage services like AWS S3 or Cloudinary.

**Your WhatsApp clone backend now has EVERYTHING - messaging, media sharing, AND calling!** 🚀📱📞 