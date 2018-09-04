var socket = io();
var RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection || window.msRTCPeerConnection;
var RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription || window.msRTCSessionDescription;
navigator.getUserMedia = navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia || navigator.msGetUserMedia;

var configuration = {"iceServers": [{"url": "stun:stun.l.google.com:19302"}]};

var pcPeers = {};
var selfView = document.getElementById("self-view");
var remoteViewContainer = document.getElementById("remote-view-container");
var localStream;
function getLocalStream() {
  navigator.getUserMedia({ "audio": true, "video": true }, function (stream) {
    localStream = stream;
    selfView.src = URL.createObjectURL(stream);
    selfView.muted = true;
  }, logError);
}
function join(roomID) {
  socket.emit('join', roomID, function(socketIds){
    for (var i in socketIds) {
      var socketId = socketIds[i];
      createPC(socketId, true);
    }
  });
}
function createPC(socketId, isOffer) {
  var pc = new RTCPeerConnection(configuration);
  pcPeers[socketId] = pc;
  pc.onicecandidate = function (event) {
    if (event.candidate) {
      socket.emit('exchange', {'to': socketId, 'candidate': event.candidate });
    }
  };
  function createOffer() {
    pc.createOffer(function(desc) {
      pc.setLocalDescription(desc, function () {
        socket.emit('exchange', {'to': socketId, 'sdp': pc.localDescription });
      }, logError);
    }, logError);
  }
  pc.onnegotiationneeded = function () {
    if (isOffer) {
      createOffer();
    }
  }

  pc.oniceconnectionstatechange = function(event) {
    if (event.target.iceConnectionState === 'connected') {
     createDataChannel(isOffer, event);
    }
  };

  pc.ondatachannel = function(event) {
    createDataChannel(isOffer, event);
  };

  pc.onaddstream = function (event) {
    var element = document.createElement('video');
    // element.style.height = '100px';
    // element.style.width = '150x';
    element.style.position = 'fixed';
    element.style.right = 0;
    element.style.bottom = 0;
    element.style.minWidth = '100%'; 
    element.style.minHeight = '100%';
    element.id = "remoteView" + socketId;
    element.autoplay = 'autoplay';
    element.src = URL.createObjectURL(event.stream);
    remoteViewContainer.appendChild(element);
  };

  pc.addStream(localStream);
  

  function createDataChannel(isOffer, _event) {
    if (pc.textDataChannel) {
      return;
    }
    var dataChannel = null;
    if(isOffer){
      dataChannel = pc.createDataChannel("text");
    }else{
      dataChannel = _event.channel;
    }

    dataChannel.onerror = function (error) {
      console.log("dataChannel.onerror", error);
    };
    dataChannel.onmessage = function (event) {
      var content = document.getElementById('text-room-content');
      var messageBlock = '<div class="chat-container"><p style="text-align: right"><span class="in-coming-msg">'  + socketId + ': ' + event.data + '</span></p></div>'
      content.innerHTML = content.innerHTML + messageBlock;
      content.scrollTop = content.scrollHeight;
    };
    dataChannel.onopen = function () {
      var textRoom = document.getElementById('text-room');
    };
    dataChannel.onclose = function () {
      console.log("dataChannel.onclose");
    };
    pc.textDataChannel = dataChannel;
  }

  return pc;
}
function exchange(data) {
  var fromId = data.from;
  var pc;
  if (fromId in pcPeers) {
    pc = pcPeers[fromId];
  } else {
    pc = createPC(fromId, false);
  }
  if (data.sdp) {
    pc.setRemoteDescription(new RTCSessionDescription(data.sdp), function () {
      if (pc.remoteDescription.type == "offer")
        pc.createAnswer(function(desc) {
          pc.setLocalDescription(desc, function () {
            socket.emit('exchange', {'to': fromId, 'sdp': pc.localDescription });
          }, logError);
        }, logError);
    }, logError);
  } else {
    pc.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
}

function leave(socketId) {
  var pc = pcPeers[socketId];
  pc.close();
  delete pcPeers[socketId];
  var video = document.getElementById("remoteView" + socketId);
  if (video) video.remove();
}
socket.on('exchange', function(data){
  exchange(data);
});
socket.on('leave', function(socketId){
  leave(socketId);
});
socket.on('connect', function(data) {
  getLocalStream();
});
function logError(error) {
  console.log("logError", error);
}

function callDisconnect () {
  document.getElementById('call-btn').disabled = false;
  document.getElementById('leave-btn').disabled = true;
  socket.close();
  location.reload();
}
function press() {
    join('test');
    document.getElementById('call-btn').disabled = true;
}
function textRoomPress() {
  console.log(socket);
  var text = document.getElementById('text-room-input').value;
  if (text == "") {
    alert('Enter something');
  } else {
    document.getElementById('text-room-input').value = '';
    var content = document.getElementById('text-room-content');
    var messageBlock = '<div class="chat-container"><p><span class="out-going-msg">'  + 'Me' + ': ' + text + '</span></p></div>'
    content.innerHTML = content.innerHTML + messageBlock;
    content.scrollTop = content.scrollHeight;
    for (var key in pcPeers) {
      var pc = pcPeers[key];
      pc.textDataChannel.send(text);
    }
  }
}

function clearChat() {
  document.getElementById('text-room-content').innerHTML = "";
}