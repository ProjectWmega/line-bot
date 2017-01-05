var bot = require('line-bot-sdk');
var channelInfo = require('./channel_info');
var client = bot.client({
  channelID: channelInfo.id,
  channelSecret: channelInfo.secret,
  channelToken: channelInfo.token
});