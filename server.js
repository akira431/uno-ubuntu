/**
 * ==================================================================
 * 🃏 UNO TRUTH OR DARE — DEDICATED MULTIPLAYER SERVER
 * ==================================================================
 * Server Node.js + Express + Socket.io yang dioptimalkan untuk:
 * 1. Menjalankan game di VirtualBox Ubuntu / VPS / Localhost
 * 2. Menyajikan file web (index.html, style.css, game.js)
 * 3. Sinkronisasi multi-room real-time tanpa ketergantungan WebRTC cloud
 * 4. Fitur Rematch Lobby: Pemain tetap di ruangan setelah game selesai!
 * 5. Reconnection otomatis saat sinyal HP drop
 * ==================================================================
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);

// Inisialisasi Socket.io dengan opsi stabilitas koneksi mobile
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 30000,
  pingInterval: 12000,
  transports: ['websocket', 'polling']
});

// Middleware & Static File Server
app.use(express.json());
app.use(express.static(path.join(__dirname), {
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    // Hindari caching berlebih untuk file inti game selama pengembangan
    if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  }
}));

// ====== IN-MEMORY ROOM STORAGE ======
// rooms = Map<roomCode, RoomObject>
const rooms = new Map();

/**
 * Helper untuk mendapatkan semua IP non-internal server (LAN / VirtualBox IP)
 */
function getNetworkIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({ name, address: iface.address });
      }
    }
  }
  return ips;
}

// ====== ENDPOINT DIAGNOSTIK & HEALTH CHECK ======
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: Date.now(),
    activeRooms: rooms.size,
    totalConnections: io.engine.clientsCount
  });
});

app.get('/api/info', (req, res) => {
  res.json({
    name: 'UNO Truth or Dare Dedicated Server',
    version: '2.0.0',
    nodeVersion: process.version,
    platform: process.platform,
    ips: getNetworkIps(),
    rooms: Array.from(rooms.values()).map(r => ({
      code: r.code,
      playersCount: r.players.length,
      maxPlayers: r.maxPlayers,
      inGame: r.inGame,
      createdAt: r.createdAt
    }))
  });
});

