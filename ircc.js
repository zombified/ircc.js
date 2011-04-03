/*
Copyright (C) 2011 by Joel Kleier

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

var sys = require('sys');
var net = require('net');
var events = require('events');
var _ = require('underscore');
_.mixin(require('./node_modules/underscore.string/lib/underscore.string'));

// this creates a closure so that the 'this' property of the callback will be the same
//  as the scope passed into this function
function bind(fn, scope) {
    var args = Array.prototype.slice.call(arguments).slice(2); // convert arguments into an actual array, then only take any optional arguments passed
    return function() {
        fn.apply(scope, args.concat(arguments));
    };
}




var Client = function(host, port, nick) {
    events.EventEmitter.call(this);

    this.host = host;
    this.port = port;
    
    this.nick = nick;
    this.user = 'guest';
    this.real = 'Guest';
    this.pass = ''

    this.connected = false;
    this.tryReconnect = true; // when [true], the client will attempt a reconnect if disconnected for any reason


    this._encoding = 'utf8';
    this._connection = -1;
    this._receiveBuffer = ''; // this is used to store incoming information until it can be appropriatly handled
    this._waitingForJoinedEvent = []; // list of channels that are awaiting a 'joined' notification
    this._namesBuffer = {}; // keys found in this object represent channel names, and the values represent a list of names in the channel
};
sys.inherits(Client, events.EventEmitter);


// these command numerics are take from RFC 1459 (http://www.irchelp.org/irchelp/text/rfc1459.txt)
Client.prototype._commands = {
    '300':'RPL_NONE','302':'RPL_USERHOST','303':'RPL_ISON','301':'RPL_AWAY','305':'RPL_UNAWAY','306':'RPL_NOWAWAY','311':'RPL_WHOISUSER','312':'RPL_WHOISSERVER','313':'RPL_WHOISOPERATOR','317':'RPL_WHOISIDLE','318':'RPL_ENDOFWHOIS','319':'RPL_WHOISCHANNELS','314':'RPL_WHOWASUSER','369':'RPL_ENDOFWHOWAS','321':'RPL_LISTSTART','322':'RPL_LIST','323':'RPL_LISTEND','324':'RPL_CHANNELMODEIS','331':'RPL_NOTOPIC','332':'RPL_TOPIC','341':'RPL_INVITING','342':'RPL_SUMMONING','351':'RPL_VERSION','352':'RPL_WHOREPLY','315':'RPL_ENDOFWHO','353':'RPL_NAMREPLY','366':'RPL_ENDOFNAMES','364':'RPL_LINKS','365':'RPL_ENDOFLINKS','367':'RPL_BANLIST','368':'RPL_ENDOFBANLIST','371':'RPL_INFO','374':'RPL_ENDOFINFO','375':'RPL_MOTDSTART','372':'RPL_MOTD','376':'RPL_ENDOFMOTD','381':'RPL_YOUREOPER','382':'RPL_REHASHING','391':'RPL_TIME','392':'RPL_USERSSTART','393':'RPL_USERS','394':'RPL_ENDOFUSERS','395':'RPL_NOUSERS','200':'RPL_TRACELINK','201':'RPL_TRACECONNECTING','202':'RPL_TRACEHANDSHAKE','203':'TRACEUNKNOWN','204':'RPL_TRACEOPERATOR','205':'RPL_TRACEUSER','206':'RPL_TRACESERVER','208':'RPL_TRACENEWTYPE','261':'RPL_TRACELOG','211':'RPL_STATSLINKINFO','212':'RPL_STATSCOMMANDS','213':'RPL_STATSCLINE','214':'RPL_STATSNLINE','215':'RPL_STATSILINE','216':'RPL_STATSKLINE','218':'RPL_STATSYLINE','219':'RPL_ENDOFSTATS','241':'RPL_STATSLLINE','242':'RPL_STATSUPTIME','243':'RPL_STATSOLINE','244':'RPL_STATSHLINE','221':'RPL_UMODEIS','251':'RPL_LUSERCLIENT','252':'RPL_LUSEROP','253':'RPL_LUSERUNKNOWN','254':'RPL_LUSERCHANNELS','255':'RPL_LUSERME','256':'RPL_ADMINME','257':'RPL_ADMINLOC1','258':'RPL_ADMINLOC2','259':'RPL_ADMINEMAIL',
    
    '401':'ERR_NOSUCHNICK','402':'ERR_NOSUCHSERVER','403':'ERR_NOSUCHCHANNEL','404':'ERR_CANNOTSENDTOCHAN','405':'ERR_TOOMANYCHANNELS','406':'ERR_WASNOSUCHNICK','407':'ERR_TOOMANYTARGETS','409':'ERR_NOORIGIN','411':'ERR_NORECIPIENT','412':'ERR_NOTEXTTOSEND','413':'ERR_NOTOPLEVEL','414':'ERR_WILDTOPLEVEL','421':'ERR_UNKNOWNCOMMAND','422':'ERR_NOMOTD','423':'ERR_NOADMININFO','424':'ERR_FILEERROR','431':'ERR_NONICKNAMEGIVEN','432':'ERR_ERRONEUSNICKNAME','433':'ERR_NICKNAMEINUSE','436':'ERR_NICKCOLLISION','441':'ERR_USERNOTINCHANNEL','442':'ERR_NOTONCHANNEL','443':'ERR_USERONCHANNEL','444':'ERR_NOLOGIN','445':'ERR_SUMMONDISABLED','446':'ERR_USERDISABLED','451':'ERR_NOTREGISTERED','461':'ERR_NEEDMOREPARAMS','462':'ERR_ALREADYREGISTERED','463':'ERR_NOPERMFORHOST','464':'ERR_PASSWDMISMATCH','465':'ERR_YOUREBANNEDCREEP','467':'ERR_KEYSET','471':'ERR_CHANNELISFULL','472':'ERR_UNKNOWNMODE','473':'ERR_INVITEONLYCHAN','474':'ERR_BANNEDFROMCHAN','475':'ERR_BADCHANNELKEY','481':'ERR_NOPRIVILEGES','482':'ERR_CHANOPRIVSNEEDED','483':'ERR_CANTKILLSERVER','491':'ERR_NOOPERHOST','501':'ERR_UMODEUNKNOWNFLAG','502':'ERR_USERSDONTMATCH',
};

Client.prototype._parseReceiveBuffer = function() {
    if( !this._receiveBuffer ) { return; }

    var msgre = /^(:([^!@\s]+)(!([^!@\s]+))?(@([^!@\s]+))?\s+)?(\d{3}|\S+)\s*([^:\s]*)(.*)$/
        // 0: whole
        // 1: whole prefix
        // 2: server/nick
        // 3: whole user
        // 4: user 
        // 5: whole host
        // 6: host
        // 7: command
        // 8: target(s)
        // 9: params

    // if the buffer ends in '\r\n', then we can parse the whole buffer
    // otherwise, we can only parse up to the last '\r\n' found
    var rawlines;
    if( _(this._receiveBuffer).endsWith('\r\n') ) {
        rawlines = this._receiveBuffer.split('\r\n');
        this._receiveBuffer = '';
    }
    else {
        var lastindex = this._receiveBuffer.lastIndexOf('\r\n')+2;
        rawlines = this._receiveBuffer.substring(0, lastindex).split('\r\n');
        this._receiveBuffer = this._receiveBuffer.substr(lastindex);
    }
    var lines = [];
    var m, splittmp;
    var lineobj;
    for(var i = 0; i < rawlines.length; i++) {
        if( _(rawlines[i]).trim() == '' ) { continue; }

        m = rawlines[i].match(msgre);
        if( m == null ) {
            this.emit('unknownLine', rawlines[i]);
        }
        else {
            lineobj = {
                'raw': rawlines[i],
                'prefix': m[1],
                'server_or_nick': m[2],
                'user': m[4],
                'host': m[6],
                'command': m[7],
                'targets': m[8].split(','),
                'params': '',
                'message': '',
            };

            m[9] = _(m[9]).trim();

            // get the list of parameters, and then the trailing message
            if( _(m[9]).startsWith(':') ) {
                lineobj.message = m[9].substr(1);
            }
            else {
                splittmp = _(m[9]).words(' :');
                if( splittmp.length > 1 ) {
                    lineobj.message = splittmp[1]
                }
                lineobj.params = _(splittmp[0]).words();
            }
            
            // generic 'hey, guys i received a line from the server' command
            this.emit('lineReceived', lineobj);

            // emits an event for whatever the command was, regardless of whether it was a numieric
            //  value or a textual value
            this.emit(lineobj.command, lineobj);

            // if the command is a numeric (that is understood), then emit an event with a more
            //  human readable name
            if( lineobj.command in this._commands ) {
                this.emit(this._commands[lineobj.command], lineobj);
            }
        }
    }
};




Client.prototype.connect = function() {
    this._connection = net.createConnection(this.port, this.host);
    this._connection.setEncoding(this._encoding);
    this._connection.on('connect', bind(this.onConnect, this));
    this._connection.on('secure', bind(this.onSecure, this));
    this._connection.on('data', bind(this.onData, this));
    this._connection.on('end', bind(this.onEnd, this));
    this._connection.on('timeout', bind(this.onTimeout, this));
    this._connection.on('drain', bind(this.onDrain, this));
    this._connection.on('close', bind(this.onClose, this));
    this._connection.on('error', bind(this.onError, this));

    this.on('RPL_TOPIC', this.onRPL_TOPIC);
    this.on('RPL_NOTOPIC', this.onRPL_NOTOPIC);
    this.on('RPL_NAMREPLY', this.onRPL_NAMREPLY);
    this.on('RPL_ENDOFNAMES', this.onRPL_ENDOFNAMES);
    this.on('PING', this.onPING);
    this.on('ERR_NICKNAMEINUSE', this.onERR_NICKNAMEINUSE);
    this.on('PRIVMSG', this.onPRIVMSG);
    this.on('NOTICE', this.onNOTICE);
};

/*
    Accepts 2 arguments. 
    
    The first argument, if present, is the reason or type -- IE 'error', 'timeout', 'server closed connection'.
        -- if 'error' then the connection will be destroyed
    The second argument, if present, is the exception value for the 'error' reason.
*/
Client.prototype.disconnect = function() {
    if( this._connection.readyState !== 'open' ) {
        console.log('cannot disconnect: connection not in "open" state, instead it is in the "' + this._connection.readyState + '"');
        return;
    }

    if( arguments.length > 0 && arguments[0] == 'error' ) {
        this._connection.destroy();
        this.emit('disconnecting', arguments[0], arguments[1]);
    }
    else {
        this._connection.end();
        this.emit('disconnecting', arguments[0]);
    }
};

