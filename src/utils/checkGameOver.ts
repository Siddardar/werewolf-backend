import { GameRoom } from "../types/game";

export function checkGameOver(room: GameRoom) {
    let aliveWerewolves = 0;
    let aliveNonWerewolves = 0;

    for (const player of room.players.values()) {
        if (player.isAlive) {
            if (player.role === 'werewolf') {
                aliveWerewolves++;
            } else {
                aliveNonWerewolves++;
            }
        }
    }

    // Villagers win: All werewolves are eliminated
    if (aliveWerewolves === 0) {
        return { winner: 'villagers', dayCount: room.dayCount };
    }

    // Werewolves win: Number of werewolves >= number of non-werewolves
    if (aliveWerewolves >= aliveNonWerewolves) {
        return { winner: 'werewolves', dayCount: room.dayCount };
    }

    return { winner: null, dayCount: room.dayCount };
}