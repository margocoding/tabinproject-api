// bot.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import dbConnect from './lib/dbConnect.js';
import cors from 'cors';
import config from './config.js';
import referralRoutes from './routes/referralRoutes.js';
import productRoutes from './routes/productRoutes.js';
import investmentRoutes from './routes/investmentRoutes.js';

import fs from 'fs';

// Импорт моделей
import User from './models/User.js';
import Product from './models/Product.js';
import ProductClaim from './models/ProductClaim.js';
import Notification from './models/Notification.js';
import Referral from './models/Referral.js';

// Импорт маршрутов
import adminRoutes from './routes/adminRoutes.js';
import userRoutes from './routes/userRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';

// Настройка __dirname для ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Инициализация Express и WebSocket
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Хранилище WebSocket клиентов
const clients = new Map();

// ===== ИСПРАВЛЕННАЯ НАСТРОЙКА UPLOADS =====

// Настраиваем директорию для загрузок
const isProduction = process.env.NODE_ENV === 'production';
const uploadsPath = isProduction ? '/data/uploads' : path.join(__dirname, 'uploads');

// Настраиваем статическую раздачу файлов из директории uploads
app.use('/uploads', express.static(uploadsPath));
console.log(`📁 Serving static files from: ${uploadsPath} via /uploads/ route`);

// Если директория не существует, создаем её
if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
    console.log(`✅ Created uploads directory: ${uploadsPath}`);
}

// Создаем поддиректории, если нужно
const subdirs = ['products', 'investments', 'tasks'];
subdirs.forEach(subdir => {
    const fullPath = path.join(uploadsPath, subdir);
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        console.log(`✅ Created subdirectory: ${fullPath}`);
    }
});

// Логирование конфигурации uploads
console.log('\n=== UPLOADS CONFIGURATION ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('Is Production:', isProduction);
console.log('Uploads Path:', uploadsPath);
console.log('Directory exists:', fs.existsSync(uploadsPath));
if (fs.existsSync(uploadsPath)) {
    try {
        const files = fs.readdirSync(uploadsPath);
        console.log('Files count:', files.length);
        console.log('Sample files:', files.slice(0, 5));
    } catch (error) {
        console.log('Error reading directory:', error.message);
    }
}
console.log('==============================\n');

// ВАЖНО: Удаляем прежние CORS-настройки и используем только один подход
// для предотвращения конфликтов между разными middleware

// Полностью отключаем CORS-ограничения для тестирования
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With');

    // Обработка preflight запросов OPTIONS
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    next();
});

// Логирование запросов
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    if (Object.keys(req.body || {}).length > 0) {
        console.log('Request body:', JSON.stringify(req.body, null, 2));
    }

    // Сохраняем оригинальный метод res.json
    const originalJson = res.json;

    // Переопределяем метод res.json для логирования ответов
    res.json = function(data) {
        console.log(`Response for ${req.method} ${req.url}:`, JSON.stringify(data, null, 2));
        originalJson.call(this, data);
    };

    next();
});

// Парсинг JSON.
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== ТЕСТОВЫЙ ENDPOINT ДЛЯ UPLOADS =====

// Тестовый endpoint для проверки загрузок
app.get('/test-uploads', (req, res) => {
    try {
        const files = fs.readdirSync(uploadsPath).slice(0, 20);
        
        res.json({
            success: true,
            uploadsPath: uploadsPath,
            isProduction: isProduction,
            filesCount: files.length,
            files: files,
            testUrl: `${req.protocol}://${req.get('host')}/uploads/`,
            sampleFileUrl: files.length > 0 ? `${req.protocol}://${req.get('host')}/uploads/${files[0]}` : null
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message, 
            uploadsPath: uploadsPath,
            exists: fs.existsSync(uploadsPath)
        });
    }
});

// Альтернативный способ раздачи файлов (если статический не работает)
app.get('/uploads/*', (req, res, next) => {
    const filePath = req.path.replace('/uploads/', '');
    const fullPath = path.join(uploadsPath, filePath);
    
    console.log(`📁 Запрос файла: ${req.path} → ${fullPath}`);
    
    if (fs.existsSync(fullPath)) {
        console.log(`✅ Файл найден, отправляем: ${fullPath}`);
        res.sendFile(fullPath);
    } else {
        console.log(`❌ Файл не найден: ${fullPath}`);
        // Пропускаем дальше к статическому middleware
        next();
    }
});

