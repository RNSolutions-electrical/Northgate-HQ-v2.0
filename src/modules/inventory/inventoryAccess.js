export function canManageInventoryDepartment(permissions, department) {
  return permissions?.permissionSource === 'server' && permissions.canManageInventory === true
    && Boolean(department) && (['Developer', 'Director', 'Manager'].includes(permissions.role)
      || (permissions.department || permissions.division) === department);
}
