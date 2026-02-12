const socketClient = io();
const availableRooms = ['devops', 'cloud computing', 'covid19', 'sports', 'nodeJS'];

let activeRoom = null;
let pendingRoomJoin = null;
let roomTypingTimeout = null;
let privateTypingTimeout = null;

const storedUser = localStorage.getItem('user');
if (!storedUser) {
  window.location.href = '/view/login.html';
}

let currentUser = {};

try {
  currentUser = JSON.parse(storedUser || '{}');
} catch (error) {
  localStorage.removeItem('user');
  window.location.href = '/view/login.html';
}
if (!currentUser.username) {
  localStorage.removeItem('user');
  window.location.href = '/view/login.html';
}

$('#currentUser').text(currentUser.username);
availableRooms.forEach((roomName) => {
  $('#roomSelect').append(`<option value="${roomName}">${roomName}</option>`);
});

socketClient.emit('registerUser', { username: currentUser.username });

async function refreshUserSuggestions() {
  try {
    const response = await fetch(`/api/users?exclude=${encodeURIComponent(currentUser.username)}`);
    const data = await response.json();

    if (!response.ok || !data.success) {
      return;
    }

    const hintBox = $('#userSuggestions');
    hintBox.empty();
    data.users.forEach((username) => {
      hintBox.append(`<option value="${username}"></option>`);
    });
  } catch (error) {
  }
}

refreshUserSuggestions();

async function userExists(username) {
  try {
    const response = await fetch('/api/users');
    const data = await response.json();
    if (!response.ok || !data.success || !Array.isArray(data.users)) {
      return false;
    }
    return data.users.includes(username);
  } catch (error) {
    return false;
  }
}

$('#logoutBtn').on('click', () => {
  localStorage.removeItem('user');
  window.location.href = '/view/login.html';
});

$('#joinRoomBtn').on('click', () => {
  const selectedRoom = $('#roomSelect').val();
  if (!selectedRoom) {
    return;
  }
  pendingRoomJoin = selectedRoom;
  socketClient.emit('joinRoom', { room: selectedRoom, username: currentUser.username });
});

$('#leaveRoomBtn').on('click', () => {
  if (!activeRoom) {
    return;
  }
  socketClient.emit('leaveRoom', { room: activeRoom, username: currentUser.username });
  activeRoom = null;
  pendingRoomJoin = null;
  $('#activeRoom').text('none');
  $('#messages').empty();
  $('#typingStatus').text('');
});

function appendMessageLine(targetBox, text) {
  const item = $('<div class="message-item"></div>').text(text);
  $(targetBox).append(item);
  const panel = $(targetBox)[0];
  panel.scrollTop = panel.scrollHeight;
}

async function loadRoomHistory(roomName) {
  try {
    const response = await fetch(`/api/rooms/${encodeURIComponent(roomName)}/messages`);
    const data = await response.json();

    if (activeRoom !== roomName) {
      return;
    }

    $('#messages').empty();

    if (!response.ok || !data.success) {
      appendMessageLine('#messages', 'Could not load previous messages for this room.');
      return;
    }

    data.messages.forEach((message) => {
      appendMessageLine('#messages', `[${message.room}] ${message.from_user}: ${message.message}`);
    });
  } catch (error) {
    if (activeRoom !== roomName) {
      return;
    }
    $('#messages').empty();
    appendMessageLine('#messages', 'Could not load previous messages for this room.');
  }
}

socketClient.on('roomJoined', (data) => {
  if (!data.room || data.room !== pendingRoomJoin) {
    return;
  }
  activeRoom = data.room;
  pendingRoomJoin = null;
  $('#activeRoom').text(data.room);
  $('#typingStatus').text('');
  loadRoomHistory(data.room);
});

$('#sendBtn').on('click', () => {
  const message = $('#messageInput').val().trim();
  if (!activeRoom || !message) {
    return;
  }
  socketClient.emit('groupMessage', {
    from_user: currentUser.username,
    room: activeRoom,
    message
  });
  $('#messageInput').val('');
});

$('#messageInput').on('keypress', () => {
  if (!activeRoom) {
    return;
  }
  socketClient.emit('typing', { room: activeRoom, username: currentUser.username });
});

$('#sendPrivateBtn').on('click', async () => {
  const to_user = $('#privateToInput').val().trim();
  const message = $('#privateMessageInput').val().trim();
  if (!to_user || !message) {
    return;
  }
  if (to_user === currentUser.username) {
    alert('You cannot send a private message to yourself');
    return;
  }
  const recipientFound = await userExists(to_user);
  if (!recipientFound) {
    alert('Recipient username does not exist');
    return;
  }
  socketClient.emit('privateMessage', {
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
  socketClient.emit('typing', {
    username: currentUser.username,
    to_user
  });
});

$('#privateToInput').on('focus', () => {
  refreshUserSuggestions();
});

socketClient.on('groupMessage', (data) => {
  if (!activeRoom || data.room !== activeRoom) {
    return;
  }
  appendMessageLine('#messages', `[${data.room}] ${data.from_user}: ${data.message}`);
});

socketClient.on('privateMessage', (data) => {
  if (data.from_user !== currentUser.username && data.to_user !== currentUser.username) {
    return;
  }
  appendMessageLine('#privateMessages', `[PRIVATE] ${data.from_user} -> ${data.to_user}: ${data.message}`);
});

socketClient.on('typing', (data) => {
  if (!activeRoom || data.room !== activeRoom || data.username === currentUser.username) {
    return;
  }
  $('#typingStatus').text(`${data.username} is typing...`);
  clearTimeout(roomTypingTimeout);
  roomTypingTimeout = setTimeout(() => {
    $('#typingStatus').text('');
  }, 1000);
});

socketClient.on('privateTyping', (data) => {
  if (!data.from_user || data.from_user === currentUser.username) {
    return;
  }
  $('#privateTypingStatus').text(`${data.from_user} is typing...`);
  clearTimeout(privateTypingTimeout);
  privateTypingTimeout = setTimeout(() => {
    $('#privateTypingStatus').text('');
  }, 1000);
});

socketClient.on('serverError', (data) => {
  alert(data.message || 'Server error');
});
