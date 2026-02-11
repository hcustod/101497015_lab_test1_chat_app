const path = require('path');
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

const User = require('./models/User');
const GroupMessage = require('./models/GroupMessage');
const PrivateMessage = require('./models/PrivateMessage');

const app = express();
const server = http.createServer(app);
const socketServer = new Server(server);

const port = process.env.PORT || 3000;
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/comp3133_lab_test_1';
const allowedRooms = new Set(['devops', 'cloud computing', 'covid19', 'sports', 'nodeJS']);

function sanitizeString(value, maxLength = 120) {
  if (typeof value !== 'string') {
    return '';
  }
  const cleaned = value.trim();
  if (!cleaned) {
    return '';
  }
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

function isAllowedRoom(room) {
  return allowedRooms.has(room);
}

mongoose.set('sanitizeFilter', true);

mongoose
  .connect(mongoUri)
  .then(() => {
    console.log('MongoDB connected');
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error.message);
  });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/view', express.static(path.join(__dirname, 'view')));

app.get('/', (req, res) => {
  res.redirect('/view/login.html');
});

app.post('/api/signup', async (req, res) => {
  try {
    const username = sanitizeString(req.body.username, 40);
    const firstname = sanitizeString(req.body.firstname, 60);
    const lastname = sanitizeString(req.body.lastname, 60);
    const password = sanitizeString(req.body.password, 200);

    if (!username || !firstname || !lastname || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    await User.create({
      username,
      firstname,
      lastname,
      password,
      createon: new Date()
    });

    return res.json({ success: true, message: 'Signup successful' });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }
    return res.status(500).json({ success: false, message: 'Signup failed' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const username = sanitizeString(req.body.username, 40);
    const password = sanitizeString(req.body.password, 200);

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    const user = await User.findOne({ username, password }).lean();

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    return res.json({
      success: true,
      user: {
        username: user.username,
        firstname: user.firstname,
        lastname: user.lastname
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Login failed' });
  }
});

app.get('/api/rooms/:room/messages', async (req, res) => {
  try {
    const room = sanitizeString(req.params.room, 40);
    const limit = Number(req.query.limit) || 100;

    if (!room || !isAllowedRoom(room)) {
      return res.status(400).json({ success: false, message: 'Room is required' });
    }

    const messages = await GroupMessage.find({ room })
      .sort({ date_sent: 1 })
      .limit(Math.min(limit, 200))
      .lean();

    return res.json({ success: true, messages });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Could not load room messages' });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const exclude = sanitizeString(req.query.exclude, 40);
    const users = await User.find({})
      .select('username -_id')
      .sort({ username: 1 })
      .limit(500)
      .lean();

    return res.json({
      success: true,
      users: users
        .map((user) => user.username)
        .filter((username) => (exclude ? username !== exclude : true))
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Could not load users' });
  }
});

const socketIdsByUser = new Map();
const userBySocketId = new Map();

function trackSocket(username, socketId) {
  if (!socketIdsByUser.has(username)) {
    socketIdsByUser.set(username, new Set());
  }
  socketIdsByUser.get(username).add(socketId);
  userBySocketId.set(socketId, username);
}

function untrackSocket(socketId) {
  const username = userBySocketId.get(socketId);
  if (!username) {
    return;
  }
  const sockets = socketIdsByUser.get(username);
  if (sockets) {
    sockets.delete(socketId);
    if (sockets.size === 0) {
      socketIdsByUser.delete(username);
    }
  }
  userBySocketId.delete(socketId);
}

socketServer.on('connection', (socket) => {
  socket.on('registerUser', ({ username }) => {
    const safeUsername = sanitizeString(username, 40);
    if (!safeUsername) {
      return;
    }
    socket.data.username = safeUsername;
    trackSocket(safeUsername, socket.id);
  });

  socket.on('joinRoom', ({ room, username }) => {
    const safeRoom = sanitizeString(room, 40);
    const safeUsername = sanitizeString(username, 40);

    if (!safeRoom || !isAllowedRoom(safeRoom)) {
      socket.emit('serverError', { message: 'Invalid room' });
      return;
    }
    if (safeUsername) {
      socket.data.username = safeUsername;
      trackSocket(safeUsername, socket.id);
    }
    if (socket.data.room) {
      socket.leave(socket.data.room);
    }
    socket.join(safeRoom);
    socket.data.room = safeRoom;
    socket.emit('roomJoined', { room: safeRoom });
  });

  socket.on('leaveRoom', ({ room }) => {
    const safeRoom = sanitizeString(room, 40);
    if (!safeRoom) {
      return;
    }
    socket.leave(safeRoom);
    if (socket.data.room === safeRoom) {
      socket.data.room = null;
    }
  });

  socket.on('groupMessage', async ({ from_user, room, message }) => {
    const fromUser = sanitizeString(from_user, 40);
    const roomName = sanitizeString(room, 40);
    const messageText = sanitizeString(message, 2000);
    const activeUsername = sanitizeString(socket.data.username, 40);
    const activeRoom = sanitizeString(socket.data.room, 40);

    if (!fromUser || !roomName || !messageText || !activeUsername || !activeRoom || !isAllowedRoom(roomName)) {
      return;
    }
    if (fromUser !== activeUsername || roomName !== activeRoom) {
      return;
    }
    try {
      const savedMessage = await GroupMessage.create({
        from_user: fromUser,
        room: roomName,
        message: messageText,
        date_sent: new Date()
      });

      socketServer.to(roomName).emit('groupMessage', {
        from_user: savedMessage.from_user,
        room: savedMessage.room,
        message: savedMessage.message,
        date_sent: savedMessage.date_sent
      });
    } catch (error) {
      socket.emit('serverError', { message: 'Could not send group message' });
    }
  });

  socket.on('privateMessage', async ({ from_user, to_user, message }) => {
    const fromUser = sanitizeString(from_user, 40);
    const toUser = sanitizeString(to_user, 40);
    const messageText = sanitizeString(message, 2000);
    const activeUsername = sanitizeString(socket.data.username, 40);

    if (!fromUser || !toUser || !messageText || !activeUsername) {
      return;
    }
    if (fromUser !== activeUsername) {
      return;
    }

    try {
      const recipientExists = await User.exists({ username: toUser });
      if (!recipientExists) {
        socket.emit('serverError', { message: 'Recipient username does not exist' });
        return;
      }

      const savedMessage = await PrivateMessage.create({
        from_user: fromUser,
        to_user: toUser,
        message: messageText,
        date_sent: new Date()
      });

      const recipientSockets = socketIdsByUser.get(toUser) || new Set();
      const senderSockets = socketIdsByUser.get(fromUser) || new Set();
      const targetSocketIds = new Set([...recipientSockets, ...senderSockets]);

      targetSocketIds.forEach((socketId) => {
        socketServer.to(socketId).emit('privateMessage', {
          from_user: savedMessage.from_user,
          to_user: savedMessage.to_user,
          message: savedMessage.message,
          date_sent: savedMessage.date_sent
        });
      });
    } catch (error) {
      socket.emit('serverError', { message: 'Could not send private message' });
    }
  });

  socket.on('typing', ({ room, username, to_user }) => {
    const safeRoom = sanitizeString(room, 40);
    const safeUsername = sanitizeString(username, 40);
    const toUser = sanitizeString(to_user, 40);
    const activeUsername = sanitizeString(socket.data.username, 40);
    const activeRoom = sanitizeString(socket.data.room, 40);

    if (!safeUsername || !activeUsername || safeUsername !== activeUsername) {
      return;
    }

    if (toUser) {
      const recipientSockets = socketIdsByUser.get(toUser) || new Set();
      recipientSockets.forEach((socketId) => {
        socketServer.to(socketId).emit('privateTyping', { from_user: safeUsername });
      });
      return;
    }

    if (safeRoom && isAllowedRoom(safeRoom) && activeRoom === safeRoom) {
      socket.to(safeRoom).emit('typing', { room: safeRoom, username: safeUsername });
    }
  });

  socket.on('disconnect', () => {
    untrackSocket(socket.id);
  });
});

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
