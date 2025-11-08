// =================== REQUIRED LIBRARIES ===================
const express = require('express');
const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const { GoalXZ } = require('mineflayer-pathfinder').goals;
const { plugin: collectBlock } = require('mineflayer-collectblock');

// =================== BOT CONFIGURATION ===================
const BOT_CONFIG = {
  host: 'nl-01.freezehost.pro',
  port: 10380,
  username: 'lian_0_0',
  master: 'lian_0_0',
  auth: 'offline',
  version: '1.20.1',
  BLOCK_TO_MINE: 'diamond_ore',
  EXPLORE_DISTANCE: 64
};
// =========================================================

// --- WEB SERVER FOR HOSTING PLATFORM (THE PORT IS THE FIX) ---
const app = express();
const port = process.env.PORT || 3000; // Use port provided by Railway, or 3000 as a fallback.
app.all('/', (req, res) => res.send('Bot is running.'));
app.listen(port, () => console.log(`[System] Health-check server listening on port ${port}.`));

// --- GLOBAL CRASH HANDLER (PREVENTS THE WHOLE APP FROM STOPPING) ---
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

// --- MAIN BOT LOGIC ---
let bot;
let isMining = false;

function createBot() {
  console.log(`[System] Connecting to ${BOT_CONFIG.host}:${BOT_CONFIG.port}...`);
  bot = mineflayer.createBot(BOT_CONFIG);

  bot.loadPlugin(pathfinder);
  bot.loadPlugin(collectBlock);

  bot.on('login', () => console.log(`[System] Logged in as '${bot.username}'. Waiting for spawn...`));
  
  bot.on('spawn', () => {
    console.log("[System] Spawned. Initializing miner.");
    const mcData = require('minecraft-data')(bot.version);
    bot.pathfinder.setMovements(new Movements(bot, mcData));
    bot.chat("Bot online.");
    startMining();
  });

  bot.on('chat', (username, message) => {
    if (username !== BOT_CONFIG.master) return;
    const [command, arg] = message.split(' ');
    if (command === 'find' && arg) {
      BOT_CONFIG.BLOCK_TO_MINE = arg;
      bot.chat(`Target set to: ${arg}. Restarting miner.`);
      stopMining();
      startMining();
    }
    if (command === 'stop') stopMining(true);
    if (command === 'start') startMining();
  });
  
  const handleDisconnect = (reason) => {
    console.log(`[System] Disconnected. Reason: ${reason}.`);
    stopMining();
    console.log('[System] Reconnecting in 30 seconds...');
    setTimeout(createBot, 30000);
  };

  bot.on('kicked', handleDisconnect);
  bot.on('end', handleDisconnect);
  bot.on('error', (err) => console.error(`[Bot Error] An error occurred: ${err.message}`));
}

// --- Auto-Miner Functions ---
function stopMining(chat = false) {
  if (!isMining) return;
  isMining = false;
  // Check if plugins are loaded before trying to stop them
  if (bot && bot.pathfinder) bot.pathfinder.stop();
  if (bot && bot.collectBlock) bot.collectBlock.stop();
  if (chat) bot.chat('Mining stopped.');
  console.log('[Miner] Stopped.');
}

async function startMining() {
  if (isMining) return;
  isMining = true;
  console.log(`[Miner] Started. Hunting for ${BOT_CONFIG.BLOCK_TO_MINE}.`);
  bot.chat(`Hunting for ${BOT_CONFIG.BLOCK_TO_MINE}.`);

  while (isMining) {
    try {
      await performOneMiningCycle();
    } catch (err) {
      console.error(`[Miner Error] Cycle failed: ${err.message}. Recovering...`);
      await new Promise(r => setTimeout(r, 5000)); // Wait 5 seconds on any error
    }
  }
}

async function performOneMiningCycle() {
  const mcData = require('minecraft-data')(bot.version);
  const blockType = mcData.blocksByName[BOT_CONFIG.BLOCK_TO_MINE];
  if (!blockType) {
    console.error(`[Config Error] Block '${BOT_CONFIG.BLOCK_TO_MINE}' is invalid for version ${bot.version}.`);
    bot.chat(`Invalid block: ${BOT_CONFIG.BLOCK_TO_MINE}. Stopping.`);
    stopMining();
    return;
  }
  
  const targetBlock = await bot.findBlock({ matching: blockType.id, maxDistance: 128 });

  if (targetBlock) {
    console.log(`[Miner] Found ${BOT_CONFIG.BLOCK_TO_MINE} at ${targetBlock.position}. Collecting...`);
    await bot.collectBlock.collect(targetBlock);
    console.log('[Miner] Collection complete. Rescanning.');
  } else {
    console.log('[Miner] No ores found. Exploring to a new area...');
    const { x, z } = bot.entity.position;
    const angle = Math.random() * Math.PI * 2;
    const goalX = x + Math.cos(angle) * BOT_CONFIG.EXPLORE_DISTANCE;
    const goalZ = z + Math.sin(angle) * BOT_CONFIG.EXPLORE_DISTANCE;
    await bot.pathfinder.goto(new GoalXZ(goalX, goalZ));
    console.log('[Miner] Exploration complete.');
  }
}

// --- Start Everything ---
createBot();
