import { Socket, Server } from 'socket.io';
import { GameRoom, Player, PlayerAction, GameState, GamePhase, Role, GameSettings } from '../types/game';

import { assignRoles } from '../utils/assignRoles';
import { generateRoomCode } from '../utils/roomCode';
import { processNightActions } from '../utils/processNightActions';
import { processDayActions } from '../utils/processDayActions';
import { checkGameOver } from '../utils/checkGameOver';

export class GameManager {
  private rooms: Map<string, GameRoom> = new Map(); // roomCode -> roomObject
  private playerToRoom: Map<string, string> = new Map(); // userName -> roomCode
  private socketToPlayer: Map<string, string> = new Map(); // socketId -> userName
  private io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  handleConnection(socket: Socket) {
    // Register socket event handlers
    socket.on('reconnect-to-room', (data) => this.handleReconnection(socket, data));
    
    socket.on('create-room', (data) => this.createRoom(socket, data));
    socket.on('join-room', (data) => this.joinRoom(socket, data));
    
    socket.on('get-room-info', (data) => this.getRoomInfo(socket, data));
    
    socket.on('start-game', (data) => this.startGame(socket, data));

    socket.on('submit-vote', (data) => this.submitVote(socket, data));
  }

  handleDisconnection(socket: Socket) {
    const userName = this.socketToPlayer.get(socket.id);
    if (userName) {
      const roomCode = this.playerToRoom.get(userName)
      if (roomCode) {
        const room = this.rooms.get(roomCode);
        if (room) {
            const player = room.players.get(userName)
            if (player) {
                player.connected = false;
                socket.leave(roomCode);
                
                // Handle host transfer if disconnected player was host
                if (room.hostId === userName) {
                  const connectedPlayers = Array.from(room.players.values()).filter(p => p.connected && p.id !== userName);
                  if (connectedPlayers.length > 0) {
                    room.hostId = connectedPlayers[0].id;
                  }
                }
                
                // Check if any players are still connected
                const connectedPlayersCount = Array.from(room.players.values()).filter(p => p.connected).length;
                
                if (connectedPlayersCount === 0) {
                  // No players left, delete the room entirely
                  this.stopGameTimer(room); // Clean up timer before deleting room
                  this.rooms.delete(roomCode);
                  console.log(`Room ${roomCode} deleted - no players remaining`);
                } else {
                  // Notify other players about disconnection and send updated room state
                  socket.to(roomCode).emit('room-updated', {
                    players: Array.from(room.players.values()).map(p => ({
                      id: p.id,
                      name: p.name,
                      connected: p.connected,
                      isAlive: p.isAlive,
                      isHost: p.isHost
                    })),
                    hostId: room.hostId,
                    gameState: room.gameState,
                    currentPhase: room.currentPhase
                  });
                }
                
                console.log(`${player.name} disconnected from room ${roomCode}`);
            }
        }
      }
      // Always clean up mappings, even if room doesn't exist
      this.playerToRoom.delete(userName);
    }

    // Always clean up socket mapping
    this.socketToPlayer.delete(socket.id);
  }

  private handleReconnection(socket: Socket, data: { userName: string; roomCode: string }) {
    const room = this.rooms.get(data.roomCode);
    
    if (!room || room.gameState === GameState.FINISHED) {
      socket.emit('reconnection-failed', { message: 'Room no longer exists' });
      return;
    }

    // Find player by ID using direct lookup
    const existingPlayer = room.players.get(data.userName);

    if (existingPlayer) {
      existingPlayer.connected = true;
      socket.join(data.roomCode);
      
      // Update socket mappings
      this.socketToPlayer.set(socket.id, data.userName);
      this.playerToRoom.set(data.userName, data.roomCode);

      // Send reconnection success with full game state
      socket.emit('reconnection-success', {
        roomCode: data.roomCode,
        player: existingPlayer,
        gameState: room.gameState,
        currentPhase: room.currentPhase,
        dayCount: room.dayCount,
        players: Array.from(room.players.values()).map(p => ({
          id: p.id,
          name: p.name,
          connected: p.connected,
          isAlive: p.isAlive,
          role: p.role // Only send to reconnecting player
        })),
        isHost: room.hostId === data.userName,
        hostId: room.hostId,
        settings: room.settings
      });
      
      // Notify other players about reconnection with updated room state
      socket.to(data.roomCode).emit('room-updated', {
        players: Array.from(room.players.values()).map(p => ({
          id: p.id,
          name: p.name,
          connected: p.connected,
          isAlive: p.isAlive
        })),
        hostId: room.hostId,
        gameState: room.gameState,
        currentPhase: room.currentPhase
      });
      
      console.log(`${data.userName} reconnected to room ${data.roomCode}`);
    
    } else {
      socket.emit('reconnection-failed', { message: 'Player not found in room' });
    }
  }  

