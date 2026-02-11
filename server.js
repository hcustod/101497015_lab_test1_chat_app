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
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/comp3133_lab_test_1';

mongoose
  .connect(MONGODB_URI)
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
    const { username, firstname, lastname, password } = req.body;

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
    const { username, password } = req.body;

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
    const { room } = req.params;
    const limit = Number(req.query.limit) || 100;

    if (!room) {
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
    const exclude = req.query.exclude ? String(req.query.exclude).trim() : '';
    const filter = exclude ? { username: { $ne: exclude } } : {};

    const users = await User.find(filter)
      .select('username -_id')
      .sort({ username: 1 })
      .limit(500)
      .lean();

    return res.json({
      success: true,
      users: users.map((user) => user.username)
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Could not load users' });
  }
});

const userSockets = new Map();
const socketUsers = new Map();

function addSocketForUser(username, socketId) {
  if (!userSockets.has(username)) {
    userSockets.set(username, new Set());
  }
  userSockets.get(username).add(socketId);
  socketUsers.set(socketId, username);
}

function removeSocket(socketId) {
  const username = socketUsers.get(socketId);
  if (!username) {
    return;
  }
  const sockets = userSockets.get(username);
  if (sockets) {
    sockets.delete(socketId);
    if (sockets.size === 0) {
      userSockets.delete(username);
    }
  }
  socketUsers.delete(socketId);
}

io.on('connection', (socket) => {
  socket.on('registerUser', ({ username }) => {
    if (!username) {
      return;
    }
    socket.data.username = username;
    addSocketForUser(username, socket.id);
  });

  socket.on('joinRoom', ({ room, username }) => {
    if (!room) {
      return;
    }
    if (username) {
      socket.data.username = username;
      addSocketForUser(username, socket.id);
    }
    if (socket.data.room) {
      socket.leave(socket.data.room);
    }
    socket.join(room);
    socket.data.room = room;
    socket.emit('roomJoined', { room });
  });

  socket.on('leaveRoom', ({ room }) => {
    if (!room) {
      return;
    }
    socket.leave(room);
    if (socket.data.room === room) {
      socket.data.room = null;
    }
  });

  socket.on('groupMessage', async ({ from_user, room, message }) => {
    if (!from_user || !room || !message) {
      return;
    }
    try {
      const savedMessage = await GroupMessage.create({
        from_user,
        room,
        message,
        date_sent: new Date()
      });

      io.to(room).emit('groupMessage', {
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
    if (!from_user || !to_user || !message) {
      return;
    }

    try {
      const savedMessage = await PrivateMessage.create({
        from_user,
        to_user,
        message,
        date_sent: new Date()
      });

      const recipientSockets = userSockets.get(to_user) || new Set();
      const senderSockets = userSockets.get(from_user) || new Set();
      const targetSocketIds = new Set([...recipientSockets, ...senderSockets]);

      targetSocketIds.forEach((socketId) => {
        io.to(socketId).emit('privateMessage', {
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
    if (!username) {
      return;
    }

    if (to_user) {
      const recipientSockets = userSockets.get(to_user) || new Set();
      recipientSockets.forEach((socketId) => {
        io.to(socketId).emit('privateTyping', { from_user: username });
      });
      return;
    }

    if (room) {
      socket.to(room).emit('typing', { room, username });
    }
  });

  socket.on('disconnect', () => {
    removeSocket(socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