// Инициализация бота
const bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { webHook: true });

// Добавление бота и клиентов в объект запроса
app.use((req, res, next) => {
    req.bot = bot;
    req.clients = clients;
    next();
});

// Подключение маршрутов API
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/products', productRoutes);
app.use('/api/admin/investments', investmentRoutes);
app.use('/api/investments', investmentRoutes);

// Обработка WebSocket подключений
wss.on('connection', (ws, req) => {
    const userId = new URLSearchParams(req.url.slice(1)).get('userId');

    if (userId) {
        clients.set(userId, ws);
        console.log(`[WebSocket] Клиент подключен: ${userId}`);

        // Отправляем тестовое сообщение для проверки соединения
        ws.send(JSON.stringify({
            type: 'connection_test',
            message: 'WebSocket соединение установлено'
        }));

        ws.on('message', (message) => {
            console.log(`[WebSocket] Получено сообщение от ${userId}:`, message);
        });

        ws.on('close', () => {
            clients.delete(userId);
            console.log(`[WebSocket] Клиент отключен: ${userId}`);
        });

        ws.on('error', (error) => {
            console.error(`[WebSocket] Ошибка для клиента ${userId}:`, error);
        });
    }
});

// Webhook для Telegram
app.post(`/webhook/${config.TELEGRAM_BOT_TOKEN}`, async (req, res) => {
    try {
        await bot.processUpdate(req.body);
        res.sendStatus(200);
    } catch (error) {
        console.error('Ошибка webhook:', error);
        res.sendStatus(500);
    }
});

// Обработка всех входящих текстовых сообщений (не команд)
bot.on('text', async (msg) => {
    try {
        // Игнорируем команды, начинающиеся с /
        if (msg.text && msg.text.startsWith('/')) {
            console.log(`Получена команда, игнорируем в общем обработчике: ${msg.text}`);
            return;
        }

        const userId = msg.from.id;
        console.log(`Получено текстовое сообщение от пользователя ${userId}: ${msg.text}`);

        // Проверяем, существует ли пользователь в базе данных
        const user = await User.findOne({ telegramId: userId.toString() });

        // Если пользователя нет в базе, отправляем приветственное сообщение
        if (!user) {
            console.log(`Новый пользователь ${userId}, отправляем приветственное сообщение`);

            const welcomeMessage = `👋 Привет! Я игровой бот.

🎮 Добро пожаловать в увлекательную экономическую игру, где вы можете развивать свой виртуальный бизнес, зарабатывать деньги и соревноваться с друзьями!

Чтобы начать игру, отправьте команду /start.`;

            await bot.sendMessage(userId, welcomeMessage);
        }
    } catch (error) {
        console.error('Ошибка обработки текстового сообщения:', error);
    }
});

// Обновленная часть кода для bot.js, где изменяется кнопка запуска игры

