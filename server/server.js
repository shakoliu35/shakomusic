const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ======================================================
// public 在 server 的上一级目录
// ======================================================

app.use(express.static(path.join(__dirname, "../public")));

// ======================================================
// 四个房间配置
// ======================================================

const ROOM_CONFIG = {
  beach: {
    name: "海滩房间",
    icon: "🏝️",

    password:
      process.env.BEACH_ROOM_PASSWORD ||
      process.env.ROOM_PASSWORD,

    hostPassword:
      process.env.BEACH_HOST_PASSWORD ||
      process.env.HOST_PASSWORD,

    background: "beach-sunset.jpg"
  },

  lounge: {
    name: "会客厅",
    icon: "☕",

    password:
      process.env.LOUNGE_ROOM_PASSWORD,

    hostPassword:
      process.env.LOUNGE_HOST_PASSWORD,

    background: "lounge.png"
  },

  club: {
    name: "俱乐部",
    icon: "🎉",

    password:
      process.env.CLUB_ROOM_PASSWORD,

    hostPassword:
      process.env.CLUB_HOST_PASSWORD,

    background: "club.png"
  },

  private: {
    name: "私密房间",
    icon: "🔒",

    password:
      process.env.PRIVATE_ROOM_PASSWORD,

    hostPassword:
      process.env.PRIVATE_HOST_PASSWORD,

    background: "private.png"
  }
};

// ======================================================
// 房间数据
// ======================================================

const rooms = {};

for (const roomId of Object.keys(ROOM_CONFIG)) {
  rooms[roomId] = {
    players: new Map(),
    hostId: null,
    roomOpen: true
  };
}

// ======================================================
// 工具函数
// ======================================================

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

  return (
    spawns[count] || {
      x: 50,
      y: 55
    }
  );
}

// ======================================================
// Socket.IO
// ======================================================

