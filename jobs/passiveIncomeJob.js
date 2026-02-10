import cron from 'node-cron';
import User from '../models/User.js';

export function startPassiveIncomeCron() {
  cron.schedule('* * * * *', async () => {
    const startedAt = new Date();
    console.log(`[passiveIncomeCron] start: ${startedAt.toISOString()}`);

    try {
      const now = Date.now();
      const cutoff = new Date(now - 1000);

      const cursor = User.find({
        'gameData.passiveIncome': { $gt: 0 },
        $or: [
          { lastPassiveIncomeAt: { $lt: cutoff } },
          { lastPassiveIncomeAt: { $exists: false } }
        ]
      }).cursor();

      let processed = 0;
      let totalAdded = 0;

      for (let user = await cursor.next(); user != null; user = await cursor.next()) {
        try {
          const g = user.gameData || {};
          const monthlyIncome = Number(g.passiveIncome || 0);
          if (!monthlyIncome) continue;

          const last = user.lastPassiveIncomeAt
            ? user.lastPassiveIncomeAt.getTime()
            : (user.createdAt ? user.createdAt.getTime() : now);

          const secondsPassed = Math.floor((now - last) / 1000);
          if (secondsPassed <= 0) continue;

          const SECONDS_IN_MONTH = 30 * 24 * 60 * 60; // 30 дней
          const incomeToAdd = monthlyIncome * (secondsPassed / SECONDS_IN_MONTH);

          const updated = await User.findOneAndUpdate(
            { _id: user._id, lastPassiveIncomeAt: user.lastPassiveIncomeAt },
            {
              $inc: { 'gameData.balance': incomeToAdd },
              $set: { lastPassiveIncomeAt: new Date(now) }
            },
            { new: true }
          );

          if (!updated) {
            console.log(`[passiveIncomeCron] skip user ${user._id} - concurrent update`);
            continue;
          }

          processed++;
          totalAdded += incomeToAdd;
          console.log(`[passiveIncomeCron] user ${user._id} +${incomeToAdd.toFixed(2)} (sec=${secondsPassed}) -> balance=${updated.gameData?.balance.toFixed(2)}`);
        } catch (uErr) {
          console.error(`[passiveIncomeCron] error processing user ${user._id}:`, uErr);
        }
      }

      console.log(`[passiveIncomeCron] done. processed=${processed}, totalAdded=${totalAdded.toFixed(2)}, finishedAt=${new Date().toISOString()}`);
    } catch (err) {
      console.error('[passiveIncomeCron] fatal error:', err);
    }
  }, {
    timezone: 'UTC'
  });
}

