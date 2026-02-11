const mongoose = require('mongoose');

const groupMessageSchema = new mongoose.Schema({
  from_user: { type: String, required: true, trim: true },
  room: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  date_sent: { type: Date, required: true, default: Date.now }
});

module.exports = mongoose.model('GroupMessage', groupMessageSchema);
