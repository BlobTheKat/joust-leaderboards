/*JOUST Leaderboard and Multiplayer Server
Copyright thei5pro, adamreiner 2021*/
//Subject to Apple App Store license
process.env.FIRE = process.env.FIRE || process.argv[2]
process.env.KEY = process.env.KEY || process.argv[3]
const fs = require("fs");
const app = require('express')();
const http = require("http").createServer(app);
let io = require("socket.io")(http);
let asset = require("asset-js")(require("asset-js-firestore")("db",process.env.fire,(a=>({}))))
let data = {}
asset("joust",{leaderboard:[],daily:[]},true).then(function(a){
  data = a;
});
app.get('/', (req, res) => {
  let day = Date.now()/864e5|0
  if(!data.day || data.day < day){data.day=day;data.daily=[]}
  res.json(data)
});
app.get('/push/:key/:name/:initials/:score', (req, res) => {
  console.log(new Date().toISOString()+": "+req.params.name+": "+req.params.score)
  let day = Date.now()/864e5|0
  if(!data.day || data.day < day){data.day=day;data.daily=[]}
  let score = Math.floor(req.params.score/50)*50
  let a = {name:req.params.name.replace(/[^a-z]/g,"").slice(0,5),initials:req.params.initials.replace(/[^a-z]/g,"").slice(0,3),score:score}
  if(!score || score < 0 || score > 20000000)return res.end("invalid score")
  if(req.params.key == process.env.KEY){
    let i = data.leaderboard.findIndex(a=>a.score<score);
    if(data.leaderboard.length<99 && i < 0)i=data.leaderboard.length
    if(i > -1){
      data.leaderboard.splice(i,0,a);
      if(data.leaderboard>20)data.leaderboard.splice(data.leaderboard.length-1,1)
    }
    i = data.daily.findIndex(a=>a.score<score);
    if(data.daily.length<6 && i < 0)i=data.daily.length
    if(i > -1){
      data.daily.splice(i,0,a);
      if(data.daily>6)data.daily.splice(data.daily.length-1,1)
    }
  }
  res.json(data)
});
app.get('/push2/:key/:id/:name/:score', (req, res) => {
  console.log(new Date().toISOString()+": "+req.params.id+": "+req.params.name+": "+req.params.score)
  let day = Date.now()/864e5|0
  if(!data.day || data.day < day){data.day=day;data.daily=[]}
  let score = Math.floor(req.params.score/50)*50
  let a = {name:req.params.name.replace(/[^a-z]/g,"").slice(0,5),initials:req.params.name.replace(/[^a-z]/g,"").slice(0,3),score:score,id:+req.params.id}
  if(!score || score < 0 || score > 20000000)return res.end("invalid score")
  if(req.params.key == process.env.KEY){
    let f = false
    data.leaderboard = data.leaderboard.filter(n=>n.id!=+req.params.id||(n.score>a.score&&(f=true)))
    if(f)return res.json(data)
    let i = data.leaderboard.findIndex(a=>a.score<score)
    if(data.leaderboard.length<99 && i < 0)i=data.leaderboard.length
    if(i > -1){
      data.leaderboard.splice(i,0,a);
      if(data.leaderboard>20)data.leaderboard.splice(data.leaderboard.length-1,1)
    }
    i = data.daily.findIndex(a=>a.score<score);
    if(data.daily.length<6 && i < 0)i=data.daily.length
    if(i > -1){
      data.daily.splice(i,0,a);
      if(data.daily>6)data.daily.splice(data.daily.length-1,1)
    }
  }
  res.json(data)
});
app.get('/newuser', function(req, res){
  data.users++
  data.users &= 0xFFFF
  res.end((data.users << 16) + crc16(data.users) + "")
  asset.save()
});
app.get('/users', function(req, res){
  res.end(fs.readFileSync('users.html').toString().replace("#",data.users||0))
})

let s = Date.now() & 0xFFFF
let crc16=function(a){a=(a<<16)+s;while(a>>16){a^=0xc6ca8000>>>Math.clz32(a)};return a&0xFFFF}

let cid = -1;
let free = null;
function str(num){
  if(typeof num == "number"){
    return ("0000"+num.toString()).slice(-5);
  }else{
    return +num
  }
}
let i = 0;
io.on("connection", (socket)=>{let PING = Date.now();socket.on("room",function(room){
  PING = Date.now() - PING
  let maxpl = 2;
  if(socket.authed)return;
  socket.authed = true;
  let host, id;
  if(room){
    if((io.sockets.adapter.rooms.get(room)||{size:0}).size>maxpl-1){
      socket.emit("roomfull");
      return socket.disconnect();
    }
    if((io.sockets.adapter.rooms.get(room)||{size:0}).size>=maxpl-1){
      socket.to(room).emit("ready", PING/1000)
      socket.emit("ready", PING/1000)
    }
    id = (io.sockets.adapter.rooms.get(room)||{}).size;
    host = false;
  }else if(room==""){
    id = 0;
    host = true;
    cid = (cid + 1)>>>0;
    room = str(crc16(cid));
    socket.emit("code", room);
  }else{
    if(free){
      [room,free] = [free,null];
      socket.to(room).emit("ready", PING/1000);
      socket.emit("ready", PING/1000);
    }else{
      cid = (cid + 1)>>>0;
      room = free = str(crc16(cid));
      socket.emit("code", room);
    }
  }
  socket.join(room);
  socket.on("disconnect", function(){
    if((io.sockets.adapter.rooms.get(room)||{size:0}).size<2){
      //destroy room
      if(free == room)free = null
      socket.to(room).emit("roomdestroy")
    }else{
      socket.to(room).emit("userdisc",id)
    }
  });
  socket.on("controldata",function(...data){
    //wave data
    //point/live data
    socket.to(room).emit("controldata", ...data)
  });
  socket.on("birddata",function(...data){
    //player data
    //enemy data
    socket.to(room).emit("birddata", ...data)
  });
  socket.on("eggdata", function(...data){
    //egg data
    //little man data
    socket.to(room).emit("eggdata", ...data)
  })
})})

let util=require("util")
let __=require("readline").createInterface(process.stdin,process.stdout);console.clear();console.in=console.input=console.ask=a=> new Promise(r=>__.question("\x1b[34m$ \x1b[m",r));
(async a=>{while(1){try{__.r=util.inspect(eval(await console.ask()),false,5,true)}catch(e){__.r="\x1b[31m"+e+"\x1b[m"};process.stdout.write(__.r+"\n")}})();
http.listen();