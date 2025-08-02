// routes/adminRoutes.js - ИСПРАВЛЕННАЯ ВЕРСИЯ
import express from 'express';
import User from '../models/User.js';
import Product from '../models/Product.js';
import ProductClaim from '../models/ProductClaim.js';
import Notification from '../models/Notification.js';
import Investment from '../models/Investment.js';  // Раскомментируйте если нет
import Task from '../models/Task.js';

import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Настройка CORS middleware для маршрутов API
router.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    next();
});

// ===== ИСПРАВЛЕННАЯ НАСТРОЙКА MULTER =====

// Фильтр файлов (только изображения)
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Разрешены только изображения!'), false);
    }
};

// Конфигурация хранилища для multer - ИСПРАВЛЕНО
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        // Используем ту же логику что и в bot.js
        const isProduction = process.env.NODE_ENV === 'production';
        const uploadDir = isProduction ? '/data/uploads' : path.join(process.cwd(), 'uploads');
        
        // Создаем директорию, если она не существует
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        console.log(`📁 Multer destination: ${uploadDir} (production: ${isProduction})`);
        cb(null, uploadDir);
    },
    filename: function(req, file, cb) {
        // Генерируем уникальное имя файла
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);

        // Префикс в зависимости от типа файла
        const prefix = req.path.includes('tasks') ? 'task-' : 
                      req.path.includes('products') ? 'product-' : 
                      req.path.includes('investments') ? 'investment-' : 'file-';
        
        const filename = prefix + uniqueSuffix + ext;
        console.log(`📷 Generated filename: ${filename}`);
        cb(null, filename);
    }
});

// Инициализация multer
const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5 MB
    }
});

// Middleware для обработки ошибок загрузки файлов заданий
const handleUploadErrors = (req, res, next) => {
    return upload.single('taskImage')(req, res, (err) => {
        if (err) {
            console.error('File upload error:', err);
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({
                    success: false,
                    error: 'Размер файла превышает допустимый лимит (5MB)'
                });
            }
            return res.status(400).json({
                success: false,
                error: err.message
            });
        }
        next();
    });
};

// Middleware для обработки ошибок загрузки файлов продуктов
const handleProductUploadErrors = (req, res, next) => {
    return upload.single('productImage')(req, res, (err) => {
        if (err) {
            console.error('Product file upload error:', err);
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({
                    success: false,
                    error: 'Размер файла превышает допустимый лимит (5MB)'
                });
            }
            return res.status(400).json({
                success: false,
                error: err.message
            });
        }
        next();
    });
};

// ===== РОУТЫ ДЛЯ ЗАГРУЗКИ ИЗОБРАЖЕНИЙ =====

