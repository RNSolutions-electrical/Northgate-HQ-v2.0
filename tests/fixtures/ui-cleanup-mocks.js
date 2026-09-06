const person = { clerk_user_id: 'fixture-user', display_name: 'Test Employee', email: 'employee@example.test', role: 'User', division: 'Electrical', current_vehicle: 'Truck 12', has_linked_employee_profile: true };
const getToken = async () => 'fixture-token';
export const useAuth = () => ({ getToken });
export const useUser = () => ({ user: { id: person.clerk_user_id } });
export const createSupabaseClient = () => ({
  from: () => ({ select: () => ({ order: async () => ({ data: [person], error: null }) }) }),
  rpc: async (name) => {
    window.readCalls = [...(window.readCalls || []), name];
    if (name === 'read_current_employee_profile') return { data: [person], error: null };
    if (name === 'read_current_employee_profile_notes' && window.failNotes) return { data: null, error: { message: 'Unable to load notes. Try again.' } };
    return { data: [], error: null };
  },
});
