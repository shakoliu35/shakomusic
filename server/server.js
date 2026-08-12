const express=require("express");
const http=require("http");
const {Server}=require("socket.io");
const path=require("path");
const app=express();
const server=http.createServer(app);
const io=new Server(server);
app.use(express.static(path.join(__dirname,"../public")));

const players=new Map();

io.on("connection",socket=>{
  if(players.size>=10){
    socket.emit("full");
    socket.disconnect(true);
    return;
  }
  const spawns=[
    {x:50,y:55},{x:62,y:47},{x:38,y:47},{x:50,y:35},
    {x:25,y:60},{x:75,y:60},{x:25,y:35},{x:75,y:35},
    {x:40,y:75},{x:60,y:75}
  ];
  const spawn=spawns[players.size] || {x:50,y:55};
  players.set(socket.id,{id:socket.id,name:"玩家"+(players.size+1),x:spawn.x,y:spawn.y});
  socket.emit("init",{you:players.get(socket.id),players:[...players.values()]});
  io.emit("players",[...players.values()]);

  socket.on("setName",name=>{
    const p=players.get(socket.id);
    if(!p)return;
    name=String(name||"").trim().slice(0,12);
    if(name)p.name=name;
    io.emit("players",[...players.values()]);
  });

  socket.on("move",pos=>{
    const p=players.get(socket.id);
    if(!p)return;
    p.x=Math.max(5,Math.min(95,Number(pos.x)||50));
    p.y=Math.max(8,Math.min(92,Number(pos.y)||50));
    io.emit("players",[...players.values()]);
  });

  socket.on("chat",text=>{
    const p=players.get(socket.id);
    if(!p)return;
    text=String(text||"").trim().slice(0,200);
    if(text)io.emit("chat",{name:p.name,text});
  });

  socket.on("disconnect",()=>{
    players.delete(socket.id);
    io.emit("players",[...players.values()]);
  });
});
server.listen(process.env.PORT||3000,()=>console.log("Mini RooMi V2 running"));
