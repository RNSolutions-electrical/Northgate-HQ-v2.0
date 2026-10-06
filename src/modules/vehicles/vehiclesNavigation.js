export const VEHICLE_WORKSPACE_SECTIONS = [
  { key: 'mine', label: 'My Vehicle' },
  { key: 'all', label: 'All Vehicles' },
  { key: 'stock', label: 'Stock Vehicles' },
  { key: 'fleet', label: 'General Fleet' },
];

export function vehicleSectionFromLocation(navigationState) {
  return VEHICLE_WORKSPACE_SECTIONS.some(({ key }) => key === navigationState?.vehicleView)
    ? navigationState.vehicleView
    : 'all';
}

export function vehicleNavigationState(sectionKey) {
  return { vehicleView: vehicleSectionFromLocation({ vehicleView: sectionKey }) };
}
