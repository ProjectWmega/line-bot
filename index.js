var bot = require('line-bot-sdk');
var client = bot.client({
  channelID: '<your channel ID>',
  channelSecret: '<your channel secret>',
  channelToken: '<your channel token>'
});