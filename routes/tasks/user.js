import express from 'express';
import dbConnect from '../../lib/dbConnect.js';
import UserTask from '../../models/UserTask.js';
import Task from '../../models/Task.js';

const router = express.Router();

router.get('/:userId', async (req, res) => {
  await dbConnect();
  const userId = String(req.params.userId);

  console.log('[UserTasks] Запрос задач для пользователя:', userId);

  try {
    // Берем все выполненные задачи пользователя
    const userTasks = await UserTask.find({ userId }).select('taskId completedAt');
    console.log('[UserTasks] Найдено выполненных задач:', userTasks.length);
    userTasks.forEach(t => console.log(`[UserTasks] taskId: ${t.taskId}, completedAt: ${t.completedAt}`));

    // ID всех выполненных задач
    const completedTaskIds = userTasks.map(t => String(t.taskId));
    console.log('[UserTasks] Список ID выполненных задач:', completedTaskIds);

    // Берем все активные задачи
    const allTasks = await Task.find({ active: true });
    console.log('[UserTasks] Всего активных задач:', allTasks.length);
    allTasks.forEach(task => console.log(`[UserTasks] task _id: ${task._id}, title: ${task.title}`));

    // Помечаем completed = true, если задача выполнена
    const tasksWithStatus = allTasks.map(task => {
      const taskObj = task.toObject();
      taskObj.completed = completedTaskIds.includes(String(taskObj._id));
      console.log(`[UserTasks] task "${taskObj.title}" completed: ${taskObj.completed}`);
      return taskObj;
    });

    console.log('[UserTasks] Возвращаем задачи пользователю с completed статусом');
    return res.status(200).json({ success: true, data: tasksWithStatus });

  } catch (error) {
    console.error('[UserTasks] Ошибка при получении задач пользователя:', error);
    return res.status(500).json({
      success: false,
      message: 'Не удалось получить задачи'
    });
  }
});

export default router;

