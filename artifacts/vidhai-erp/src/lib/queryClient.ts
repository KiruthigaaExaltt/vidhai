import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getErrorMessage } from "./errorMessage";

export function createAppQueryClient(notify: (message: string, options?: { id: string }) => void = toast.error) {
  return new QueryClient({
    defaultOptions: {
      mutations: {
        // Local error handlers override this default, avoiding duplicate toasts.
        onError: (error) => notify(getErrorMessage(error)),
      },
    },
    queryCache: new QueryCache({
      onError: (error, query) => {
        // An unauthenticated /me response is how the login screen is selected.
        const status = (error as { status?: number }).status;
        if (status === 401 && query.queryKey.some((key) => typeof key === "string" && /\/auth\/me$/.test(key))) return;
        if (query.getObserversCount() > 0)
          notify(getErrorMessage(error), { id: `query-error:${query.queryHash}` });
      },
    }),
  });
}