// Fallback route: arahkan ke index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ====== SOCKET.IO LOGIKA REAL-TIME MULTIPLAYER ======
io.on('connection', (socket) => {
  // console.log(`[Koneksi Baru] ID: ${socket.id}`);

  // 1. Host Membuat Ruangan Baru
  socket.on('room:create', (data, callback) => {
    try {
      const roomCode = (data.roomCode || '').trim().toUpperCase();
      if (!roomCode) {
        if (typeof callback === 'function') callback({ ok: false, message: 'Kode ruangan tidak valid!' });
        return;
      }

      socket.join(roomCode);
      socket.data.roomCode = roomCode;
      socket.data.clientId = data.clientId;
      socket.data.isHost = true;

      const room = {
        code: roomCode,
        hostSocketId: socket.id,
        hostClientId: data.clientId,
        maxPlayers: parseInt(data.maxPlayers, 10) || 2,
        players: [
          {
            socketId: socket.id,
            clientId: data.clientId,
            name: data.name || 'Host',
            avatar: data.avatar || '👑',
            isHost: true,
            isBot: false,
            connected: true,
            lastSeen: Date.now()
          }
        ],
        customTruths: data.customTruths || [],
        customDares: data.customDares || [],
        inGame: false,
        gameState: null,
        createdAt: Date.now(),
        lastActivity: Date.now()
      };

      rooms.set(roomCode, room);
      console.log(`[Lobby Dibuat] Ruangan: ${roomCode} | Host: ${data.name || 'Host'} (${socket.id})`);

      if (typeof callback === 'function') {
        callback({ ok: true, roomCode });
      }
    } catch (err) {
      console.error('[Error room:create]', err);
      if (typeof callback === 'function') callback({ ok: false, message: err.message });
    }
  });

  // 2. Pemain Bergabung ke Ruangan
  socket.on('room:join', (data, callback) => {
    try {
      const cleanCode = (data.roomCode || '').trim().toUpperCase();
      const roomCode = cleanCode.startsWith('UNO-') ? cleanCode : `UNO-${cleanCode}`;
      const room = rooms.get(roomCode);

      if (!room) {
        if (typeof callback === 'function') {
          callback({ ok: false, reason: 'not_found', message: `Ruangan ${roomCode} tidak ditemukan di server ini!` });
        }
        return;
      }

      socket.join(roomCode);
      socket.data.roomCode = roomCode;
      socket.data.clientId = data.clientId;
      socket.data.isHost = false;

      // Cek apakah pemain lama yang menyambung kembali (reconnect)
      const existingPlayer = room.players.find(p => p.clientId === data.clientId);
      if (existingPlayer) {
        existingPlayer.socketId = socket.id;
        existingPlayer.connected = true;
        existingPlayer.name = data.name || existingPlayer.name;
        existingPlayer.avatar = data.avatar || existingPlayer.avatar;
        existingPlayer.lastSeen = Date.now();
        console.log(`[Pemain Reconnect] ${existingPlayer.name} kembali ke ruangan ${roomCode}`);
      } else if (!room.inGame && room.players.length < room.maxPlayers) {
        // Pemain baru di lobi
        const newPlayer = {
          socketId: socket.id,
          clientId: data.clientId,
          name: data.name || `Pemain ${room.players.length + 1}`,
          avatar: data.avatar || '👤',
          isHost: false,
          isBot: false,
          connected: true,
          lastSeen: Date.now()
        };
        room.players.push(newPlayer);
        console.log(`[Pemain Baru] ${newPlayer.name} bergabung ke ruangan ${roomCode}`);
      } else if (room.inGame) {
        if (typeof callback === 'function') {
          callback({ ok: false, reason: 'game_in_progress', message: 'Permainan di ruangan ini sedang berlangsung!' });
        }
        return;
      } else {
        if (typeof callback === 'function') {
          callback({ ok: false, reason: 'room_full', message: 'Ruangan sudah penuh!' });
        }
        return;
      }

      room.lastActivity = Date.now();

      if (typeof callback === 'function') {
        callback({
          ok: true,
          roomCode,
          players: room.players,
          maxPlayers: room.maxPlayers,
          inGame: room.inGame,
          customTruths: room.customTruths,
          customDares: room.customDares
        });
      }

      // Teruskan JOIN_REQUEST ke Host agar Host mensinkronkan lobi/game
      if (room.hostSocketId) {
        io.to(room.hostSocketId).emit('room:action', {
          type: 'JOIN_REQUEST',
          clientId: data.clientId,
          name: data.name,
          avatar: data.avatar,
          senderClientId: data.clientId
        });
      }
    } catch (err) {
      console.error('[Error room:join]', err);
      if (typeof callback === 'function') callback({ ok: false, message: err.message });
    }
  });

  // 3. Broadcast Event dari Host ke Semua Klien di Ruangan
  socket.on('room:broadcast', ({ roomId, payload }) => {
    if (!roomId || !payload) return;
    const roomCode = roomId.toUpperCase();
    const room = rooms.get(roomCode);

    if (room) {
      room.lastActivity = Date.now();

      if (payload.type === 'GAME_START') {
        room.inGame = true;
        room.gameState = payload.state;
      } else if (payload.type === 'STATE_SYNC') {
        room.gameState = payload.state;
      } else if (payload.type === 'RETURN_TO_LOBBY') {
        room.inGame = false;
        if (payload.players) room.players = payload.players;
      } else if (payload.type === 'LOBBY_UPDATE') {
        if (payload.players) room.players = payload.players;
        if (payload.maxPlayers) room.maxPlayers = payload.maxPlayers;
        if (payload.customTruths) room.customTruths = payload.customTruths;
        if (payload.customDares) room.customDares = payload.customDares;
      }
    }

    // Broadcast ke semua pemain di room KECUALI pengirim
    socket.to(roomCode).emit('room:event', payload);
  });

  // 4. Aksi Pemain (Guest) diteruskan ke Host
  socket.on('room:action', ({ roomId, payload }) => {
    if (!roomId || !payload) return;
    const roomCode = roomId.toUpperCase();
    const room = rooms.get(roomCode);

    if (room && room.hostSocketId) {
      room.lastActivity = Date.now();
      // Teruskan langsung ke socket Host
      io.to(room.hostSocketId).emit('room:action', payload);
    }
  });

  // 5. Host Mengembalikan Semua Pemain ke Lobi (Rematch)
  socket.on('room:return-to-lobby', ({ roomId }, callback) => {
    if (!roomId) return;
    const roomCode = roomId.toUpperCase();
    const room = rooms.get(roomCode);

    if (room) {
      room.inGame = false;
      room.lastActivity = Date.now();

      const lobbyPayload = {
        type: 'RETURN_TO_LOBBY',
        players: room.players,
        maxPlayers: room.maxPlayers,
        customTruths: room.customTruths,
        customDares: room.customDares
      };

      // Siarkan ke SEMUA pemain di room termasuk host
      io.to(roomCode).emit('room:event', lobbyPayload);
      console.log(`[Rematch Lobby] Seluruh pemain ruangan ${roomCode} kembali ke lobi tanpa harus keluar.`);

      if (typeof callback === 'function') callback({ ok: true });
    }
  });

  // 6. Pemain Keluar Secara Sukarela
  socket.on('room:leave', ({ roomId, clientId }) => {
    if (!roomId) return;
    const roomCode = roomId.toUpperCase();
    handlePlayerLeaving(socket, roomCode, clientId);
  });

  // 7. Penanganan Disconnect / Putus Jaringan
  socket.on('disconnect', () => {
    const roomCode = socket.data.roomCode;
    const clientId = socket.data.clientId;
    if (roomCode) {
      handlePlayerLeaving(socket, roomCode, clientId, true);
    }
  });
});