// В обработчике команды /start, изменяем формирование кнопки
bot.onText(/\/start(.*)/, async (msg, match) => {
    try {
        const startParam = match[1].trim();
        const userId = msg.from.id;

        console.log('Получена команда /start:', {
            param: startParam,
            user: msg.from
        });

        // Создание или обновление пользователя
        const userData = await User.findOneAndUpdate(
            { telegramId: userId.toString() },
            {
                $setOnInsert: {
                    first_name: msg.from.first_name,
                    last_name: msg.from.last_name,
                    username: msg.from.username,
                    language_code: msg.from.language_code,
                    photo_url: null,
                    registeredAt: new Date(),
                    gameData: {
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
                            max: 10,
                            progress: 0,
                            title: 'Новичок'
                        }
                    }
                },
                $set: {
                    lastLogin: new Date()
                }
            },
            { upsert: true, new: true }
        );

        console.log('Пользователь сохранен/обновлен:', userData);

        // Обработка реферальной системы
        if (startParam.startsWith('ref_')) {
            const referrerId = startParam.substring(4);

            try {
                await Referral.create({
                    referrerId,
                    userId: userId.toString(),
                    userData: {
                        first_name: msg.from.first_name,
                        last_name: msg.from.last_name,
                        username: msg.from.username,
                        language_code: msg.from.language_code
                    }
                });

                // Уведомление реферера
                await bot.sendMessage(referrerId,
                    `🎉 У вас новый реферал: ${msg.from.first_name}!\nКогда он начнет играть, вы получите бонус.`
                );
            } catch (error) {
                // Если пользователь уже существует, игнорируем ошибку
                if (error.code !== 11000) {
                    console.error('Ошибка обработки реферала:', error);
                }
            }
        }

        // Отправка приветственного сообщения
        const welcomeMessage = startParam.startsWith('ref_')
            ? '🎮 Добро пожаловать в игру! Вы присоединились по реферальной ссылке.\n\nРазвивайте свой виртуальный бизнес, зарабатывайте деньги и соревнуйтесь с друзьями!'
            : '🎮 Добро пожаловать в игру!\n\nРазвивайте свой виртуальный бизнес, зарабатывайте деньги и соревнуйтесь с друзьями!';

        // Используем прямую URL-схему Telegram для запуска в режиме Fullsize
        await bot.sendMessage(userId, welcomeMessage, {
            reply_markup: {
                inline_keyboard: [[
                    {
                        text: '🎮 Открыть игру',
                        url: 'https://t.me/capital_passive_bot/?startapp=start'
                    }
                ]]
            }
        });
    } catch (error) {
        console.error('Ошибка обработки команды /start:', error);
        await bot.sendMessage(msg.from.id, 'Произошла ошибка. Пожалуйста, попробуйте позже.');
    }
});

// Обработка ошибок бота
bot.on('error', (error) => {
    console.error('Ошибка бота:', error);
});

bot.on('webhook_error', (error) => {
    console.error('Ошибка webhook:', error);
});

// Глобальная обработка ошибок
app.use((err, req, res, next) => {
    console.error('Ошибка сервера:', err);
    res.status(500).json({
        success: false,
        error: 'Внутренняя ошибка сервера'
    });
});

// Запуск сервера
const startServer = async () => {
    try {
        await dbConnect();
        console.log('База данных подключена');

        server.listen(config.PORT, () => {
            console.log(`Сервер запущен на порту ${config.PORT}`);
            console.log('Конфигурация:', {
                WEBAPP_URL: config.WEBAPP_URL,
                API_URL: config.API_URL,
                APP_URL: config.APP_URL,
                MONGODB_URI: 'Connected'
            });
        });

        // Инициализация настроек по умолчанию
        const GameSettings = (await import('./models/GameSettings.js')).default;
        await GameSettings.getDefaultSettings();
        console.log('Настройки игры инициализированы');

        if (config.APP_URL) {
            const webhookUrl = `${config.APP_URL}/webhook/${config.TELEGRAM_BOT_TOKEN}`;
            try {
                await bot.setWebHook(webhookUrl);
                console.log('Webhook установлен:', webhookUrl);

                const webhookInfo = await bot.getWebHookInfo();
                console.log('Информация о webhook:', webhookInfo);
            } catch (error) {
                console.error('Ошибка установки webhook:', error);
            }
        }
    } catch (error) {
        console.error('Ошибка запуска сервера:', error);
        process.exit(1);
    }
};

// Корректное завершение работы
const shutdown = async () => {
    console.log('Завершение работы...');
    try {
        await bot.closeWebHook();
        server.close(() => {
            console.log('Сервер остановлен');
            process.exit(0);
        });
    } catch (error) {
        console.error('Ошибка при завершении работы:', error);
        process.exit(1);
    }
};

// Обработчики процесса
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('uncaughtException', (error) => {
    console.error('Необработанное исключение:', error);
});
process.on('unhandledRejection', (error) => {
    console.error('Необработанное отклонение промиса:', error);
});

// Запуск сервера
console.log('Запуск сервера...');
startServer().catch(error => {
    console.error('Ошибка при запуске:', error);
    process.exit(1);
});

export default server;
