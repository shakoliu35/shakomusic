const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "../public")));

const players = new Map();

const ROOM_PASSWORD = process.env.ROOM_PASSWORD;
const HOST_PASSWORD = process.env.HOST_PASSWORD;

// 当前房主
let hostId = null;

// 房间是否开放
let roomOpen = true;


// =========================
// Socket 连接
// =========================

io.on("connection", socket => {


  // =========================
  // 普通玩家进入房间
  // =========================

  socket.on("auth", password => {

    // 房间关闭
    if (!roomOpen) {

      socket.emit("roomClosed");

      return;
    }


    // 房间密码错误
    if (password !== ROOM_PASSWORD) {

      socket.emit("authError");

      return;
    }


    // 人数限制
    if (players.size >= 10) {

      socket.emit("full");

      return;
    }


    // 出生位置

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
      spawns[players.size] ||
      {x:50,y:55};


    // 创建玩家

    players.set(socket.id, {

      id: socket.id,

      name:
        "玩家" +
        (players.size + 1),

      gender:
        "male",

      x:
        spawn.x,

      y:
        spawn.y,

      isHost:
        false

    });


    // 告诉本人进入成功

    socket.emit("init", {

      you:
        players.get(socket.id),

      players:
        [...players.values()]

    });


    // 更新所有玩家

    io.emit(
      "players",
      [...players.values()]
    );

  });



  // =========================
  // 房主认证
  // =========================

  socket.on("hostAuth", hostPassword => {

    const player =
      players.get(socket.id);


    // 必须先进入房间

    if (!player) {

      socket.emit(
        "hostAuthError"
      );

      return;
    }


    // 房主密码错误

    if (
      hostPassword !==
      HOST_PASSWORD
    ) {

      socket.emit(
        "hostAuthError"
      );

      return;
    }


    // 已经存在房主

    if (
      hostId &&
      hostId !== socket.id
    ) {

      socket.emit(
        "hostAlreadyExists"
      );

      return;
    }


    // 设置房主

    hostId =
      socket.id;

    player.isHost =
      true;


    socket.emit(
      "hostAuthSuccess"
    );


    io.emit(
      "players",
      [...players.values()]
    );

  });



  // =========================
  // 设置昵称
  // =========================

  socket.on("setName", name => {

    const p =
      players.get(socket.id);

    if (!p) return;


    name =
      String(name || "")
      .trim()
      .slice(0,12);


    if (name) {

      p.name =
        name;

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

    const p =
      players.get(socket.id);

    if (!p) return;


    gender =
      String(gender || "male");


    if (
      gender !== "male" &&
      gender !== "female"
    ) {

      gender =
        "male";

    }


    p.gender =
      gender;


    io.emit(
      "players",
      [...players.values()]
    );

  });



  // =========================
  // 玩家移动
  // =========================

  socket.on("move", pos => {

    const p =
      players.get(socket.id);

    if (!p) return;


    p.x =
      Math.max(
        5,
        Math.min(
          95,
          Number(pos.x) || 50
        )
      );


    p.y =
      Math.max(
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

    const p =
      players.get(socket.id);

    if (!p) return;


    text =
      String(text || "")
      .trim()
      .slice(0,200);


    if (text) {

      io.emit(
        "chat",
        {

          name:
            p.name,

          text:
            text

        }
      );

    }

  });



  // =========================
  // 房主：踢人
  // =========================

  socket.on("kickPlayer", targetId => {

    // 必须是房主
    if (
      socket.id !== hostId
    ) {

      return;
    }


    // 不能踢自己

    if (
      targetId === hostId
    ) {

      return;
    }


    const targetPlayer =
      players.get(targetId);


    if (!targetPlayer) {

      return;
    }


    const targetSocket =
      io.sockets.sockets.get(
        targetId
      );


    if (!targetSocket) {

      return;
    }


    // 告诉被踢的人

    targetSocket.emit(
      "kicked"
    );


    // 删除玩家

    players.delete(
      targetId
    );


    // 强制断开

    targetSocket.disconnect(
      true
    );


    // 更新所有人

    io.emit(
      "players",
      [...players.values()]
    );

  });



  // =========================
  // 房主：关闭房间
  // =========================

  socket.on("closeRoom", () => {

    // 只有房主可以操作

    if (
      socket.id !== hostId
    ) {

      return;
    }


    roomOpen =
      false;


    // 告诉所有在线玩家

    io.emit(
      "roomClosed"
    );

  });



  // =========================
  // 房主：重新开放房间
  // =========================

  socket.on("openRoom", () => {

    // 只有房主可以操作

    if (
      socket.id !== hostId
    ) {

      return;
    }


    roomOpen =
      true;


    io.emit(
      "roomOpened"
    );

  });



  // =========================
  // 玩家离开
  // =========================

  socket.on("disconnect", () => {

    players.delete(
      socket.id
    );


    // 房主离开

    if (
      socket.id === hostId
    ) {

      hostId =
        null;

    }


    io.emit(
      "players",
      [...players.values()]
    );

  });

});


// =========================
// 启动服务器
// =========================

server.listen(
  process.env.PORT || 3000,
  () => {

    console.log(
      "Mini RooMi V2 running"
    );

  }
);
