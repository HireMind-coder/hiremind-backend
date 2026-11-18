import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";

export type AccessRole = "employee" | "attendance_manager" | "branch_admin";

export const ACCESS_ROLE_LABEL: Record<AccessRole, string> = {
  employee: "Employee",
  attendance_manager: "Attendance Manager",
  branch_admin: "Branch Admin",
};

/**
 * The logged-in employee's access level, read fresh from the server so that a role
 * change made by an admin shows up without logging out. Admin logins always get "employee"
 * here and should not use it.
 */
export function useAccessRole() {
  const { user } = useAuth();
  const isEmployee = user?.role === "employee";

  const query = useQuery({
    queryKey: ["employee-me", user?.employeeId],
    queryFn: () => customFetch<{ id: number; accessRole: AccessRole }>("/api/auth/employee-me"),
    enabled: isEmployee,
    staleTime: 15_000,
    refetchOnMount: "always",
    throwOnError: false,
  });

  const accessRole: AccessRole = query.data?.accessRole ?? "employee";

  return {
    accessRole,
    label: ACCESS_ROLE_LABEL[accessRole],
    canMarkAttendance: accessRole === "attendance_manager" || accessRole === "branch_admin",
    canManageSalary: accessRole === "branch_admin",
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}