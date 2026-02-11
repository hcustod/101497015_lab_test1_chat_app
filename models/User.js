const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  firstname: { type: String, required: true, trim: true },
  lastname: { type: String, required: true, trim: true },
  password: { type: String, required: true },
  createon: { type: Date, required: true, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
