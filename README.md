# About
IRCC is a Node.js IRC Client implementation still in development (especially the documentation)

# Dependencies/Requirements
1. Node.js v0.5.0-pre
1. [underscore.js](http://documentcloud.github.com/underscore/)
1. [underscore.string](https://github.com/edtsech/underscore.string)

# Events
All IRC commands found in [RFC 1459](http://www.irchelp.org/irchelp/text/rfc1459.txt) should be emitted by the IRCC. The human readable versions of numeric commands are also emitted. If the IRCC is unable to parse a command from a line received from the server, an 'unknownLine' event is emitted.

Below is a list of all the events that get emitted, excluding the numeric/human readable commands found in the RFC. First, however, a definition of the 'line object':

## Line Object Properties
* **raw** the raw line received from the server
* **prefix** the line prefix as defined in the RFC
* **server_or_nick** the servername or nickname the message came from
* **user** the user name the message came from, note: if **server_or_nick** is a servername, then this value will be undefined
* **host** the host name the message came from, note: if **server_or_nick** is a servername, then this vlaue will be undefined
* **command** the numeric or human readable command identified by the received line
* **targets** an array of nicks or channel names that the received command targets, may be undefined or empty
* **params** an array of parameters that the received command has, may be undefined or empty
* **message** the trailing message found in the received line

## Events
### Notable RFC defined events
*   **001**

    Emitted after a successful connection.

### Non-RFC defined events
*   **unknownLine**, params: raw line received from  server
  
    Emitted when the IRCC isn't able to understand a line received from the server. The resulting event handling function is passed the raw line received from the server.

*   **lineReceived**, params: line object
  
    Emitted when the IRCC server receives a line, and is able to parse the line into a line object.

*   **joined**, params: none

    Emitted after the client has connected to the server, sent a JOIN command to the server,  and when the client subsequently receives a RPL_NAMREPLY or RPL_TOPIC comment.

*   **disconnecting**, params: reason, exception

    The arguments are optional. If 'reason' is 'error' then 'exception' contains the exception thrown to cause the disconnection.

    Emitted when a Timeout or Error occurs within the client, or when a user manually calls the disconnect() method.

*   **disconnected**, params: none

    Emitted when the client has completely disconnected from the server.

*   **pinged**, params: none

    Emitted after the client has been pinged, and the client has responded with an appropriate pong message.

*   **reconnecting**, params: none

    Emitted after the client disconnects, for any reason, and the 'tryReconnect' is set to [true].

*   **nicknameInUse**, params: none

    Emitted when the server says the nickname that a user is trying to set is already in use. It is the users responsibility to call the 'setNick()' method when this event happens.

*   **leavingChannels**, params: channels
    
    List of channels that the client is parting from.

*   **topic**, params: topic

    Emitted when the client receives info about the topic -- the topic parameter will be an empty string if no topic is set, otherwise it will be the value the server reports is the topic.

*   **names**, params: names

    names is a list of strings. May be empty or undefined.

    Emitted when the client receives a list of names from the server.

*   **msg**, params: from, to, message

    from: nick or channel message is from,  
    to: the bots nick or the channel the message was sent to
    message: the message that was sent

    Emitted when the client receives a 'PRIVMSG' line

*   **not**, params: from, to, message

    from: nick or channel message is from,  
    to: the bots nick or the channel the message was sent to
    message: the message that was sent

    Emitted when the client receives a 'NOTICE' line




