import { GameRoom, Role } from "../types/game";

export function processNightActions(room: GameRoom) {
  const actionEntries = Array.from(room.votes.entries());
  
  // Step 1: Process all werewolf kills
  for (const [action, targetId] of actionEntries) {
    if (action.role === Role.WEREWOLF) {
      const targetPlayer = room.players.get(targetId);
      if (targetPlayer && targetPlayer.isAlive) {
        targetPlayer.isAlive = false;
        console.log(`Werewolf ${action.playerId} kills ${targetId}`);
      }
    }
  }
  
  // Step 2: Process all doctor saves
  for (const [action, targetId] of actionEntries) {
    if (action.role === Role.DOCTOR) {
      const targetPlayer = room.players.get(targetId);
      if (targetPlayer) {
        targetPlayer.isAlive = true;
        console.log(`Doctor ${action.playerId} saves ${targetId}`);
      }
    }
  }

  // Clear votes for the next phase
  room.votes.clear();
}