import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export type AttendanceSettings = {
  geofenceEnabled: boolean;
  geofenceLat: number | null;
  geofenceLng: number | null;
  geofenceRadius: number;
  deviceVerification: boolean;
  blockFakeGps: boolean;
  autoLiveTrack: boolean;
};

export const SETTINGS_KEY = ["attendance-settings"];

export function errMsg(e: any, fallback = "Something went wrong. Please try again."): string {
  const status = e?.status ? `[${e.status}] ` : "";
  return status + (e?.data?.error ?? e?.message ?? fallback);
}

export function useAttendanceSettings() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => customFetch<AttendanceSettings>("/api/attendance-settings"),
    throwOnError: false,
  });

  const update = useMutation({
    mutationFn: (patch: Partial<AttendanceSettings>) =>
      customFetch<AttendanceSettings>("/api/attendance-settings", {
        method: "PUT",
        body: JSON.stringify(patch),
      }),
    onSuccess: (data) => queryClient.setQueryData(SETTINGS_KEY, data),
    throwOnError: false,
  });

  return {
    settings: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    update,
  };
}