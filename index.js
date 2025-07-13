import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import {
  Connection,
  clusterApiUrl,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import * as splToken from "@solana/spl-token";
import dotenv from "dotenv";
import * as cfg from "./config.js";

dotenv.config();

/* ———————————————————————————
   1️⃣  Konstanty / portfele
———————————————————————————*/
const GAME_WALLET_ADDRESS = new PublicKey(
  "EA7ahCfdUGRDooJXFXwMvCrc4ihvdkoXWvbw7MnauT22"
);

const secret = Uint8Array.from(JSON.parse(process.env.PRIVATE_KEY));
export const BOT_KEYPAIR = Keypair.fromSecretKey(secret);

const BACKEND_WALLET = BOT_KEYPAIR.publicKey.toBase58();    // <— lokalna stała
const connection = new Connection(clusterApiUrl("mainnet-beta"), "confirmed");

/* ———————————————————————————
   2️⃣  Inicjalizacja bota
———————————————————————————*/
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

/* ———————————————————————————
   3️⃣  Dane użytkowników (JSON)
———————————————————————————*/
const USERS_FILE = "./users.json";
const users = fs.existsSync(USERS_FILE)
  ? JSON.parse(fs.readFileSync(USERS_FILE))
  : {};
const saveUsers = () =>
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

/* ———————————————————————————
   4️⃣  Komendy bota
———————————————————————————*/
bot.setMyCommands([
  { command: "start",    description: "Start the bot" },
  { command: "wallet",   description: "Set your Solana wallet address" },
  { command: "balance",  description: "Check game balance" },
  { command: "spin",     description: "Play SPIN game" },
  { command: "withdraw", description: "Withdraw BULL tokens" },
]);

/* ———————————————————————————
   /start
———————————————————————————*/
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `🎰 *Spin to Win BULL*\n\n` +
      `1️⃣  /wallet <address>\n` +
      `2️⃣  /spin – costs ${cfg.SPIN_COST} BULL\n` +
      `3️⃣  /withdraw – min ${cfg.MIN_WITHDRAW} BULL`,
    { parse_mode: "Markdown" }
  );
});

/* ———————————————————————————
   /wallet <addr>
———————————————————————————*/
bot.onText(/\/wallet (.+)/, (msg, match) => {
  const wallet = match[1].trim();
  if (!/^([1-9A-HJ-NP-Za-km-z]{32,44})$/.test(wallet))
    return bot.sendMessage(msg.chat.id, "❌ Invalid Solana address.");

  users[msg.from.id] = { ...(users[msg.from.id] || {}), wallet, balance: 0 };
  saveUsers();
  bot.sendMessage(
    msg.chat.id,
    `✅ Wallet saved: \`${wallet}\``,
    { parse_mode: "Markdown" }
  );
});

/* ———————————————————————————
   /balance
———————————————————————————*/
bot.onText(/\/balance/, (msg) => {
  const bal = users[msg.from.id]?.balance ?? 0;
  bot.sendMessage(msg.chat.id, `💰 Balance: *${bal} BULL*`, {
    parse_mode: "Markdown",
  });
});

/* ———————————————————————————
   /spin
———————————————————————————*/
bot.onText(/\/spin/, (msg) => {
  const u = users[msg.from.id];
  if (!u?.wallet) return bot.sendMessage(msg.chat.id, "⚠️ Set /wallet first.");
  if (u.balance < cfg.SPIN_COST)
    return bot.sendMessage(msg.chat.id, "💸 Not enough balance.");

  u.balance -= cfg.SPIN_COST;

  const winTable = [0, 0, 2000, 5000, 10000];
  const prize = winTable[Math.floor(Math.random() * winTable.length)];

  if (prize > 0) {
    u.balance += prize;
    bot.sendMessage(msg.chat.id, `🎉 You won *${prize} BULL*!`, {
      parse_mode: "Markdown",
    });
  } else {
    bot.sendMessage(msg.chat.id, `😢 No win this time.`);
  }
  saveUsers();
});

/* ———————————————————————————
   /withdraw
———————————————————————————*/
bot.onText(/\/withdraw/, async (msg) => {
  const u = users[msg.from.id];
  if (!u?.wallet) return bot.sendMessage(msg.chat.id, "⚠️ Set /wallet first.");
  if (u.balance < cfg.MIN_WITHDRAW)
    return bot.sendMessage(
      msg.chat.id,
      `Minimum withdraw is ${cfg.MIN_WITHDRAW} BULL.`
    );

  try {
    const mint    = new PublicKey(cfg.BULL_MINT);
    const destPub = new PublicKey(u.wallet);

    const fromATA = await splToken.getAssociatedTokenAddress(
      mint,
      BOT_KEYPAIR.publicKey
    );
    const toATA   = await splToken.getOrCreateAssociatedTokenAccount(
      connection,
      BOT_KEYPAIR,
      mint,
      destPub
    );

    const tx = new Transaction().add(
      splToken.createTransferInstruction(
        fromATA,
        toATA.address,
        BOT_KEYPAIR.publicKey,
        BigInt(u.balance) * BigInt(1e6) // 6-decimals
      )
    );

    const sig = await connection.sendTransaction(tx, [BOT_KEYPAIR]);
    u.balance = 0;
    saveUsers();

    bot.sendMessage(
      msg.chat.id,
      `✅ Sent! [Solscan](https://solscan.io/tx/${sig})`,
      { parse_mode: "Markdown", disable_web_page_preview: true }
    );
  } catch (err) {
    console.error(err);
    bot.sendMessage(msg.chat.id, "❌ Error sending tokens.");
  }
});

