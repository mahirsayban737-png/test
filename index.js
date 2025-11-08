// =================== REQUIRED LIBRARIES ===================
const express = require('express');
const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const { GoalXZ } = require('mineflayer-pathfinder').goals;
const { plugin: collectBlock } = require('mineflayer-collectblock');

// =================== BOT CONFIGURATION ===================
const BOT_CONFIG = {
  // --- Server and Login ---
  host: 'nl-01.freezehost.pro',
  port: 10380,
  username: 'lian_0_0',
  master: 'lian_0_0', // <-- IMPORTANT: Change this to your Minecraft username
  auth: 'offline',

  // --- Version and Mining ---
  version: '1.20.1',
  AUTO_MINING_ON_START: true,
  BLOCK_TO_MINE: 'diamond_ore',
  EXPLORE_DISTANCE: 64
};
// =========================================================

// --- Keep-Alive Server (for Replit 24/7 Hosting) ---
const app = express();
app.all('/', (req, res) => res.send('Bot is running.'));
app.listen(3000, () => console.log('Keep-alive server is ready.'));

// --- Main Bot Logic ---
let bot;
let isAutoMining = false;

function createBot() {
  console.log(`Attempting to connect to ${BOT_CONFIG.host}:${BOT_CONFIG.port} with version ${BOT_CONFIG.version}...`);

  bot = mineflayer.createBot({
    host: BOT_CONFIG.host,
    port: BOT_CONFIG.port,
    username: BOT_CONFIG.username,
    version: BOT_CONFIG.version,
    auth: BOT_CONFIG.auth
  });

  // --- LOAD PLUGINS ---
  bot.loadPlugin(pathfinder);
  bot.loadPlugin(collectBlock);

  // --- EVENT HANDLERS ---
  bot.on('login', () => {
    console.log(`SUCCESS! Bot '${bot.username}' has logged in. Waiting to spawn...`);
  });
  
  // *** THIS IS THE FIX ***
  // We wait for the 'spawn' event to ensure the bot is fully in the world.
  bot.on('spawn', () => {
    console.log("Bot has spawned in the world.");
    
    // Configure pathfinder movements once spawned
    const mcData = require('minecraft-data')(bot.version);
    const moves = new Movements(bot, mcData);
    bot.pathfinder.setMovements(moves);
    
    bot.chat("Bot online. Ready for commands.");
    if (BOT_CONFIG.AUTO_MINING_ON_START) {
      // No need for a timeout anymore, we can start immediately.
      startAutoMiningLoop('Auto-start on spawn');
    }
  });


  bot.on('chat', (username, message) => {
    if (username !== BOT_CONFIG.master) return;

    const args = message.split(' ');
    const command = args[0];

    if (command === 'stop') stopAutoMiner(true);
    if (command === 'start') startAutoMiningLoop('Command');
    if (command === 'find') {
      if (args[1]) {
        BOT_CONFIG.BLOCK_TO_MINE = args[1];
        bot.chat(`Now set to find: ${BOT_CONFIG.BLOCK_TO_MINE}`);
        if(isAutoMining) {
           stopAutoMiner(false);
           startAutoMiningLoop('Target changed');
        }
      } else {
        bot.chat('Usage: find <block_name>');
      }
    }
  });
  
  // --- ROBUST RECONNECT LOGIC ---
  const handleDisconnect = (reason) => {
    console.log(`Disconnected. Reason: ${reason}`);
    stopAutoMiner(false);
    console.log('Reconnecting in 30 seconds...');
    setTimeout(createBot, 30000);
  };

  bot.on('kicked', handleDisconnect);
  bot.on('end', handleDisconnect);
  bot.on('error', (err) => {
    console.error(`An error occurred: ${err.message}`);
  });
}

// --- Auto-Miner Functions (No changes needed here) ---
function stopAutoMiner(showInChat) {
  if (!isAutoMining || !bot.entity) return; // Add a check for bot.entity
  isAutoMining = false;
  bot.pathfinder.stop();
  bot.collectBlock.stop();
  if (showInChat) {
    bot.chat('Auto-miner paused.');
  }
  console.log('Auto-miner paused.');
}

async function startAutoMiningLoop(reason) {
  if (isAutoMining) { bot.chat('Auto-miner is already running.'); return; }
  
  isAutoMining = true;
  console.log(`Auto-miner started. Reason: ${reason}`);
  bot.chat(`Starting continuous hunt for ${BOT_CONFIG.BLOCK_TO_MINE}.`);

  const mcData = require('minecraft-data')(bot.version);
  
  while (isAutoMining) {
    try {
      await performOneMiningCycle(mcData);
    } catch (err) {
      console.error(`Error in mining cycle: ${err.message}. Restarting loop.`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    if (!isAutoMining) break;
  }
}

async function performOneMiningCycle(mcData) {
  const blockType = mcData.blocksByName[BOT_CONFIG.BLOCK_TO_MINE];
  if (!blockType) {
    bot.chat(`Error: Block '${BOT_CONFIG.BLOCK_TO_MINE}' not found in this version.`);
    stopAutoMiner(false);
    return;
  }
  
  // Use bot.findBlock instead of findBlocks for simplicity with collectBlock
  const targetBlock = bot.findBlock({
    matching: blockType.id,
    maxDistance: 128
  });

  if (targetBlock) {
    bot.chat(`Found ${BOT_CONFIG.BLOCK_TO_MINE}. Tunneling...`);
    await bot.collectBlock.collect(targetBlock);
    bot.chat('Collection cycle complete. Rescanning...');
  } else {
    bot.chat('No ores found nearby. Exploring to a new area...');
    const { x, z } = bot.entity.position;
    const angle = Math.random() * Math.PI * 2;
    const goalX = x + Math.cos(angle) * BOT_CONFIG.EXPLORE_DISTANCE;
    const goalZ = z + Math.sin(angle) * BOT_CONFIG.EXPLORE_DISTANCE;
    
    await bot.pathfinder.goto(new GoalXZ(goalX, goalZ));
    bot.chat('Exploration move complete. Rescanning for ores.');
  }
}

// --- Start Everything ---
createBot();
