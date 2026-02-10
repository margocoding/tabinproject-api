// Найди/создай scripts/migrateSetDefaultPassiveIncome.js и запусти node scripts/migrateSetDefaultPassiveIncome.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import User from '../models/User.js';
import dbConnect from '../lib/dbConnect.js';

async function run() {
  await dbConnect();

  const cursor = User.find().cursor();
  let updated = 0;
  for (let user = await cursor.next(); user != null; user = await cursor.next()) {
    const needsPassive = typeof user.passiveIncome === 'undefined' || user.passiveIncome === null;
    const needsLast = !user.lastPassiveIncomeAt;

    if (needsPassive || needsLast) {
      if (needsPassive) user.passiveIncome = Number(user.passiveIncome) || 0;
      if (needsLast) user.lastPassiveIncomeAt = user.createdAt || new Date();
      await user.save();
      updated++;
      console.log(`patched user ${user._id} (telegramId=${user.telegramId})`);
    }
  }

  console.log(`Done. Users updated: ${updated}`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
