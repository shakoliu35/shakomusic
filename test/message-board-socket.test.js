const assert = require("assert");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { io } = require("socket.io-client");

const port = 3100 + Math.floor(Math.random() * 500);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "shakomusic-socket-"));
const server = spawn(process.execPath, ["server/server.js"], {
  env: {
    ...process.env,
    PORT: String(port),
    BEACH_ROOM_PASSWORD: "room-password",
    BEACH_HOST_PASSWORD: "host-password",
    MESSAGE_BOARD_FILE: path.join(directory, "board.json")
  }
});

function waitForEvent(socket, event, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeout);
    socket.once(event, value => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function connect() {
  const socket = io(`http://127.0.0.1:${port}`, { transports: ["websocket"] });
  await waitForEvent(socket, "connect");
  const initPromise = waitForEvent(socket, "init");
  socket.emit("auth", { roomId: "beach", password: "room-password" });
  return { socket, init: await initPromise };
}

(async () => {
  await new Promise((resolve, reject) => {
    server.stdout.on("data", output => output.includes("running on port") && resolve());
    server.once("error", reject);
  });

  const guest = await connect();
  guest.socket.emit("setName", "访客甲");
  await wait(30);
  const receivedBoard = waitForEvent(guest.socket, "messageBoard");
  guest.socket.emit("leaveMessage", "这是一条公开留言");
  const firstBoard = await receivedBoard;
  assert.strictEqual(firstBoard.length, 1);
  assert.strictEqual(firstBoard[0].name, "访客甲");
  assert.strictEqual(firstBoard[0].text, "这是一条公开留言");
  const messageId = firstBoard[0].id;
  guest.socket.disconnect();

  const secondGuest = await connect();
  assert.strictEqual(secondGuest.init.messageBoard.length, 1, "新进入的人应在初始化时收到留言");
  secondGuest.socket.emit("deleteMessage", messageId);
  await wait(30);
  const storedBeforeHostAuth = JSON.parse(fs.readFileSync(path.join(directory, "board.json"), "utf8"));
  assert.strictEqual(storedBeforeHostAuth.beach.length, 1, "普通访客不能删除留言");

  const host = await connect();
  const emptyBoard = waitForEvent(host.socket, "messageBoard");
  host.socket.emit("hostAuth", "host-password");
  await waitForEvent(host.socket, "hostAuthSuccess");
  host.socket.emit("deleteMessage", messageId);
  assert.deepStrictEqual(await emptyBoard, []);

  secondGuest.socket.disconnect();
  host.socket.disconnect();
  console.log("message-board socket tests passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  setTimeout(() => {
    server.kill();
    fs.rmSync(directory, { recursive: true, force: true });
  }, 50);
});