  private createRoom(socket: Socket, data: { userName: string, gameSettings: GameSettings }) {

    const roomCode = generateRoomCode();
    const userName = data.userName.trim();
    
    // Create the player
    const player: Player = {
      id: userName, 
      name: userName,
      role: Role.WAITING, // Initially waiting for role assignment
      isAlive: true,
      connected: true,
      isHost: true
    };

    // Create the room
    const room: GameRoom = {
      roomCode,
      players: new Map([[userName, player]]),
      gameState: GameState.WAITING,
      currentPhase: GamePhase.LOBBY,
      hostId: userName,
      settings: data.gameSettings,
      dayCount: 0,
      votes: new Map()
    };

    // Store room and update tracking maps
    this.rooms.set(roomCode, room);
    this.playerToRoom.set(userName, roomCode);
    this.socketToPlayer.set(socket.id, userName);
    
    // Join the socket room
    socket.join(roomCode);
    
    // Send success response with room details
    socket.emit('room-created', { 
      roomCode,
    });
    
    console.log(`Room ${roomCode} created by ${userName}`);
  }

  private joinRoom(socket: Socket, data: { userName: string, roomCode: string }) {
    const player: Player = {
        id: data.userName,
        name: data.userName,
        role: Role.WAITING,
        isAlive: true,
        connected: true,
        isHost: false
    }

    const room = this.rooms.get(data.roomCode);

    if (!room) {
      socket.emit('join-room-failed', { message: 'Room not found' });
      return;
    }

    // Add player to room
    room.players.set(data.userName, player);
    this.playerToRoom.set(data.userName, data.roomCode);
    this.socketToPlayer.set(socket.id, data.userName);

    // Join the socket room
    socket.join(data.roomCode);

    // Send success response with room details
    socket.emit('room-joined', {
      roomCode: data.roomCode,
    });

    // Notify other players about the new player joining
    socket.to(data.roomCode).emit('room-updated', {
      
      // Transform Player Object into only necessary info to update frontend

      players: Array.from(room.players.values()).map(p => ({ 
        id: p.id,
        name: p.name,
        connected: p.connected,
        isAlive: p.isAlive,
        isHost: p.isHost
      })), 
      hostId: room.hostId,
      gameState: room.gameState,
      currentPhase: room.currentPhase
    });

    console.log(`${data.userName} joined room ${data.roomCode}`);
  }

