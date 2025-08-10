import { Player, RoleCount, Role } from "../types/game";

export function assignRoles(players: Player[], roles: RoleCount): Map<string, Role> {
  // Create array of all roles based on counts
  const roleArray: Role[] = [];
  
  // Add each role the specified number of times (excluding WAITING)
  Object.entries(roles).forEach(([role, count]) => {
    if (role !== Role.WAITING && count > 0) {
      for (let i = 0; i < count; i++) {
        roleArray.push(role as Role);
      }
    }
  });

  // If there are too many roles, remove excess roles
  if (roleArray.length > players.length) {
    roleArray.splice(players.length);
  }

  // Validate that we have enough roles for all players
  if (roleArray.length < players.length) {
    const diff = players.length - roleArray.length;
    // If there are not enough roles, fill the remaining players with VILLAGER
    for (let i = 0; i < diff; i++) {
      roleArray.push(Role.VILLAGER);
    }
  }

  // Shuffle the roles array using Fisher-Yates algorithm
  for (let i = roleArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roleArray[i], roleArray[j]] = [roleArray[j], roleArray[i]];
  }

  // Create Map of playerID -> Role
  const assignments = new Map<string, Role>();
  
  players.forEach((player, index) => {
    assignments.set(player.id, roleArray[index]);
  });

  return assignments;
}