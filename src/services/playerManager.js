const WebSocket = require('ws');

class PlayerManager {
    constructor() {
        this.webClients = new Set();
        this.minecraftClients = new Map();
        this.players = new Map();
        this.chatLogs = new Map();
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

    registerPlayer(name, ws, data) {
        this.minecraftClients.set(name, ws);
        this.players.set(name, {
            connected: true,
            timestamp: Date.now(),
            serverIp: data.serverIp || '',
            online: data.online === true
        });
        console.log(`Player registered: ${name} (online: ${data.online}, server: ${data.serverIp})`);
        this.broadcastPlayerList();
    }

    removePlayer(name) {
        this.minecraftClients.delete(name);
        this.players.delete(name);
        this.chatLogs.delete(name);
        console.log(`Player removed: ${name}`);
        this.broadcastPlayerList();
    }

    addChatLog(playerName, message) {
        if (!this.chatLogs.has(playerName)) {
            this.chatLogs.set(playerName, []);
        }

        const logs = this.chatLogs.get(playerName);
        logs.push({
            message: message,
            timestamp: Date.now()
        });

        if (logs.length > this.MAX_LOGS) {
            logs.shift();
        }

        console.log(`Chat log added for ${playerName}: ${message} (total: ${logs.length})`);
    }

    getChatLogs(playerName) {
        return this.chatLogs.get(playerName) || [];
    }

    sendChatLogsToWeb(playerName) {
        const logs = this.getChatLogs(playerName);
        const message = JSON.stringify({
            type: 'chatLogs',
            player: playerName,
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
            console.log(`Sent ${logs.length} chat logs for ${playerName} to ${sent} web clients`);
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
        const playerList = Array.from(this.players.entries()).map(([name, data]) => ({
            name: name,
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
        const playerList = Array.from(this.players.entries()).map(([name, data]) => ({
            name: name,
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

    sendToMinecraft(playerName, action, data) {
        const ws = this.minecraftClients.get(playerName);
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.log(`Cannot send to ${playerName}: not connected`);
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
            console.log(`Sent action to ${playerName}: ${action}`, message);
            return { success: true };
        } catch (e) {
            console.error(`Error sending to ${playerName}:`, e);
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
