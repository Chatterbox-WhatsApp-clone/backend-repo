const express = require('express');
const { body, validationResult } = require('express-validator');
const Call = require('../models/Call');
const User = require('../models/User');
const router = express.Router();

/**
 * @swagger
 * /api/calls:
 *   get:
 *     summary: Get all call logs
 *     tags:
 *       - Calls
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of call logs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/", async (req, res) => {
	try {
		const userId = req.user.id;

		const calls = await Call.find({
			$or: [
				{ caller: userId },
				{ receiver: userId }
			],
			isActive: true
		})
			.populate("caller", "username profilePicture")
			.populate("receiver", "username profilePicture")
			.sort({ createdAt: -1 });

		return res.status(200).json({
			success: true,
			data: calls,
		});
	} catch (error) {
		console.error("Error fetching calls:", error);
		return res.status(500).json({
			success: false,
			message: "Internal server error",
		});
	}
});

/**
 * @swagger
 * /api/calls/initiate:
 *   post:
 *     summary: Initiate a new call
 *     tags:
 *       - Calls
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               receiverId:
 *                 type: string
 *                 description: MongoDB ObjectId of receiver
 *               type:
 *                 type: string
 *                 enum: [voice, video]
 *                 example: voice
 *               notes:
 *                 type: string
 *                 description: Call notes
 *     responses:
 *       201:
 *         description: Call initiated
 *       400:
 *         description: Invalid input or cannot call yourself or active call exists
 *       404:
 *         description: Receiver not found or inactive
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/initiate', [
  body('receiverId')
    .isMongoId()
    .withMessage('Valid receiver ID is required'),
  body('type')
    .isIn(['voice', 'video'])
    .withMessage('Call type must be voice or video')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { receiverId, type, notes } = req.body;
    const callerId = req.user._id;

    // Check if caller is trying to call themselves
    if (callerId.toString() === receiverId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot call yourself'
      });
    }

    // Check if receiver exists and is active
    const receiver = await User.findById(receiverId);
    if (!receiver || !receiver.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Receiver not found or inactive'
      });
    }

    // Check if there's already an active call
    const activeCall = await Call.getActiveCall(callerId);
    if (activeCall) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active call'
      });
    }

    const receiverActiveCall = await Call.getActiveCall(receiverId);
    if (receiverActiveCall) {
      return res.status(400).json({
        success: false,
        message: 'Receiver is currently on another call'
      });
    }

    // Create new call
    const call = new Call({
      caller: callerId,
      receiver: receiverId,
      type,
      notes,
      status: 'initiating'
    });

    await call.save();

    // Populate call with user details
    await call.populate('caller', 'username profilePicture');
    await call.populate('receiver', 'username profilePicture');

    const callDetails = call.toObject({ virtuals: true });

    res.status(201).json({
      success: true,
      message: 'Call initiated successfully',
      data: callDetails,
      link: callDetails.shareableLink
    });
  } catch (error) {
    console.error('Initiate call error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/calls/{callId}/answer:
 *   post:
 *     summary: Answer an incoming call
 *     tags:
 *       - Calls
 *     parameters:
 *       - in: path
 *         name: callId
 *         required: true
 *         schema:
 *           type: string
 *         description: Call ID to answer
 *     responses:
 *       200:
 *         description: Call answered successfully
 *       400:
 *         description: Call cannot be answered in current state
 *       404:
 *         description: Call not found
 *       403:
 *         description: Forbidden (only receiver can answer)
 *       500:
 *         description: Internal server error
 */
