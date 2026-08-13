const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "../public")));

const players = new Map();

// =========================
// 环境变量密码
// =========================

const ROOM_PASSWORD = process.env.ROOM_PASSWORD;
const HOST_PASSWORD = process.env.HOST_PASSWORD;

// =========================
// 房主
// =========================

let hostId = null;

io.on("connection", socket => {

  // =========================
  // 登录房间
  // =========================

  socket.on("auth", password => {

    // 房间密码错误
    if (password !== ROOM_PASSWORD) {
      socket.emit("authError");
      return;
    }

    // 房间人数限制
    if (players.size >= 10) {
      socket.emit("full");
      return;
    }

    // =========================
    // 出生位置
    // =========================

    const spawns = [
      {x:50,y:55},
      {x:62,y:47},
      {x:38,y:47},
      {x:50,y:35},
      {x:25,y:60},
      {x:75,y:60},
      {x:25,y:35},
      {x:75,y:35},
      {x:40,y:75},
      {x:60,y:75}
    ];

    const spawn =
      spawns[players.size] || {x:50,y:55};

    // =========================
    // 创建玩家
    // =========================

    players.set(socket.id, {
      id: socket.id,
      name: "玩家" + (players.size + 1),
      gender: "male",
      x: spawn.x,
      y: spawn.y,
      isHost: false
    });

    // =========================
    // 普通玩家进入后
    // 暂时默认不是房主
    // =========================

    socket.emit("init", {
      you: players.get(socket.id),
      players: [...players.values()]
    });

    io.emit(
      "players",
      [...players.values()]
    );

  });


  // =========================
  // 房主认证
  // =========================

  socket.on("hostAuth", hostPassword => {

    // 必须已经进入房间
    const p = players.get(socket.id);

    if (!p) {
      socket.emit("hostAuthError");
      return;
    }

    // 房主密码错误
    if (hostPassword !== HOST_PASSWORD) {
      socket.emit("hostAuthError");
      return;
    }

    // 如果已经有其他房主
    if (hostId && hostId !== socket.id) {
      socket.emit("hostAlreadyExists");
      return;
    }

    // 设置房主
    hostId = socket.id;

    p.isHost = true;

    // 告诉本人认证成功
    socket.emit("hostAuthSuccess");

    // 更新所有人的玩家列表
    io.emit(
      "players",
      [...players.values()]
    );

  });


  // =========================
  // 设置昵称
  // =========================

  socket.on("setName", name => {

    const p = players.get(socket.id);

    if (!p) return;

    name = String(name || "")
      .trim()
      .slice(0, 12);

    if (name) {
      p.name = name;
    }

    io.emit(
      "players",
      [...players.values()]
    );

  });


  // =========================
  // 设置性别
  // =========================

  socket.on("setGender", gender => {

    const p = players.get(socket.id);

    if (!p) return;

    gender = String(gender || "male");

    if (
      gender !== "male" &&
      gender !== "female"
    ) {
      gender = "male";
    }

    p.gender = gender;

    io.emit(
      "players",
      [...players.values()]
    );

  });


  // =========================
  // 玩家移动
  // =========================

  socket.on("move", pos => {

    const p = players.get(socket.id);

    if (!p) return;

    p.x = Math.max(
      5,
      Math.min(
        95,
        Number(pos.x) || 50
      )
    );

    p.y = Math.max(
      8,
      Math.min(
        92,
        Number(pos.y) || 50
      )
    );

    io.emit(
      "players",
      [...players.values()]
    );

  });


  // =========================
  // 聊天
  // =========================

  socket.on("chat", text => {

    const p = players.get(socket.id);

    if (!p) return;

    text = String(text || "")
      .trim()
      .slice(0, 200);

    if (text) {

      io.emit(
        "chat",
        {
          name: p.name,
          text: text
        }
      );

    }

  });


  // =========================
  // 玩家离开
  // =========================

  socket.on("disconnect", () => {

    players.delete(socket.id);

    // 如果离开的是房主
    if (socket.id === hostId) {

      // 清空房主
      hostId = null;

      // 注意：
      // 不会把其他人自动变成房主
      // 必须由真正的房主重新认证
    }

    io.emit(
      "players",
      [...players.values()]
    );

  });

});


server.listen(
  process.env.PORT || 3000,
  () => console.log(
    "Mini RooMi V2 running"
  )
);
