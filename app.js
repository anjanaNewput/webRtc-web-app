var socket = io();
var currentUser;
var RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection || window.msRTCPeerConnection;
var RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription || window.msRTCSessionDescription;
navigator.getUserMedia = navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia || navigator.msGetUserMedia;

var configuration = {"iceServers": [{"url": "stun:stun.l.google.com:19302"}]};
var zoomIndex = 1;
var pcPeers = {};
var lastSliderValue = 0;
var selfView = document.getElementById("self-view");
var remoteViewContainer = document.getElementById("remote-view-container");
var localStream;
function getLocalStream(media) {
  console.log(media)
  navigator.getUserMedia(media, function (stream) {
    console.log(stream);
    localStream = stream;
    selfView.src = URL.createObjectURL(stream);
    selfView.muted = true;
    socket.emit('call-started', {'currentUser' : currentUser});
    join('test');
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
    console.log(event.stream)
    var element = document.createElement('video');
    var childElements = remoteViewContainer.childElementCount + 1;
    element.id = "remoteView" + socketId;
    element.autoplay = 'autoplay';
    element.src = URL.createObjectURL(event.stream);
    remoteViewContainer.appendChild(element);
    $('#remote-view-container').children().each(function() {
      this.style.width = `${100/childElements}%`; 
      this.style.height = `${100/childElements}%`;
    })
    
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
      var message = JSON.parse(event.data);
      document.getElementById('chat-block').style.display = 'block'
      var content = document.getElementById('text-room-content');
      var messageBlock = '<div class="chat-container"><p style="text-align: right"><span class="in-coming-msg">'  + message.name + ': ' + message.text + '</span></p></div>'
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
});


function logError(error) {
  console.log("logError", error);
}

function callDisconnect () {
  document.getElementById('call-btn').disabled = false;
  document.getElementById('video-btn').disabled = false;
  document.getElementById('leave-btn').disabled = true;
  remoteViewContainer.style.display = 'block';
  document.getElementsByClassName('user-profile')[0].style.display = 'none';
  socket.close();
  location.reload();
}

function video() {
    document.getElementById('video-btn').disabled = true;
    document.getElementsByClassName('user-profile')[0].style.display = 'none';
    getLocalStream({video:true, audio:true});
    //socket.emit('call-started', currentUser);
}

function call() {
  document.getElementById('call-btn').disabled = true;
  remoteViewContainer.style.display = 'none';
  document.getElementsByClassName('user-profile')[0].style.display = 'block';
  getLocalStream({audio: true, video:false})
  //socket.emit('call-started', currentUser);
}

socket.on('notify', function(user) {
  var options = {
    body: 'Do want to join?',
    dir : "ltr"
  };
  if (!("Notification" in window)) {
    alert("This browser does not support desktop notification");
  }

  else if (Notification.permission === "granted") {
    var notification = new Notification(user+ " wants to start call",options);
  }
  else if (Notification.permission !== 'denied') {
    Notification.requestPermission(function (permission) {
      if (!('permission' in Notification)) {
        Notification.permission = permission;
      }
      if (permission === "granted") {
        var notification = new Notification(user + " wants to start call", options);
      }
    });
  }

})

function chat() {
  if(document.getElementById('chat-block').style.display == 'none') {
    document.getElementById('chat-block').style.display = 'block';
  } else {
    document.getElementById('chat-block').style.display = 'none';
  }
  
}


function textRoomPress() {
  socket.emit('typing', null);
  var text = document.getElementById('text-room-input').value;
  if (text == "") {
    alert('Enter something');
  } else {
    document.getElementById('text-room-input').value = '';
    var content = document.getElementById('text-room-content');
    var messageBlock = '<div class="chat-container"><p><span class="out-going-msg">'  + currentUser + ': ' + text + '</span></p></div>'
    content.innerHTML = content.innerHTML + messageBlock;
    content.scrollTop = content.scrollHeight;
    for (var key in pcPeers) {
      var pc = pcPeers[key];
      pc.textDataChannel.send(JSON.stringify({name: currentUser, text: text}));
    }
  }
}

function clearChat() {
  document.getElementById('text-room-content').innerHTML = "";
}

function typing() {
  socket.emit('typing', currentUser);
}


function onBlur() {
  socket.emit('typing', null);
}


$(window).on('load',function(){
  $('#myModal').modal('show');
  Notification.requestPermission(function (permission) {
    if (!('permission' in Notification)) {
      Notification.permission = permission;
    }
  });
});


function closeModal() {
  currentUser = document.getElementById('user-name').value;
}

socket.on('typing', function(data){
  if(data) {
    document.getElementById('typing-span').innerHTML = data + ' is typing...';
  } else {
    document.getElementById('typing-span').innerHTML = '';
  }
});

function changePosition() {
  var myVideoUrl = document.getElementById('self-view').src;
  var remoteVideoUrl =  remoteViewContainer.getElementsByTagName('video')[0].src;
  document.getElementById('self-view').src = remoteVideoUrl;
  remoteViewContainer.getElementsByTagName('video')[0].src = myVideoUrl;
}

function zoom(event) {
  if(event.target.value > lastSliderValue) {
    zoomIndex = zoomIndex + 0.1;
  } else {
    zoomIndex = zoomIndex - 0.1;
  }
  remoteViewContainer.getElementsByTagName('video')[0].style.transform = 'scale('+zoomIndex+')';
  lastSliderValue = event.target.value
};