'use strict';
require('dotenv').config();
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
    agent.setAgentState({ availability: 'AWAY' }); // Do not route me conversations, I'll join by myself.
    agent.subscribeExConversations({
        'convState': ['OPEN'] // subscribes to all open conversation in the account.
    });
});

agent.on('cqm.ExConversationChangeNotification', notificationBody => {
    console.log(counter++);
    console.log(JSON.stringify(notificationBody));
    notificationBody.changes.forEach(change => {
        if (change.type === 'UPSERT') {
            if (!openConvs[change.result.convId]) {
                openConvs[change.result.convId] = change.result;
                if (!getParticipantInfo(change.result.conversationDetails, agent.agentId)) {
                    agent.updateConversationField({
                        'conversationId': change.result.convId,
                        'conversationField': [{
                            'field': 'ParticipantsChange',
                            'type': 'ADD',
                            'role': 'MANAGER'
                        }]
                    }, () => {
                      agent.publishEvent({
                        "dialogId": change.result.convId,
                        "event": {
                          "type": "ChatStateEvent",
                          "chatState": "COMPOSING"
                        }
                      });
                      setTimeout(()=> {
                        agent.publishEvent({
                              dialogId: change.result.convId,
                              event: {
                                  type: 'ContentEvent',
                                  contentType: 'text/plain',
                                  message: 'Welcome to Christian Garrido\'s information bot'
                              }
                        });
                        agent.publishEvent({
                          "dialogId": change.result.convId,
                          "event": {
                            "type": "ChatStateEvent",
                            "chatState": "COMPOSING"
                          }
                        });
                        setTimeout(()=> {
                          agent.publishEvent({
                            dialogId: change.result.convId,
                            event: {
                                type: 'ContentEvent',
                                contentType: 'text/plain',
                                message: 'Please select from the below menu on the information you want to know about Christian'
                            }
                          });
                          agent.publishEvent({
                            "dialogId": change.result.convId,
                            "event": {
                              "type": "ChatStateEvent",
                              "chatState": "COMPOSING"
                            }
                          });
                          setTimeout(()=> {
                            sendMenu(change.result.convId);
                          }, 2000);
                        }, 3000);
                      }, 3000);   
                   });
                }
            } else {
              if(change.result.lastContentEventNotification && 
                change.result.lastContentEventNotification.originatorMetadata.role == 'CONSUMER' &&
                !openConvs[change.result.convId].lastContentEventNotification 
              ) {
                openConvs[change.result.convId].lastContentEventNotification = change.result.lastContentEventNotification;
              }
              if(change.result.lastContentEventNotification && 
                change.result.lastContentEventNotification.originatorMetadata.role == 'CONSUMER' &&
                openConvs[change.result.convId].lastContentEventNotification &&
                openConvs[change.result.convId].lastContentEventNotification.sequence != change.result.lastContentEventNotification.sequence
              ) {
                var text = change.result.lastContentEventNotification.event.message;
                var id = change.result.convId;
                agent.publishEvent({
                  "dialogId": change.result.convId,
                  "event": {
                    "type": "ChatStateEvent",
                    "chatState": "COMPOSING"
                  }
                });
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
                }, 2000);
              }
            }
        }
        else if (change.type === 'DELETE') {
            delete openConvs[change.result.convId];
            console.log('conversation was closed.\n');
        }
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
app.set('views', __dirname + '/views');
app.set('view engine', 'pug');

app.get('/testPage', (req, res) => res.render('test.pug'));

app.listen(process.env.PORT||3001, () => console.log('App started'));