// Создание задания с изображением
router.post('/tasks/upload', handleUploadErrors, async (req, res) => {
    try {
        console.log('📝 Creating task with image...');
        console.log('Received body:', req.body);
        console.log('Received file:', req.file ? req.file.filename : 'No file');

        const taskData = {
            title: req.body.title,
            description: req.body.description,
            type: req.body.type || 'daily',
            reward: Number(req.body.reward) || 100,
            active: req.body.active === 'true' || req.body.active === true
        };

        // Если есть файл, добавляем его путь
        if (req.file) {
            taskData.icon = `/uploads/${req.file.filename}`;
            console.log(`✅ Task image saved: ${taskData.icon}`);
        } else if (req.body.icon) {
            taskData.icon = req.body.icon;
        }

        // Преобразуем requirements из строки в объект
        if (req.body.requirements) {
            try {
                taskData.requirements = JSON.parse(req.body.requirements);
            } catch (e) {
                console.error('Failed to parse requirements:', e);
                taskData.requirements = { level: 1, income: 0 };
            }
        } else {
            taskData.requirements = { level: 1, income: 0 };
        }

        // Проверяем обязательные поля
        if (!taskData.title || !taskData.description) {
            return res.status(400).json({
                success: false,
                error: `Missing required fields: ${!taskData.title ? 'title' : ''} ${!taskData.description ? 'description' : ''}`
            });
        }

        // Создаем задание
        const task = await Task.create(taskData);
        console.log('✅ Task created successfully:', task._id);

        res.status(201).json({ success: true, data: task });
    } catch (error) {
        console.error('❌ Error creating task with image:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Обновление задания с изображением
router.put('/tasks/:id/upload', handleUploadErrors, async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`📝 Updating task ${id} with image...`);
        
        const taskData = req.body;

        // Преобразуем requirements из строки в объект
        if (taskData.requirements && typeof taskData.requirements === 'string') {
            taskData.requirements = JSON.parse(taskData.requirements);
        }

        // Находим существующее задание
        const existingTask = await Task.findById(id);
        if (!existingTask) {
            return res.status(404).json({ success: false, message: 'Задание не найдено' });
        }

        // Если загружено новое изображение
        if (req.file) {
            // Удаляем старое изображение
            if (existingTask.icon && !existingTask.icon.startsWith('http')) {
                const fileName = existingTask.icon.split('/').pop();
                const isProduction = process.env.NODE_ENV === 'production';
                const uploadsDir = isProduction ? '/data/uploads' : path.join(process.cwd(), 'uploads');
                const oldFilePath = path.join(uploadsDir, fileName);

                if (fs.existsSync(oldFilePath)) {
                    fs.unlinkSync(oldFilePath);
                    console.log(`🗑️ Deleted old task file: ${oldFilePath}`);
                }
            }

            taskData.icon = `/uploads/${req.file.filename}`;
            console.log(`✅ Task image updated: ${taskData.icon}`);
        }

        // Обновляем задание
        const task = await Task.findByIdAndUpdate(id, taskData, { new: true });
        console.log('✅ Task updated successfully:', task._id);

        res.json({ success: true, data: task });
    } catch (error) {
        console.error('❌ Error updating task with image:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Создание продукта с изображением
router.post('/products/upload', handleProductUploadErrors, async (req, res) => {
    try {
        console.log('📦 Creating product with image...');
        console.log('Received body:', req.body);
        console.log('Received file:', req.file ? req.file.filename : 'No file');

        // Находим максимальный order и увеличиваем на 1
        const lastProduct = await Product.findOne({}).sort({ order: -1 });
        const order = lastProduct ? lastProduct.order + 1 : 0;

        const productData = {
            name: req.body.name,
            description: req.body.description,
            type: req.body.type || 'digital',
            requiredIncome: Number(req.body.requiredIncome) || 0,
            claimInstructions: req.body.claimInstructions || '',
            gradient: req.body.gradient || 'linear-gradient(140.83deg, rgb(111, 95, 242) 0%, rgb(73, 51, 131) 100%)',
            active: req.body.active === 'true' || req.body.active === true,
            order,
            stats: {
                claims: 0,
                completedClaims: 0,
                cancelledClaims: 0
            }
        };

        // Если есть файл, добавляем его путь
        if (req.file) {
            productData.image = `/uploads/${req.file.filename}`;
            console.log(`✅ Product image saved: ${productData.image}`);
        } else if (req.body.image) {
            productData.image = req.body.image;
        }

        // Проверяем обязательные поля
        if (!productData.name || !productData.description) {
            return res.status(400).json({
                success: false,
                error: `Missing required fields: ${!productData.name ? 'name' : ''} ${!productData.description ? 'description' : ''}`
            });
        }

        // Создаем продукт
        const product = await Product.create(productData);
        console.log('✅ Product created successfully:', product._id);

        res.status(201).json({ success: true, data: product });
    } catch (error) {
        console.error('❌ Error creating product with image:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Обновление продукта с изображением
router.put('/products/:id/upload', handleProductUploadErrors, async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`📦 Updating product ${id} with image...`);
        
        const productData = { ...req.body };

        // Преобразуем значения
        productData.requiredIncome = Number(productData.requiredIncome) || 0;
        productData.active = productData.active === 'true' || productData.active === true;

        // Находим существующий продукт
        const existingProduct = await Product.findById(id);
        if (!existingProduct) {
            return res.status(404).json({ success: false, message: 'Продукт не найден' });
        }

        // Если загружено новое изображение
        if (req.file) {
            // Удаляем старое изображение
            if (existingProduct.image && !existingProduct.image.startsWith('http')) {
                const fileName = existingProduct.image.split('/').pop();
                const isProduction = process.env.NODE_ENV === 'production';
                const uploadsDir = isProduction ? '/data/uploads' : path.join(process.cwd(), 'uploads');
                const oldFilePath = path.join(uploadsDir, fileName);

                if (fs.existsSync(oldFilePath)) {
                    fs.unlinkSync(oldFilePath);
                    console.log(`🗑️ Deleted old product image: ${oldFilePath}`);
                }
            }

            productData.image = `/uploads/${req.file.filename}`;
            console.log(`✅ Product image updated: ${productData.image}`);
        }

        // Обновляем продукт
        const product = await Product.findByIdAndUpdate(id, productData, { new: true });
        console.log('✅ Product updated successfully:', product._id);

        res.json({ success: true, data: product });
    } catch (error) {
        console.error('❌ Error updating product with image:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ===== ОСТАЛЬНЫЕ РОУТЫ (без изменений) =====

// ПОЛЬЗОВАТЕЛИ
router.get('/users', async (req, res) => {
    try {
        const { page = 1, limit = 50, search = '', sortBy = 'lastLogin', sortOrder = 'desc' } = req.query;

        const filterQuery = search ? {
            $or: [
                { first_name: { $regex: search, $options: 'i' } },
                { last_name: { $regex: search, $options: 'i' } },
                { username: { $regex: search, $options: 'i' } },
                { telegramId: { $regex: search, $options: 'i' } }
            ]
        } : {};

        const sortOptions = {};
        sortOptions[sortBy === 'level' ? 'gameData.level.current' :
            sortBy === 'income' ? 'gameData.passiveIncome' : sortBy] =
            sortOrder === 'asc' ? 1 : -1;

        const users = await User.find(filterQuery)
            .select('telegramId first_name last_name username photo_url language_code gameData lastLogin registeredAt blocked')
            .sort(sortOptions)
            .skip((page - 1) * limit)
            .limit(Number(limit));

        const totalUsers = await User.countDocuments(filterQuery);

        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);

        const activeToday = await User.countDocuments({
            ...filterQuery,
            lastLogin: { $gte: todayStart }
        });

        const newThisWeek = await User.countDocuments({
            ...filterQuery,
            registeredAt: { $gte: weekAgo }
        });

        const totalIncomeResult = await User.aggregate([
            { $match: filterQuery },
            { $group: {
                    _id: null,
                    totalIncome: { $sum: '$gameData.passiveIncome' }
                }}
        ]);

        const totalIncome = totalIncomeResult[0]?.totalIncome || 0;

        const formattedUsers = users.map(user => ({
            id: user.telegramId,
            name: `${user.first_name} ${user.last_name || ''}`.trim(),
            username: user.username,
            photoUrl: user.photo_url,
            languageCode: user.language_code,
            level: user.gameData?.level?.current || 1,
            passiveIncome: user.gameData?.passiveIncome || 0,
            balance: user.gameData?.balance || 0,
            lastLogin: user.lastLogin,
            registeredAt: user.registeredAt,
            blocked: user.blocked || false
        }));

        res.json({
            success: true,
            data: {
                users: formattedUsers,
                pagination: {
                    currentPage: Number(page),
                    totalPages: Math.ceil(totalUsers / limit),
                    totalUsers,
                    pageSize: Number(limit)
                },
                stats: {
                    total: totalUsers,
                    activeToday,
                    newThisWeek,
                    totalIncome
                }
            }
        });
    } catch (error) {
        console.error('Ошибка получения пользователей:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Получение конкретного пользователя
router.get('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findOne({ telegramId: id });

        if (!user) {
            return res.status(404).json({ success: false, message: 'Пользователь не найден' });
        }

        res.json({ success: true, data: user });
    } catch (error) {
        console.error('Ошибка получения пользователя:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Обновление пользователя
router.put('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`Запрос на обновление пользователя ${id}`);

        if (!req.body.gameData) {
            return res.status(400).json({
                success: false,
                message: 'Отсутствуют gameData в запросе'
            });
        }

        const update = {};

        if (req.body.gameData) {
            update['gameData.balance'] = req.body.gameData.balance;
            update['gameData.passiveIncome'] = req.body.gameData.passiveIncome;

            if (req.body.gameData.level) {
                update['gameData.level.current'] = req.body.gameData.level.current;
                update['gameData.level.progress'] = req.body.gameData.level.progress;
                update['gameData.level.title'] = req.body.gameData.level.title;
            }
        }

        if (req.body.lastLogin) {
            update.lastLogin = new Date(req.body.lastLogin);
        }

        const user = await User.findOneAndUpdate(
            { telegramId: id },
            { $set: update },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Пользователь не найден'
            });
        }

        console.log(`Пользователь ${id} успешно обновлен`);
        res.json({ success: true, data: user });
    } catch (error) {
        console.error('Ошибка обновления пользователя:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Действия над пользователем
router.post('/users/actions', async (req, res) => {
    try {
        const { action, userId } = req.body;

        const user = await User.findOne({ telegramId: userId });
        if (!user) {
            return res.status(404).json({ success: false, message: 'Пользователь не найден' });
        }

        switch (action) {
            case 'block':
                user.blocked = !user.blocked;
                await user.save();
                break;

            case 'reset':
                user.gameData = {
                    balance: 0,
                    passiveIncome: 0,
                    energy: {
                        current: 1000,
                        max: 1000,
                        regenRate: 1,
                        lastRegenTime: Date.now()
                    },
                    level: {
                        current: 1,
                        progress: 0,
                        title: 'Новичок'
                    },
                    multipliers: {
                        tapValue: 1,
                        tapMultiplier: 1,
                        incomeBoost: 1
                    },
                    investments: {
                        purchased: [],
                        activeIncome: 0,
                        lastCalculation: Date.now()
                    },
                    stats: {
                        totalClicks: 0,
                        totalEarned: 0,
                        maxPassiveIncome: 0
                    }
                };
                await user.save();
                break;

            default:
                return res.status(400).json({ success: false, message: 'Неизвестное действие' });
        }

        res.json({ success: true, data: user });
    } catch (error) {
        console.error('Ошибка выполнения действия с пользователем:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ПРОДУКТЫ

// Получение всех заявок (последние 10)
router.get('/products/claims/recent', async (req, res) => {
    try {
        const claims = await ProductClaim.find({})
            .populate('productId')
            .sort({ createdAt: -1 })
            .limit(10);

        res.json({ success: true, data: claims });
    } catch (error) {
        console.error('Ошибка получения последних заявок:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Получение всех продуктов
router.get('/products', async (req, res) => {
    try {
        const products = await Product.find({}).sort({ order: 1 });

        for (const product of products) {
            if (!product.stats || typeof product.stats.claims === 'undefined') {
                const claimsCount = await ProductClaim.countDocuments({ productId: product._id });
                const completedCount = await ProductClaim.countDocuments({
                    productId: product._id,
                    status: 'completed'
                });
                const cancelledCount = await ProductClaim.countDocuments({
                    productId: product._id,
                    status: 'cancelled'
                });

                product.stats = {
                    claims: claimsCount,
                    completedClaims: completedCount,
                    cancelledClaims: cancelledCount
                };

                await product.save();
            }
        }

        res.json({ success: true, data: products });
    } catch (error) {
        console.error('Ошибка получения продуктов:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Создание нового продукта
router.post('/products', async (req, res) => {
    try {
        const lastProduct = await Product.findOne({}).sort({ order: -1 });
        const order = lastProduct ? lastProduct.order + 1 : 0;

        const product = await Product.create({
            ...req.body,
            order,
            stats: {
                claims: 0,
                completedClaims: 0,
                cancelledClaims: 0
            }
        });

        res.status(201).json({ success: true, data: product });
    } catch (error) {
        console.error('Detailed error:', error);
        res.status(400).json({
            success: false,
            error: error.message,
            details: error.stack
        });
    }
});

// Получение конкретного продукта
router.get('/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const product = await Product.findById(id);

        if (!product) {
            return res.status(404).json({ success: false, message: 'Продукт не найден' });
        }

        res.json({ success: true, data: product });
    } catch (error) {
        console.error('Ошибка получения продукта:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Обновление продукта
router.put('/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const product = await Product.findByIdAndUpdate(id, req.body, { new: true });

        if (!product) {
            return res.status(404).json({ success: false, message: 'Продукт не найден' });
        }

        res.json({ success: true, data: product });
    } catch (error) {
        console.error('Ошибка обновления продукта:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Удаление продукта
router.delete('/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const product = await Product.findByIdAndDelete(id);

        if (!product) {
            return res.status(404).json({ success: false, message: 'Продукт не найден' });
        }

        res.json({ success: true, data: {} });
    } catch (error) {
        console.error('Ошибка удаления продукта:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Изменение порядка продуктов
router.post('/products/reorder', async (req, res) => {
    try {
        const { orderedIds } = req.body;

        for (let i = 0; i < orderedIds.length; i++) {
            await Product.findByIdAndUpdate(orderedIds[i], { order: i });
        }

        const products = await Product.find({}).sort({ order: 1 });
        res.json({ success: true, data: products });
    } catch (error) {
        console.error('Ошибка изменения порядка продуктов:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Получение заявок на продукт
router.get('/products/:productId/claims', async (req, res) => {
    try {
        const { productId } = req.params;
        const claims = await ProductClaim.find({ productId }).populate('productId');
        res.json({ success: true, data: claims });
    } catch (error) {
        console.error('Ошибка получения заявок на продукт:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Обновление статуса заявки
router.put('/products/claims/:claimId', async (req, res) => {
    try {
        const { claimId } = req.params;
        const { status, note } = req.body;

        const claim = await ProductClaim.findByIdAndUpdate(
            claimId,
            { status, note },
            { new: true }
        ).populate('productId');

        if (!claim) {
            return res.status(404).json({ success: false, message: 'Заявка не найдена' });
        }

        if (status === 'completed' || status === 'cancelled') {
            const updateField = status === 'completed' ? 'stats.completedClaims' : 'stats.cancelledClaims';
            await Product.findByIdAndUpdate(
                claim.productId._id,
                { $inc: { [updateField]: 1 } }
            );
        }

        res.json({ success: true, data: claim });
    } catch (error) {
        console.error('Ошибка обновления статуса заявки:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== ДОБАВЬТЕ В adminRoutes.js ПОСЛЕ РОУТОВ ПРОДУКТОВ =====

// Middleware для обработки ошибок загрузки файлов инвестиций
const handleInvestmentUploadErrors = (req, res, next) => {
    return upload.single('investmentImage')(req, res, (err) => {
        if (err) {
            console.error('Investment file upload error:', err);
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({
                    success: false,
                    error: 'Размер файла превышает допустимый лимит (5MB)'
                });
            }
            return res.status(400).json({
                success: false,
                error: err.message
            });
        }
        next();
    });
};

// ===== РОУТЫ ДЛЯ ИНВЕСТИЦИЙ =====

// Получение всех инвестиций
router.get('/investments', async (req, res) => {
    try {
        // Импортируем модель инвестиции (добавьте в начало файла если нет)
        const Investment = (await import('../models/Investment.js')).default;
        
        const investments = await Investment.find({}).sort({ order: 1, category: 1 });
        
        res.json({ success: true, data: investments });
    } catch (error) {
        console.error('Ошибка получения инвестиций:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Создание инвестиции с изображением
router.post('/investments/upload', handleInvestmentUploadErrors, async (req, res) => {
    try {
        console.log('💰 Creating investment with image...');
        console.log('Received body:', req.body);
        console.log('Received file:', req.file ? req.file.filename : 'No file');

        // Импортируем модель инвестиции
        const Investment = (await import('../models/Investment.js')).default;

        // Находим максимальный order и увеличиваем на 1
        const lastInvestment = await Investment.findOne({}).sort({ order: -1 });
        const order = lastInvestment ? lastInvestment.order + 1 : 0;

        const investmentData = {
            name: req.body.name,
            description: req.body.description || '',
            category: req.body.category || 'finances',
            type: req.body.type || 'linear',
            baseIncome: Number(req.body.baseIncome) || 0,
            cost: Number(req.body.cost) || 0,
            level: Number(req.body.level) || 1,
            multiplier: Number(req.body.multiplier) || 1.2,
            bonus_percent: Number(req.body.bonus_percent) || 0,
            active: req.body.active === 'true' || req.body.active === true,
            order
        };

        // Если есть файл, добавляем его путь
        if (req.file) {
            investmentData.image = `/uploads/${req.file.filename}`;
            console.log(`✅ Investment image saved: ${investmentData.image}`);
        } else if (req.body.image) {
            investmentData.image = req.body.image;
        }

        // Проверяем обязательные поля
        if (!investmentData.name || !investmentData.category) {
            return res.status(400).json({
                success: false,
                error: `Missing required fields: ${!investmentData.name ? 'name' : ''} ${!investmentData.category ? 'category' : ''}`
            });
        }

        // Создаем инвестицию
        const investment = await Investment.create(investmentData);
        console.log('✅ Investment created successfully:', investment._id);

        res.status(201).json({ success: true, data: investment });
    } catch (error) {
        console.error('❌ Error creating investment with image:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Обновление инвестиции с изображением
router.put('/investments/:id/upload', handleInvestmentUploadErrors, async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`💰 Updating investment ${id} with image...`);
        
        // Импортируем модель инвестиции
        const Investment = (await import('../models/Investment.js')).default;
        
        const investmentData = { ...req.body };

        // Преобразуем значения
        investmentData.baseIncome = Number(investmentData.baseIncome) || 0;
        investmentData.cost = Number(investmentData.cost) || 0;
        investmentData.level = Number(investmentData.level) || 1;
        investmentData.multiplier = Number(investmentData.multiplier) || 1.2;
        investmentData.bonus_percent = Number(investmentData.bonus_percent) || 0;
        investmentData.active = investmentData.active === 'true' || investmentData.active === true;

        // Находим существующую инвестицию
        const existingInvestment = await Investment.findById(id);
        if (!existingInvestment) {
            return res.status(404).json({ success: false, message: 'Инвестиция не найдена' });
        }

        // Если загружено новое изображение
        if (req.file) {
            // Удаляем старое изображение
            if (existingInvestment.image && !existingInvestment.image.startsWith('http')) {
                const fileName = existingInvestment.image.split('/').pop();
                const isProduction = process.env.NODE_ENV === 'production';
                const uploadsDir = isProduction ? '/data/uploads' : path.join(process.cwd(), 'uploads');
                const oldFilePath = path.join(uploadsDir, fileName);

                if (fs.existsSync(oldFilePath)) {
                    fs.unlinkSync(oldFilePath);
                    console.log(`🗑️ Deleted old investment image: ${oldFilePath}`);
                }
            }

            investmentData.image = `/uploads/${req.file.filename}`;
            console.log(`✅ Investment image updated: ${investmentData.image}`);
        }

        // Обновляем инвестицию
        const investment = await Investment.findByIdAndUpdate(id, investmentData, { new: true });
        console.log('✅ Investment updated successfully:', investment._id);

        res.json({ success: true, data: investment });
    } catch (error) {
        console.error('❌ Error updating investment with image:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Создание инвестиции без изображения
router.post('/investments', async (req, res) => {
    try {
        const Investment = (await import('../models/Investment.js')).default;
        
        const lastInvestment = await Investment.findOne({}).sort({ order: -1 });
        const order = lastInvestment ? lastInvestment.order + 1 : 0;

        const investment = await Investment.create({
            ...req.body,
            order
        });

        res.status(201).json({ success: true, data: investment });
    } catch (error) {
        console.error('Error creating investment:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Получение конкретной инвестиции
router.get('/investments/:id', async (req, res) => {
    try {
        const Investment = (await import('../models/Investment.js')).default;
        const { id } = req.params;
        const investment = await Investment.findById(id);

        if (!investment) {
            return res.status(404).json({ success: false, message: 'Инвестиция не найдена' });
        }

        res.json({ success: true, data: investment });
    } catch (error) {
        console.error('Ошибка получения инвестиции:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Обновление инвестиции без изображения
router.put('/investments/:id', async (req, res) => {
    try {
        const Investment = (await import('../models/Investment.js')).default;
        const { id } = req.params;
        const investment = await Investment.findByIdAndUpdate(id, req.body, { new: true });

        if (!investment) {
            return res.status(404).json({ success: false, message: 'Инвестиция не найдена' });
        }

        res.json({ success: true, data: investment });
    } catch (error) {
        console.error('Ошибка обновления инвестиции:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Удаление инвестиции
router.delete('/investments/:id', async (req, res) => {
    try {
        const Investment = (await import('../models/Investment.js')).default;
        const { id } = req.params;
        
        const investment = await Investment.findById(id);
        if (!investment) {
            return res.status(404).json({ success: false, message: 'Инвестиция не найдена' });
        }

        // Удаляем изображение если есть
        if (investment.image && !investment.image.startsWith('http')) {
            const fileName = investment.image.split('/').pop();
            const isProduction = process.env.NODE_ENV === 'production';
            const uploadsDir = isProduction ? '/data/uploads' : path.join(process.cwd(), 'uploads');
            const oldFilePath = path.join(uploadsDir, fileName);

            if (fs.existsSync(oldFilePath)) {
                fs.unlinkSync(oldFilePath);
                console.log(`🗑️ Deleted investment image: ${oldFilePath}`);
            }
        }

        await Investment.findByIdAndDelete(id);
        res.json({ success: true, data: {} });
    } catch (error) {
        console.error('Ошибка удаления инвестиции:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Изменение порядка инвестиций
router.post('/investments/reorder', async (req, res) => {
    try {
        const Investment = (await import('../models/Investment.js')).default;
        const { orderedIds } = req.body;

        for (let i = 0; i < orderedIds.length; i++) {
            await Investment.findByIdAndUpdate(orderedIds[i], { order: i });
        }

        const investments = await Investment.find({}).sort({ order: 1 });
        res.json({ success: true, data: investments });
    } catch (error) {
        console.error('Ошибка изменения порядка инвестиций:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});


// УВЕДОМЛЕНИЯ

// Получение всех уведомлений
router.get('/notifications', async (req, res) => {
    try {
        const notifications = await Notification.find({})
            .sort({ createdAt: -1 });

        res.json({ success: true, data: notifications });
    } catch (error) {
        console.error('Ошибка получения уведомлений:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Получение статистики по уведомлениям
router.get('/notifications/stats', async (req, res) => {
    try {
        const stats = await Notification.aggregate([
            {
                $group: {
                    _id: null,
                    totalSent: { $sum: '$stats.sentCount' },
                    totalRead: { $sum: '$stats.readCount' },
                    avgReadRate: {
                        $avg: {
                            $cond: [
                                { $gt: ['$stats.sentCount', 0] },
                                { $divide: ['$stats.readCount', '$stats.sentCount'] },
                                0
                            ]
                        }
                    }
                }
            }
        ]);

        res.json({
            success: true,
            data: stats[0] || {
                totalSent: 0,
                totalRead: 0,
                avgReadRate: 0
            }
        });
    } catch (error) {
        console.error('Ошибка получения статистики уведомлений:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Получение конкретного уведомления
router.get('/notifications/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const notification = await Notification.findById(id);

        if (!notification) {
            return res.status(404).json({ success: false, message: 'Уведомление не найдено' });
        }

        res.json({ success: true, data: notification });
    } catch (error) {
        console.error('Ошибка получения уведомления:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Обновление уведомления
router.put('/notifications/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const notification = await Notification.findById(id);

        if (!notification) {
            return res.status(404).json({ success: false, message: 'Уведомление не найдено' });
        }

        if (notification.status === 'sent') {
            return res.status(400).json({
                success: false,
                message: 'Нельзя обновить отправленное уведомление'
            });
        }

        const updatedNotification = await Notification.findByIdAndUpdate(
            id,
            req.body,
            { new: true }
        );

        res.json({ success: true, data: updatedNotification });
    } catch (error) {
        console.error('Ошибка обновления уведомления:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Удаление уведомления
router.delete('/notifications/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const notification = await Notification.findById(id);

        if (!notification) {
            return res.status(404).json({ success: false, message: 'Уведомление не найдено' });
        }

        if (notification.status === 'sent') {
            return res.status(400).json({
                success: false,
                message: 'Нельзя удалить отправленное уведомление'
            });
        }

        await notification.deleteOne();
        res.json({ success: true, data: {} });
    } catch (error) {
        console.error('Ошибка удаления уведомления:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ЗАДАНИЯ

// Получение всех заданий
router.get('/tasks', async (req, res) => {
    try {
        const tasks = await Task.find({}).sort({ createdAt: -1 });
        res.json({ success: true, data: tasks });
    } catch (error) {
        console.error('Ошибка получения заданий:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Создание нового задания
router.post('/tasks', async (req, res) => {
    try {
        const task = await Task.create(req.body);
        res.status(201).json({ success: true, data: task });
    } catch (error) {
        console.error('Ошибка создания задания:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Получение конкретного задания
router.get('/tasks/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const task = await Task.findById(id);

        if (!task) {
            return res.status(404).json({ success: false, message: 'Задание не найдено' });
        }

        res.json({ success: true, data: task });
    } catch (error) {
        console.error('Ошибка получения задания:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Обновление задания
router.put('/tasks/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const task = await Task.findByIdAndUpdate(id, req.body, { new: true });

        if (!task) {
            return res.status(404).json({ success: false, message: 'Задание не найдено' });
        }

        res.json({ success: true, data: task });
    } catch (error) {
        console.error('Ошибка обновления задания:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Удаление задания
router.delete('/tasks/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const task = await Task.findByIdAndDelete(id);

        if (!task) {
            return res.status(404).json({ success: false, message: 'Задание не найдено' });
        }

        res.json({ success: true, data: {} });
    } catch (error) {
        console.error('Ошибка удаления задания:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

export default router;
