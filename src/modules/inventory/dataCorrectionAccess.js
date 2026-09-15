export function canCorrectInventoryData(permissions) {
  return permissions?.permissionSource === 'server' && permissions.role === 'Developer'
    && permissions.canAccessDeveloper === true && permissions.canDeveloperDataCorrection === true;
}

export function correctionOverrideEnabled(overrides = []) {
  const active = overrides.filter(row => row.permission_flag === 'can_developer_data_correction' && row.is_active !== false);
  return active.length > 0 && active.every(row => row.granted === true);
}
