const WebSocket = require('ws');
const PlayerManager = require('../services/playerManager');

class WebSocketServer {
    constructor() {
        this.wss = null;
        this.playerManager = new PlayerManager();
    }

    initialize(server) {
        this.wss = new WebSocket.Server({ server });

        this.wss.on('connection', (ws) => {
            this.handleConnection(ws);
        });

        console.log('WebSocket server initialized');
    }

    handleConnection(ws) {
        let clientType = null;

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                this.handleMessage(ws, data, clientType, (type) => {
                    clientType = type;
                });
            } catch (e) {
                console.error('Error parsing message:', e);
            }
        });

        ws.on('close', () => {
            if (clientType === 'web') {
                this.playerManager.removeWebClient(ws);
            } else if (clientType === 'minecraft') {
                this.playerManager.removePlayer(ws);
            }
        });

        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });
    }

    handleMessage(ws, data, clientType, setClientInfo) {
        if (data.type === 'auth') {
            setClientInfo('web');
            this.playerManager.addWebClient(ws);
            this.playerManager.sendPlayerList(ws);
        }

        if (data.type === 'register') {
            setClientInfo('minecraft');
            this.playerManager.registerPlayer(data.player, ws, {
                online: data.online === true,
                serverIp: data.serverIp || ''
            });
        }

        if (data.type === 'playerInfo') {
            const playerId = this.playerManager.getPlayerIdByWs(ws);
            if (playerId) {
                data.playerId = playerId;
            }
            this.playerManager.broadcastToWeb(data);
        }

        if (data.type === 'chatLog') {
            const playerId = this.playerManager.getPlayerIdByWs(ws);
            if (playerId) {
                data.playerId = playerId;
            }
            this.playerManager.addChatLog(ws, data.message);
            const message = JSON.stringify(data);
            let sent = 0;
            this.playerManager.getWebClients().forEach(client => {
                if (client.readyState === 1) {
                    client.send(message);
                    sent++;
                }
            });
            if (sent > 0) {
                console.log(`Broadcast chatLog to ${sent} web clients`);
            }
        }

        if (data.type === 'getChatLogs') {
            this.playerManager.sendChatLogsToWeb(data.playerId);
        }

        if (data.type === 'action') {
            const result = this.playerManager.sendToMinecraft(data.playerId, data.action, data.data || {});
            ws.send(JSON.stringify({ 
                type: 'actionResult', 
                success: result.success,
                message: result.message 
            }));
        }
    }

    getPlayerManager() {
        return this.playerManager;
    }
}

module.exports = WebSocketServer;
