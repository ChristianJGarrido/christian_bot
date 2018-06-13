'use strict';
require('dotenv').config();
var jwt = require('jsonwebtoken');
const Agent = require('node-agent-sdk').Agent;
var counter = 0;

const agent = new Agent({
    accountId: process.env.LP_ACCOUNT,
    username: process.env.LP_USER,
    password: process.env.LP_PASS,
    csdsDomain: process.env.LP_CSDS // 'hc1n.dev.lprnd.net'
});

let openConvs = {};

var menu = require('./json/menu');
var intro = require('./json/introduction');
var background = require('./json/background');
var CDT = require('./json/CDT');
var ADI = require('./json/ADI');

var sendMenu = (id) => {
  console.log('Send Menu');
  agent.publishEvent({
    dialogId: id,
    event: {
        type: 'RichContentEvent',
        content: menu
    }
  });
}

var sendIntro = (id) => {
  console.log('Send Intro');
  agent.publishEvent({
    dialogId: id,
    event: {
        type: 'RichContentEvent',
        content: intro
    }
  });
}

var sendBackground = (id) => {
  console.log('Send Background');
  agent.publishEvent({
    dialogId: id,
    event: {
        type: 'RichContentEvent',
        content: background
    }
  });
}

var sendCDT = (id) => {
  console.log('Send Conversational Design Team');
  agent.publishEvent({
    dialogId: id,
    event: {
        type: 'RichContentEvent',
        content: CDT
    }
  });
}

var sendAddInfo = (id) => {
  console.log('Send Additonal Info');
  agent.publishEvent({
    dialogId: id,
    event: {
        type: 'RichContentEvent',
        content: ADI
    }
  });
}

var endConversation = (id) => {
  agent.updateConversationField({
    'conversationId': id,
    'conversationField': [{
        'field': 'ConversationStateField',
        'conversationState': 'CLOSE'
    }]
  }, () => {
    console.log('conversation closed'); 
  });
}

agent.on('connected', () => {
    console.log('connected...');
    agent.setAgentState({ availability: 'ONLINE' }); // Do not route me conversations, I'll join by myself.
    agent.subscribeExConversations({
        'convState': ['OPEN'], // subscribes to all open conversation in the account.
        'agentIds': [agent.agentId]
    });
    agent.subscribeRoutingTasks({});
});

agent.on('routing.RoutingTaskNotification', body => {
  console.log('Routing task');
  console.log(JSON.stringify(body));
  body.changes.forEach(change => {
      if (change.type === 'UPSERT') {
          change.result.ringsDetails.forEach(ring => {
              if (ring.ringState === 'WAITING') {
                  agent.updateRingState({
                      'ringId': ring.ringId,
                      'ringState': 'ACCEPTED'
                  }, (e, resp) => {
                      if (e) { console.error(`[bot.js] acceptWaitingConversations ${JSON.stringify(e)}`) }
                      else { 
                        console.info(`[bot.js] acceptWaitingConversations: Joined conversation ${JSON.stringify(change.result.conversationId)}, ${JSON.stringify(resp)}`)
                      }
                  });
              }
          });
      }
  });
});

agent.on('cqm.ExConversationChangeNotification', notificationBody => {
    //console.log(counter++);
    console.log('Conversation update');
    console.log(JSON.stringify(notificationBody));
    notificationBody.changes.forEach(change => {
        if (change.type === 'UPSERT') {
            if (!openConvs[change.result.convId]) {
                openConvs[change.result.convId] = change.result;
                if (!getParticipantInfo(change.result.conversationDetails, agent.agentId)) {
                  console.log('query Messages');
                  agent.request('.ams.ms.QueryMessages', {
                    'dialogId': change.result.convId,
                    'maxQuantity':1000,
                    'newerThanSequence': 0,
                    'olderThanSequence':1000
                  }, (e) => {
                    console.log(e);
                  });
                }
            }
        }
        else if (change.type === 'DELETE') {
            delete openConvs[change.result.convId];
            console.log('conversation was closed.\n');
        }
    });
});