Client.prototype.send = function() {
    if( !this.connected ) {
        console.log('cannot send: not connected');
        return;
    }

    var msg = [];
    for( var i = 0; i < arguments.length; i++ ) {
        if( typeof arguments[i] != 'string' ) {
            console.log('cannot send: argument not a string');
        }
            
        msg.push(arguments[i]);
    }
    msg = msg.join(' ') + '\r\n';
    this._connection.write(msg, this._encoding, this.onWrite);
};


Client.prototype.join = function(channel) {
    if( !this.connected ) {
        console.log('cannot join: not connected');
        return;
    }

    this.send('JOIN', channel);
    this._waitingForJoinedEvent.push(channel);
};

Client.prototype.setNick = function(nick) {
    this.send('NICK', nick);
};

Client.prototype.quit = function(message) {
    this.send('QUIT', ':'+message);
};

/*
    channels parameter should be an array of strings indicating which channels
    to part from.
*/
Client.prototype.part = function(channels) {
    this.send('PART', channels.join(','));
    this.emit('leavingChannels', channels);
};

/*
    channel: the channel to send the topic request to
    topic: may be omitted or be an empty string. If omitted or an empty string,
        then the client is requesting that a TOPIC reply be sent, which is handled
        by the 'topic' event.
*/
Client.prototype.topic = function(channel, topic) {
    if( topic && topic !== '' ) {
        topic = ':' + topic;
    }
    else {
        topic = '';
    }
    this.send('TOPIC', channel, topic);
};

