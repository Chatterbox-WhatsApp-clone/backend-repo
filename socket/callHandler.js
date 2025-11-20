const Call = require('../models/Call');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

const callHandler = (io) => {
  // Store active calls and user socket mappings
  const activeCalls = new Map(); // callId -> { callerSocket, receiverSocket, callData }
  const userSockets = new Map(); // userId -> socketId

  io.on('connection', (socket) => {
    console.log(`🔌 User connected: ${socket.id}`);

    // Authenticate user and store socket mapping
    socket.on('authenticate', async (data) => {
      try {
        const { userId, token } = data;
        if (!token) {
          socket.emit('authentication_error', { message: 'Token required' });
          return;
        }
        let decoded;
        try {
          decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (e) {
          socket.emit('authentication_error', { message: 'Invalid token' });
          return;
        }
        if (decoded.userId !== userId) {
          socket.emit('authentication_error', { message: 'Token does not match user' });
          return;
        }
        
        // Store user socket mapping
        userSockets.set(userId, socket.id);
        socket.userId = userId;
        
        console.log(`✅ User authenticated: ${userId}`);
        socket.emit('authenticated', { success: true });
        
        // Update user online status
        await User.findByIdAndUpdate(userId, { 
          isOnline: true, 
          lastSeen: new Date() 
        });
        
        // Notify other users
        socket.broadcast.emit('user_online', { userId });
      } catch (error) {
        console.error('Authentication error:', error);
        socket.emit('authentication_error', { message: 'Authentication failed' });
      }
    });

    // Initiate a call
    socket.on('initiate_call', async (data) => {
      try {
        const { receiverId, type, notes } = data;
        const callerId = socket.userId;

        if (!callerId) {
          socket.emit('call_error', { message: 'User not authenticated' });
          return;
        }

        // Check if receiver is online
        const receiverSocketId = userSockets.get(receiverId);
        if (!receiverSocketId) {
          socket.emit('call_error', { message: 'User is offline' });
          return;
        }

        // Create call record
        const call = new Call({
          caller: callerId,
          receiver: receiverId,
          type,
          notes,
          status: 'ringing'
        });

        await call.save();
        await call.populate('caller', 'username profilePicture');
        await call.populate('receiver', 'username profilePicture');
        const callDetails = call.toObject({ virtuals: true });

        // Store call data
        activeCalls.set(call._id.toString(), {
          callId: call._id.toString(),
          callerSocket: socket.id,
          receiverSocket: receiverSocketId,
          callData: callDetails
        });

        // Emit to receiver
        io.to(receiverSocketId).emit('incoming_call', {
          callId: call._id.toString(),
          caller: call.caller,
          type: call.type,
          notes: call.notes,
          shareableLink: callDetails.shareableLink,
          linkToken: callDetails.linkToken
        });

        // Emit to caller
        socket.emit('call_initiated', {
          callId: call._id.toString(),
          call: callDetails
        });

        console.log(`📞 Call initiated: ${callerId} -> ${receiverId} (${type})`);
      } catch (error) {
        console.error('Initiate call error:', error);
        socket.emit('call_error', { message: 'Failed to initiate call' });
      }
    });

    // Answer a call
    socket.on('answer_call', async (data) => {
      try {
        const { callId } = data;
        const userId = socket.userId;

        const callInfo = activeCalls.get(callId);
        if (!callInfo) {
          socket.emit('call_error', { message: 'Call not found' });
          return;
        }

        // Update call status
        const call = await Call.findById(callId);
        if (!call) {
          socket.emit('call_error', { message: 'Call not found' });
          return;
        }

        await call.answerCall();

        // Notify caller that call was answered
        io.to(callInfo.callerSocket).emit('call_answered', {
          callId,
          receiver: call.receiver
        });

        // Notify receiver
        socket.emit('call_connected', {
          callId,
          call: call
        });

        console.log(`✅ Call answered: ${callId}`);
      } catch (error) {
        console.error('Answer call error:', error);
        socket.emit('call_error', { message: 'Failed to answer call' });
      }
    });

    // Reject a call
    socket.on('reject_call', async (data) => {
      try {
        const { callId } = data;
        const userId = socket.userId;

        const callInfo = activeCalls.get(callId);
        if (!callInfo) {
          socket.emit('call_error', { message: 'Call not found' });
          return;
        }

        // Update call status
        const call = await Call.findById(callId);
        if (call) {
          await call.rejectCall();
        }

        // Notify caller that call was rejected
        io.to(callInfo.callerSocket).emit('call_rejected', {
          callId,
          receiver: call.receiver
        });

        // Remove from active calls
        activeCalls.delete(callId);

        console.log(`❌ Call rejected: ${callId}`);
      } catch (error) {
        console.error('Reject call error:', error);
        socket.emit('call_error', { message: 'Failed to reject call' });
      }
    });

    // End a call
    socket.on('end_call', async (data) => {
      try {
        const { callId } = data;
        const userId = socket.userId;

        const callInfo = activeCalls.get(callId);
        if (!callInfo) {
          socket.emit('call_error', { message: 'Call not found' });
          return;
        }

        // Update call status
        const call = await Call.findById(callId);
        if (call) {
          await call.endCall();
        }

        // Notify both parties
        io.to(callInfo.callerSocket).emit('call_ended', { callId });
        io.to(callInfo.receiverSocket).emit('call_ended', { callId });

        // Remove from active calls
        activeCalls.delete(callId);

        console.log(`📞 Call ended: ${callId}`);
      } catch (error) {
        console.error('End call error:', error);
        socket.emit('call_error', { message: 'Failed to end call' });
      }
    });

    // WebRTC signaling - Offer
    socket.on('webrtc_offer', (data) => {
      const { callId, offer } = data;
      const callInfo = activeCalls.get(callId);

      if (callInfo && callInfo.receiverSocket) {
        io.to(callInfo.receiverSocket).emit('webrtc_offer', {
          callId,
          offer,
          from: socket.userId
        });
      }
    });

    // WebRTC signaling - Answer
    socket.on('webrtc_answer', (data) => {
      const { callId, answer } = data;
      const callInfo = activeCalls.get(callId);

      if (callInfo && callInfo.callerSocket) {
        io.to(callInfo.callerSocket).emit('webrtc_answer', {
          callId,
          answer,
          from: socket.userId
        });
      }
    });

    // WebRTC signaling - ICE candidates
    socket.on('webrtc_ice_candidate', (data) => {
      const { callId, candidate } = data;
      const callInfo = activeCalls.get(callId);

      if (callInfo) {
        const targetSocket = socket.id === callInfo.callerSocket 
          ? callInfo.receiverSocket 
          : callInfo.callerSocket;

        if (targetSocket) {
          io.to(targetSocket).emit('webrtc_ice_candidate', {
            callId,
            candidate,
            from: socket.userId
          });
        }
      }
    });

    // Call settings updates
    socket.on('update_call_settings', async (data) => {
      try {
        const { callId, settings } = data;
        const userId = socket.userId;

        const call = await Call.findById(callId);
        if (!call) {
          socket.emit('call_error', { message: 'Call not found' });
          return;
        }

        // Check if user is participant
        if (call.caller.toString() !== userId && call.receiver.toString() !== userId) {
          socket.emit('call_error', { message: 'Not a participant in this call' });
          return;
        }

        // Update settings
        if (settings.muteAudio !== undefined) call.settings.muteAudio = settings.muteAudio;
        if (settings.muteVideo !== undefined) call.settings.muteVideo = settings.muteVideo;
        if (settings.recordCall !== undefined) call.settings.recordCall = settings.recordCall;

        await call.save();

        // Notify other participant
        const callInfo = activeCalls.get(callId);
        if (callInfo) {
          const targetSocket = socket.id === callInfo.callerSocket 
            ? callInfo.receiverSocket 
            : callInfo.callerSocket;

          if (targetSocket) {
            io.to(targetSocket).emit('call_settings_updated', {
              callId,
              settings: call.settings,
              updatedBy: userId
            });
          }
        }

        socket.emit('call_settings_updated', {
          callId,
          settings: call.settings
        });
      } catch (error) {
        console.error('Update call settings error:', error);
        socket.emit('call_error', { message: 'Failed to update call settings' });
      }
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
      try {
        const userId = socket.userId;
        if (userId) {
          // Remove user socket mapping
          userSockets.delete(userId);

          // Update user offline status
          await User.findByIdAndUpdate(userId, { 
            isOnline: false, 
            lastSeen: new Date() 
          });

          // End any active calls for this user
          for (const [callId, callInfo] of activeCalls.entries()) {
            if (callInfo.callerSocket === socket.id || callInfo.receiverSocket === socket.id) {
              const call = await Call.findById(callId);
              if (call && call.status === 'answered') {
                await call.endCall();
              }

              // Notify other participant
              const targetSocket = callInfo.callerSocket === socket.id 
                ? callInfo.receiverSocket 
                : callInfo.callerSocket;

              if (targetSocket) {
                io.to(targetSocket).emit('call_ended', { 
                  callId,
                  reason: 'User disconnected' 
                });
              }

              activeCalls.delete(callId);
            }
          }

          // Notify other users
          socket.broadcast.emit('user_offline', { userId });
        }

        console.log(`🔌 User disconnected: ${socket.id}`);
      } catch (error) {
        console.error('Disconnect handling error:', error);
      }
    });
  });

  return {
    getActiveCalls: () => activeCalls,
    getUserSockets: () => userSockets
  };
};

module.exports = callHandler; 