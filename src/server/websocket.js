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
        let playerName = null;

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                this.handleMessage(ws, data, clientType, playerName, (type, name) => {
                    clientType = type;
                    playerName = name;
                });
            } catch (e) {
                console.error('Error parsing message:', e);
            }
        });

        ws.on('close', () => {
            if (clientType === 'web') {
                this.playerManager.removeWebClient(ws);
            } else if (clientType === 'minecraft' && playerName) {
                this.playerManager.removePlayer(playerName);
            }
        });

        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });
    }

    handleMessage(ws, data, clientType, playerName, setClientInfo) {
        if (data.type === 'auth') {
            setClientInfo('web', null);
            this.playerManager.addWebClient(ws);
            this.playerManager.sendPlayerList(ws);
        }

        if (data.type === 'register') {
            setClientInfo('minecraft', data.player);
            this.playerManager.registerPlayer(data.player, ws, {
                online: data.online === true,
                serverIp: data.serverIp || ''
            });
        }

        if (data.type === 'playerInfo') {
            this.playerManager.broadcastToWeb(data);
        }

        if (data.type === 'chatLog') {
            this.playerManager.addChatLog(data.player, data.message);
            // Broadcastuj tylko do web clientów (nie z powrotem do moda)
            const message = JSON.stringify(data);
            let sent = 0;
            this.playerManager.getWebClients().forEach(client => {
                if (client.readyState === 1) { // WebSocket.OPEN
                    client.send(message);
                    sent++;
                }
            });
            if (sent > 0) {
                console.log(`Broadcast chatLog to ${sent} web clients`);
            }
        }

        if (data.type === 'getChatLogs') {
            this.playerManager.sendChatLogsToWeb(data.player);
        }

        if (data.type === 'action') {
            const result = this.playerManager.sendToMinecraft(data.player, data.action, data.data || {});
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