router.post('/:callId/answer', async (req, res) => {
  try {
    const { callId } = req.params;
    const userId = req.user._id;

    const call = await Call.findById(callId);
    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }

    // Check if user is the receiver
    if (call.receiver.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only answer calls directed to you'
      });
    }

    // Check if call can be answered
    if (call.status !== 'ringing') {
      return res.status(400).json({
        success: false,
        message: 'Call cannot be answered in current state'
      });
    }

    // Answer the call
    await call.answerCall();

    // Populate call with user details
    await call.populate('caller', 'username profilePicture');
    await call.populate('receiver', 'username profilePicture');

    res.json({
      success: true,
      message: 'Call answered successfully',
      data: call
    });
  } catch (error) {
    console.error('Answer call error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/calls/{callId}/reject:
 *   post:
 *     summary: Reject an incoming call
 *     tags:
 *       - Calls
 *     parameters:
 *       - in: path
 *         name: callId
 *         required: true
 *         schema:
 *           type: string
 *         description: Call ID to reject
 *     responses:
 *       200:
 *         description: Call rejected successfully
 *       400:
 *         description: Call cannot be rejected in current state
 *       404:
 *         description: Call not found
 *       403:
 *         description: Forbidden (only receiver can reject)
 *       500:
 *         description: Internal server error
 */
router.post('/:callId/reject', async (req, res) => {
  try {
    const { callId } = req.params;
    const userId = req.user._id;

    const call = await Call.findById(callId);
    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }

    // Check if user is the receiver
    if (call.receiver.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only reject calls directed to you'
      });
    }

    // Check if call can be rejected
    if (call.status !== 'ringing') {
      return res.status(400).json({
        success: false,
        message: 'Call cannot be rejected in current state'
      });
    }

    // Reject the call
    await call.rejectCall();

    // Populate call with user details
    await call.populate('caller', 'username profilePicture');
    await call.populate('receiver', 'username profilePicture');

    res.json({
      success: true,
      message: 'Call rejected successfully',
      data: call
    });
  } catch (error) {
    console.error('Reject call error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/calls/{callId}/end:
 *   post:
 *     summary: End an active call
 *     tags:
 *       - Calls
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: callId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Call ended successfully
 *       400:
 *         description: Call already ended
 *       403:
 *         description: User not part of this call
 *       404:
 *         description: Call not found
 */

router.post('/:callId/end', async (req, res) => {
  try {
    const { callId } = req.params;
    const userId = req.user._id;

    const call = await Call.findById(callId);
    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }

    // Check if user is participant in the call
    if (call.caller.toString() !== userId.toString() && 
        call.receiver.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You are not a participant in this call'
      });
    }

    // Check if call can be ended
    if (call.status === 'ended' || call.status === 'missed' || call.status === 'rejected') {
      return res.status(400).json({
        success: false,
        message: 'Call is already ended'
      });
    }

    // End the call
    await call.endCall();

    // Populate call with user details
    await call.populate('caller', 'username profilePicture');
    await call.populate('receiver', 'username profilePicture');

    res.json({
      success: true,
      message: 'Call ended successfully',
      data: call
    });
  } catch (error) {
    console.error('End call error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/calls/history:
 *   get:
 *     summary: Get user's call history with optional filters
 *     tags:
 *       - Calls
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *       - name: type
 *         in: query
 *         schema:
 *           type: string
 *           enum: [voice, video]
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [initiating, ringing, answered, ended, missed, rejected]
 *     responses:
 *       200:
 *         description: Filtered call list
 *       500:
 *         description: Internal server error
 */

router.get('/history', async (req, res) => {
  try {
    const { limit = 20, type, status } = req.query;
    const userId = req.user._id;

    let query = {
      $or: [{ caller: userId }, { receiver: userId }],
      isActive: true
    };

    // Filter by call type if specified
    if (type && ['voice', 'video'].includes(type)) {
      query.type = type;
    }

    // Filter by call status if specified
    if (status && ['initiating', 'ringing', 'answered', 'ended', 'missed', 'rejected'].includes(status)) {
      query.status = status;
    }

    const calls = await Call.find(query)
      .populate('caller', 'username profilePicture')
      .populate('receiver', 'username profilePicture')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: calls,
      count: calls.length
    });
  } catch (error) {
    console.error('Get call history error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/calls/missed:
 *   get:
 *     summary: Get user's missed calls
 *     tags:
 *       - Calls
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of missed calls
 *       500:
 *         description: Internal server error
 */

router.get('/missed', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const userId = req.user._id;

    const missedCalls = await Call.getMissedCalls(userId, parseInt(limit));

    res.json({
      success: true,
      data: missedCalls,
      count: missedCalls.length
    });
  } catch (error) {
    console.error('Get missed calls error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/calls/{callId}:
 *   get:
 *     summary: Get details of a specific call
 *     tags:
 *       - Calls
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: callId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Call details
 *       403:
 *         description: Not allowed
 *       404:
 *         description: Call not found
 */

router.get('/:callId', async (req, res) => {
  try {
    const { callId } = req.params;
    const userId = req.user._id;

    const call = await Call.findById(callId);
    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }

    // Check if user is participant in the call
    if (call.caller.toString() !== userId.toString() && 
        call.receiver.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You are not a participant in this call'
      });
    }

    // Populate call with user details
    await call.populate('caller', 'username profilePicture');
    await call.populate('receiver', 'username profilePicture');

    res.json({
      success: true,
      data: call
    });
  } catch (error) {
    console.error('Get call error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/calls/{callId}/settings:
 *   put:
 *     summary: Update call settings (mute, video, record)
 *     tags:
 *       - Calls
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: callId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               muteAudio:
 *                 type: boolean
 *               muteVideo:
 *                 type: boolean
 *               recordCall:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Settings updated
 *       400:
 *         description: Cannot update settings now
 *       404:
 *         description: Call not found
 */
 
router.put('/:callId/settings', [
  body('muteAudio').optional().isBoolean(),
  body('muteVideo').optional().isBoolean(),
  body('recordCall').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { callId } = req.params;
    const { muteAudio, muteVideo, recordCall } = req.body;
    const userId = req.user._id;

    const call = await Call.findById(callId);
    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }

    // Check if user is participant in the call
    if (call.caller.toString() !== userId.toString() && 
        call.receiver.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You are not a participant in this call'
      });
    }

    // Check if call is active
    if (call.status !== 'answered') {
      return res.status(400).json({
        success: false,
        message: 'Call settings can only be updated during active calls'
      });
    }

    // Update settings
    if (muteAudio !== undefined) call.settings.muteAudio = muteAudio;
    if (muteVideo !== undefined) call.settings.muteVideo = muteVideo;
    if (recordCall !== undefined) call.settings.recordCall = recordCall;

    await call.save();

    // Populate call with user details
    await call.populate('caller', 'username profilePicture');
    await call.populate('receiver', 'username profilePicture');

    res.json({
      success: true,
      message: 'Call settings updated successfully',
      data: call
    });
  } catch (error) {
    console.error('Update call settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/calls/{callId}:
 *   delete:
 *     summary: Soft delete a call record
 *     tags:
 *       - Calls
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: callId
 *         in: path
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Call deleted
 *       404:
 *         description: Call not found
 */

router.delete('/:callId', async (req, res) => {
  try {
    const { callId } = req.params;
    const userId = req.user._id;

    const call = await Call.findById(callId);
    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }

    // Check if user is participant in the call
    if (call.caller.toString() !== userId.toString() && 
        call.receiver.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You are not a participant in this call'
      });
    }

    // hard delete the call
    call.isActive = false;
    await call.save();

    res.json({
      success: true,
      message: 'Call deleted successfully'
    });
  } catch (error) {
    console.error('Delete call error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;