/*
    When a full list of names has been returned, the 'names' event will be emitted.

    channels: optional. list of channels that names are being requested for.
*/
Client.prototype.names = function(channels) {
    // specific channels to get names for
    if( !_.isUndefined(channels) && channels.length > 0 ) {
        // if there is a request for names out for a channel already then there's no reason to send another request
        channels = _.select(channels, bind(function(channel){return !(channel in this._namesBuffer); }, this));
        if( channels.length <= 0 ) { return; }

        this.send('NAMES', channels.join(','));
        return;
    }

    // all names from all visible channels
    this.send('NAMES');
};

/*
    to: list of channels and users to send the message to
    message: the message to send
*/
Client.prototype.privmsg = function(to, message) {
    this.send('PRIVMSG', to.join(','), ':' + message)
};

/*
    to: list of channels and users to send the message to
    message: the message to send
*/
Client.prototype.notice = function(to, message) {
    this.send('NOTICE', to.join(','), ':' + message)
};







Client.prototype.onConnect = function() {
    this.connected = true;
    if( this.pass != '' ) { this.send('PASS', this.pass); }
    this.send('NICK', this.nick);
    this.send('USER', this.user, '0', '*', ':'+this.real);
};

Client.prototype.onData = function( data ) {
    if(!this._receiveBuffer) { this._receiveBuffer = ''; }
    this._receiveBuffer += data['0'];
    this._parseReceiveBuffer();
};

