import { describe, it, expect } from 'vitest';
import { maneuverGroup, type ManeuverGroup } from '@/lib/navigate/maneuver';

describe('maneuverGroup', () => {
  it('maps turn-left to left', () => {
    expect(maneuverGroup('turn-left')).toBe<ManeuverGroup>('left');
  });

  it('maps fork-left to left', () => {
    expect(maneuverGroup('fork-left')).toBe<ManeuverGroup>('left');
  });

  it('maps keep-left to left', () => {
    expect(maneuverGroup('keep-left')).toBe<ManeuverGroup>('left');
  });

  it('maps ramp-left to left', () => {
    expect(maneuverGroup('ramp-left')).toBe<ManeuverGroup>('left');
  });

  it('maps turn-right to right', () => {
    expect(maneuverGroup('turn-right')).toBe<ManeuverGroup>('right');
  });

  it('maps roundabout-left to roundabout', () => {
    expect(maneuverGroup('roundabout-left')).toBe<ManeuverGroup>('roundabout');
  });

  it('maps roundabout-right to roundabout', () => {
    expect(maneuverGroup('roundabout-right')).toBe<ManeuverGroup>('roundabout');
  });

  it('maps merge to merge', () => {
    expect(maneuverGroup('merge')).toBe<ManeuverGroup>('merge');
  });

  it('maps u-turn-left to uturn', () => {
    expect(maneuverGroup('u-turn-left')).toBe<ManeuverGroup>('uturn');
  });

  it('maps straight to straight', () => {
    expect(maneuverGroup('straight')).toBe<ManeuverGroup>('straight');
  });

  it('defaults unknown strings to straight', () => {
    expect(maneuverGroup('')).toBe<ManeuverGroup>('straight');
    expect(maneuverGroup('head-north')).toBe<ManeuverGroup>('straight');
  });
});
