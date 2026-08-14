const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(
  express.static(
    path.join(__dirname, "../public")
  )
);


/* ======================================================
   四个房间
   ====================================================== */

const ROOM_CONFIG = {

  beach: {
    name: "海滩房间",
    icon: "🏝️",

    password:
      process.env.BEACH_ROOM_PASSWORD ||
      process.env.ROOM_PASSWORD,

    hostPassword:
      process.env.BEACH_HOST_PASSWORD ||
      process.env.HOST_PASSWORD
  },

  lounge: {
    name: "会客厅",
    icon: "☕",

    password:
      process.env.LOUNGE_ROOM_PASSWORD,

    hostPassword:
      process.env.LOUNGE_HOST_PASSWORD
  },

  club: {
    name: "俱乐部",
    icon: "🎉",

    password:
      process.env.CLUB_ROOM_PASSWORD,

    hostPassword:
      process.env.CLUB_HOST_PASSWORD
  },

  private: {
    name: "私密房间",
    icon: "🔒",

    password:
      process.env.PRIVATE_ROOM_PASSWORD,

    hostPassword:
      process.env.PRIVATE_HOST_PASSWORD
  }

};


/* ======================================================
   11首音乐
   ====================================================== */

const MUSIC_LIST = [

  {
    file: "music.mp3",
    name: "那女孩对我说"
  },

  {
    file: "green to blue.mp3",
    name: "green to blue"
  },

  {
    file: "one more light.mp3",
    name: "one more light"
  },

  {
    file: "sarusa.mp3",
    name: "sarusa"
  },

  {
    file: "satie – gymnopédie no. 1.mp3",
    name: "satie – gymnopédie no. 1"
  },

  {
    file: "little things.mp3",
    name: "little things"
  },

  {
    file: "nocturne chopin op 9 no 2.mp3",
    name: "nocturne chopin op 9 no 2"
  },

  {
    file: "intro.mp3",
    name: "intro"
  },

  {
    file: "low sun.mp3",
    name: "low sun"
  },

  {
    file: "泸沽湖.mp3",
    name: "泸沽湖"
  },

  {
    file: "pieces.mp3",
    name: "pieces"
  }

];


/* ======================================================
   创建四个独立房间
   ====================================================== */

const rooms = {};


Object.keys(ROOM_CONFIG).forEach(
  roomId => {

    rooms[roomId] = {

      players:
        new Map(),

      hostId:
        null,

      roomOpen:
        true,

      music: {

        index:
          0,

        playing:
          true,

        startedAt:
          Date.now(),

        position:
          0
      }

    };

  }
);


/* ======================================================
   工具函数
   ====================================================== */

function getRoom(roomId) {

  return rooms[roomId] || null;

}


function getMusicPosition(room) {

  if (!room) return 0;

  if (!room.music.playing) {

    return room.music.position;

  }

  return Math.max(
    0,
    (
      Date.now() -
      room.music.startedAt
    ) / 1000
    +
    room.music.position
  );

}


function getMusicState(room) {

  if (!room) return null;

  return {

    index:
      room.music.index,

    playing:
      room.music.playing,

    position:
      getMusicPosition(room)
  };

}


function broadcastMusic(roomId) {

  const room =
    getRoom(roomId);

  if (!room) return;

  io
    .to(roomId)
    .emit(
      "musicState",
      getMusicState(room)
    );

}


function broadcastPlayers(roomId) {

  const room =
    getRoom(roomId);

  if (!room) return;

  io
    .to(roomId)
    .emit(
      "players",
      [
        ...room.players.values()
      ]
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
    spawns[count] ||
    {
      x: 50,
      y: 55
    }
  );

}


/* ======================================================
   Socket.IO
   ====================================================== */

