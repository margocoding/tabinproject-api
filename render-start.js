// render-start.js
import {createRequire} from 'module';
import dbConnect from './lib/dbConnect.js';

const require = createRequire(import.meta.url);


(async () => {
    try {
        await dbConnect(); // Подключаемся к базе данных
        console.log("База данных успешно подключена");

        // Запускаем бота
        import('./bot.js').catch(err => {
            console.error('Ошибка запуска бота:', err);
            process.exit(1);
        });
    } catch (error) {
        console.error('Ошибка подключения к базе данных:', error);
        process.exit(1);
    }
})();


// Запускаем бота
import('./bot.js').catch(err => {
    console.error('Error starting bot:', err);
    process.exit(1);
});