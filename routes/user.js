import express from 'express';
import dbConnect from '../lib/dbConnect.js';
import UserTask from '../models/UserTask.js';

const router = express.Router();

router.get('/:userId', async (req, res) => {
    const {userId} = req.params;

    if (!userId) {
        return res.status(400).json({success: false, message: 'User ID is required'});
    }

    await dbConnect();

    try {
        const userTasks = await UserTask.find({userId}).select('taskId completedAt');
        return res.status(200).json({success: true, data: userTasks});
    } catch (error) {
        console.error('Error fetching user tasks:', error);
        return res.status(500).json({success: false, error: 'Failed to fetch user tasks'});
    }
});


export default router;
