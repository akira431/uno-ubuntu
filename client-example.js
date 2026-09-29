/**
 * Client Example / Automated Bot Tester untuk UNO Truth or Dare Server
 * Jalankan: node client-example.js [URL_SERVER] [ROOM_CODE]
 */

const { io } = require("socket.io-client");

const SERVER_URL = process.argv[2] || "http://localhost:3000";
const ROOM_CODE = (process.argv[3] || "UNO-TEST").toUpperCase();
const BOT_NAME = "Bot Test " + Math.floor(Math.random() * 1000);
const CLIENT_ID = "bot_" + Math.random().toString(36).substring(7);

console.log(`Menghubungkan ke ${SERVER_URL} sebagai ${BOT_NAME}...`);
const socket = io(SERVER_URL);

socket.on("connect", () => {
  console.log(`✅ Terhubung ke server! Socket ID: ${socket.id}`);
  console.log(`Mencoba masuk ke ruangan ${ROOM_CODE}...`);

  socket.emit("room:join", {
    roomCode: ROOM_CODE,
    name: BOT_NAME,
    avatar: "🤖",
    clientId: CLIENT_ID
  }, (res) => {
    if (res && res.ok) {
      console.log(`🎉 Berhasil bergabung ke ruangan ${ROOM_CODE}!`);
      console.log(`Daftar pemain di ruangan:`, res.players.map(p => `${p.name} (${p.isHost ? 'Host' : 'Pemain'})`));
    } else {
      console.error(`❌ Gagal masuk ke ruangan:`, res ? res.message : "Tidak ada respon");
    }
  });
});

socket.on("room:event", (payload) => {
  console.log(`[Event Diterima] Tipe: ${payload.type}`);

  if (payload.type === "GAME_START") {
    console.log("🎮 Permainan telah dimulai oleh Host!");
  } else if (payload.type === "RETURN_TO_LOBBY") {
    console.log("🏠 Host mengembalikan semua pemain ke lobi. Tetap berada di ruangan...");
  } else if (payload.type === "CHAT_MSG") {
    console.log(`💬 [Chat] ${payload.sender}: ${payload.text}`);
  }
});

socket.on("disconnect", () => {
  console.log("⚠️ Terputus dari server.");
});
