import assert from 'node:assert/strict';
import test from 'node:test';
import {
  employeeNavigationState,
  employeeSectionFromLocation,
  visibleEmployeeSections,
} from '../src/modules/employees/employeesNavigation.js';

test('employee rail gives ordinary users only their own profile', () => {
  const permissions = { permissionSource: 'server', canManageEmployees: false, department: 'Electrical' };
  assert.deepEqual(visibleEmployeeSections(permissions).map(({ key }) => key), ['mine']);
  assert.equal(employeeSectionFromLocation({ employeeView: 'directory' }, permissions), 'mine');
});

test('employee directory departments follow existing visibility scope', () => {
  const scoped = { permissionSource: 'server', canManageEmployees: true, department: 'Electrical', canViewAllDivisions: false };
  const all = { ...scoped, canViewAllDivisions: true };
  assert.deepEqual(visibleEmployeeSections(scoped)[1].children.map(({ key }) => key), ['electrical']);
  assert.deepEqual(visibleEmployeeSections(all)[1].children.map(({ key }) => key), ['electrical', 'construction', 'admin']);
});

test('employee rail selections clear stale department filters', () => {
  assert.deepEqual(employeeNavigationState('mine'), { employeeView: 'mine' });
  assert.deepEqual(employeeNavigationState('directory'), { employeeView: 'directory' });
  assert.deepEqual(employeeNavigationState('directory', 'construction'), {
    employeeView: 'directory', employeeDepartment: 'Construction',
  });
});
