const express = require('express');
const router = express.Router();
const { handleChat } = require('../controllers/chatController');
const { validate, chatMessageSchema } = require('../validators');

router.post('/', validate({ body: chatMessageSchema }), handleChat);

module.exports = router;

