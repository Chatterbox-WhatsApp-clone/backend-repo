# Backend API Endpoints for User Profile and Search Feature

## Overview
I've created two new API endpoints for your WhatsApp clone to support the user profile modal and search functionality:

1. **GET /api/users/:userId/friends** - Get friends of a specific user
2. **GET /api/users/search/enhanced** - Enhanced search for users by username or email

## Files Created
- `user_endpoints.js` - Contains the new endpoint implementations
- `integration_instructions.txt` - Instructions for integration

## Required Changes to users.js

### 1. Add mongoose import (after line 2):
```javascript
const mongoose = require("mongoose");
```

### 2. Add the endpoints before "module.exports = router;" (around line 1035)
Copy the content from `user_endpoints.js` and paste it before the module.exports line.

## API Endpoints Details

### GET /api/users/:userId/friends
**Purpose**: Get all friends of a specific user with their online status and last seen time

**Parameters**:
- `userId` (path parameter) - The ID of the user whose friends to retrieve

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "_id": "user_id",
      "username": "friend_username",
      "email": "friend@example.com",
      "profilePicture": "/path/to/image.jpg",
      "status": "Hey there!",
      "isOnline": true,
      "lastSeen": "2024-01-15T10:30:00Z"
    }
  ]
}
```

**Features**:
- Validates user ID format
- Checks if user exists
- Returns friends sorted by online status (online first)
- Includes lastSeen timestamp for "last seen X ago" formatting
- Excludes the current user from results

### GET /api/users/search/enhanced
**Purpose**: Search for users by username or email with enhanced functionality

**Query Parameters**:
- `q` (required) - Search query (minimum 2 characters)
- `limit` (optional) - Maximum number of results (default: 20)

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "_id": "user_id",
      "username": "username",
      "email": "user@example.com",
      "profilePicture": "/path/to/image.jpg",
      "status": "Status message",
      "isOnline": false,
      "lastSeen": "2024-01-15T10:30:00Z"
    }
  ]
}
```

**Features**:
- Searches both username and email fields
- Case-insensitive search
- Excludes current user from results
- Returns results sorted by online status
- Includes lastSeen for time formatting
- Configurable result limit

## Frontend Integration

### Environment Variables
Add these to your frontend .env file:
```
NEXT_PUBLIC_GET_USER_FRIENDS_ENDPOINT=http://localhost:5001/api/users
NEXT_PUBLIC_SEARCH_USERS_ENDPOINT=http://localhost:5001/api/users/search/enhanced
```

### Usage Examples

#### Fetch user's friends:
```javascript
const fetchUserFriends = async (userId) => {
  const res = await fetch(`${backendBase}/api/users/${userId}/friends`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
};
```

#### Search users:
```javascript
const searchUsers = async (query) => {
  const res = await fetch(`${backendBase}/api/users/search/enhanced?q=${encodeURIComponent(query)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
};
```

## Time Formatting Logic
The endpoints return `lastSeen` timestamps that can be formatted on the frontend:

```javascript
const formatLastSeen = (lastSeen) => {
  if (!lastSeen) return "last seen a long time ago";
  
  const now = new Date();
  const lastSeenDate = new Date(lastSeen);
  const diffInMs = now - lastSeenDate;
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));

  if (diffInMinutes < 1) return "last seen just now";
  if (diffInMinutes < 60) return `last seen ${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
  if (diffInHours < 24) return `last seen ${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
  if (diffInDays < 30) return `last seen ${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
  
  return "last seen a long time ago";
};
```

## Testing
After integration, test the endpoints:

1. **Test user friends endpoint**:
   ```
   GET http://localhost:5001/api/users/{userId}/friends
   Authorization: Bearer {your_token}
   ```

2. **Test search endpoint**:
   ```
   GET http://localhost:5001/api/users/search/enhanced?q=john
   Authorization: Bearer {your_token}
   ```

## Notes
- Both endpoints require authentication
- The friends endpoint validates ObjectId format
- Search is case-insensitive and searches both username and email
- Results are sorted with online users first
- All endpoints return consistent JSON structure with success/data format