io.on(
  "connection",
  socket => {


    /* ==================================================
       进入房间
       ================================================== */

    socket.on(
      "auth",
      payload => {

        let roomId =
          "beach";

        let password =
          "";


        /*
         * 新版：
         * {
         *   roomId: "beach",
         *   password: "xxxx"
         * }
         */

        if (
          payload &&
          typeof payload === "object"
        ) {

          roomId =
            String(
              payload.roomId ||
              "beach"
            );

          password =
            String(
              payload.password ||
              ""
            );

        }

        /*
         * 兼容旧版：
         * 只发送密码
         */

        else {

          password =
            String(
              payload ||
              ""
            );

        }


        const cfg =
          ROOM_CONFIG[roomId];

        const room =
          getRoom(roomId);


        if (!cfg || !room) {

          socket.emit(
            "authError"
          );

          return;

        }


        if (!room.roomOpen) {

          socket.emit(
            "roomClosed"
          );

          return;

        }


        if (
          !cfg.password ||
          password !== cfg.password
        ) {

          socket.emit(
            "authError"
          );

          return;

        }


        if (
          room.players.size >= 10
        ) {

          socket.emit(
            "full"
          );

          return;

        }


        /*
         * 防止同一个连接重复进入
         */

        if (socket.data.roomId) {

          return;

        }


        socket.data.roomId =
          roomId;


        socket.join(roomId);


        const spawn =
          spawnFor(
            room.players.size
          );


        const player = {

          id:
            socket.id,

          name:
            "玩家" +
            (
              room.players.size + 1
            ),

          gender:
            "male",

          x:
            spawn.x,

          y:
            spawn.y,

          isHost:
            false

        };


        room.players.set(
          socket.id,
          player
        );


        /*
         * 告诉当前玩家进入成功
         */

        socket.emit(
          "init",
          {

            you:
              player,

            players:
              [
                ...room.players.values()
              ],

            roomOpen:
              room.roomOpen,

            roomId:
              roomId,

            roomName:
              cfg.name,

            roomIcon:
              cfg.icon,

            music:
              getMusicState(room)

          }
        );


        /*
         * 当前房间音乐状态
         */

        socket.emit(
          "musicState",
          getMusicState(room)
        );


        broadcastPlayers(
          roomId
        );

      }
    );


    /* ==================================================
       房主密码
       ================================================== */

    socket.on(
      "hostAuth",
      hostPassword => {

        const roomId =
          socket.data.roomId;

        const room =
          getRoom(roomId);

        const cfg =
          ROOM_CONFIG[roomId];

        if (
          !room ||
          !cfg
        ) {

          socket.emit(
            "hostAuthError"
          );

          return;

        }


        const player =
          room.players.get(
            socket.id
          );


        if (!player) {

          socket.emit(
            "hostAuthError"
          );

          return;

        }


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


        /*
         * 当前房间已经有房主
         */

        if (
          room.hostId &&
          room.hostId !==
            socket.id
        ) {

          socket.emit(
            "hostAlreadyExists"
          );

          return;

        }


        room.hostId =
          socket.id;


        player.isHost =
          true;


        /*
         * 房主重新回来后，
         * 自动获得当前音乐状态
         */

        socket.emit(
          "hostAuthSuccess",
          {

            roomOpen:
              room.roomOpen,

            music:
              getMusicState(room)

          }
        );


        broadcastPlayers(
          roomId
        );


        broadcastMusic(
          roomId
        );

      }
    );


    /* ==================================================
       修改昵称
       ================================================== */

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


        player.name =
          String(
            name || ""
          )
          .trim()
          .slice(
            0,
            12
          );


        if (
          !player.name
        ) {

          player.name =
            "玩家";

        }


        broadcastPlayers(
          socket.data.roomId
        );

      }
    );


    /* ==================================================
       性别
       ================================================== */

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


        if (
          gender !== "male" &&
          gender !== "female"
        ) {

          gender =
            "male";

        }


        player.gender =
          gender;


        broadcastPlayers(
          socket.data.roomId
        );

      }
    );


    /* ==================================================
       移动
       ================================================== */

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
              Number(
                pos?.x
              ) || 50
            )
          );


        player.y =
          Math.max(
            8,
            Math.min(
              92,
              Number(
                pos?.y
              ) || 50
            )
          );


        broadcastPlayers(
          socket.data.roomId
        );

      }
    );


    /* ==================================================
       聊天
       ================================================== */

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
          .slice(
            0,
            200
          );


        if (!text) return;


        io
          .to(
            socket.data.roomId
          )
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


    /* ==================================================
       互动表情
       ================================================== */

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
          !room ||
          !player ||
          !data
        ) {

          return;

        }


        const targetId =
          String(
            data.targetId ||
            ""
          );


        const emoji =
          String(
            data.emoji ||
            ""
          )
          .slice(
            0,
            8
          );


        if (
          !targetId ||
          !emoji ||
          !room.players.has(
            targetId
          )
        ) {

          return;

        }


        io
          .to(
            socket.data.roomId
          )
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


    /* ==================================================
       房主音乐控制
       ================================================== */

    socket.on(
      "musicControl",
      data => {

        const roomId =
          socket.data.roomId;

        const room =
          getRoom(roomId);


        if (!room) return;


        /*
         * 必须是当前房主
         */

        if (
          socket.id !==
          room.hostId
        ) {

          return;

        }


        if (!data) return;


        /*
         * 切歌
         */

        if (
          data.action ===
          "select"
        ) {

          let index =
            Number(
              data.index
            );


          if (
            !Number.isInteger(
              index
            )
          ) {

            return;

          }


          if (
            index < 0 ||
            index >=
              MUSIC_LIST.length
          ) {

            return;

          }


          room.music.index =
            index;

          room.music.position =
            0;

          room.music.startedAt =
            Date.now();


          room.music.playing =
            true;


          broadcastMusic(
            roomId
          );


          return;

        }


        /*
         * 播放
         */

        if (
          data.action ===
          "play"
        ) {

          room.music.position =
            getMusicPosition(
              room
            );

          room.music.startedAt =
            Date.now();

          room.music.playing =
            true;


          broadcastMusic(
            roomId
          );


          return;

        }


        /*
         * 暂停
         */

        if (
          data.action ===
          "pause"
        ) {

          room.music.position =
            getMusicPosition(
              room
            );

          room.music.playing =
            false;


          broadcastMusic(
            roomId
          );


          return;

        }


        /*
         * 下一首
         */

        if (
          data.action ===
          "next"
        ) {

          room.music.index =
            (
              room.music.index +
              1
            ) %
            MUSIC_LIST.length;


          room.music.position =
            0;

          room.music.startedAt =
            Date.now();

          room.music.playing =
            true;


          broadcastMusic(
            roomId
          );


          return;

        }


        /*
         * 上一首
         */

        if (
          data.action ===
          "prev"
        ) {

          room.music.index =
            (
              room.music.index -
              1 +
              MUSIC_LIST.length
            ) %
            MUSIC_LIST.length;


          room.music.position =
            0;

          room.music.startedAt =
            Date.now();

          room.music.playing =
            true;


          broadcastMusic(
            roomId
          );

        }

      }
    );


    /* ==================================================
       歌曲播放完毕
       客户端通知服务器
       ================================================== */

    socket.on(
      "musicEnded",
      index => {

        const roomId =
          socket.data.roomId;

        const room =
          getRoom(roomId);


        if (!room) return;


        /*
         * 只允许房主负责推进歌曲。
         *
         * 如果房主已经离开，
         * 普通用户也可以推进，
         * 保证音乐不会停。
         */

        if (
          room.hostId &&
          room.hostId !==
            socket.id
        ) {

          return;

        }


        if (
          Number(index) !==
          room.music.index
        ) {

          return;

        }


        room.music.index =
          (
            room.music.index +
            1
          ) %
          MUSIC_LIST.length;


        room.music.position =
          0;

        room.music.startedAt =
          Date.now();

        room.music.playing =
          true;


        broadcastMusic(
          roomId
        );

      }
    );


    /* ==================================================
       房主踢人
       ================================================== */

    socket.on(
      "kickPlayer",
      targetId => {

        const roomId =
          socket.data.roomId;

        const room =
          getRoom(roomId);


        if (!room) return;


        if (
          socket.id !==
          room.hostId
        ) {

          return;

        }


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


        targetSocket.emit(
          "kicked"
        );


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


        broadcastPlayers(
          roomId
        );


        socket.emit(
          "kickSuccess"
        );

      }
    );


    /* ==================================================
       关闭房间
       ================================================== */

    socket.on(
      "closeRoom",
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
            "closeRoomError"
          );

          return;

        }


        room.roomOpen =
          false;


        io
          .to(roomId)
          .emit(
            "roomClosed"
          );

      }
    );


    /* ==================================================
       重新开放
       ================================================== */

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

      }
    );


    /* ==================================================
       断开连接
       ================================================== */

    socket.on(
      "disconnect",
      () => {

        const roomId =
          socket.data.roomId;

        const room =
          getRoom(roomId);


        if (!room) return;


        const wasHost =
          socket.id ===
          room.hostId;


        room.players.delete(
          socket.id
        );


        /*
         * 房主离开
         */

        if (wasHost) {

          room.hostId =
            null;


          /*
           * 非常重要：
           *
           * 房主离开后，
           * 音乐继续播放。
           */

          room.music.position =
            getMusicPosition(
              room
            );

          room.music.startedAt =
            Date.now();

          room.music.playing =
            true;


          broadcastMusic(
            roomId
          );

        }


        broadcastPlayers(
          roomId
        );

      }
    );

  }
);


/* ======================================================
   Render
   ====================================================== */

const PORT =
  process.env.PORT || 3000;


server.listen(
  PORT,
  () => {

    console.log(
      "shako 平行空间 server running on port " +
      PORT
    );

    console.log(
      "Rooms: " +
      Object.keys(
        ROOM_CONFIG
      ).join(", ")
    );

  }
);
