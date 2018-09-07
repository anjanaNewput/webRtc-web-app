var express = require('express');
var app = express();
var fs = require('fs');
var open = require('open');
var options = {
  key: fs.readFileSync('./ssl/key.pem'),
  cert: fs.readFileSync('./ssl/certificate.pem')
};
var serverPort = (process.env.PORT  || 4443);
var https = require('https');
var http = require('http');
var server;
if (process.env.LOCAL) {
  server = https.createServer(options, app);
} else {
  server = http.createServer(app);
}
var io = require('socket.io')(server);

var roomList = {};

app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});
server.listen(serverPort, function(){
  console.log('server up and running at %s port', serverPort);
  if (process.env.LOCAL) {
    open('https://localhost:' + serverPort)
  }
});
app.get('/app.js', function(req, res) {
    res.sendFile(__dirname + '/app.js');
});
app.get('/user_profile.png', function(req, res) {
  res.sendFile(__dirname + '/user_profile.png');
});

function socketIdsInRoom(name) {
  var socketIds = io.nsps['/'].adapter.rooms[name];
  if (socketIds) {
    var collection = [];
    for (var key in socketIds) {
      collection.push(key);
    }
    return collection;
  } else {
    return [];
  }
}

io.on('connection', function(socket){
  socket.on('disconnect', function(){
    if (socket.room) {
      var room = socket.room;
      io.to(room).emit('leave', socket.id);
      socket.leave(room);
    }
  });

  socket.on('typing', function(data){
    socket.broadcast.emit('typing', data);
  });

  socket.on('join', function(name, callback){
    var socketIds = socketIdsInRoom(name);
    callback(socketIds);
    socket.join(name);
    socket.room = name;
  });

  socket.on('call-started', function(data) {
    socket.broadcast.emit('notify', data.currentUser);
  });


  socket.on('exchange', function(data){
    data.from = socket.id;
    var to = io.sockets.connected[data.to];
    to.emit('exchange', data);
  });
});