io.on("connection", socket => {

  // ====================================================
  // 玩家进入房间
  // ====================================================

  socket.on("auth", payload => {

    let roomId;
    let password;

    /*
     * 兼容旧版：
     * 如果只传字符串，就默认进入海滩房间
     */

    if (typeof payload === "string") {

      roomId = "beach";
      password = payload;

    } else {

      roomId =
        String(
          payload?.roomId || "beach"
        );

      password =
        String(
          payload?.password || ""
        );
    }

    const cfg =
      ROOM_CONFIG[roomId];

    const room =
      getRoom(roomId);

    // 房间不存在

    if (!cfg || !room) {

      socket.emit("authError");

      return;
    }

    // 房间已经关闭

    if (!room.roomOpen) {

      socket.emit("roomClosed");

      return;
    }

    // 房间密码错误

    if (
      !cfg.password ||
      password !== cfg.password
    ) {

      socket.emit("authError");

      return;
    }

    // 房间人数限制

    if (room.players.size >= 10) {

      socket.emit("full");

      return;
    }

    // 当前连接已经进入房间

    if (socket.data.roomId) {

      return;
    }

    socket.data.roomId = roomId;

    socket.join(roomId);

    // 自动分配出生位置

    const spawn =
      spawnFor(
        room.players.size
      );

    const player = {

      id: socket.id,

      name:
        "玩家" +
        (room.players.size + 1),

      gender: "male",

      x: spawn.x,

      y: spawn.y,

      isHost: false
    };

    room.players.set(
      socket.id,
      player
    );

    // 告诉当前玩家初始化信息

    socket.emit("init", {

      you: player,

      players:
        [...room.players.values()],

      roomOpen:
        room.roomOpen,

      roomId,

      roomName:
        cfg.name,

      roomIcon:
        cfg.icon,

      background:
        cfg.background
    });

    // 广播房间玩家

    broadcastPlayers(roomId);
  });

  // ====================================================
  // 房主密码验证
  // ====================================================

  socket.on(
    "hostAuth",
    hostPassword => {

      const roomId =
        socket.data.roomId;

      const room =
        getRoom(roomId);

      const cfg =
        ROOM_CONFIG[roomId];

      const player =
        room?.players.get(
          socket.id
        );

      if (
        !room ||
        !cfg ||
        !player
      ) {

        socket.emit(
          "hostAuthError"
        );

        return;
      }

      // 房主密码错误

      if (
        !cfg.hostPassword ||
        hostPassword !==
          cfg.hostPassword
      ) {

        socket.emit(
          "hostAuthError"
        );

        return;
      }

      // 已经存在房主

      if (
        room.hostId &&
        room.hostId !== socket.id
      ) {

        socket.emit(
          "hostAlreadyExists"
        );

        return;
      }

      // 设置房主

      room.hostId =
        socket.id;

      player.isHost = true;

      socket.emit(
        "hostAuthSuccess",
        {
          roomOpen:
            room.roomOpen
        }
      );

      broadcastPlayers(roomId);
    }
  );

  // ====================================================
  // 修改昵称
  // ====================================================

  socket.on(
    "setName",
    name => {

      const room =
        getRoom(
          socket.data.roomId
        );

      const player =
        room?.players.get(
          socket.id
        );

      if (!player) return;

      name =
        String(
          name || ""
        )
        .trim()
        .slice(0, 12);

      if (name) {

        player.name =
          name;
      }

      broadcastPlayers(
        socket.data.roomId
      );
    }
  );

  // ====================================================
  // 修改性别
  // ====================================================

  socket.on(
    "setGender",
    gender => {

      const room =
        getRoom(
          socket.data.roomId
        );

      const player =
        room?.players.get(
          socket.id
        );

      if (!player) return;

      gender =
        String(
          gender || "male"
        );

      if (
        gender !== "male" &&
        gender !== "female"
      ) {

        gender = "male";
      }

      player.gender =
        gender;

      broadcastPlayers(
        socket.data.roomId
      );
    }
  );

  // ====================================================
  // 玩家移动
  // ====================================================

  socket.on(
    "move",
    pos => {

      const room =
        getRoom(
          socket.data.roomId
        );

      const player =
        room?.players.get(
          socket.id
        );

      if (!player) return;

      player.x =
        Math.max(
          5,
          Math.min(
            95,
            Number(pos?.x) || 50
          )
        );

      player.y =
        Math.max(
          8,
          Math.min(
            92,
            Number(pos?.y) || 50
          )
        );

      broadcastPlayers(
        socket.data.roomId
      );
    }
  );

  // ====================================================
  // 聊天
  // ====================================================

  socket.on(
    "chat",
    text => {

      const room =
        getRoom(
          socket.data.roomId
        );

      const player =
        room?.players.get(
          socket.id
        );

      if (!player) return;

      text =
        String(
          text || ""
        )
        .trim()
        .slice(0, 200);

      if (!text) return;

      io
        .to(socket.data.roomId)
        .emit(
          "chat",
          {
            id:
              player.id,

            name:
              player.name,

            text:
              text
          }
        );
    }
  );

  // ====================================================
  // 互动表情
  // ====================================================

  socket.on(
    "reaction",
    data => {

      const room =
        getRoom(
          socket.data.roomId
        );

      const player =
        room?.players.get(
          socket.id
        );

      if (
        !player ||
        !data
      ) {

        return;
      }

      const targetId =
        String(
          data.targetId || ""
        );

      const emoji =
        String(
          data.emoji || ""
        )
        .slice(0, 8);

      if (
        !targetId ||
        !emoji
      ) {

        return;
      }

      // 目标人物必须在当前房间

      if (
        !room.players.has(
          targetId
        )
      ) {

        return;
      }

      io
        .to(socket.data.roomId)
        .emit(
          "reaction",
          {
            id:
              targetId,

            targetId:
              targetId,

            emoji:
              emoji
          }
        );
    }
  );

  // ====================================================
  // 房主踢人
  // ====================================================

  socket.on(
    "kickPlayer",
    targetId => {

      const roomId =
        socket.data.roomId;

      const room =
        getRoom(roomId);

      // 只有房主可以踢人

      if (
        !room ||
        socket.id !==
          room.hostId
      ) {

        return;
      }

      // 房主不能踢自己

      if (
        targetId ===
        socket.id
      ) {

        return;
      }

      const target =
        room.players.get(
          targetId
        );

      const targetSocket =
        io.sockets.sockets.get(
          targetId
        );

      if (
        !target ||
        !targetSocket
      ) {

        return;
      }

      // 告诉被踢玩家

      targetSocket.emit(
        "kicked"
      );

      // 从房间删除

      room.players.delete(
        targetId
      );

      targetSocket.leave(
        roomId
      );

      targetSocket.data.roomId =
        null;

      targetSocket.disconnect(
        true
      );

      // 更新当前房间

      broadcastPlayers(
        roomId
      );

      socket.emit(
        "kickSuccess"
      );
    }
  );

  // ====================================================
  // 房主关闭房间
  // ====================================================

  socket.on(
    "closeRoom",
    () => {

      const roomId =
        socket.data.roomId;

      const room =
        getRoom(roomId);

      // 只有房主可以关闭

      if (
        !room ||
        socket.id !==
          room.hostId
      ) {

        socket.emit(
          "closeRoomError"
        );

        return;
      }

      room.roomOpen =
        false;

      // 通知当前房间所有人

      io
        .to(roomId)
        .emit(
          "roomClosed"
        );

      socket.emit(
        "closeRoomSuccess"
      );
    }
  );

  // ====================================================
  // 房主重新开放房间
  // ====================================================

  socket.on(
    "openRoom",
    () => {

      const roomId =
        socket.data.roomId;

      const room =
        getRoom(roomId);

      if (
        !room ||
        socket.id !==
          room.hostId
      ) {

        socket.emit(
          "openRoomError"
        );

        return;
      }

      room.roomOpen =
        true;

      io
        .to(roomId)
        .emit(
          "roomOpened"
        );

      socket.emit(
        "openRoomSuccess"
      );
    }
  );

  // ====================================================
  // 玩家离开
  // ====================================================

  socket.on(
    "disconnect",
    () => {

      const roomId =
        socket.data.roomId;

      const room =
        getRoom(roomId);

      if (!room) {
        return;
      }

      const wasHost =
        socket.id ===
        room.hostId;

      // 删除玩家

      room.players.delete(
        socket.id
      );

      // 房主离开

      if (wasHost) {

        room.hostId =
          null;
      }

      // 更新房间

      broadcastPlayers(
        roomId
      );
    }
  );
});

// ======================================================
// Render 端口
// ======================================================

const PORT =
  process.env.PORT || 3000;

// ======================================================
// 启动服务器
// ======================================================

server.listen(
  PORT,
  () => {

    console.log(
      "shako 平行空间 multi-room server running on port " +
      PORT
    );

    console.log(
      "Rooms:",
      Object.keys(
        ROOM_CONFIG
      ).join(", ")
    );
  }
);
