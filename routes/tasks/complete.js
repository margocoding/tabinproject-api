import express from 'express'
import dbConnect from '../../lib/dbConnect.js'
import Task from '../../models/Task.js'
import User from '../../models/User.js'
import UserTask from '../../models/UserTask.js'

const router = express.Router()

router.post('/', async (req, res) => {
    await dbConnect()

    try {
        let { userId, taskId } = req.body

        // Поддержка snake_case из фронтенда
        if (!userId && req.body.user_id) userId = req.body.user_id
        if (!taskId && req.body.task_id) taskId = req.body.task_id

        userId = String(userId)
        taskId = String(taskId)

        if (!userId || !taskId) {
            return res.status(400).json({
                success: false,
                message: 'User ID and Task ID are required'
            })
        }

        const user = await User.findOne({ telegramId: userId })
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            })
        }

        const task = await Task.findById(taskId)
        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            })
        }

        // 👇 ДОБАВЛЕНО: Логирование перед проверкой завершения
        console.log('Request body:', req.body)
        console.log('Checking if task already completed for user:', userId, taskId)

        const existingCompletion = await UserTask.findOne({ userId, taskId })
        if (existingCompletion) {
            return res.status(400).json({
                success: false,
                message: 'User has already completed this task'
            })
        }

        const userTask = await UserTask.create({
            userId,
            taskId,
            completedAt: new Date()
        })

        await Task.findByIdAndUpdate(taskId, {
            $inc: { completions: 1 }
        })

        await User.findOneAndUpdate(
            { telegramId: userId },
            { $inc: { 'gameData.balance': task.reward } }
        )

        return res.status(201).json({
            success: true,
            data: {
                task,
                reward: task.reward,
                completedAt: userTask.completedAt
            }
        })
    } catch (error) {
        console.error('Error completing task:', error)
        return res.status(500).json({
            success: false,
            error: 'Failed to complete task'
        })
    }
})

export default router


