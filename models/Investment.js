// models/Investment.js
import mongoose from 'mongoose';

const InvestmentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    description: {
        type: String,
        default: ''
    },
    category: {
        type: String,
        enum: ['finances', 'technology', 'business', 'realestate'],
        required: true
    },
    type: {
        type: String,
        enum: ['linear', 'parabolic', 'exponential', 'inverse_parabolic'],
        default: 'linear'
    },
    baseIncome: {
        type: Number,
        required: true
    },
    cost: {
        type: Number,
        required: true
    },
    level: {
        type: Number,
        default: 1
    },
    multiplier: {
        type: Number,
        default: 1.2
    },
    bonus_percent: {
        type: Number,
        default: 0
    },
    image: {
        type: String,
        default: ''
    },
    active: {
        type: Boolean,
        default: true
    },
    order: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

export default mongoose.models.Investment || mongoose.model('Investment', InvestmentSchema);