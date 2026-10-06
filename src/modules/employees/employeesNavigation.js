const EMPLOYEE_DEPARTMENTS = ['Electrical', 'Construction', 'Admin'];

export function visibleEmployeeSections(permissions) {
  const directory = permissions?.permissionSource === 'server' && permissions.canManageEmployees === true;
  if (!directory) return [{ key: 'mine', label: 'My Profile' }];
  const departments = EMPLOYEE_DEPARTMENTS
    .filter((department) => permissions.canViewAllDivisions === true || permissions.department === department)
    .map((department) => ({ key: department.toLowerCase(), label: department }));
  return [
    { key: 'mine', label: 'My Profile' },
    { key: 'directory', label: 'Employee Directory', children: departments },
  ];
}

export function employeeSectionFromLocation(navigationState, permissions) {
  if (navigationState?.employeeView === 'mine') return 'mine';
  return permissions?.permissionSource === 'server' && permissions.canManageEmployees === true ? 'directory' : 'mine';
}

export function employeeNavigationState(sectionKey, childKey = '') {
  if (sectionKey === 'mine') return { employeeView: 'mine' };
  const department = EMPLOYEE_DEPARTMENTS.find((item) => item.toLowerCase() === childKey);
  return { employeeView: 'directory', ...(department ? { employeeDepartment: department } : {}) };
}
