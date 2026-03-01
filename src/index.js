const http = require('http');
const WebSocketServer = require('./server/websocket');
const { handleRequest } = require('./server/router');
const { VERSION, APP_NAME, AUTHOR } = require('./config/version');

const PORT = process.env.PORT || 8080;

const server = http.createServer(handleRequest);
const wsServer = new WebSocketServer();

wsServer.initialize(server);

server.listen(PORT, () => {
    console.log(`${APP_NAME} v${VERSION} by ${AUTHOR}`);
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket: wss://webutil.zawrot.pl`);
});
