// models/User.js
import mongoose from "mongoose";

const PurchasedInvestmentSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true
    },
    level: {
        type: Number,
        required: true,
        default: 1
    },
    income: {
        type: Number,
        required: true,
        default: 0
    },
    purchaseDate: {
        type: Date,
        default: Date.now
    },
    type: {
        type: String,
        required: true
    }
}, {_id: false})

const UserSchema = new mongoose.Schema(
    {
        // Основная информация из Telegram
        telegramId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        first_name: String,
        last_name: String,
        username: String,
        photo_url: String,
        language_code: String,

        // Состояние пользователя
        blocked: {
            type: Boolean,
            default: false,
        },

        // Временные метки
        registeredAt: {
            type: Date,
            default: Date.now,
        },
        lastLogin: {
            type: Date,
            default: Date.now,
        },
        lastPassiveIncomeAt: {
            type: Date,
            default: Date.now,
        },

        // Игровые данные (основной объект)
        gameData: {
            balance: {
                type: Number,
                default: 0,
            },
            passiveIncome: {
                type: Number,
                default: 0,
            },
            energy: {
                current: {type: Number, default: 1000},
                max: {type: Number, default: 1000},
                regenRate: {type: Number, default: 1},
                lastRegenTime: {type: Number, default: () => Date.now()},
            },
            level: {
                current: {type: Number, default: 1},
                max: {type: Number, default: 10},
                progress: {type: Number, default: 0},
                title: {type: String, default: "Новичок"},
            },
            multipliers: {
                tapValue: {type: Number, default: 1},
                tapMultiplier: {type: Number, default: 1},
                incomeBoost: {type: Number, default: 1},
            },
            investments: {
                purchased: {
                    type: [PurchasedInvestmentSchema],
                    default: []
                },
                activeIncome: {type: Number, default: 0},
                lastCalculation: {type: Date, default: Date.now},
            },
            stats: {
                totalClicks: {type: Number, default: 0},
                totalEarned: {type: Number, default: 0},
                maxPassiveIncome: {type: Number, default: 0},
            },
        },
    },
    {
        timestamps: true, // Добавляет createdAt и updatedAt автоматически
    },
);

// Опционально: добавь индекс для производительности
UserSchema.index({telegramId: 1});

// Экспорт модели (чтобы избежать повторной компиляции в dev-среде)
export default mongoose.models.User || mongoose.model("User", UserSchema);