  private getRoomInfo(socket: Socket, data: { roomCode: string }) {
    const room = this.rooms.get(data.roomCode);
    

    if (!room) {
      socket.emit('get-room-info-failed', { message: 'Room not found' });
      return;
    }

    const currentUsername = this.socketToPlayer.get(socket.id);
    if (!currentUsername) {
      socket.emit('get-room-info-failed', { message: 'Player not found' });
      return;
    }

    const currentPlayer = room.players.get(currentUsername);

    // Send room info to the requesting player
    socket.emit('get-room-info-success', {
      currentPlayer: currentPlayer, 
      players: Array.from(room.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        connected: p.connected,
        isAlive: p.isAlive
      })),
      settings: room.settings,
      hostId: room.hostId,
      gameState: room.gameState,
      currentPhase: room.currentPhase,
    });
  }

  private startGame(socket: Socket, data: { roomCode: string }) {
    const room = this.rooms.get(data.roomCode);

    if (!room) {
      socket.emit('start-game-failed', { message: 'Room not found' });
      return;
    }

    if (room.gameState !== GameState.WAITING) {
      socket.emit('start-game-failed', { message: 'Game is already in progress' });
      return;
    }

    // Check if the current player is the host
    const currentUsername = this.socketToPlayer.get(socket.id);
    if (!currentUsername || currentUsername !== room.hostId) {
      socket.emit('start-game-failed', { message: 'Only the host can start the game' });
      return;
    }

    const roleAssignments = assignRoles(Array.from(room.players.values()), room.settings.roles);
    room.players.forEach((player) => {
      player.role = roleAssignments.get(player.id) || Role.VILLAGER;
    });

    // Start the game
    room.gameState = GameState.IN_PROGRESS;
    room.currentPhase = GamePhase.NIGHT;
    room.dayCount = 1;

    // Start the game timer
    this.startGameTimer(room);

    console.log(room)

    this.io.to(data.roomCode).emit('start-game-success', {
        message: 'Game started successfully',
        roomCode: data.roomCode
    });

    console.log(`Game started in room ${data.roomCode}`);
  }

  private startGameTimer(room: GameRoom) {
    // Set initial timer based on starting phase (NIGHT)
    let timeLeft = room.currentPhase === GamePhase.DAY ? room.settings.dayTime : room.settings.nightTime;

    // Emit initial game state to all players
    this.io.to(room.roomCode).emit('game-timer-started', {
      currentPhase: room.currentPhase,
      timeLeft: timeLeft,
      dayCount: room.dayCount
    });

    // Start the timer
    room.timer = setInterval(() => {
      timeLeft--;

      // Emit timer update every 10 seconds (or when time is running low)
      if (timeLeft % 10 === 0 || timeLeft <= 10) {
        this.io.to(room.roomCode).emit('timer-update', {
          timeLeft: timeLeft,
          currentPhase: room.currentPhase
        });
      }

      // Phase transition when timer reaches 0
      if (timeLeft <= 0) {
        this.transitionPhase(room);
        // Reset timer for new phase
        timeLeft = room.currentPhase === GamePhase.DAY ? room.settings.dayTime : room.settings.nightTime;
      }
    }, 1000); // Run every second
  }

  private transitionPhase(room: GameRoom) {
    
    //Process Voting
    if (room.currentPhase === GamePhase.DAY) {
      processDayActions(room);
    
    } else if (room.currentPhase === GamePhase.NIGHT) {
      processNightActions(room);
    }

    // Check if game is over
    const { winner, dayCount } = checkGameOver(room);
    if (winner) {
        room.gameState = GameState.FINISHED;
        room.currentPhase = GamePhase.GAME_OVER;

        this.stopGameTimer(room);
        this.io.to(room.roomCode).emit('game-over', { 
            winner, 
            dayCount, 
            players: Array.from(room.players.values()).map(p => ({
                id: p.id,
                name: p.name,
                role: p.role,
                isAlive: p.isAlive
            }))
        });

        return;
    }

    // Switch phase
    if (room.currentPhase === GamePhase.NIGHT) {
      room.currentPhase = GamePhase.DAY;
      room.dayCount++;
    } else {
      room.currentPhase = GamePhase.NIGHT;
    }

    // Emit phase change event to all players
    this.io.to(room.roomCode).emit('phase-changed', {
      newPhase: room.currentPhase,
      timeLeft: room.currentPhase === GamePhase.DAY ? room.settings.dayTime : room.settings.nightTime,
      dayCount: room.dayCount,
      players: Array.from(room.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        connected: p.connected,
        isAlive: p.isAlive
      })),
    });

    console.log(`Phase changed to ${room.currentPhase} in room ${room.roomCode}, Day ${room.dayCount}`);
  }

  private stopGameTimer(room: GameRoom) {
    if (room.timer) {
      clearInterval(room.timer);
      room.timer = undefined;
    }
  }

  private submitVote(socket: Socket, data: { 
    roomCode: string, 
    targetPlayerId: string, 
    currentPlayerId: string, 
    currentPlayerRole: Role  
  }) {
    const room = this.rooms.get(data.roomCode);
    if (!room) {
      socket.emit('vote-failed', { message: 'Voting is not allowed at this time' });
      return;
    }

    // Store the vote
    const action: PlayerAction = { playerId: data.currentPlayerId, role: data.currentPlayerRole };
    room.votes.set(action, data.targetPlayerId);

    console.log(`${data.currentPlayerId} voted for ${data.targetPlayerId} in room ${data.roomCode}`);
  }

}