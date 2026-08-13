import { useEffect, useMemo, useState } from "react";

export function useClientPagination<T>(
  rows: T[],
  resetKey = "",
  initialPageSize = 10,
  scopeKey = "default",
) {
  const [states, setStates] = useState<
    Record<string, { currentPage: number; pageSize: number }>
  >({});
  const state = states[scopeKey] ?? {
    currentPage: 1,
    pageSize: initialPageSize,
  };
  const { currentPage, pageSize } = state;
  const update = (next: Partial<typeof state>) =>
    setStates((current) => ({
      ...current,
      [scopeKey]: { ...(current[scopeKey] ?? state), ...next },
    }));
  const setCurrentPage = (page: number | ((current: number) => number)) =>
    update({
      currentPage: typeof page === "function" ? page(currentPage) : page,
    });
  const totalCount = rows.length;
  const totalPages = Math.ceil(totalCount / pageSize);

  useEffect(() => update({ currentPage: 1 }), [resetKey, scopeKey]);
  useEffect(() => {
    setCurrentPage((page) => Math.min(page, Math.max(1, totalPages)));
  }, [totalPages]);

  const paginatedRows = useMemo(
    () => rows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [rows, currentPage, pageSize],
  );
  const setPageSize = (size: number) => {
    update({ pageSize: size, currentPage: 1 });
  };

  return {
    currentPage,
    pageSize,
    totalCount,
    totalPages,
    paginatedRows,
    setCurrentPage,
    setPageSize,
  };
}
