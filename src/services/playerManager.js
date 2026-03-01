const WebSocket = require('ws');

class PlayerManager {
    constructor() {
        this.webClients = new Set();
        this.minecraftClients = new Map();
        this.players = new Map();
        this.chatLogs = new Map();
        this.playerIdToName = new Map();
        this.wsToPlayerId = new Map();
        this.nextPlayerId = 1;
        this.availableIds = [];
        this.MAX_LOGS = 25;
    }

    addWebClient(ws) {
        this.webClients.add(ws);
        console.log(`Web client connected. Total: ${this.webClients.size}`);
    }

    removeWebClient(ws) {
        this.webClients.delete(ws);
        console.log(`Web client disconnected. Total: ${this.webClients.size}`);
    }

    generatePlayerId() {
        if (this.availableIds.length > 0) {
            return this.availableIds.shift();
        }
        return this.nextPlayerId++;
    }

    registerPlayer(name, ws, data) {
        let playerId = this.wsToPlayerId.get(ws);
        
        if (!playerId) {
            playerId = this.generatePlayerId();
            this.wsToPlayerId.set(ws, playerId);
        }

        this.minecraftClients.set(playerId, ws);
        this.players.set(playerId, {
            name: name,
            connected: true,
            timestamp: Date.now(),
            serverIp: data.serverIp || '',
            online: data.online === true
        });
        this.playerIdToName.set(playerId, name);
        console.log(`Player registered: ${name} (ID: ${playerId}, online: ${data.online}, server: ${data.serverIp})`);
        this.broadcastPlayerList();
    }

    removePlayer(ws) {
        const playerId = this.wsToPlayerId.get(ws);
        if (!playerId) return;

        const playerData = this.players.get(playerId);
        const name = playerData ? playerData.name : playerId;
        
        this.minecraftClients.delete(playerId);
        this.players.delete(playerId);
        this.chatLogs.delete(playerId);
        this.playerIdToName.delete(playerId);
        this.wsToPlayerId.delete(ws);
        
        this.availableIds.push(playerId);
        this.availableIds.sort((a, b) => a - b);
        
        console.log(`Player removed: ${name} (ID: ${playerId})`);
        this.broadcastPlayerList();
    }

    addChatLog(ws, message) {
        const playerId = this.wsToPlayerId.get(ws);
        if (!playerId) return;

        if (!this.chatLogs.has(playerId)) {
            this.chatLogs.set(playerId, []);
        }

        const logs = this.chatLogs.get(playerId);
        logs.push({
            message: message,
            timestamp: Date.now()
        });

        if (logs.length > this.MAX_LOGS) {
            logs.shift();
        }

        const name = this.playerIdToName.get(playerId) || playerId;
        console.log(`Chat log added for ${name} (ID: ${playerId}): ${message} (total: ${logs.length})`);
    }

    getChatLogs(playerId) {
        return this.chatLogs.get(playerId) || [];
    }

    sendChatLogsToWeb(playerId) {
        const logs = this.getChatLogs(playerId);
        const playerData = this.players.get(playerId);
        const message = JSON.stringify({
            type: 'chatLogs',
            playerId: playerId,
            player: playerData ? playerData.name : playerId,
            logs: logs
        });

        let sent = 0;
        this.webClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
                sent++;
            }
        });

        if (sent > 0) {
            const name = playerData ? playerData.name : playerId;
            console.log(`Sent ${logs.length} chat logs for ${name} (ID: ${playerId}) to ${sent} web clients`);
        }
    }

    broadcastToWeb(data) {
        const message = JSON.stringify(data);
        let sent = 0;
        this.webClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
                sent++;
            }
        });
        if (sent > 0) {
            console.log(`Broadcast to ${sent} web clients`);
        }
    }

    sendPlayerList(ws) {
        const playerList = Array.from(this.players.entries()).map(([id, data]) => ({
            id: id,
            name: data.name,
            serverIp: data.serverIp || '',
            online: data.online === true
        }));

        ws.send(JSON.stringify({
            type: 'players',
            players: playerList
        }));
        console.log(`Sent player list: ${playerList.length} players`);
    }

    broadcastPlayerList() {
        const playerList = Array.from(this.players.entries()).map(([id, data]) => ({
            id: id,
            name: data.name,
            serverIp: data.serverIp || '',
            online: data.online === true
        }));

        const message = JSON.stringify({
            type: 'players',
            players: playerList
        });

        let sent = 0;
        this.webClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
                sent++;
            }
        });
        console.log(`Broadcast player list to ${sent} web clients: ${playerList.length} players`);
    }

    sendToMinecraft(playerId, action, data) {
        const ws = this.minecraftClients.get(playerId);
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            const name = this.playerIdToName.get(playerId) || playerId;
            console.log(`Cannot send to ${name} (ID: ${playerId}): not connected`);
            return { success: false, message: 'Player not connected' };
        }
        try {
            const message = { type: action };
            if (action === 'chat') {
                message.message = data.content;
            } else if (action === 'execute') {
                message.command = data.content;
            } else if (action === 'setSlot') {
                message.slot = data.value;
            } else if (action === 'guiClick') {
                message.slot = data.slot;
                message.button = data.button;
                message.shift = data.shift;
            } else if (action === 'moveStart' || action === 'moveStop') {
                message.direction = data.direction;
            } else if (action === 'dropItem') {
                message.stack = data.stack;
            } else if (action === 'joinServer') {
                message.ip = data.ip;
                message.port = data.port;
                message.resourcePacks = data.resourcePacks;
            } else if (action === 'moveCrosshair') {
                message.direction = data.direction;
            } else if (action === 'enableChatLogs') {
                message.enabled = data.enabled;
            }
            
            ws.send(JSON.stringify(message));
            const name = this.playerIdToName.get(playerId) || playerId;
            console.log(`Sent action to ${name} (ID: ${playerId}): ${action}`, message);
            return { success: true };
        } catch (e) {
            const name = this.playerIdToName.get(playerId) || playerId;
            console.error(`Error sending to ${name} (ID: ${playerId}):`, e);
            return { success: false, message: e.message };
        }
    }

    getPlayers() {
        return Array.from(this.players.keys());
    }

    getPlayerCount() {
        return this.players.size;
    }

    getStats() {
        return {
            totalPlayers: this.players.size,
            onlinePlayers: Array.from(this.players.values()).filter(p => p.online).length,
            webClients: this.webClients.size,
            minecraftClients: this.minecraftClients.size
        };
    }

    getWebClients() {
        return this.webClients;
    }
}

module.exports = PlayerManager;
