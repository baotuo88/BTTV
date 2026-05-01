import useSWR from "swr";
import type { OperationsConfigData } from "@/types/operations-config";

const FALLBACK_OPERATIONS_CONFIG: OperationsConfigData = {
  announcement: {
    enabled: false,
    text: "",
    href: "",
  },
  quickEntries: [],
  navLinks: [],
  showGithubLink: true,
};

interface OperationsConfigApiResponse {
  code: number;
  message: string;
  data: OperationsConfigData | null;
}

const fetcher = async (url: string): Promise<OperationsConfigApiResponse> => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }
  return response.json() as Promise<OperationsConfigApiResponse>;
};

export function useOperationsConfig(): OperationsConfigData {
  const { data } = useSWR("/api/operations-config", fetcher, {
    revalidateOnFocus: false,
  });

  if (data?.code === 200 && data.data) {
    return data.data;
  }

  return FALLBACK_OPERATIONS_CONFIG;
}
