const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "../public")));

const ROOM_CONFIG = {
  beach: {
    name: "海滩房间",
    icon: "🏝️",
    password: process.env.BEACH_ROOM_PASSWORD,
    hostPassword: process.env.BEACH_HOST_PASSWORD,
    background: "beach-sunset.jpg"
  },
  lounge: {
    name: "会客厅",
    icon: "☕",
    password: process.env.LOUNGE_ROOM_PASSWORD,
    hostPassword: process.env.LOUNGE_HOST_PASSWORD,
    background: "lounge.png"
  },
  club: {
    name: "俱乐部",
    icon: "🎉",
    password: process.env.CLUB_ROOM_PASSWORD,
    hostPassword: process.env.CLUB_HOST_PASSWORD,
    background: "club.png"
  },
  private: {
    name: "私密房间",
    icon: "🔒",
    password: process.env.PRIVATE_ROOM_PASSWORD,
    hostPassword: process.env.PRIVATE_HOST_PASSWORD,
    background: "private.png"
  }
};

const rooms = {};

for (const roomId of Object.keys(ROOM_CONFIG)) {
  rooms[roomId] = {
    players: new Map(),
    hostId: null,
    roomOpen: true
  };
}

function getRoom(roomId) {
  return rooms[roomId] || null;
}

function broadcastPlayers(roomId) {
  const room = getRoom(roomId);
  if (!room) return;

  io.to(roomId).emit(
    "players",
    [...room.players.values()]
  );
}

function spawnFor(count) {
  const spawns = [
    { x: 50, y: 55 },
    { x: 62, y: 47 },
    { x: 38, y: 47 },
    { x: 50, y: 35 },
    { x: 25, y: 60 },
    { x: 75, y: 60 },
    { x: 25, y: 35 },
    { x: 75, y: 35 },
    { x: 40, y: 75 },
    { x: 60, y: 75 }
  ];

  return spawns[count] || { x: 50, y: 55 };
}

