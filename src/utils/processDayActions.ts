import { GameRoom } from "../types/game";

export function processDayActions(room: GameRoom) {
  const actionEntries = Array.from(room.votes.entries());
  
  // Count alive players to determine majority threshold
  const alivePlayers = Array.from(room.players.values()).filter(p => p.isAlive);
  const alivePlayerCount = alivePlayers.length;
  const majorityThreshold = Math.ceil(alivePlayerCount / 2); // More than half

  // Count votes for each player
  const voteCounts: Map<string, number> = new Map();
  
  actionEntries.forEach(([action, targetId]) => {
    // Only count votes from alive players during day phase
    const voter = room.players.get(action.playerId);
    if (voter && voter.isAlive) {
      const currentCount = voteCounts.get(targetId) || 0;
      voteCounts.set(targetId, currentCount + 1);
    }
  });
  
  // Find player(s) who have enough votes for elimination (majority)
  let eliminatedPlayer: string | null = null;
  
  voteCounts.forEach((votes, playerId) => {
    if (votes >= majorityThreshold) {
      eliminatedPlayer = playerId;
    }
  });
  
  // Eliminate the player if they have majority votes
  if (eliminatedPlayer) {
    const player = room.players.get(eliminatedPlayer);
    
    if (player) {
      player.isAlive = false;
      const votes = voteCounts.get(eliminatedPlayer) || 0;
      console.log(`Day ${room.dayCount}: ${player.name} was eliminated by majority vote (${votes}/${alivePlayerCount} votes, needed ${majorityThreshold})`);
    }
  } else {
    // Check if anyone got votes for logging
    const maxVotes = Math.max(...Array.from(voteCounts.values()), 0);
    if (maxVotes > 0) {
      console.log(`Day ${room.dayCount}: No player eliminated - highest vote count was ${maxVotes}, needed ${majorityThreshold} (${alivePlayerCount} players alive)`);
    } else {
      console.log(`Day ${room.dayCount}: No player eliminated - no votes cast`);
    }
  }

  // Clear votes for the next phase
  room.votes.clear();
}