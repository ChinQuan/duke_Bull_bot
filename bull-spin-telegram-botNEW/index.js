import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import { Connection, clusterApiUrl, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import * as splToken from "@solana/spl-token";
import dotenv from "dotenv";
import config from "./config.js";

dotenv.config();
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const users = fs.existsSync("./users.json")
  ? JSON.parse(fs.readFileSync("./users.json"))
  : {};

const saveUsers = () =>
  fs.writeFileSync("./users.json", JSON.stringify(users, null, 2));

const payer = Keypair.fromSecretKey(
  Uint8Array.from(Buffer.from(process.env.PRIVATE_KEY, "base64"))
);
const connection = new Connection(clusterApiUrl("mainnet-beta"), "confirmed");
const payerPublicKey = payer.publicKey.toBase58();
config.BACKEND_WALLET = payerPublicKey;

bot.setMyCommands([
  { command: "start", description: "Start the bot" },
  { command: "wallet", description: "Set your Solana wallet address" },
  { command: "balance", description: "Check your game balance" },
  { command: "spin", description: "Play SPIN game" },
  { command: "withdraw", description: "Withdraw your BULL tokens" },
]);

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `🎰 Welcome to *Spin to Win BULL*!

Send /wallet followed by your address to get started.`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/wallet (.+)/, async (msg, match) => {
  const wallet = match[1];
  if (!wallet || wallet.length < 32) return bot.sendMessage(msg.chat.id, "❌ Invalid address.");
  users[msg.from.id] = { ...(users[msg.from.id] || {}), wallet, balance: 0 };
  saveUsers();
  bot.sendMessage(msg.chat.id, `✅ Wallet saved: \`${wallet}\``, { parse_mode: "Markdown" });
});

bot.onText(/\/balance/, (msg) => {
  const u = users[msg.from.id];
  if (!u) return bot.sendMessage(msg.chat.id, "❌ Use /wallet to set your address first.");
  bot.sendMessage(msg.chat.id, `💰 Your game balance: *${u.balance || 0} BULL*`, { parse_mode: "Markdown" });
});

bot.onText(/\/spin/, async (msg) => {
  const u = users[msg.from.id];
  if (!u || !u.wallet) return bot.sendMessage(msg.chat.id, "❌ Use /wallet first.");
  if (u.balance < config.SPIN_COST) return bot.sendMessage(msg.chat.id, "⚠️ Not enough balance.");
  u.balance -= config.SPIN_COST;

  const prize = Math.random() < 0.3 ? [2000, 5000, 10000][Math.floor(Math.random() * 3)] : 0;
  if (prize > 0) {
    u.balance += prize;
    bot.sendMessage(msg.chat.id, `🎉 You won *${prize} BULL*!`, { parse_mode: "Markdown" });
  } else {
    bot.sendMessage(msg.chat.id, `😢 No win this time. Try again!`);
  }

  saveUsers();
});

bot.onText(/\/withdraw/, async (msg) => {
  const u = users[msg.from.id];
  if (!u || !u.wallet) return bot.sendMessage(msg.chat.id, "❌ Use /wallet first.");
  if (u.balance < config.MIN_WITHDRAW) return bot.sendMessage(msg.chat.id, "⚠️ Minimum withdraw is 20,000 BULL.");

  try {
    const mint = new PublicKey(config.BULL_MINT);
    const dest = new PublicKey(u.wallet);
    const fromATA = await splToken.getAssociatedTokenAddress(mint, payer.publicKey);
    const toATA = await splToken.getOrCreateAssociatedTokenAccount(connection, payer, mint, dest);

    const tx = new Transaction().add(
      splToken.createTransferInstruction(fromATA, toATA.address, payer.publicKey, u.balance * 1e6)
    );

    const sig = await connection.sendTransaction(tx, [payer]);
    u.balance = 0;
    saveUsers();
    bot.sendMessage(msg.chat.id, `✅ Sent! TX: https://solscan.io/tx/${sig}`);
  } catch (e) {
    console.error(e);
    bot.sendMessage(msg.chat.id, "❌ Error sending tokens.");
  }
});
