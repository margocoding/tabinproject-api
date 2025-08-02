// routes/investmentRoutes.js - ПОЛНАЯ ВЕРСИЯ
import express from 'express';
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

// ===== НАСТРОЙКА MULTER ДЛЯ ИНВЕСТИЦИЙ =====

// Фильтр файлов (только изображения)
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Разрешены только изображения!'), false);
    }
};

// Конфигурация хранилища для multer
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        // Используем ту же логику что и в bot.js
        const isProduction = process.env.NODE_ENV === 'production';
        const uploadDir = isProduction ? '/data/uploads' : path.join(process.cwd(), 'uploads');
        
        // Создаем директорию, если она не существует
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        console.log(`📁 Investment upload destination: ${uploadDir} (production: ${isProduction})`);
        cb(null, uploadDir);
    },
    filename: function(req, file, cb) {
        // Генерируем уникальное имя файла
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const filename = 'investment-' + uniqueSuffix + ext;
        
        console.log(`💰 Generated investment filename: ${filename}`);
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

// ===== РОУТЫ ИНВЕСТИЦИЙ =====

// Получение всех инвестиций
router.get('/', async (req, res) => {
    try {
        // Динамический импорт модели
        const Investment = (await import('../models/Investment.js')).default;
        
        const investments = await Investment.find({}).sort({ order: 1, category: 1 });
        
        console.log(`📊 Found ${investments.length} investments`);
        res.json({ success: true, data: investments });
    } catch (error) {
        console.error('❌ Error getting investments:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Создание инвестиции с изображением
router.post('/upload', handleInvestmentUploadErrors, async (req, res) => {
    try {
        console.log('💰 Creating investment with image...');
        console.log('Received body:', req.body);
        console.log('Received file:', req.file ? req.file.filename : 'No file');

        // Динамический импорт модели
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
router.put('/:id/upload', handleInvestmentUploadErrors, async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`💰 Updating investment ${id} with image...`);
        
        // Динамический импорт модели
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
router.post('/', async (req, res) => {
    try {
        console.log('💰 Creating investment without image...');
        
        const Investment = (await import('../models/Investment.js')).default;
        
        const lastInvestment = await Investment.findOne({}).sort({ order: -1 });
        const order = lastInvestment ? lastInvestment.order + 1 : 0;

        const investment = await Investment.create({
            ...req.body,
            order
        });

        console.log('✅ Investment created successfully:', investment._id);
        res.status(201).json({ success: true, data: investment });
    } catch (error) {
        console.error('❌ Error creating investment:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Получение конкретной инвестиции
router.get('/:id', async (req, res) => {
    try {
        const Investment = (await import('../models/Investment.js')).default;
        const { id } = req.params;
        const investment = await Investment.findById(id);

        if (!investment) {
            return res.status(404).json({ success: false, message: 'Инвестиция не найдена' });
        }

        res.json({ success: true, data: investment });
    } catch (error) {
        console.error('❌ Error getting investment:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Обновление инвестиции без изображения
router.put('/:id', async (req, res) => {
    try {
        console.log(`💰 Updating investment ${req.params.id} without image...`);
        
        const Investment = (await import('../models/Investment.js')).default;
        const { id } = req.params;
        const investment = await Investment.findByIdAndUpdate(id, req.body, { new: true });

        if (!investment) {
            return res.status(404).json({ success: false, message: 'Инвестиция не найдена' });
        }

        console.log('✅ Investment updated successfully:', investment._id);
        res.json({ success: true, data: investment });
    } catch (error) {
        console.error('❌ Error updating investment:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Удаление инвестиции
router.delete('/:id', async (req, res) => {
    try {
        console.log(`💰 Deleting investment ${req.params.id}...`);
        
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
        console.log('✅ Investment deleted successfully:', id);
        res.json({ success: true, data: {} });
    } catch (error) {
        console.error('❌ Error deleting investment:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Изменение порядка инвестиций
router.post('/reorder', async (req, res) => {
    try {
        console.log('💰 Reordering investments...');
        
        const Investment = (await import('../models/Investment.js')).default;
        const { orderedIds } = req.body;

        for (let i = 0; i < orderedIds.length; i++) {
            await Investment.findByIdAndUpdate(orderedIds[i], { order: i });
        }

        const investments = await Investment.find({}).sort({ order: 1 });
        console.log('✅ Investments reordered successfully');
        res.json({ success: true, data: investments });
    } catch (error) {
        console.error('❌ Error reordering investments:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Получение инвестиций по категории
router.get('/category/:category', async (req, res) => {
    try {
        const Investment = (await import('../models/Investment.js')).default;
        const { category } = req.params;
        
        const investments = await Investment.find({ 
            category, 
            active: true 
        }).sort({ order: 1 });

        console.log(`📊 Found ${investments.length} investments in category: ${category}`);
        res.json({ success: true, data: investments });
    } catch (error) {
        console.error('❌ Error getting investments by category:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
