// routes/userRoutes.js
import express from 'express';
import User from '../models/User.js';

const router = express.Router();

// Basic user endpoint
router.get('/', async (req, res) => {
    try {
        res.json({ success: true, message: 'User API is working' });
    } catch (error) {
        console.error('Error in user route:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get user by ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findOne({ telegramId: id });

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({ success: true, data: user });
    } catch (error) {
        console.error('Error getting user:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


router.post('/:id/addPassiveIncome', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`[addPassiveIncome] request for user ${id} at ${new Date().toISOString()}`);

    const user = await User.findOne({ telegramId: id });
    if (!user) {
      console.warn(`[addPassiveIncome] user ${id} not found`);
      return res.status(404).json({ success: false, message: 'Пользователь не найден' });
    }

    const passiveIncome = Number(user.passiveIncome || 0); // месячный доход
    if (!passiveIncome || passiveIncome <= 0) {
      return res.json({ success: true, added: 0, balance: user.balance || 0 });
    }

    const now = Date.now();
    const lastTime = user.lastPassiveIncomeAt
      ? user.lastPassiveIncomeAt.getTime()
      : (user.createdAt ? user.createdAt.getTime() : now);

    const secondsPassed = Math.floor((now - lastTime) / 1000);
    if (secondsPassed <= 0) {
      return res.json({ success: true, added: 0, balance: user.balance || 0 });
    }

    const SECONDS_IN_MONTH = 30 * 24 * 60 * 60;
    const incomeToAdd = passiveIncome * (secondsPassed / SECONDS_IN_MONTH);

    // Атомарное обновление
    const updated = await User.findOneAndUpdate(
      {
        _id: user._id,
        lastPassiveIncomeAt: user.lastPassiveIncomeAt
      },
      {
        $inc: { balance: incomeToAdd },
        $set: { lastPassiveIncomeAt: new Date(now) }
      },
      { new: true }
    );

    if (!updated) {
      const fresh = await User.findById(user._id);
      return res.json({ success: true, added: 0, balance: fresh.balance });
    }

    console.log(`[addPassiveIncome] user ${id} +${incomeToAdd.toFixed(2)} (sec=${secondsPassed}) -> new balance=${updated.balance.toFixed(2)}`);
    return res.json({ success: true, added: incomeToAdd, balance: updated.balance });

  } catch (err) {
    console.error('[addPassiveIncome] error:', err);
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
});


// body: { investment: { _id|id, name, category, cost, level, multiplier, baseIncome, type, bonus_percent }, category? }
router.post('/:id/investments/purchase', async (req, res) => {
  try {
    const { id } = req.params; // telegramId
    const payload = req.body?.investment || {};
    const category = payload.category || req.body?.category;

    console.log(`[purchaseInvestment] request for user ${id}`, {
      invId: payload._id || payload.id,
      category
    });

    // 1) Пользователь
    const user = await User.findOne({ telegramId: id });
    if (!user) {
      console.warn(`[purchaseInvestment] user ${id} not found`);
      return res.status(404).json({ success: false, message: 'Пользователь не найден' });
    }

    // Гарантируем структуру gameData
    user.gameData = user.gameData || {};
    user.gameData.investments = user.gameData.investments || {};
    user.gameData.investments.purchased = Array.isArray(user.gameData.investments.purchased)
      ? user.gameData.investments.purchased
      : [];

    const g = user.gameData;
    const levelObj = g.level || { current: 1 };
    const playerLevel = Number(levelObj.current || 1);

    // 2) Проверка входных данных инвестиции
    const inv = {
      _id: String(payload._id || payload.id || ''),
      id: String(payload._id || payload.id || ''),
      name: payload.name || 'Investment',
      category: category || 'finances',
      cost: Number(payload.cost || 0),
      level: Number(payload.level || 1),            // базовый уровень в каталоге
      multiplier: Number(payload.multiplier || 1.5),
      baseIncome: Number(payload.baseIncome || 0),
      type: String(payload.type || 'linear'),
      bonus_percent: Number(payload.bonus_percent || 0)
    };

    if (!inv.id) {
      return res.status(400).json({ success: false, message: 'investment.id отсутствует' });
    }

    // 3) Текущий уровень покупки у пользователя
    const matchIdx = g.investments.purchased.findIndex(
      it => String(it.type) === String(inv.category) && String(it.id || it._id) === String(inv.id)
    );
    const currentLevel = matchIdx >= 0
      ? Number(g.investments.purchased[matchIdx].level || inv.level || 1)
      : Number(inv.level || 1);

    // 4) Серверные калькуляторы (совпадающие с фронтом)
    const calcCostForLevel = (investment, lvl) => {
      const baseCost = Number(investment.cost || 0);
      const m = Number(investment.multiplier || 1.5);
      const baseLevel = Number(investment.level || 1);
      const diff = lvl - baseLevel;
      if (diff <= 0) return baseCost;
      return Math.round(baseCost * Math.pow(m, diff));
    };

    const calcIncome = (investment, lvl, playerLvl) => {
      const baseIncome = Number(investment.baseIncome || 0);
      const mult = Number(investment.multiplier || 1.0);
      const t = String(investment.type || 'linear');
      const bonusPercent = Number(investment.bonus_percent || 0);
      const safePlayerLvl = Number(playerLvl || 1);

      switch (t) {
        case 'linear':
          return baseIncome * Math.pow(mult, lvl);
        case 'parabolic': {
          const bonus = baseIncome * bonusPercent * safePlayerLvl;
          return (baseIncome * Math.pow(mult, lvl)) + bonus;
        }
        case 'exponential':
          return baseIncome * Math.pow(mult, (lvl * safePlayerLvl));
        case 'inverse_parabolic': {
          const decay = 1 / (1 + (safePlayerLvl / 10));
          return baseIncome * Math.pow(mult, lvl) * decay;
        }
        default:
          return baseIncome;
      }
    };

    // 5) Стоимость текущего апгрейда
    const costNow = calcCostForLevel(inv, currentLevel);          // стоимость покупки на текущем уровне
    const newLevel = currentLevel + 1;
    const nextCost = calcCostForLevel(inv, newLevel + 1);         // стоимость для следующего апгрейда

    // 6) Проверка баланса
    const balance = Number(g.balance || 0);
    if (balance < costNow) {
      console.warn(`[purchaseInvestment] user ${id} not enough balance: need=${costNow}, have=${balance}`);
      return res.status(400).json({ success: false, message: 'Недостаточно монет', data: { balance } });
    }

    // 7) Пересчёт пассива инкрементально
    const prevIncome = calcIncome(inv, currentLevel, playerLevel);
    const newIncome = calcIncome(inv, newLevel, playerLevel);
    const deltaIncome = newIncome - prevIncome;

    // 7a) Конвертируем в месячный доход
    const MINUTES_IN_MONTH = 30 * 24 * 60; // стандартный месяц ~30 дней
    const deltaIncomeMonth = deltaIncome * MINUTES_IN_MONTH;

    console.log(`[purchaseInvestment][formula] deltaIncome=${deltaIncome} per min => deltaIncomeMonth=${deltaIncomeMonth}`);

    // 8) Применяем изменения
    g.balance = balance - costNow;
    g.passiveIncome = Number(g.passiveIncome || 0) + deltaIncomeMonth;

    if (matchIdx >= 0) {
      g.investments.purchased[matchIdx] = {
        ...g.investments.purchased[matchIdx],
        level: newLevel,
        cost: nextCost,
        id: inv.id,
        type: inv.category,
        name: inv.name
      };
    } else {
      g.investments.purchased.push({
        id: inv.id,
        _id: inv.id,
        type: inv.category,
        name: inv.name,
        level: newLevel,
        cost: nextCost
      });
    }

    await user.save();

    console.log(
      `[purchaseInvestment] user ${id} bought ${inv.name} (lvl ${currentLevel}→${newLevel}) ` +
      `-cost=${costNow}, +incomeMonth=${deltaIncomeMonth}, balance=${g.balance}, passiveIncome=${g.passiveIncome}`
    );

    return res.json({
      success: true,
      data: { gameData: user.gameData }
    });
  } catch (err) {
    console.error('[purchaseInvestment] error:', err);
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
});



export default router;