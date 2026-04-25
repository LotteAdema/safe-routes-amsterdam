export type ManeuverGroup = 'straight' | 'left' | 'right' | 'uturn' | 'roundabout' | 'merge';

export function maneuverGroup(maneuver: string): ManeuverGroup {
  if (maneuver.includes('u-turn')) return 'uturn';
  if (maneuver.includes('roundabout')) return 'roundabout';
  if (maneuver === 'merge') return 'merge';
  if (maneuver.includes('left')) return 'left';
  if (maneuver.includes('right')) return 'right';
  return 'straight';
}
