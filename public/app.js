const socket = io();
const rooms = ['devops', 'cloud computing', 'covid19', 'sports', 'nodeJS'];
let currentRoom = null;
let typingTimeout = null;
let privateTypingTimeout = null;

const rawUser = localStorage.getItem('user');
if (!rawUser) {
  window.location.href = '/view/login.html';
}

const currentUser = JSON.parse(rawUser || '{}');
if (!currentUser.username) {
  localStorage.removeItem('user');
  window.location.href = '/view/login.html';
}

$('#currentUser').text(currentUser.username);
rooms.forEach((room) => {
  $('#roomSelect').append(`<option value="${room}">${room}</option>`);
});

socket.emit('registerUser', { username: currentUser.username });

$('#logoutBtn').on('click', () => {
  localStorage.removeItem('user');
  window.location.href = '/view/login.html';
});

$('#joinRoomBtn').on('click', () => {
  const room = $('#roomSelect').val();
  if (!room) {
    return;
  }
  socket.emit('joinRoom', { room, username: currentUser.username });
  currentRoom = room;
  $('#activeRoom').text(room);
  $('#messages').empty();
  $('#typingStatus').text('');
});

$('#leaveRoomBtn').on('click', () => {
  if (!currentRoom) {
    return;
  }
  socket.emit('leaveRoom', { room: currentRoom, username: currentUser.username });
  currentRoom = null;
  $('#activeRoom').text('none');
  $('#typingStatus').text('');
});

function appendMessage(containerId, text) {
  const item = $('<div class="message-item"></div>').text(text);
  $(containerId).append(item);
  const container = $(containerId)[0];
  container.scrollTop = container.scrollHeight;
}

$('#sendBtn').on('click', () => {
  const message = $('#messageInput').val().trim();
  if (!currentRoom || !message) {
    return;
  }
  socket.emit('groupMessage', {
    from_user: currentUser.username,
    room: currentRoom,
    message
  });
  $('#messageInput').val('');
});

$('#messageInput').on('keypress', () => {
  if (!currentRoom) {
    return;
  }
  socket.emit('typing', { room: currentRoom, username: currentUser.username });
});

$('#sendPrivateBtn').on('click', () => {
  const to_user = $('#privateToInput').val().trim();
  const message = $('#privateMessageInput').val().trim();
  if (!to_user || !message) {
    return;
  }
  socket.emit('privateMessage', {
    from_user: currentUser.username,
    to_user,
    message
  });
  $('#privateMessageInput').val('');
});

$('#privateMessageInput').on('keypress', () => {
  const to_user = $('#privateToInput').val().trim();
  if (!to_user) {
    return;
  }
  socket.emit('typing', {
    username: currentUser.username,
    to_user
  });
});

socket.on('groupMessage', (data) => {
  if (!currentRoom || data.room !== currentRoom) {
    return;
  }
  appendMessage('#messages', `[${data.room}] ${data.from_user}: ${data.message}`);
});

socket.on('privateMessage', (data) => {
  if (data.from_user !== currentUser.username && data.to_user !== currentUser.username) {
    return;
  }
  appendMessage('#privateMessages', `[PRIVATE] ${data.from_user} -> ${data.to_user}: ${data.message}`);
});

socket.on('typing', (data) => {
  if (!currentRoom || data.room !== currentRoom || data.username === currentUser.username) {
    return;
  }
  $('#typingStatus').text(`${data.username} is typing...`);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    $('#typingStatus').text('');
  }, 1000);
});

socket.on('privateTyping', (data) => {
  if (!data.from_user || data.from_user === currentUser.username) {
    return;
  }
  $('#privateTypingStatus').text(`${data.from_user} is typing...`);
  clearTimeout(privateTypingTimeout);
  privateTypingTimeout = setTimeout(() => {
    $('#privateTypingStatus').text('');
  }, 1000);
});

socket.on('serverError', (data) => {
  alert(data.message || 'Server error');
});