Client.prototype.onClose = function(had_error) {
    this.connected = false;
    this.emit('disconnected');
    if( this.tryReconnect ) {
        this.emit('reconnecting');
        this.connect();
    }
};

Client.prototype.onError = function(exception) {
    this.disconnect('error', exception);
};

Client.prototype.onTimeout = function() {
    this.disconnect('timeout');
};

Client.prototype.onSecure = function() {};
Client.prototype.onDrain = function() {};
Client.prototype.onWrite = function() {};
Client.prototype.onEnd = function() {};


Client.prototype.onRPL_TOPIC = function(line) {
    // if the channel is waiting for a join event to be emitted, then
    //  emit the event and remove it from the waiting list
    var i;
    for(var p = 0; p < line.params.length; p++) {
        i = _.indexOf(this._waitingForJoinedEvent, line.params[p]);
        if( i >= 0 ) {
            this.emit('joined', line.params[p]);
            this._waitingForJoinedEvent = this._waitingForJoinedEvent.splice(i,-1);
        }
    }
    
    this.emit('topic', line.message);
};

Client.prototype.onRPL_NOTOPIC = function(line) {
    this.emit('topic', '');
};

Client.prototype.onRPL_NAMREPLY = function(line) {
    // if the channel is waiting for a join event to be emitted, then
    //  emit the event and remove it from the waiting list
    var i;
    for(var p = 0; p < line.params.length; p++) {
        i = _.indexOf(this._waitingForJoinedEvent, line.params[p]);
        if( i >= 0 ) {
            this.emit('joined', line.params[p]);
            this._waitingForJoinedEvent = this._waitingForJoinedEvent.splice(i,-1);
        }
    }

    // add the names to the appropriate portion of the names buffer
    if( !(line.params[1] in this._namesBuffer) ) {
        this._namesBuffer[line.params[1]] = [];
    }
    this._namesBuffer[line.params[1]].push.apply(this._namesBuffer[line.params[1]], line.message.split(' '));
};

Client.prototype.onRPL_ENDOFNAMES = function(line) {
    this.emit('names', this._namesBuffer[line.params[0]]);
    delete this._namesBuffer[line.params[0]];
};

Client.prototype.onPING = function(line) {
    this.send('PONG', ':' + line.message);
    this.emit('pinged');
};

Client.prototype.onERR_NICKNAMEINUSE = function(line) {
    this.emit('nicknameInUse');
};

Client.prototype.onPRIVMSG = function(line) {
    this.emit('msg', line.server_or_nick, line.targets[0], line.message);
};

Client.prototype.onNOTICE = function(line) {
    this.emit('not', line.server_or_nick, line.targets[0], line.message);
};



module.exports.Client = Client;