/**
 * Menangani pemain atau host yang terputus / meninggalkan ruangan
 */
function handlePlayerLeaving(socket, roomCode, clientId, isDisconnectEvent = false) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const playerIdx = room.players.findIndex(p => p.socketId === socket.id || (clientId && p.clientId === clientId));
  if (playerIdx === -1) return;

  const player = room.players[playerIdx];
  player.connected = false;
  player.lastSeen = Date.now();

  // Jika game sedang berlangsung: jangan langsung hapus slot agar bisa reconnect
  if (room.inGame) {
    if (room.hostSocketId && socket.id !== room.hostSocketId) {
      io.to(room.hostSocketId).emit('room:action', {
        type: 'PEER_DISCONNECTED',
        clientId: player.clientId,
        peerId: player.clientId
      });
    } else if (socket.id === room.hostSocketId) {
      // Host terputus saat game jalan: berikan grace period 15 detik untuk reconnect
      setTimeout(() => {
        const checkRoom = rooms.get(roomCode);
        if (checkRoom && checkRoom.players[0] && !checkRoom.players[0].connected) {
          io.to(roomCode).emit('room:event', {
            type: 'HOST_LEFT',
            message: 'Host terputus dari permainan.'
          });
          rooms.delete(roomCode);
          console.log(`[Room Ditutup] Host tidak kembali dalam 15s. Room: ${roomCode}`);
        }
      }, 15000);
    }
    return;
  }

  // Jika masih di Lobi:
  if (player.isHost) {
    // Host meninggalkan lobi
    setTimeout(() => {
      const checkRoom = rooms.get(roomCode);
      if (checkRoom && checkRoom.players[0] && !checkRoom.players[0].connected) {
        io.to(roomCode).emit('room:event', {
          type: 'HOST_LEFT',
          message: 'Host telah menutup ruangan.'
        });
        rooms.delete(roomCode);
        console.log(`[Lobby Ditutup] Host keluar dari lobi. Room: ${roomCode}`);
      }
    }, isDisconnectEvent ? 6000 : 500);
  } else {
    // Guest keluar dari lobi
    setTimeout(() => {
      const checkRoom = rooms.get(roomCode);
      if (checkRoom && !checkRoom.inGame) {
        const p = checkRoom.players.find(x => x.clientId === player.clientId);
        if (p && !p.connected) {
          checkRoom.players = checkRoom.players.filter(x => x.clientId !== player.clientId);
          if (checkRoom.hostSocketId) {
            io.to(checkRoom.hostSocketId).emit('room:action', {
              type: 'PEER_DISCONNECTED',
              clientId: player.clientId,
              peerId: player.clientId
            });
          }
        }
      }
    }, isDisconnectEvent ? 4000 : 100);
  }

  // Bersihkan room jika semua pemain terputus > 2 menit
  setTimeout(() => {
    const checkRoom = rooms.get(roomCode);
    if (checkRoom && !checkRoom.players.some(p => p.connected)) {
      rooms.delete(roomCode);
      console.log(`[Garbage Collection] Room ${roomCode} dihapus otomatis karena kosong.`);
    }
  }, 120000);
}

// ====== MENJALANKAN SERVER ======
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const ips = getNetworkIps();
  console.log('==================================================================');
  console.log('🃏 UNO TRUTH OR DARE — DEDICATED MULTIPLAYER SERVER');
  console.log('==================================================================');
  console.log(`🚀 Server aktif di Port: ${PORT}`);
  console.log('');
  console.log('🌐 Cara Akses dari Browser:');
  console.log(`   > Komputer ini (Localhost) : http://localhost:${PORT}`);
  ips.forEach(ip => {
    console.log(`   > HP / Laptop Lain (LAN)   : http://${ip.address}:${PORT}  [${ip.name}]`);
  });
  console.log('');
  console.log('💡 TIPS UNTUK VIRTUALBOX UBUNTU:');
  console.log('   1. Jika menggunakan "Bridged Adapter":');
  console.log('      HP yang terhubung ke Wi-Fi yang sama langsung buka IP di atas.');
  console.log('   2. Jika menggunakan "NAT":');
  console.log(`      Buka VirtualBox -> VM Settings -> Network -> Advanced -> Port Forwarding`);
  console.log(`      Tambahkan Rule: Host Port ${PORT} -> Guest Port ${PORT}`);
  console.log('      Lalu HP / Host PC bisa membuka http://<IP_PC_WINDOWS>:' + PORT);
  console.log('==================================================================');
});

// Penanganan sinyal terminate
process.on('SIGINT', () => {
  console.log('\n🛑 Mematikan server secara rapi...');
  server.close(() => process.exit(0));
});
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