agent.on('ms.MessagingEventNotification', notificationBody => {
  console.log(counter++);
  console.log(JSON.stringify(notificationBody));
  notificationBody.changes.forEach(change => {
      const respond = {};
      // In the current version MessagingEventNotification are recived also without subscription
      // Will be fixed in the next api version. So we have to check if this notification is handled by us.
      if (openConvs[change.dialogId]) {
          // add to respond list all content event not by me
          if (change.event.type === 'ContentEvent' && change.originatorId !== agent.agentId) {
              respond[`${notificationBody.dialogId}-${change.sequence}`] = {
                  dialogId: notificationBody.dialogId,
                  sequence: change.sequence,
                  message: change.event.message
              };
              var text = change.event.message;
              var id = notificationBody.dialogId;
              agent.publishEvent({
                "dialogId": notificationBody.dialogId,
                "event": {
                  "type": "ChatStateEvent",
                  "chatState": "COMPOSING"
                }
              });
              if(change.sequence > 0) {
                setTimeout(()=> {
                  switch (text) {
                    case 'Introduction':
                      sendIntro(id);
                      break;
                    case 'Background':
                      sendBackground(id);
                      break;
                    case 'Conversational Design Team':
                      sendCDT(id);
                      break;
                    case 'Addtional Info':
                      sendAddInfo(id);
                      break;
                    case 'End Conversation':
                      endConversation(id);
                      break;
                    default:
                      sendMenu(id);
                      console.log('From switch');
                      console.log(text);
                      break;
                  }
                  agent.publishEvent({
                    "dialogId": notificationBody.dialogId,
                    "event": {
                      "type": "ChatStateEvent",
                      "chatState": "ACTIVE"
                    }
                  });
                }, 2000);
              }
          }
          // remove from respond list all the messages that were already read
          if (change.event.type === 'AcceptStatusEvent' && change.originatorId === agent.agentId) {
              change.event.sequenceList.forEach(seq => {
                  delete respond[`${notificationBody.dialogId}-${seq}`];
              });
          }
      }
      Object.keys(respond).forEach(key => {
        var contentEvent = respond[key];
        agent.publishEvent({
            dialogId: contentEvent.dialogId,
            event: {type: "AcceptStatusEvent", status: "READ", sequenceList: [contentEvent.sequence]}
        });
        //this.emit(this.CONTENT_NOTIFICATION, contentEvent);
      });
  });
});

agent.on('error', err => {
  
    console.log('got an error', err);
});

agent.on('closed', data => {
    console.log('socket closed', data);
    agent.reconnect();//regenerate token for reasons of authorization (data === 4401 || data === 4407)
});

function getParticipantInfo(convDetails, participantId) {
    return convDetails.participants.filter(p => p.id === participantId)[0];
}


const express = require('express')
const app = express();

var bodyParser = require('body-parser');
const uuidv1 = require('uuid/v1');
const fs = require('fs');
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
app.set('views', __dirname + '/views');
app.set('view engine', 'pug');

app.get('/testPage', (req, res) => res.render('test.pug'));

app.post('/getJWT', (req,res) => {
  var private_key = fs.readFileSync('idp/private_key_idp.pem');
  var companyBranch = req.query.companyBranch ? req.query.companyBranch : '';
  console.log('jwt');
  console.log(req.body);
  var content = req.body ? req.body : undefined;
  var options = {
    algorithm: 'RS256',
    issuer: 'Christian_Test',
    expiresIn: '1h',
    subject: uuidv1()
  }
  if(content) {
    content = Array.isArray(content) ? content : [content];
  } else {
    content = [  
      {  
         type: 'ctmrinfo',
         info:{  
          companyBranch: companyBranch  
         }
      }
    ];
  }
  var payload = {lp_sdes: content};
  jwt.sign(payload, private_key, options, function(err, token) {
    if(err) {
      res.status(400);
      res.send(err);
      console.log(err);
    } else {
      res.send({
        jwt: token 
      });
    }
  });
});

app.listen(process.env.PORT||3001, () => console.log('App started'));