io.on("connection", socket => {

  // ======================================================
  // 玩家进入房间
  // ======================================================
  socket.on("auth", payload => {
    let roomId;
    let password;

    // 兼容旧客户端：如果只传字符串，默认海滩房间
    if (typeof payload === "string") {
      roomId = "beach";
      password = payload;
    } else {
      roomId = String(payload?.roomId || "beach");
      password = String(payload?.password || "");
    }

    const cfg = ROOM_CONFIG[roomId];
    const room = getRoom(roomId);

    if (!cfg || !room) {
      socket.emit("authError");
      return;
    }

    if (!room.roomOpen) {
      socket.emit("roomClosed");
      return;
    }

    if (!cfg.password || password !== cfg.password) {
      socket.emit("authError");
      return;
    }

    if (room.players.size >= 10) {
      socket.emit("full");
      return;
    }

    // 如果同一个连接已经进入过房间，不重复创建玩家
    if (socket.data.roomId) {
      return;
    }

    socket.data.roomId = roomId;
    socket.join(roomId);

    const spawn = spawnFor(room.players.size);

    const player = {
      id: socket.id,
      name: "玩家" + (room.players.size + 1),
      gender: "male",
      x: spawn.x,
      y: spawn.y,
      isHost: false
    };

    room.players.set(socket.id, player);

    socket.emit("init", {
      you: player,
      players: [...room.players.values()],
      roomOpen: room.roomOpen,
      roomId,
      roomName: cfg.name,
      roomIcon: cfg.icon,
      background: cfg.background
    });

    broadcastPlayers(roomId);
  });

  // ======================================================
  // 房主密码
  // ======================================================
  socket.on("hostAuth", hostPassword => {
    const roomId = socket.data.roomId;
    const room = getRoom(roomId);
    const cfg = ROOM_CONFIG[roomId];
    const player = room?.players.get(socket.id);

    if (!room || !cfg || !player) {
      socket.emit("hostAuthError");
      return;
    }

    if (!cfg.hostPassword || hostPassword !== cfg.hostPassword) {
      socket.emit("hostAuthError");
      return;
    }

    if (room.hostId && room.hostId !== socket.id) {
      socket.emit("hostAlreadyExists");
      return;
    }

    room.hostId = socket.id;
    player.isHost = true;

    socket.emit("hostAuthSuccess", {
      roomOpen: room.roomOpen
    });

    broadcastPlayers(roomId);
  });

  // ======================================================
  // 昵称
  // ======================================================
  socket.on("setName", name => {
    const room = getRoom(socket.data.roomId);
    const p = room?.players.get(socket.id);
    if (!p) return;

    name = String(name || "").trim().slice(0, 12);
    if (name) p.name = name;

    broadcastPlayers(socket.data.roomId);
  });

  // ======================================================
  // 性别
  // ======================================================
  socket.on("setGender", gender => {
    const room = getRoom(socket.data.roomId);
    const p = room?.players.get(socket.id);
    if (!p) return;

    gender = String(gender || "male");
    if (gender !== "male" && gender !== "female") {
      gender = "male";
    }

    p.gender = gender;
    broadcastPlayers(socket.data.roomId);
  });

  // ======================================================
  // 移动
  // ======================================================
  socket.on("move", pos => {
    const room = getRoom(socket.data.roomId);
    const p = room?.players.get(socket.id);
    if (!p) return;

    p.x = Math.max(5, Math.min(95, Number(pos?.x) || 50));
    p.y = Math.max(8, Math.min(92, Number(pos?.y) || 50));

    broadcastPlayers(socket.data.roomId);
  });

  // ======================================================
  // 聊天
  // ======================================================
  socket.on("chat", text => {
    const room = getRoom(socket.data.roomId);
    const p = room?.players.get(socket.id);
    if (!p) return;

    text = String(text || "").trim().slice(0, 200);
    if (!text) return;

    io.to(socket.data.roomId).emit("chat", {
      id: p.id,
      name: p.name,
      text
    });
  });

  // ======================================================
  // 互动表情
  // ======================================================
  socket.on("reaction", data => {
    const room = getRoom(socket.data.roomId);
    const p = room?.players.get(socket.id);
    if (!p || !data) return;

    const targetId = String(data.targetId || "");
    const emoji = String(data.emoji || "").slice(0, 8);

    if (!targetId || !emoji) return;
    if (!room.players.has(targetId)) return;

    io.to(socket.data.roomId).emit("reaction", {
      id: targetId,
      targetId,
      emoji
    });
  });

  // ======================================================
  // 房主踢人
  // ======================================================
  socket.on("kickPlayer", targetId => {
    const roomId = socket.data.roomId;
    const room = getRoom(roomId);
    if (!room || socket.id !== room.hostId) return;
    if (targetId === socket.id) return;

    const target = room.players.get(targetId);
    const targetSocket = io.sockets.sockets.get(targetId);
    if (!target || !targetSocket) return;

    targetSocket.emit("kicked");
    room.players.delete(targetId);
    targetSocket.leave(roomId);
    targetSocket.data.roomId = null;
    targetSocket.disconnect(true);

    broadcastPlayers(roomId);
    socket.emit("kickSuccess");
  });

  // ======================================================
  // 房主关闭房间
  // ======================================================
  socket.on("closeRoom", () => {
    const roomId = socket.data.roomId;
    const room = getRoom(roomId);
    if (!room || socket.id !== room.hostId) {
      socket.emit("closeRoomError");
      return;
    }

    room.roomOpen = false;

    io.to(roomId).emit("roomClosed");
    socket.emit("closeRoomSuccess");
  });

  // ======================================================
  // 房主重新开放房间
  // ======================================================
  socket.on("openRoom", () => {
    const roomId = socket.data.roomId;
    const room = getRoom(roomId);
    if (!room || socket.id !== room.hostId) {
      socket.emit("openRoomError");
      return;
    }

    room.roomOpen = true;

    io.to(roomId).emit("roomOpened");
    socket.emit("openRoomSuccess");
  });

  // ======================================================
  // 断开
  // ======================================================
  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    const room = getRoom(roomId);
    if (!room) return;

    const wasHost = socket.id === room.hostId;

    room.players.delete(socket.id);

    if (wasHost) {
      room.hostId = null;
    }

    broadcastPlayers(roomId);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("shako 平行空间 multi-room server running on port " + PORT);
});
