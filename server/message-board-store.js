const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MESSAGE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const MESSAGE_LIMIT = 10;

class MessageBoardStore {
  constructor({ filePath, now = () => Date.now() } = {}) {
    this.filePath = filePath || path.join(__dirname, "../data/message-board.json");
    this.now = now;
    this.boards = this.load();
    this.prune();
  }

  load() {
    try {
      const saved = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return saved && typeof saved === "object" ? saved : {};
    } catch (error) {
      return {};
    }
  }

  save() {
    const directory = path.dirname(this.filePath);
    fs.mkdirSync(directory, { recursive: true });
    const temporaryFile = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify(this.boards), "utf8");
    fs.renameSync(temporaryFile, this.filePath);
  }

  prune(roomId) {
    const expiresBefore = this.now() - MESSAGE_TTL_MS;
    const roomIds = roomId ? [roomId] : Object.keys(this.boards);
    let changed = false;

    roomIds.forEach(id => {
      const messages = Array.isArray(this.boards[id]) ? this.boards[id] : [];
      const currentMessages = messages.filter(message =>
        message && Number(message.createdAt) > expiresBefore
      );

      if (currentMessages.length !== messages.length) {
        changed = true;
      }

      if (currentMessages.length) {
        this.boards[id] = currentMessages;
      } else if (this.boards[id]) {
        delete this.boards[id];
        changed = true;
      }
    });

    if (changed) this.save();
    return changed;
  }

  list(roomId) {
    this.prune(roomId);
    return [...(this.boards[roomId] || [])];
  }

  add(roomId, { name, text }) {
    const messages = this.list(roomId);
    if (messages.length >= MESSAGE_LIMIT) {
      return { error: "full", messages };
    }

    const message = {
      id: crypto.randomUUID(),
      name,
      text,
      createdAt: this.now()
    };

    this.boards[roomId] = [...messages, message];
    this.save();
    return { message, messages: this.list(roomId) };
  }

  delete(roomId, messageId) {
    const messages = this.list(roomId);
    const nextMessages = messages.filter(message => message.id !== messageId);

    if (nextMessages.length === messages.length) return false;

    if (nextMessages.length) {
      this.boards[roomId] = nextMessages;
    } else {
      delete this.boards[roomId];
    }

    this.save();
    return true;
  }
}

module.exports = { MessageBoardStore, MESSAGE_LIMIT, MESSAGE_TTL_MS };
