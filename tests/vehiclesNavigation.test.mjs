import assert from 'node:assert/strict';
import test from 'node:test';
import { permittedNavigationGroups } from '../src/modules/registry.js';
import {
  VEHICLE_WORKSPACE_SECTIONS,
  vehicleNavigationState,
  vehicleSectionFromLocation,
} from '../src/modules/vehicles/vehiclesNavigation.js';

test('vehicle rail includes working fleet views without unfinished department filters', () => {
  assert.deepEqual(VEHICLE_WORKSPACE_SECTIONS.map(({ key }) => key), ['mine', 'all', 'stock', 'fleet']);
  assert.equal(VEHICLE_WORKSPACE_SECTIONS.some(({ key }) => key === 'electrical'), false);
});

test('vehicle view selection resolves every supported destination', () => {
  for (const { key } of VEHICLE_WORKSPACE_SECTIONS) {
    assert.equal(vehicleSectionFromLocation(vehicleNavigationState(key)), key);
  }
  assert.equal(vehicleSectionFromLocation(null), 'all');
  assert.deepEqual(vehicleNavigationState('unknown'), { vehicleView: 'all' });
});

test('vehicle top menu matches the rail instead of unfinished department filters', () => {
  const group = permittedNavigationGroups({
    canManageVehicles: true,
    canAccessAddon: () => false,
    department: 'Electrical',
  }).find(({ key }) => key === 'vehicles');
  assert.deepEqual(group.items.map(({ navigationState }) => navigationState.vehicleView), ['mine', 'all', 'stock', 'fleet']);
  assert.equal(group.items.some(({ navigationState }) => navigationState.vehicleDepartment), false);
});
