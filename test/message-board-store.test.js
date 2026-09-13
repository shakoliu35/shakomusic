const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { MessageBoardStore, MESSAGE_LIMIT, MESSAGE_TTL_MS } = require("../server/message-board-store");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "shakomusic-board-"));
const filePath = path.join(directory, "board.json");
let now = 1_700_000_000_000;
const store = new MessageBoardStore({ filePath, now: () => now });

const first = store.add("beach", { name: "小海", text: "三天内可见" });
assert.ok(first.message.id);
assert.deepStrictEqual(store.list("beach").map(message => message.text), ["三天内可见"]);

const restartedStore = new MessageBoardStore({ filePath, now: () => now });
assert.strictEqual(restartedStore.list("beach").length, 1, "重启后应重新读取留言");

for (let index = 1; index < MESSAGE_LIMIT; index += 1) {
  restartedStore.add("beach", { name: "访客", text: String(index) });
}
assert.strictEqual(restartedStore.list("beach").length, MESSAGE_LIMIT);
assert.strictEqual(restartedStore.add("beach", { name: "访客", text: "超出上限" }).error, "full");
assert.strictEqual(restartedStore.delete("beach", first.message.id), true);
assert.strictEqual(restartedStore.list("beach").length, MESSAGE_LIMIT - 1);

now += MESSAGE_TTL_MS + 1;
assert.deepStrictEqual(restartedStore.list("beach"), [], "三天后留言应自动过期");

fs.rmSync(directory, { recursive: true, force: true });
console.log("message-board-store tests passed");
