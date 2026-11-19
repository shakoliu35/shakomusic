
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const MESSAGE_TTL_MS = 5 * 24 * 60 * 60 * 1000;
const MESSAGE_LIMIT = 10;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

class MessageBoardStore {
  async list(roomId) {
    const expiresBefore = new Date(Date.now() - MESSAGE_TTL_MS).toISOString();

    const { error: deleteError } = await supabase
      .from("message_board")
      .delete()
      .eq("room_id", roomId)
      .lt("created_at", expiresBefore);

    if (deleteError) throw deleteError;

    const { data, error } = await supabase
      .from("message_board")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return data.map(message => ({
      id: message.id,
      name: message.name,
      text: message.content,
      createdAt: new Date(message.created_at).getTime()
    }));
  }

  async add(roomId, { name, text }) {
    const messages = await this.list(roomId);

    if (messages.length >= MESSAGE_LIMIT) {
      return { error: "full", messages };
    }

    const message = {
      id: crypto.randomUUID(),
      name,
      text,
      createdAt: Date.now()
    };

    const { error } = await supabase
      .from("message_board")
      .insert({
        id: message.id,
        room_id: roomId,
        name,
        content: text,
        created_at: new Date(message.createdAt).toISOString()
      });

    if (error) throw error;

    return {
      message,
      messages: await this.list(roomId)
    };
  }

  async delete(roomId, messageId) {
    const { data, error } = await supabase
      .from("message_board")
      .delete()
      .eq("room_id", roomId)
      .eq("id", messageId)
      .select("id");

    if (error) throw error;

    return data.length > 0;
  }
}

module.exports = {
  MessageBoardStore,
  MESSAGE_LIMIT,
  MESSAGE_TTL_MS
};
